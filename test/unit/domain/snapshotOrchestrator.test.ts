import { describe, it, expect, beforeEach, vi } from "vitest";
import { SnapshotOrchestrator } from "@vscode/domain/snapshotOrchestrator";
import type { ProtectionDecision, FileInfo } from "@vscode/types";
import type { IKeyValueStorage } from "@snapback/sdk";

class MockStorage implements IKeyValueStorage {
	private storage = new Map<string, unknown>();

	async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
		return (this.storage.get(key) ?? defaultValue) as T | undefined;
	}

	async set<T>(key: string, value: T): Promise<void> {
		this.storage.set(key, value);
	}
}

describe("SnapshotOrchestrator", () => {
	let orchestrator: SnapshotOrchestrator;
	let storage: MockStorage;

	beforeEach(() => {
		storage = new MockStorage();
		orchestrator = new SnapshotOrchestrator("test-repo", undefined, storage);
	});

	describe("Persistence", () => {
		it("should persist snapshots to storage after creation", async () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["burst_pattern"],
				confidence: 0.85,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 65,
					burstDetected: true,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "test.ts",
					extension: ".ts",
					sizeBytes: 1000,
					isNew: false,
					isBinary: false,
					nextHash: "hash1",
				},
			];

			await orchestrator.createSnapshot(decision, files);

			const storedSnapshots = await storage.get<unknown[]>(
				"snapback.snapshots",
			);
			expect(storedSnapshots).toBeDefined();
			expect(Array.isArray(storedSnapshots)).toBe(true);
			expect((storedSnapshots as any[]).length).toBe(1);
		});

		it("should load snapshots from storage on init", async () => {
			const savedSnapshots = [
				{
					id: "snap-1",
					name: "Test Snapshot",
					timestamp: Date.now() - 1000,
					fileCount: 1,
					totalSize: 5000,
					recoverable: true,
					checksum: "checksum-1",
					metadata: {
						riskScore: 50,
						aiDetected: false,
						filesCount: 1,
						totalSize: 5000,
						createdAt: Date.now() - 1000,
					},
				},
			];

			await storage.set("snapback.snapshots", savedSnapshots);

			const newOrchestrator = new SnapshotOrchestrator(
				"test-repo",
				undefined,
				storage,
			);

			// Wait for async load
			await new Promise((resolve) => setTimeout(resolve, 100));

			const snapshots = newOrchestrator.getSnapshots();
			expect(snapshots.length).toBe(1);
			expect(snapshots[0].id).toBe("snap-1");
		});
	});

	describe("File content storage", () => {
		it("should store file info in snapshots", async () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.8,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 55,
					burstDetected: false,
					containsCriticalFiles: true,
					criticalFileCount: 1,
				},
			};

			const files: FileInfo[] = [
				{
					path: "config.json",
					extension: ".json",
					sizeBytes: 256,
					isNew: false,
					isBinary: false,
					nextHash: "hash1",
				},
				{
					path: "package.json",
					extension: ".json",
					sizeBytes: 512,
					isNew: false,
					isBinary: false,
					nextHash: "hash2",
				},
			];

			const snapshot = await orchestrator.createSnapshot(decision, files);

			expect(snapshot).not.toBeNull();
			expect(snapshot?.fileCount).toBe(2);
			expect(snapshot?.totalSize).toBe(768);
		});

		it("should exclude binary files", async () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.7,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 45,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "image.png",
					extension: ".png",
					sizeBytes: 50000,
					isNew: false,
					isBinary: true,
					nextHash: "hash1",
				},
				{
					path: "text.txt",
					extension: ".txt",
					sizeBytes: 100,
					isNew: false,
					isBinary: false,
					nextHash: "hash2",
				},
			];

			const snapshot = await orchestrator.createSnapshot(decision, files);

			expect(snapshot?.fileCount).toBe(1);
			expect(snapshot?.totalSize).toBe(100);
		});
	});

	describe("Deduplication", () => {
		it("should calculate checksum for files", async () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.75,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 50,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "file-a.ts",
					extension: ".ts",
					sizeBytes: 500,
					isNew: false,
					isBinary: false,
					nextHash: "hash-a",
				},
			];

			const snapshot = await orchestrator.createSnapshot(decision, files);

			expect(snapshot?.checksum).toBeDefined();
			expect(snapshot?.checksum).toMatch(/^checksum-/);
		});
	});

	describe("Storage limits", () => {
		it("should respect max snapshots limit", async () => {
			const limitedOrch = new SnapshotOrchestrator("test-repo", {
				maxSnapshots: 2,
				maxStorageBytes: 1024 * 1024 * 100,
				snapshotRetentionDays: 7,
			});

			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.75,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 50,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "file.ts",
					extension: ".ts",
					sizeBytes: 100,
					isNew: false,
					isBinary: false,
					nextHash: "hash",
				},
			];

			await limitedOrch.createSnapshot(decision, files);
			await limitedOrch.createSnapshot(decision, files);
			await limitedOrch.createSnapshot(decision, files);

			const snapshots = limitedOrch.getSnapshots();
			expect(snapshots.length).toBeLessThanOrEqual(2);
		});

		it("should enforce storage size limit", async () => {
			const limitedOrch = new SnapshotOrchestrator("test-repo", {
				maxSnapshots: 100,
				maxStorageBytes: 300, // Very tight limit
				snapshotRetentionDays: 7,
			});

			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.75,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 50,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "large.ts",
					extension: ".ts",
					sizeBytes: 200,
					isNew: false,
					isBinary: false,
					nextHash: "hash",
				},
			];

			await limitedOrch.createSnapshot(decision, files);
			await limitedOrch.createSnapshot(decision, files);

			// Should have removed first snapshot due to size limit
			const snapshots = limitedOrch.getSnapshots();
			expect(snapshots.length).toBeLessThanOrEqual(1);
		});
	});

	describe("Expiration cleanup", () => {
		it("should remove old snapshots", async () => {
			const oldDecision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.75,
				context: {
					repoId: "test-repo",
					timestamp: Date.now() - 1000 * 60 * 60 * 24 * 8, // 8 days ago
					files: [],
					riskScore: 50,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "old.ts",
					extension: ".ts",
					sizeBytes: 100,
					isNew: false,
					isBinary: false,
					nextHash: "hash",
				},
			];

			await orchestrator.createSnapshot(oldDecision, files);
			expect(orchestrator.getSnapshots().length).toBe(1);

			await orchestrator.cleanup();

			expect(orchestrator.getSnapshots().length).toBe(0);
		});

		it("should keep recent snapshots", async () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.75,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 50,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "recent.ts",
					extension: ".ts",
					sizeBytes: 100,
					isNew: false,
					isBinary: false,
					nextHash: "hash",
				},
			];

			await orchestrator.createSnapshot(decision, files);

			await orchestrator.cleanup();

			expect(orchestrator.getSnapshots().length).toBe(1);
		});
	});

	describe("Recovery", () => {
		it("should list recoverable snapshots", async () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.75,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 50,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "file.ts",
					extension: ".ts",
					sizeBytes: 100,
					isNew: false,
					isBinary: false,
					nextHash: "hash",
				},
			];

			await orchestrator.createSnapshot(decision, files);
			await orchestrator.createSnapshot(decision, files);

			const recoverable = orchestrator.getRecoverableSnapshots();

			expect(recoverable.length).toBe(2);
			expect(recoverable.every((s) => s.recoverable)).toBe(true);
		});

		it("should retrieve snapshot by ID", async () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.75,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 50,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "file.ts",
					extension: ".ts",
					sizeBytes: 100,
					isNew: false,
					isBinary: false,
					nextHash: "hash",
				},
			];

			const created = await orchestrator.createSnapshot(decision, files);

			if (created) {
				const retrieved = orchestrator.getSnapshot(created.id);
				expect(retrieved).toBeDefined();
				expect(retrieved?.id).toBe(created.id);
			}
		});

		it("should restore snapshot", async () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.75,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 50,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "app.ts",
					extension: ".ts",
					sizeBytes: 200,
					isNew: false,
					isBinary: false,
					nextHash: "hash1",
				},
			];

			const created = await orchestrator.createSnapshot(decision, files);

			if (created) {
				const result = await orchestrator.restoreSnapshot(created.id);
				expect(result.success).toBe(true);
				expect(result.filesRestored).toBeGreaterThan(0);
			}
		});
	});

	describe("Statistics", () => {
		it("should report storage stats", async () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: false,
				reasons: ["auto"],
				confidence: 0.75,
				context: {
					repoId: "test-repo",
					timestamp: Date.now(),
					files: [],
					riskScore: 50,
					burstDetected: false,
					containsCriticalFiles: false,
					criticalFileCount: 0,
				},
			};

			const files: FileInfo[] = [
				{
					path: "file1.ts",
					extension: ".ts",
					sizeBytes: 1000,
					isNew: false,
					isBinary: false,
					nextHash: "hash1",
				},
				{
					path: "file2.ts",
					extension: ".ts",
					sizeBytes: 2000,
					isNew: false,
					isBinary: false,
					nextHash: "hash2",
				},
			];

			await orchestrator.createSnapshot(decision, files);

			const stats = orchestrator.getStorageStats();

			expect(stats.snapshotCount).toBe(1);
			expect(stats.used).toBe(3000);
			expect(stats.available).toBeGreaterThan(0);
			// Check that utilization percent is a valid number >= 0
			// With 3000 bytes out of 1GB default, this will be ~0.0%
			const utilization = parseFloat(stats.utilizationPercent);
			expect(utilization).toBeGreaterThanOrEqual(0);
			expect(utilization).toBeLessThanOrEqual(100);
		});
	});
});
