/**
 * ActivityBarBadgeManager - Activity Bar Badge for Attention-Worthy Events
 *
 * Per playbook Section 11: "Use TreeView.badge to show a count on the Vreko
 * activity bar icon. The badge should appear only when there's something worth
 * attention  -  not as a permanent fixture."
 *
 * When to badge:
 * - AI modifications detected but not yet reviewed
 * - Session ending soon (idle timeout approaching)
 * - New learnings captured
 *
 * When NOT to badge:
 * - Normal operation (risk level normal, nothing unusual)
 * - Session running smoothly (no alerts)
 *
 * @module ui/ActivityBarBadgeManager
 * @see docs/brand/extension-branding-playbook.md Section 11
 */

import type * as vscode from "vscode";
import type { SignalState } from "../signals/SignalState";
import { logger } from "../utils/logger";

/**
 * Badge state
 */
interface BadgeState {
	count: number;
	tooltip: string;
}

/**
 * ActivityBarBadgeManager
 *
 * Manages the badge count on the Vreko activity bar icon.
 * Follows the principle: "The badge is attention currency. Spend it only when
 * the return justifies it. A permanent badge trains users to ignore it."
 */
export class ActivityBarBadgeManager implements vscode.Disposable {
	private treeView: vscode.TreeView<unknown> | undefined;
	private signalState: SignalState;
	private disposables: vscode.Disposable[] = [];

	// Badge state tracking
	private lastBadgeState: BadgeState | undefined;

	constructor(signalState: SignalState) {
		this.signalState = signalState;

		// Subscribe to state changes
		this.disposables.push(
			signalState.onChanged(() => {
				this.updateBadge();
			}),
		);

		// Initial update
		this.updateBadge();
	}

	/**
	 * Set the tree view to manage badges for
	 */
	setTreeView(treeView: vscode.TreeView<unknown>): void {
		this.treeView = treeView;
		this.updateBadge();
	}

	/**
	 * Update the badge based on current state
	 */
	private updateBadge(): void {
		if (!this.treeView) {
			return;
		}

		const state = this.signalState;
		const badgeState = this.computeBadgeState(state);

		// Only update if state changed
		if (this.lastBadgeState?.count !== badgeState?.count || this.lastBadgeState?.tooltip !== badgeState?.tooltip) {
			this.lastBadgeState = badgeState;

			if (badgeState && badgeState.count > 0) {
				this.treeView.badge = {
					value: badgeState.count,
					tooltip: badgeState.tooltip,
				};
				logger.debug("ActivityBarBadgeManager: Badge updated", {
					count: badgeState.count,
					tooltip: badgeState.tooltip,
				});
			} else {
				this.treeView.badge = undefined;
				logger.debug("ActivityBarBadgeManager: Badge cleared");
			}
		}
	}

	/**
	 * Compute the badge state based on SignalState
	 */
	private computeBadgeState(state: SignalState): BadgeState | undefined {
		// Don't badge for normal operation
		if (state.currentRiskLevel === "normal" && state.aiToolsDetected.length === 0) {
			return undefined;
		}

		// Count attention-worthy items
		let count = 0;
		const reasons: string[] = [];

		// AI modifications detected
		if (state.aiToolsDetected.length > 0) {
			count += state.filesModifiedSession.size;
			reasons.push(`${state.aiToolsDetected.length} AI tool(s) detected`);
		}

		// Elevated risk
		if (state.currentRiskLevel !== "normal") {
			count += 1;
			reasons.push("Elevated risk level");
		}

		// New learnings (if any were added this session)
		if (state.learningsAddedSession > 0) {
			count += state.learningsAddedSession;
			reasons.push(`${state.learningsAddedSession} new learning(s)`);
		}

		// Fragile files touched
		if (state.fragileFilesTouchedSession > 0) {
			count += state.fragileFilesTouchedSession;
			reasons.push(`${state.fragileFilesTouchedSession} fragile file(s) touched`);
		}

		if (count === 0) {
			return undefined;
		}

		return {
			count,
			tooltip: reasons.join("\n"),
		};
	}

	/**
	 * Clear the badge
	 */
	clearBadge(): void {
		if (this.treeView) {
			this.treeView.badge = undefined;
			this.lastBadgeState = undefined;
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.clearBadge();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}
}

/**
 * Factory function to create the badge manager
 */
export function createActivityBarBadgeManager(signalState: SignalState): ActivityBarBadgeManager {
	return new ActivityBarBadgeManager(signalState);
}
