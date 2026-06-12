import type { FileSystemStorage } from "./storage/types";
import { logger } from "./utils/logger";

/**
 * Pioneer statistics for celebration tracking
 */
export interface PioneerStats {
	totalRecoveries: number;
	lastRecoveryTimestamp: number | null;
	streakDays: number;
}

/**
 * Lock-in pricing status for pioneer users
 */
export interface PioneerLockIn {
	pricingLockedIn: boolean;
	lockedInAt?: number;
	plan?: string;
}

/**
 * Pioneer context for celebration service
 */
export interface PioneerContext {
	stats: PioneerStats;
	tier: "subtle" | "satisfying" | "heroic" | "legendary";
	lockIn: PioneerLockIn;
}

export interface WorkspaceContext {
	lastActiveFile: string | null;
	recentFiles: string[];
	activeBranch: string | null;
	lastSnapshot: string | null;
	protectionStatus: "protected" | "atRisk" | "unprotected" | "analyzing";
	recentActions: { action: string; timestamp: number }[];
	/** Pioneer context for celebration tracking */
	pioneer?: PioneerContext;
}

export class WorkspaceMemoryManager {
	private context: WorkspaceContext;

	constructor(_storage: FileSystemStorage) {
		this.context = {
			lastActiveFile: null,
			recentFiles: [],
			activeBranch: null,
			lastSnapshot: null,
			protectionStatus: "unprotected",
			recentActions: [],
			pioneer: {
				stats: {
					totalRecoveries: 0,
					lastRecoveryTimestamp: null,
					streakDays: 0,
				},
				tier: "subtle",
				lockIn: {
					pricingLockedIn: false,
				},
			},
		};

		// Initialize with some default values
		this.initialize();
	}

	/**
	 * Initialize workspace memory with default values
	 */
	private async initialize(): Promise<void> {
		// In a real implementation, we would load this from storage
		this.context.protectionStatus = "protected";
		this.context.recentActions = [];
	}

	/**
	 * Update the last active file
	 */
	updateLastActiveFile(filePath: string): void {
		this.context.lastActiveFile = filePath;

		// Add to recent files, keeping only the last 10
		this.context.recentFiles = [filePath, ...this.context.recentFiles.filter((f) => f !== filePath)].slice(0, 10);

		this.addAction("file_opened");
	}

	/**
	 * Update the active branch
	 */
	updateActiveBranch(branch: string): void {
		this.context.activeBranch = branch;
		this.addAction("branch_changed");
	}

	/**
	 * Update the last snapshot
	 */
	updateLastSnapshot(snapshotId: string): void {
		this.context.lastSnapshot = snapshotId;
		this.addAction("snapshot_created");
	}

	/**
	 * Update protection status
	 */
	updateProtectionStatus(status: "protected" | "atRisk" | "unprotected" | "analyzing"): void {
		this.context.protectionStatus = status;
		this.addAction("status_changed");
	}

	/**
	 * Add an action to the recent actions list
	 */
	private addAction(action: string): void {
		this.context.recentActions.unshift({
			action,
			timestamp: Date.now(),
		});

		// Keep only the last 50 actions
		if (this.context.recentActions.length > 50) {
			this.context.recentActions = this.context.recentActions.slice(0, 50);
		}
	}

	/**
	 * Get the current workspace context
	 */
	getContext(): WorkspaceContext {
		return { ...this.context };
	}

	/**
	 * Get the last snapshot ID
	 */
	getLastSnapshotId(): string | null {
		return this.context.lastSnapshot;
	}

	/**
	 * Save the current context to storage
	 */
	async saveContext(): Promise<void> {
		// In a real implementation, we would save this to persistent storage
		logger.info("Saving workspace context:", this.context);
	}

	/**
	 * Load context from storage
	 */
	async loadContext(): Promise<void> {
		// In a real implementation, we would load this from persistent storage
		logger.info("Loading workspace context");
	}

	/**
	 * Record a recovery event for celebration tracking
	 * @param event - Recovery event details
	 * @param tier - Celebration tier achieved
	 */
	async recordRecovery(_event: unknown, tier: "subtle" | "satisfying" | "heroic" | "legendary"): Promise<void> {
		if (!this.context.pioneer) {
			this.context.pioneer = {
				stats: {
					totalRecoveries: 0,
					lastRecoveryTimestamp: null,
					streakDays: 0,
				},
				tier: "subtle",
				lockIn: {
					pricingLockedIn: false,
				},
			};
		}

		// Update recovery stats
		this.context.pioneer.stats.totalRecoveries++;
		this.context.pioneer.stats.lastRecoveryTimestamp = Date.now();
		this.context.pioneer.tier = tier;

		// Calculate streak days
		const lastRecovery = this.context.pioneer.stats.lastRecoveryTimestamp;
		if (lastRecovery) {
			const daysSinceLast = Math.floor((Date.now() - lastRecovery) / (1000 * 60 * 60 * 24));
			if (daysSinceLast <= 1) {
				this.context.pioneer.stats.streakDays++;
			} else {
				this.context.pioneer.stats.streakDays = 1;
			}
		}

		this.addAction("recovery_recorded");
		logger.debug("Recovery recorded", { tier, totalRecoveries: this.context.pioneer.stats.totalRecoveries });
	}
}
