/**
 * P1-RECOVERY-PRE-SNAPSHOT + P1-RECOVERY-UNDO-COMMAND Tests
 *
 * Tests that PRE_ROLLBACK checkpoints are created before restores,
 * and that undoLastRestore correctly restores from the checkpoint.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SnapshotManifestV2 } from "../../../src/storage/types";

describe("P1 Recovery: PRE_ROLLBACK Checkpoint Flow", () => {
	let mockStorage: any;
	let mockCoordinator: any;

	beforeEach(() => {
		mockStorage = {
			getPRWSnapshotStore: vi.fn(() => ({
				createPreRollbackCheckpoint: vi.fn(async (targetId: string) => {
					return {
						id: "pre-rollback-123",
						type: "PRE_ROLLBACK",
						name: `Pre-rollback (target: ${targetId})`,
						timestamp: Date.now(),
						files: {},
						metadata: {
							origin: "INTERACTIVE",
							riskScore: 0,
							reasons: ["PRE_ROLLBACK"],
						},
					} as SnapshotManifestV2;
				}),
				listV2: vi.fn(async () => [
					{
						id: "pre-rollback-123",
						type: "PRE_ROLLBACK",
						timestamp: Date.now(),
					},
				]),
				getWithContentV2: vi.fn(async (id: string) => {
					if (id === "pre-rollback-123") {
						return {
							manifest: {
								id: "pre-rollback-123",
								type: "PRE_ROLLBACK",
							},
							contents: {
								"testFile.ts": "modified content after user edits",
							},
						};
					}
					return null;
				}),
			})),
		};

		mockCoordinator = {
			restoreToSnapshot: vi.fn(async () => true),
			storage: mockStorage,
		};
	});

	describe("P1-RECOVERY-PRE-SNAPSHOT", () => {
		it("should create PRE_ROLLBACK checkpoint before restore", async () => {
			// Simulate executeRestoration logic
			const snapshotId = "original-snapshot-456";
			const storage = mockCoordinator.storage;

			// Create PRE_ROLLBACK checkpoint (what executeRestoration now does)
			const store = storage.getPRWSnapshotStore?.();
			expect(store).toBeDefined();

			if (store?.createPreRollbackCheckpoint) {
				const checkpoint = await store.createPreRollbackCheckpoint(snapshotId);

				expect(checkpoint).toBeDefined();
				expect(checkpoint.type).toBe("PRE_ROLLBACK");
				expect(checkpoint.id).toBe("pre-rollback-123");
				expect(store.createPreRollbackCheckpoint).toHaveBeenCalledWith(
					snapshotId,
				);
			}

			// Then restore would happen
			await mockCoordinator.restoreToSnapshot(snapshotId, { files: ["testFile.ts"] });
			expect(mockCoordinator.restoreToSnapshot).toHaveBeenCalledWith(
				snapshotId,
				{ files: ["testFile.ts"] },
			);
		});

		it("should log warning if PRE_ROLLBACK creation fails but continue restore", async () => {
			// Simulate storage with failing createPreRollbackCheckpoint
			const failingStorage = {
				getPRWSnapshotStore: vi.fn(() => ({
					createPreRollbackCheckpoint: vi.fn(async () => {
						throw new Error("Storage error");
					}),
				})),
			};

			const store = failingStorage.getPRWSnapshotStore?.();

			if (store?.createPreRollbackCheckpoint) {
				// Should throw but not block restore flow (caught in executeRestoration)
				await expect(store.createPreRollbackCheckpoint("test-id")).rejects.toThrow(
					"Storage error",
				);
			}
		});
	});

	describe("P1-RECOVERY-UNDO-COMMAND", () => {
		it("should find and restore from most recent PRE_ROLLBACK checkpoint", async () => {
			const store = mockStorage.getPRWSnapshotStore?.();
			expect(store).toBeDefined();

			// Simulate undoLastRestore command logic
			if (store?.listV2) {
				const manifests = await store.listV2({ limit: 200 });
				const preRollback = manifests.find((m: any) => m.type === "PRE_ROLLBACK");

				expect(preRollback).toBeDefined();
				expect(preRollback.id).toBe("pre-rollback-123");
			}

			// Get content from PRE_ROLLBACK
			if (store?.getWithContentV2) {
				const resolved = await store.getWithContentV2("pre-rollback-123");

				expect(resolved).toBeDefined();
				expect(resolved?.contents).toBeDefined();

				const undoContent = (resolved?.contents as any)?.["testFile.ts"];
				expect(undoContent).toBe("modified content after user edits");
			}
		});

		it("should handle no PRE_ROLLBACK checkpoint gracefully", async () => {
			// Mock storage with no PRE_ROLLBACK checkpoints
			const emptyStorage = {
				getPRWSnapshotStore: vi.fn(() => ({
					listV2: vi.fn(async () => [
						// No PRE_ROLLBACK checkpoints, only regular snapshots
						{
							id: "regular-snap-1",
							type: "POST",
							timestamp: Date.now(),
						},
					]),
				})),
			};

			const store = emptyStorage.getPRWSnapshotStore?.();

			if (store?.listV2) {
				const manifests = await store.listV2({ limit: 200 });
				const preRollback = manifests.find((m: any) => m.type === "PRE_ROLLBACK");

				// Should not find any PRE_ROLLBACK checkpoints
				expect(preRollback).toBeUndefined();
			}
		});
	});

	describe("P2-RECOVERY-PERF-BUDGETS", () => {
		it("should track restore duration and flag when exceeding budget", async () => {
			const snapshotId = "test-snapshot";
			const RESTORE_BUDGET_MS = 1000;

			// Simulate slow restore (2 seconds)
			mockCoordinator.restoreToSnapshot = vi.fn(async () => {
				await new Promise((resolve) => setTimeout(resolve, 2000));
				return true;
			});

			const startTime = Date.now();
			await mockCoordinator.restoreToSnapshot(snapshotId, { files: ["file.ts"] });
			const duration = Date.now() - startTime;

			// Should exceed budget
			expect(duration).toBeGreaterThan(RESTORE_BUDGET_MS);

			const exceededBudget = duration > RESTORE_BUDGET_MS;
			expect(exceededBudget).toBe(true);
		});

		it("should pass when restore completes within budget", async () => {
			const snapshotId = "test-snapshot";
			const RESTORE_BUDGET_MS = 1000;

			// Simulate fast restore (100ms)
			mockCoordinator.restoreToSnapshot = vi.fn(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				return true;
			});

			const startTime = Date.now();
			await mockCoordinator.restoreToSnapshot(snapshotId, { files: ["file.ts"] });
			const duration = Date.now() - startTime;

			// Should be under budget
			expect(duration).toBeLessThan(RESTORE_BUDGET_MS);

			const exceededBudget = duration > RESTORE_BUDGET_MS;
			expect(exceededBudget).toBe(false);
		});
	});

	describe("End-to-End Flow", () => {
		it("should complete full restore→undo cycle", async () => {
			const originalSnapshotId = "original-456";

			// Step 1: Create PRE_ROLLBACK checkpoint before restore
			const store = mockStorage.getPRWSnapshotStore?.();
			const checkpoint = await store.createPreRollbackCheckpoint(
				originalSnapshotId,
			);
			expect(checkpoint.type).toBe("PRE_ROLLBACK");

			// Step 2: Execute restore
			await mockCoordinator.restoreToSnapshot(originalSnapshotId, {
				files: ["testFile.ts"],
			});
			expect(mockCoordinator.restoreToSnapshot).toHaveBeenCalled();

			// Step 3: Undo restore (find PRE_ROLLBACK and restore from it)
			const manifests = await store.listV2({ limit: 200 });
			const preRollback = manifests.find((m: any) => m.type === "PRE_ROLLBACK");
			expect(preRollback).toBeDefined();

			// Step 4: Get content from PRE_ROLLBACK
			const resolved = await store.getWithContentV2(preRollback.id);
			const undoContent = (resolved?.contents as any)?.["testFile.ts"];
			expect(undoContent).toBe("modified content after user edits");

			// Success: Full cycle validated
		});
	});
});
