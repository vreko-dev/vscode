/**
 * @fileoverview ClusterRestoreHandler Unit Tests - Atomic Restore Testing
 *
 * Tests P1-9 / J3-E08: "Cluster partial lock - Some files locked = inconsistent"
 *
 * Key test scenarios:
 * - Atomic guarantee: If any file fails pre-flight, none should change
 * - Pre-flight checks detect locked/permission issues before write
 * - WorkspaceEdit batches all changes atomically
 * - Utility function converts snapshot contents correctly
 */

import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// Mock local logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import after mocks
import {
	ClusterRestoreHandler,
	snapshotContentsToRestoreFiles,
	type RestoreFile,
} from "../../../src/restore/ClusterRestoreHandler";

describe("ClusterRestoreHandler - Atomic Restore (P1-9 / J3-E08)", () => {
	let handler: ClusterRestoreHandler;
	let mockApplyEdit: ReturnType<typeof vi.fn>;
	let mockFsAccess: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		handler = new ClusterRestoreHandler();

		// Mock vscode.workspace.applyEdit
		mockApplyEdit = vi.fn().mockResolvedValue(true);
		vi.spyOn(vscode.workspace, "applyEdit").mockImplementation(mockApplyEdit);

		// Mock fs.access for pre-flight checks
		mockFsAccess = vi.fn().mockResolvedValue(undefined);
		vi.spyOn(fs, "access").mockImplementation(mockFsAccess);

		// Mock fs.open for lock checks
		vi.spyOn(fs, "open").mockRejectedValue({ code: "ENOENT" }); // File doesn't exist
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// HAPPY PATH - All files writable, restore succeeds atomically
	// ═══════════════════════════════════════════════════════════════════════════
	describe("Happy Path - Atomic Restore Success", () => {
		it("should restore all files atomically using WorkspaceEdit", async () => {
			const files: RestoreFile[] = [
				{ relativePath: "src/file1.ts", content: "content1" },
				{ relativePath: "src/file2.ts", content: "content2" },
				{ relativePath: "lib/file3.ts", content: "content3" },
			];

			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files,
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.filesRestored).toBe(3);
				expect(result.value.restoredPaths).toEqual([
					"src/file1.ts",
					"src/file2.ts",
					"lib/file3.ts",
				]);
				expect(result.value.dryRun).toBe(false);
			}

			// WorkspaceEdit should be called once with all files batched
			expect(mockApplyEdit).toHaveBeenCalledTimes(1);
		});

		it("should pass pre-flight checks when all files are writable", async () => {
			const files: RestoreFile[] = [
				{ relativePath: "src/file1.ts", content: "content1" },
			];

			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files,
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.preFlightResult?.passed).toBe(true);
				expect(result.value.preFlightResult?.failures).toHaveLength(0);
			}
		});

		it("should support dry run mode without applying changes", async () => {
			const files: RestoreFile[] = [
				{ relativePath: "src/file1.ts", content: "content1" },
			];

			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files,
				dryRun: true,
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.dryRun).toBe(true);
				expect(result.value.filesRestored).toBe(0);
			}

			// WorkspaceEdit should NOT be called in dry run
			expect(mockApplyEdit).not.toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// CRITICAL: J3-E08 - If any file fails, none should change
	// ═══════════════════════════════════════════════════════════════════════════
	describe("J3-E08: Atomic Failure - If any file fails, none should change", () => {
		it("should abort restore if any file is locked (pre-flight failure)", async () => {
			// First file is OK, second file is locked (EBUSY)
			mockFsAccess
				.mockResolvedValueOnce(undefined) // Parent dir check
				.mockResolvedValueOnce(undefined) // File 1 writable
				.mockResolvedValueOnce(undefined) // Parent dir check
				.mockRejectedValueOnce({ code: "EBUSY", message: "Resource busy" }); // File 2 locked

			const files: RestoreFile[] = [
				{ relativePath: "src/file1.ts", content: "content1" },
				{ relativePath: "src/file2.ts", content: "content2" },
			];

			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toContain("Pre-flight check failed");
				expect(result.error.failures).toHaveLength(1);
				expect(result.error.failures[0].reason).toBe("file_locked");
			}

			// CRITICAL: WorkspaceEdit should NOT be called if pre-flight fails
			expect(mockApplyEdit).not.toHaveBeenCalled();
		});

		it("should abort restore if any file has permission denied", async () => {
			mockFsAccess
				.mockResolvedValueOnce(undefined) // Parent dir check
				.mockRejectedValueOnce({ code: "EACCES", message: "Permission denied" });

			const files: RestoreFile[] = [
				{ relativePath: "protected/secret.ts", content: "content" },
			];

			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.failures[0].reason).toBe("permission_denied");
			}

			expect(mockApplyEdit).not.toHaveBeenCalled();
		});

		it("should abort restore if parent directory cannot be created", async () => {
			mockFsAccess
				.mockRejectedValueOnce({ code: "ENOENT" }) // Parent dir doesn't exist
				.mockRejectedValueOnce({ code: "EACCES" }); // Can't create parent

			const files: RestoreFile[] = [
				{ relativePath: "new/nested/file.ts", content: "content" },
			];

			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.failures[0].reason).toBe("parent_dir_missing");
			}

			expect(mockApplyEdit).not.toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// ERROR PATH - WorkspaceEdit failures
	// ═══════════════════════════════════════════════════════════════════════════
	describe("Error Path - WorkspaceEdit Failures", () => {
		it("should handle WorkspaceEdit.applyEdit returning false", async () => {
			mockApplyEdit.mockResolvedValue(false); // WorkspaceEdit failed

			const files: RestoreFile[] = [
				{ relativePath: "src/file1.ts", content: "content1" },
			];

			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toContain("failed to apply");
			}
		});

		it("should handle WorkspaceEdit throwing an error", async () => {
			mockApplyEdit.mockRejectedValue(new Error("VS Code internal error"));

			const files: RestoreFile[] = [
				{ relativePath: "src/file1.ts", content: "content1" },
			];

			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.message).toContain("VS Code internal error");
			}
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// EDGE CASES
	// ═══════════════════════════════════════════════════════════════════════════
	describe("Edge Cases", () => {
		it("should handle empty file list gracefully", async () => {
			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files: [],
			});

			// Empty list should still succeed (nothing to do)
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.filesRestored).toBe(0);
			}
		});

		it("should skip pre-flight checks when skipPreFlightChecks is true", async () => {
			const files: RestoreFile[] = [
				{ relativePath: "src/file1.ts", content: "content1" },
			];

			const result = await handler.restore({
				workspaceRoot: "/test/workspace",
				files,
				skipPreFlightChecks: true,
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.preFlightResult).toBeUndefined();
			}
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe("snapshotContentsToRestoreFiles - Content Parsing", () => {
	it("should convert plain text content", () => {
		const contents = {
			"file1.ts": "plain text content",
			"file2.ts": "more content",
		};

		const files = snapshotContentsToRestoreFiles(contents);

		expect(files).toHaveLength(2);
		expect(files[0]).toEqual({
			relativePath: "file1.ts",
			content: "plain text content",
		});
	});

	it("should handle JSON-stringified content with content field", () => {
		const contents = {
			"file1.ts": JSON.stringify({ content: "actual content" }),
		};

		const files = snapshotContentsToRestoreFiles(contents);

		expect(files).toHaveLength(1);
		expect(files[0].content).toBe("actual content");
	});

	it("should handle invalid JSON gracefully", () => {
		const contents = {
			"file1.ts": "{ invalid json",
		};

		const files = snapshotContentsToRestoreFiles(contents);

		expect(files).toHaveLength(1);
		expect(files[0].content).toBe("{ invalid json");
	});

	it("should filter by provided paths", () => {
		const contents = {
			"file1.ts": "content1",
			"file2.ts": "content2",
			"file3.ts": "content3",
		};

		const files = snapshotContentsToRestoreFiles(contents, ["file1.ts", "file3.ts"]);

		expect(files).toHaveLength(2);
		expect(files.map((f) => f.relativePath)).toEqual(["file1.ts", "file3.ts"]);
	});

	it("should return empty array for empty contents", () => {
		const files = snapshotContentsToRestoreFiles({});

		expect(files).toHaveLength(0);
	});
});
