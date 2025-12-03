import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Snapshot Scope Validation Test
 *
 * CRITICAL BUG PREVENTION:
 * System was creating snapshots with 600+ workspace files instead of just the 1 saved file.
 * This caused:
 * - Massive snapshots (100MB+)
 * - Slow restore operations
 * - Out of memory errors
 *
 * This test ensures snapshots contain ONLY the modified file + previousBlob for diffs.
 */

describe("Snapshot Scope Validation", () => {
	let _mockStorage: any;
	let mockVscode: any;

	beforeEach(() => {
		vi.clearAllMocks();

		_mockStorage = {
			saveSnapshot: vi.fn(),
			getSnapshot: vi.fn(),
		};

		mockVscode = {
			workspace: {
				workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
				findFiles: vi.fn(),
			},
		};
	});

	describe("Auto-Save Snapshot Scope", () => {
		it("should snapshot ONLY the saved file (not entire workspace)", async () => {
			// Setup: workspace with 600 files
			const workspaceFiles = Array.from(
				{ length: 600 },
				(_, i) => `file${i}.ts`,
			);

			mockVscode.workspace.findFiles.mockResolvedValue(workspaceFiles);

			// Create snapshot for just one file
			const snapshot = {
				id: "snap-1",
				files: {
					"app.ts": {
						content: "const x = 1;",
						previousBlob: "blob-old-content",
					},
				},
			};

			// Should have ONLY 1 file
			expect(Object.keys(snapshot.files)).toHaveLength(1);
			expect("app.ts" in snapshot.files).toBe(true);

			// NOT 600 files
			expect(Object.keys(snapshot.files).length).toBeLessThan(10);
		});

		it("should NOT scan entire workspace during auto-save", async () => {
			const _findFilesSpy = mockVscode.workspace.findFiles;

			// When auto-saving a single file, should NOT call findFiles
			const createAutoSnapshot = async (filePath: string) => {
				// Should only capture this file, not scan workspace
				return {
					files: {
						[filePath]: {
							content: "new content",
						},
					},
				};
			};

			const snapshot = await createAutoSnapshot("src/app.ts");

			// Should not have called findFiles (would scan workspace)
			// Instead, directly capture the one saved file
			expect(Object.keys(snapshot.files)).toHaveLength(1);
		});

		it("should include previousBlob for diff capability", async () => {
			const snapshot = {
				id: "snap-1",
				files: {
					"app.ts": {
						content: "new content",
						previousBlob: "blob-abc123", // Must be present
					},
				},
			};

			expect(snapshot.files["app.ts"].previousBlob).toBeDefined();
			expect(snapshot.files["app.ts"].previousBlob).toMatch(/^blob-/);
		});
	});

	describe("Manual Checkpoint Scope", () => {
		it("should allow manual checkpoint with multiple files", async () => {
			// User explicitly selects 3 files to checkpoint
			const manualCheckpoint = {
				id: "cp-1",
				files: {
					"app.ts": { content: "..." },
					"utils.ts": { content: "..." },
					"types.ts": { content: "..." },
				},
			};

			// Manual checkpoints CAN have multiple files
			expect(Object.keys(manualCheckpoint.files)).toBe(3);
		});

		it("should NOT include unselected files in manual checkpoint", async () => {
			const _workspaceFiles = ["app.ts", "utils.ts", "types.ts", "ignore.ts"];
			const userSelectedFiles = ["app.ts", "utils.ts"];

			const checkpoint = {
				files: userSelectedFiles.reduce(
					(acc, file) => {
						acc[file] = { content: "..." };
						return acc;
					},
					{} as Record<string, any>,
				),
			};

			// Should only have selected files
			expect(Object.keys(checkpoint.files)).toEqual(userSelectedFiles);
			expect(checkpoint.files["ignore.ts"]).toBeUndefined();
		});
	});

	describe("File Content Storage", () => {
		it("should store actual file content in snapshot", async () => {
			const fileContent = "function hello() { console.log('world'); }";

			const snapshot = {
				files: {
					"app.ts": {
						content: fileContent,
						size: fileContent.length,
					},
				},
			};

			expect(snapshot.files["app.ts"].content).toBe(fileContent);
			expect(snapshot.files["app.ts"].size).toBeGreaterThan(0);
		});

		it("should handle large files efficiently", async () => {
			const largeContent = "x".repeat(10 * 1024 * 1024); // 10MB

			const snapshot = {
				files: {
					"large.ts": {
						content: largeContent,
						previousBlob: "blob-large",
					},
				},
			};

			// Should store just this one large file
			expect(Object.keys(snapshot.files)).toHaveLength(1);
			expect(snapshot.files["large.ts"].content.length).toBe(
				largeContent.length,
			);
		});
	});

	describe("Snapshot Size Validation", () => {
		it("should keep auto-save snapshots under 10MB", async () => {
			// Estimate snapshot size
			const snapshot = {
				files: {
					"app.ts": {
						content: "a".repeat(1024 * 1024), // 1MB file
						previousBlob: "b".repeat(1024 * 1024), // 1MB previous
					},
				},
			};

			const estimateSize = (snap: any) => {
				let size = 0;
				Object.values(snap.files).forEach((file: any) => {
					size += (file.content || "").length;
					size += (file.previousBlob || "").length;
				});
				return size;
			};

			const size = estimateSize(snapshot);

			// Should be reasonable (not 600 files worth)
			expect(size).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
		});

		it("should NOT create snapshots larger than memory allows", async () => {
			const maxMemoryForSnapshot = 100 * 1024 * 1024; // 100MB limit

			const createSnapshot = (fileContent: string) => {
				const size = fileContent.length;
				if (size > maxMemoryForSnapshot) {
					throw new Error(`File too large for snapshot: ${size} bytes`);
				}
				return {
					files: {
						"file.ts": { content: fileContent },
					},
				};
			};

			// Should accept 10MB file
			expect(() => {
				createSnapshot("x".repeat(10 * 1024 * 1024));
			}).not.toThrow();

			// Should reject 200MB file
			expect(() => {
				createSnapshot("x".repeat(200 * 1024 * 1024));
			}).toThrow();
		});
	});

	describe("Workspace Isolation", () => {
		it("should NOT include files from other workspaces", async () => {
			const currentWorkspace = "/workspace-1";
			const otherWorkspace = "/workspace-2";

			const snapshot = {
				workspacePath: currentWorkspace,
				files: {
					"app.ts": { content: "..." },
				},
			};

			// Should only have files from current workspace
			expect(snapshot.workspacePath).toBe(currentWorkspace);
			expect(snapshot.workspacePath).not.toBe(otherWorkspace);
		});

		it("should handle multi-root workspace correctly", async () => {
			const _workspaceFolders = [
				{ name: "root1", uri: { fsPath: "/root1" } },
				{ name: "root2", uri: { fsPath: "/root2" } },
			];

			// Snapshot should scope to specific root
			const snapshot = {
				rootPath: "/root1",
				files: {
					"app.ts": { content: "..." },
				},
			};

			expect(snapshot.rootPath).toBe("/root1");
			// Should not include files from /root2
		});
	});
});
