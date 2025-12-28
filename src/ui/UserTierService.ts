/**
 * UserTierService - Progressive Disclosure Based on User Experience
 *
 * Reference: EXTENSION_UX_SPEC.md#progressive-disclosure-thresholds
 *
 * TIERS:
 * - Explorer: < 5 snapshots - Basic functionality only
 * - Intermediate: 5-50 snapshots - AI detection, session stats
 * - Power: 50+ snapshots OR vitals enabled - Full feature set
 *
 * DESIGN:
 * - Tier is persisted across sessions
 * - Features unlock progressively to reduce cognitive load
 * - Never regresses (once power user, always power user)
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

/**
 * User experience tier
 */
export type UserTier = "explorer" | "intermediate" | "power";

/**
 * Feature flags based on tier
 */
export interface TierFeatures {
	/** Show basic status bar */
	showStatusBar: boolean;
	/** Show checkpoint saved notifications */
	showCheckpointNotifications: boolean;
	/** Show restore workflow */
	showRestoreWorkflow: boolean;

	/** Show AI detection indicators */
	showAIDetection: boolean;
	/** Show session stats in status bar */
	showSessionStats: boolean;
	/** Show dashboard activity tab */
	showActivityTab: boolean;

	/** Show vitals in status bar */
	showVitals: boolean;
	/** Show heat decorations */
	showHeatDecorations: boolean;
	/** Show advanced analytics */
	showAdvancedAnalytics: boolean;
}

/**
 * Tier thresholds
 */
export interface TierThresholds {
	intermediate: number;
	power: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_THRESHOLDS: TierThresholds = {
	intermediate: 5,
	power: 50,
};

/**
 * Feature sets per tier
 */
const TIER_FEATURES: Record<UserTier, TierFeatures> = {
	explorer: {
		// Basic features only
		showStatusBar: true,
		showCheckpointNotifications: true,
		showRestoreWorkflow: true,

		// Hidden for explorers
		showAIDetection: false,
		showSessionStats: false,
		showActivityTab: false,

		// Disabled for explorers
		showVitals: false,
		showHeatDecorations: false,
		showAdvancedAnalytics: false,
	},
	intermediate: {
		// All basic features
		showStatusBar: true,
		showCheckpointNotifications: true,
		showRestoreWorkflow: true,

		// Unlocked for intermediate
		showAIDetection: true,
		showSessionStats: true,
		showActivityTab: true,

		// Still disabled
		showVitals: false,
		showHeatDecorations: false,
		showAdvancedAnalytics: false,
	},
	power: {
		// Everything enabled
		showStatusBar: true,
		showCheckpointNotifications: true,
		showRestoreWorkflow: true,
		showAIDetection: true,
		showSessionStats: true,
		showActivityTab: true,
		showVitals: true,
		showHeatDecorations: true,
		showAdvancedAnalytics: true,
	},
};

/**
 * Storage key for persisted tier
 */
const TIER_STORAGE_KEY = "snapback.userTier";
const SNAPSHOT_COUNT_KEY = "snapback.lifetimeSnapshotCount";

// =============================================================================
// USER TIER SERVICE
// =============================================================================

export class UserTierService implements vscode.Disposable {
	private readonly _onTierChange = new vscode.EventEmitter<UserTier>();
	readonly onTierChange = this._onTierChange.event;

	private currentTier: UserTier = "explorer";
	private lifetimeSnapshotCount = 0;
	private thresholds: TierThresholds;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private readonly globalState: vscode.Memento,
		thresholds?: Partial<TierThresholds>,
	) {
		this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };

		// Load persisted state
		this.loadState();

