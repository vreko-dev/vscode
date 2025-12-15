/**
 * TreeItemBadgeProvider - Badge management for VS Code tree items
 *
 * Features:
 * - "NEW" badge for recently created snapshots
 * - Time-decay logic (badge fades after configurable duration)
 * - Badge priority/stacking (ERROR > WARNING > NEW > STALE)
 * - Auto-refresh callback when badges expire
 * - Performance optimization for 100+ items
 * - ThemeColor fallback for accessibility
 *
 * @example
 * ```ts
 * import { createTreeItemBadgeProvider } from "@vscode/utils/treeItemBadgeProvider";
 *
 * const badgeProvider = createTreeItemBadgeProvider({
 *   onRefreshNeeded: () => treeView.refresh(),
 * });
 *
 * const badge = badgeProvider.getBadge(snapshot.createdAt);
 * if (badge) {
 *   treeItem.iconPath = new vscode.ThemeIcon("history", badge.color);
 *   treeItem.description = badge.text;
 * }
 * ```
 *
 * @module
 */

import * as vscode from "vscode";

// ============================================
// TYPES
// ============================================

/**
 * Badge types in priority order (highest to lowest)
 */
export type BadgeType = "error" | "warning" | "new" | "stale";

/**
 * Badge state returned by the provider
 */
export interface BadgeState {
	type: BadgeType;
	text: string;
	color: vscode.ThemeColor;
}

/**
 * Configuration for badge durations
 */
export interface BadgeConfig {
	/** Duration in ms before NEW badge expires (default: 5 minutes) */
	newBadgeDurationMs: number;
	/** Duration in ms before STALE badge appears (default: 24 hours) */
	staleBadgeDurationMs: number;
}

/**
 * Context for priority-aware badge calculation
 */
export interface BadgeContext {
	hasWarning?: boolean;
	hasError?: boolean;
}

/**
 * Options for creating a TreeItemBadgeProvider
 */
export interface TreeItemBadgeProviderOptions {
	/** Callback fired when a badge expires and tree should refresh */
	onRefreshNeeded?: () => void;
	/** Initial configuration overrides */
	config?: Partial<BadgeConfig>;
}

/**
 * Tree item decoration returned for integration
 */
export interface TreeItemBadgeDecoration {
	badge: string;
	tooltip: string;
	color: vscode.ThemeColor;
}

// ============================================
// DEFAULTS & PRESETS
// ============================================

/**
 * Default configuration values
 */
export const DEFAULT_BADGE_CONFIG: BadgeConfig = {
	newBadgeDurationMs: 5 * 60_000, // 5 minutes
	staleBadgeDurationMs: 24 * 60 * 60_000, // 24 hours
};

/**
 * Badge presets with theme colors aligned to existing DECORATION_CONFIG
 */
export const BADGE_PRESETS = {
	new: {
		type: "new" as const,
		text: "NEW",
		themeColorId: "charts.green",
	},
	warning: {
		type: "warning" as const,
		text: "⚠️",
		themeColorId: "charts.yellow",
	},
	error: {
		type: "error" as const,
		text: "🚨",
		themeColorId: "charts.red",
	},
	stale: {
		type: "stale" as const,
		text: "OLD",
		themeColorId: "editorGutter.commentRangeForeground",
	},
} as const;

// ============================================
// PROVIDER IMPLEMENTATION
// ============================================

/**
 * Tracked snapshot for auto-refresh timing
 */
interface TrackedSnapshot {
	id: string;
	createdAt: number;
	expiresAt: number;
}

/**
 * TreeItemBadgeProvider - Manages badge calculations and expiration timers
 */
export class TreeItemBadgeProvider implements vscode.Disposable {
	private config: BadgeConfig;
	private readonly onRefreshNeeded?: () => void;
	private readonly trackedSnapshots = new Map<string, TrackedSnapshot>();
	private readonly expirationTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly badgeCache = new Map<number, BadgeState | undefined>();

	constructor(options?: TreeItemBadgeProviderOptions) {
		this.onRefreshNeeded = options?.onRefreshNeeded;
		this.config = {
			...DEFAULT_BADGE_CONFIG,
			...this.loadConfigFromSettings(),
			...options?.config,
		};
	}

	/**
	 * Load configuration from VS Code settings
	 */
	private loadConfigFromSettings(): Partial<BadgeConfig> {
		const vsConfig = vscode.workspace.getConfiguration("snapback");
		const newMinutes = vsConfig.get<number>("newBadgeDurationMinutes");
		const staleHours = vsConfig.get<number>("staleBadgeDurationHours");

		const result: Partial<BadgeConfig> = {};
		if (newMinutes !== undefined) {
			result.newBadgeDurationMs = newMinutes * 60_000;
		}
		if (staleHours !== undefined) {
			result.staleBadgeDurationMs = staleHours * 60 * 60_000;
		}
		return result;
	}

