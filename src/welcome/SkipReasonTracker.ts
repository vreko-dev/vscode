import * as vscode from "vscode";
import type { DiagnosticEventTracker } from "../telemetry/diagnostic-event-tracker.js";

/**
 * Tracks user skip behavior in welcome panel with semantic distinction:
 * - user_clicked_skip: Quick dismiss without reading (low engagement)
 * - informed_skip: Read tradeoffs, still chose local-only (high intent)
 * - panel_closed: Closed via X button or ESC (no interaction)
 * - timeout: Auto-closed after 60s idle (not even viewed)
 *
 * This helps product understand:
 * - What % of users actively choose local-only vs just skip?
 * - Do feature tradeoffs matter to decision-making?
 * - Should we improve onboarding messaging?
 */
export class SkipReasonTracker {
	private sessionStartTime: number = 0;
	private panelViewId: string = "";
	private detailsExpanded: boolean = false;
	private timeoutHandle: NodeJS.Timeout | null = null;

	private readonly STORAGE_KEY_DETAILS_EXPANDED =
		"snapback.welcomePanel.detailsExpanded";
	private readonly PANEL_TIMEOUT_MS = 60_000; // 60 seconds

	constructor(
		private readonly globalState: vscode.Memento,
		private readonly diagnosticTracker: DiagnosticEventTracker,
	) {}

	/**
	 * Called when welcome panel becomes visible
	 * Initializes session tracking and sets auto-dismiss timeout
	 */
	async onPanelShown(): Promise<void> {
		this.sessionStartTime = Date.now();
		this.panelViewId = this.generateViewId();
		this.detailsExpanded = false;

		// Fire diagnostic event
		await this.diagnosticTracker.track({
			event: "welcome.panel_shown",
			properties: {
				panel_view_id: this.panelViewId,
				timestamp_utc: this.sessionStartTime,
			},
		});

		// Set auto-dismiss timeout (60 seconds of inactivity)
		this.startTimeoutDismiss();
	}

	/**
	 * Called when user clicks to expand <details> section
	 * Shows feature comparison between local and cloud capabilities
	 */
	async onDetailsExpanded(): Promise<void> {
		// Cancel timeout if user starts interacting
		this.cancelTimeoutDismiss();

		this.detailsExpanded = true;

		// Fire diagnostic event for funnel analysis
		await this.diagnosticTracker.track({
			event: "welcome.feature_viewed",
			properties: {
				section: "feature_tradeoffs",
				action: "details_expanded",
				panel_view_id: this.panelViewId,
				timestamp_utc: Date.now(),
			},
		});

		// Persist for coordinating with other nudges
		await this.globalState.update(this.STORAGE_KEY_DETAILS_EXPANDED, true);
	}

	/**
	 * Called when user clicks "Continue without account" button
	 * (in the expanded details section)
	 */
	async onInformedSkip(): Promise<void> {
		this.cancelTimeoutDismiss();
		await this.trackSkip("informed_skip");
	}

	/**
	 * Called when user clicks "Skip for now" button
	 * (quick skip without reading details)
	 */
	async onQuickSkip(): Promise<void> {
		this.cancelTimeoutDismiss();
		await this.trackSkip("user_clicked_skip");
	}

	/**
	 * Called when panel is closed via X button or ESC
	 */
	async onPanelClosed(): Promise<void> {
		this.cancelTimeoutDismiss();
		await this.trackSkip("panel_closed");
	}

	/**
	 * Called internally when timeout (60s) expires with no interaction
	 */
	private async onTimeoutExpired(): Promise<void> {
		await this.trackSkip("timeout");
	}

	/**
	 * Core tracking function
	 * Calculates duration and sends to diagnostic tracker
	 * Also maps to core events for simplified analytics
	 */
	private async trackSkip(reason: SkipReason): Promise<void> {
		const durationMs = Date.now() - this.sessionStartTime;

		// Track diagnostic event
		const diagnosticEvent = {
			event: "welcome.panel_dismissed",
			properties: {
				panel_view_id: this.panelViewId,
				reason,
				details_expanded: this.detailsExpanded,
				duration_ms: durationMs,
				timestamp_utc: Date.now(),
			},
		};

		try {
			await this.diagnosticTracker.track(diagnosticEvent);

			// Also map to core event for simplified analytics
			const coreEvent = this.mapToCorEvent(reason, durationMs);
			if (coreEvent) {
				await this.diagnosticTracker.track(coreEvent);
			}
		} catch (error) {
			// Don't prevent panel closure if tracking fails
			vscode.window.showErrorMessage(
				`Failed to track welcome panel event: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Map skip reason to core event outcome
	 * Used by simplified analytics system
	 */
	private mapToCorEvent(
		reason: SkipReason,
		durationMs: number,
	): { event: string; properties: Record<string, unknown> } | null {
		switch (reason) {
			case "user_clicked_skip":
				return {
					event: "session_finalized",
					properties: {
						outcome: "dismissed",
						duration_ms: durationMs,
					},
				};

			case "informed_skip":
				return {
					event: "session_finalized",
					properties: {
						outcome: "informed_local_choice",
						duration_ms: durationMs,
					},
				};

			case "panel_closed":
				return {
					event: "session_finalized",
					properties: {
						outcome: "closed_without_action",
						duration_ms: durationMs,
					},
				};

			case "timeout":
				return {
					event: "session_finalized",
					properties: {
						outcome: "timeout",
						duration_ms: durationMs,
					},
				};
		}
	}

	/**
	 * Start 60-second auto-dismiss timeout
	 * Cancelled if user interacts with panel
	 */
	private startTimeoutDismiss(): void {
		this.timeoutHandle = setTimeout(() => {
			this.onTimeoutExpired();
		}, this.PANEL_TIMEOUT_MS);
	}

	/**
	 * Cancel timeout if user interacts
	 */
	private cancelTimeoutDismiss(): void {
		if (this.timeoutHandle) {
			clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}
	}

	/**
	 * Generate unique panel view ID for session correlation
	 * UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
	 */
	private generateViewId(): string {
		return `pv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Cleanup when panel is destroyed
	 */
	async dispose(): Promise<void> {
		this.cancelTimeoutDismiss();
	}
}

/**
 * Semantic skip reasons
 */
type SkipReason =
	| "user_clicked_skip"
	| "informed_skip"
	| "panel_closed"
	| "timeout";

export type { SkipReason };
