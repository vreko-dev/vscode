import * as vscode from "vscode";
import { API_BASE_URL } from "../constants";
import { logger } from "../utils/logger";
import type { PioneerAuth } from "./PioneerAuth";

type ActionType = "github_star" | "discord_join" | "referral" | "feedback" | "bug_report" | "tutorial_complete";

export interface PointsTrackerResult {
	success: boolean;
	pointsEarned: number;
	newTotalPoints: number;
	tierChanged: boolean;
	newTier?: string;
}

/**
 * Tracks pioneer actions and syncs with the server.
 *
 * Responsibilities:
 * - Submit actions to API when triggered
 * - Emit events for UI updates
 * - Handle offline scenarios gracefully
 */
export class PointsTracker {
	private pioneerAuth?: PioneerAuth;
	private onPointsUpdateEmitter = new vscode.EventEmitter<PointsTrackerResult>();

	/** Event fired when points are updated */
	readonly onPointsUpdate = this.onPointsUpdateEmitter.event;

	/**
	 * Set the PioneerAuth instance for getting session tokens
	 */
	setAuth(auth: PioneerAuth): void {
		this.pioneerAuth = auth;
	}

	/**
	 * Submit an action and add points
	 * Calls the real API to record the action
	 */
	async addPoints(actionType: ActionType, metadata?: Record<string, unknown>): Promise<PointsTrackerResult> {
		logger.info(`[PointsTracker] Submitting action: ${actionType}`);

		if (!this.pioneerAuth) {
			logger.error("PointsTracker: PioneerAuth not set");
			return {
				success: false,
				pointsEarned: 0,
				newTotalPoints: 0,
				tierChanged: false,
			};
		}

		const sessionToken = await this.pioneerAuth.getSessionToken();

		if (!sessionToken) {
			logger.warn("PointsTracker: No session token, action not submitted");
			return {
				success: false,
				pointsEarned: 0,
				newTotalPoints: 0,
				tierChanged: false,
			};
		}

		try {
			const response = await fetch(`${this.getApiBaseUrl()}/api/pioneer/actions/submit`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					actionType,
					metadata,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				logger.error(`PointsTracker: API error ${response.status}: ${errorText}`);
				return {
					success: false,
					pointsEarned: 0,
					newTotalPoints: 0,
					tierChanged: false,
				};
			}

			const data = (await response.json()) as {
				success: boolean;
				action: { points: number };
				profile: { totalPoints: number; tier: string };
			};

			const result: PointsTrackerResult = {
				success: true,
				pointsEarned: data.action.points,
				newTotalPoints: data.profile.totalPoints,
				tierChanged: false, // Will be updated based on tier comparison
				newTier: data.profile.tier,
			};

			logger.info("PointsTracker: Action submitted", {
				actionType,
				pointsEarned: result.pointsEarned,
				newTotalPoints: result.newTotalPoints,
			});

			// Emit event for UI updates
			this.onPointsUpdateEmitter.fire(result);

			// Invalidate profile cache to get fresh data
			this.pioneerAuth.invalidateCache();

			return result;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("PointsTracker: Failed to submit action", err);
			return {
				success: false,
				pointsEarned: 0,
				newTotalPoints: 0,
				tierChanged: false,
			};
		}
	}

	/**
	 * Sync points with server (refresh profile)
	 * Used on activation to get latest state
	 */
	async syncWithServer(): Promise<void> {
		logger.info("[PointsTracker] Syncing points with server...");

		if (!this.pioneerAuth) {
			logger.warn("PointsTracker: PioneerAuth not set, sync skipped");
			return;
		}

		// Force profile refresh
		this.pioneerAuth.invalidateCache();
		await this.pioneerAuth.getProfile();

		logger.info("[PointsTracker] Sync complete");
	}

	/**
	 * Get API base URL from configuration
	 */
	private getApiBaseUrl(): string {
		const config = vscode.workspace.getConfiguration("snapback");
		return config.get<string>("apiBaseUrl") || API_BASE_URL;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.onPointsUpdateEmitter.dispose();
	}
}
