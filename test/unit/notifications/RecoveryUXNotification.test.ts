/**
 * RED TEST: Recovery UX Notification Component
 *
 * The viral moment piece - notification that says "AI tried to delete auth.ts - SnapBack protected it"
 * with View Diff, Restore, Share buttons.
 *
 * TDD Status: RED (failing - implementation does not exist yet)
 * Authority: @TDD_CORE.md - 4-path coverage required (Happy/Edge/Error/Sad)
 *
 * @package apps/vscode
 */

import * as path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock vscode at module level
const vscodeMock = {
	window: {
		showInformationMessage: vi.fn(),
		setStatusBarMessage: vi.fn(),
	},
	env: {
		clipboard: {
			writeText: vi.fn(),
		},
		openExternal: vi.fn(),
	},
	commands: {
		executeCommand: vi.fn(),
	},
	Uri: {
		parse: (uri: string) => ({ uri }),
	},
};

vi.doMock("vscode", () => vscodeMock);

// Now import the implementation
import { RecoveryUXNotification } from "../../../src/notifications/RecoveryUXNotification";

describe("RecoveryUXNotification", () => {
	let notification: RecoveryUXNotification;

	beforeEach(() => {
		vi.clearAllMocks();
		notification = new RecoveryUXNotification();
	});

	describe("🔴 RED: Happy Path - Complete notification flow", () => {
		it("should show information message with correct format when protection event fires", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue("View Diff");

			const event = {
				filePath: "/Users/user1/project/src/auth.ts",
				snapshotId: "snap-123",
				aiTool: "Cursor" as const,
				operationType: "delete",
			};

			await notification.showProtectionAlert(event);

			expect(vscodeMock.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("Cursor tried to delete auth.ts"),
				"View Diff",
				"Restore",
				"Share"
			);

			expect(vscodeMock.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("protected"),
				expect.anything(),
				expect.anything(),
				expect.anything()
			);
		});

		it("should execute snapback.showDiff command when View Diff is clicked", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue("View Diff");

			const event = {
				filePath: "/Users/user1/project/src/utils.ts",
				snapshotId: "snap-456",
				aiTool: "Copilot" as const,
				operationType: "overwrite",
			};

			await notification.showProtectionAlert(event);

			expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
				"snapback.showDiff",
				"snap-456"
			);
		});

		it("should execute snapback.restore command when Restore is clicked", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue("Restore");

			const event = {
				filePath: "/Users/user1/project/.env",
				snapshotId: "snap-789",
				aiTool: "Claude" as const,
				operationType: "delete",
			};

			await notification.showProtectionAlert(event);

			expect(vscodeMock.commands.executeCommand).toHaveBeenCalledWith(
				"snapback.restore",
				"snap-789"
			);
		});

		it("should copy share text to clipboard and offer Twitter link when Share is clicked", async () => {
			vscodeMock.window.showInformationMessage
				.mockResolvedValueOnce("Share")
				.mockResolvedValueOnce("Open Twitter");

			vscodeMock.env.clipboard.writeText.mockResolvedValue(undefined);
			vscodeMock.env.openExternal.mockResolvedValue(undefined);

			const event = {
				filePath: "/Users/user1/project/src/api.ts",
				snapshotId: "snap-000",
				aiTool: "Cursor" as const,
				operationType: "delete",
			};

			await notification.showProtectionAlert(event);

			expect(vscodeMock.env.clipboard.writeText).toHaveBeenCalledWith(
				expect.stringContaining("@SnapBackDev")
			);

			expect(vscodeMock.env.clipboard.writeText).toHaveBeenCalledWith(
				expect.stringContaining("api.ts")
			);
		});
	});

	describe("🟡 EDGE: Boundary conditions", () => {
		it("should handle unknown AI tool by using generic 'AI' label", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue(null);

			const event = {
				filePath: "/Users/user1/project/unknown.ts",
				snapshotId: "snap-edge-1",
				operationType: "delete",
			};

			await notification.showProtectionAlert(event);

			expect(vscodeMock.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("AI tried to delete"),
				expect.anything(),
				expect.anything(),
				expect.anything()
			);
		});

		it("should handle very long file paths by using only basename", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue(null);

			const event = {
				filePath: "/Users/user1/very/deep/nested/project/src/auth/strategies/oauth2/providers/google.ts",
				snapshotId: "snap-edge-2",
				aiTool: "Copilot" as const,
				operationType: "overwrite",
			};

			await notification.showProtectionAlert(event);

			const calls = vscodeMock.window.showInformationMessage.mock.calls;
			expect(calls[0][0]).toContain("google.ts");
			expect(calls[0][0]).not.toContain("/Users/user1/very/deep/nested");
		});

		it("should handle special characters in file names", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue(null);

			const event = {
				filePath: "/Users/user1/project/src/[id].test.tsx",
				snapshotId: "snap-edge-3",
				aiTool: "Cursor" as const,
				operationType: "delete",
			};

			await notification.showProtectionAlert(event);

			expect(vscodeMock.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("[id].test.tsx"),
				expect.anything(),
				expect.anything(),
				expect.anything()
			);
		});
	});

	describe("🔴 RED: Error Case - Service failures", () => {
		it("should gracefully handle window.showInformationMessage failure", async () => {
			vscodeMock.window.showInformationMessage.mockRejectedValue(
				new Error("Window API unavailable")
			);

			const event = {
				filePath: "/Users/user1/project/src/auth.ts",
				snapshotId: "snap-err-1",
				aiTool: "Cursor" as const,
				operationType: "delete",
			};

			await expect(notification.showProtectionAlert(event)).resolves.not.toThrow();
		});

		it("should gracefully handle clipboard write failure on Share", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue("Share");
			vscodeMock.env.clipboard.writeText.mockRejectedValue(
				new Error("Clipboard API failed")
			);

			const event = {
				filePath: "/Users/user1/project/src/auth.ts",
				snapshotId: "snap-err-2",
				aiTool: "Cursor" as const,
				operationType: "delete",
			};

			await expect(notification.showProtectionAlert(event)).resolves.not.toThrow();
		});

		it("should gracefully handle command execution failure", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue("View Diff");
			vscodeMock.commands.executeCommand.mockRejectedValue(
				new Error("Command not found")
			);

			const event = {
				filePath: "/Users/user1/project/src/auth.ts",
				snapshotId: "snap-err-3",
				aiTool: "Cursor" as const,
				operationType: "delete",
			};

			await expect(notification.showProtectionAlert(event)).resolves.not.toThrow();
		});
	});

	describe("🟡 RED: Sad Path - Invalid inputs", () => {
		it("should handle null event gracefully", async () => {
			const event = null;

			await expect((notification.showProtectionAlert as any)(event)).resolves.not.toThrow();
		});

		it("should handle missing snapshotId", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue(null);

			const event = {
				filePath: "/Users/user1/project/src/auth.ts",
				snapshotId: undefined as any,
				aiTool: "Cursor" as const,
				operationType: "delete",
			};

			await notification.showProtectionAlert(event);

			expect(vscodeMock.window.showInformationMessage).toHaveBeenCalled();
		});

		it("should handle empty filePath", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue(null);

			const event = {
				filePath: "",
				snapshotId: "snap-sad-2",
				aiTool: "Cursor" as const,
				operationType: "delete",
			};

			await expect(notification.showProtectionAlert(event)).resolves.not.toThrow();
		});

		it("should handle invalid operationType", async () => {
			vscodeMock.window.showInformationMessage.mockResolvedValue(null);

			const event = {
				filePath: "/Users/user1/project/src/auth.ts",
				snapshotId: "snap-sad-3",
				aiTool: "Cursor" as const,
				operationType: "unknown_operation" as any,
			};

			await notification.showProtectionAlert(event);

			expect(vscodeMock.window.showInformationMessage).toHaveBeenCalled();
		});
	});
});