		// Listen for configuration changes
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration("snapback.vitalsEnabled")) {
					this.checkForVitalsOverride();
				}
			}),
		);
	}

	/**
	 * Get current user tier
	 */
	getTier(): UserTier {
		return this.currentTier;
	}

	/**
	 * Get features for current tier
	 */
	getFeatures(): TierFeatures {
		return { ...TIER_FEATURES[this.currentTier] };
	}

	/**
	 * Check if a specific feature is enabled
	 */
	isFeatureEnabled(feature: keyof TierFeatures): boolean {
		return TIER_FEATURES[this.currentTier][feature];
	}

	/**
	 * Record a new snapshot and potentially upgrade tier
	 */
	recordSnapshot(): void {
		this.lifetimeSnapshotCount++;
		this.saveState();
		this.evaluateTier();
	}

	/**
	 * Set snapshot count (for bulk updates from persistence)
	 */
	setSnapshotCount(count: number): void {
		this.lifetimeSnapshotCount = Math.max(this.lifetimeSnapshotCount, count);
		this.saveState();
		this.evaluateTier();
	}

	/**
	 * Force upgrade to a tier (for testing or admin override)
	 */
	forceUpgrade(tier: UserTier): void {
		if (this.compareTiers(tier, this.currentTier) > 0) {
			this.currentTier = tier;
			this.saveState();
			this._onTierChange.fire(this.currentTier);
			logger.info("User tier force upgraded", { tier });
		}
	}

	/**
	 * Get progress towards next tier
	 */
	getProgress(): { current: number; nextThreshold: number; percentage: number; nextTier: UserTier | null } {
		const current = this.lifetimeSnapshotCount;

		if (this.currentTier === "power") {
			return { current, nextThreshold: 0, percentage: 100, nextTier: null };
		}

		if (this.currentTier === "explorer") {
			const next = this.thresholds.intermediate;
			return {
				current,
				nextThreshold: next,
				percentage: Math.min(100, (current / next) * 100),
				nextTier: "intermediate",
			};
		}

		// intermediate -> power
		const next = this.thresholds.power;
		return {
			current,
			nextThreshold: next,
			percentage: Math.min(100, (current / next) * 100),
			nextTier: "power",
		};
	}

	/**
	 * Get lifetime snapshot count
	 */
	getSnapshotCount(): number {
		return this.lifetimeSnapshotCount;
	}

	// ===========================================================================
	// INTERNAL METHODS
	// ===========================================================================

	/**
	 * Load persisted state
	 */
	private loadState(): void {
		const storedTier = this.globalState.get<UserTier>(TIER_STORAGE_KEY);
		const storedCount = this.globalState.get<number>(SNAPSHOT_COUNT_KEY);

		if (storedTier) {
			this.currentTier = storedTier;
		}
		if (storedCount !== undefined) {
			this.lifetimeSnapshotCount = storedCount;
		}

		// Check for vitals override
		this.checkForVitalsOverride();

		logger.debug("UserTierService loaded", {
			tier: this.currentTier,
			snapshotCount: this.lifetimeSnapshotCount,
		});
	}

	/**
	 * Save state to global storage
	 */
	private saveState(): void {
		void this.globalState.update(TIER_STORAGE_KEY, this.currentTier);
		void this.globalState.update(SNAPSHOT_COUNT_KEY, this.lifetimeSnapshotCount);
	}

	/**
	 * Evaluate if user should be upgraded
	 */
	private evaluateTier(): void {
		let newTier = this.currentTier;

		if (this.lifetimeSnapshotCount >= this.thresholds.power) {
			newTier = "power";
		} else if (this.lifetimeSnapshotCount >= this.thresholds.intermediate) {
			newTier = "intermediate";
		}

		// Never downgrade
		if (this.compareTiers(newTier, this.currentTier) > 0) {
			this.currentTier = newTier;
			this.saveState();
			this._onTierChange.fire(this.currentTier);
			logger.info("User tier upgraded", { tier: this.currentTier, count: this.lifetimeSnapshotCount });

			// Show celebration notification
			this.showUpgradeNotification(newTier);
		}
	}

	/**
	 * Check if vitals setting overrides tier
	 */
	private checkForVitalsOverride(): void {
		const config = vscode.workspace.getConfiguration("snapback");
		const vitalsEnabled = config.get<boolean>("vitalsEnabled", false);

		// If vitals enabled, auto-upgrade to power
		if (vitalsEnabled && this.currentTier !== "power") {
			this.currentTier = "power";
			this.saveState();
			this._onTierChange.fire(this.currentTier);
			logger.info("User tier upgraded via vitals setting");
		}
	}

	/**
	 * Compare two tiers (-1, 0, 1)
	 */
	private compareTiers(a: UserTier, b: UserTier): number {
		const order: Record<UserTier, number> = { explorer: 0, intermediate: 1, power: 2 };
		return order[a] - order[b];
	}

	/**
	 * Show notification when user upgrades tier
	 */
	private showUpgradeNotification(tier: UserTier): void {
		const messages: Record<UserTier, string> = {
			explorer: "", // Never shown
			intermediate: "🎉 You've unlocked AI detection and session stats! Keep going to unlock more features.",
			power: "🚀 Power user unlocked! You now have access to all SnapBack features including vitals and heat decorations.",
		};

		const message = messages[tier];
		if (message) {
			void vscode.window.showInformationMessage(message, "View Dashboard").then((selection) => {
				if (selection === "View Dashboard") {
					void vscode.commands.executeCommand("snapback.openDashboard");
				}
			});
		}
	}

	/**
	 * Cleanup
	 */
	dispose(): void {
		this._onTierChange.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create the user tier service
 */
export function createUserTierService(
	globalState: vscode.Memento,
	thresholds?: Partial<TierThresholds>,
): UserTierService {
	return new UserTierService(globalState, thresholds);
}
