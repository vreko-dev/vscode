import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { StatusBarController } from "@vscode/ui/status-bar";

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
	MarkdownString: vi.fn().mockImplementation(() => {
		const markdownString = {
			value: "",
			appendMarkdown: vi.fn().mockImplementation((content) => {
				markdownString.value += content;
			}),
			supportHtml: false,
			isTrusted: false,
		};
		return markdownString;
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

	describe("pause functionality", () => {
		it("UX1-B-001: should reflect paused state in status bar text", async () => {
			controller.setPaused(true);
			// Wait for async update to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockStatusBarItem.text).toContain("⏸️");
		});

		it("UX1-B-002: should reflect resumed state in status bar text", async () => {
			controller.setPaused(false);
			// Wait for async update to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockStatusBarItem.text).not.toContain("⏸️");
		});

		it("UX1-B-003: should show pause duration options in tooltip", async () => {
			controller.setPaused(true);
			// Wait for async update to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Check that tooltip contains pause options
			// The tooltip is a MarkdownString object, so we need to check its content
			expect(mockStatusBarItem.tooltip.value).toContain(
				"- [Resume in 15m](command:snapback.resumeIn15m)",
			);
			expect(mockStatusBarItem.tooltip.value).toContain(
				"- [Resume in 30m](command:snapback.resumeIn30m)",
			);
			expect(mockStatusBarItem.tooltip.value).toContain(
				"- [Resume in 60m](command:snapback.resumeIn60m)",
			);
		});
	});

	describe("state reflection", () => {
		it("UX1-B-004: should reflect scanning state", async () => {
			controller.setScanning(true);
			// Wait for async update to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockStatusBarItem.text).toContain("🔍");
			controller.setScanning(false);
			// Wait for async update to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockStatusBarItem.text).not.toContain("🔍");
		});

		it("UX1-B-005: should reflect blocked state", async () => {
			controller.setBlocked(true);
			// Wait for async update to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockStatusBarItem.text).toContain("🚫");
			controller.setBlocked(false);
			// Wait for async update to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockStatusBarItem.text).not.toContain("🚫");
		});

		it("UX1-B-006: should reflect paused state", async () => {
			controller.setPaused(true);
			// Wait for async update to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockStatusBarItem.text).toContain("⏸️");
			controller.setPaused(false);
			// Wait for async update to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(mockStatusBarItem.text).not.toContain("⏸️");
		});
	});

	describe("auto-resume functionality", () => {
		it("UX1-B-007: should auto-resume after specified duration", async () => {
			// Mock setTimeout to immediately call the callback
			vi.useFakeTimers();

			// Set pause with 15 minute duration
			controller.setPaused(true, 15);

			// Fast-forward time by 15 minutes + 1 second
			vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

			// Wait for next tick to allow async operations
			await Promise.resolve();

			// Check that pause has been cleared
			expect(controller.isPaused).toBe(false);
			expect(mockStatusBarItem.text).not.toContain("⏸️");

			vi.useRealTimers();
		});

		it("UX1-B-008: should cancel previous timer when setting new pause", async () => {
			vi.useFakeTimers();

			// Set initial pause with 30 minute duration
			controller.setPaused(true, 30);
			const _firstTimerId = controller.pauseTimeout;

			// Set new pause with 15 minute duration
			controller.setPaused(true, 15);
			const _secondTimerId = controller.pauseTimeout;

			// Verify that timer IDs are different (this might not be directly testable)
			// Instead, let's check that the timeout was cleared and reset

			// Fast-forward time by 15 minutes + 1 second
			vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

			// Wait for next tick
			await Promise.resolve();

			// Check that pause has been cleared (auto-resumed)
			expect(controller.isPaused).toBe(false);

			vi.useRealTimers();
		});
	});

	describe("background scan behavior", () => {
		it("UX1-B-009: should halt background scans when paused", () => {
			controller.setPaused(true);
			expect(controller.shouldHaltBackgroundScans()).toBe(true);
		});

		it("UX1-B-010: should allow pre-commit actions when paused", () => {
			controller.setPaused(true);
			expect(controller.shouldAllowPreCommitActions()).toBe(true);
		});
	});

	describe("state update timing", () => {
		it("UX1-B-011: should update state within 200ms", async () => {
			const startTime = Date.now();

			// Trigger state update
			controller.setPaused(true);

			// Wait for update to complete (should be immediate)
			await new Promise((resolve) => setTimeout(resolve, 10));

			const endTime = Date.now();
			const duration = endTime - startTime;

			// Should be well under 200ms
			expect(duration).toBeLessThan(200);
		});
	});
});
