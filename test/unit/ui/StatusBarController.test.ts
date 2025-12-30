/**
 * StatusBarController Tests
 *
 * Tests for the status bar state management controller.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { StatusBarController } from "../../../src/ui/StatusBarController";
import { StatusBarState } from "../../../src/ui/UnifiedStatusBar";

// Mock AIDetectionToast
const mockAIToastShow = vi.fn().mockResolvedValue(undefined);
const mockAIToastResetSession = vi.fn();

vi.mock("../../../src/notifications/AIDetectionToast", () => ({
	AIDetectionToast: class MockAIDetectionToast {
		show = mockAIToastShow;
		resetSession = mockAIToastResetSession;
	},
}));

describe("StatusBarController", () => {
	let controller: StatusBarController;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock object
	let mockStatusBarItem: any;

	beforeEach(() => {
		// Clear mocks
		mockAIToastShow.mockClear();
		mockAIToastResetSession.mockClear();

		// Capture the created status bar item
		vi.mocked(vscode.window.createStatusBarItem).mockImplementation(
			(id?: string, alignment?: vscode.StatusBarAlignment, priority?: number) => {
				mockStatusBarItem = {
					id,
					alignment,
					priority,
					text: "",
					tooltip: "",
					backgroundColor: undefined,
					command: undefined,
					show: vi.fn(),
					hide: vi.fn(),
					dispose: vi.fn(),
				};
				return mockStatusBarItem;
			},
		);
		controller = new StatusBarController();
	});

	afterEach(() => {
		controller.dispose();
		vi.clearAllMocks();
	});

	// ===========================================================================
	// STATE RESOLUTION TESTS
	// ===========================================================================

	describe("state resolution", () => {
		it("should resolve to PROTECTED as default", () => {
			expect(controller.getResolvedState()).toBe(StatusBarState.PROTECTED);
		});

		it("should resolve to DISABLED when extension disabled", () => {
			controller.setExtensionEnabled(false);
			expect(controller.getResolvedState()).toBe(StatusBarState.DISABLED);
		});

		it("should resolve to ATTENTION when needs attention", () => {
			controller.setNeedsAttention(true);
			expect(controller.getResolvedState()).toBe(StatusBarState.ATTENTION);
		});

		it("should resolve to RECORDING when recording", () => {
			controller.setRecording(true);
			expect(controller.getResolvedState()).toBe(StatusBarState.RECORDING);
		});

		it("should resolve to ACTIVITY when snapshots exist", () => {
			controller.setSnapshotCount(3);
			expect(controller.getResolvedState()).toBe(StatusBarState.ACTIVITY);
		});

		it("should not resolve to ACTIVITY when snapshot count is 0", () => {
			controller.setSnapshotCount(0);
			expect(controller.getResolvedState()).toBe(StatusBarState.PROTECTED);
		});
	});

	// ===========================================================================
	// STATE PRIORITY TESTS
	// ===========================================================================

	describe("state priority", () => {
		it("should resolve DISABLED over all others", () => {
			controller.setExtensionEnabled(false);
			controller.setNeedsAttention(true);
			controller.setRecording(true);
			controller.setSnapshotCount(5);

			expect(controller.getResolvedState()).toBe(StatusBarState.DISABLED);
		});

		it("should resolve ATTENTION over RECORDING", () => {
			controller.setNeedsAttention(true);
			controller.setRecording(true);
			controller.setSnapshotCount(5);

			expect(controller.getResolvedState()).toBe(StatusBarState.ATTENTION);
		});

		it("should resolve RECORDING over ACTIVITY", () => {
			controller.setRecording(true);
			controller.setSnapshotCount(5);

			expect(controller.getResolvedState()).toBe(StatusBarState.RECORDING);
		});

		it("should resolve ACTIVITY over PROTECTED", () => {
			controller.setSnapshotCount(5);

			expect(controller.getResolvedState()).toBe(StatusBarState.ACTIVITY);
		});
	});

	// ===========================================================================
	// STATE OPTIONS TESTS
	// ===========================================================================

	describe("state options", () => {
		it("should include count in options", () => {
			controller.setSnapshotCount(7);
			expect(controller.getStateOptions()).toEqual({ count: 7 });
		});

		it("should default count to 0", () => {
			expect(controller.getStateOptions()).toEqual({ count: 0 });
		});
	});

	// ===========================================================================
	// STATUS BAR UPDATE TESTS
	// ===========================================================================

	describe("status bar updates", () => {
		it("should update status bar text for PROTECTED", () => {
			expect(mockStatusBarItem.text).toBe("🧢 Protected");
		});

		it("should update status bar text for DISABLED", () => {
			controller.setExtensionEnabled(false);
			expect(mockStatusBarItem.text).toBe("🧢 Disabled");
		});

		it("should update status bar text for ATTENTION", () => {
			controller.setNeedsAttention(true);
			expect(mockStatusBarItem.text).toBe("🧢 Review");
		});

		it("should update status bar text for RECORDING", () => {
			controller.setRecording(true);
			expect(mockStatusBarItem.text).toBe("🧢 Recording...");
		});

		it("should update status bar text for ACTIVITY with count", () => {
			controller.setSnapshotCount(5);
			expect(mockStatusBarItem.text).toBe("🧢 5 saved");
		});
	});

	// ===========================================================================
	// SESSION RESET TESTS
	// ===========================================================================

	describe("session reset", () => {
		it("should reset recording state", () => {
			controller.setRecording(true);
			expect(controller.getResolvedState()).toBe(StatusBarState.RECORDING);

			controller.resetSession();
			expect(controller.getResolvedState()).toBe(StatusBarState.PROTECTED);
		});

		it("should reset attention state", () => {
			controller.setNeedsAttention(true);
			expect(controller.getResolvedState()).toBe(StatusBarState.ATTENTION);

			controller.resetSession();
			expect(controller.getResolvedState()).toBe(StatusBarState.PROTECTED);
		});

		it("should not reset snapshot count", () => {
			controller.setSnapshotCount(5);
			controller.resetSession();
			expect(controller.getStateOptions()).toEqual({ count: 5 });
		});

		it("should update status bar after reset", () => {
			controller.setRecording(true);
			expect(mockStatusBarItem.text).toBe("🧢 Recording...");

			controller.resetSession();
			expect(mockStatusBarItem.text).toBe("🧢 Protected");
		});
	});

	// ===========================================================================
	// AI DETECTION TESTS
	// ===========================================================================

	describe("AI detection", () => {
		it("should delegate to AIDetectionToast", async () => {
			const signals = [{ type: "burst", confidence: 0.9 }];

			await controller.handleAIDetection(signals);

			expect(mockAIToastShow).toHaveBeenCalledWith(signals);
		});

		it("should call resetSession on toast when resetting session", () => {
			controller.resetSession();

			expect(mockAIToastResetSession).toHaveBeenCalled();
		});
	});

	// ===========================================================================
	// DISPOSE TESTS
	// ===========================================================================

	describe("dispose", () => {
		it("should dispose status bar", () => {
			controller.dispose();
			expect(mockStatusBarItem.dispose).toHaveBeenCalled();
		});
	});

	// ===========================================================================
	// EDGE CASES
	// ===========================================================================

	describe("edge cases", () => {
		it("should handle rapid state changes", () => {
			controller.setExtensionEnabled(true);
			controller.setNeedsAttention(true);
			controller.setNeedsAttention(false);
			controller.setRecording(true);
			controller.setSnapshotCount(10);

			expect(controller.getResolvedState()).toBe(StatusBarState.RECORDING);
		});

		it("should handle toggling extension enabled", () => {
			controller.setSnapshotCount(5);

			controller.setExtensionEnabled(false);
			expect(controller.getResolvedState()).toBe(StatusBarState.DISABLED);

			controller.setExtensionEnabled(true);
			expect(controller.getResolvedState()).toBe(StatusBarState.ACTIVITY);
		});

		it("should handle large snapshot counts", () => {
			controller.setSnapshotCount(9999);
			expect(mockStatusBarItem.text).toBe("🧢 9999 saved");
		});
	});
});
