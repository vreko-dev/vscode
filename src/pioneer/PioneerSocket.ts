/**
 * Pioneer WebSocket Client for VS Code Extension
 *
 * Connects to the Pioneer WebSocket hub for real-time updates.
 * Handles reconnection, heartbeat, and dispatches events to subscribers.
 */

import type { PioneerTier } from "@snapback/contracts";
import * as vscode from "vscode";
import WebSocket from "ws";
import { API_BASE_URL, WS_PING_INTERVAL, WS_RECONNECT_DELAY } from "../constants";
import { logger } from "../utils/logger";
import type { PioneerAuth } from "./PioneerAuth";

// --- Message Types ---

/** @deprecated Use PioneerTier from @snapback/contracts instead */
type Tier = PioneerTier;

interface PointsUpdatedPayload {
	userId: string;
	points: number;
	delta: number;
	actionType: string;
}

interface TierChangedPayload {
	userId: string;
	from: Tier;
	to: Tier;
	points: number;
	benefits: string[];
}

interface LeaderboardUpdatePayload {
	userId: string;
	newRank: number;
	previousRank?: number;
	change: "up" | "down" | "same";
}

interface ReferralConvertedPayload {
	userId: string;
	referralUsername: string;
	pointsEarned: number;
}

interface ServerMessage {
	type: string;
	payload: unknown;
}

// --- Event Emitters ---

export interface PioneerSocketEvents {
	connected: { userId: string; room: string };
	pointsUpdated: PointsUpdatedPayload;
	tierChanged: TierChangedPayload;
	leaderboardUpdate: LeaderboardUpdatePayload;
	referralConverted: ReferralConvertedPayload;
	disconnected: { reason: string };
	error: { message: string };
}

/**
 * WebSocket client for Pioneer real-time updates in the VS Code extension.
 *
 * Usage:
 * ```ts
 * const socket = new PioneerSocket(auth);
 * socket.onTierChanged((data) => showCelebration(data.to));
 * await socket.connect();
 * ```
 */
export class PioneerSocket implements vscode.Disposable {
	private ws: WebSocket | null = null;
	private pingInterval: ReturnType<typeof setInterval> | null = null;
	private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	private shouldReconnect = true;
	private isConnected = false;

	// Event emitters
	private onConnectedEmitter = new vscode.EventEmitter<PioneerSocketEvents["connected"]>();
	private onPointsUpdatedEmitter = new vscode.EventEmitter<PioneerSocketEvents["pointsUpdated"]>();
	private onTierChangedEmitter = new vscode.EventEmitter<PioneerSocketEvents["tierChanged"]>();
	private onLeaderboardUpdateEmitter = new vscode.EventEmitter<PioneerSocketEvents["leaderboardUpdate"]>();
	private onReferralConvertedEmitter = new vscode.EventEmitter<PioneerSocketEvents["referralConverted"]>();
	private onDisconnectedEmitter = new vscode.EventEmitter<PioneerSocketEvents["disconnected"]>();
	private onErrorEmitter = new vscode.EventEmitter<PioneerSocketEvents["error"]>();

	// Public events
	readonly onConnected = this.onConnectedEmitter.event;
	readonly onPointsUpdated = this.onPointsUpdatedEmitter.event;
	readonly onTierChanged = this.onTierChangedEmitter.event;
	readonly onLeaderboardUpdate = this.onLeaderboardUpdateEmitter.event;
	readonly onReferralConverted = this.onReferralConvertedEmitter.event;
	readonly onDisconnected = this.onDisconnectedEmitter.event;
	readonly onError = this.onErrorEmitter.event;

	constructor(private readonly auth: PioneerAuth) {}

