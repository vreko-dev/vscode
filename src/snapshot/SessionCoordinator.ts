/**
 * VSCode SessionCoordinator - Wrapper around SDK SessionCoordinator
 *
 * This module provides VSCode-specific integration with the platform-agnostic
 * SessionCoordinator from @snapback/sdk. It handles VSCode-specific concerns:
 * - Event emission via vscode.EventEmitter adapter
 * - Performance monitoring integration
 * - VSCode logging integration
 * - SQLite storage integration
 *
 * @module SessionCoordinator
 */

import {
	type ILogger,
	type ISessionStorage,
	NodeTimerService,
	SessionCoordinator as SDKSessionCoordinator,
	type SessionFinalizeReason,
	type SessionId,
	type SessionManifest,
} from "@snapback/sdk";
import type * as vscode from "vscode";
import { VscodeEventEmitterAdapter } from "../adapters/VscodeEventEmitterAdapter.js";
import { getSessionPerfMonitor } from "../performance/sessionPerfMonitor.js";
import type { StorageManager } from "../storage/StorageManager.js";
import { logger } from "../utils/logger.js";

/**
 * VSCode-specific logger adapter
 */
class VscodeLoggerAdapter implements ILogger {
	debug(message: string, data?: unknown): void {
		logger.debug(message, data);
	}

	info(message: string, data?: unknown): void {
		logger.info(message, data);
	}

	error(message: string, error?: Error, data?: unknown): void {
		logger.error(message, error, data);
	}
}

/**
 * VSCode-specific storage adapter
 */
class VscodeStorageAdapter implements ISessionStorage {
	constructor(private storage: StorageManager) {}

	async storeSessionManifest(manifest: SessionManifest): Promise<void> {
		console.log("[VscodeStorageAdapter] storeSessionManifest() called", {
			manifestId: manifest.id,
			filesCount: (manifest as any).files?.length,
		});
		// Map to new StorageManager API
		const reason = (manifest as any).reason || "manual";
		const files = (manifest as any).files || [];

		// Ensure SessionStore has an active session before finalizing
		// Note: SDK SessionCoordinator uses its own session IDs (session-XXX)
		// while SessionStore uses different IDs (sess-XXX). This creates a session
		// in SessionStore when SDK is ready to finalize its session.
		const activeSessionId = this.storage.getActiveSessionId();
		if (!activeSessionId) {
			console.log(
				"[VscodeStorageAdapter] No active SessionStore session, starting one",
			);
			await this.storage.createSession(manifest.startedAt);
		}

		console.log("[VscodeStorageAdapter] Calling storage.finalizeSession()", {
			manifestId: manifest.id,
			reason,
			filesCount: files.length,
		});
		await this.storage.finalizeSession(
			manifest.id,
			manifest.endedAt,
			reason,
			files,
		);
		console.log("[VscodeStorageAdapter] storage.finalizeSession() completed");
	}

	async listSessionManifests(): Promise<SessionManifest[]> {
		// Map to new StorageManager API
		const result = await this.storage.listSessions();
		return (Array.isArray(result)
			? result
			: []) as unknown as SessionManifest[];
	}

	async getSessionManifest(sessionId: string): Promise<SessionManifest | null> {
		// Map to new StorageManager API
		return (await this.storage.getSession(
			sessionId,
		)) as unknown as SessionManifest | null;
	}
}

/**
 * SessionCoordinator - VSCode-specific wrapper around SDK SessionCoordinator
 *
 * This class wraps the platform-agnostic SessionCoordinator from the SDK
 * and provides VSCode-specific integrations while maintaining the same API.
 */
export class SessionCoordinator {
	private sdkCoordinator: SDKSessionCoordinator;
	private eventEmitter: VscodeEventEmitterAdapter<SessionManifest>;

	/** Event for when sessions are finalized */
	public readonly onSessionFinalized: vscode.Event<SessionManifest>;

	/**
	 * Creates a new SessionCoordinator
	 *
	 * @param storage - Storage adapter for persisting session manifests
	 */
	constructor(storage: StorageManager) {
		// Create VSCode-specific adapters
		this.eventEmitter = new VscodeEventEmitterAdapter<SessionManifest>();
		const vscodeLogger = new VscodeLoggerAdapter();
		const vscodeStorage = new VscodeStorageAdapter(storage);
		const timerService = new NodeTimerService();

		// Create SDK coordinator with VSCode adapters
		this.sdkCoordinator = new SDKSessionCoordinator({
			storage: vscodeStorage,
			timers: timerService,
			logger: vscodeLogger,
			eventEmitter: this.eventEmitter,
		});

		// Expose VSCode event
		this.onSessionFinalized = this.eventEmitter.event;
	}

	/**
	 * Add or update a file candidate in the current session
	 *
	 * @param uri - URI of the file
	 * @param snapshotId - ID of the snapshot for this file
	 * @param stats - Optional change statistics
	 */
	addCandidate(
		uri: string,
		snapshotId: string,
		stats?: { added: number; deleted: number },
	): void {
		console.log("[SessionCoordinator] addCandidate() called", {
			uri,
			snapshotId,
			stats,
		});
		const perfMonitor = getSessionPerfMonitor();
		const operationId = perfMonitor?.startOperation(
			"sessionCoordinator.addCandidate",
		);

		try {
			this.sdkCoordinator.addCandidate(uri, snapshotId, stats);
			console.log("[SessionCoordinator] addCandidate() completed successfully");
		} finally {
			if (operationId && perfMonitor) {
				perfMonitor.endOperation(operationId);
			}
		}
	}

	/**
	 * Finalize the current session with a specific reason
	 *
	 * @param reason - Reason for finalizing the session
	 * @returns Session ID if finalized, null if skipped
	 */
	async finalizeSession(
		reason: SessionFinalizeReason,
	): Promise<SessionId | null> {
		console.log("[SessionCoordinator] finalizeSession() called", { reason });
		const perfMonitor = getSessionPerfMonitor();
		const operationId = perfMonitor?.startOperation(
			"sessionCoordinator.finalizeSession",
		);

		try {
			const result = await this.sdkCoordinator.finalizeSession(reason);
			console.log("[SessionCoordinator] finalizeSession() completed", {
				result,
			});
			return result;
		} finally {
			if (operationId && perfMonitor) {
				perfMonitor.endOperation(operationId);
			}
		}
	}

	/**
	 * Handle window blur event - finalize session due to window focus change
	 */
	handleWindowBlur(): void {
		console.log("[SessionCoordinator] handleWindowBlur() called");
		this.sdkCoordinator.handleWindowBlur();
	}

	/**
	 * Handle git commit event - finalize session due to git commit
	 */
	handleGitCommit(): void {
		this.sdkCoordinator.handleGitCommit();
	}

	/**
	 * Handle task completion event - finalize session due to task completion
	 */
	handleTaskCompletion(): void {
		this.sdkCoordinator.handleTaskCompletion();
	}

	/**
	 * Handle manual session finalization
	 */
	handleManualFinalization(): void {
		this.sdkCoordinator.handleManualFinalization();
	}

	/**
	 * Dispose of the session coordinator and clean up resources
	 */
	dispose(): void {
		this.sdkCoordinator.dispose();
	}
}
