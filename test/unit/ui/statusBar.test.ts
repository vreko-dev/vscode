import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
	type ProtectionState,
	StatusBarController,
} from "../../../src/ui/statusBar";

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		createStatusBarItem: vi.fn().mockReturnValue({
			text: "",
			tooltip: "",
			command: "",
			backgroundColor: undefined,
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		}),
	},
	StatusBarAlignment: {
		Left: 1,
		Right: 2,
	},
	ThemeColor: vi.fn().mockImplementation((id) => ({ id })),
	MarkdownString: vi.fn().mockImplementation((value) => {
		return {
			value,
			appendMarkdown: vi.fn(),
			supportHtml: false,
			isTrusted: false,
		};
	}),
}));

describe("StatusBarController", () => {
	let controller: StatusBarController;
	let mockStatusBarItem: any;
	let mockRegistry: any;

	beforeEach(() => {
		mockStatusBarItem = {
			text: "",
			tooltip: "",
			command: "",
			backgroundColor: undefined,
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		};

		(vscode.window.createStatusBarItem as any).mockReturnValue(
			mockStatusBarItem,
		);

		// Create mock registry
		mockRegistry = {
			list: vi.fn().mockResolvedValue([]),
			onDidChangeProtectedFiles: vi.fn(),
		};

		controller = new StatusBarController(mockRegistry);
	});

	afterEach(() => {
		vi.clearAllMocks();
		if (controller) {
			controller.dispose();
		}
	});

	describe("constructor", () => {
		it("should create status bar item with correct configuration", () => {
			expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
				vscode.StatusBarAlignment.Left,
				100,
			);
		});

		it("should set command for status bar item", () => {
			expect(mockStatusBarItem.command).toBe("snapback.showStatus");
		});

		it("should register for registry change events when registry provided", () => {
			expect(mockRegistry.onDidChangeProtectedFiles).toHaveBeenCalled();
		});

		it("should not register for registry change events when no registry provided", () => {
			mockRegistry.onDidChangeProtectedFiles.mockClear();
			const _controllerWithoutRegistry = new StatusBarController();
			expect(mockRegistry.onDidChangeProtectedFiles).not.toHaveBeenCalled();
		});
	});

	describe("formatStatusBar", () => {
		it("should format status bar with all zero counts", () => {
			const state: ProtectionState = {
				watched: 0,
				warnings: 0,
				protected: 0,
			};

			const formatted = StatusBarController.formatStatusBar(state);
			expect(formatted).toBe("SnapBack: 0 protected files (0 🟢, 0 🟡, 0 🔴)");
		});

		it("should format status bar with watched files only", () => {
			const state: ProtectionState = {
				watched: 5,
				warnings: 0,
				protected: 0,
			};

			const formatted = StatusBarController.formatStatusBar(state);
			expect(formatted).toBe("SnapBack: 5 protected files (5 🟢, 0 🟡, 0 🔴)");
		});

		it("should format status bar with warnings only", () => {
			const state: ProtectionState = {
				watched: 0,
				warnings: 3,
				protected: 0,
			};

			const formatted = StatusBarController.formatStatusBar(state);
			expect(formatted).toBe("SnapBack: 3 protected files (0 🟢, 3 🟡, 0 🔴)");
		});

		it("should format status bar with protected files only", () => {
			const state: ProtectionState = {
				watched: 0,
				warnings: 0,
				protected: 2,
			};

			const formatted = StatusBarController.formatStatusBar(state);
			expect(formatted).toBe("SnapBack: 2 protected files (0 🟢, 0 🟡, 2 🔴)");
		});

		it("should format status bar with all file types", () => {
			const state: ProtectionState = {
				watched: 10,
				warnings: 3,
				protected: 2,
			};

			const formatted = StatusBarController.formatStatusBar(state);
			expect(formatted).toBe(
				"SnapBack: 15 protected files (10 🟢, 3 🟡, 2 🔴)",
			);
		});

		it("should format status bar with single warning", () => {
			const state: ProtectionState = {
				watched: 5,
				warnings: 1,
				protected: 0,
			};

			const formatted = StatusBarController.formatStatusBar(state);
			expect(formatted).toBe("SnapBack: 6 protected files (5 🟢, 1 🟡, 0 🔴)");
		});

		it("should format status bar with single protected file", () => {
			const state: ProtectionState = {
				watched: 5,
				warnings: 0,
				protected: 1,
			};

			const formatted = StatusBarController.formatStatusBar(state);
			expect(formatted).toBe("SnapBack: 6 protected files (5 🟢, 0 🟡, 1 🔴)");
		});
	});

	describe("update", () => {
		it("should update status bar item with provided state when no registry", () => {
			// Create controller without registry to test legacy update method
			const controllerWithoutRegistry = new StatusBarController();

			const state: ProtectionState = {
				watched: 5,
				warnings: 2,
				protected: 1,
			};

			controllerWithoutRegistry.update(state);

			expect(mockStatusBarItem.text).toBe("🧢 SnapBack │ 5•2•1");
			expect(mockStatusBarItem.show).toHaveBeenCalled();
		});

		it("should set warning background color when protected files exist", () => {
			// Create controller without registry to test legacy update method
			const controllerWithoutRegistry = new StatusBarController();

			const state: ProtectionState = {
				watched: 5,
				warnings: 2,
				protected: 1,
			};

			controllerWithoutRegistry.update(state);

			expect(mockStatusBarItem.backgroundColor).toEqual({
				id: "statusBarItem.warningBackground",
			});
		});

		it("should not set background color when only watched files exist", () => {
			// Create controller without registry to test legacy update method
			const controllerWithoutRegistry = new StatusBarController();

			const state: ProtectionState = {
				watched: 5,
				warnings: 0,
				protected: 0,
			};

			controllerWithoutRegistry.update(state);

			expect(mockStatusBarItem.backgroundColor).toBeUndefined();
		});
	});

	describe("setProtectionStatus", () => {
		it("should update from registry when status is protected and registry exists", async () => {
			const mockFiles = [
				{ protectionLevel: "Watched" },
				{ protectionLevel: "Warning" },
				{ protectionLevel: "Protected" },
			];
			mockRegistry.list.mockResolvedValue(mockFiles);

			controller.setProtectionStatus("protected");

			// Wait for async operation
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(mockRegistry.list).toHaveBeenCalled();
		});

		it("should use fallback when status is protected but no registry exists", () => {
			const mockStatusBarItemWithoutRegistry = {
				text: "",
				tooltip: "",
				command: "",
				backgroundColor: undefined,
				show: vi.fn(),
				hide: vi.fn(),
				dispose: vi.fn(),
			};
			(vscode.window.createStatusBarItem as any).mockReturnValue(
				mockStatusBarItemWithoutRegistry,
			);
			const controllerWithoutRegistry = new StatusBarController();

			controllerWithoutRegistry.setProtectionStatus("protected");

			expect(mockStatusBarItemWithoutRegistry.text).toBe("🧢 SnapBack");
			expect(mockStatusBarItemWithoutRegistry.show).toHaveBeenCalled();
		});

		it("should use fallback for atRisk status", () => {
			controller.setProtectionStatus("atRisk");

			expect(mockStatusBarItem.text).toBe("🧢 SnapBack");
			expect(mockStatusBarItem.show).toHaveBeenCalled();
		});

		it("should use fallback for analyzing status", () => {
			controller.setProtectionStatus("analyzing");

			expect(mockStatusBarItem.text).toBe("🧢 SnapBack");
			expect(mockStatusBarItem.show).toHaveBeenCalled();
		});
	});

	describe("show and hide", () => {
		it("should show status bar item", () => {
			controller.show();
			expect(mockStatusBarItem.show).toHaveBeenCalled();
		});

		it("should hide status bar item", () => {
			controller.hide();
			expect(mockStatusBarItem.hide).toHaveBeenCalled();
		});
	});

	describe("dispose", () => {
		it("should dispose status bar item", () => {
			controller.dispose();
			expect(mockStatusBarItem.dispose).toHaveBeenCalled();
		});
	});

	describe("registry event handling", () => {
		it("should update from registry when registry changes", async () => {
			const mockFiles = [
				{ protectionLevel: "Watched" },
				{ protectionLevel: "Warning" },
				{ protectionLevel: "Protected" },
			];
			mockRegistry.list.mockResolvedValue(mockFiles);

			// Simulate registry change event
			const callback = mockRegistry.onDidChangeProtectedFiles.mock.calls[0][0];
			await callback();

			expect(mockRegistry.list).toHaveBeenCalled();
		});

		it("should handle empty registry", async () => {
			mockRegistry.list.mockResolvedValue([]);

			const callback = mockRegistry.onDidChangeProtectedFiles.mock.calls[0][0];
			await callback();

			expect(mockRegistry.list).toHaveBeenCalled();
			expect(mockStatusBarItem.text).toBe("🧢 SnapBack");
		});
	});

	describe("edge cases", () => {
		it("should handle very large file counts", () => {
			const state: ProtectionState = {
				watched: 1000000,
				warnings: 500000,
				protected: 100000,
			};

			const formatted = StatusBarController.formatStatusBar(state);
			expect(formatted).toContain("1600000 protected files");
			expect(formatted).toContain("1000000 🟢");
			expect(formatted).toContain("500000 🟡");
			expect(formatted).toContain("100000 🔴");
		});

		it("should handle dispose when already disposed", () => {
			controller.dispose();
			expect(() => controller.dispose()).not.toThrow();
		});
	});
});
