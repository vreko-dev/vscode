/**
 * VitalsIntegration Tests
 *
 * Wires @snapback/intelligence/vitals to VS Code StatusBar display
 *
 * TEST PATHS:
 * 1. Happy: Vitals update → StatusBar updates with correct emoji
 * 2. Sad: StatusBar disabled → No vitals display
 * 3. Edge: Rapid vitals changes → Throttled updates (200ms)
 * 4. Error: WorkspaceVitals missing → Graceful fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VitalsSnapshot } from "@snapback/intelligence/vitals";
import { VitalsIntegration } from "../../src/ui/VitalsIntegration";
import { StatusBarManager } from "../../src/ui/StatusBarManager";

// Mock StatusBarManager
vi.mock("../../src/ui/StatusBarManager", () => ({
	StatusBarManager: vi.fn(() => ({
		showVitals: vi.fn(),
		showIdle: vi.fn(),
		setVitalsEnabled: vi.fn(),
		dispose: vi.fn(),
	})),
}));

describe("VitalsIntegration", () => {
	let integration: VitalsIntegration;
	let mockStatusBar: any;

	const mockVitalsSnapshot: VitalsSnapshot = {
		timestamp: Date.now(),
		pulse: { level: "elevated", changesPerMinute: 20 },
		temperature: { level: "warm", aiPercentage: 35, detectedTool: "Cursor" },
		pressure: { value: 45, unsnapshotedChanges: 12, timeSinceLastSnapshot: 5, criticalFilesTouched: [] },
		oxygen: { value: 85, coveragePercentage: 90, staleSnapshots: 0 },
		trajectory: "stable",
	};

	beforeEach(() => {
		mockStatusBar = {
			showVitals: vi.fn(),
			showIdle: vi.fn(),
			setVitalsEnabled: vi.fn(),
			dispose: vi.fn(),
		};

		vi.mocked(StatusBarManager).mockReturnValue(mockStatusBar);
		integration = new VitalsIntegration(mockStatusBar);
		integration.setVitalsEnabled(true); // Enable vitals for tests
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// =========================================================================
	// HAPPY PATH: Vitals update triggers StatusBar display
	// =========================================================================

	describe("happy path", () => {
		it("should update StatusBar when vitals snapshot received", () => {
			integration.onVitalsSnapshot(mockVitalsSnapshot);

			expect(mockStatusBar.showVitals).toHaveBeenCalledWith(
				expect.objectContaining({
					pulse: { level: "elevated", value: 20 },
					temperature: { level: "warm", percentage: 35, tool: "Cursor" },
					pressure: { value: 45 },
					oxygen: { value: 85 },
					trajectory: "stable",
				})
			);
		});

		it("should transform VitalsSnapshot to VitalsDisplayData correctly", () => {
			integration.onVitalsSnapshot(mockVitalsSnapshot);

			const call = mockStatusBar.showVitals.mock.calls[0][0];
			expect(call.pulse.level).toBe("elevated");
			expect(call.pulse.value).toBe(20); // changesPerMinute
			expect(call.temperature.percentage).toBe(35); // aiPercentage
			expect(call.oxygen.value).toBe(85);
		});

		it("should handle all trajectory states", () => {
			const trajectories = ["stable", "escalating", "critical", "recovering"];

			for (const trajectory of trajectories) {
				const snapshot = { ...mockVitalsSnapshot, trajectory: trajectory as any };
				integration.onVitalsSnapshot(snapshot);

				expect(mockStatusBar.showVitals).toHaveBeenCalledWith(expect.objectContaining({ trajectory }));
			}

			expect(mockStatusBar.showVitals).toHaveBeenCalledTimes(4);
		});
	});

	// =========================================================================
	// SAD PATH: Display disabled (opt-in for power users)
	// =========================================================================

	describe("sad path - display disabled", () => {
		it("should not show vitals when display is disabled", () => {
			integration.setVitalsEnabled(false);
			integration.onVitalsSnapshot(mockVitalsSnapshot);

			expect(mockStatusBar.showVitals).not.toHaveBeenCalled();
		});

		it("should show idle when vitals display disabled", () => {
			integration.setVitalsEnabled(false);
			integration.onVitalsSnapshot(mockVitalsSnapshot);

			expect(mockStatusBar.showIdle).toHaveBeenCalled();
		});

		it("should transition from vitals to idle when disabled mid-display", () => {
			integration.setVitalsEnabled(true);
			integration.onVitalsSnapshot(mockVitalsSnapshot);
			expect(mockStatusBar.showVitals).toHaveBeenCalled();

			mockStatusBar.showVitals.mockClear();
			integration.setVitalsEnabled(false);

			expect(mockStatusBar.showIdle).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// EDGE CASE: Rapid vitals changes (throttle updates)
	// =========================================================================

	describe("edge case - throttling", () => {
		it("should throttle rapid vitals updates (200ms)", () => {
			vi.useFakeTimers();

			// First update
			integration.onVitalsSnapshot(mockVitalsSnapshot);
			expect(mockStatusBar.showVitals).toHaveBeenCalledTimes(1);

			// Immediate second update (within 200ms) - should queue
			const snapshot2 = {
				...mockVitalsSnapshot,
				pulse: { ...mockVitalsSnapshot.pulse, changesPerMinute: 25 },
			};
			integration.onVitalsSnapshot(snapshot2);
			expect(mockStatusBar.showVitals).toHaveBeenCalledTimes(1); // Still 1, not 2

			// Wait 200ms - queued update should flush
			vi.advanceTimersByTime(200);
			expect(mockStatusBar.showVitals).toHaveBeenCalledTimes(2);

			vi.useRealTimers();
		});

		it("should use latest snapshot when multiple updates queued", () => {
			vi.useFakeTimers();

			const snapshot1 = { ...mockVitalsSnapshot, pulse: { ...mockVitalsSnapshot.pulse, changesPerMinute: 20 } };
			const snapshot2 = { ...mockVitalsSnapshot, pulse: { ...mockVitalsSnapshot.pulse, changesPerMinute: 30 } };
			const snapshot3 = { ...mockVitalsSnapshot, pulse: { ...mockVitalsSnapshot.pulse, changesPerMinute: 40 } };

			integration.onVitalsSnapshot(snapshot1);
			integration.onVitalsSnapshot(snapshot2);
			integration.onVitalsSnapshot(snapshot3);

			vi.advanceTimersByTime(200);

			// Should only call twice (first + throttled final)
			expect(mockStatusBar.showVitals).toHaveBeenCalledTimes(2);
			// Last call should have the final snapshot (40)
			expect(mockStatusBar.showVitals).toHaveBeenLastCalledWith(
				expect.objectContaining({
					pulse: expect.objectContaining({ value: 40 }),
				})
			);

			vi.useRealTimers();
		});
	});

	// =========================================================================
	// ERROR CASE: Missing or invalid vitals data
	// =========================================================================

	describe("error case - invalid data", () => {
		it("should handle snapshot with missing optional fields", () => {
			const minimalSnapshot: VitalsSnapshot = {
				timestamp: Date.now(),
				pulse: { level: "resting", changesPerMinute: 0 },
				temperature: { level: "cold", aiPercentage: 0 },
				pressure: { value: 0, unsnapshotedChanges: 0, timeSinceLastSnapshot: 0, criticalFilesTouched: [] },
				oxygen: { value: 100, coveragePercentage: 100, staleSnapshots: 0 },
				trajectory: "stable",
			};

			integration.onVitalsSnapshot(minimalSnapshot);

			expect(mockStatusBar.showVitals).toHaveBeenCalledWith(
				expect.objectContaining({
					pulse: { level: "resting", value: 0 },
					temperature: expect.objectContaining({ level: "cold" }),
				})
			);
		});

		it("should gracefully handle null detectedTool", () => {
			const snapshot = {
				...mockVitalsSnapshot,
				temperature: { ...mockVitalsSnapshot.temperature, detectedTool: undefined },
			};

			integration.onVitalsSnapshot(snapshot);

			expect(mockStatusBar.showVitals).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: expect.not.objectContaining({ tool: undefined }),
				})
			);
		});
	});

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	describe("lifecycle", () => {
		it("should dispose StatusBar on cleanup", () => {
			integration.dispose();

			expect(mockStatusBar.dispose).toHaveBeenCalled();
		});

		it("should cancel pending throttle timer on dispose", () => {
			vi.useFakeTimers();

			integration.onVitalsSnapshot(mockVitalsSnapshot);
			integration.onVitalsSnapshot(mockVitalsSnapshot);

			// Dispose before throttle timer fires
			integration.dispose();
			vi.advanceTimersByTime(200);

			// Should not cause errors
			expect(mockStatusBar.showVitals).toHaveBeenCalledTimes(1);

			vi.useRealTimers();
		});
	});
});
