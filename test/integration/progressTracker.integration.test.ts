import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProgressTracker } from "../../src/progressTracker.js";

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		showQuickPick: vi.fn(),
		withProgress: vi
			.fn()
			.mockImplementation((_options, task) => task({ report: vi.fn() })),
	},
}));

describe("Progress Tracker Integration", () => {
	let progressTracker: ProgressTracker;

	beforeEach(() => {
		// Clear all mocks before each test
		vi.clearAllMocks();
		progressTracker = new ProgressTracker();
	});

	it("should track progress through VS Code API", async () => {
		const task = async () => {
			// Simulate some work
			progressTracker.updateProgress("Step 1", 25);
			await new Promise((resolve) => setTimeout(resolve, 10));
			progressTracker.updateProgress("Step 2", 50);
			await new Promise((resolve) => setTimeout(resolve, 10));
			progressTracker.updateProgress("Step 3", 75);
			await new Promise((resolve) => setTimeout(resolve, 10));
			progressTracker.updateProgress("Step 4", 100);
			return "completed";
		};

		const result = await progressTracker.startTracking("Test Operation", task);

		expect(result).toBe("completed");
		// @ts-expect-error - Mocking VS Code window
		expect(vscode.window.withProgress).toHaveBeenCalled();
	});
});
