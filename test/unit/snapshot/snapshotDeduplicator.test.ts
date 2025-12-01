import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CheckpointDeduplicator,
	type CheckpointState,
} from "@/checkpoint/CheckpointDeduplicator";

describe("CheckpointDeduplicator - Hash-Based State Comparison", () => {
	let deduplicator: CheckpointDeduplicator;

	beforeEach(() => {
		deduplicator = new CheckpointDeduplicator();
	});

	afterEach(() => {
		deduplicator.clear();
	});

	describe("Basic Duplicate Detection", () => {
		it("should detect identical file states (same content, different timestamps)", () => {
			const state1: CheckpointState = {
				id: "checkpoint-1",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/file.ts",
						content: "const x = 1;",
						hash: createHash("sha256").update("const x = 1;").digest("hex"),
					},
				],
			};

			const state2: CheckpointState = {
				id: "checkpoint-2",
				timestamp: Date.now() + 1000, // Different timestamp
				files: [
					{
						path: "/workspace/file.ts",
						content: "const x = 1;", // Same content
						hash: createHash("sha256").update("const x = 1;").digest("hex"),
					},
				],
			};

			// First state should not find duplicate
			const duplicate1 = deduplicator.findDuplicate(state1);
			expect(duplicate1).toBe(null);

			// Second state should find duplicate
			const duplicate2 = deduplicator.findDuplicate(state2);
			expect(duplicate2).toBe("checkpoint-1");
		});

		it("should return checkpoint ID when duplicate found", () => {
			const originalState: CheckpointState = {
				id: "original-checkpoint",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/app.ts",
						content: 'export const app = "test";',
						hash: createHash("sha256")
							.update('export const app = "test";')
							.digest("hex"),
					},
				],
			};

			const duplicateState: CheckpointState = {
				id: "duplicate-checkpoint",
				timestamp: Date.now() + 5000,
				files: [
					{
						path: "/workspace/app.ts",
						content: 'export const app = "test";',
						hash: createHash("sha256")
							.update('export const app = "test";')
							.digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(originalState);
			const result = deduplicator.findDuplicate(duplicateState);

			expect(result).toBe("original-checkpoint");
		});

		it("should return null for unique states", () => {
			const state1: CheckpointState = {
				id: "checkpoint-1",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/file.ts",
						content: "const x = 1;",
						hash: createHash("sha256").update("const x = 1;").digest("hex"),
					},
				],
			};

			const state2: CheckpointState = {
				id: "checkpoint-2",
				timestamp: Date.now() + 1000,
				files: [
					{
						path: "/workspace/file.ts",
						content: "const x = 2;", // Different content
						hash: createHash("sha256").update("const x = 2;").digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe(null);
		});
	});

	describe("File Order Handling", () => {
		it("should handle file order variations (fileA+fileB === fileB+fileA)", () => {
			const stateAB: CheckpointState = {
				id: "checkpoint-ab",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/a.ts",
						content: "const a = 1;",
						hash: createHash("sha256").update("const a = 1;").digest("hex"),
					},
					{
						path: "/workspace/b.ts",
						content: "const b = 2;",
						hash: createHash("sha256").update("const b = 2;").digest("hex"),
					},
				],
			};

			const stateBA: CheckpointState = {
				id: "checkpoint-ba",
				timestamp: Date.now() + 1000,
				files: [
					{
						path: "/workspace/b.ts",
						content: "const b = 2;",
						hash: createHash("sha256").update("const b = 2;").digest("hex"),
					},
					{
						path: "/workspace/a.ts",
						content: "const a = 1;",
						hash: createHash("sha256").update("const a = 1;").digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(stateAB);
			const result = deduplicator.findDuplicate(stateBA);

			expect(result).toBe("checkpoint-ab");
		});

		it("should handle multiple file permutations as identical", () => {
			const files1 = [
				{
					path: "/workspace/x.ts",
					content: "x",
					hash: createHash("sha256").update("x").digest("hex"),
				},
				{
					path: "/workspace/y.ts",
					content: "y",
					hash: createHash("sha256").update("y").digest("hex"),
				},
				{
					path: "/workspace/z.ts",
					content: "z",
					hash: createHash("sha256").update("z").digest("hex"),
				},
			];

			const files2 = [files1[2], files1[0], files1[1]]; // z, x, y

			const state1: CheckpointState = {
				id: "checkpoint-1",
				timestamp: Date.now(),
				files: files1,
			};

			const state2: CheckpointState = {
				id: "checkpoint-2",
				timestamp: Date.now() + 1000,
				files: files2,
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe("checkpoint-1");
		});
	});

	describe("Timestamp Handling", () => {
		it("should ignore timestamp differences in hash calculation", () => {
			const state1: CheckpointState = {
				id: "checkpoint-1",
				timestamp: 1000000,
				files: [
					{
						path: "/workspace/file.ts",
						content: "const value = 42;",
						hash: createHash("sha256")
							.update("const value = 42;")
							.digest("hex"),
					},
				],
			};

			const state2: CheckpointState = {
				id: "checkpoint-2",
				timestamp: 9999999, // Vastly different timestamp
				files: [
					{
						path: "/workspace/file.ts",
						content: "const value = 42;",
						hash: createHash("sha256")
							.update("const value = 42;")
							.digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe("checkpoint-1");
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty file lists", () => {
			const emptyState1: CheckpointState = {
				id: "empty-1",
				timestamp: Date.now(),
				files: [],
			};

			const emptyState2: CheckpointState = {
				id: "empty-2",
				timestamp: Date.now() + 1000,
				files: [],
			};

			deduplicator.findDuplicate(emptyState1);
			const result = deduplicator.findDuplicate(emptyState2);

			expect(result).toBe("empty-1");
		});

		it("should handle single file checkpoints", () => {
			const state1: CheckpointState = {
				id: "single-1",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/only.ts",
						content: "single file",
						hash: createHash("sha256").update("single file").digest("hex"),
					},
				],
			};

			const state2: CheckpointState = {
				id: "single-2",
				timestamp: Date.now() + 1000,
				files: [
					{
						path: "/workspace/only.ts",
						content: "single file",
						hash: createHash("sha256").update("single file").digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe("single-1");
		});

		it("should handle large file sets (100+ files)", () => {
			const files1 = Array.from({ length: 150 }, (_, i) => ({
				path: `/workspace/file${i}.ts`,
				content: `const value${i} = ${i};`,
				hash: createHash("sha256")
					.update(`const value${i} = ${i};`)
					.digest("hex"),
			}));

			const files2 = [...files1].reverse(); // Reverse order

			const state1: CheckpointState = {
				id: "large-1",
				timestamp: Date.now(),
				files: files1,
			};

			const state2: CheckpointState = {
				id: "large-2",
				timestamp: Date.now() + 1000,
				files: files2,
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe("large-1");
		});

		it("should handle files with identical paths but different content", () => {
			const state1: CheckpointState = {
				id: "version-1",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/config.ts",
						content: "export const version = 1;",
						hash: createHash("sha256")
							.update("export const version = 1;")
							.digest("hex"),
					},
				],
			};

			const state2: CheckpointState = {
				id: "version-2",
				timestamp: Date.now() + 1000,
				files: [
					{
						path: "/workspace/config.ts",
						content: "export const version = 2;", // Different content
						hash: createHash("sha256")
							.update("export const version = 2;")
							.digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe(null); // Not a duplicate
		});

		it("should handle files with different paths but identical content", () => {
			const state1: CheckpointState = {
				id: "path-1",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/a.ts",
						content: "shared content",
						hash: createHash("sha256").update("shared content").digest("hex"),
					},
				],
			};

			const state2: CheckpointState = {
				id: "path-2",
				timestamp: Date.now() + 1000,
				files: [
					{
						path: "/workspace/b.ts", // Different path
						content: "shared content",
						hash: createHash("sha256").update("shared content").digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe(null); // Not a duplicate (different files)
		});
	});

	describe("Hash Collision Handling", () => {
		it("should handle potential hash collisions gracefully", () => {
			// While SHA-256 collisions are virtually impossible,
			// test that the system uses the full hash correctly
			const content1 = "a".repeat(1000);
			const content2 = "b".repeat(1000);

			const state1: CheckpointState = {
				id: "hash-1",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/file.ts",
						content: content1,
						hash: createHash("sha256").update(content1).digest("hex"),
					},
				],
			};

			const state2: CheckpointState = {
				id: "hash-2",
				timestamp: Date.now() + 1000,
				files: [
					{
						path: "/workspace/file.ts",
						content: content2,
						hash: createHash("sha256").update(content2).digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe(null); // Different hashes
		});
	});

	describe("Cache Management", () => {
		it("should maintain cache size limit (max 500 hashes)", () => {
			const maxSize = 500;
			const dedup = new CheckpointDeduplicator(maxSize);

			// Add 600 unique checkpoints
			for (let i = 0; i < 600; i++) {
				const state: CheckpointState = {
					id: `checkpoint-${i}`,
					timestamp: Date.now() + i,
					files: [
						{
							path: "/workspace/file.ts",
							content: `const value = ${i};`,
							hash: createHash("sha256")
								.update(`const value = ${i};`)
								.digest("hex"),
						},
					],
				};

				dedup.findDuplicate(state);
			}

			// Cache should not exceed max size
			expect(dedup.getCacheSize()).toBeLessThanOrEqual(maxSize);
		});

		it("should evict oldest entries when cache is full (LRU behavior)", () => {
			const maxSize = 3;
			const dedup = new CheckpointDeduplicator(maxSize);

			const states = Array.from({ length: 5 }, (_, i) => ({
				id: `checkpoint-${i}`,
				timestamp: Date.now() + i,
				files: [
					{
						path: "/workspace/file.ts",
						content: `const value = ${i};`,
						hash: createHash("sha256")
							.update(`const value = ${i};`)
							.digest("hex"),
					},
				],
			}));

			// Add first 5 states
			for (const state of states) {
				dedup.findDuplicate(state);
			}

			// Cache should contain only last 3
			expect(dedup.getCacheSize()).toBe(maxSize);

			// First 2 states should no longer be findable as duplicates
			const oldDuplicate1 = dedup.findDuplicate(states[0]);
			const oldDuplicate2 = dedup.findDuplicate(states[1]);

			expect(oldDuplicate1).toBe(null);
			expect(oldDuplicate2).toBe(null);

			// Last 3 should still be findable
			const recentDuplicate = dedup.findDuplicate(states[4]);
			expect(recentDuplicate).toBe("checkpoint-4");
		});

		it("should clear cache completely", () => {
			const state: CheckpointState = {
				id: "test-checkpoint",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/file.ts",
						content: "test",
						hash: createHash("sha256").update("test").digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(state);
			expect(deduplicator.getCacheSize()).toBe(1);

			deduplicator.clear();
			expect(deduplicator.getCacheSize()).toBe(0);

			// After clear, same state should not be found as duplicate
			const result = deduplicator.findDuplicate(state);
			expect(result).toBe(null);
		});
	});

	describe("Memory Cleanup", () => {
		it("should release memory when cache is cleared", () => {
			// Add many large checkpoints
			for (let i = 0; i < 100; i++) {
				const files = Array.from({ length: 50 }, (_, j) => ({
					path: `/workspace/file${j}.ts`,
					content: `const value = ${i * j};`.repeat(100),
					hash: createHash("sha256")
						.update(`const value = ${i * j};`.repeat(100))
						.digest("hex"),
				}));

				const state: CheckpointState = {
					id: `checkpoint-${i}`,
					timestamp: Date.now() + i,
					files,
				};

				deduplicator.findDuplicate(state);
			}

			expect(deduplicator.getCacheSize()).toBeGreaterThan(0);

			deduplicator.clear();

			expect(deduplicator.getCacheSize()).toBe(0);
		});

		it("should not leak memory with repeated operations", () => {
			const iterations = 1000;
			const state: CheckpointState = {
				id: "repeated",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/file.ts",
						content: "const x = 1;",
						hash: createHash("sha256").update("const x = 1;").digest("hex"),
					},
				],
			};

			// Repeated operations should not accumulate memory
			for (let i = 0; i < iterations; i++) {
				deduplicator.findDuplicate(state);
			}

			// Should still have only 1 entry cached
			expect(deduplicator.getCacheSize()).toBe(1);
		});
	});

	describe("Performance Benchmarks", () => {
		it("should perform 1000 comparisons in under 100ms", () => {
			const states = Array.from({ length: 1000 }, (_, i) => ({
				id: `checkpoint-${i}`,
				timestamp: Date.now() + i,
				files: [
					{
						path: "/workspace/file.ts",
						content: `const value = ${i};`,
						hash: createHash("sha256")
							.update(`const value = ${i};`)
							.digest("hex"),
					},
				],
			}));

			const startTime = Date.now();

			for (const state of states) {
				deduplicator.findDuplicate(state);
			}

			const duration = Date.now() - startTime;

			expect(duration).toBeLessThan(100);
		});

		it("should perform hash calculation in under 10ms", () => {
			const files = Array.from({ length: 100 }, (_, i) => ({
				path: `/workspace/file${i}.ts`,
				content: `const value${i} = ${i};`.repeat(10),
				hash: createHash("sha256")
					.update(`const value${i} = ${i};`.repeat(10))
					.digest("hex"),
			}));

			const state: CheckpointState = {
				id: "perf-test",
				timestamp: Date.now(),
				files,
			};

			const startTime = Date.now();

			deduplicator.findDuplicate(state);

			const duration = Date.now() - startTime;

			expect(duration).toBeLessThan(10);
		});

		it("should maintain O(1) lookup time with Map-based cache", () => {
			const sizes = [100, 200, 400];
			const lookupTimes: number[] = [];

			for (const size of sizes) {
				const dedup = new CheckpointDeduplicator(size);

				// Populate cache
				for (let i = 0; i < size; i++) {
					const state: CheckpointState = {
						id: `checkpoint-${i}`,
						timestamp: Date.now() + i,
						files: [
							{
								path: "/workspace/file.ts",
								content: `const value = ${i};`,
								hash: createHash("sha256")
									.update(`const value = ${i};`)
									.digest("hex"),
							},
						],
					};
					dedup.findDuplicate(state);
				}

				// Measure lookup time
				const testState: CheckpointState = {
					id: "test",
					timestamp: Date.now(),
					files: [
						{
							path: "/workspace/file.ts",
							content: "const value = 0;",
							hash: createHash("sha256")
								.update("const value = 0;")
								.digest("hex"),
						},
					],
				};

				const iterations = 1000;
				const startTime = Date.now();

				for (let i = 0; i < iterations; i++) {
					dedup.findDuplicate(testState);
				}

				const duration = Date.now() - startTime;
				lookupTimes.push(duration / iterations);

				dedup.clear();
			}

			// O(1): lookup time should NOT scale with cache size
			// Allow 2x variance due to system noise
			const ratio = lookupTimes[2] / lookupTimes[0];
			expect(ratio).toBeLessThan(2);
		});

		it("should handle 1000 checkpoints with 50 files each efficiently", () => {
			const checkpointCount = 1000;
			const filesPerCheckpoint = 50;

			const startTime = Date.now();

			for (let i = 0; i < checkpointCount; i++) {
				const files = Array.from({ length: filesPerCheckpoint }, (_, j) => ({
					path: `/workspace/file${j}.ts`,
					content: `const value = ${i * j};`,
					hash: createHash("sha256")
						.update(`const value = ${i * j};`)
						.digest("hex"),
				}));

				const state: CheckpointState = {
					id: `checkpoint-${i}`,
					timestamp: Date.now() + i,
					files,
				};

				deduplicator.findDuplicate(state);
			}

			const duration = Date.now() - startTime;

			// Should process all checkpoints in under 5 seconds
			expect(duration).toBeLessThan(5000);
		});
	});

	describe("State Hash Consistency", () => {
		it("should generate consistent hashes for identical states", () => {
			const files = [
				{
					path: "/workspace/a.ts",
					content: "const a = 1;",
					hash: createHash("sha256").update("const a = 1;").digest("hex"),
				},
				{
					path: "/workspace/b.ts",
					content: "const b = 2;",
					hash: createHash("sha256").update("const b = 2;").digest("hex"),
				},
			];

			const state1: CheckpointState = {
				id: "checkpoint-1",
				timestamp: Date.now(),
				files: [...files],
			};

			const state2: CheckpointState = {
				id: "checkpoint-2",
				timestamp: Date.now() + 1000,
				files: [...files],
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe("checkpoint-1");
		});

		it("should handle special characters in file paths", () => {
			const state1: CheckpointState = {
				id: "special-1",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/file-name_123.ts",
						content: "test",
						hash: createHash("sha256").update("test").digest("hex"),
					},
					{
						path: "/workspace/file@special#chars.ts",
						content: "test2",
						hash: createHash("sha256").update("test2").digest("hex"),
					},
				],
			};

			const state2: CheckpointState = {
				id: "special-2",
				timestamp: Date.now() + 1000,
				files: [...state1.files],
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe("special-1");
		});

		it("should handle unicode content in files", () => {
			const unicodeContent =
				'日本語のコード // Japanese code\nconst emoji = "🚀";';

			const state1: CheckpointState = {
				id: "unicode-1",
				timestamp: Date.now(),
				files: [
					{
						path: "/workspace/unicode.ts",
						content: unicodeContent,
						hash: createHash("sha256").update(unicodeContent).digest("hex"),
					},
				],
			};

			const state2: CheckpointState = {
				id: "unicode-2",
				timestamp: Date.now() + 1000,
				files: [
					{
						path: "/workspace/unicode.ts",
						content: unicodeContent,
						hash: createHash("sha256").update(unicodeContent).digest("hex"),
					},
				],
			};

			deduplicator.findDuplicate(state1);
			const result = deduplicator.findDuplicate(state2);

			expect(result).toBe("unicode-1");
		});
	});
});
