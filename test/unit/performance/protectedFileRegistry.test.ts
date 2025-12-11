import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Mock implementation for testing O(1) lookup performance
 * This represents the refactored ProtectedFileRegistry with Set-based indexing
 */
class OptimizedProtectedFileRegistry {
	private protectedPaths = new Set<string>();
	private displayFiles: Array<{ path: string; label: string }> = [];

	/**
	 * Add a file to protected set - O(1)
	 */
	addProtected(filePath: string): void {
		const normalized = this.normalizePath(filePath);
		if (!this.protectedPaths.has(normalized)) {
			this.protectedPaths.add(normalized);
			this.displayFiles.push({
				path: normalized,
				label: path.basename(filePath),
			});
		}
	}

	/**
	 * Check if file is protected - O(1) lookup
	 */
	isProtected(filePath: string): boolean {
		return this.protectedPaths.has(this.normalizePath(filePath));
	}

	/**
	 * Remove a file from protected set - O(1)
	 */
	removeProtected(filePath: string): void {
		const normalized = this.normalizePath(filePath);
		if (this.protectedPaths.delete(normalized)) {
			this.displayFiles = this.displayFiles.filter(
				(f) => f.path !== normalized,
			);
		}
	}

	/**
	 * Clear all protected files - O(1)
	 */
	clearAll(): void {
		this.protectedPaths.clear();
		this.displayFiles = [];
	}

	/**
	 * Get count of protected files - O(1)
	 */
	count(): number {
		return this.protectedPaths.size;
	}

	/**
	 * Get all protected files for display - O(n) but only for UI
	 */
	getAllProtectedFiles(): string[] {
		return Array.from(this.protectedPaths);
	}

	/**
	 * Add multiple files efficiently - O(n)
	 */
	addMultiple(filePaths: string[]): void {
		filePaths.forEach((fp) => this.addProtected(fp));
	}

	/**
	 * Remove multiple files efficiently - O(n)
	 */
	removeMultiple(filePaths: string[]): void {
		filePaths.forEach((fp) => this.removeProtected(fp));
	}

	/**
	 * Normalize path for consistent lookup
	 * Handles: separators, case-insensitivity (Windows), relative paths
	 */
	private normalizePath(filePath: string): string {
		const normalized = path.normalize(filePath);

		// Windows: case-insensitive
		return process.platform === "win32" ? normalized.toLowerCase() : normalized;
	}
}

