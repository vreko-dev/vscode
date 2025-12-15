import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProtectionLevelSelector } from "@vscode/ui/ProtectionLevelSelector";

// vscode mock provided by setup.ts
describe("ProtectionLevelSelector", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("selectLevel", () => {
		it("should show quick pick with all protection levels", async () => {
			const mockItems = [
				{
					label: "🟢 Watch",
					description: "Silent auto-checkpoint on save",
					level: "watch",
				},
				{
					label: "🟡 Warn",
					description: "Notify before save with options",
					level: "warn",
				},
				{
					label: "🔴 Block",
					description: "Require checkpoint or explicit override",
					level: "block",
				},
			];

			(vscode.window.showQuickPick as any).mockResolvedValue(mockItems[1]);

			const result = await ProtectionLevelSelector.selectLevel();

			expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({
						label: expect.stringContaining("🟢"),
						level: "watch",
					}),
					expect.objectContaining({
						label: expect.stringContaining("🟡"),
						level: "warn",
					}),
					expect.objectContaining({
						label: expect.stringContaining("🔴"),
						level: "block",
					}),
				]),
				expect.objectContaining({
					placeHolder: "Select protection level for this file",
					title: "File Protection Level",
				}),
			);
			expect(result).toBe("warn");
		});

		it("should pre-select current level", async () => {
			const mockItems = [
				{
					label: "🟢 Watch",
					description: "Silent auto-checkpoint on save",
					level: "watch",
					picked: false,
				},
				{
					label: "🟡 Warn",
					description: "Notify before save with options",
					level: "warn",
					picked: true,
				},
				{
					label: "🔴 Block",
					description: "Require checkpoint or explicit override",
					level: "block",
					picked: false,
				},
			];

			(vscode.window.showQuickPick as any).mockResolvedValue(mockItems[1]);

			const result = await ProtectionLevelSelector.selectLevel("warn");

			expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({ level: "watch", picked: false }),
					expect.objectContaining({ level: "warn", picked: true }),
					expect.objectContaining({ level: "block", picked: false }),
				]),
				expect.any(Object),
			);
			expect(result).toBe("warn");
		});

		it("should return undefined when user cancels selection", async () => {
			(vscode.window.showQuickPick as any).mockResolvedValue(undefined);

			const result = await ProtectionLevelSelector.selectLevel();

			expect(result).toBeUndefined();
		});

		it("should handle all protection levels correctly", async () => {
			const levels: Array<"watch" | "warn" | "block"> = [
				"watch",
				"warn",
				"block",
			];

			for (const level of levels) {
				(vscode.window.showQuickPick as any).mockResolvedValueOnce({
					level,
				});
				const result = await ProtectionLevelSelector.selectLevel();
				expect(result).toBe(level);
			}
		});
	});

	describe("showBlockConfirmation", () => {
		it("should show block confirmation dialog with correct options", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Create Checkpoint",
			);

			const result =
				await ProtectionLevelSelector.showBlockConfirmation("test.ts");

			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				'🔴 File "test.ts" requires checkpoint before save',
				{
					modal: true,
					detail:
						"This file has BLOCK protection enabled. You must create a checkpoint or explicitly override protection to save changes.",
				},
				"Create Checkpoint",
				"Override Protection",
				"Cancel",
			);
			expect(result).toBe("checkpoint");
		});

		it("should return checkpoint when user selects Create Checkpoint", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Create Checkpoint",
			);
			const result =
				await ProtectionLevelSelector.showBlockConfirmation("file.ts");
			expect(result).toBe("checkpoint");
		});

		it("should return override when user selects Override Protection", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Override Protection",
			);
			const result =
				await ProtectionLevelSelector.showBlockConfirmation("file.ts");
			expect(result).toBe("override");
		});

		it("should return cancel when user selects Cancel", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue("Cancel");
			const result =
				await ProtectionLevelSelector.showBlockConfirmation("file.ts");
			expect(result).toBe("cancel");
		});

		it("should return cancel when user closes dialog", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(undefined);
			const result =
				await ProtectionLevelSelector.showBlockConfirmation("file.ts");
			expect(result).toBe("cancel");
		});

		it("should handle filenames with special characters", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Create Checkpoint",
			);
			const result = await ProtectionLevelSelector.showBlockConfirmation(
				"file with spaces & special@chars.ts",
			);
			expect(result).toBe("checkpoint");
		});
	});

	describe("showWarnPrompt", () => {
		it("should show warn prompt with correct options", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Create Checkpoint",
			);

			const result = await ProtectionLevelSelector.showWarnPrompt("test.ts");

			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				'🟡 Save "test.ts" with checkpoint?',
				{
					modal: false,
					detail:
						"This file has WARN protection. Creating a checkpoint is recommended before saving.",
				},
				"Create Checkpoint",
				"Skip Checkpoint",
				"Cancel",
			);
			expect(result).toBe("checkpoint");
		});

		it("should return checkpoint when user selects Create Checkpoint", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Create Checkpoint",
			);
			const result = await ProtectionLevelSelector.showWarnPrompt("file.ts");
			expect(result).toBe("checkpoint");
		});

		it("should return skip when user selects Skip Checkpoint", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Skip Checkpoint",
			);
			const result = await ProtectionLevelSelector.showWarnPrompt("file.ts");
			expect(result).toBe("skip");
		});

		it("should return cancel when user selects Cancel", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue("Cancel");
			const result = await ProtectionLevelSelector.showWarnPrompt("file.ts");
			expect(result).toBe("cancel");
		});

		it("should return cancel when user closes dialog", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(undefined);
			const result = await ProtectionLevelSelector.showWarnPrompt("file.ts");
			expect(result).toBe("cancel");
		});
	});

	describe("showLevelSetNotification", () => {
		it("should show information message for watch level", () => {
			ProtectionLevelSelector.showLevelSetNotification("test.ts", "watch");

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				'🟢 Protection set to Watch for "test.ts"',
			);
		});

		it("should show information message for warn level", () => {
			ProtectionLevelSelector.showLevelSetNotification("test.ts", "warn");

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				'🟡 Protection set to Warn for "test.ts"',
			);
		});

		it("should show information message for block level", () => {
			ProtectionLevelSelector.showLevelSetNotification("test.ts", "block");

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				'🔴 Protection set to Block for "test.ts"',
			);
		});

		it("should handle filenames with special characters", () => {
			ProtectionLevelSelector.showLevelSetNotification(
				"file with spaces.ts",
				"watch",
			);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				'🟢 Protection set to Watch for "file with spaces.ts"',
			);
		});
	});

	describe("showErrorNotification", () => {
		it("should show error message with operation and error details", () => {
			const error = new Error("Test error message");
			ProtectionLevelSelector.showErrorNotification(
				"set protection level",
				error,
			);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to set protection level: Test error message",
			);
		});

		it("should handle different error types", () => {
			const error = new Error("Network error");
			ProtectionLevelSelector.showErrorNotification("save checkpoint", error);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to save checkpoint: Network error",
			);
		});

		it("should handle errors with no message", () => {
			const error = new Error("");
			ProtectionLevelSelector.showErrorNotification("operation", error);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to operation: ",
			);
		});
	});

	describe("edge cases", () => {
		it("should handle empty filename", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Create Checkpoint",
			);
			const result = await ProtectionLevelSelector.showBlockConfirmation("");
			expect(result).toBe("checkpoint");
		});

		it("should handle very long filenames", async () => {
			const longFilename = `${"a".repeat(1000)}.ts`;
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Create Checkpoint",
			);
			const result =
				await ProtectionLevelSelector.showBlockConfirmation(longFilename);
			expect(result).toBe("checkpoint");
		});

		it("should handle unicode filenames", async () => {
			(vscode.window.showWarningMessage as any).mockResolvedValue(
				"Create Checkpoint",
			);
			const result =
				await ProtectionLevelSelector.showBlockConfirmation("файл.ts");
			expect(result).toBe("checkpoint");
		});
	});
});
