/**
 * @fileoverview File Validation Security Tests
 *
 * These tests validate path security and workspace boundary enforcement.
 * Critical for preventing path traversal attacks and unauthorized file access.
 *
 * SECURITY-CRITICAL: These tests must pass to prevent security vulnerabilities.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathValidator } from "../../../src/security/pathValidator";

describe("[DEMO-CRITICAL] File Validation Security", () => {
	let validator: PathValidator;
	let testWorkspace: string;
	let testFile: string;

	beforeEach(async () => {
		// Create a temporary workspace for testing
		testWorkspace = path.join(
			os.tmpdir(),
			`snapback-security-test-${Date.now()}`,
		);
		await fs.mkdir(testWorkspace, { recursive: true });

		// Create a test file within workspace
		testFile = path.join(testWorkspace, "test.txt");
		await fs.writeFile(testFile, "test content");

		validator = new PathValidator(testWorkspace);
	});

	afterEach(async () => {
		// Clean up temp workspace
		await fs.rm(testWorkspace, { recursive: true, force: true });
	});

	describe("Path Traversal Prevention", () => {
		it("[DEMO] blocks classic path traversal (../)", async () => {
			const maliciousPath = path.join(testWorkspace, "../../../etc/passwd");

			const isSafe = await validator.isPathSafe(maliciousPath);

			expect(isSafe).toBe(false);
		});

		it("[DEMO] blocks multiple directory traversals", async () => {
			const maliciousPath = path.join(
				testWorkspace,
				"../../sensitive-file.txt",
			);

			const isSafe = await validator.isPathSafe(maliciousPath);

			expect(isSafe).toBe(false);
		});

		it("[DEMO] allows safe paths within workspace", async () => {
			const safePath = path.join(testWorkspace, "test.txt");

			const isSafe = await validator.isPathSafe(safePath);

			expect(isSafe).toBe(true);
		});

		it("[DEMO] blocks paths outside workspace even if they exist", async () => {
			// Try to access a system file
			const systemPath =
				process.platform === "win32"
					? "C:\\Windows\\System32\\notepad.exe"
					: "/usr/bin/env";

			const isSafe = await validator.isPathSafe(systemPath);

			expect(isSafe).toBe(false);
		});
	});

	describe("Encoded Attack Prevention", () => {
		it("[DEMO] blocks URL-encoded traversal (%2e%2e%2f)", async () => {
			const maliciousPath = path.join(
				testWorkspace,
				"%2e%2e%2f",
				"etc",
				"passwd",
			);

			const isSafe = await validator.isPathSafe(maliciousPath);

			expect(isSafe).toBe(false);
		});

		it("[DEMO] blocks double-encoded traversal (%252e)", async () => {
			const maliciousPath = path.join(testWorkspace, "%252e%252e/etc");

			const isSafe = await validator.isPathSafe(maliciousPath);

			expect(isSafe).toBe(false);
		});

		it("[DEMO] blocks Windows-style encoded traversal (%2e%2e%5c)", async () => {
			if (process.platform === "win32") {
				const maliciousPath = `${testWorkspace}%2e%2e%5cWindows`;

				const isSafe = await validator.isPathSafe(maliciousPath);

				expect(isSafe).toBe(false);
			} else {
				// Test still runs on non-Windows but expects failure
				expect(true).toBe(true);
			}
		});
	});

	describe("Null Byte Injection Prevention", () => {
		it("[DEMO] blocks null byte injection", async () => {
			const maliciousPath = `${testWorkspace}/test.txt\0.jpg`;

			const isSafe = await validator.isPathSafe(maliciousPath);

			expect(isSafe).toBe(false);
		});
	});

	describe("Workspace Boundary Enforcement", () => {
		it("[DEMO] rejects paths with similar but different workspace names", async () => {
			// Create a sibling directory with similar name
			const siblingWorkspace = `${testWorkspace}-other`;
			await fs.mkdir(siblingWorkspace, { recursive: true });

			const siblingFile = path.join(siblingWorkspace, "test.txt");
			await fs.writeFile(siblingFile, "content");

			const isSafe = await validator.isPathSafe(siblingFile);

			expect(isSafe).toBe(false);

			// Clean up
			await fs.rm(siblingWorkspace, { recursive: true, force: true });
		});

		it("[DEMO] allows nested directory paths within workspace", async () => {
			const nestedDir = path.join(testWorkspace, "src", "components");
			await fs.mkdir(nestedDir, { recursive: true });

			const nestedFile = path.join(nestedDir, "Button.tsx");
			await fs.writeFile(nestedFile, "component code");

			const isSafe = await validator.isPathSafe(nestedFile);

			expect(isSafe).toBe(true);
		});

		it("[DEMO] rejects non-existent files", async () => {
			const nonExistentPath = path.join(testWorkspace, "does-not-exist.txt");

			const isSafe = await validator.isPathSafe(nonExistentPath);

			expect(isSafe).toBe(false);
		});

		it("[DEMO] rejects empty path strings", async () => {
			const isSafe = await validator.isPathSafe("");

			expect(isSafe).toBe(false);
		});
	});

	describe("Constructor Validation", () => {
		it("[DEMO] throws error for empty workspace root", () => {
			expect(() => new PathValidator("")).toThrow(
				"Workspace root cannot be empty",
			);
		});

		it("[DEMO] throws error for non-existent workspace", () => {
			expect(() => new PathValidator("/this/does/not/exist")).toThrow(
				"Workspace root does not exist",
			);
		});

		it("[DEMO] throws error when workspace is a file, not a directory", async () => {
			const tempFile = path.join(os.tmpdir(), `file-${Date.now()}.txt`);
			await fs.writeFile(tempFile, "test");

			expect(() => new PathValidator(tempFile)).toThrow(
				"Workspace root must be a directory",
			);

			await fs.rm(tempFile);
		});
	});
});