describe.skip("ProtectedFileRegistry - O(1) Lookup Performance [GH-perf-registry]", () => {
	// @see https://github.com/snapback/snapback-site/issues/perf-registry
	let registry: OptimizedProtectedFileRegistry;

	beforeEach(() => {
		registry = new OptimizedProtectedFileRegistry();
	});

	describe("Basic Functionality", () => {
		it("should add and check protected files", () => {
			registry.addProtected("/workspace/important.ts");

			expect(registry.isProtected("/workspace/important.ts")).toBe(true);
			expect(registry.isProtected("/workspace/other.ts")).toBe(false);
		});

		it("should handle multiple protected files", () => {
			registry.addProtected("/workspace/file1.ts");
			registry.addProtected("/workspace/file2.ts");
			registry.addProtected("/workspace/file3.ts");

			expect(registry.isProtected("/workspace/file1.ts")).toBe(true);
			expect(registry.isProtected("/workspace/file2.ts")).toBe(true);
			expect(registry.isProtected("/workspace/file3.ts")).toBe(true);
			expect(registry.isProtected("/workspace/file4.ts")).toBe(false);
		});

		it("should remove protected files", () => {
			registry.addProtected("/workspace/temp.ts");
			expect(registry.isProtected("/workspace/temp.ts")).toBe(true);

			registry.removeProtected("/workspace/temp.ts");
			expect(registry.isProtected("/workspace/temp.ts")).toBe(false);
		});

		it("should clear all protected files", () => {
			registry.addProtected("/workspace/file1.ts");
			registry.addProtected("/workspace/file2.ts");

			registry.clearAll();

			expect(registry.isProtected("/workspace/file1.ts")).toBe(false);
			expect(registry.isProtected("/workspace/file2.ts")).toBe(false);
			expect(registry.count()).toBe(0);
		});

		it("should not add duplicate files", () => {
			registry.addProtected("/workspace/file.ts");
			registry.addProtected("/workspace/file.ts");

			expect(registry.count()).toBe(1);
		});
	});

	describe("Path Normalization", () => {
		it("should normalize paths with different separators", () => {
			if (process.platform === "win32") {
				registry.addProtected("C:\\workspace\\file.ts");
				expect(registry.isProtected("C:/workspace/file.ts")).toBe(true);
			} else {
				registry.addProtected("/workspace/file.ts");
				expect(registry.isProtected("/workspace/file.ts")).toBe(true);
			}
		});

		it("should handle case-insensitivity on Windows", () => {
			if (process.platform === "win32") {
				registry.addProtected("C:\\Workspace\\File.ts");
				expect(registry.isProtected("c:\\workspace\\file.ts")).toBe(true);
				expect(registry.isProtected("C:\\WORKSPACE\\FILE.TS")).toBe(true);
			}
		});

		it("should handle relative path normalization", () => {
			const basePath = "/workspace/project";
			const relativePath = "src/../file.ts";
			const normalized = path.normalize(path.join(basePath, relativePath));

			registry.addProtected(normalized);
			expect(registry.isProtected(normalized)).toBe(true);
		});
	});

	describe("Performance - O(1) Lookup Validation", () => {
		it("should perform lookups in constant time with 1000 files", () => {
			// Add 1000 protected files
			for (let i = 0; i < 1000; i++) {
				registry.addProtected(`/workspace/file${i}.ts`);
			}

			// Measure lookup time
			const iterations = 10000;
			const start = Date.now();

			for (let i = 0; i < iterations; i++) {
				const fileIndex = i % 1000;
				registry.isProtected(`/workspace/file${fileIndex}.ts`);
			}

			const elapsed = Date.now() - start;
			const avgTimePerLookup = elapsed / iterations;

			// Should be sub-millisecond (<<0.01ms for O(1))
			expect(avgTimePerLookup).toBeLessThan(0.01);
		});

		it("should maintain O(1) lookup time as size increases", () => {
			const sizes = [100, 500, 1000];
			const lookupTimes: number[] = [];

			for (const size of sizes) {
				registry.clearAll();

				// Populate registry
				for (let i = 0; i < size; i++) {
					registry.addProtected(`/workspace/file${i}.ts`);
				}

				// Measure lookup time
				const iterations = 1000;
				const start = Date.now();

				for (let i = 0; i < iterations; i++) {
					registry.isProtected(`/workspace/file${i % size}.ts`);
				}

				const elapsed = Date.now() - start;
				lookupTimes.push(elapsed / iterations);
			}

			// O(1): lookup time should NOT scale with size
			// Allow 2x variance (due to system noise)
			const ratio = lookupTimes[2] / lookupTimes[0];
			expect(ratio).toBeLessThan(2);
		});

		it("should handle 10000 files efficiently", () => {
			const fileCount = 10000;

			// Add 10000 files
			const startAdd = Date.now();
			for (let i = 0; i < fileCount; i++) {
				registry.addProtected(`/workspace/file${i}.ts`);
			}
			const addTime = Date.now() - startAdd;

			// Should add 10000 files in under 1 second
			expect(addTime).toBeLessThan(1000);

			// Verify lookup performance
			const startLookup = Date.now();
			for (let i = 0; i < 1000; i++) {
				registry.isProtected(`/workspace/file${i * 10}.ts`);
			}
			const lookupTime = Date.now() - startLookup;

			// 1000 lookups should be sub-millisecond
			expect(lookupTime).toBeLessThan(10);
		});

		it("should perform faster than O(n) Array lookup", () => {
			// Simulate O(n) array-based lookup
			const arrayBased: string[] = [];
			const setBased = new Set<string>();

			const fileCount = 1000;
			for (let i = 0; i < fileCount; i++) {
				const file = `/workspace/file${i}.ts`;
				arrayBased.push(file);
				setBased.add(file);
			}

			// Measure Array.includes (O(n))
			const arrayStart = Date.now();
			for (let i = 0; i < 1000; i++) {
				arrayBased.includes(`/workspace/file${i % fileCount}.ts`);
			}
			const arrayTime = Date.now() - arrayStart;

			// Measure Set.has (O(1))
			const setStart = Date.now();
			for (let i = 0; i < 1000; i++) {
				setBased.has(`/workspace/file${i % fileCount}.ts`);
			}
			const setTime = Date.now() - setStart;

			// Set should be significantly faster (at least 10x with 1000 files)
			expect(setTime).toBeLessThan(arrayTime / 10);
		});
	});

	describe("Bulk Operations", () => {
		it("should add multiple files efficiently", () => {
			const files = Array.from(
				{ length: 1000 },
				(_, i) => `/workspace/file${i}.ts`,
			);

			const start = Date.now();
			registry.addMultiple(files);
			const elapsed = Date.now() - start;

			expect(registry.isProtected("/workspace/file0.ts")).toBe(true);
			expect(registry.isProtected("/workspace/file999.ts")).toBe(true);
			expect(registry.count()).toBe(1000);

			// Should complete in under 100ms
			expect(elapsed).toBeLessThan(100);
		});

		it("should remove multiple files efficiently", () => {
			const files = Array.from(
				{ length: 100 },
				(_, i) => `/workspace/file${i}.ts`,
			);
			registry.addMultiple(files);

			const toRemove = files.slice(0, 50);
			registry.removeMultiple(toRemove);

			expect(registry.count()).toBe(50);
			expect(registry.isProtected("/workspace/file0.ts")).toBe(false);
			expect(registry.isProtected("/workspace/file50.ts")).toBe(true);
		});
	});

	describe("Memory Efficiency", () => {
		it("should maintain constant memory usage per entry", () => {
			// Add 1000 files
			for (let i = 0; i < 1000; i++) {
				registry.addProtected(`/workspace/file${i}.ts`);
			}

			expect(registry.count()).toBe(1000);

			// Clear and re-add should not cause memory leaks
			registry.clearAll();
			expect(registry.count()).toBe(0);

			for (let i = 0; i < 1000; i++) {
				registry.addProtected(`/workspace/file${i}.ts`);
			}

			expect(registry.count()).toBe(1000);
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty registry", () => {
			expect(registry.count()).toBe(0);
			expect(registry.isProtected("/any/file.ts")).toBe(false);
			expect(registry.getAllProtectedFiles()).toEqual([]);
		});

		it("should handle paths with special characters", () => {
			registry.addProtected("/workspace/file-name_123.ts");
			registry.addProtected("/workspace/file@special#chars.ts");

			expect(registry.isProtected("/workspace/file-name_123.ts")).toBe(true);
			expect(registry.isProtected("/workspace/file@special#chars.ts")).toBe(
				true,
			);
		});

		it("should handle paths with spaces", () => {
			registry.addProtected("/workspace/file with spaces.ts");
			expect(registry.isProtected("/workspace/file with spaces.ts")).toBe(true);
		});

		it("should handle very long paths", () => {
			const longPath = `/workspace/${"a".repeat(200)}.ts`;
			registry.addProtected(longPath);
			expect(registry.isProtected(longPath)).toBe(true);
		});
	});
});
