import { afterEach, beforeEach, describe, it, vi } from "vitest";
import * as vscode from "vscode";
import { SnapBackDialogs } from "@vscode/ui/dialogs";

// Mock VS Code API
vi.mock("vscode", () => {
	return {
		window: {
			showErrorMessage: vi.fn(),
			showInputBox: vi.fn(),
			showWarningMessage: vi.fn(),
		},
	};
});

describe("Dialogs Accessibility", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("showBlockDialog", () => {
		it("should display modal dialog with proper ARIA labels", async () => {
			const mockOptions = {
				fileName: "test.ts",
				filePath: "/path/to/test.ts",
				protectionLevel: "Block",
				riskScore: 8,
				reasons: ["High risk pattern detected"],
				diagnosticMessage: "Potential security vulnerability",
			};

			// Mock the VS Code dialog response
			(vscode.window.showErrorMessage as any).mockResolvedValue(
				"Create Snapshot & Continue",
			);

			const result = await SnapBackDialogs.showBlockDialog(mockOptions);

			// Verify dialog was called with correct parameters
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Save blocked for test.ts (Block level)",
				{
					modal: true,
					detail: expect.stringContaining(
						"Issue: Potential security vulnerability",
					),
				},
				"Continue",
				"Create Snapshot & Continue",
				"Cancel Save",
			);

			expect(result).toBe("createSnapshot");
		});

		it("should include all relevant information in dialog detail", async () => {
			const mockOptions = {
				fileName: "config.json",
				filePath: "/project/config.json",
				protectionLevel: "Block",
				riskScore: 9,
				reasons: ["Secret detected", "External API key"],
				diagnosticMessage: "Hardcoded API key found",
			};

			(vscode.window.showErrorMessage as any).mockResolvedValue("Continue");

			await SnapBackDialogs.showBlockDialog(mockOptions);

			const callArgs = (vscode.window.showErrorMessage as any).mock.calls[0];
			const detail = callArgs[1].detail;

			// Verify all information is included
			expect(detail).toContain("Issue: Hardcoded API key found");
			expect(detail).toContain("Risk Score: 9/10");
			expect(detail).toContain("Reasons: Secret detected, External API key");
			expect(detail).toContain("Choose an action:");
		});

		it("should handle missing optional fields gracefully", async () => {
			const mockOptions = {
				fileName: "test.ts",
				filePath: "/path/to/test.ts",
				protectionLevel: "Block",
				// Missing riskScore, reasons, and diagnosticMessage
			};

			(vscode.window.showErrorMessage as any).mockResolvedValue("Cancel Save");

			const result = await SnapBackDialogs.showBlockDialog(mockOptions);

			const callArgs = (vscode.window.showErrorMessage as any).mock.calls[0];
			const detail = callArgs[1].detail;

			// Should not contain empty lines for missing fields
			expect(detail).not.toContain("Issue: undefined");
			expect(detail).not.toContain("Risk Score: undefined");
			expect(detail).not.toContain("Reasons: undefined");

			expect(result).toBe("cancel");
		});
	});

	describe("showOverrideDialog", () => {
		it("should display input box with proper validation", async () => {
			const mockOptions = {
				fileName: "test.ts",
				filePath: "/path/to/test.ts",
				protectionLevel: "Block",
				riskScore: 7,
				reasons: ["Pattern match"],
				diagnosticMessage: "Suspicious code pattern",
			};

			// Mock the VS Code input box response
			(vscode.window.showInputBox as any).mockResolvedValue(
				"This is a safe change for testing purposes",
			);

			const result = await SnapBackDialogs.showOverrideDialog(mockOptions);

			// Verify input box was called with correct parameters
			expect(vscode.window.showInputBox).toHaveBeenCalledWith({
				prompt: "Enter justification for overriding this protection",
				placeHolder: "Briefly explain why this change is safe...",
				ignoreFocusOut: true,
				validateInput: expect.any(Function),
			});

			expect(result).toEqual({
				action: "override",
				justification: "This is a safe change for testing purposes",
			});
		});

		it("should validate input length", async () => {
			const mockOptions = {
				fileName: "test.ts",
				filePath: "/path/to/test.ts",
				protectionLevel: "Block",
			};

			// Get the validateInput function from the mock call
			(vscode.window.showInputBox as any).mockImplementation(
				async (options: any) => {
					const validate = options.validateInput;

					// Test validation
					expect(validate("")).toBe(
						"Justification must be at least 5 characters",
					);
					expect(validate("abc")).toBe(
						"Justification must be at least 5 characters",
					);
					expect(validate("abcde")).toBeNull();
					expect(validate("This is a valid justification")).toBeNull();

					return "Valid justification";
				},
			);

			const result = await SnapBackDialogs.showOverrideDialog(mockOptions);

			expect(result).toEqual({
				action: "override",
				justification: "Valid justification",
			});
		});

		it("should handle cancellation", async () => {
			const mockOptions = {
				fileName: "test.ts",
				filePath: "/path/to/test.ts",
				protectionLevel: "Block",
			};

			// Mock cancellation (empty response)
			(vscode.window.showInputBox as any).mockResolvedValue(undefined);

			const result = await SnapBackDialogs.showOverrideDialog(mockOptions);

			expect(result).toEqual({ action: "cancel" });
		});
	});

	describe("showAccessibilityWarning", () => {
		it("should display warning message with modal option", async () => {
			const testMessage = "This action may not be accessible";

			await SnapBackDialogs.showAccessibilityWarning(testMessage);

			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				testMessage,
				{ modal: true },
			);
		});
	});

	describe("ARIA Compliance", () => {
		it("should use semantic button labels", async () => {
			const mockOptions = {
				fileName: "test.ts",
				filePath: "/path/to/test.ts",
				protectionLevel: "Block",
			};

			(vscode.window.showErrorMessage as any).mockResolvedValue("Continue");

			await SnapBackDialogs.showBlockDialog(mockOptions);

			const callArgs = (vscode.window.showErrorMessage as any).mock.calls[0];

			// Verify standardized button labels
			expect(callArgs[2]).toBe("Continue");
			expect(callArgs[3]).toBe("Create Snapshot & Continue");
			expect(callArgs[4]).toBe("Cancel Save");
		});

		it("should provide descriptive dialog titles", async () => {
			const mockOptions = {
				fileName: "critical-config.json",
				filePath: "/project/critical-config.json",
				protectionLevel: "Block",
			};

			(vscode.window.showErrorMessage as any).mockResolvedValue("Cancel Save");

			await SnapBackDialogs.showBlockDialog(mockOptions);

			const callArgs = (vscode.window.showErrorMessage as any).mock.calls[0];

			// Verify descriptive main message
			expect(callArgs[0]).toBe(
				"Save blocked for critical-config.json (Block level)",
			);
		});
	});
});
