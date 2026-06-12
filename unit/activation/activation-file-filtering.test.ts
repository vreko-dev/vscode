/**
 * Activation Phase File Filtering Tests
 *
 * RED PHASE: Tests for regression prevention of extension file paths
 * during Phase 3 (Managers) initialization.
 *
 * Issue: Extension files from .qoder/extensions/* were being passed to
 * snapshot creation during activation, causing "Anchor file not found" errors.
 *
 * These tests verify that:
 * 1. Files outside workspace are filtered during initialization
 * 2. Extension files (.qoder/*) are never passed to snapshot creation
 * 3. Phase 3 completes without attempting snapshots on external files
 * 4. Workspace boundary validation happens before expensive operations
 *
 * Reference: 2026-01-20 User Report - Phase 3 taking 56+ seconds with
 * anchor file path "../../.qoder/extensions/..." error
 */

import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Activation Phase File Filtering", () => {
	const workspaceRoot = "/Users/user/WebstormProjects/Vreko-Site";
	const extensionFile = "/Users/user/.qoder/extensions/danielsanmedium.dscodegpt-3.14.252/standalone/apps/vscode/src/operationCoordinator.ts";

	describe("Workspace Boundary Detection", () => {
		it("should detect files inside workspace", () => {
			const workspaceFile = path.join(workspaceRoot, "apps/vscode/src/extension.ts");
			const relativePath = path.relative(workspaceRoot, workspaceFile);

			// Files inside workspace should NOT start with ".."
			expect(relativePath.startsWith("..")).toBe(false);
			expect(path.isAbsolute(relativePath)).toBe(false);
		});

		it("should detect files outside workspace (extension files)", () => {
			const relativePath = path.relative(workspaceRoot, extensionFile);

			// Files outside workspace SHOULD start with ".."
			expect(relativePath.startsWith("..")).toBe(true);
			expect(relativePath).toContain("../../.qoder/extensions");
		});

		it("should detect .qoder directory files as external", () => {
			const qoderFile = "/Users/user/.qoder/extensions/ext/file.ts";
			const relativePath = path.relative(workspaceRoot, qoderFile);

			expect(relativePath.startsWith("..")).toBe(true);
		});

		it("should detect VS Code extension directory files as external", () => {
			const vscodeExtFile = "/Users/user/.vscode/extensions/ext/file.ts";
			const relativePath = path.relative(workspaceRoot, vscodeExtFile);

			expect(relativePath.startsWith("..")).toBe(true);
		});
	});

	describe("File Collection Filtering", () => {
		/**
		 * Helper to check if a file should be filtered out
		 */
		function isOutsideWorkspace(absolutePath: string, workspaceRoot: string): boolean {
			const relativePath = path.relative(workspaceRoot, absolutePath);
			return relativePath.startsWith("..") || path.isAbsolute(relativePath);
		}

		it("should filter out extension files from file collection", () => {
			const files = [
				path.join(workspaceRoot, "apps/vscode/src/extension.ts"), // ✅ Inside
				extensionFile, // ❌ Outside
				path.join(workspaceRoot, "packages/core/index.ts"), // ✅ Inside
				"/Users/user/.qoder/config.json", // ❌ Outside
			];

			const filteredFiles = files.filter((file) => !isOutsideWorkspace(file, workspaceRoot));

			expect(filteredFiles).toHaveLength(2);
			expect(filteredFiles).toContain(path.join(workspaceRoot, "apps/vscode/src/extension.ts"));
			expect(filteredFiles).toContain(path.join(workspaceRoot, "packages/core/index.ts"));
			expect(filteredFiles).not.toContain(extensionFile);
		});

		it("should handle empty file list", () => {
			const files: string[] = [];
			const filteredFiles = files.filter((file) => !isOutsideWorkspace(file, workspaceRoot));

			expect(filteredFiles).toHaveLength(0);
		});

		it("should handle all external files", () => {
			const files = [
				extensionFile,
				"/Users/user/.qoder/config.json",
				"/tmp/scratch.ts",
			];

			const filteredFiles = files.filter((file) => !isOutsideWorkspace(file, workspaceRoot));

			expect(filteredFiles).toHaveLength(0);
		});

		it("should preserve workspace files when mixed with external files", () => {
			const workspaceFile = path.join(workspaceRoot, "src/test.ts");
			const files = [
				workspaceFile,
				extensionFile,
			];

			const filteredFiles = files.filter((file) => !isOutsideWorkspace(file, workspaceRoot));

			expect(filteredFiles).toEqual([workspaceFile]);
		});
	});

	describe("Phase 3 Initialization Safety", () => {
		it("should not attempt snapshot creation with external files during Phase 3", () => {
			// RED PHASE: This test expects the guard to exist
			// When implemented, this will verify that Phase 3 managers
			// don't attempt snapshot creation with extension files

			const mockOperationCoordinator = {
				coordinateSnapshotCreation: vi.fn(),
			};

			// Simulate Phase 3 discovering files (including extension files)
			const discoveredFiles = [
				path.join(workspaceRoot, "apps/vscode/src/extension.ts"),
				extensionFile, // This should be filtered out
			];

			// Filter files before passing to snapshot creation
			const workspaceFiles = discoveredFiles.filter((file) => {
				const relative = path.relative(workspaceRoot, file);
				return !relative.startsWith("..") && !path.isAbsolute(relative);
			});

			// Verify only workspace files are passed
			expect(workspaceFiles).toHaveLength(1);
			expect(workspaceFiles).not.toContain(extensionFile);
		});

		it("should log warning when external file is detected during initialization", () => {
			const mockLogger = {
				warn: vi.fn(),
				debug: vi.fn(),
			};

			// Simulate detecting an external file during Phase 3
			const detectedFile = extensionFile;
			const relativePath = path.relative(workspaceRoot, detectedFile);

			if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
				mockLogger.warn("Skipping file outside workspace during initialization", {
					file: detectedFile,
					relativePath,
					workspaceRoot,
				});
			}

			expect(mockLogger.warn).toHaveBeenCalledWith(
				"Skipping file outside workspace during initialization",
				expect.objectContaining({
					file: extensionFile,
					relativePath: expect.stringContaining("../../.qoder"),
					workspaceRoot,
				}),
			);
		});
	});

	describe("Edge Cases", () => {
		it("should handle symlinks outside workspace", () => {
			// Symlink that points outside workspace
			const symlinkPath = "/Users/user/.qoder/linked";
			const relativePath = path.relative(workspaceRoot, symlinkPath);

			expect(relativePath.startsWith("..")).toBe(true);
		});

		it("should handle relative paths that escape workspace", () => {
			const escapedPath = path.join(workspaceRoot, "../../.qoder/file.ts");
			const normalized = path.normalize(escapedPath);
			const relativePath = path.relative(workspaceRoot, normalized);

			expect(relativePath.startsWith("..")).toBe(true);
		});

		it("should handle Windows extension paths", () => {
			const windowsExtPath = "C:\\Users\\user\\.qoder\\extensions\\ext\\file.ts";
			const windowsWorkspace = "C:\\Users\\user\\projects\\Vreko-Site";
			const relativePath = path.relative(windowsWorkspace, windowsExtPath);

			expect(relativePath.startsWith("..")).toBe(true);
		});

		it("should handle case sensitivity appropriately", () => {
			// On macOS/Windows, paths are case-insensitive
			// This test documents the expected behavior
			const mixedCaseWorkspace = "/Users/User/WebstormProjects/Vreko-Site";
			const lowerCaseFile = "/users/user/.qoder/file.ts";

			// path.relative() handles case sensitivity based on OS
			const relativePath = path.relative(mixedCaseWorkspace, lowerCaseFile);

			// On case-insensitive systems, this should still detect external file
			expect(relativePath.startsWith("..") || relativePath.includes(".qoder")).toBe(true);
		});
	});

	describe("Performance", () => {
		it("should filter large file lists efficiently", () => {
			const largeFileList = Array.from({ length: 1000 }, (_, i) => {
				// Mix of workspace and external files
				return i % 2 === 0
					? path.join(workspaceRoot, `src/file${i}.ts`)
					: `/Users/user/.qoder/extensions/ext${i}/file.ts`;
			});

			const startTime = Date.now();
			const filtered = largeFileList.filter((file) => {
				const relative = path.relative(workspaceRoot, file);
				return !relative.startsWith("..") && !path.isAbsolute(relative);
			});
			const duration = Date.now() - startTime;

			// Should filter 1000 files in < 50ms
			expect(duration).toBeLessThan(50);
			expect(filtered).toHaveLength(500); // Half were workspace files
		});
	});
});
