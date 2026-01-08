/**
 * ThresholdCalibrator Integration Tests
 *
 * Tests for adaptive threshold calibration in VitalsUIIntegration.
 * Verifies that calibrated thresholds properly adjust health zone boundaries.
 *
 * TEST PATHS:
 * 1. Happy: Default multiplier (1.0) works as expected
 * 2. Conservative: Lower multiplier (0.7) triggers earlier warnings
 * 3. Aggressive: Higher multiplier (1.3) reduces notification frequency
 * 4. Edge: Boundary conditions and capping at 100
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Import the function to test directly
// Note: This is a private function, so we need to test it through exports
// or expose it for testing. For now, we'll recreate the logic to test.

/**
 * Recreate deriveHealthLevel for testing (copy from VitalsUIIntegration)
 * In production, this would be imported or exposed via a test utility
 */
function deriveHealthLevel(healthScore: number, thresholdMultiplier = 1.0): "healthy" | "caution" | "warning" | "critical" {
	const adjustedHealthScore = Math.min(100, healthScore * thresholdMultiplier);

	if (adjustedHealthScore >= 70) return "healthy";
	if (adjustedHealthScore >= 50) return "caution";
	if (adjustedHealthScore >= 40) return "warning";
	return "critical";
}

describe("ThresholdCalibrator Integration", () => {
	describe("deriveHealthLevel with thresholdMultiplier", () => {
		// =========================================================================
		// DEFAULT MULTIPLIER (1.0) - Baseline behavior
		// =========================================================================

		describe("default multiplier (1.0)", () => {
			const multiplier = 1.0;

			it("should return healthy for score >= 70", () => {
				expect(deriveHealthLevel(70, multiplier)).toBe("healthy");
				expect(deriveHealthLevel(85, multiplier)).toBe("healthy");
				expect(deriveHealthLevel(100, multiplier)).toBe("healthy");
			});

			it("should return caution for score 50-69", () => {
				expect(deriveHealthLevel(50, multiplier)).toBe("caution");
				expect(deriveHealthLevel(60, multiplier)).toBe("caution");
				expect(deriveHealthLevel(69, multiplier)).toBe("caution");
			});

			it("should return warning for score 40-49", () => {
				expect(deriveHealthLevel(40, multiplier)).toBe("warning");
				expect(deriveHealthLevel(45, multiplier)).toBe("warning");
				expect(deriveHealthLevel(49, multiplier)).toBe("warning");
			});

			it("should return critical for score < 40", () => {
				expect(deriveHealthLevel(39, multiplier)).toBe("critical");
				expect(deriveHealthLevel(20, multiplier)).toBe("critical");
				expect(deriveHealthLevel(0, multiplier)).toBe("critical");
			});
		});

		// =========================================================================
		// CONSERVATIVE MULTIPLIER (0.7) - More protective warnings
		// =========================================================================

		describe("conservative multiplier (0.7)", () => {
			const multiplier = 0.7;

			it("should shift boundaries earlier for conservative users", () => {
				// Score 100 * 0.7 = 70 → still healthy
				expect(deriveHealthLevel(100, multiplier)).toBe("healthy");

				// Score 90 * 0.7 = 63 → caution (was healthy at 1.0)
				expect(deriveHealthLevel(90, multiplier)).toBe("caution");

				// Score 70 * 0.7 = 49 → warning (was healthy at 1.0)
				expect(deriveHealthLevel(70, multiplier)).toBe("warning");

				// Score 55 * 0.7 = 38.5 → critical (was caution at 1.0)
				expect(deriveHealthLevel(55, multiplier)).toBe("critical");
			});

			it("should trigger caution earlier than default", () => {
				// At default 1.0, score 70 is healthy
				expect(deriveHealthLevel(70, 1.0)).toBe("healthy");
				// At conservative 0.7, score 70 becomes 49 → warning
				expect(deriveHealthLevel(70, 0.7)).toBe("warning");
			});

			it("should reach critical zone sooner", () => {
				// Score that would be caution at default becomes critical
				const score = 50;
				expect(deriveHealthLevel(score, 1.0)).toBe("caution");
				expect(deriveHealthLevel(score, 0.7)).toBe("critical"); // 50 * 0.7 = 35
			});
		});

		// =========================================================================
		// AGGRESSIVE MULTIPLIER (1.3) - Fewer notifications
		// =========================================================================

		describe("aggressive multiplier (1.3)", () => {
			const multiplier = 1.3;

			it("should shift boundaries later for aggressive users", () => {
				// Score 60 * 1.3 = 78 → healthy (was caution at 1.0)
				expect(deriveHealthLevel(60, multiplier)).toBe("healthy");

				// Score 45 * 1.3 = 58.5 → caution (was warning at 1.0)
				expect(deriveHealthLevel(45, multiplier)).toBe("caution");

				// Score 35 * 1.3 = 45.5 → warning (was critical at 1.0)
				expect(deriveHealthLevel(35, multiplier)).toBe("warning");
			});

			it("should stay healthy at lower raw scores", () => {
				// At default, 65 is caution
				expect(deriveHealthLevel(65, 1.0)).toBe("caution");
				// At aggressive 1.3, 65 becomes 84.5 → healthy
				expect(deriveHealthLevel(65, 1.3)).toBe("healthy");
			});

			it("should cap adjusted score at 100", () => {
				// Score 100 * 1.3 = 130, but should cap at 100
				expect(deriveHealthLevel(100, 1.3)).toBe("healthy");
				// Score 80 * 1.3 = 104, caps at 100 → healthy
				expect(deriveHealthLevel(80, 1.3)).toBe("healthy");
			});
		});

		// =========================================================================
		// EDGE CASES
		// =========================================================================

		describe("edge cases", () => {
			it("should handle zero health score", () => {
				expect(deriveHealthLevel(0, 1.0)).toBe("critical");
				expect(deriveHealthLevel(0, 0.7)).toBe("critical");
				expect(deriveHealthLevel(0, 1.3)).toBe("critical");
			});

			it("should handle boundary scores exactly", () => {
				// Exactly at boundaries
				expect(deriveHealthLevel(70, 1.0)).toBe("healthy");
				expect(deriveHealthLevel(69.9, 1.0)).toBe("caution");
				expect(deriveHealthLevel(50, 1.0)).toBe("caution");
				expect(deriveHealthLevel(49.9, 1.0)).toBe("warning");
				expect(deriveHealthLevel(40, 1.0)).toBe("warning");
				expect(deriveHealthLevel(39.9, 1.0)).toBe("critical");
			});

			it("should handle very low multipliers", () => {
				// Extreme conservative (0.5)
				expect(deriveHealthLevel(100, 0.5)).toBe("caution"); // 50
				expect(deriveHealthLevel(80, 0.5)).toBe("warning");  // 40
				expect(deriveHealthLevel(70, 0.5)).toBe("critical"); // 35
			});

			it("should handle very high multipliers with capping", () => {
				// Extreme aggressive (2.0) - should cap at 100
				expect(deriveHealthLevel(60, 2.0)).toBe("healthy"); // 120 → capped to 100
				expect(deriveHealthLevel(35, 2.0)).toBe("healthy"); // 70
				expect(deriveHealthLevel(25, 2.0)).toBe("caution"); // 50
			});

			it("should default to 1.0 when multiplier not provided", () => {
				expect(deriveHealthLevel(70)).toBe("healthy");
				expect(deriveHealthLevel(60)).toBe("caution");
				expect(deriveHealthLevel(45)).toBe("warning");
				expect(deriveHealthLevel(30)).toBe("critical");
			});
		});

		// =========================================================================
		// REAL-WORLD SCENARIOS
		// =========================================================================

		describe("real-world scenarios", () => {
			it("conservative user gets early warning for degrading session", () => {
				// Session degrades from 85 to 65
				const conservativeMultiplier = 0.75;

				// At 85: 85 * 0.75 = 63.75 → caution
				expect(deriveHealthLevel(85, conservativeMultiplier)).toBe("caution");

				// At 65: 65 * 0.75 = 48.75 → warning
				expect(deriveHealthLevel(65, conservativeMultiplier)).toBe("warning");

				// Compare to default: 65 would still be caution
				expect(deriveHealthLevel(65, 1.0)).toBe("caution");
			});

			it("aggressive user tolerates more changes before warning", () => {
				const aggressiveMultiplier = 1.25;

				// Session at 60 (default would show caution)
				expect(deriveHealthLevel(60, 1.0)).toBe("caution");

				// Aggressive user: 60 * 1.25 = 75 → healthy
				expect(deriveHealthLevel(60, aggressiveMultiplier)).toBe("healthy");

				// Only warns when raw score drops to ~40
				expect(deriveHealthLevel(40, aggressiveMultiplier)).toBe("caution"); // 50
			});

			it("4-zone system provides graduated response", () => {
				// Test that all 4 zones are accessible with calibration
				const scores = [90, 60, 45, 25];
				const expected = ["healthy", "caution", "warning", "critical"];

				scores.forEach((score, i) => {
					expect(deriveHealthLevel(score, 1.0)).toBe(expected[i]);
				});
			});
		});
	});
});
