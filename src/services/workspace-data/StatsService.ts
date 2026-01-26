/**
 * StatsService - Dashboard Statistics Aggregation
 *
 * Single responsibility: Calculate and aggregate dashboard stats from snapshots and restores.
 *
 * @packageDocumentation
 */

import { logger } from "../../utils/logger";
import type { DashboardStats, RestoreEvent, SnapshotCoordinator } from "./types";
import { LINES_PER_FILE_ESTIMATE as LINES_ESTIMATE, TOKENS_PER_RESTORE as TOKENS_RESTORE } from "./types";

/**
 * Service for calculating dashboard statistics
 */
export class StatsService {
	constructor(
		private readonly coordinator: SnapshotCoordinator,
		private readonly getRestoreEvents: () => RestoreEvent[],
	) {}

	/**
	 * Get dashboard stats aggregated from snapshots and restores
	 */
	async getStats(): Promise<DashboardStats> {
		try {
			const snapshots = await this.coordinator.listSnapshots();
			const restoreEvents = this.getRestoreEvents();
			const now = Date.now();
			const todayStart = new Date().setHours(0, 0, 0, 0);
			const weekStart = now - 7 * 24 * 60 * 60 * 1000;

			const todaySnapshots = snapshots.filter((s) => s.timestamp >= todayStart);
			const todayRestores = restoreEvents.filter((r) => r.timestamp >= todayStart);
			const weekRestores = restoreEvents.filter((r) => r.timestamp >= weekStart);

			const tokensSaved = weekRestores.reduce((sum, r) => sum + r.tokensEstimate, 0);
			const linesProtected = snapshots.reduce((sum, s) => sum + (s.fileCount || 0) * LINES_ESTIMATE, 0);
			const efficiencyPercentile = Math.min(20 + snapshots.length + weekRestores.length * 5, 95);

			return {
				snapshotsToday: todaySnapshots.length,
				totalSnapshots: snapshots.length,
				restoresToday: todayRestores.length,
				linesProtected,
				tokensSaved: tokensSaved || weekRestores.length * TOKENS_RESTORE,
				restoresThisWeek: weekRestores.length,
				efficiencyPercentile,
			};
		} catch (error) {
			logger.error("StatsService: Failed to get stats", error as Error);
			return this.getEmptyStats();
		}
	}

	/**
	 * Calculate token cost savings
	 */
	getTokenCostSavings(tokensSaved: number): { gpt4: string; gpt35: string } {
		const GPT4_COST_PER_1K = 0.03;
		const GPT35_COST_PER_1K = 0.002;
		return {
			gpt4: ((tokensSaved / 1000) * GPT4_COST_PER_1K).toFixed(2),
			gpt35: ((tokensSaved / 1000) * GPT35_COST_PER_1K).toFixed(2),
		};
	}

	/**
	 * Get empty stats object (for error cases)
	 */
	private getEmptyStats(): DashboardStats {
		return {
			snapshotsToday: 0,
			totalSnapshots: 0,
			restoresToday: 0,
			linesProtected: 0,
			tokensSaved: 0,
			restoresThisWeek: 0,
			efficiencyPercentile: 0,
		};
	}
}