	/**
	 * Get the current configuration
	 */
	getConfig(): BadgeConfig {
		return { ...this.config };
	}

	/**
	 * Update configuration at runtime
	 */
	updateConfig(updates: Partial<BadgeConfig>): void {
		this.config = { ...this.config, ...updates };
		this.badgeCache.clear(); // Invalidate cache
	}

	/**
	 * Get badge for a timestamp (simple, no context)
	 */
	getBadge(createdAt: number): BadgeState | undefined {
		// Check cache first
		if (this.badgeCache.has(createdAt)) {
			return this.badgeCache.get(createdAt);
		}

		const badge = this.calculateBadge(createdAt);
		this.badgeCache.set(createdAt, badge);
		return badge;
	}

	/**
	 * Get badge with priority context (WARNING/ERROR override)
	 */
	getBadgeWithContext(createdAt: number, context: BadgeContext): BadgeState | undefined {
		// Priority: ERROR > WARNING > time-based badges
		if (context.hasError) {
			return this.createBadge("error");
		}
		if (context.hasWarning) {
			return this.createBadge("warning");
		}
		return this.getBadge(createdAt);
	}

	/**
	 * Get badges for multiple timestamps (batch processing)
	 */
	getBadgesBatch(timestamps: number[]): (BadgeState | undefined)[] {
		return timestamps.map((ts) => this.getBadge(ts));
	}

	/**
	 * Calculate badge based on age
	 */
	private calculateBadge(createdAt: number): BadgeState | undefined {
		const now = Date.now();
		const age = now - createdAt;

		// Handle future timestamps (treat as just created)
		if (age < 0) {
			return this.createBadge("new");
		}

		// NEW badge for recent items
		if (age < this.config.newBadgeDurationMs) {
			return this.createBadge("new");
		}

		// STALE badge for old items
		if (age > this.config.staleBadgeDurationMs) {
			return this.createBadge("stale");
		}

		// No badge for items in between
		return undefined;
	}

	/**
	 * Create a badge state from preset
	 */
	private createBadge(type: BadgeType): BadgeState {
		const preset = BADGE_PRESETS[type];
		return {
			type,
			text: preset.text,
			color: new vscode.ThemeColor(preset.themeColorId),
		};
	}

	/**
	 * Track a snapshot for auto-refresh on badge expiration
	 */
	trackSnapshot(id: string, createdAt: number): void {
		const now = Date.now();
		const age = now - createdAt;

		// Only track if within NEW badge window
		if (age >= this.config.newBadgeDurationMs) {
			return;
		}

		const expiresAt = createdAt + this.config.newBadgeDurationMs;
		const remainingMs = expiresAt - now;

		this.trackedSnapshots.set(id, { id, createdAt, expiresAt });

		// Clear existing timer if any
		const existingTimer = this.expirationTimers.get(id);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Schedule refresh when badge expires
		const timer = setTimeout(() => {
			this.badgeCache.delete(createdAt);
			this.trackedSnapshots.delete(id);
			this.expirationTimers.delete(id);
			this.onRefreshNeeded?.();
		}, remainingMs);

		this.expirationTimers.set(id, timer);
	}

	/**
	 * Stop tracking a snapshot
	 */
	untrackSnapshot(id: string): void {
		const timer = this.expirationTimers.get(id);
		if (timer) {
			clearTimeout(timer);
			this.expirationTimers.delete(id);
		}
		this.trackedSnapshots.delete(id);
	}

	/**
	 * Get count of tracked snapshots
	 */
	getTrackedCount(): number {
		return this.trackedSnapshots.size;
	}

	/**
	 * Get count of pending expiration timers
	 */
	getPendingTimerCount(): number {
		return this.expirationTimers.size;
	}

	/**
	 * Get tree item badge decoration for integration
	 */
	getTreeItemBadge(createdAt: number): TreeItemBadgeDecoration | undefined {
		const badge = this.getBadge(createdAt);
		if (!badge) {
			return undefined;
		}

		const createdDate = new Date(createdAt);
		return {
			badge: badge.text,
			tooltip: `Created: ${createdDate.toLocaleString()}`,
			color: badge.color,
		};
	}

	/**
	 * Dispose all timers and cleanup
	 */
	dispose(): void {
		for (const timer of this.expirationTimers.values()) {
			clearTimeout(timer);
		}
		this.expirationTimers.clear();
		this.trackedSnapshots.clear();
		this.badgeCache.clear();
	}
}

/**
 * Factory function to create a TreeItemBadgeProvider instance
 */
export function createTreeItemBadgeProvider(options?: TreeItemBadgeProviderOptions): TreeItemBadgeProvider {
	return new TreeItemBadgeProvider(options);
}
