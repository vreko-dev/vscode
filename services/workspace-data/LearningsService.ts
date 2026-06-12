/**
 * LearningsService - Learnings, Violations, and Patterns Management
 *
 * Single responsibility: Load and manage data from daemon via DaemonBridge.
 * All data flows through the daemon for consistency across surfaces.
 *
 * Architecture: Daemon-first with graceful degradation.
 * If daemon is unavailable, returns empty data.
 *
 * @packageDocumentation
 */

import { logger } from "../../utils/logger";
import type { DaemonBridge } from "../DaemonBridge";
import type { Learning, Violation, WorkspacePattern } from "./types";

/**
 * Callback for data change notifications
 */
export type LearningsChangeCallback = (
	event: "learnings-updated" | "violations-updated" | "patterns-updated" | "degraded-changed",
) => void;

/**
 * Service for managing learnings, violations, and patterns from daemon
 */
export class LearningsService {
	private learnings: Learning[] = [];
	private violations: Violation[] = [];
	private patterns: WorkspacePattern[] = [];
	private onChangeCallback?: LearningsChangeCallback;

	// Daemon bridge for IPC
	private daemonBridge: DaemonBridge | null = null;

	// Degraded state tracking
	private degraded = false;

	constructor(private readonly workspaceRoot: string) {
		/* intentionally empty */
	}

	/**
	 * Set the DaemonBridge for IPC communication
	 */
	setDaemonBridge(bridge: DaemonBridge): void {
		this.daemonBridge = bridge;
	}

	/**
	 * Check if service is in degraded state (daemon unavailable)
	 */
	isDegraded(): boolean {
		return this.degraded;
	}

	/**
	 * Set change callback for notifying parent service
	 */
	setOnChangeCallback(callback: LearningsChangeCallback): void {
		this.onChangeCallback = callback;
	}

	/**
	 * Get current learnings
	 */
	getLearnings(): Learning[] {
		return [...this.learnings];
	}

	/**
	 * Get current violations
	 */
	getViolations(): Violation[] {
		return [...this.violations];
	}

	/**
	 * Get current patterns
	 */
	getPatterns(): WorkspacePattern[] {
		return [...this.patterns];
	}

	/**
	 * Load all data from daemon
	 */
	async loadAll(): Promise<void> {
		await Promise.all([this.loadLearnings(), this.loadViolations(), this.loadPatterns()]);
	}

	/**
	 * Load learnings from daemon via DaemonBridge
	 */
	async loadLearnings(): Promise<void> {
		if (!this.daemonBridge?.isConnected()) {
			this.setDegraded(true);
			this.learnings = [];
			return;
		}

		try {
			const result = await this.daemonBridge.listLearnings(this.workspaceRoot);

			this.learnings = (result.learnings || []).map((l, idx) => ({
				id: `learning-${idx}-${Date.now()}`,
				type: l.type as Learning["type"],
				trigger: l.trigger,
				action: l.action,
				source: l.source || "daemon",
				createdAt: l.timestamp || new Date().toISOString(),
			}));

			this.setDegraded(false);
			this.onChangeCallback?.("learnings-updated");

			logger.debug("LearningsService: Learnings loaded from daemon", {
				count: this.learnings.length,
			});
		} catch (error) {
			this.setDegraded(true);
			logger.warn("LearningsService: Failed to load learnings from daemon", {
				error: (error as Error).message,
			});
			this.learnings = [];
		}
	}

	/**
	 * Load violations from daemon via DaemonBridge
	 */
	async loadViolations(): Promise<void> {
		if (!this.daemonBridge?.isConnected()) {
			this.violations = [];
			return;
		}

		try {
			const result = await this.daemonBridge.listViolations(this.workspaceRoot);

			this.violations = (result.violations || []).map((v) => ({
				type: v.type,
				file: v.file,
				message: v.whatHappened || "",
				count: v.occurrences || 1,
				date: v.createdAt || new Date().toISOString(),
				prevention: v.prevention,
				promotionStatus: this.getPromotionStatus(v.occurrences || 1),
			}));

			this.setDegraded(false);
			this.onChangeCallback?.("violations-updated");

			logger.debug("LearningsService: Violations loaded from daemon", {
				count: this.violations.length,
			});
		} catch (error) {
			logger.warn("LearningsService: Failed to load violations from daemon", {
				error: (error as Error).message,
			});
			this.violations = [];
		}
	}

	/**
	 * Load patterns - Note: No daemon method exists for patterns yet
	 * This will return empty until a daemon pattern/list method is added
	 */
	async loadPatterns(): Promise<void> {
		// Issue: LIN-0000  -  Add daemon method for patterns
		// For now, patterns are not available via daemon
		this.patterns = [];
	}

	/**
	 * Update degraded state and notify if changed
	 */
	private setDegraded(value: boolean): void {
		if (this.degraded !== value) {
			this.degraded = value;
			this.onChangeCallback?.("degraded-changed");
		}
	}

	/**
	 * Get promotion status based on occurrence count
	 */
	private getPromotionStatus(count: number): Violation["promotionStatus"] {
		if (count >= 5) {
			return "automated";
		}
		if (count >= 3) {
			return "promoted";
		}
		if (count >= 2) {
			return "ready_for_promotion";
		}
		return "tracking";
	}
}
