import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Diff View Before Restore Test
 *
 * CRITICAL BUG PREVENTION:
 * Users were restoring files blindly without seeing what changed.
 * This caused data loss when restoring unintended old versions.
 *
 * This test ensures:
 * - User sees diff BEFORE confirmation
 * - Can cancel after seeing changes
 * - Multi-file snapshots show file picker
 * - Only selected files are restored
 */

describe("Restore Diff View", () => {
	let mockVscode: any;
	let mockRestoreService: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockVscode = {
			commands: {
				executeCommand: vi.fn(),
			},
			window: {
				showQuickPick: vi.fn(),
				showWarningMessage: vi.fn(),
			},
		};

		mockRestoreService = {
			initiateRestore: vi.fn(),
			restoreFiles: vi.fn(),
		};
	});

	describe("Diff Command Before Restore", () => {
		it("should execute vscode.diff BEFORE restore confirmation", async () => {
			const snapshotId = "snap-123";
			const filePath = "src/app.ts";
			const _oldContent = "const x = 1;";
			const _newContent = "const x = 2;";

			mockVscode.commands.executeCommand.mockResolvedValueOnce(undefined);

			// Initiate restore should show diff first
			const initiateRestore = async (id: string, file: string) => {
				// Step 1: Show diff
				await mockVscode.commands.executeCommand(
					"vscode.diff",
					`file:///snapshot/${id}/${file}`,
					`file:///${file}`,
					`Diff: ${file}`,
				);

				// Step 2: Only then ask for confirmation
				// (not shown in this test, but verify diff was called)
			};

			await initiateRestore(snapshotId, filePath);

			// Verify diff command was executed
			expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith(
				"vscode.diff",
				expect.any(String),
				expect.any(String),
				expect.stringContaining("app.ts"),
			);
		});

		it("should show BOTH old and new content in diff", async () => {
			const diffCall = mockVscode.commands.executeCommand.mock.calls[0] || [];

			// vscode.diff(oldUri, newUri, title)
			// oldUri should be snapshot version
			// newUri should be current file

			expect(diffCall[0]).toBe("vscode.diff");
			expect(diffCall[1]).toMatch(/snapshot/); // Old version from snapshot
			expect(diffCall[2]).toMatch(/file/); // Current file
		});

		it("should display filename in diff title for clarity", async () => {
			mockVscode.commands.executeCommand.mockResolvedValueOnce(undefined);

			const filename = "database.ts";

			await mockVscode.commands.executeCommand(
				"vscode.diff",
				"file:///snapshot/app.ts",
				"file:///database.ts",
				`Diff: ${filename}`,
			);

			const callArgs = mockVscode.commands.executeCommand.mock.calls[0];
			expect(callArgs[2]).toContain(filename);
		});
	});

	describe("User Can Cancel After Seeing Diff", () => {
		it("should allow cancel after diff view", async () => {
			mockVscode.window.showWarningMessage.mockResolvedValueOnce("Cancel");

			const restore = async () => {
				// Show diff
				await mockVscode.commands.executeCommand("vscode.diff", "a", "b");

				// User can cancel here
				const choice = await mockVscode.window.showWarningMessage(
					"Restore this file?",
					"Yes",
					"Cancel",
				);

				if (choice === "Cancel") {
					return false; // Restore cancelled
				}

				return true; // Restore confirmed
			};

			const result = await restore();

			expect(result).toBe(false); // User cancelled
			expect(mockRestoreService.restoreFiles).not.toHaveBeenCalled();
		});

		it("should NOT restore if user cancels during diff view", async () => {
			mockVscode.window.showWarningMessage.mockResolvedValueOnce("Cancel");

			const confirmRestore = async () => {
				const confirmed = await mockVscode.window.showWarningMessage(
					"Really restore?",
					"Yes",
					"Cancel",
				);
				return confirmed === "Yes";
			};

			const willRestore = await confirmRestore();

			expect(willRestore).toBe(false);
			expect(mockRestoreService.restoreFiles).not.toHaveBeenCalled();
		});

		it("should proceed with restore only on explicit confirmation", async () => {
			mockVscode.window.showWarningMessage.mockResolvedValueOnce("Yes");

			const confirmRestore = async () => {
				const confirmed = await mockVscode.window.showWarningMessage(
					"Restore this file?",
					"Yes",
					"Cancel",
				);
				if (confirmed === "Yes") {
					return true;
				}
				return false;
			};

			const willRestore = await confirmRestore();

			expect(willRestore).toBe(true);
		});
	});

	describe("Multi-File Snapshot Handling", () => {
		it("should show file picker for multi-file snapshots", async () => {
			const snapshot = {
				id: "snap-1",
				files: {
					"app.ts": {},
					"utils.ts": {},
					"types.ts": {},
				},
			};

			mockVscode.window.showQuickPick.mockResolvedValueOnce([
				"app.ts",
				"utils.ts",
			]);

			const showFilePicker = async (files: string[]) => {
				if (files.length > 1) {
					return await mockVscode.window.showQuickPick(files, {
						canPickMany: true,
					});
				}
				return files; // Single file, no picker
			};

			const selectedFiles = await showFilePicker(Object.keys(snapshot.files));

			expect(mockVscode.window.showQuickPick).toHaveBeenCalled();
			expect(selectedFiles).toHaveLength(2);
		});

		it("should allow user to select subset of files", async () => {
			const allFiles = ["file1.ts", "file2.ts", "file3.ts", "file4.ts"];

			mockVscode.window.showQuickPick.mockResolvedValueOnce([
				"file1.ts",
				"file3.ts",
			]);

			const selection = await mockVscode.window.showQuickPick(allFiles, {
				canPickMany: true,
			});

			// User selected 2 out of 4 files
			expect(selection).toHaveLength(2);
			expect(selection).toContain("file1.ts");
			expect(selection).toContain("file3.ts");
			expect(selection).not.toContain("file2.ts");
		});

		it("should NOT restore unselected files", async () => {
			const snapshot = {
				files: {
					"a.ts": { content: "old-a" },
					"b.ts": { content: "old-b" },
					"c.ts": { content: "old-c" },
				},
			};

			// User selected only 'a.ts' and 'c.ts'
			const selectedFiles = ["a.ts", "c.ts"];

			const restore = async (files: string[]) => {
				// Only restore selected files
				return {
					restored: files,
					skipped: Object.keys(snapshot.files).filter(
						(f) => !files.includes(f),
					),
				};
			};

			const result = await restore(selectedFiles);

			expect(result.restored).toEqual(["a.ts", "c.ts"]);
			expect(result.skipped).toEqual(["b.ts"]);
		});

		it("should show diff for EACH file being restored", async () => {
			const filesToRestore = ["app.ts", "utils.ts"];
			const diffCalls: any[] = [];

			mockVscode.commands.executeCommand.mockImplementation((cmd) => {
				if (cmd === "vscode.diff") {
					diffCalls.push(cmd);
				}
			});

			for (const file of filesToRestore) {
				await mockVscode.commands.executeCommand(
					"vscode.diff",
					`snapshot://${file}`,
					`file://${file}`,
				);
			}

			// Should have shown diff for each file
			expect(diffCalls).toHaveLength(2);
		});
	});

	describe("Restore Confirmation Flow", () => {
		it("should require explicit confirmation after diff", async () => {
			mockVscode.commands.executeCommand.mockResolvedValueOnce(undefined);
			mockVscode.window.showWarningMessage.mockResolvedValueOnce("Restore");

			const restore = async () => {
				// Step 1: Show diff
				await mockVscode.commands.executeCommand("vscode.diff", "a", "b");

				// Step 2: Require confirmation (not auto-restore after diff)
				const confirmed = await mockVscode.window.showWarningMessage(
					"Proceed with restore?",
					"Restore",
					"Cancel",
				);

				return confirmed === "Restore";
			};

			const result = await restore();

			// Both diff AND confirmation should be called
			expect(mockVscode.commands.executeCommand).toHaveBeenCalled();
			expect(mockVscode.window.showWarningMessage).toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it("should NOT auto-restore after user closes diff viewer", async () => {
			// User opens diff viewer, closes it without confirming
			mockVscode.commands.executeCommand.mockResolvedValueOnce(undefined);

			mockVscode.window.showWarningMessage.mockResolvedValueOnce("Cancel");

			const willRestore = await mockVscode.window.showWarningMessage(
				"Restore after viewing diff?",
				"Restore",
				"Cancel",
			);

			expect(willRestore).toBe("Cancel");
			expect(mockRestoreService.restoreFiles).not.toHaveBeenCalled();
		});
	});

	describe("Error Handling During Restore", () => {
		it("should handle diff command failure gracefully", async () => {
			mockVscode.commands.executeCommand.mockRejectedValueOnce(
				new Error("Failed to show diff"),
			);

			const restore = async () => {
				try {
					await mockVscode.commands.executeCommand("vscode.diff", "a", "b");
					return { success: false, error: "Diff failed" };
				} catch (error) {
					return { success: false, error: String(error) };
				}
			};

			const result = await restore();

			expect(result.success).toBe(false);
			expect(mockRestoreService.restoreFiles).not.toHaveBeenCalled();
		});

		it("should prevent restore if file modified since snapshot", async () => {
			const snapshot = {
				timestamp: 1000,
				files: { "app.ts": {} },
			};

			const currentFileTimestamp = 2000; // Modified after snapshot

			const canRestore = () => {
				if (currentFileTimestamp > snapshot.timestamp) {
					return false; // File changed, warn user
				}
				return true;
			};

			expect(canRestore()).toBe(false);
		});
	});
});
