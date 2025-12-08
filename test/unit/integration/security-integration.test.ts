import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationCache } from "@vscode/performance/operationCache";
import { GlobValidator } from "@vscode/security/globValidator";
import { PathValidator } from "@vscode/security/pathValidator";

/**
 * Simplified ProtectedFileRegistry for integration testing
 */
class TestProtectedFileRegistry {
	private protectedPaths = new Set<string>();

	addProtected(filePath: string): void {
		this.protectedPaths.add(path.normalize(filePath));
	}

	isProtected(filePath: string): boolean {
		return this.protectedPaths.has(path.normalize(filePath));
	}

	removeProtected(filePath: string): void {
		this.protectedPaths.delete(path.normalize(filePath));
	}

	clearAll(): void {
		this.protectedPaths.clear();
	}

	count(): number {
		return this.protectedPaths.size;
	}
}

describe("Security & Performance Integration Tests", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "integration-"));
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("PathValidator + ProtectedFileRegistry Integration", () => {
		it("should validate paths and protect files in realistic workflow", async () => {
			const pathValidator = new PathValidator(tempDir);
			const registry = new TestProtectedFileRegistry();

			// Create test files
			const safeFile = path.join(tempDir, "safe.ts");
			const protectedFile = path.join(tempDir, "protected.ts");
			await fs.writeFile(safeFile, "safe content");
			await fs.writeFile(protectedFile, "protected content");

			// Protect one file
			registry.addProtected(protectedFile);

			// Validate paths
			expect(await pathValidator.isPathSafe(safeFile)).toBe(true);
			expect(await pathValidator.isPathSafe(protectedFile)).toBe(true);

			// Check protection
			expect(registry.isProtected(safeFile)).toBe(false);
			expect(registry.isProtected(protectedFile)).toBe(true);

			// Attack attempt - path traversal
			const attackPath = path.join(tempDir, "../etc/passwd");
			expect(await pathValidator.isPathSafe(attackPath)).toBe(false);
		});

		it("should handle bulk file operations with validation", async () => {
			const pathValidator = new PathValidator(tempDir);
			const registry = new TestProtectedFileRegistry();

			// Create multiple files
			const files: string[] = [];
			for (let i = 0; i < 100; i++) {
				const filePath = path.join(tempDir, `file${i}.ts`);
				await fs.writeFile(filePath, `content ${i}`);
				files.push(filePath);
			}

			// Validate and protect all files
			for (const file of files) {
				if (await pathValidator.isPathSafe(file)) {
					registry.addProtected(file);
				}
			}

			expect(registry.count()).toBe(100);

			// Verify all protected
			for (const file of files) {
				expect(registry.isProtected(file)).toBe(true);
			}
		});

		it("should reject protected files outside workspace boundary", async () => {
			const pathValidator = new PathValidator(tempDir);
			const registry = new TestProtectedFileRegistry();

			// Attempt to protect file outside workspace
			const outsideFile = "/tmp/outside.ts";

			// Validation should fail
			const isValid = await pathValidator.isPathSafe(outsideFile);
			expect(isValid).toBe(false);

			// Should not add to registry if validation fails
			if (isValid) {
				registry.addProtected(outsideFile);
			}

			expect(registry.isProtected(outsideFile)).toBe(false);
		});
	});

	describe("GlobValidator + PathValidator Integration", () => {
		it("should validate glob patterns and resulting file paths", async () => {
			const globValidator = new GlobValidator();
			const pathValidator = new PathValidator(tempDir);

			// Valid glob pattern
			const validGlob = "**/*.ts";
			expect(globValidator.isGlobSafe(validGlob)).toBe(true);

			// Create matching files
			await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
			const file1 = path.join(tempDir, "src", "file1.ts");
			await fs.writeFile(file1, "content");

			// Validate the matched file path
			expect(await pathValidator.isPathSafe(file1)).toBe(true);

			// Unsafe glob should be rejected before any file operations
			// Use wildcards separated by slashes to count as individual wildcards (not globstars)
			const unsafeGlob = "*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*"; // 21 wildcards
			expect(globValidator.isGlobSafe(unsafeGlob)).toBe(false);
		});

		it("should handle complex glob patterns with path validation", async () => {
			const globValidator = new GlobValidator();
			const pathValidator = new PathValidator(tempDir);

			// Complex valid patterns
			const patterns = [
				"src/**/*.{ts,tsx}",
				"test/**/*.test.ts",
				"**/*.spec.{ts,js}",
			];

			for (const pattern of patterns) {
				expect(globValidator.isGlobSafe(pattern)).toBe(true);
			}

			// Create directory structure
			await fs.mkdir(path.join(tempDir, "src", "components"), {
				recursive: true,
			});
			await fs.mkdir(path.join(tempDir, "test"), { recursive: true });

			const files = [
				path.join(tempDir, "src", "components", "Button.tsx"),
				path.join(tempDir, "test", "Button.test.ts"),
			];

			for (const file of files) {
				await fs.writeFile(file, "content");
				expect(await pathValidator.isPathSafe(file)).toBe(true);
			}
		});

		it("should reject unsafe glob patterns before file operations", () => {
			const globValidator = new GlobValidator();

			// ReDoS attack patterns
			const attackPatterns = [
				"**/**/**/**/".repeat(10),
				"(a+)+b",
				"a".repeat(1001),
				`${"{".repeat(20)}a${"}".repeat(20)}`,
			];

			for (const pattern of attackPatterns) {
				expect(globValidator.isGlobSafe(pattern)).toBe(false);
			}
		});
	});

	describe("OperationCache + File Operations Integration", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.clearAllTimers();
			vi.useRealTimers();
		});

		it("should cache validation results without memory leaks", async () => {
			const pathValidator = new PathValidator(tempDir);
			const cache = new OperationCache<boolean>(100, 5000);

			// Create test file
			const testFile = path.join(tempDir, "test.ts");
			await fs.writeFile(testFile, "content");

			// Cache validation results
			const cacheKey = `validate:${testFile}`;
			let cachedResult = cache.get(cacheKey);

			if (cachedResult === undefined) {
				const result = await pathValidator.isPathSafe(testFile);
				cache.set(cacheKey, result);
				cachedResult = result;
			}

			expect(cachedResult).toBe(true);

			// Cache hit on second call
			const secondResult = cache.get(cacheKey);
			expect(secondResult).toBe(true);

			// TTL expiration
			vi.advanceTimersByTime(5001);
			expect(cache.get(cacheKey)).toBeUndefined();
		});

		it("should handle 1000 cached operations without memory leaks", () => {
			const cache = new OperationCache<string>(500, 5000);
			const registry = new TestProtectedFileRegistry();

			// Simulate 1000 operations
			for (let i = 0; i < 1000; i++) {
				const file = `/workspace/file${i}.ts`;
				cache.set(`op:${i}`, file);
				registry.addProtected(file);
			}

			// Cache limited to 500
			expect(cache.size()).toBe(500);

			// Registry has all 1000
			expect(registry.count()).toBe(1000);

			// TTL cleanup
			vi.advanceTimersByTime(5001);
			expect(cache.size()).toBe(0);

			// Registry unaffected
			expect(registry.count()).toBe(1000);
		});

		it("should cache glob validation results", () => {
			const globValidator = new GlobValidator();
			const cache = new OperationCache<boolean>(100, 5000);

			const patterns = [
				"*.ts",
				"src/**/*.js",
				"**/*.{ts,tsx}",
				"*".repeat(25), // unsafe
			];

			for (const pattern of patterns) {
				const cacheKey = `glob:${pattern}`;
				let result = cache.get(cacheKey);

				if (result === undefined) {
					result = globValidator.isGlobSafe(pattern);
					cache.set(cacheKey, result);
				}

				expect(cache.get(cacheKey)).toBe(result);
			}

			expect(cache.size()).toBe(4);
		});
	});

	describe("Multi-Layer Security Validation", () => {
		it("should block attacks across all security layers", async () => {
			const pathValidator = new PathValidator(tempDir);
			const globValidator = new GlobValidator();
			const registry = new TestProtectedFileRegistry();

			// Layer 1: Glob validation
			// Use wildcards separated by slashes to count as individual wildcards
			const unsafeGlob = "*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*"; // 21 wildcards
			expect(globValidator.isGlobSafe(unsafeGlob)).toBe(false);

			// Layer 2: Path validation
			const traversalPath = path.join(tempDir, "../../../etc/passwd");
			expect(await pathValidator.isPathSafe(traversalPath)).toBe(false);

			// Layer 3: Protected file check (only valid files)
			const validFile = path.join(tempDir, "valid.ts");
			await fs.writeFile(validFile, "content");

			if (await pathValidator.isPathSafe(validFile)) {
				registry.addProtected(validFile);
			}

			expect(registry.isProtected(validFile)).toBe(true);
			expect(registry.isProtected(traversalPath)).toBe(false);
		});

		it("should handle combined attack vectors", async () => {
			const pathValidator = new PathValidator(tempDir);
			const globValidator = new GlobValidator();

			// Attack 1: Unsafe glob + path traversal
			const unsafeGlob = "**/**/**/**/../../../etc/passwd";
			expect(globValidator.isGlobSafe(unsafeGlob)).toBe(false);

			// Attack 2: Encoded traversal in glob
			const encodedGlob = "../%2e%2e/etc/passwd";
			if (globValidator.isGlobSafe(encodedGlob)) {
				// If glob passes, path should still reject
				const result = await pathValidator.isPathSafe(
					path.join(tempDir, encodedGlob),
				);
				expect(result).toBe(false);
			}

			// Attack 3: ReDoS pattern with path injection
			const redosGlob = "(a+)+/**/etc/passwd";
			expect(globValidator.isGlobSafe(redosGlob)).toBe(false);
		});
	});

	describe("Performance Integration Tests", () => {
		it("should complete 1000 operations in under 1 second", async () => {
			const pathValidator = new PathValidator(tempDir);
			const registry = new TestProtectedFileRegistry();

			// Create 100 test files
			const files: string[] = [];
			for (let i = 0; i < 100; i++) {
				const file = path.join(tempDir, `file${i}.ts`);
				await fs.writeFile(file, "content");
				files.push(file);
			}

			const start = Date.now();

			// Perform 1000 operations (10 passes over 100 files)
			for (let pass = 0; pass < 10; pass++) {
				for (const file of files) {
					await pathValidator.isPathSafe(file);
					registry.addProtected(file);
					registry.isProtected(file);
				}
			}

			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(1000);
		});

		it("should maintain O(1) lookup with large datasets", async () => {
			const registry = new TestProtectedFileRegistry();

			// Add 1000 files
			const files: string[] = [];
			for (let i = 0; i < 1000; i++) {
				const file = `/workspace/file${i}.ts`;
				files.push(file);
				registry.addProtected(file);
			}

			// Measure lookup time
			const start = Date.now();
			for (let i = 0; i < 10000; i++) {
				registry.isProtected(files[i % 1000]);
			}
			const elapsed = Date.now() - start;

			// 10000 lookups should be fast
			expect(elapsed).toBeLessThan(100);
		});
	});

	describe("Error Handling Integration", () => {
		it("should handle file system errors gracefully", async () => {
			const pathValidator = new PathValidator(tempDir);

			// Non-existent file
			const nonExistent = path.join(tempDir, "does-not-exist.ts");
			expect(await pathValidator.isPathSafe(nonExistent)).toBe(false);

			// Permission denied (if applicable)
			const restrictedPath = "/root/.ssh/id_rsa";
			expect(await pathValidator.isPathSafe(restrictedPath)).toBe(false);
		});

		it("should handle invalid input gracefully", () => {
			const globValidator = new GlobValidator();

			// Null/undefined
			expect(globValidator.isGlobSafe(null as any)).toBe(false);
			expect(globValidator.isGlobSafe(undefined as any)).toBe(false);

			// Empty string
			expect(globValidator.isGlobSafe("")).toBe(false);

			// Whitespace only
			expect(globValidator.isGlobSafe("   ")).toBe(false);
		});

		it("should handle malformed paths", async () => {
			const pathValidator = new PathValidator(tempDir);

			// Null byte
			const nullByte = path.join(tempDir, "file\0.ts");
			expect(await pathValidator.isPathSafe(nullByte)).toBe(false);

			// Empty path
			expect(await pathValidator.isPathSafe("")).toBe(false);

			// Whitespace path
			expect(await pathValidator.isPathSafe("   ")).toBe(false);
		});
	});

	describe("Real-World Workflow Simulation", () => {
		it("should handle complete file protection workflow", async () => {
			const pathValidator = new PathValidator(tempDir);
			const globValidator = new GlobValidator();
			const registry = new TestProtectedFileRegistry();
			const cache = new OperationCache<boolean>(100, 5000);

			// Step 1: Validate glob pattern
			const pattern = "src/**/*.ts";
			expect(globValidator.isGlobSafe(pattern)).toBe(true);

			// Step 2: Create files
			await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
			const files = [
				path.join(tempDir, "src", "index.ts"),
				path.join(tempDir, "src", "utils.ts"),
				path.join(tempDir, "src", "types.ts"),
			];

			for (const file of files) {
				await fs.writeFile(file, "content");
			}

			// Step 3: Validate and cache each file
			for (const file of files) {
				const cacheKey = `validate:${file}`;
				let isValid = cache.get(cacheKey);

				if (isValid === undefined) {
					isValid = await pathValidator.isPathSafe(file);
					cache.set(cacheKey, isValid);
				}

				if (isValid) {
					registry.addProtected(file);
				}
			}

			// Step 4: Verify protection
			expect(registry.count()).toBe(3);
			for (const file of files) {
				expect(registry.isProtected(file)).toBe(true);
			}

			// Step 5: Handle modifications
			registry.removeProtected(files[0]);
			expect(registry.count()).toBe(2);
			expect(registry.isProtected(files[0])).toBe(false);
		});
	});
});
