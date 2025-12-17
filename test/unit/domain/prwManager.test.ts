/**
 * PRWManager Tests
 *
 * TDD RED Phase - Tests for PRE checkpoint coordination
 *
 * Test scenarios:
 * 1. Happy path: handleSave → onBurstEnd → POST created
 * 2. Dedup: rapid saves on same file → only one PRE
 * 3. Concurrent saves with synchronous reservation
 * 4. Rate limit exhausted: handleSave returns null
 * 5. Burst end with no active PRE: returns null
 * 6. Dispose with active PREs: logs warning, clears state
 * 7. E2E timing: PRE→POST within 500ms budget
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
const mockCreatePRE = vi.fn();
const mockCreatePOST = vi.fn();
const mockCanSnapshot = vi.fn();
const mockRecordSnapshot = vi.fn();
const mockReadFile = vi.fn();

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

describe("PRWManager", () => {
	// Will import after mocks are set up
	let PRWManager: typeof import("../../../src/domain/prwManager").PRWManager;
	let createPRWManager: typeof import("../../../src/domain/prwManager").createPRWManager;

	beforeEach(async () => {
		vi.clearAllMocks();

		// Default mock behaviors
		mockCanSnapshot.mockReturnValue(true);
		mockRecordSnapshot.mockReturnValue(true);
		mockReadFile.mockResolvedValue(Buffer.from("file content"));

		// Reset module cache to get fresh imports
		vi.resetModules();

		// Dynamic import after mocks
		const module = await import("../../../src/domain/prwManager");
		PRWManager = module.PRWManager;
		createPRWManager = module.createPRWManager;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("handleSave", () => {
		it("should create PRE checkpoint when rate limit allows and no active PRE", async () => {
			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			const result = await manager.handleSave("/path/to/file.ts", 0.8);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("pre-123");
			expect(mockCreatePRE).toHaveBeenCalledWith(
				expect.objectContaining({
					anchorFile: "/path/to/file.ts",
					type: "PRE",
				}),
			);
		});

		it("should return null when rate limit exhausted", async () => {
			const mockStore = {
				createPRE: mockCreatePRE,
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot.mockReturnValue(false),
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			const result = await manager.handleSave("/path/to/file.ts", 0.8);

			expect(result).toBeNull();
			expect(mockCreatePRE).not.toHaveBeenCalled();
		});

		it("should deduplicate when active PRE exists for same file", async () => {
			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			// First save creates PRE
			const result1 = await manager.handleSave("/path/to/file.ts", 0.8);
			expect(result1).not.toBeNull();

			// Second save on same file is deduplicated
			const result2 = await manager.handleSave("/path/to/file.ts", 0.9);
			expect(result2).toBeNull();

			// createPRE should only be called once
			expect(mockCreatePRE).toHaveBeenCalledTimes(1);
		});

		it("should allow concurrent PREs for different files", async () => {
			let preCounter = 0;
			const mockStore = {
				createPRE: mockCreatePRE.mockImplementation(async () => ({
					id: `pre-${++preCounter}`,
					type: "PRE",
					seq: preCounter,
				})),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			const result1 = await manager.handleSave("/path/to/file1.ts", 0.8);
			const result2 = await manager.handleSave("/path/to/file2.ts", 0.7);

			expect(result1).not.toBeNull();
			expect(result2).not.toBeNull();
			expect(result1?.id).not.toBe(result2?.id);
			expect(mockCreatePRE).toHaveBeenCalledTimes(2);
		});

		it("should use synchronous reservation to prevent race conditions", async () => {
			// Simulate slow createPRE
			let resolveFirst: (value: any) => void;
			const slowPromise = new Promise((resolve) => {
				resolveFirst = resolve;
			});

			let callCount = 0;
			const mockStore = {
				createPRE: mockCreatePRE.mockImplementation(async () => {
					callCount++;
					if (callCount === 1) {
						await slowPromise;
						return { id: "pre-1", type: "PRE", seq: 1 };
					}
					return { id: "pre-2", type: "PRE", seq: 2 };
				}),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			// Start two concurrent saves on same file
			const promise1 = manager.handleSave("/path/to/file.ts", 0.8);
			const promise2 = manager.handleSave("/path/to/file.ts", 0.9);

			// Second should be deduplicated immediately due to synchronous reservation
			const result2 = await promise2;
			expect(result2).toBeNull();

			// Resolve first
			resolveFirst!({ id: "pre-1", type: "PRE", seq: 1 });
			const result1 = await promise1;
			expect(result1).not.toBeNull();

			// Only one createPRE call
			expect(mockCreatePRE).toHaveBeenCalledTimes(1);
		});

		it("should rollback reservation on createPRE failure", async () => {
			const mockStore = {
				createPRE: mockCreatePRE
					.mockRejectedValueOnce(new Error("Storage error"))
					.mockResolvedValueOnce({ id: "pre-123", type: "PRE", seq: 1 }),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			// First attempt fails
			await expect(manager.handleSave("/path/to/file.ts", 0.8)).rejects.toThrow("Storage error");

			// Reservation should be rolled back, allowing retry
			const result = await manager.handleSave("/path/to/file.ts", 0.8);
			expect(result).not.toBeNull();
			expect(mockCreatePRE).toHaveBeenCalledTimes(2);
		});
	});

	describe("onBurstEnd", () => {
		it("should create POST checkpoint when active PRE exists", async () => {
			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
					parentId: null,
					parentSeq: null,
				}),
				createPOST: mockCreatePOST.mockResolvedValue({
					id: "post-456",
					type: "POST",
					seq: 2,
					parentId: "pre-123",
				}),
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			// Create PRE first
			await manager.handleSave("/path/to/file.ts", 0.8);

			// End burst
			const result = await manager.onBurstEnd("/path/to/file.ts");

			expect(result).not.toBeNull();
			expect(result?.type).toBe("POST");
			expect(result?.parentId).toBe("pre-123");
			expect(mockCreatePOST).toHaveBeenCalledWith(
				expect.objectContaining({
					anchorFile: "/path/to/file.ts",
					parentId: "pre-123",
				}),
			);
			expect(mockRecordSnapshot).toHaveBeenCalled();
		});

		it("should return null when no active PRE exists", async () => {
			const mockStore = {
				createPRE: mockCreatePRE,
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			const result = await manager.onBurstEnd("/path/to/file.ts");

			expect(result).toBeNull();
			expect(mockCreatePOST).not.toHaveBeenCalled();
		});

		it("should clear active PRE after creating POST", async () => {
			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST.mockResolvedValue({
					id: "post-456",
					type: "POST",
					seq: 2,
				}),
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			await manager.handleSave("/path/to/file.ts", 0.8);
			expect(manager.hasActivePRE("/path/to/file.ts")).toBe(true);

			await manager.onBurstEnd("/path/to/file.ts");
			expect(manager.hasActivePRE("/path/to/file.ts")).toBe(false);
		});

		it("should read file content from disk", async () => {
			const fileContent = "updated file content";
			mockReadFile.mockResolvedValue(Buffer.from(fileContent));

			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST.mockResolvedValue({
					id: "post-456",
					type: "POST",
					seq: 2,
				}),
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			await manager.handleSave("/path/to/file.ts", 0.8);
			await manager.onBurstEnd("/path/to/file.ts");

			expect(mockCreatePOST).toHaveBeenCalledWith(
				expect.objectContaining({
					files: expect.any(Map),
				}),
			);

			const callArgs = mockCreatePOST.mock.calls[0][0];
			expect(callArgs.files.get("/path/to/file.ts")).toBe(fileContent);
		});

		it("should return null when PRE is still pending (in-flight)", async () => {
			// Simulate slow createPRE that hasn't completed yet
			let resolveCreate: (value: any) => void;
			const slowCreatePromise = new Promise((resolve) => {
				resolveCreate = resolve;
			});

			const mockStore = {
				createPRE: mockCreatePRE.mockImplementation(() => slowCreatePromise),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			// Start PRE creation (will be pending)
			const prePromise = manager.handleSave("/path/to/file.ts", 0.8);

			// Burst ends while PRE still in-flight
			const postResult = await manager.onBurstEnd("/path/to/file.ts");
			expect(postResult).toBeNull();
			expect(mockCreatePOST).not.toHaveBeenCalled();

			// Complete the PRE creation
			resolveCreate!({ id: "pre-123", type: "PRE", seq: 1 });
			await prePromise;

			// Now burst end should work
			const postResult2 = await manager.onBurstEnd("/path/to/file.ts");
			expect(postResult2).not.toBeNull();
		});

		it("should handle file deleted before burst end (ENOENT)", async () => {
			// File was deleted between PRE and burst-end
			const enoentError = new Error("ENOENT: no such file or directory") as Error & { code: string };
			enoentError.code = "FileNotFound";
			mockReadFile.mockRejectedValue(enoentError);

			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			await manager.handleSave("/path/to/file.ts", 0.8);

			// Burst end should throw but also clear activePRE (file gone = orphan expected)
			await expect(manager.onBurstEnd("/path/to/file.ts")).rejects.toThrow();

			// Active PRE should be cleared (file is gone, can't retry)
			expect(manager.hasActivePRE("/path/to/file.ts")).toBe(false);
		});

		it("should clear activePRE on createPOST failure (no stuck state)", async () => {
			// Simulates disk full, permission error, or other storage failure
			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST.mockRejectedValue(new Error("Disk full")),
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			await manager.handleSave("/path/to/file.ts", 0.8);
			expect(manager.hasActivePRE("/path/to/file.ts")).toBe(true);

			// POST creation fails
			await expect(manager.onBurstEnd("/path/to/file.ts")).rejects.toThrow("Disk full");

			// Active PRE should be cleared (orphan PRE > stuck state)
			expect(manager.hasActivePRE("/path/to/file.ts")).toBe(false);

			// Can create new PRE for same file (not stuck)
			const newPre = await manager.handleSave("/path/to/file.ts", 0.9);
			expect(newPre).not.toBeNull();
		});
	});

	describe("hasActivePRE / getActivePRE", () => {
		it("should return true/state when active PRE exists", async () => {
			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			await manager.handleSave("/path/to/file.ts", 0.8);

			expect(manager.hasActivePRE("/path/to/file.ts")).toBe(true);
			expect(manager.getActivePRE("/path/to/file.ts")).toEqual(
				expect.objectContaining({
					preId: "pre-123",
				}),
			);
		});

		it("should return false/undefined when no active PRE", () => {
			const mockStore = {
				createPRE: mockCreatePRE,
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			expect(manager.hasActivePRE("/path/to/file.ts")).toBe(false);
			expect(manager.getActivePRE("/path/to/file.ts")).toBeUndefined();
		});
	});

	describe("dispose", () => {
		it("should clear all active PREs", async () => {
			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			await manager.handleSave("/path/to/file1.ts", 0.8);
			await manager.handleSave("/path/to/file2.ts", 0.7);

			expect(manager.hasActivePRE("/path/to/file1.ts")).toBe(true);
			expect(manager.hasActivePRE("/path/to/file2.ts")).toBe(true);

			manager.dispose();

			expect(manager.hasActivePRE("/path/to/file1.ts")).toBe(false);
			expect(manager.hasActivePRE("/path/to/file2.ts")).toBe(false);
		});

		it("should log warning when disposing with active PREs", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			await manager.handleSave("/path/to/file.ts", 0.8);
			manager.dispose();

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("orphan PRE"),
				expect.any(Array),
			);

			warnSpy.mockRestore();
		});
	});

	describe("E2E timing", () => {
		it("should complete PRE→POST flow within 500ms budget", async () => {
			const mockStore = {
				createPRE: mockCreatePRE.mockResolvedValue({
					id: "pre-123",
					type: "PRE",
					seq: 1,
				}),
				createPOST: mockCreatePOST.mockResolvedValue({
					id: "post-456",
					type: "POST",
					seq: 2,
				}),
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			const startTime = Date.now();

			await manager.handleSave("/path/to/file.ts", 0.8);
			await manager.onBurstEnd("/path/to/file.ts");

			const elapsed = Date.now() - startTime;

			expect(elapsed).toBeLessThan(500);
		});
	});

	describe("getActiveCount", () => {
		it("should return count of active PREs", async () => {
			const mockStore = {
				createPRE: mockCreatePRE.mockImplementation(async () => ({
					id: `pre-${Date.now()}`,
					type: "PRE",
					seq: 1,
				})),
				createPOST: mockCreatePOST,
			};
			const mockRateLimiter = {
				canSnapshot: mockCanSnapshot,
				recordSnapshot: mockRecordSnapshot,
			};

			const manager = createPRWManager({
				snapshotStore: mockStore as any,
				rateLimiter: mockRateLimiter as any,
			});

			expect(manager.getActiveCount()).toBe(0);

			await manager.handleSave("/path/to/file1.ts", 0.8);
			expect(manager.getActiveCount()).toBe(1);

			await manager.handleSave("/path/to/file2.ts", 0.7);
			expect(manager.getActiveCount()).toBe(2);
		});
	});
});
