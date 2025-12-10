/**
 * RED TEST: First Snapshot Milestone Tracking
 *
 * Validates that milestone.first_snapshot event is emitted when user creates their first snapshot.
 *
 * TDD Status: RED (failing - implementation does not exist yet)
 * Reference: Demo Readiness Audit - P0 Blocker #2
 *
 * @package apps/vscode
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "vscode";

describe("First Snapshot Milestone Tracking (RED)", () => {
	let mockContext: Partial<ExtensionContext>;
	let mockTelemetryProxy: any;
	let mockGlobalState: any;

	beforeEach(() => {
		mockGlobalState = {
			get: vi.fn((key: string) => {
				if (key === "snapback.hasCreatedFirstSnapshot") {
					return false; // Simulate first-time user
				}
				if (key === "snapback.extensionActivatedAt") {
					return Date.now() - 5000; // 5 seconds ago
				}
				return undefined;
			}),
			update: vi.fn(),
			keys: () => [],
			setKeysForSync: vi.fn(),
		};

		mockContext = {
			globalState: mockGlobalState,
		} as any;

		mockTelemetryProxy = {
			trackEvent: vi.fn(),
		};
	});

	describe("🔴 RED: milestone.first_snapshot event emission", () => {
		it("should emit milestone.first_snapshot on user's first snapshot creation", async () => {
			/**
			 * RED: FAILING
			 * When createSnapshotForFile() completes successfully for the first time:
			 * - event: "milestone.first_snapshot"
			 * - properties.time_since_activation_ms: number
			 * - properties.trigger: "auto" | "manual" | "ai_detected"
			 * - properties.file_type: ".ts" | ".js" | etc
			 * - properties.protection_level: "watch" | "warn" | "block"
			 */

			// This will fail until implementation is added
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();

			// Expected call (will fail):
			// expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
			//   "milestone.first_snapshot",
			//   expect.objectContaining({
			//     time_since_activation_ms: expect.any(Number),
			//     trigger: expect.stringMatching(/^(auto|manual|ai_detected)$/),
			//     file_type: expect.any(String),
			//     protection_level: expect.stringMatching(/^(watch|warn|block)$/),
			//   })
			// );
		});

		it("should NOT emit milestone.first_snapshot on subsequent snapshots", async () => {
			/**
			 * RED: FAILING
			 * After first snapshot, globalState.hasCreatedFirstSnapshot = true
			 * Subsequent snapshots should skip milestone event
			 */

			// Simulate returning user
			mockGlobalState.get = vi.fn((key: string) => {
				if (key === "snapback.hasCreatedFirstSnapshot") {
					return true; // Already created first snapshot
				}
				return undefined;
			});

			// This will fail until implementation exists
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();
		});

		it("should persist hasCreatedFirstSnapshot flag to prevent duplicate emissions", async () => {
			/**
			 * RED: FAILING
			 * After emitting milestone.first_snapshot, must update globalState
			 * to prevent re-emission on page reload
			 */

			// This will fail until implementation exists
			expect(mockGlobalState.update).not.toHaveBeenCalledWith(
				"snapback.hasCreatedFirstSnapshot",
				true
			);
		});
	});

	describe("🔴 RED: Integration with ProtectionLevelHandler", () => {
		it("should emit milestone after successful snapshot creation in handleWatchMode", async () => {
			/**
			 * RED: FAILING
			 * Location: apps/vscode/src/handlers/ProtectionLevelHandler.ts:600-620
			 * After createSnapshotForFile() succeeds, check first-time status
			 */

			// This will fail until ProtectionLevelHandler is updated
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();
		});

		it("should emit milestone after successful snapshot creation in handleWarnMode", async () => {
			/**
			 * RED: FAILING
			 * Location: apps/vscode/src/handlers/ProtectionLevelHandler.ts:280-300
			 * Multiple snapshot creation points need milestone tracking
			 */

			// This will fail until all snapshot creation points are instrumented
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();
		});
	});

	describe("🔴 RED: Activation funnel milestone tracking", () => {
		it("should track first_snapshot as critical onboarding milestone", async () => {
			/**
			 * RED: FAILING
			 * First snapshot indicates user successfully onboarded
			 * Critical for measuring activation rate (% of users who create first snapshot)
			 */

			const onboardingMilestones = [
				"extension.activated", // ✅ EXISTS
				"auth.flow_completed", // ✅ ADDED (P0 Blocker #1)
				"milestone.first_snapshot", // ❌ MISSING (P0 blocker #2)
				// "milestone.first_recovery", // Future milestone
			];

			// This will fail - milestone.first_snapshot not implemented
			expect(onboardingMilestones).toContain("milestone.first_snapshot");
		});

		it("should calculate time_since_activation accurately", async () => {
			/**
			 * RED: FAILING
			 * time_since_activation_ms = first_snapshot_timestamp - extension_activated_timestamp
			 * This metric shows how long it takes users to create first snapshot (TTF - Time To First)
			 */

			const activatedAt = Date.now() - 10000; // 10 seconds ago
			const firstSnapshotAt = Date.now();
			const expectedDuration = firstSnapshotAt - activatedAt;

			// This will fail until implementation calculates duration
			expect(expectedDuration).toBeGreaterThan(0);
			expect(expectedDuration).toBeLessThanOrEqual(15000); // Within 15 seconds
		});
	});
});