	/**
	 * Connect to the WebSocket server
	 */
	async connect(): Promise<void> {
		if (this.ws?.readyState === WebSocket.OPEN) {
			logger.debug("PioneerSocket: Already connected");
			return;
		}

		const sessionToken = await this.auth.getSessionToken();

		if (!sessionToken) {
			logger.warn("PioneerSocket: No session token, skipping connection");
			return;
		}

		this.cleanup();
		this.shouldReconnect = true;

		const wsUrl = `${this.getWebSocketUrl()}?token=${encodeURIComponent(sessionToken)}`;

		try {
			this.ws = new WebSocket(wsUrl);

			this.ws.on("open", () => {
				logger.info("PioneerSocket: Connected");
				this.isConnected = true;
				this.startPing();
			});

			this.ws.on("message", (data: Buffer) => {
				this.handleMessage(data.toString());
			});

			this.ws.on("close", (code: number, reason: Buffer) => {
				logger.info("PioneerSocket: Disconnected", { code, reason: reason.toString() });
				this.isConnected = false;
				this.cleanup();

				this.onDisconnectedEmitter.fire({ reason: reason.toString() });

				// Auto-reconnect if enabled
				if (this.shouldReconnect && code !== 1000) {
					logger.info(`PioneerSocket: Reconnecting in ${WS_RECONNECT_DELAY}ms...`);
					this.reconnectTimeout = setTimeout(() => this.connect(), WS_RECONNECT_DELAY);
				}
			});

			this.ws.on("error", (error: Error) => {
				const err = error instanceof Error ? error : new Error(String(error));
				logger.error("PioneerSocket: Error", err);
				this.onErrorEmitter.fire({ message: error.message });
			});
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("PioneerSocket: Failed to connect", err);
			this.onErrorEmitter.fire({ message: error instanceof Error ? error.message : "Connection failed" });
		}
	}

	/**
	 * Disconnect from the WebSocket server
	 */
	disconnect(): void {
		this.shouldReconnect = false;
		this.cleanup();

		if (this.ws) {
			this.ws.close(1000, "Client disconnected");
			this.ws = null;
		}

		this.isConnected = false;
		logger.info("PioneerSocket: Disconnected");
	}

	/**
	 * Check if connected
	 */
	getIsConnected(): boolean {
		return this.isConnected;
	}

	/**
	 * Handle incoming messages
	 */
	private handleMessage(data: string): void {
		try {
			const message = JSON.parse(data) as ServerMessage;

			switch (message.type) {
				case "connected":
					this.onConnectedEmitter.fire(message.payload as PioneerSocketEvents["connected"]);
					break;

				case "pong":
					// Heartbeat response - connection is alive
					break;

				case "pioneer:points_updated":
					this.onPointsUpdatedEmitter.fire(message.payload as PointsUpdatedPayload);
					break;

				case "pioneer:tier_changed":
					this.onTierChangedEmitter.fire(message.payload as TierChangedPayload);
					break;

				case "pioneer:leaderboard_update":
					this.onLeaderboardUpdateEmitter.fire(message.payload as LeaderboardUpdatePayload);
					break;

				case "pioneer:referral_converted":
					this.onReferralConvertedEmitter.fire(message.payload as ReferralConvertedPayload);
					break;

				case "error": {
					const errorPayload = message.payload as { message: string };
					logger.error(`PioneerSocket: Server error: ${errorPayload.message}`);
					this.onErrorEmitter.fire(errorPayload);
					break;
				}

				default:
					logger.warn("PioneerSocket: Unknown message type", { type: message.type });
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error(`PioneerSocket: Failed to parse message: ${err.message} data=${data}`, err);
		}
	}

	/**
	 * Start ping interval
	 */
	private startPing(): void {
		this.pingInterval = setInterval(() => {
			if (this.ws?.readyState === WebSocket.OPEN) {
				this.ws.send(JSON.stringify({ type: "ping" }));
			}
		}, WS_PING_INTERVAL);
	}

	/**
	 * Cleanup intervals and timeouts
	 */
	private cleanup(): void {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
	}

	/**
	 * Get WebSocket URL
	 */
	private getWebSocketUrl(): string {
		const config = vscode.workspace.getConfiguration("snapback");
		const apiUrl = config.get<string>("apiBaseUrl") || API_BASE_URL;
		const wsUrl = apiUrl.replace(/^http/, "ws");
		return `${wsUrl}/ws/pioneer`;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.disconnect();

		this.onConnectedEmitter.dispose();
		this.onPointsUpdatedEmitter.dispose();
		this.onTierChangedEmitter.dispose();
		this.onLeaderboardUpdateEmitter.dispose();
		this.onReferralConvertedEmitter.dispose();
		this.onDisconnectedEmitter.dispose();
		this.onErrorEmitter.dispose();
	}
}
