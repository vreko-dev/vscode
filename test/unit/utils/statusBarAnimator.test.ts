/**
 * StatusBarAnimator Unit Tests
 *
 * TDD Phase: RED - Write failing tests first
 *
 * This utility provides frame-based animations for VS Code status bar items with:
 * - Accessibility support (respects workbench.reduceMotion)
 * - Frame cycling with configurable duration
 * - Proper cleanup on dispose (no orphaned intervals)
 * - Memory leak prevention (WeakMap for item references)
 * - Concurrent animation handling
 *
 * @see TDD_CORE.md for test-first principles
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

// Import the utility we're about to create (will fail until implemented)
import {
	type AnimationConfig,
	type AnimationPresets,
	StatusBarAnimator,
	createStatusBarAnimator,
	ANIMATION_PRESETS,
} from "@vscode/utils/statusBarAnimator";

// Mock VS Code API
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(),
	},
	window: {
		createStatusBarItem: vi.fn(),
	},
	StatusBarAlignment: {
		Left: 1,
		Right: 2,
	},
}));

describe("StatusBarAnimator", () => {
	let animator: StatusBarAnimator;
	let mockStatusBarItem: {
		text: string;
		tooltip: string;
		show: ReturnType<typeof vi.fn>;
		hide: ReturnType<typeof vi.fn>;
		dispose: ReturnType<typeof vi.fn>;
	};
	let mockGetConfiguration: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.clearAllMocks();

		// Create mock status bar item
		mockStatusBarItem = {
			text: "$(shield) SnapBack",
			tooltip: "SnapBack Protection",
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		};

		// Setup configuration mock
		mockGetConfiguration = vi.fn().mockReturnValue({
			get: vi.fn().mockReturnValue(false), // reduceMotion = false by default
		});

		const vscode = await import("vscode");
		(vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>) =
			mockGetConfiguration;

		animator = createStatusBarAnimator();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	// ==================== ACCESSIBILITY TESTS ====================

	describe("reduceMotion accessibility", () => {
		it("should check workbench.reduceMotion setting before animating", async () => {
			const config: AnimationConfig = {
				frames: ["⚡", "📷", "✓"],
				frameDurationMs: 150,
				finalIcon: "$(shield)",
			};

			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config);

			expect(mockGetConfiguration).toHaveBeenCalledWith("workbench");
		});

		it("should skip animation and show final state when reduceMotion is enabled", async () => {
			// Enable reduceMotion
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockImplementation((key: string) => {
					if (key === "reduceMotion") return true;
					return false;
				}),
			});

			const config: AnimationConfig = {
				frames: ["⚡", "📷", "✓"],
				frameDurationMs: 150,
				finalIcon: "$(check)",
			};

			const disposable = animator.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				config,
			);

			// Should immediately show final state, no animation
			expect(mockStatusBarItem.text).toContain("$(check)");

			// Advance timers - should not cycle through frames
			vi.advanceTimersByTime(500);
			expect(mockStatusBarItem.text).toContain("$(check)");

			disposable.dispose();
		});

		it("should animate normally when reduceMotion is disabled", async () => {
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(false), // reduceMotion disabled
			});

			const config: AnimationConfig = {
				frames: ["⚡", "📷", "✓"],
				frameDurationMs: 150,
				finalIcon: "$(shield)",
			};

			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config);

			// First frame should be shown
			expect(mockStatusBarItem.text).toContain("⚡");

			// Advance to second frame
			vi.advanceTimersByTime(150);
			expect(mockStatusBarItem.text).toContain("📷");

			// Advance to third frame
			vi.advanceTimersByTime(150);
			expect(mockStatusBarItem.text).toContain("✓");
		});
	});

	// ==================== FRAME CYCLING TESTS ====================

	describe("frame cycling", () => {
		beforeEach(() => {
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(false), // reduceMotion disabled
			});
		});

		it("should cycle through frames at specified duration", () => {
			const config: AnimationConfig = {
				frames: ["A", "B", "C"],
				frameDurationMs: 100,
				finalIcon: "X",
			};

			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config);

			expect(mockStatusBarItem.text).toContain("A");

			vi.advanceTimersByTime(100);
			expect(mockStatusBarItem.text).toContain("B");

			vi.advanceTimersByTime(100);
			expect(mockStatusBarItem.text).toContain("C");
		});

		it("should show final icon after animation completes", () => {
			const config: AnimationConfig = {
				frames: ["⚡", "📷", "✓"],
				frameDurationMs: 150,
				finalIcon: "$(shield)",
			};

			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config);

			// Advance through all frames (3 * 150 = 450ms)
			vi.advanceTimersByTime(450);

			// Should show final icon
			expect(mockStatusBarItem.text).toContain("$(shield)");
		});

		it("should preserve existing text after icon", () => {
			mockStatusBarItem.text = "$(shield) SnapBack │ 5 files";

			const config: AnimationConfig = {
				frames: ["⚡", "📷"],
				frameDurationMs: 100,
				finalIcon: "$(shield)",
			};

			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config);

			// Should replace icon but preserve rest of text
			expect(mockStatusBarItem.text).toContain("5 files");
		});

		it("should support loop option for continuous animation", () => {
			const config: AnimationConfig = {
				frames: ["A", "B"],
				frameDurationMs: 100,
				finalIcon: "X",
				loop: true,
			};

			const disposable = animator.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				config,
			);

			expect(mockStatusBarItem.text).toContain("A");
			vi.advanceTimersByTime(100);
			expect(mockStatusBarItem.text).toContain("B");
			vi.advanceTimersByTime(100);
			expect(mockStatusBarItem.text).toContain("A"); // Loops back

			disposable.dispose();
		});
	});

	// ==================== CLEANUP TESTS ====================

	describe("cleanup on dispose", () => {
		beforeEach(() => {
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(false),
			});
		});

		it("should stop animation when dispose is called", () => {
			const config: AnimationConfig = {
				frames: ["A", "B", "C", "D", "E"],
				frameDurationMs: 100,
				finalIcon: "X",
			};

			const disposable = animator.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				config,
			);

			expect(mockStatusBarItem.text).toContain("A");
			vi.advanceTimersByTime(100);
			expect(mockStatusBarItem.text).toContain("B");

			// Dispose mid-animation
			disposable.dispose();

			// Advance timers - should not continue animation
			const textAtDispose = mockStatusBarItem.text;
			vi.advanceTimersByTime(300);
			expect(mockStatusBarItem.text).toBe(textAtDispose);
		});

		it("should restore final icon on dispose", () => {
			const config: AnimationConfig = {
				frames: ["⚡", "📷", "✓"],
				frameDurationMs: 150,
				finalIcon: "$(shield)",
			};

			const disposable = animator.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				config,
			);

			// Dispose before animation completes
			vi.advanceTimersByTime(150);
			disposable.dispose();

			// Should show final icon
			expect(mockStatusBarItem.text).toContain("$(shield)");
		});

		it("should clear all intervals on animator dispose", () => {
			const config: AnimationConfig = {
				frames: ["A", "B"],
				frameDurationMs: 100,
				finalIcon: "X",
			};

			// Start multiple animations
			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config);

			const mockItem2 = { ...mockStatusBarItem, text: "Item 2" };
			animator.animate(mockItem2 as unknown as vscode.StatusBarItem, config);

			// Dispose entire animator
			animator.dispose();

			// Advance timers - no animations should continue
			vi.advanceTimersByTime(500);

			// Items should not have changed after dispose
		});

		it("should not throw when disposing already-disposed animation", () => {
			const config: AnimationConfig = {
				frames: ["A", "B"],
				frameDurationMs: 100,
				finalIcon: "X",
			};

			const disposable = animator.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				config,
			);

			disposable.dispose();

			// Should not throw
			expect(() => disposable.dispose()).not.toThrow();
		});
	});

	// ==================== MEMORY LEAK PREVENTION ====================

	describe("memory leak prevention", () => {
		beforeEach(() => {
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(false),
			});
		});

		it("should not hold strong references to disposed items", () => {
			const config: AnimationConfig = {
				frames: ["A", "B"],
				frameDurationMs: 100,
				finalIcon: "X",
			};

			const disposable = animator.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				config,
			);

			disposable.dispose();

			// Internal state should be cleaned up
			expect(animator.getActiveAnimationCount()).toBe(0);
		});

		it("should track active animations count", () => {
			const config: AnimationConfig = {
				frames: ["A", "B"],
				frameDurationMs: 100,
				finalIcon: "X",
			};

			expect(animator.getActiveAnimationCount()).toBe(0);

			const d1 = animator.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				config,
			);
			expect(animator.getActiveAnimationCount()).toBe(1);

			const mockItem2 = { ...mockStatusBarItem, text: "Item 2" };
			const d2 = animator.animate(mockItem2 as unknown as vscode.StatusBarItem, config);
			expect(animator.getActiveAnimationCount()).toBe(2);

			d1.dispose();
			expect(animator.getActiveAnimationCount()).toBe(1);

			d2.dispose();
			expect(animator.getActiveAnimationCount()).toBe(0);
		});
	});

	// ==================== CONCURRENT ANIMATION HANDLING ====================

	describe("concurrent animation handling", () => {
		beforeEach(() => {
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(false),
			});
		});

		it("should cancel previous animation when new one starts on same item", () => {
			const config1: AnimationConfig = {
				frames: ["1", "2", "3", "4", "5"],
				frameDurationMs: 100,
				finalIcon: "OLD",
			};

			const config2: AnimationConfig = {
				frames: ["A", "B"],
				frameDurationMs: 100,
				finalIcon: "NEW",
			};

			// Start first animation
			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config1);
			expect(mockStatusBarItem.text).toContain("1");

			vi.advanceTimersByTime(100);
			expect(mockStatusBarItem.text).toContain("2");

			// Start second animation on same item - should cancel first
			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config2);
			expect(mockStatusBarItem.text).toContain("A");

			// Advance - should continue with second animation
			vi.advanceTimersByTime(100);
			expect(mockStatusBarItem.text).toContain("B");

			// Complete - should show NEW, not OLD
			vi.advanceTimersByTime(100);
			expect(mockStatusBarItem.text).toContain("NEW");
		});

		it("should allow different items to animate independently", () => {
			const config: AnimationConfig = {
				frames: ["A", "B", "C"],
				frameDurationMs: 100,
				finalIcon: "X",
			};

			const mockItem2 = { ...mockStatusBarItem, text: "Item 2" };

			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config);
			animator.animate(mockItem2 as unknown as vscode.StatusBarItem, config);

			// Both should be animating independently
			expect(animator.getActiveAnimationCount()).toBe(2);
		});
	});

	// ==================== PRESET ANIMATIONS ====================

	describe("preset animations", () => {
		it("should provide snapshot creation preset", () => {
			expect(ANIMATION_PRESETS.snapshotCreated).toBeDefined();
			expect(ANIMATION_PRESETS.snapshotCreated.frames).toContain("⚡");
			expect(ANIMATION_PRESETS.snapshotCreated.frames).toContain("✓");
		});

		it("should provide protection level change preset", () => {
			expect(ANIMATION_PRESETS.protectionChanged).toBeDefined();
			expect(ANIMATION_PRESETS.protectionChanged.frames.length).toBeGreaterThan(0);
		});

		it("should provide AI detection preset", () => {
			expect(ANIMATION_PRESETS.aiDetected).toBeDefined();
			expect(ANIMATION_PRESETS.aiDetected.frames).toContain("🤖");
		});

		it("should allow using presets directly", () => {
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(false),
			});

			animator.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				ANIMATION_PRESETS.snapshotCreated,
			);

			// Should start with first frame of preset
			expect(mockStatusBarItem.text).toContain(
				ANIMATION_PRESETS.snapshotCreated.frames[0],
			);
		});
	});

	// ==================== TELEMETRY INTEGRATION ====================

	describe("telemetry integration", () => {
		it("should emit animation_completed event", () => {
			const mockTelemetry = vi.fn();

			const animatorWithTelemetry = createStatusBarAnimator({
				onAnimationComplete: mockTelemetry,
			});

			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(false),
			});

			const config: AnimationConfig = {
				frames: ["A", "B"],
				frameDurationMs: 100,
				finalIcon: "X",
				animationType: "snapshot_created",
			};

			animatorWithTelemetry.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				config,
			);

			// Complete the animation
			vi.advanceTimersByTime(200);

			expect(mockTelemetry).toHaveBeenCalledWith({
				animationType: "snapshot_created",
				completed: true,
				skippedDueToReduceMotion: false,
			});
		});

		it("should emit skipped event when reduceMotion is enabled", () => {
			const mockTelemetry = vi.fn();

			const animatorWithTelemetry = createStatusBarAnimator({
				onAnimationComplete: mockTelemetry,
			});

			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(true), // reduceMotion enabled
			});

			const config: AnimationConfig = {
				frames: ["A", "B"],
				frameDurationMs: 100,
				finalIcon: "X",
				animationType: "protection_changed",
			};

			animatorWithTelemetry.animate(
				mockStatusBarItem as unknown as vscode.StatusBarItem,
				config,
			);

			expect(mockTelemetry).toHaveBeenCalledWith({
				animationType: "protection_changed",
				completed: true,
				skippedDueToReduceMotion: true,
			});
		});
	});

	// ==================== EDGE CASES ====================

	describe("edge cases", () => {
		beforeEach(() => {
			mockGetConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(false),
			});
		});

		it("should handle empty frames array", () => {
			const config: AnimationConfig = {
				frames: [],
				frameDurationMs: 100,
				finalIcon: "$(shield)",
			};

			// Should not throw
			expect(() => {
				animator.animate(
					mockStatusBarItem as unknown as vscode.StatusBarItem,
					config,
				);
			}).not.toThrow();

			// Should show final icon immediately
			expect(mockStatusBarItem.text).toContain("$(shield)");
		});

		it("should handle single frame", () => {
			const config: AnimationConfig = {
				frames: ["★"],
				frameDurationMs: 100,
				finalIcon: "$(shield)",
			};

			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config);

			expect(mockStatusBarItem.text).toContain("★");

			vi.advanceTimersByTime(100);
			expect(mockStatusBarItem.text).toContain("$(shield)");
		});

		it("should handle very short frame duration", () => {
			const config: AnimationConfig = {
				frames: ["A", "B", "C"],
				frameDurationMs: 10, // Very fast
				finalIcon: "X",
			};

			animator.animate(mockStatusBarItem as unknown as vscode.StatusBarItem, config);

			vi.advanceTimersByTime(30);
			expect(mockStatusBarItem.text).toContain("X");
		});

		it("should handle null/undefined status bar item gracefully", () => {
			const config: AnimationConfig = {
				frames: ["A", "B"],
				frameDurationMs: 100,
				finalIcon: "X",
			};

			// Should not throw
			expect(() => {
				animator.animate(null as unknown as vscode.StatusBarItem, config);
			}).not.toThrow();

			expect(() => {
				animator.animate(undefined as unknown as vscode.StatusBarItem, config);
			}).not.toThrow();
		});
	});
});

// ==================== TYPE TESTS ====================

describe("AnimationConfig types", () => {
	it("should require frames and finalIcon", () => {
		const validConfig: AnimationConfig = {
			frames: ["A", "B"],
			frameDurationMs: 100,
			finalIcon: "X",
		};
		expect(validConfig).toBeDefined();
	});

	it("should accept optional parameters", () => {
		const fullConfig: AnimationConfig = {
			frames: ["A", "B"],
			frameDurationMs: 100,
			finalIcon: "X",
			loop: true,
			animationType: "snapshot_created",
		};
		expect(fullConfig.loop).toBe(true);
		expect(fullConfig.animationType).toBe("snapshot_created");
	});
});
