import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AutoCleanupConfig,
	CheckpointDeletionService,
} from "@/checkpoint/CheckpointDeletionService";

/**
 * Mock Checkpoint interface for testing
 */
interface MockCheckpoint {
	id: string;
	name: string;
	timestamp: number;
	isProtected: boolean;
	files: string[];
}

/**
 * Mock CheckpointManager for testing
 */
class MockCheckpointManager {
	private checkpoints = new Map<string, MockCheckpoint>();

	async get(id: string): Promise<MockCheckpoint | undefined> {
		return this.checkpoints.get(id);
	}

	async getAll(): Promise<MockCheckpoint[]> {
		return Array.from(this.checkpoints.values());
	}

	async delete(id: string): Promise<void> {
		this.checkpoints.delete(id);
	}

	async unprotect(id: string): Promise<void> {
		const checkpoint = this.checkpoints.get(id);
		if (checkpoint) {
			checkpoint.isProtected = false;
		}
	}

	add(checkpoint: MockCheckpoint): void {
		this.checkpoints.set(checkpoint.id, checkpoint);
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

describe("CheckpointDeletionService - Safety Checks and Deletion", () => {
	let deletionService: CheckpointDeletionService;
	let mockManager: MockCheckpointManager;
	let mockConfirmation: MockConfirmationService;

	beforeEach(async () => {
		mockManager = new MockCheckpointManager();
		mockConfirmation = new MockConfirmationService();

		// Import the actual service
		const { CheckpointDeletionService } = await import(
			"@/checkpoint/CheckpointDeletionService"
		);
		deletionService = new CheckpointDeletionService(
			mockManager as any,
			mockConfirmation as any,
		);
	});

	describe("Single Checkpoint Deletion", () => {
		it("should delete unprotected checkpoint successfully", async () => {
			const checkpoint: MockCheckpoint = {
				id: "cp1",
				name: "Test checkpoint",
				timestamp: Date.now(),
				isProtected: false,
				files: ["test.ts"],
			};

			mockManager.add(checkpoint);
			mockConfirmation.setConfirmation(true);

			const result = await deletionService.deleteCheckpoint("cp1");

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(1);
			expect(result.error).toBeUndefined();
			expect(await mockManager.get("cp1")).toBeUndefined();
		});

		it("should throw error for protected checkpoint without unprotectFirst", async () => {
			const checkpoint: MockCheckpoint = {
				id: "cp2",
				name: "Protected checkpoint",
				timestamp: Date.now(),
				isProtected: true,
				files: ["important.ts"],
			};

			mockManager.add(checkpoint);

			await expect(deletionService.deleteCheckpoint("cp2")).rejects.toThrow(
				"Cannot delete protected checkpoint",
			);
		});

		it("should unprotect and delete with unprotectFirst=true", async () => {
			const checkpoint: MockCheckpoint = {
				id: "cp3",
				name: "Protected checkpoint",
				timestamp: Date.now(),
				isProtected: true,
				files: ["important.ts"],
			};

			mockManager.add(checkpoint);
			mockConfirmation.setConfirmation(true);

			const result = await deletionService.deleteCheckpoint("cp3", {
				unprotectFirst: true,
			});

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(1);
			expect(await mockManager.get("cp3")).toBeUndefined();
		});

		it("should skip confirmation with skipConfirmation=true", async () => {
			const checkpoint: MockCheckpoint = {
				id: "cp4",
				name: "Test checkpoint",
				timestamp: Date.now(),
				isProtected: false,
				files: ["test.ts"],
			};

			mockManager.add(checkpoint);
			mockConfirmation.setConfirmation(false); // User would cancel

			// But skip confirmation
			const result = await deletionService.deleteCheckpoint("cp4", {
				skipConfirmation: true,
			});

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(1);
		});

		it("should return error on user cancellation", async () => {
			const checkpoint: MockCheckpoint = {
				id: "cp5",
				name: "Test checkpoint",
				timestamp: Date.now(),
				isProtected: false,
				files: ["test.ts"],
			};

			mockManager.add(checkpoint);
			mockConfirmation.setConfirmation(false);

			const result = await deletionService.deleteCheckpoint("cp5");

			expect(result.success).toBe(false);
			expect(result.deletedCount).toBe(0);
			expect(result.error).toContain("cancelled");
			expect(await mockManager.get("cp5")).toBeDefined();
		});

		it("should return correct DeletionResult structure", async () => {
			const checkpoint: MockCheckpoint = {
				id: "cp6",
				name: "Test checkpoint",
				timestamp: Date.now(),
				isProtected: false,
				files: ["test.ts"],
			};

			mockManager.add(checkpoint);
			mockConfirmation.setConfirmation(true);

			const result = await deletionService.deleteCheckpoint("cp6");

			expect(result).toHaveProperty("success");
			expect(result).toHaveProperty("deletedCount");
			expect(typeof result.success).toBe("boolean");
			expect(typeof result.deletedCount).toBe("number");
		});
	});

	describe("Bulk Deletion (deleteOlderThan)", () => {
		it("should delete all checkpoints older than timestamp", async () => {
			const now = Date.now();
			const oldTime = now - 30 * 24 * 60 * 60 * 1000; // 30 days ago

			mockManager.add({
				id: "old1",
				name: "Old 1",
				timestamp: oldTime,
				isProtected: false,
				files: [],
			});

			mockManager.add({
				id: "old2",
				name: "Old 2",
				timestamp: oldTime - 1000,
				isProtected: false,
				files: [],
			});

			mockManager.add({
				id: "new1",
				name: "New 1",
				timestamp: now,
				isProtected: false,
				files: [],
			});

			const cutoffTime = now - 15 * 24 * 60 * 60 * 1000; // 15 days ago
			const result = await deletionService.deleteOlderThan(cutoffTime);

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(2);
			expect(await mockManager.get("old1")).toBeUndefined();
			expect(await mockManager.get("old2")).toBeUndefined();
			expect(await mockManager.get("new1")).toBeDefined();
		});

		it("should keep protected checkpoints when keepProtected=true", async () => {
			const now = Date.now();
			const oldTime = now - 30 * 24 * 60 * 60 * 1000;

			mockManager.add({
				id: "old-protected",
				name: "Old Protected",
				timestamp: oldTime,
				isProtected: true,
				files: [],
			});

			mockManager.add({
				id: "old-unprotected",
				name: "Old Unprotected",
				timestamp: oldTime,
				isProtected: false,
				files: [],
			});

			const cutoffTime = now - 15 * 24 * 60 * 60 * 1000;
			const result = await deletionService.deleteOlderThan(cutoffTime, true);

			expect(result.deletedCount).toBe(1);
			expect(await mockManager.get("old-protected")).toBeDefined();
			expect(await mockManager.get("old-unprotected")).toBeUndefined();
		});

		it("should delete protected checkpoints when keepProtected=false", async () => {
			const now = Date.now();
			const oldTime = now - 30 * 24 * 60 * 60 * 1000;

			mockManager.add({
				id: "old-protected",
				name: "Old Protected",
				timestamp: oldTime,
				isProtected: true,
				files: [],
			});

			const cutoffTime = now - 15 * 24 * 60 * 60 * 1000;
			const result = await deletionService.deleteOlderThan(cutoffTime, false);

			expect(result.deletedCount).toBe(1);
			expect(await mockManager.get("old-protected")).toBeUndefined();
		});

		it("should return correct deletedCount", async () => {
			const now = Date.now();
			const oldTime = now - 30 * 24 * 60 * 60 * 1000;

			for (let i = 0; i < 5; i++) {
				mockManager.add({
					id: `old${i}`,
					name: `Old ${i}`,
					timestamp: oldTime,
					isProtected: false,
					files: [],
				});
			}

			const cutoffTime = now - 15 * 24 * 60 * 60 * 1000;
			const result = await deletionService.deleteOlderThan(cutoffTime);

			expect(result.deletedCount).toBe(5);
		});

		it("should handle empty checkpoint list", async () => {
			const now = Date.now();
			const cutoffTime = now - 15 * 24 * 60 * 60 * 1000;

			const result = await deletionService.deleteOlderThan(cutoffTime);

			expect(result.success).toBe(true);
			expect(result.deletedCount).toBe(0);
		});
	});

	describe("Auto Cleanup", () => {
		it("should respect enabled flag", async () => {
			const config: AutoCleanupConfig = {
				enabled: false,
				olderThanDays: 30,
				keepProtected: true,
				minimumCheckpoints: 10,
			};

			mockManager.add({
				id: "cp1",
				name: "Test",
				timestamp: Date.now() - 60 * 24 * 60 * 60 * 1000,
				isProtected: false,
				files: [],
			});

			const result = await deletionService.autoCleanup(config);

			// Should not delete anything when disabled
			expect(result.deletedCount).toBe(0);
			expect(await mockManager.get("cp1")).toBeDefined();
		});

		it("should respect olderThanDays setting", async () => {
			const now = Date.now();
			const config: AutoCleanupConfig = {
				enabled: true,
				olderThanDays: 30,
				keepProtected: true,
				minimumCheckpoints: 0,
			};

			mockManager.add({
				id: "old",
				name: "Old",
				timestamp: now - 45 * 24 * 60 * 60 * 1000, // 45 days ago
				isProtected: false,
				files: [],
			});

			mockManager.add({
				id: "recent",
				name: "Recent",
				timestamp: now - 15 * 24 * 60 * 60 * 1000, // 15 days ago
				isProtected: false,
				files: [],
			});

			const result = await deletionService.autoCleanup(config);

			expect(result.deletedCount).toBe(1);
			expect(await mockManager.get("old")).toBeUndefined();
			expect(await mockManager.get("recent")).toBeDefined();
		});

		it("should respect keepProtected setting", async () => {
			const now = Date.now();
			const config: AutoCleanupConfig = {
				enabled: true,
				olderThanDays: 30,
				keepProtected: true,
				minimumCheckpoints: 0,
			};

			mockManager.add({
				id: "old-protected",
				name: "Old Protected",
				timestamp: now - 45 * 24 * 60 * 60 * 1000,
				isProtected: true,
				files: [],
			});

			const result = await deletionService.autoCleanup(config);

			expect(result.deletedCount).toBe(0);
			expect(await mockManager.get("old-protected")).toBeDefined();
		});

		it("should never delete below minimumCheckpoints", async () => {
			const now = Date.now();
			const config: AutoCleanupConfig = {
				enabled: true,
				olderThanDays: 30,
				keepProtected: false,
				minimumCheckpoints: 3,
			};

			// Add 5 old checkpoints
			for (let i = 0; i < 5; i++) {
				mockManager.add({
					id: `old${i}`,
					name: `Old ${i}`,
					timestamp: now - 45 * 24 * 60 * 60 * 1000,
					isProtected: false,
					files: [],
				});
			}

			const result = await deletionService.autoCleanup(config);

			// Should delete only 2, keeping 3 minimum
			expect(result.deletedCount).toBe(2);
			expect((await mockManager.getAll()).length).toBe(3);
		});

		it("should handle minimumCheckpoints=0", async () => {
			const now = Date.now();
			const config: AutoCleanupConfig = {
				enabled: true,
				olderThanDays: 30,
				keepProtected: false,
				minimumCheckpoints: 0,
			};

			mockManager.add({
				id: "old",
				name: "Old",
				timestamp: now - 45 * 24 * 60 * 60 * 1000,
				isProtected: false,
				files: [],
			});

			const result = await deletionService.autoCleanup(config);

			expect(result.deletedCount).toBe(1);
			expect((await mockManager.getAll()).length).toBe(0);
		});
	});

	describe("Safety Checks", () => {
		it("canDelete() should return false for protected checkpoint", () => {
			const checkpoint: MockCheckpoint = {
				id: "protected",
				name: "Protected",
				timestamp: Date.now(),
				isProtected: true,
				files: [],
			};

			const canDelete = deletionService.canDelete(checkpoint as any);
			expect(canDelete).toBe(false);
		});

		it("canDelete() should return true for unprotected checkpoint", () => {
			const checkpoint: MockCheckpoint = {
				id: "unprotected",
				name: "Unprotected",
				timestamp: Date.now(),
				isProtected: false,
				files: [],
			};

			const canDelete = deletionService.canDelete(checkpoint as any);
			expect(canDelete).toBe(true);
		});

		it("should validate checkpoint exists before deletion", async () => {
			await expect(
				deletionService.deleteCheckpoint("nonexistent"),
			).rejects.toThrow();
		});
	});

	describe("Integration", () => {
		it("should update UI after deletion", async () => {
			// This would normally trigger UI refresh
			// For now, just verify deletion completes
			mockManager.add({
				id: "cp1",
				name: "Test",
				timestamp: Date.now(),
				isProtected: false,
				files: [],
			});

			const result = await deletionService.deleteCheckpoint("cp1", {
				skipConfirmation: true,
			});

			expect(result.success).toBe(true);
		});

		it("should handle multiple rapid deletions", async () => {
			for (let i = 0; i < 10; i++) {
				mockManager.add({
					id: `cp${i}`,
					name: `Test ${i}`,
					timestamp: Date.now(),
					isProtected: false,
					files: [],
				});
			}

			const promises = [];
			for (let i = 0; i < 10; i++) {
				promises.push(
					deletionService.deleteCheckpoint(`cp${i}`, {
						skipConfirmation: true,
					}),
				);
			}

			const results = await Promise.all(promises);

			expect(results.every((r) => r.success)).toBe(true);
			expect((await mockManager.getAll()).length).toBe(0);
		});
	});

	describe("Error Handling", () => {
		it("should handle deletion errors gracefully", async () => {
			mockManager.add({
				id: "cp1",
				name: "Test",
				timestamp: Date.now(),
				isProtected: false,
				files: [],
			});

			// Mock deletion failure
			vi.spyOn(mockManager, "delete").mockRejectedValueOnce(
				new Error("Storage error"),
			);

			await expect(
				deletionService.deleteCheckpoint("cp1", {
					skipConfirmation: true,
				}),
			).rejects.toThrow("Storage error");
		});

		it("should handle missing checkpoint gracefully", async () => {
			await expect(
				deletionService.deleteCheckpoint("missing"),
			).rejects.toThrow();
		});
	});
});
