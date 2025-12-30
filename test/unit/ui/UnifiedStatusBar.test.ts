/**
 * UnifiedStatusBar Tests
 *
 * Tests for the consolidated single status bar item.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { UnifiedStatusBar, StatusBarState } from "../../../src/ui/UnifiedStatusBar";

describe("UnifiedStatusBar", () => {
	let statusBar: UnifiedStatusBar;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock object
	let mockStatusBarItem: any;

	beforeEach(() => {
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
		statusBar = new UnifiedStatusBar();
	});

	afterEach(() => {
		statusBar.dispose();
		vi.clearAllMocks();
	});

	// ===========================================================================
	// INITIALIZATION TESTS
	// ===========================================================================

	describe("initialization", () => {
		it("should create status bar item with correct properties", () => {
			// Uses ID-based API for stable ordering (per GitHub #177835)
			// Priority 1000 keeps it leftmost among SnapBack items
			expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
				"snapback.primary",
				vscode.StatusBarAlignment.Left,
				1000,
			);
		});

		it("should set command to open dashboard", () => {
			expect(mockStatusBarItem.command).toBe("snapback.openDashboard");
		});

		it("should default to PROTECTED state", () => {
			expect(mockStatusBarItem.text).toBe("🧢 Protected");
		});

		it("should show status bar item on creation", () => {
			expect(mockStatusBarItem.show).toHaveBeenCalled();
		});
	});

	// ===========================================================================
	// setState TESTS
	// ===========================================================================

	describe("setState", () => {
		it("should update text for PROTECTED state", () => {
			statusBar.setState(StatusBarState.PROTECTED);
			expect(mockStatusBarItem.text).toBe("🧢 Protected");
		});

		it("should update text for RECORDING state", () => {
			statusBar.setState(StatusBarState.RECORDING);
			expect(mockStatusBarItem.text).toBe("🧢 Recording...");
		});

		it("should update text for ACTIVITY state with count", () => {
			statusBar.setState(StatusBarState.ACTIVITY, { count: 5 });
			expect(mockStatusBarItem.text).toBe("🧢 5 saved");
		});

		it("should update text for ACTIVITY state with zero count", () => {
			statusBar.setState(StatusBarState.ACTIVITY, { count: 0 });
			expect(mockStatusBarItem.text).toBe("🧢 0 saved");
		});

		it("should update text for ACTIVITY state without count option", () => {
			statusBar.setState(StatusBarState.ACTIVITY);
			expect(mockStatusBarItem.text).toBe("🧢 0 saved");
		});

		it("should update text for ATTENTION state", () => {
			statusBar.setState(StatusBarState.ATTENTION);
			expect(mockStatusBarItem.text).toBe("🧢 Review");
		});

		it("should update text for DISABLED state", () => {
			statusBar.setState(StatusBarState.DISABLED);
			expect(mockStatusBarItem.text).toBe("🧢 Disabled");
		});

		it("should set warning background for RECORDING state", () => {
			statusBar.setState(StatusBarState.RECORDING);
			expect(mockStatusBarItem.backgroundColor).toBeInstanceOf(vscode.ThemeColor);
		});

		it("should set error background for ATTENTION state", () => {
			statusBar.setState(StatusBarState.ATTENTION);
			expect(mockStatusBarItem.backgroundColor).toBeInstanceOf(vscode.ThemeColor);
		});

		it("should clear background for PROTECTED state", () => {
			statusBar.setState(StatusBarState.ATTENTION);
			statusBar.setState(StatusBarState.PROTECTED);
			expect(mockStatusBarItem.backgroundColor).toBeUndefined();
		});

		it("should clear background for ACTIVITY state", () => {
			statusBar.setState(StatusBarState.RECORDING);
			statusBar.setState(StatusBarState.ACTIVITY, { count: 3 });
			expect(mockStatusBarItem.backgroundColor).toBeUndefined();
		});

		it("should clear background for DISABLED state", () => {
			statusBar.setState(StatusBarState.ATTENTION);
			statusBar.setState(StatusBarState.DISABLED);
			expect(mockStatusBarItem.backgroundColor).toBeUndefined();
		});
	});

	// ===========================================================================
	// TOOLTIP TESTS
	// ===========================================================================

	describe("tooltip", () => {
		it("should show correct tooltip for PROTECTED state", () => {
			statusBar.setState(StatusBarState.PROTECTED);
			expect(mockStatusBarItem.tooltip).toBe("SnapBack: All systems nominal. Click to open dashboard.");
		});

		it("should show correct tooltip for RECORDING state", () => {
			statusBar.setState(StatusBarState.RECORDING);
			expect(mockStatusBarItem.tooltip).toBe("SnapBack: Monitoring AI activity. Click to open dashboard.");
		});

		it("should include count in ACTIVITY tooltip", () => {
			statusBar.setState(StatusBarState.ACTIVITY, { count: 7 });
			expect(mockStatusBarItem.tooltip).toBe("SnapBack: 7 snapshots today. Click to open dashboard.");
		});

		it("should show correct tooltip for ATTENTION state", () => {
			statusBar.setState(StatusBarState.ATTENTION);
			expect(mockStatusBarItem.tooltip).toBe("SnapBack: Action recommended. Click to open dashboard.");
		});

		it("should show correct tooltip for DISABLED state", () => {
			statusBar.setState(StatusBarState.DISABLED);
			expect(mockStatusBarItem.tooltip).toBe("SnapBack: Protection disabled. Click to configure.");
		});
	});

	// ===========================================================================
	// getState TESTS
	// ===========================================================================

	describe("getState", () => {
		it("should return current state", () => {
			expect(statusBar.getState()).toBe(StatusBarState.PROTECTED);

			statusBar.setState(StatusBarState.RECORDING);
			expect(statusBar.getState()).toBe(StatusBarState.RECORDING);

			statusBar.setState(StatusBarState.ACTIVITY, { count: 5 });
			expect(statusBar.getState()).toBe(StatusBarState.ACTIVITY);
		});
	});

	// ===========================================================================
	// DISPOSE TESTS
	// ===========================================================================

	describe("dispose", () => {
		it("should dispose status bar item", () => {
			statusBar.dispose();
			expect(mockStatusBarItem.dispose).toHaveBeenCalled();
		});
	});

	// ===========================================================================
	// EDGE CASES
	// ===========================================================================

	describe("edge cases", () => {
		it("should handle rapid state changes", () => {
			statusBar.setState(StatusBarState.PROTECTED);
			statusBar.setState(StatusBarState.RECORDING);
			statusBar.setState(StatusBarState.ACTIVITY, { count: 10 });
			statusBar.setState(StatusBarState.ATTENTION);
			statusBar.setState(StatusBarState.DISABLED);

			expect(statusBar.getState()).toBe(StatusBarState.DISABLED);
			expect(mockStatusBarItem.text).toBe("🧢 Disabled");
		});

		it("should handle large snapshot counts", () => {
			statusBar.setState(StatusBarState.ACTIVITY, { count: 9999 });
			expect(mockStatusBarItem.text).toBe("🧢 9999 saved");
		});

		it("should maintain command through state changes", () => {
			statusBar.setState(StatusBarState.RECORDING);
			expect(mockStatusBarItem.command).toBe("snapback.openDashboard");

			statusBar.setState(StatusBarState.ATTENTION);
			expect(mockStatusBarItem.command).toBe("snapback.openDashboard");
		});
	});
});
