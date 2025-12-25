/**
 * VitalsIntegration
 *
 * Connects @snapback/intelligence/vitals → StatusBarManager
 *
 * Responsibilities:
 * - Listen to WorkspaceVitals state changes
 * - Transform VitalsSnapshot to VitalsDisplayData (UI format)
 * - Throttle updates (200ms) to avoid performance impact
 * - Manage vitals display on/off (power user setting)
 *
 * @performance Budget: <1ms per update (throttled)
 */

import type { TempLevel, Trajectory, VitalsSnapshot } from "@snapback/intelligence/vitals";
import type { TemperatureLevelCanonical, TrajectoryCanonical } from "../signage/types";
import type { StatusBarManager } from "./StatusBarManager";
import type { VitalsDisplayData } from "./ux-types";

/**
 * Map intelligence package temperature level to canonical signage level
 * Intelligence uses "cold", signage uses "cool"
 */
function mapTemperatureToCanonical(level: TempLevel): TemperatureLevelCanonical {
	if (level === "cold") return "cool";
	return level; // "warm", "hot", "burning" are the same
}

/**
 * Map intelligence package trajectory to canonical signage trajectory
 * Intelligence: stable, escalating, critical, recovering
 * Signage: stable, degrading, critical, improving
 */
function mapTrajectoryToCanonical(trajectory: Trajectory): TrajectoryCanonical {
	switch (trajectory) {
		case "escalating":
			return "degrading";
		case "recovering":
			return "improving";
		default:
			return trajectory; // "stable" and "critical" are the same
	}
}

/**
 * Connects WorkspaceVitals to VS Code StatusBar
 */
export class VitalsIntegration {
	private statusBar: StatusBarManager;
	private vitalsEnabled = false;
	private pendingSnapshot: VitalsSnapshot | null = null;
	private throttleTimer: NodeJS.Timeout | null = null;
	private readonly THROTTLE_MS = 200;

	constructor(statusBar: StatusBarManager) {
		this.statusBar = statusBar;
	}

	/**
	 * Handle vitals snapshot update
	 * Throttles to prevent excessive StatusBar updates
	 * First call is immediate, subsequent calls within THROTTLE_MS are queued
	 */
	onVitalsSnapshot(snapshot: VitalsSnapshot): void {
		if (!this.vitalsEnabled) {
			this.statusBar.showIdle();
			return;
		}

		// If throttle timer is active, queue update for later
		if (this.throttleTimer) {
			this.pendingSnapshot = snapshot;
			return;
		}

		// First call: Execute immediately
		const displayData = this.transformSnapshot(snapshot);
		this.statusBar.showVitals(displayData);

		// Schedule throttle window to process any queued updates
		this.throttleTimer = setTimeout(() => {
			if (this.pendingSnapshot) {
				const queuedData = this.transformSnapshot(this.pendingSnapshot);
				this.statusBar.showVitals(queuedData);
				this.pendingSnapshot = null;
			}
			this.throttleTimer = null;
		}, this.THROTTLE_MS);
	}

	/**
	 * Enable/disable vitals display
	 */
	setVitalsEnabled(enabled: boolean): void {
		this.vitalsEnabled = enabled;
		this.statusBar.setVitalsEnabled(enabled);

		if (!enabled) {
			this.statusBar.showIdle();
		}
	}

	/**
	 * Transform VitalsSnapshot to VitalsDisplayData for UI
	 * Maps intelligence package types to canonical signage types
	 */
	private transformSnapshot(snapshot: VitalsSnapshot): VitalsDisplayData {
		return {
			pulse: {
				level: this.mapPulseToCanonical(snapshot.pulse.level),
				value: snapshot.pulse.changesPerMinute,
			},
			temperature: {
				level: mapTemperatureToCanonical(snapshot.temperature.level),
				percentage: snapshot.temperature.aiPercentage,
				...(snapshot.temperature.detectedTool && { tool: snapshot.temperature.detectedTool }),
			},
			pressure: {
				value: snapshot.pressure.value,
				trend: this.calculatePressureTrend(snapshot.pressure.value),
			},
			oxygen: {
				value: snapshot.oxygen.value,
			},
			trajectory: mapTrajectoryToCanonical(snapshot.trajectory),
		};
	}

	/**
	 * Map pulse level to canonical - intelligence pulse levels map directly
	 * but canonical adds "steady" which we map from "resting" at moderate activity
	 */
	private mapPulseToCanonical(level: VitalsSnapshot["pulse"]["level"]): VitalsDisplayData["pulse"]["level"] {
		// Intelligence levels: resting, elevated, racing, critical
		// Canonical levels: resting, steady, elevated, racing, critical
		// Map directly - "steady" would be derived from changes/min if needed
		return level;
	}

	/**
	 * Calculate pressure trend (simplified - in production, would track history)
	 */
	private calculatePressureTrend(value: number): "rising" | "stable" | "falling" {
		// In full implementation, would compare to previous value
		// For now, estimate based on value
		if (value > 75) return "rising";
		if (value < 25) return "falling";
		return "stable";
	}

	/**
	 * Cleanup
	 */
	dispose(): void {
		if (this.throttleTimer) {
			clearTimeout(this.throttleTimer);
			this.throttleTimer = null;
		}
		this.statusBar.dispose();
	}
}
