import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	Checkpoint,
	CheckpointManager,
} from "@/checkpoint/CheckpointManager";

/**
 * CheckpointManager Test Suite
 *
 * Tests the orchestration of all checkpoint intelligence components:
 * - CheckpointDeduplicator (duplicate detection)
 * - CheckpointNamingStrategy (intelligent naming)
 * - CheckpointIconStrategy (visual classification)
 * - CheckpointDeletionService (safe deletion)
 *
 * @performance All operations must meet spec requirements
 * @security All file operations validated through PathValidator
 */

/**
 * Mock Storage implementation for testing
 */
class MockStorage {
	private checkpoints = new Map<string, Checkpoint>();

	async save(checkpoint: Checkpoint): Promise<void> {
		this.checkpoints.set(checkpoint.id, checkpoint);
	}

	async get(id: string): Promise<Checkpoint | undefined> {
		return this.checkpoints.get(id);
	}

	async getAll(): Promise<Checkpoint[]> {
		return Array.from(this.checkpoints.values());
	}

	async delete(id: string): Promise<void> {
		this.checkpoints.delete(id);
	}

	async update(id: string, updates: Partial<Checkpoint>): Promise<void> {
		const checkpoint = this.checkpoints.get(id);
		if (checkpoint) {
			Object.assign(checkpoint, updates);
		}
	}

	clear(): void {
		this.checkpoints.clear();
	}
}

/**
 * Mock ConfirmationService for testing
 */
class MockConfirmationService {
	private shouldConfirm = true;

	async confirm(_message: string, _detail?: string): Promise<boolean> {
		return this.shouldConfirm;
	}

	setConfirmation(value: boolean): void {
		this.shouldConfirm = value;
	}
}

/**
 * Mock EventEmitter for testing UI updates
 */
class MockEventEmitter {
	private events: Array<{ type: string; data: unknown }> = [];

	emit(type: string, data: unknown): void {
		this.events.push({ type, data });
	}

	getEvents(type?: string): Array<{ type: string; data: unknown }> {
		return type ? this.events.filter((e) => e.type === type) : this.events;
	}

	clear(): void {
		this.events = [];
	}
}

