/**
 * VitalsService - Session Health and Guidance
 *
 * Single responsibility: Calculate session health, recommendations, and agent guidance from vitals.
 *
 * @packageDocumentation
 */

import type { AgentGuidance, SessionHealth, SnapshotRecommendation, VitalsConfig, VitalsData } from "./types";
import { PRESSURE_THRESHOLDS } from "./types";

/**
 * Callback for vitals change notifications
 */
export type VitalsChangeCallback = () => void;

/**
 * Service for session health and vitals-based guidance
 */
export class VitalsService {
	private lastVitals: VitalsData | null = null;
	private lastSnapshotTime: number | null = null;
	private onChangeCallback?: VitalsChangeCallback;
	private readonly config: VitalsConfig;

	constructor(config?: Partial<VitalsConfig>) {
		this.config = {
			pressureThresholds: config?.pressureThresholds ?? PRESSURE_THRESHOLDS,
		};
	}

	/**
	 * Set change callback for notifying parent service
	 */
	setOnChangeCallback(callback: VitalsChangeCallback): void {
		this.onChangeCallback = callback;
	}

	/**
	 * Update vitals from external source
	 */
	updateVitals(vitals: VitalsData): void {
		this.lastVitals = vitals;
		this.onChangeCallback?.();
	}

	/**
	 * Get current vitals (may be null if not yet received)
	 */
	getVitals(): VitalsData | null {
		return this.lastVitals;
	}

	/**
	 * Record snapshot creation time
	 */
	recordSnapshot(): void {
		this.lastSnapshotTime = Date.now();
	}

	/**
	 * Get session health based on vitals
	 */
	getSessionHealth(): SessionHealth {
		if (!this.lastVitals) {
			return this.getDefaultSessionHealth();
		}

		const vitals = this.lastVitals;
		const thresholds = this.config.pressureThresholds;

		// Health score is inverse of pressure
		const healthScore = Math.max(0, 100 - vitals.pressure.value);

		// Map trajectory
		const trajectoryMap: Record<string, SessionHealth["trajectory"]> = {
			stable: "stable",
			escalating: "degrading",
			critical: "critical",
			recovering: "improving",
		};
		const trajectory = trajectoryMap[vitals.trajectory] || "stable";

		// Build warnings
		const warnings: string[] = [];
		if (vitals.pulse.level === "racing" || vitals.pulse.level === "critical") {
			warnings.push(`High code velocity: ${vitals.pulse.changesPerMinute} changes/min`);
		}
		if (vitals.temperature.level === "hot" || vitals.temperature.level === "burning") {
			warnings.push(`High AI change density: ${vitals.temperature.aiPercentage}%`);
		}
		if (vitals.pressure.value >= thresholds.high) {
			warnings.push(`Pressure at ${vitals.pressure.value}% - snapshot recommended`);
		}

		// Calculate last snapshot time
		const lastSnapshotMinutesAgo = this.lastSnapshotTime
			? Math.floor((Date.now() - this.lastSnapshotTime) / 60000)
			: null;

		// Build suggestions
		const suggestions: string[] = [];
		if (healthScore < 50) {
			suggestions.push("Create a snapshot to release pressure");
		}
		if (warnings.length > 2) {
			suggestions.push("Consider slowing down to review changes");
		}

		return {
			healthScore,
			trajectory,
			activeWarnings: warnings,
			lastSnapshotMinutesAgo,
			suggestions,
		};
	}

	/**
	 * Get snapshot recommendation
	 */
	getSnapshotRecommendation(): SnapshotRecommendation {
		if (!this.lastVitals) {
			return {
				should: false,
				reason: "Vitals not available",
				urgency: "optional",
			};
		}

		const vitals = this.lastVitals;
		const health = this.getSessionHealth();
		const thresholds = this.config.pressureThresholds;

		// Critical state
		if (vitals.trajectory === "critical" || health.healthScore < 30) {
			return {
				should: true,
				reason: "Critical workspace state - immediate snapshot recommended",
				urgency: "now",
			};
		}

		// High pressure
		if (vitals.pressure.value >= thresholds.critical) {
			return {
				should: true,
				reason: `High pressure (${vitals.pressure.value}%) - snapshot recommended`,
				urgency: "now",
			};
		}

		if (vitals.pressure.value >= thresholds.high) {
			return {
				should: true,
				reason: `High pressure (${vitals.pressure.value}%) - snapshot recommended`,
				urgency: "soon",
			};
		}

		return {
			should: false,
			reason: "Workspace healthy - no snapshot needed",
			urgency: "optional",
		};
	}

	/**
	 * Get agent guidance for safe operations
	 */
	getAgentGuidance(): AgentGuidance {
		if (!this.lastVitals) {
			return {
				safeOperations: ["read", "analyze", "search"],
				blockedOperations: [],
				suggestion: "Enable vitals for guidance",
			};
		}

		const vitals = this.lastVitals;
		const thresholds = this.config.pressureThresholds;
		const safeOps: string[] = ["read files", "analyze code", "search codebase"];
		const blockedOps: string[] = [];
		let suggestion = "";

		if (vitals.pressure.value >= thresholds.high) {
			blockedOps.push("refactor large files", "delete files", "major restructuring");
			suggestion = "High pressure - complete current changes before major refactoring";
		} else if (vitals.pressure.value >= thresholds.moderate) {
			safeOps.push("small edits", "add comments", "fix typos");
			blockedOps.push("large refactoring");
			suggestion = "Moderate pressure - keep changes small";
		} else {
			safeOps.push("refactor", "add features", "restructure");
			suggestion = "Workspace healthy - all operations safe";
		}

		if (vitals.trajectory === "critical") {
			blockedOps.push(...safeOps.filter((op) => op !== "read files"));
			safeOps.length = 0;
			safeOps.push("read files only");
			suggestion = "CRITICAL - snapshot immediately before any changes";
		}

		return {
			safeOperations: safeOps,
			blockedOperations: blockedOps,
			suggestion,
		};
	}

	/**
	 * Get default session health when vitals unavailable
	 */
	private getDefaultSessionHealth(): SessionHealth {
		return {
			healthScore: 100,
			trajectory: "stable",
			activeWarnings: [],
			lastSnapshotMinutesAgo: null,
			suggestions: ["Enable vitals monitoring for real-time health tracking"],
		};
	}
}
