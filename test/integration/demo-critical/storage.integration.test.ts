/**
 * @fileoverview Demo-Critical Storage Integration Tests
 *
 * These tests validate SQLite storage operations with real database interactions.
 * Tests snapshot persistence, querying, and session manifest storage.
 *
 * Coverage:
 * - Snapshot creation and retrieval
 * - Session manifest persistence
 * - Deduplication across restarts
 * - Query performance
 * - Database initialization
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteStorageAdapter } from "@vscode/storage/SqliteStorageAdapter";
import type { CreateSnapshotInput } from "@vscode/storage/types";

describe("[DEMO-CRITICAL] Storage Integration", () => {
	let testWorkspace: string;
	let storage: SqliteStorageAdapter;

	beforeEach(async () => {
		// Create temporary workspace
		testWorkspace = path.join(
			os.tmpdir(),
			`snapback-storage-test-${Date.now()}`,
		);
		await fs.mkdir(testWorkspace, { recursive: true });

		storage = new SqliteStorageAdapter(testWorkspace);
		await storage.initialize();
	});

	afterEach(async () => {
		// Close storage and clean up
		await storage.close();
		await fs.rm(testWorkspace, { recursive: true, force: true });
	});

	describe("Snapshot Persistence", () => {
		it("[DEMO] creates and retrieves snapshot", async () => {
			const input: CreateSnapshotInput = {
				trigger: "manual",
				content: "Test snapshot",
				files: ["test.ts"],
				fileContents: { "test.ts": "const x = 1;" },
			};

			const snapshot = await storage.create(input);

			expect(snapshot).toBeDefined();
			expect(snapshot.id).toBeDefined();
			expect(snapshot.timestamp).toBeGreaterThan(0);

			// Retrieve the snapshot
			const retrieved = await storage.retrieve(snapshot.id);

			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe(snapshot.id);
		});

		it("[DEMO] lists all snapshots", async () => {
			// Create multiple snapshots
			const input1: CreateSnapshotInput = {
				trigger: "manual",
				content: "Snapshot 1",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "content1" },
			};

			const input2: CreateSnapshotInput = {
				trigger: "auto",
				content: "Snapshot 2",
				files: ["file2.ts"],
				fileContents: { "file2.ts": "content2" },
			};

			await storage.create(input1);
			await storage.create(input2);

			const snapshots = await storage.list();

			expect(snapshots).toHaveLength(2);
		});

		it("[DEMO] handles non-existent snapshot gracefully", async () => {
			const retrieved = await storage.retrieve("non-existent-id");

			expect(retrieved).toBeNull();
		});
	});

	describe("Deduplication", () => {
		it("[DEMO] deduplicates identical snapshots", async () => {
			const input: CreateSnapshotInput = {
				trigger: "manual",
				content: "Identical content",
				files: ["test.ts"],
				fileContents: { "test.ts": "const x = 1;" },
			};

			const snapshot1 = await storage.create(input);
			const snapshot2 = await storage.create(input);

			// Should have same ID (deduplicated)
			expect(snapshot1.id).toBe(snapshot2.id);
		});

		it("[DEMO] creates different IDs for different content", async () => {
			const input1: CreateSnapshotInput = {
				trigger: "manual",
				content: "Content 1",
				files: ["test.ts"],
				fileContents: { "test.ts": "const x = 1;" },
			};

			const input2: CreateSnapshotInput = {
				trigger: "manual",
				content: "Content 2",
				files: ["test.ts"],
				fileContents: { "test.ts": "const x = 2;" },
			};

			const snapshot1 = await storage.create(input1);
			const snapshot2 = await storage.create(input2);

			expect(snapshot1.id).not.toBe(snapshot2.id);
		});
	});

	describe("Session Manifests", () => {
		it("[DEMO] stores and retrieves session manifest", async () => {
			// First create some snapshots
			const input1: CreateSnapshotInput = {
				trigger: "auto",
				content: "File 1",
				files: ["file1.ts"],
				fileContents: { "file1.ts": "content1" },
			};

			const input2: CreateSnapshotInput = {
				trigger: "auto",
				content: "File 2",
				files: ["file2.ts"],
				fileContents: { "file2.ts": "content2" },
			};

			const snapshot1 = await storage.create(input1);
			const snapshot2 = await storage.create(input2);

			// Create a session manifest
			const sessionManifest = {
				id: `session-${Date.now()}`,
				timestamp: Date.now(),
				snapshotIds: [snapshot1.id, snapshot2.id],
				files: ["file1.ts", "file2.ts"],
				trigger: "idle" as const,
				duration: 1000,
				hasAI: false,
			};

			// Store the session manifest
			await storage.storeSessionManifest(sessionManifest);

			// Retrieve it
			const retrieved = await storage.getSessionManifest(sessionManifest.id);

			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe(sessionManifest.id);
			expect(retrieved?.snapshotIds).toEqual(sessionManifest.snapshotIds);
		});

		it("[DEMO] lists session manifests", async () => {
			// Create snapshots
			const input: CreateSnapshotInput = {
				trigger: "auto",
				content: "Test",
				files: ["test.ts"],
				fileContents: { "test.ts": "test" },
			};

			const snapshot = await storage.create(input);

			// Create multiple session manifests
			const session1 = {
				id: `session-1-${Date.now()}`,
				timestamp: Date.now(),
				snapshotIds: [snapshot.id],
				files: ["test.ts"],
				trigger: "idle" as const,
				duration: 1000,
				hasAI: false,
			};

			const session2 = {
				id: `session-2-${Date.now()}`,
				timestamp: Date.now() + 1000,
				snapshotIds: [snapshot.id],
				files: ["test.ts"],
				trigger: "blur" as const,
				duration: 2000,
				hasAI: true,
			};

			await storage.storeSessionManifest(session1);
			await storage.storeSessionManifest(session2);

			const sessions = await storage.listSessionManifests();

			expect(sessions).toHaveLength(2);
		});
	});

	describe("Performance", () => {
		it("[DEMO] creates snapshot in <50ms", async () => {
			const input: CreateSnapshotInput = {
				trigger: "manual",
				content: "Performance test",
				files: ["perf.ts"],
				fileContents: { "perf.ts": "x".repeat(1000) },
			};

			const startTime = performance.now();
			await storage.create(input);
			const duration = performance.now() - startTime;

			expect(duration).toBeLessThan(50);
		});

		it("[DEMO] retrieves snapshot in <10ms", async () => {
			const input: CreateSnapshotInput = {
				trigger: "manual",
				content: "Retrieval test",
				files: ["test.ts"],
				fileContents: { "test.ts": "const x = 1;" },
			};

			const snapshot = await storage.create(input);

			const startTime = performance.now();
			await storage.retrieve(snapshot.id);
			const duration = performance.now() - startTime;

			expect(duration).toBeLessThan(10);
		});

		it("[DEMO] lists snapshots efficiently", async () => {
			// Create 10 snapshots
			for (let i = 0; i < 10; i++) {
				const input: CreateSnapshotInput = {
					trigger: "auto",
					content: `Snapshot ${i}`,
					files: [`file${i}.ts`],
					fileContents: { [`file${i}.ts`]: `content ${i}` },
				};
				await storage.create(input);
			}

			const startTime = performance.now();
			await storage.list();
			const duration = performance.now() - startTime;

			// Should list all snapshots in <20ms
			expect(duration).toBeLessThan(20);
		});
	});

	describe("Database Initialization", () => {
		it("[DEMO] initializes database on first run", async () => {
			const newWorkspace = path.join(
				os.tmpdir(),
				`snapback-init-test-${Date.now()}`,
			);
			await fs.mkdir(newWorkspace, { recursive: true });

			const newStorage = new SqliteStorageAdapter(newWorkspace);
			await newStorage.initialize();

			// Should be able to create snapshots
			const input: CreateSnapshotInput = {
				trigger: "manual",
				content: "Init test",
				files: ["test.ts"],
				fileContents: { "test.ts": "test" },
			};

			const snapshot = await newStorage.create(input);

			expect(snapshot).toBeDefined();

			// Cleanup
			await newStorage.close();
			await fs.rm(newWorkspace, { recursive: true, force: true });
		});

		it("[DEMO] handles multiple initializations gracefully", async () => {
			// Initialize again (should be no-op)
			await storage.initialize();
			await storage.initialize();

			// Should still work
			const input: CreateSnapshotInput = {
				trigger: "manual",
				content: "Multiple init test",
				files: ["test.ts"],
				fileContents: { "test.ts": "test" },
			};

			const snapshot = await storage.create(input);

			expect(snapshot).toBeDefined();
		});
	});

	describe("Concurrent Operations", () => {
		it("[DEMO] handles concurrent snapshot creation", async () => {
			const promises = [];

			for (let i = 0; i < 5; i++) {
				const input: CreateSnapshotInput = {
					trigger: "auto",
					content: `Concurrent ${i}`,
					files: [`file${i}.ts`],
					fileContents: { [`file${i}.ts`]: `content ${i}` },
				};
				promises.push(storage.create(input));
			}

			const snapshots = await Promise.all(promises);

			expect(snapshots).toHaveLength(5);
			// All should have unique IDs
			const ids = new Set(snapshots.map((s) => s.id));
			expect(ids.size).toBe(5);
		});
	});
});
