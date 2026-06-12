/**
 * ProtectionLevelHandler - Block Protection Enforcement Tests
 *
 * Verifies that BLOCK protection level actually prevents file saves:
 * - User dismisses confirmation dialog → save is blocked
 * - User cancels justification input → save is blocked
 * - Document contents are restored after cancellation
 * - CancellationError is properly thrown
 *
 * Critical for ensuring block protection works as advertised.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProtectionLevelHandler } from "../../../src/handlers/ProtectionLevelHandler";

// Mock SDK dependencies
vi.mock("@vreko-oss/sdk", () => ({
	SnapshotNamingStrategy: {
		generate: vi.fn(() => "test-snapshot-name"),
	},
}));

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
		showInputBox: vi.fn(),
		showQuickPick: vi.fn(),
		setStatusBarMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	workspace: {
		applyEdit: vi.fn(),
	},
	WorkspaceEdit: vi.fn(() => ({
		replace: vi.fn(),
	})),
	Range: vi.fn((start, end) => ({ start, end })),
	Position: vi.fn((line, char) => ({ line, character: char })),
	CancellationError: class CancellationError extends Error {
		constructor() {
			super("Cancelled");
			this.name = "CancellationError";
		}
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	},
}));

describe("ProtectionLevelHandler - Block Enforcement", () => {
	let handler: ProtectionLevelHandler;
	let mockRegistry: any;
	let mockOperationCoordinator: any;
	let mockCooldownService: any;
	let mockAuditLogger: any;
	let mockDocument: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock registry
		mockRegistry = {
			isProtected: vi.fn(() => true),
			getProtectionLevel: vi.fn(() => "block"),
			consumeTemporaryAllowance: vi.fn(),
		};

		// Mock operation coordinator
		mockOperationCoordinator = {
			executeOperation: vi.fn(),
		};

		// Mock cooldown service
		mockCooldownService = {
			isInCooldown: vi.fn(() => false),
			setCooldown: vi.fn(),
		};

		// Mock audit logger
		mockAuditLogger = {
			recordAudit: vi.fn(),
		};

		// Mock document
		mockDocument = {
			getText: vi.fn(() => "modified content"),
			uri: { fsPath: "/workspace/test.ts" },
		};

		// Mock workspace.applyEdit to succeed
		vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true);

		// Create handler instance
		handler = new ProtectionLevelHandler(
			mockRegistry,
			mockOperationCoordinator,
			mockCooldownService,
			mockAuditLogger,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================================================
	// Block Dialog Dismissal Tests
	// ============================================================================

	describe("Block Dialog Dismissal", () => {
		it("should block save when user dismisses confirmation dialog", async () => {
			// Arrange - user dismisses modal (returns undefined)
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";

			// Act & Assert - should throw CancellationError
			await expect(
				(handler as any).handleBlockLevel(
					filePath,
					"test.ts",
					preSaveContent,
					mockDocument,
					"block",
				),
			).rejects.toThrow(vscode.CancellationError);

			// Verify audit log recorded the block
			expect(mockAuditLogger.recordAudit).toHaveBeenCalledWith(
				filePath,
				"block",
				"save_blocked",
				expect.objectContaining({
					reason: "user_cancelled_block_dialog",
				}),
			);
		});

		it("should restore document contents when dialog is dismissed", async () => {
			// Arrange
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";
			mockDocument.getText.mockReturnValue("modified content");

			// Act
			try {
				await (handler as any).handleBlockLevel(
					filePath,
					"test.ts",
					preSaveContent,
					mockDocument,
					"block",
				);
			} catch (error) {
				// Expected to throw
			}

			// Assert - workspace.applyEdit should be called to restore
			expect(vscode.workspace.applyEdit).toHaveBeenCalled();
		});

		it("should show status message when block is cancelled", async () => {
			// Arrange
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";

			// Act
			try {
				await (handler as any).handleBlockLevel(
					filePath,
					"test.ts",
					preSaveContent,
					mockDocument,
					"block",
				);
			} catch (error) {
				// Expected to throw
			}

			// Assert
			expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
				expect.stringContaining("Save cancelled"),
				2000,
			);
		});
	});

	// ============================================================================
	// Justification Input Cancellation Tests
	// ============================================================================

	describe("Justification Input Cancellation", () => {
		it("should block save when user cancels justification input", async () => {
			// Arrange - user confirms dialog but cancels input
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Create Snapshot & Save" as any,
			);
			vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";

			// Act & Assert
			await expect(
				(handler as any).handleBlockLevel(
					filePath,
					"test.ts",
					preSaveContent,
					mockDocument,
					"block",
				),
			).rejects.toThrow(vscode.CancellationError);

			// Verify audit log
			expect(mockAuditLogger.recordAudit).toHaveBeenCalledWith(
				filePath,
				"block",
				"save_blocked",
				expect.objectContaining({
					reason: "user_cancelled_justification_input",
				}),
			);
		});

		it("should validate justification input length", async () => {
			// Arrange
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Create Snapshot & Save" as any,
			);

			let validateCallback: ((value: string) => string | null) | undefined;
			vi.mocked(vscode.window.showInputBox).mockImplementation((options: any) => {
				validateCallback = options.validateInput;
				return Promise.resolve("Valid justification");
			});

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";

			// Mock createSnapshotForFile to avoid errors
			vi.spyOn(handler as any, "createSnapshotForFile").mockResolvedValue("snap-123");

			// Act
			await (handler as any).handleBlockLevel(
				filePath,
				"test.ts",
				preSaveContent,
				mockDocument,
				"block",
			);

			// Assert - validation should reject short input
			expect(validateCallback).toBeDefined();
			expect(validateCallback!("test")).toBe("Please provide a reason (at least 5 characters)");
			expect(validateCallback!("valid reason here")).toBeNull();
		});
	});

	// ============================================================================
	// Document Restoration Tests
	// ============================================================================

	describe("Document Content Restoration", () => {
		it("should restore exact pre-save content", async () => {
			// Arrange
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

			const preSaveContent = "line 1\nline 2\nline 3";
			const modifiedContent = "line 1\nMODIFIED\nline 3";
			mockDocument.getText.mockReturnValue(modifiedContent);

			let capturedEdit: any;
			vi.mocked(vscode.workspace.applyEdit).mockImplementation((edit) => {
				capturedEdit = edit;
				return Promise.resolve(true);
			});

			// Act
			try {
				await (handler as any).handleBlockLevel(
					"/workspace/test.ts",
					"test.ts",
					preSaveContent,
					mockDocument,
					"block",
				);
			} catch (error) {
				// Expected
			}

			// Assert - workspace edit should replace with original content
			expect(capturedEdit).toBeDefined();
			expect(vscode.workspace.applyEdit).toHaveBeenCalled();
		});

		it("should not attempt restore if content unchanged", async () => {
			// Arrange
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

			const preSaveContent = "unchanged content";
			mockDocument.getText.mockReturnValue(preSaveContent);

			// Act
			try {
				await (handler as any).handleBlockLevel(
					"/workspace/test.ts",
					"test.ts",
					preSaveContent,
					mockDocument,
					"block",
				);
			} catch (error) {
				// Expected
			}

			// Assert - no edit should be applied since content is already correct
			expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
		});
	});

	// ============================================================================
	// SDK-Integrated Mode Tests (handleBlockModeExecution)
	// ============================================================================

	describe("SDK-Integrated Block Mode", () => {
		it("should enforce block via handleBlockModeExecution", async () => {
			// Arrange - user dismisses dialog
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

			const mockDecision = {
				shouldProceed: false,
				shouldSnapshot: true,
				reason: "block_protection",
			};

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";

			// Act & Assert
			await expect(
				(handler as any).handleBlockModeExecution(
					mockDecision,
					filePath,
					"test.ts",
					preSaveContent,
					mockDocument,
					"block",
				),
			).rejects.toThrow(vscode.CancellationError);
		});

		it("should allow save when user provides reason via QuickPick", async () => {
			// Arrange - user selects preset reason
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Create Snapshot & Save" as any,
			);
			vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
				label: "🐛 Fixing a bug",
				value: "bug-fix",
			} as any);

			const mockDecision = {
				shouldProceed: false,
				shouldSnapshot: true,
				reason: "block_protection",
			};

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";

			// Mock snapshot creation
			vi.spyOn(handler as any, "createSnapshotForFile").mockResolvedValue("snap-123");

			// Act
			const result = await (handler as any).handleBlockModeExecution(
				mockDecision,
				filePath,
				"test.ts",
				preSaveContent,
				mockDocument,
				"block",
			);

			// Assert
			expect(result.shouldProceed).toBe(true);
			expect(result.shouldSnapshot).toBe(true);
			expect(mockCooldownService.setCooldown).toHaveBeenCalled();
		});

		it("should handle custom reason input in SDK mode", async () => {
			// Arrange - user selects "Other" then provides custom reason
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Create Snapshot & Save" as any,
			);
			vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
				label: "✏️ Other...",
				value: "custom",
			} as any);
			vi.mocked(vscode.window.showInputBox).mockResolvedValue("Custom reason here");

			const mockDecision = {
				shouldProceed: false,
				shouldSnapshot: true,
				reason: "block_protection",
			};

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";

			// Mock snapshot creation
			vi.spyOn(handler as any, "createSnapshotForFile").mockResolvedValue("snap-123");

			// Act
			const result = await (handler as any).handleBlockModeExecution(
				mockDecision,
				filePath,
				"test.ts",
				preSaveContent,
				mockDocument,
				"block",
			);

			// Assert
			expect(result.shouldProceed).toBe(true);
			expect(result.shouldSnapshot).toBe(true);
			expect(vscode.window.showInputBox).toHaveBeenCalled();
		});
	});

	// ============================================================================
	// Snapshot Creation Failure Tests
	// ============================================================================

	describe("Snapshot Creation Failure", () => {
		it("should block save if snapshot creation fails", async () => {
			// Arrange
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Create Snapshot & Save" as any,
			);
			vi.mocked(vscode.window.showInputBox).mockResolvedValue("Valid reason");

			// Mock snapshot creation to fail
			vi.spyOn(handler as any, "createSnapshotForFile").mockRejectedValue(
				new Error("Snapshot failed"),
			);

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";

			// Act & Assert
			await expect(
				(handler as any).handleBlockLevel(
					filePath,
					"test.ts",
					preSaveContent,
					mockDocument,
					"block",
				),
			).rejects.toThrow(vscode.CancellationError);

			// Verify error was logged
			expect(mockAuditLogger.recordAudit).toHaveBeenCalledWith(
				filePath,
				"block",
				"save_blocked",
				expect.objectContaining({
					reason: "snapshot_creation_failed",
				}),
			);
		});

		it("should show error message when snapshot fails", async () => {
			// Arrange
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Create Snapshot & Save" as any,
			);
			vi.mocked(vscode.window.showInputBox).mockResolvedValue("Valid reason");

			vi.spyOn(handler as any, "createSnapshotForFile").mockRejectedValue(
				new Error("Disk full"),
			);

			const filePath = "/workspace/test.ts";
			const preSaveContent = "original content";

			// Act
			try {
				await (handler as any).handleBlockLevel(
					filePath,
					"test.ts",
					preSaveContent,
					mockDocument,
					"block",
				);
			} catch (error) {
				// Expected
			}

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Failed to create snapshot"),
			);
		});
	});

	// ============================================================================
	// Integration Verification Tests
	// ============================================================================

	describe("Integration Verification", () => {
		it("should complete full block enforcement flow", async () => {
			// Arrange - simulate full user flow
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
				"Create Snapshot & Save" as any,
			);
			vi.mocked(vscode.window.showInputBox).mockResolvedValue("Bug fix for auth issue");

			// Mock snapshot creation
			vi.spyOn(handler as any, "createSnapshotForFile").mockResolvedValue("snap-abc123");

			const filePath = "/workspace/auth.ts";
			const preSaveContent = "original auth code";

			// Act
			const result = await (handler as any).handleBlockLevel(
				filePath,
				"auth.ts",
				preSaveContent,
				mockDocument,
				"block",
			);

			// Assert complete flow
			expect(vscode.window.showWarningMessage).toHaveBeenCalled();
			expect(vscode.window.showInputBox).toHaveBeenCalled();
			expect(result.shouldProceed).toBe(true);
			expect(result.shouldSnapshot).toBe(true);
			expect(result.snapshotId).toBe("snap-abc123");
			expect(mockCooldownService.setCooldown).toHaveBeenCalled();
			expect(mockAuditLogger.recordAudit).toHaveBeenCalledWith(
				filePath,
				"block",
				"snapshot_created",
				expect.objectContaining({
					reason: "block_mode_confirmed",
					justification: "Bug fix for auth issue",
				}),
				"snap-abc123",
			);
		});
	});
});
