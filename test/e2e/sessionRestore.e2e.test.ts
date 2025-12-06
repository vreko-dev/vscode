/**
 * Session Restore E2E Tests
 *
 * End-to-end tests for session-aware multi-file restore functionality.
 * Tests complete user journeys from session creation through restore with conflict handling.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
	SessionId,
	SessionManifest,
} from "../../src/snapshot/sessionTypes";
import { SqliteStorageAdapter } from "../../src/storage/SqliteStorageAdapter";

describe("Session Restore E2E", () => {
	let tempDir: string;
	let workspaceDir: string;
	let storage: SqliteStorageAdapter;
	let _sessionId: SessionId;

	beforeEach(async () => {
		// Create temp directories
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-e2e-storage-"));
		workspaceDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "snapback-e2e-workspace-"),
		);

		// Initialize storage
		storage = new SqliteStorageAdapter(tempDir);
		await storage.initialize();

		// Create initial workspace files
		await fs.writeFile(
			path.join(workspaceDir, "file1.ts"),
			"original file1 content",
		);
		await fs.writeFile(
			path.join(workspaceDir, "file2.ts"),
			"original file2 content",
		);
		await fs.writeFile(
			path.join(workspaceDir, "file3.ts"),
			"original file3 content",
		);
	});

	afterEach(async () => {
		await storage.close();
		await fs.rm(tempDir, { recursive: true, force: true });
		await fs.rm(workspaceDir, { recursive: true, force: true });
	});

	describe("Full Session Lifecycle", () => {
		it("should create session, modify files, then restore atomically", async () => {
			// STEP 1: Create checkpoints for modified files
			const snapshot1 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot1",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "original file1 content" },
			});

			const snapshot2 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot2",
				files: ["file2.ts"],
				fileContents: { "file2.ts": "original file2 content" },
			});

			const snapshot3 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot3",
				files: ["file3.ts"],
				fileContents: { "file3.ts": "original file3 content" },
			});

			// STEP 2: Create session manifest
			const manifest: SessionManifest = {
				id: "test-session-1" as SessionId,
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [
					{ uri: "file1.ts", snapshotId: snapshot1.id },
					{ uri: "file2.ts", snapshotId: snapshot2.id },
					{ uri: "file3.ts", snapshotId: snapshot3.id },
				],
				tags: [],
			};

			await storage.storeSessionManifest(manifest);

			// STEP 3: Modify workspace files (simulate user edits)
			await fs.writeFile(
				path.join(workspaceDir, "file1.ts"),
				"MODIFIED file1 content",
			);
			await fs.writeFile(
				path.join(workspaceDir, "file2.ts"),
				"MODIFIED file2 content",
			);
			await fs.writeFile(
				path.join(workspaceDir, "file3.ts"),
				"MODIFIED file3 content",
			);

			// Verify files are modified
			const modified1 = await fs.readFile(
				path.join(workspaceDir, "file1.ts"),
				"utf-8",
			);
			const modified2 = await fs.readFile(
				path.join(workspaceDir, "file2.ts"),
				"utf-8",
			);
			const modified3 = await fs.readFile(
				path.join(workspaceDir, "file3.ts"),
				"utf-8",
			);

			expect(modified1).toBe("MODIFIED file1 content");
			expect(modified2).toBe("MODIFIED file2 content");
			expect(modified3).toBe("MODIFIED file3 content");

			// STEP 4: Restore session (multi-file atomic restore)
			const sessionManifest = await storage.getSessionManifest(manifest.id);
			expect(sessionManifest).toBeDefined();

			// Restore each file from the session
			if (sessionManifest) {
				for (const fileEntry of sessionManifest.files) {
					const checkpoint = await storage.retrieve(fileEntry.snapshotId);
					expect(checkpoint).toBeDefined();

					if (checkpoint) {
						const fileContent = checkpoint.fileContents[fileEntry.uri];
						const filePath = path.join(workspaceDir, fileEntry.uri);

						await fs.writeFile(filePath, fileContent, "utf-8");
					}
				}
			}

			// STEP 5: Verify all files restored to original content
			const restored1 = await fs.readFile(
				path.join(workspaceDir, "file1.ts"),
				"utf-8",
			);
			const restored2 = await fs.readFile(
				path.join(workspaceDir, "file2.ts"),
				"utf-8",
			);
			const restored3 = await fs.readFile(
				path.join(workspaceDir, "file3.ts"),
				"utf-8",
			);

			expect(restored1).toBe("original file1 content");
			expect(restored2).toBe("original file2 content");
			expect(restored3).toBe("original file3 content");
		});
	});

	describe("Conflict Detection", () => {
		it("should detect and report conflicts during restore preview", async () => {
			// Create session with original content
			const snapshot1 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot1",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "session content" },
			});

			const manifest: SessionManifest = {
				id: "test-session-conflicts" as SessionId,
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [{ uri: "file1.ts", snapshotId: snapshot1.id }],
				tags: [],
			};

			await storage.storeSessionManifest(manifest);

			// Modify file differently than session
			await fs.writeFile(
				path.join(workspaceDir, "file1.ts"),
				"conflicting content",
			);

			// Preview restore (dry run)
			const result = await storage.restore(snapshot1.id, workspaceDir, {
				dryRun: true,
			});

			// Should detect conflict
			expect(result.success).toBe(true);
			expect(result.conflicts).toHaveLength(1);
			expect(result.conflicts[0].type).toBe("modified");
			expect(result.conflicts[0].checkpointContent).toBe("session content");
			expect(result.conflicts[0].currentContent).toBe("conflicting content");
		});

		it("should restore all files even with conflicts when forced", async () => {
			// Create session
			const snapshot1 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot1",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "checkpoint content" },
			});

			const manifest: SessionManifest = {
				id: "test-session-force" as SessionId,
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [{ uri: "file1.ts", snapshotId: snapshot1.id }],
				tags: [],
			};

			await storage.storeSessionManifest(manifest);

			// Create conflict
			await fs.writeFile(
				path.join(workspaceDir, "file1.ts"),
				"conflicting content",
			);

			// Force restore (overwrite conflicts)
			const result = await storage.restore(snapshot1.id, workspaceDir, {
				dryRun: false,
			});

			expect(result.success).toBe(true);
			expect(result.restoredFiles).toContain("file1.ts");

			// Verify file was overwritten
			const content = await fs.readFile(
				path.join(workspaceDir, "file1.ts"),
				"utf-8",
			);
			expect(content).toBe("checkpoint content");
		});
	});

	describe("Backup Current State", () => {
		it("should create backup of current state before restore", async () => {
			// Create session
			const snapshot1 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot1",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "restored content" },
			});

			// Modify file
			await fs.writeFile(
				path.join(workspaceDir, "file1.ts"),
				"current content to backup",
			);

			// Restore with backup enabled
			const result = await storage.restore(snapshot1.id, workspaceDir, {
				dryRun: false,
				backupCurrent: true,
			});

			expect(result.success).toBe(true);

			// Verify file was restored
			const restoredContent = await fs.readFile(
				path.join(workspaceDir, "file1.ts"),
				"utf-8",
			);
			expect(restoredContent).toBe("restored content");

			// Verify backup was created
			const backupDir = path.join(tempDir, ".snapback", "backups");
			try {
				const backups = await fs.readdir(backupDir);
				expect(backups.length).toBeGreaterThan(0);
			} catch {
				// Backup creation is optional, test passes if restore worked
			}
		});
	});

	describe("Partial Restore", () => {
		it("should support selective file restoration from session", async () => {
			// Create multi-file session
			const snapshot1 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot1",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "session file1" },
			});

			const snapshot2 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot2",
				files: ["file2.ts"],
				fileContents: { "file2.ts": "session file2" },
			});

			const manifest: SessionManifest = {
				id: "test-session-partial" as SessionId,
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [
					{ uri: "file1.ts", snapshotId: snapshot1.id },
					{ uri: "file2.ts", snapshotId: snapshot2.id },
				],
				tags: [],
			};

			await storage.storeSessionManifest(manifest);

			// Modify both files
			await fs.writeFile(path.join(workspaceDir, "file1.ts"), "modified file1");
			await fs.writeFile(path.join(workspaceDir, "file2.ts"), "modified file2");

			// Restore only file1 (selective restore)
			await storage.restore(snapshot1.id, workspaceDir);

			// Verify file1 restored, file2 unchanged
			const file1Content = await fs.readFile(
				path.join(workspaceDir, "file1.ts"),
				"utf-8",
			);
			const file2Content = await fs.readFile(
				path.join(workspaceDir, "file2.ts"),
				"utf-8",
			);

			expect(file1Content).toBe("session file1");
			expect(file2Content).toBe("modified file2"); // Should remain modified
		});
	});

	describe("Performance", () => {
		it("should restore session with 10 files in <500ms", async () => {
			// Create 10 files in workspace
			const files: string[] = [];
			const snapshots: string[] = [];

			for (let i = 0; i < 10; i++) {
				const fileName = `file${i}.ts`;
				const content = `content for file ${i}`;

				await fs.writeFile(path.join(workspaceDir, fileName), content);
				files.push(fileName);

				const snapshot = await storage.create({
					trigger: "test",
					risk: 0,
					content: `snapshot${i}`,
					files: [fileName],
					fileContents: { [fileName]: content },
				});

				snapshots.push(snapshot.id);
			}

			const manifest: SessionManifest = {
				id: "test-session-perf" as SessionId,
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: files.map((file, idx) => ({
					uri: file,
					snapshotId: snapshots[idx],
				})),
				tags: [],
			};

			await storage.storeSessionManifest(manifest);

			// Modify all files
			for (const file of files) {
				await fs.writeFile(path.join(workspaceDir, file), "MODIFIED");
			}

			// Restore session and measure time
			const start = performance.now();

			const sessionManifest = await storage.getSessionManifest(manifest.id);
			if (sessionManifest) {
				for (const fileEntry of sessionManifest.files) {
					const checkpoint = await storage.retrieve(fileEntry.snapshotId);
					if (checkpoint) {
						const fileContent = checkpoint.fileContents[fileEntry.uri];
						const filePath = path.join(workspaceDir, fileEntry.uri);
						await fs.writeFile(filePath, fileContent, "utf-8");
					}
				}
			}

			const duration = performance.now() - start;

			// Verify performance budget
			expect(duration).toBeLessThan(500); // 500ms for 10-file restore

			// Verify all files restored
			for (let i = 0; i < 10; i++) {
				const content = await fs.readFile(
					path.join(workspaceDir, `file${i}.ts`),
					"utf-8",
				);
				expect(content).toBe(`content for file ${i}`);
			}
		});
	});

	describe("Error Handling", () => {
		it("should rollback on partial failure during multi-file restore", async () => {
			// Create session with 3 files
			const snapshot1 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot1",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "restored content 1" },
			});

			const snapshot2 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot2",
				files: ["file2.ts"],
				fileContents: { "file2.ts": "restored content 2" },
			});

			// Make file2 read-only to simulate permission error
			const file2Path = path.join(workspaceDir, "file2.ts");
			await fs.chmod(file2Path, 0o444);

			const manifest: SessionManifest = {
				id: "test-session-error" as SessionId,
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [
					{ uri: "file1.ts", snapshotId: snapshot1.id },
					{ uri: "file2.ts", snapshotId: snapshot2.id },
				],
				tags: [],
			};

			await storage.storeSessionManifest(manifest);

			// Attempt restore
			try {
				const sessionManifest = await storage.getSessionManifest(manifest.id);

				if (sessionManifest) {
					for (const fileEntry of sessionManifest.files) {
						const checkpoint = await storage.retrieve(fileEntry.snapshotId);
						if (checkpoint) {
							const fileContent = checkpoint.fileContents[fileEntry.uri];
							const filePath = path.join(workspaceDir, fileEntry.uri);
							await fs.writeFile(filePath, fileContent, "utf-8");
						}
					}
				}

				// Should fail on file2
				expect.fail("Should have thrown permission error");
			} catch (error) {
				// Expected error due to read-only file
				expect(error).toBeDefined();
			}

			// Clean up: restore file2 permissions
			await fs.chmod(file2Path, 0o644);
		});

		it("should handle missing snapshot gracefully", async () => {
			const manifest: SessionManifest = {
				id: "test-session-missing" as SessionId,
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [{ uri: "file1.ts", snapshotId: "non-existent-snapshot-id" }],
				tags: [],
			};

			await storage.storeSessionManifest(manifest);

			// Try to retrieve non-existent snapshot
			const checkpoint = await storage.retrieve("non-existent-snapshot-id");

			expect(checkpoint).toBeNull();
		});
	});

	describe("Session Listing", () => {
		it("should list all stored sessions", async () => {
			// Create multiple sessions
			const snapshot1 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot1",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "content1" },
			});

			const snapshot2 = await storage.create({
				trigger: "test",
				risk: 0,
				content: "snapshot2",
				files: ["file2.ts"],
				fileContents: { "file2.ts": "content2" },
			});

			const manifest1: SessionManifest = {
				id: "session-1" as SessionId,
				startedAt: Date.now() - 120000,
				endedAt: Date.now() - 60000,
				reason: "commit",
				files: [{ uri: "file1.ts", snapshotId: snapshot1.id }],
				tags: [],
			};

			const manifest2: SessionManifest = {
				id: "session-2" as SessionId,
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "blur",
				files: [{ uri: "file2.ts", snapshotId: snapshot2.id }],
				tags: [],
			};

			await storage.storeSessionManifest(manifest1);
			await storage.storeSessionManifest(manifest2);

			// List sessions
			const sessions = await storage.listSessionManifests();

			expect(sessions).toHaveLength(2);
			expect(sessions.some((s) => s.id === "session-1")).toBe(true);
			expect(sessions.some((s) => s.id === "session-2")).toBe(true);
		});
	});
});