describe("CheckpointManager - Orchestration and Integration", () => {
	let manager: CheckpointManager;
	let mockStorage: MockStorage;
	let mockConfirmation: MockConfirmationService;
	let mockEmitter: MockEventEmitter;

	const workspaceRoot = "/workspace/test-project";

	beforeEach(async () => {
		mockStorage = new MockStorage();
		mockConfirmation = new MockConfirmationService();
		mockEmitter = new MockEventEmitter();

		// Import the actual CheckpointManager
		const { CheckpointManager } = await import(
			"@/checkpoint/CheckpointManager"
		);

		manager = new CheckpointManager(
			workspaceRoot,
			mockStorage as any,
			mockConfirmation as any,
			mockEmitter as any,
		);
	});

	describe("Checkpoint Creation - Full Workflow", () => {
		it("should create checkpoint with intelligent name and icon", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/auth.ts`,
					content: "export const login = () => {};",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);

			expect(checkpoint).toBeDefined();
			expect(checkpoint.id).toMatch(/^cp-/);
			expect(checkpoint.name).toBeTruthy();
			expect(checkpoint.files).toHaveLength(1);
			expect(checkpoint.timestamp).toBeGreaterThan(0);
			expect(checkpoint.isProtected).toBe(false);
			expect(checkpoint.icon).toBeTruthy();
			expect(checkpoint.iconColor).toBeTruthy();
		});

		it("should use custom description when provided", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/test.ts`,
					content: "test content",
					action: "add" as const,
				},
			];

			const customDescription = "My custom checkpoint";
			const checkpoint = await manager.createCheckpoint(files, {
				description: customDescription,
			});

			expect(checkpoint.name).toBe(customDescription);
		});

		it("should auto-generate name when description not provided", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/auth.ts`,
					content: "export const login = () => {};",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);

			// Should have an intelligent auto-generated name
			expect(checkpoint.name).toBeTruthy();
			expect(checkpoint.name).not.toBe("");
		});

		it("should detect and replace duplicate checkpoints", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "const x = 1;",
					action: "add" as const,
				},
			];

			// Create first checkpoint
			const checkpoint1 = await manager.createCheckpoint(files);

			// Create identical checkpoint
			const checkpoint2 = await manager.createCheckpoint(files);

			// Should have replaced the duplicate
			const allCheckpoints = await manager.getAll();
			expect(allCheckpoints).toHaveLength(1);
			expect(checkpoint2.id).toBe(checkpoint1.id);
		});

		it("should assign correct icon based on file patterns", async () => {
			const testFiles = [
				{
					path: `${workspaceRoot}/src/auth.test.ts`,
					content: "test content",
					action: "add" as const,
				},
			];

			// Use custom description to avoid keyword matching (name keywords have priority over extensions)
			const checkpoint = await manager.createCheckpoint(testFiles, {
				description: "Test suite updates",
			});

			// Test files should get beaker icon when name doesn't contain keywords
			expect(checkpoint.icon).toBe("beaker");
			expect(checkpoint.iconColor).toBeTruthy();
		});

		it("should emit checkpoint-created event", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			await manager.createCheckpoint(files);

			const events = mockEmitter.getEvents("checkpoint-created");
			expect(events).toHaveLength(1);
			expect(events[0].data).toHaveProperty("id");
		});

		it("should handle protected checkpoints", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/important.ts`,
					content: "critical code",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files, {
				protected: true,
			});

			expect(checkpoint.isProtected).toBe(true);
			expect(checkpoint.icon).toBe("lock");
		});

		it("should validate file paths before creating checkpoint", async () => {
			const invalidFiles = [
				{
					path: "/etc/passwd", // Outside workspace
					content: "malicious",
					action: "add" as const,
				},
			];

			await expect(manager.createCheckpoint(invalidFiles)).rejects.toThrow();
		});
	});

	describe("Checkpoint Retrieval", () => {
		it("should retrieve checkpoint by ID", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const created = await manager.createCheckpoint(files);
			const retrieved = await manager.get(created.id);

			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe(created.id);
			expect(retrieved?.name).toBe(created.name);
		});

		it("should return undefined for non-existent checkpoint", async () => {
			const result = await manager.get("non-existent-id");
			expect(result).toBeUndefined();
		});

		it("should retrieve all checkpoints", async () => {
			const files1 = [
				{
					path: `${workspaceRoot}/src/file1.ts`,
					content: "content1",
					action: "add" as const,
				},
			];

			const files2 = [
				{
					path: `${workspaceRoot}/src/file2.ts`,
					content: "content2",
					action: "add" as const,
				},
			];

			await manager.createCheckpoint(files1);
			await manager.createCheckpoint(files2);

			const all = await manager.getAll();
			expect(all).toHaveLength(2);
		});

		it("should retrieve checkpoints sorted by timestamp (newest first)", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			// Create checkpoints with small delays to ensure different timestamps
			const _cp1 = await manager.createCheckpoint(files, {
				description: "First",
			});
			await new Promise((resolve) => setTimeout(resolve, 10));

			const _cp2 = await manager.createCheckpoint(
				[
					{
						path: `${workspaceRoot}/src/file2.ts`,
						content: "content2",
						action: "add" as const,
					},
				],
				{ description: "Second" },
			);

			const all = await manager.getAll();
			expect(all[0].timestamp).toBeGreaterThanOrEqual(all[1].timestamp);
		});
	});

	describe("Checkpoint Deletion", () => {
		it("should delete unprotected checkpoint", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);
			mockConfirmation.setConfirmation(true);

			const result = await manager.deleteCheckpoint(checkpoint.id);

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(1);

			const retrieved = await manager.get(checkpoint.id);
			expect(retrieved).toBeUndefined();
		});

		it("should refuse to delete protected checkpoint without flag", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files, {
				protected: true,
			});

			await expect(manager.deleteCheckpoint(checkpoint.id)).rejects.toThrow(
				"protected",
			);
		});

		it("should delete protected checkpoint with unprotectFirst flag", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files, {
				protected: true,
			});

			mockConfirmation.setConfirmation(true);

			const result = await manager.deleteCheckpoint(checkpoint.id, {
				unprotectFirst: true,
			});

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(1);
		});

		it("should skip confirmation when requested", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);
			mockConfirmation.setConfirmation(false); // User would cancel

			// But skip confirmation
			const result = await manager.deleteCheckpoint(checkpoint.id, {
				skipConfirmation: true,
			});

			expect(result.success).toBe(true);
		});

		it("should emit checkpoint-deleted event", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);
			mockEmitter.clear();

			await manager.deleteCheckpoint(checkpoint.id, {
				skipConfirmation: true,
			});

			const events = mockEmitter.getEvents("checkpoint-deleted");
			expect(events).toHaveLength(1);
			expect(events[0].data).toHaveProperty("id", checkpoint.id);
		});
	});

	describe("Checkpoint Protection", () => {
		it("should protect checkpoint", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);
			await manager.protect(checkpoint.id);

			const retrieved = await manager.get(checkpoint.id);
			expect(retrieved?.isProtected).toBe(true);
			expect(retrieved?.icon).toBe("lock");
		});

		it("should unprotect checkpoint", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files, {
				protected: true,
			});

			await manager.unprotect(checkpoint.id);

			const retrieved = await manager.get(checkpoint.id);
			expect(retrieved?.isProtected).toBe(false);
		});

		it("should emit protection events", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);
			mockEmitter.clear();

			await manager.protect(checkpoint.id);

			const events = mockEmitter.getEvents("checkpoint-protected");
			expect(events).toHaveLength(1);
		});
	});

	describe("Checkpoint Renaming", () => {
		it("should rename checkpoint", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);
			const newName = "My renamed checkpoint";

			await manager.rename(checkpoint.id, newName);

			const retrieved = await manager.get(checkpoint.id);
			expect(retrieved?.name).toBe(newName);
		});

		it("should emit checkpoint-renamed event", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);
			mockEmitter.clear();

			await manager.rename(checkpoint.id, "New name");

			const events = mockEmitter.getEvents("checkpoint-renamed");
			expect(events).toHaveLength(1);
		});

		it("should throw error for non-existent checkpoint", async () => {
			await expect(
				manager.rename("non-existent", "New name"),
			).rejects.toThrow();
		});
	});

	describe("Bulk Operations", () => {
		it("should delete older checkpoints", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			// Create old checkpoint
			const oldCheckpoint = await manager.createCheckpoint(files, {
				description: "Old",
			});

			// Manually set old timestamp
			const storage = mockStorage as any;
			const cp = await storage.get(oldCheckpoint.id);
			if (cp) {
				cp.timestamp = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago
				await storage.update(oldCheckpoint.id, cp);
			}

			// Create new checkpoint
			await manager.createCheckpoint(
				[
					{
						path: `${workspaceRoot}/src/file2.ts`,
						content: "content2",
						action: "add" as const,
					},
				],
				{ description: "New" },
			);

			const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
			const result = await manager.deleteOlderThan(cutoffTime);

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(1);

			const all = await manager.getAll();
			expect(all).toHaveLength(1);
			expect(all[0].name).toContain("New");
		});

		it("should auto-cleanup old checkpoints", async () => {
			// Create 5 old checkpoints with unique content (avoid deduplication)
			for (let i = 0; i < 5; i++) {
				const files = [
					{
						path: `${workspaceRoot}/src/file${i}.ts`,
						content: `content ${i}`,
						action: "add" as const,
					},
				];

				const cp = await manager.createCheckpoint(files, {
					description: `Old ${i}`,
				});

				const storage = mockStorage as any;
				const checkpoint = await storage.get(cp.id);
				if (checkpoint) {
					checkpoint.timestamp = Date.now() - 45 * 24 * 60 * 60 * 1000;
					await storage.update(cp.id, checkpoint);
				}
			}

			const result = await manager.autoCleanup({
				enabled: true,
				olderThanDays: 30,
				keepProtected: true,
				minimumCheckpoints: 3,
			});

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(2); // Should delete only 2, keeping 3 minimum

			const all = await manager.getAll();
			expect(all).toHaveLength(3);
		});
	});

	describe("Error Handling", () => {
		it("should handle storage errors gracefully", async () => {
			// Mock storage failure
			vi.spyOn(mockStorage, "save").mockRejectedValueOnce(
				new Error("Storage failure"),
			);

			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			await expect(manager.createCheckpoint(files)).rejects.toThrow(
				"Storage failure",
			);
		});

		it("should validate checkpoint exists before operations", async () => {
			await expect(manager.protect("non-existent")).rejects.toThrow();
			await expect(manager.unprotect("non-existent")).rejects.toThrow();
			await expect(manager.rename("non-existent", "name")).rejects.toThrow();
		});

		it("should handle empty file arrays", async () => {
			await expect(manager.createCheckpoint([])).rejects.toThrow();
		});
	});

	describe("Performance", () => {
		it("should create checkpoint in <50ms", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const start = performance.now();
			await manager.createCheckpoint(files);
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(50);
		});

		it("should retrieve checkpoint in <10ms", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);

			const start = performance.now();
			await manager.get(checkpoint.id);
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(10);
		});

		it("should handle large file sets efficiently", async () => {
			// Create checkpoint with 100 files
			const files = Array.from({ length: 100 }, (_, i) => ({
				path: `${workspaceRoot}/src/file${i}.ts`,
				content: `content ${i}`,
				action: "add" as const,
			}));

			const start = performance.now();
			await manager.createCheckpoint(files);
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(200); // Should still be fast
		});
	});

	describe("Integration with Components", () => {
		it("should use deduplicator for duplicate detection", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const cp1 = await manager.createCheckpoint(files);
			const cp2 = await manager.createCheckpoint(files);

			// Should reuse the same checkpoint
			expect(cp2.id).toBe(cp1.id);
		});

		it("should use naming strategy for intelligent names", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/auth.test.ts`,
					content: 'test("should login")',
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files);

			// Should generate intelligent name based on test file
			expect(checkpoint.name).toBeTruthy();
		});

		it("should use icon strategy for visual classification", async () => {
			const testFiles = [
				{
					path: `${workspaceRoot}/src/auth.test.ts`,
					content: "test content",
					action: "add" as const,
				},
			];

			// Use custom description to avoid keyword matching
			const checkpoint = await manager.createCheckpoint(testFiles, {
				description: "Test suite updates",
			});

			// Test files should get beaker icon when name doesn't contain keywords
			expect(checkpoint.icon).toBe("beaker");
		});

		it("should use deletion service for safe deletion", async () => {
			const files = [
				{
					path: `${workspaceRoot}/src/file.ts`,
					content: "content",
					action: "add" as const,
				},
			];

			const checkpoint = await manager.createCheckpoint(files, {
				protected: true,
			});

			// Should throw when trying to delete protected checkpoint
			await expect(manager.deleteCheckpoint(checkpoint.id)).rejects.toThrow();
		});
	});
});
