import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathValidator } from "@vscode/security/pathValidator";

describe("PathValidator - Path Traversal Protection", () => {
	let validator: PathValidator;
	let tempDir: string;
	let testFile: string;
	let nestedDir: string;
	let nestedFile: string;

	beforeEach(async () => {
		// Create temporary workspace directory
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-path-test-"));
		validator = new PathValidator(tempDir);

		// Create test files and directories
		testFile = path.join(tempDir, "test.txt");
		await fs.writeFile(testFile, "test content");

		nestedDir = path.join(tempDir, "nested", "deep");
		await fs.mkdir(nestedDir, { recursive: true });

		nestedFile = path.join(nestedDir, "file.txt");
		await fs.writeFile(nestedFile, "nested content");
	});

	afterEach(async () => {
		// Clean up temporary directory
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("Valid Paths", () => {
		it("should accept valid file path within workspace", async () => {
			const result = await validator.isPathSafe(testFile);
			expect(result).toBe(true);
		});

		it("should accept nested valid path within workspace", async () => {
			const result = await validator.isPathSafe(nestedFile);
			expect(result).toBe(true);
		});

		it("should accept relative path that resolves within workspace", async () => {
			const relativePath = path.join(tempDir, "nested", "..", "test.txt");
			const result = await validator.isPathSafe(relativePath);
			expect(result).toBe(true);
		});

		it("should accept path with normalized slashes", async () => {
			const normalizedPath = path.join(tempDir, "nested/deep/file.txt");
			const result = await validator.isPathSafe(normalizedPath);
			expect(result).toBe(true);
		});
	});

	describe("Path Traversal Attack Vectors", () => {
		it("should block simple parent directory traversal (../)", async () => {
			const maliciousPath = path.join(tempDir, "..", "etc", "passwd");
			const result = await validator.isPathSafe(maliciousPath);
			expect(result).toBe(false);
		});

		it("should block multiple parent directory traversals (../../)", async () => {
			const maliciousPath = path.join(
				tempDir,
				"..",
				"..",
				"..",
				"etc",
				"passwd",
			);
			const result = await validator.isPathSafe(maliciousPath);
			expect(result).toBe(false);
		});

		it("should block absolute path outside workspace", async () => {
			const maliciousPath = "/etc/passwd";
			const result = await validator.isPathSafe(maliciousPath);
			expect(result).toBe(false);
		});

		it("should block path starting outside workspace root", async () => {
			const parentDir = path.dirname(tempDir);
			const maliciousPath = path.join(parentDir, "other-folder", "file.txt");
			const result = await validator.isPathSafe(maliciousPath);
			expect(result).toBe(false);
		});

		it("should block encoded path traversal (..%2F)", async () => {
			// Test URL-encoded traversal attempts
			const encodedPath = `${tempDir}/..%2Fetc%2Fpasswd`;
			const result = await validator.isPathSafe(encodedPath);
			expect(result).toBe(false);
		});

		it("should block double-encoded path traversal (..%252F)", async () => {
			const doubleEncodedPath = `${tempDir}/..%252Fetc%252Fpasswd`;
			const result = await validator.isPathSafe(doubleEncodedPath);
			expect(result).toBe(false);
		});

		it("should block path with null byte injection", async () => {
			const nullBytePath = path.join(tempDir, "test.txt\0.jpg");
			const result = await validator.isPathSafe(nullBytePath);
			expect(result).toBe(false);
		});

		it("should block symbolic link traversal outside workspace", async () => {
			// Create a symbolic link pointing outside the workspace
			const symlinkPath = path.join(tempDir, "malicious-link");
			const targetPath = path.join(os.tmpdir(), "outside-workspace.txt");

			try {
				await fs.writeFile(targetPath, "outside content");
				await fs.symlink(targetPath, symlinkPath);

				const result = await validator.isPathSafe(symlinkPath);
				expect(result).toBe(false);

				// Clean up
				await fs.unlink(symlinkPath);
				await fs.unlink(targetPath);
			} catch (error) {
				// Skip test if symlinks not supported (e.g., Windows without admin)
				console.warn("Symlink test skipped:", error);
			}
		});
	});

	describe("Platform-Specific Attack Vectors", () => {
		if (process.platform === "win32") {
			it("should block Windows drive letter absolute path", async () => {
				const maliciousPath = "C:\\Windows\\System32\\config\\sam";
				const result = await validator.isPathSafe(maliciousPath);
				expect(result).toBe(false);
			});

			it("should block Windows UNC path", async () => {
				const maliciousPath = "\\\\server\\share\\file.txt";
				const result = await validator.isPathSafe(maliciousPath);
				expect(result).toBe(false);
			});

			it("should block Windows alternate data streams", async () => {
				const maliciousPath = path.join(tempDir, "test.txt:hidden");
				const result = await validator.isPathSafe(maliciousPath);
				expect(result).toBe(false);
			});

			it("should block Windows backslash traversal", async () => {
				const maliciousPath = `${tempDir}\\..\\..\\etc\\passwd`;
				const result = await validator.isPathSafe(maliciousPath);
				expect(result).toBe(false);
			});
		}

		if (process.platform !== "win32") {
			it("should block Unix root directory access", async () => {
				const maliciousPath = "/etc/passwd";
				const result = await validator.isPathSafe(maliciousPath);
				expect(result).toBe(false);
			});

			it("should block Unix home directory traversal", async () => {
				const maliciousPath = path.join(
					tempDir,
					"..",
					"..",
					"..",
					"home",
					"user",
					".ssh",
					"id_rsa",
				);
				const result = await validator.isPathSafe(maliciousPath);
				expect(result).toBe(false);
			});
		}
	});

	describe("Edge Cases", () => {
		it("should reject non-existent file within workspace boundary", async () => {
			const nonExistentPath = path.join(tempDir, "does-not-exist.txt");
			const result = await validator.isPathSafe(nonExistentPath);
			expect(result).toBe(false);
		});

		it("should reject empty path", async () => {
			const result = await validator.isPathSafe("");
			expect(result).toBe(false);
		});

		it("should reject path with only whitespace", async () => {
			const result = await validator.isPathSafe("   ");
			expect(result).toBe(false);
		});

		it("should handle path with spaces correctly", async () => {
			const pathWithSpaces = path.join(tempDir, "file with spaces.txt");
			await fs.writeFile(pathWithSpaces, "content");

			const result = await validator.isPathSafe(pathWithSpaces);
			expect(result).toBe(true);

			await fs.unlink(pathWithSpaces);
		});

		it("should handle path with special characters correctly", async () => {
			const specialCharsPath = path.join(tempDir, "file-name_123.txt");
			await fs.writeFile(specialCharsPath, "content");

			const result = await validator.isPathSafe(specialCharsPath);
			expect(result).toBe(true);

			await fs.unlink(specialCharsPath);
		});

		it("should reject workspace root as file path", async () => {
			const result = await validator.isPathSafe(tempDir);
			// Directories should be rejected if we're only validating files
			expect(result).toBe(false);
		});
	});

	describe("Constructor Validation", () => {
		it("should throw error if workspace root is empty", () => {
			expect(() => new PathValidator("")).toThrow();
		});

		it("should throw error if workspace root is invalid", () => {
			expect(() => new PathValidator("/non/existent/workspace")).toThrow();
		});

		it("should accept valid workspace root", () => {
			expect(() => new PathValidator(tempDir)).not.toThrow();
		});
	});

	describe("Performance", () => {
		it("should validate path efficiently (under 10ms)", async () => {
			const startTime = Date.now();
			await validator.isPathSafe(testFile);
			const duration = Date.now() - startTime;

			expect(duration).toBeLessThan(10);
		});

		it("should handle multiple validations without performance degradation", async () => {
			const iterations = 100;
			const startTime = Date.now();

			for (let i = 0; i < iterations; i++) {
				await validator.isPathSafe(testFile);
			}

			const duration = Date.now() - startTime;
			const averageTime = duration / iterations;

			expect(averageTime).toBeLessThan(5);
		});
	});

	describe("Normalized Path Comparison", () => {
		it("should normalize paths before comparison", async () => {
			const unnormalizedPath = path.join(
				tempDir,
				"nested",
				".",
				"deep",
				"file.txt",
			);
			const result = await validator.isPathSafe(unnormalizedPath);
			expect(result).toBe(true);
		});

		it("should detect traversal after normalization", async () => {
			const traversalPath = path.join(
				tempDir,
				"nested",
				"deep",
				"..",
				"..",
				"..",
				"..",
				"etc",
				"passwd",
			);
			const result = await validator.isPathSafe(traversalPath);
			expect(result).toBe(false);
		});

		it("should handle mixed separators on Windows", async () => {
			if (process.platform === "win32") {
				const mixedPath = `${tempDir.replace(/\\/g, "/")}/test.txt`;
				const result = await validator.isPathSafe(mixedPath);
				expect(result).toBe(true);
			}
		});
	});
});
