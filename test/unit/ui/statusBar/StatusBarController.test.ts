/**
 * StatusBarController Unit Tests
 *
 * Tests for the FSM-based status bar controller that bridges
 * UnifiedDataService health events to StatusBarStateMachine transitions.
 *
 * RED-GREEN-REFACTOR: These tests define expected behavior first.
 *
 * @regression-marker These tests prevent regression in:
 * - Health score → state mapping thresholds (20/45/65)
 * - FSM transitions including recovering state
 * - Snapshot event handling and counter delegation
 * - Disable/enable snooze functionality
 *
 * @see dashboard_metrcs_dev_trust_enhance.md for specification
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStatusBarController, StatusBarController } from "../../../../src/ui/statusBar/StatusBarController";
import type { StatusBarState } from "../../../../src/ui/statusBar/types";
import type { SessionHealth, UnifiedDataService, UnifiedDataEvent } from "../../../../src/services/UnifiedDataService";
import type { StatusBarManager } from "../../../../src/ui/StatusBarManager";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

type DataChangeCallback = (event: UnifiedDataEvent) => void;

function createMockUnifiedDataService(): {
	dataService: UnifiedDataService;
	triggerHealthChange: (health: Partial<SessionHealth>) => void;
} {
	const callbacks: DataChangeCallback[] = [];

	const dataService = {
		onDataChange: vi.fn((callback: DataChangeCallback) => {
			callbacks.push(callback);
			return { dispose: () => callbacks.splice(callbacks.indexOf(callback), 1) };
		}),
		getSessionHealth: vi.fn(() => ({
			healthScore: 100,
			trajectory: "stable" as const,
			activeWarnings: [],
			lastSnapshotMinutesAgo: null,
			suggestions: [],
		})),
		getVitals: vi.fn(() => null),
		getThresholdMultiplier: vi.fn(() => 1.0),
	} as unknown as UnifiedDataService;

	const triggerHealthChange = (health: Partial<SessionHealth>) => {
		const fullHealth: SessionHealth = {
			healthScore: 100,
			trajectory: "stable",
			activeWarnings: [],
			lastSnapshotMinutesAgo: null,
			suggestions: [],
			...health,
		};
		vi.mocked(dataService.getSessionHealth).mockReturnValue(fullHealth);
		for (const cb of callbacks) {
			cb({ type: "health-changed", data: fullHealth });
		}
	};

	return { dataService, triggerHealthChange };
}

function createMockStatusBarManager(): StatusBarManager {
	return {
		updateSessionHealth: vi.fn(),
		showIdle: vi.fn(),
		showCheckpointCreated: vi.fn(),
		showRecommendation: vi.fn(),
		showActivitySequenceByType: vi.fn().mockResolvedValue(undefined),
		incrementSnapshotCount: vi.fn(),
		setVitalsEnabled: vi.fn(),
	} as unknown as StatusBarManager;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe("StatusBarController", () => {
	let controller: StatusBarController;
	let mockDataService: ReturnType<typeof createMockUnifiedDataService>;
	let mockStatusBarManager: StatusBarManager;

	beforeEach(() => {
		vi.useFakeTimers();
		mockDataService = createMockUnifiedDataService();
		mockStatusBarManager = createMockStatusBarManager();
		controller = createStatusBarController(mockDataService.dataService, mockStatusBarManager);
	});

	afterEach(() => {
		controller.dispose();
		vi.useRealTimers();
	});

	// ═══════════════════════════════════════════════════════════════════
	// INITIALIZATION
	// ═══════════════════════════════════════════════════════════════════

	describe("initialization", () => {
		it("should start in idle state", () => {
			expect(controller.getState()).toBe("idle");
		});

		it("should subscribe to UnifiedDataService onDataChange", () => {
			expect(mockDataService.dataService.onDataChange).toHaveBeenCalled();
		});

		it("should initialize with current health from data service", () => {
			expect(mockDataService.dataService.getSessionHealth).toHaveBeenCalled();
			expect(mockStatusBarManager.updateSessionHealth).toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════
	// HEALTH TO STATE MAPPING (spec: 0.35, 0.55, 0.80 thresholds)
	// Note: Health score is inverse of risk (health = 100 - pressure)
	// ═══════════════════════════════════════════════════════════════════

	describe("health to state mapping", () => {
		/**
		 * Risk thresholds from spec:
		 * - 0.35 risk = 65 health → ambient-risk
		 * - 0.55 risk = 45 health → recommend
		 * - 0.80 risk = 20 health → critical
		 */

		it("should remain in idle when health > 65", () => {
			// Arrange
			expect(controller.getState()).toBe("idle");

			// Act: health = 70 (risk < 0.35)
			mockDataService.triggerHealthChange({ healthScore: 70 });

			// Assert
			expect(controller.getState()).toBe("idle");
		});

		it("should transition to ambient-risk when health <= 65 and > 45", () => {
			// Arrange
			expect(controller.getState()).toBe("idle");

			// Act: health = 60 (risk = 0.40, between 0.35 and 0.55)
			mockDataService.triggerHealthChange({ healthScore: 60 });

			// Assert
			expect(controller.getState()).toBe("ambient-risk");
		});

		it("should transition to recommend when health <= 45 and > 20", () => {
			// Arrange
			expect(controller.getState()).toBe("idle");

			// Act: health = 40 (risk = 0.60, between 0.55 and 0.80)
			mockDataService.triggerHealthChange({ healthScore: 40 });

			// Assert
			expect(controller.getState()).toBe("recommend");
		});

		it("should transition to critical when health <= 20", () => {
			// Arrange
			expect(controller.getState()).toBe("idle");

			// Act: health = 15 (risk = 0.85, >= 0.80)
			mockDataService.triggerHealthChange({ healthScore: 15 });

			// Assert
			expect(controller.getState()).toBe("critical");
		});

		it("should transition back to idle when health improves above 65", () => {
			// Arrange: start in ambient-risk
			mockDataService.triggerHealthChange({ healthScore: 60 });
			expect(controller.getState()).toBe("ambient-risk");

			// Act: health improves to 80
			mockDataService.triggerHealthChange({ healthScore: 80 });

			// Assert: should go back to idle
			// Note: FSM priority rules may affect this - protected state allows any transition
			expect(controller.getState()).toBe("idle");
		});

		it("should not flicker when health stays in same zone", () => {
			// Arrange: in recommend state
			mockDataService.triggerHealthChange({ healthScore: 40 });
			expect(controller.getState()).toBe("recommend");

			// Clear mock calls
			vi.mocked(mockStatusBarManager.showRecommendation).mockClear();

			// Act: health changes but stays in recommend zone
			mockDataService.triggerHealthChange({ healthScore: 35 });

			// Assert: should still be recommend, no extra UI updates needed
			expect(controller.getState()).toBe("recommend");
		});
	});

	// ═══════════════════════════════════════════════════════════════════
	// STATUS BAR MANAGER INTEGRATION
	// ═══════════════════════════════════════════════════════════════════

	describe("status bar manager integration", () => {
		it("should call updateSessionHealth on health changes", () => {
			// Arrange
			vi.mocked(mockStatusBarManager.updateSessionHealth).mockClear();

			// Act
			mockDataService.triggerHealthChange({ healthScore: 50, trajectory: "degrading" });

			// Assert
			expect(mockStatusBarManager.updateSessionHealth).toHaveBeenCalledWith(
				expect.any(String), // health level canonical
				"degrading"
			);
		});

		it("should show recommendation when in recommend state", () => {
			// Act
			mockDataService.triggerHealthChange({ healthScore: 40 });

			// Assert
			expect(mockStatusBarManager.showRecommendation).toHaveBeenCalledWith(
				"medium",
				expect.stringContaining("pressure")
			);
		});

		it("should show critical recommendation when in critical state", () => {
			// Act
			mockDataService.triggerHealthChange({ healthScore: 15 });

			// Assert
			expect(mockStatusBarManager.showRecommendation).toHaveBeenCalledWith(
				"critical",
				expect.stringContaining("risk")
			);
		});

		it("should show idle when returning to healthy state", () => {
			// Arrange: in recommend
			mockDataService.triggerHealthChange({ healthScore: 40 });
			vi.mocked(mockStatusBarManager.showIdle).mockClear();

			// Act: health improves
			mockDataService.triggerHealthChange({ healthScore: 80 });

			// Assert
			expect(mockStatusBarManager.showIdle).toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════
	// SNAPSHOT EVENTS
	// ═══════════════════════════════════════════════════════════════════

	describe("snapshot events", () => {
		it("should transition to protected state on snapshot created", () => {
			// Arrange
			expect(controller.getState()).toBe("idle");

			// Act
			controller.onSnapshotCreated();

			// Assert
			expect(controller.getState()).toBe("protected");
		});

		it("should auto-revert from protected after 3 seconds", () => {
			// Arrange
			controller.onSnapshotCreated();
			expect(controller.getState()).toBe("protected");

			// Act
			vi.advanceTimersByTime(3000);

			// Assert: should revert to idle (previous state)
			expect(controller.getState()).toBe("idle");
		});

		it("should show checkpoint created when snapshot created", () => {
			// Act
			controller.onSnapshotCreated();

			// Assert
			expect(mockStatusBarManager.showCheckpointCreated).toHaveBeenCalled();
		});

		it("should NOT increment counter (handled by existing handler)", () => {
			// Act
			controller.onSnapshotCreated();

			// Assert: counter NOT incremented by controller
			// (handled by SNAPSHOT_CREATED event handler in extension.ts)
			expect(mockStatusBarManager.incrementSnapshotCount).not.toHaveBeenCalled();
		});

		it("should not transition to protected from recovering state", () => {
			// Arrange: in recovering state
			controller.onRecoveryStart();
			expect(controller.getState()).toBe("recovering");

			// Act
			controller.onSnapshotCreated();

			// Assert: should stay in recovering
			expect(controller.getState()).toBe("recovering");
		});
	});

	// ═══════════════════════════════════════════════════════════════════
	// RECOVERY EVENTS
	// ═══════════════════════════════════════════════════════════════════

	describe("recovery events", () => {
		it("should transition to recovering state on recovery start", () => {
			// Act
			controller.onRecoveryStart();

			// Assert
			expect(controller.getState()).toBe("recovering");
		});

		it("should transition to idle on successful recovery", () => {
			// Arrange
			controller.onRecoveryStart();
			expect(controller.getState()).toBe("recovering");

			// Act
			controller.onRecoveryComplete(true);

			// Assert
			expect(controller.getState()).toBe("idle");
		});

		it("should transition to error on failed recovery", () => {
			// Arrange
			controller.onRecoveryStart();
			expect(controller.getState()).toBe("recovering");

			// Act
			controller.onRecoveryComplete(false);

			// Assert
			expect(controller.getState()).toBe("error");
		});

		it("should ignore health changes while recovering", () => {
			// Arrange: in recovering state
			controller.onRecoveryStart();
			expect(controller.getState()).toBe("recovering");

			// Act: health becomes critical
			mockDataService.triggerHealthChange({ healthScore: 10 });

			// Assert: should still be recovering, not critical
			expect(controller.getState()).toBe("recovering");
		});
	});

	// ═══════════════════════════════════════════════════════════════════
	// DISABLE/ENABLE
	// ═══════════════════════════════════════════════════════════════════

	describe("disable/enable", () => {
		it("should transition to disabled state", () => {
			// Act
			controller.disable();

			// Assert
			expect(controller.getState()).toBe("disabled");
		});

		it("should ignore health changes while disabled", () => {
			// Arrange
			controller.disable();
			expect(controller.getState()).toBe("disabled");

			// Act: health becomes critical
			mockDataService.triggerHealthChange({ healthScore: 10 });

			// Assert: should still be disabled
			expect(controller.getState()).toBe("disabled");
		});

		it("should transition back to idle when enabled", () => {
			// Arrange
			controller.disable();
			expect(controller.getState()).toBe("disabled");

			// Act
			controller.enable();

			// Assert
			expect(controller.getState()).toBe("idle");
		});

		it("should auto-enable after snooze duration", () => {
			// Arrange
			controller.disable(5000); // 5 second snooze
			expect(controller.getState()).toBe("disabled");

			// Act
			vi.advanceTimersByTime(5000);

			// Assert: should auto-enable
			expect(controller.getState()).toBe("idle");
		});

		it("should re-process health after enabling", () => {
			// Arrange: disable while critical
			mockDataService.triggerHealthChange({ healthScore: 10 });
			expect(controller.getState()).toBe("critical");

			controller.disable();
			expect(controller.getState()).toBe("disabled");

			// Act: enable
			controller.enable();

			// Assert: should re-evaluate and go to critical
			expect(controller.getState()).toBe("critical");
		});
	});

	// ═══════════════════════════════════════════════════════════════════
	// EDGE CASES / REGRESSION PREVENTION
	// ═══════════════════════════════════════════════════════════════════

	describe("edge cases and regression prevention", () => {
		it("should handle rapid health changes without crashing", () => {
			// Simulate rapid health fluctuations
			for (let i = 0; i < 100; i++) {
				const health = Math.random() * 100;
				mockDataService.triggerHealthChange({ healthScore: health });
			}

			// Should not throw and should be in a valid state
			const state = controller.getState();
			expect(["idle", "ambient-risk", "recommend", "critical"]).toContain(state);
		});

		it("should clean up subscriptions on dispose", () => {
			// Arrange
			const subscription = { dispose: vi.fn() };
			vi.mocked(mockDataService.dataService.onDataChange).mockReturnValue(subscription);

			// Create a new controller to test dispose
			const newController = createStatusBarController(mockDataService.dataService, mockStatusBarManager);

			// Act
			newController.dispose();

			// Assert: should have disposed the subscription
			expect(subscription.dispose).toHaveBeenCalled();
		});

		it("should handle boundary health values correctly", () => {
			// Test exact thresholds
			mockDataService.triggerHealthChange({ healthScore: 65 }); // exactly at ambient-risk boundary
			expect(controller.getState()).toBe("ambient-risk");

			mockDataService.triggerHealthChange({ healthScore: 45 }); // exactly at recommend boundary
			expect(controller.getState()).toBe("recommend");

			mockDataService.triggerHealthChange({ healthScore: 20 }); // exactly at critical boundary
			expect(controller.getState()).toBe("critical");
		});

		it("should handle health score of 0", () => {
			mockDataService.triggerHealthChange({ healthScore: 0 });
			expect(controller.getState()).toBe("critical");
		});

		it("should handle health score of 100", () => {
			mockDataService.triggerHealthChange({ healthScore: 100 });
			expect(controller.getState()).toBe("idle");
		});
	});

	// ═══════════════════════════════════════════════════════════════════
	// FORCE STATE (for testing/debugging)
	// ═══════════════════════════════════════════════════════════════════

	describe("forceState", () => {
		it("should allow forcing state for testing", () => {
			// Act
			const result = controller.forceState("critical", "test");

			// Assert
			expect(result).toBe(true);
			expect(controller.getState()).toBe("critical");
		});
	});
});
