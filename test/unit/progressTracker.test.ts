import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProgressTracker } from "../../src/progressTracker";

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		withProgress: vi.fn(),
	},
}));

describe("ProgressTracker", () => {
	let progressTracker: ProgressTracker;

	beforeEach(() => {
		vi.clearAllMocks();
		progressTracker = new ProgressTracker();
	});

	it("should create a progress tracker instance", () => {
		expect(progressTracker).toBeDefined();
		expect(typeof progressTracker.startTracking).toBe("function");
		expect(typeof progressTracker.updateProgress).toBe("function");
		expect(typeof progressTracker.finishTracking).toBe("function");
	});

	it("should start tracking progress with VS Code progress API", async () => {
		const mockProgress = {
			report: vi.fn(),
		};

		// @ts-expect-error - Mocking VS Code window.withProgress
		const mockWithProgress = vi.fn().mockImplementation((_options, task) => {
			return task(mockProgress);
		});

		// @ts-expect-error - Mocking VS Code window
		const originalWithProgress = vscode.window.withProgress;
		// @ts-expect-error - Mocking VS Code window
		vscode.window.withProgress = mockWithProgress;

		const task = async () => {
			return "result";
		};

		const result = await progressTracker.startTracking(
			"Restoring files...",
			task,
		);

		expect(result).toBe("result");
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.withProgress).toHaveBeenCalledWith(
			{
				location: 15, // vscode.ProgressLocation.Notification
				title: "SnapBack: Restoring files...",
				cancellable: false,
			},
			expect.any(Function),
		);

		// @ts-expect-error - Mocking VS Code window
		vscode.window.withProgress = originalWithProgress;
	});

	it("should update progress with message and increment", () => {
		const mockProgress = {
			report: vi.fn(),
		};

		// @ts-expect-error - Accessing private property for testing
		progressTracker.currentProgress = mockProgress;

		progressTracker.updateProgress("Processing file 1 of 10", 10);

		expect(mockProgress.report).toHaveBeenCalledWith({
			message: "Processing file 1 of 10",
			increment: 10,
		});
	});

	it("should not update progress when no tracking is active", () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		progressTracker.updateProgress("Processing file 1 of 10", 10);

		expect(consoleSpy).toHaveBeenCalledWith("No active progress tracking");
		consoleSpy.mockRestore();
	});

	it("should finish tracking and clear current progress", async () => {
		const mockProgress = {
			report: vi.fn(),
		};

		// @ts-expect-error - Accessing private property for testing
		progressTracker.currentProgress = mockProgress;

		progressTracker.finishTracking();

		// @ts-expect-error - Accessing private property for testing
		expect(progressTracker.currentProgress).toBeNull();
	});
});
