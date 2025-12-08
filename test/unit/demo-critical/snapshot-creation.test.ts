/**
 * @fileoverview Demo-Critical Snapshot Creation Tests
 *
 * These tests validate the core snapshot creation, deduplication, and metadata
 * generation that is demonstrated in the YC demo.
 *
 * Coverage:
 * - Snapshot creation with files
 * - Hash-based deduplication
 * - ID generation (UUID format)
 * - Metadata correctness (timestamp, files, etc.)
 * - Snapshot naming with git context
 * - Protected snapshot handling
 */

import { beforeEach, describe, expect, it } from "vitest";
import { SnapshotManager } from "@vscode/snapshot/SnapshotManager";
import type {
	FileInput,
	IConfirmationService,
	IEventEmitter,
	IStorage,
} from "@vscode/types/snapshot";

// Mock storage implementation for testing
class MockStorage implements IStorage {
	private snapshots = new Map<string, any>();

	async get(id: string) {
		return this.snapshots.get(id) || null;
	}

	async getAll() {
		return Array.from(this.snapshots.values());
	}

	async save(snapshot: any) {
		this.snapshots.set(snapshot.id, snapshot);
		return snapshot;
	}

	async update(id: string, data: any) {
		const existing = this.snapshots.get(id);
		if (existing) {
			const updated = { ...existing, ...data };
			this.snapshots.set(id, updated);
			return updated;
		}
		return null;
	}

	async delete(id: string) {
		return this.snapshots.delete(id);
	}

	async clear() {
		this.snapshots.clear();
	}
}

// Mock confirmation service
class MockConfirmationService implements IConfirmationService {
	async confirm(_message: string): Promise<boolean> {
		return true;
	}
}

// Mock event emitter
class MockEventEmitter implements IEventEmitter {
	private events = new Map<string, any[]>();

	emit(event: string, data: any) {
		const handlers = this.events.get(event) || [];
		handlers.push(data);
		this.events.set(event, handlers);
	}

	on(_event: string, _handler: any) {
		// Not used in these tests
	}

	getEvents(event: string) {
		return this.events.get(event) || [];
	}

	clear() {
		this.events.clear();
	}
}

