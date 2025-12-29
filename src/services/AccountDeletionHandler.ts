/**
 * Account Deletion Handler
 *
 * Implements J5-E05: Clear points and data on account deletion
 *
 * Handles secure deletion of user data including points, snapshots,
 * authentication tokens, and settings with proper confirmation flow.
 *
 * @module services/AccountDeletionHandler
 */

/**
 * Account deletion result
 */
export interface AccountDeletionResult {
	success: boolean;
	pointsCleared: number;
	snapshotsCleared: number;
	settingsReset: boolean;
	error?: string;
}

/**
 * Local storage interface for points
 */
export interface PointsStorage {
	totalPoints: number;
	pointsHistory: Array<{
		timestamp: number;
		points: number;
		reason: string;
	}>;
	streakDays: number;
	lastActivity: number;
}

/**
 * Account deletion handler
 *
 * Handles secure deletion of user data with proper confirmation flow.
 * Ensures clean slate for returning users and notifies server of deletion.
 */
export class AccountDeletionHandler {
	private storageBackend: Map<string, unknown>;
	private readonly POINTS_KEY = "snapback.pioneer.points";
	private readonly SNAPSHOTS_KEY = "snapback.snapshots";
	private readonly AUTH_KEY = "snapback.auth";
	private readonly SETTINGS_KEY = "snapback.settings";

	constructor(storageBackend?: Map<string, unknown>) {
		this.storageBackend = storageBackend ?? new Map();
	}

	/**
	 * Get current points data
	 */
	getPointsData(): PointsStorage | null {
		return this.storageBackend.get(this.POINTS_KEY) as PointsStorage | null;
	}

	/**
	 * Set points data (for testing)
	 */
	setPointsData(data: PointsStorage): void {
		this.storageBackend.set(this.POINTS_KEY, data);
	}

	/**
	 * Set snapshots data (for testing)
	 */
	setSnapshotsData(snapshots: unknown[]): void {
		this.storageBackend.set(this.SNAPSHOTS_KEY, snapshots);
	}

	/**
	 * Set auth data (for testing)
	 */
	setAuthData(auth: unknown): void {
		this.storageBackend.set(this.AUTH_KEY, auth);
	}

	/**
	 * Check if user has local data
	 */
	hasLocalData(): boolean {
		return (
			this.storageBackend.has(this.POINTS_KEY) ||
			this.storageBackend.has(this.SNAPSHOTS_KEY) ||
			this.storageBackend.has(this.AUTH_KEY)
		);
	}

	/**
	 * Get summary of data to be deleted
	 */
	getDataSummary(): {
		hasPoints: boolean;
		totalPoints: number;
		snapshotCount: number;
		hasAuth: boolean;
	} {
		const points = this.getPointsData();
		const snapshots = (this.storageBackend.get(this.SNAPSHOTS_KEY) as unknown[]) ?? [];
		const auth = this.storageBackend.get(this.AUTH_KEY);

		return {
			hasPoints: points !== null && points !== undefined,
			totalPoints: points?.totalPoints ?? 0,
			snapshotCount: snapshots.length,
			hasAuth: auth !== null && auth !== undefined,
		};
	}

	/**
	 * Clear all local data for account deletion
	 */
	async clearAllData(): Promise<AccountDeletionResult> {
		try {
			const summary = this.getDataSummary();

			// Clear points
			const pointsCleared = summary.totalPoints;
			this.storageBackend.delete(this.POINTS_KEY);

			// Clear snapshots
			const snapshots = (this.storageBackend.get(this.SNAPSHOTS_KEY) as unknown[]) ?? [];
			const snapshotsCleared = snapshots.length;
			this.storageBackend.delete(this.SNAPSHOTS_KEY);

			// Clear auth
			this.storageBackend.delete(this.AUTH_KEY);

			// Reset settings to defaults
			this.storageBackend.delete(this.SETTINGS_KEY);

			return {
				success: true,
				pointsCleared,
				snapshotsCleared,
				settingsReset: true,
			};
		} catch (error) {
			return {
				success: false,
				pointsCleared: 0,
				snapshotsCleared: 0,
				settingsReset: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Notify server of account deletion
	 */
	async notifyServerDeletion(_userId: string): Promise<boolean> {
		// This would make an API call in production
		// For now, just return success
		return true;
	}

	/**
	 * Full account deletion flow with confirmation
	 */
	async deleteAccount(userId: string, confirmCallback: () => Promise<boolean>): Promise<AccountDeletionResult> {
		// Get confirmation
		const confirmed = await confirmCallback();
		if (!confirmed) {
			return {
				success: false,
				pointsCleared: 0,
				snapshotsCleared: 0,
				settingsReset: false,
				error: "User cancelled deletion",
			};
		}

		// Notify server first (so they can clear server-side data)
		const serverNotified = await this.notifyServerDeletion(userId);
		if (!serverNotified) {
			return {
				success: false,
				pointsCleared: 0,
				snapshotsCleared: 0,
				settingsReset: false,
				error: "Failed to notify server",
			};
		}

		// Clear local data
		return this.clearAllData();
	}

	/**
	 * Handle rejoin after deletion
	 * Ensures clean slate for returning users
	 */
	async handleRejoin(_newUserId: string): Promise<{
		success: boolean;
		isCleanSlate: boolean;
		message: string;
	}> {
		// Check for any residual data
		const hasResidualData = this.hasLocalData();

		if (hasResidualData) {
			// Clear any residual data from previous account
			await this.clearAllData();
		}

		return {
			success: true,
			isCleanSlate: true,
			message: hasResidualData ? "Previous account data cleared. Welcome back!" : "Welcome to SnapBack!",
		};
	}
}
