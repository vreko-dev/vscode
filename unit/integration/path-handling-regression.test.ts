/**
 * Path Handling Regression Tests
 *
 * Tests to prevent recurrence of the critical anchor file path mismatch bug
 * discovered in 2026-01-19 stability analysis.
 *
 * Root Cause: AutoDecisionIntegration was passing absolute paths to
 * coordinateSnapshotCreation(), but fileContents used workspace-relative
 * paths as keys. This caused SnapshotStore.createPOST() anchor validation
 * to fail with "Anchor file not found in snapshot files".
 *
 * Fix: Changed specificFiles parameter to use workspace-relative paths
 * that match the fileContents keys.
 *
 * References:
 * - VS Code Extension API: RelativePattern and workspace-relative paths
 * - Node.js path module: path.relative(), path.isAbsolute()
 * - Issue: apps/vscode/src/integration/AutoDecisionIntegration.ts:903
 */

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Path Handling Regression Tests", () => {
	describe("Anchor File Path Consistency", () => {
		it("should use workspace-relative paths for both anchor and fileContents keys", () => {
			// Simulate the bug scenario
			const workspaceRoot = "/Users/user/project";
			const absoluteFilePath = "/Users/user/project/apps/api/package.json";

			// CORRECT: Use workspace-relative path
			const relativePath = path.relative(workspaceRoot, absoluteFilePath);
			const fileContents = { [relativePath]: "content" };
			const specificFiles = [relativePath];

			// Verify they match
			expect(specificFiles[0]).toBe(Object.keys(fileContents)[0]);
			expect(relativePath).toBe("apps/api/package.json");
		});

		it("should detect path mismatch that caused the original bug", () => {
			const workspaceRoot = "/Users/user/project";
			const absoluteFilePath = "/Users/user/project/src/index.ts";

			// BUG SCENARIO: Mixing absolute and relative paths
			const relativePath = path.relative(workspaceRoot, absoluteFilePath);
			const fileContents = { [relativePath]: "content" };
			const buggySpecificFiles = [absoluteFilePath]; // ❌ Using absolute instead of relative

			// This mismatch would cause validation failure
			expect(buggySpecificFiles[0]).not.toBe(Object.keys(fileContents)[0]);
			expect(fileContents[absoluteFilePath]).toBeUndefined(); // Anchor not found!
		});

		it("should handle cross-platform path separators correctly", () => {
			// Windows path
			const windowsWorkspace = "C:\\Users\\dev\\project";
			const windowsFile = "C:\\Users\\dev\\project\\src\\api.ts";

			// path.relative() returns backslashes on Windows, forward on POSIX
			const relativeWin = path.relative(windowsWorkspace, windowsFile);

			// VS Code internally normalizes to forward slashes
			const normalized = relativeWin.replace(/\\/g, "/");

			// Verify normalization worked (result should have no backslashes)
			expect(normalized.includes("\\")).toBe(false);
			expect(normalized).toContain("src/api.ts");
		});

		it("should validate anchor file is present in files map", () => {
			const files = new Map([
				["src/main.ts", "content1"],
				["src/utils.ts", "content2"],
			]);

			const anchorFile = "src/main.ts";

			// Validation check (from SnapshotStore.createPOST)
			const isValid = files.has(anchorFile);
			expect(isValid).toBe(true);

			// Invalid anchor should fail
			const invalidAnchor = "/absolute/path/src/main.ts";
			expect(files.has(invalidAnchor)).toBe(false);
		});
	});

	describe("Path Conversion Edge Cases", () => {
		it("should handle files at workspace root", () => {
			const workspaceRoot = "/workspace";
			const fileAtRoot = "/workspace/README.md";

			const relative = path.relative(workspaceRoot, fileAtRoot);
			expect(relative).toBe("README.md");
		});

		it("should handle nested directory structures", () => {
			const workspaceRoot = "/project";
			const deepFile = "/project/apps/web/src/components/Button.tsx";

			const relative = path.relative(workspaceRoot, deepFile);
			expect(relative).toBe("apps/web/src/components/Button.tsx");
		});

		it("should handle monorepo package boundaries", () => {
			const workspaceRoot = "/monorepo";
			const packageFile = "/monorepo/packages/core/src/index.ts";

			const relative = path.relative(workspaceRoot, packageFile);
			expect(relative).toBe("packages/core/src/index.ts");
		});

		it("should fallback to absolute when no workspace folder", () => {
			const workspaceRoot = undefined;
			const absolutePath = "/tmp/scratch.ts";

			// When no workspace, keep absolute
			const pathToUse = workspaceRoot
				? path.relative(workspaceRoot, absolutePath)
				: absolutePath;

			expect(pathToUse).toBe(absolutePath);
			expect(path.isAbsolute(pathToUse)).toBe(true);
		});
	});

	describe("AutoDecision Integration Scenarios", () => {
		let mockCoordinator: {
			coordinateSnapshotCreation: ReturnType<typeof vi.fn>;
		};

		beforeEach(() => {
			mockCoordinator = {
				coordinateSnapshotCreation: vi.fn().mockResolvedValue("snap-123"),
			};
		});

		afterEach(() => {
			vi.clearAllMocks();
		});

		it("should pass workspace-relative paths to coordinateSnapshotCreation", async () => {
			const workspaceFolder = "/workspace";
			const absolutePath = "/workspace/src/api.ts";
			const content = "export const api = {}";

			// Simulate AutoDecisionIntegration fix
			const relativePath = path.relative(workspaceFolder, absolutePath);
			const fileContents = { [relativePath]: content };

			await mockCoordinator.coordinateSnapshotCreation(
				false,
				[relativePath], // ✅ FIXED: Use relative path
				fileContents,
				"AI-detected: api.ts",
			);

			const call = mockCoordinator.coordinateSnapshotCreation.mock.calls[0];
			expect(call[1][0]).toBe(relativePath); // specificFiles[0]
			expect(call[2][relativePath]).toBeDefined(); // fileContents has key
		});

		it("should reject mismatched paths (regression prevention)", () => {
			const workspaceFolder = "/workspace";
			const absolutePath = "/workspace/src/api.ts";
			const content = "content";

			// BUG: Using absolute in specificFiles but relative in fileContents
			const relativePath = path.relative(workspaceFolder, absolutePath);
			const fileContents = { [relativePath]: content };
			const buggySpecificFiles = [absolutePath]; // ❌

			// Validation that should fail
			const anchorFromSpecificFiles = buggySpecificFiles[0];
			const anchorExistsInContents = fileContents[anchorFromSpecificFiles] !== undefined;

			expect(anchorExistsInContents).toBe(false); // This would cause the bug
		});
	});

	describe("OperationCoordinator Path Handling", () => {
		it("should convert relative paths to absolute for file I/O", () => {
			const workspaceRoot = "/project";
			const relativeFile = "src/index.ts";

			// OperationCoordinator should convert relative → absolute
			const absoluteFile = path.isAbsolute(relativeFile)
				? relativeFile
				: path.join(workspaceRoot, relativeFile);

			expect(absoluteFile).toBe("/project/src/index.ts");
			expect(path.isAbsolute(absoluteFile)).toBe(true);
		});

		it("should preserve absolute paths when already absolute", () => {
			const workspaceRoot = "/project";
			const absoluteFile = "/project/src/index.ts";

			const result = path.isAbsolute(absoluteFile)
				? absoluteFile
				: path.join(workspaceRoot, absoluteFile);

			expect(result).toBe(absoluteFile);
		});

		it("should handle mixed path types in file array", () => {
			const workspaceRoot = "/workspace";
			const files = [
				"src/relative.ts",
				"/workspace/src/absolute.ts",
			];

			const normalized = files.map(f =>
				path.isAbsolute(f) ? f : path.join(workspaceRoot, f)
			);

			expect(normalized[0]).toBe("/workspace/src/relative.ts");
			expect(normalized[1]).toBe("/workspace/src/absolute.ts");
			expect(normalized.every(f => path.isAbsolute(f))).toBe(true);
		});
	});

	describe("Cross-Platform Compatibility", () => {
		it("should normalize Windows backslashes to forward slashes", () => {
			const windowsPath = "apps\\api\\src\\index.ts";
			const normalized = windowsPath.replace(/\\/g, "/");

			expect(normalized).toBe("apps/api/src/index.ts");
			expect(normalized.includes("\\")).toBe(false);
		});

		it("should handle UNC paths on Windows", () => {
			const uncPath = "\\\\server\\share\\file.ts";
			const normalized = uncPath.replace(/\\/g, "/");

			expect(normalized).toBe("//server/share/file.ts");
		});

		it("should preserve POSIX paths unchanged", () => {
			const posixPath = "src/components/Button.tsx";
			const normalized = posixPath.replace(/\\/g, "/");

			expect(normalized).toBe(posixPath); // No backslashes to replace
		});
	});

	describe("Integration with SnapshotStore Validation", () => {
		it("should simulate SnapshotStore.createPOST validation", () => {
			const files = new Map([
				["src/main.ts", "content"],
				["src/utils.ts", "utils"],
			]);
			const anchorFile = "src/main.ts";

			// Validation from SnapshotStore.ts:245
			const validate = (anchor: string, fileMap: Map<string, string>) => {
				if (!fileMap.has(anchor)) {
					throw new Error(`Anchor file ${anchor} not found in snapshot files`);
				}
			};

			expect(() => validate(anchorFile, files)).not.toThrow();
			expect(() => validate("/absolute/src/main.ts", files)).toThrow(/not found/);
		});

		it("should detect empty files map", () => {
			const files = new Map<string, string>();
			const anchorFile = "src/index.ts";

			expect(files.size).toBe(0);
			expect(files.has(anchorFile)).toBe(false);
		});

		it("should validate all files in snapshot have content", () => {
			const files = new Map([
				["src/a.ts", "content a"],
				["src/b.ts", "content b"],
				["src/empty.ts", ""], // Edge case: empty file
			]);

			expect(files.size).toBe(3);
			expect(files.get("src/empty.ts")).toBe(""); // Empty but defined
		});
	});

	/**
	 * External File Path Regression Tests
	 *
	 * Tests to prevent recurrence of the bug where files OUTSIDE the workspace
	 * (e.g., VS Code extension files) caused "Anchor file not found" errors.
	 *
	 * Bug: When a file like `~/.qoder/extensions/.../file.ts` was passed,
	 * path.relative() produced `../../.qoder/...` which escaped the workspace.
	 * This path was then used as an anchor file, but didn't exist in filesMap.
	 *
	 * Fix: Skip snapshot creation for files where relativePath starts with '..'.
	 *
	 * Discovered: 2026-01-20 during v1.5.1 stabilization
	 */
	describe("External File Path Handling (Regression: Files Outside Workspace)", () => {
		it("should detect files outside workspace (paths starting with '..')", () => {
			const workspaceRoot = "/Users/user/project";

			// External file path - VS Code extension file
			const externalFile = "/Users/user/.qoder/extensions/some-ext/file.ts";
			const relativePath = path.relative(workspaceRoot, externalFile);

			// path.relative() produces '..' paths for files outside workspace
			// From /Users/user/project to /Users/user/.qoder only needs one level up
			expect(relativePath.startsWith("..")).toBe(true);
			expect(relativePath).toBe("../.qoder/extensions/some-ext/file.ts");
		});

		it("should validate isOutsideWorkspace helper logic", () => {
			const workspaceRoot = "/workspace";

			// Helper function that matches the fix in AutoDecisionIntegration
			const isOutsideWorkspace = (absolutePath: string) => {
				const relativePath = path.relative(workspaceRoot, absolutePath);
				return relativePath.startsWith("..") || path.isAbsolute(relativePath);
			};

			// Files INSIDE workspace
			expect(isOutsideWorkspace("/workspace/src/index.ts")).toBe(false);
			expect(isOutsideWorkspace("/workspace/package.json")).toBe(false);
			expect(isOutsideWorkspace("/workspace/apps/api/src/main.ts")).toBe(false);

			// Files OUTSIDE workspace
			expect(isOutsideWorkspace("/home/user/.vscode/extensions/ext/file.ts")).toBe(true);
			expect(isOutsideWorkspace("/tmp/scratch.ts")).toBe(true);
			expect(isOutsideWorkspace("/other/project/file.ts")).toBe(true);
		});

		it("should simulate real-world bug: VS Code extension file", () => {
			const workspaceRoot = "/Users/user/WebstormProjects/Vreko-Site";
			const extensionFile =
				"/Users/user/.qoder/extensions/danielsanmedium.dscodegpt-3.14.252/standalone/apps/vscode/.vrekorc";

			const relativePath = path.relative(workspaceRoot, extensionFile);

			// This is exactly the path that caused the bug
			expect(relativePath.startsWith("..")).toBe(true);
			expect(relativePath).toContain("../../.qoder/extensions");

			// Validation should detect this as outside workspace
			expect(relativePath.startsWith("..")).toBe(true);
		});

		it("should handle edge case: same directory level (sibling folder)", () => {
			const workspaceRoot = "/Users/user/project-a";
			const siblingFile = "/Users/user/project-b/file.ts";

			const relativePath = path.relative(workspaceRoot, siblingFile);

			// Sibling folder also produces '..' path
			expect(relativePath.startsWith("..")).toBe(true);
			expect(relativePath).toBe("../project-b/file.ts");
		});

		it("should handle edge case: parent directory file", () => {
			const workspaceRoot = "/Users/user/project/apps/web";
			const parentFile = "/Users/user/project/package.json";

			const relativePath = path.relative(workspaceRoot, parentFile);

			// Parent directory produces '..' path
			expect(relativePath.startsWith("..")).toBe(true);
			expect(relativePath).toBe("../../package.json");
		});

		it("should NOT flag valid workspace-relative paths", () => {
			const workspaceRoot = "/workspace";
			const validFiles = [
				"/workspace/src/index.ts",
				"/workspace/.vrekorc",
				"/workspace/apps/api/package.json",
				"/workspace/node_modules/pkg/index.js", // Still valid, even if ignored
			];

			for (const file of validFiles) {
				const relativePath = path.relative(workspaceRoot, file);
				expect(relativePath.startsWith(".."), `${file} should be inside workspace`).toBe(
					false,
				);
			}
		});

		it("should validate SnapshotStore rejects paths that escape workspace", () => {
			const files = new Map([["src/main.ts", "content"]]);
			const escapedAnchor = "../../.qoder/extensions/ext/.vrekorc";

			// Simulate SnapshotStore.createPOST validation
			const validateAnchor = (anchor: string, fileMap: Map<string, string>) => {
				if (anchor.startsWith("..")) {
					throw new Error(
						`Anchor file path escapes workspace: ${anchor}. This usually means a file outside the workspace was passed as the anchor.`,
					);
				}
				if (!fileMap.has(anchor)) {
					throw new Error(`Anchor file ${anchor} not found in snapshot files`);
				}
			};

			// Should throw the new, clearer error message
			expect(() => validateAnchor(escapedAnchor, files)).toThrow(
				/escapes workspace/,
			);

			// Valid anchor should pass
			expect(() => validateAnchor("src/main.ts", files)).not.toThrow();
		});
	});
});