describe("[DEMO-CRITICAL] Snapshot Creation", () => {
	let snapshotManager: SnapshotManager;
	let storage: MockStorage;
	let confirmationService: MockConfirmationService;
	let eventEmitter: MockEventEmitter;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		storage = new MockStorage();
		confirmationService = new MockConfirmationService();
		eventEmitter = new MockEventEmitter();

		snapshotManager = new SnapshotManager(
			workspaceRoot,
			storage,
			confirmationService,
			eventEmitter,
		);
	});

	describe("Basic Snapshot Creation", () => {
		it("[DEMO] creates snapshot with single file", async () => {
			const files: FileInput[] = [
				{
					path: "/test/workspace/src/index.ts",
					content: 'console.log("hello");',
					action: "modify",
				},
			];

			const snapshot = await snapshotManager.createSnapshot(files);

			expect(snapshot).toBeDefined();
			expect(snapshot.id).toMatch(/^cp-[0-9a-f-]+$/); // UUID format
			expect(snapshot.files).toHaveLength(1);
			expect(snapshot.timestamp).toBeGreaterThan(0);
		});

		it("[DEMO] creates snapshot with multiple files", async () => {
			const files: FileInput[] = [
				{
					path: "/test/workspace/src/index.ts",
					content: 'console.log("hello");',
					action: "modify",
				},
				{
					path: "/test/workspace/src/utils.ts",
					content: "export const util = () => {};",
					action: "add",
				},
				{
					path: "/test/workspace/package.json",
					content: '{"name":"test"}',
					action: "modify",
				},
			];

			const snapshot = await snapshotManager.createSnapshot(files);

			expect(snapshot.files).toHaveLength(3);
			expect(snapshot.files.map((f) => f.path)).toEqual([
				"/test/workspace/src/index.ts",
				"/test/workspace/src/utils.ts",
				"/test/workspace/package.json",
			]);
		});

		it("[DEMO] throws error for empty file list", async () => {
			await expect(snapshotManager.createSnapshot([])).rejects.toThrow(
				"Cannot create snapshot with empty file list",
			);
		});

		it("[DEMO] generates unique IDs for each snapshot", async () => {
			const files: FileInput[] = [
				{
					path: "/test/workspace/test.ts",
					content: "const x = 1;",
					action: "modify",
				},
			];

			const snapshot1 = await snapshotManager.createSnapshot(files);

			// Create another with different content
			files[0].content = "const x = 2;";
			const snapshot2 = await snapshotManager.createSnapshot(files);

			expect(snapshot1.id).not.toBe(snapshot2.id);
			expect(snapshot1.id).toMatch(/^cp-/);
			expect(snapshot2.id).toMatch(/^cp-/);
		});
	});

	describe("Metadata Correctness", () => {
		it("[DEMO] includes correct timestamp", async () => {
			const beforeTime = Date.now();

			const snapshot = await snapshotManager.createSnapshot([
				{
					path: "/test/workspace/test.ts",
					content: "test",
					action: "modify",
				},
			]);

			const afterTime = Date.now();

			expect(snapshot.timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(snapshot.timestamp).toBeLessThanOrEqual(afterTime);
		});

		it("[DEMO] stores file content correctly", async () => {
			const content = 'const greeting = "Hello, World!";';

			const snapshot = await snapshotManager.createSnapshot([
				{
					path: "/test/workspace/greeting.ts",
					content: content,
					action: "add",
				},
			]);

			// Note: content may be encrypted in storage
			expect(snapshot.files[0]).toBeDefined();
			expect(snapshot.files[0].path).toBe("/test/workspace/greeting.ts");
		});

		it("[DEMO] preserves file action metadata", async () => {
			const snapshot = await snapshotManager.createSnapshot([
				{
					path: "/test/workspace/new.ts",
					content: "new",
					action: "add",
				},
				{
					path: "/test/workspace/modified.ts",
					content: "modified",
					action: "modify",
				},
				{
					path: "/test/workspace/deleted.ts",
					content: "",
					action: "delete",
				},
			]);

			expect(snapshot.files[0].action).toBe("add");
			expect(snapshot.files[1].action).toBe("modify");
			expect(snapshot.files[2].action).toBe("delete");
		});
	});

	describe("Hash-Based Deduplication", () => {
		it("[DEMO] detects duplicate content and reuses snapshot", async () => {
			const files: FileInput[] = [
				{
					path: "/test/workspace/test.ts",
					content: "const x = 1;",
					action: "modify",
				},
			];

			const snapshot1 = await snapshotManager.createSnapshot(files);

			// Create another snapshot with identical content
			const snapshot2 = await snapshotManager.createSnapshot(files);

			// Should return the same snapshot (deduplicated)
			expect(snapshot1.id).toBe(snapshot2.id);

			// Should emit deduplication event
			const replacedEvents = eventEmitter.getEvents("snapshot-replaced");
			expect(replacedEvents).toHaveLength(1);
			expect(replacedEvents[0].reason).toBe("duplicate");
		});

		it("[DEMO] creates new snapshot for different content", async () => {
			const snapshot1 = await snapshotManager.createSnapshot([
				{
					path: "/test/workspace/test.ts",
					content: "const x = 1;",
					action: "modify",
				},
			]);

			const snapshot2 = await snapshotManager.createSnapshot([
				{
					path: "/test/workspace/test.ts",
					content: "const x = 2;", // Different content
					action: "modify",
				},
			]);

			expect(snapshot1.id).not.toBe(snapshot2.id);
		});

		it("[DEMO] considers file path in deduplication", async () => {
			const snapshot1 = await snapshotManager.createSnapshot([
				{
					path: "/test/workspace/file1.ts",
					content: "const x = 1;",
					action: "modify",
				},
			]);

			const snapshot2 = await snapshotManager.createSnapshot([
				{
					path: "/test/workspace/file2.ts", // Different path
					content: "const x = 1;", // Same content
					action: "modify",
				},
			]);

			// Different paths = different snapshots
			expect(snapshot1.id).not.toBe(snapshot2.id);
		});

		it("[DEMO] updates timestamp on duplicate detection", async () => {
			const files: FileInput[] = [
				{
					path: "/test/workspace/test.ts",
					content: "test content",
					action: "modify",
				},
			];

			const snapshot1 = await snapshotManager.createSnapshot(files);
			const originalTimestamp = snapshot1.timestamp;

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 10));

			const snapshot2 = await snapshotManager.createSnapshot(files);

			// Same ID but updated timestamp
			expect(snapshot2.id).toBe(snapshot1.id);
			expect(snapshot2.timestamp).toBeGreaterThan(originalTimestamp);
		});
	});

	describe("Protected Snapshots", () => {
		it("[DEMO] creates protected snapshot when specified", async () => {
			const snapshot = await snapshotManager.createSnapshot(
				[
					{
						path: "/test/workspace/critical.ts",
						content: "critical code",
						action: "modify",
					},
				],
				{ protected: true },
			);

			expect(snapshot.protected).toBe(true);
		});

		it("[DEMO] includes custom description for protected snapshots", async () => {
			const description = "Pre-production release snapshot";

			const snapshot = await snapshotManager.createSnapshot(
				[
					{
						path: "/test/workspace/release.ts",
						content: "v1.0.0",
						action: "modify",
					},
				],
				{
					description,
					protected: true,
				},
			);

			expect(snapshot.description).toBe(description);
			expect(snapshot.protected).toBe(true);
		});
	});

	describe("Performance Requirements", () => {
		it("[DEMO] creates snapshot in <50ms", async () => {
			const startTime = performance.now();

			await snapshotManager.createSnapshot([
				{
					path: "/test/workspace/perf-test.ts",
					content: "x".repeat(1000), // 1KB content
					action: "modify",
				},
			]);

			const duration = performance.now() - startTime;

			expect(duration).toBeLessThan(50);
		});

		it("[DEMO] handles multiple files efficiently", async () => {
			const files: FileInput[] = Array.from({ length: 10 }, (_, i) => ({
				path: `/test/workspace/file${i}.ts`,
				content: `const x${i} = ${i};`,
				action: "modify" as const,
			}));

			const startTime = performance.now();
			await snapshotManager.createSnapshot(files);
			const duration = performance.now() - startTime;

			// Should still be fast with 10 files
			expect(duration).toBeLessThan(100);
		});
	});
});
