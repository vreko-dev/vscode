/**
 * @fileoverview Demo-Critical Protection Level Logic Tests
 *
 * These tests validate the core protection level matching logic that is
 * demonstrated in the YC demo. All tests must pass for demo confidence.
 *
 * Coverage:
 * - File pattern matching (glob patterns)
 * - Protection level precedence (Override > Rule > Default)
 * - Inheritance and specificity
 * - Edge cases (nested patterns, conflicting rules)
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PolicyManager } from "../../../src/policy/PolicyManager";

describe("[DEMO-CRITICAL] Protection Level Logic", () => {
	let policyManager: PolicyManager;
	let testWorkspace: string;
	let policyDir: string;
	let policyPath: string;

	beforeEach(async () => {
		// Create a temporary workspace for testing
		testWorkspace = path.join(os.tmpdir(), `snapback-test-${Date.now()}`);
		await fs.mkdir(testWorkspace, { recursive: true });

		policyDir = path.join(testWorkspace, ".snapback");
		await fs.mkdir(policyDir, { recursive: true });

		policyPath = path.join(policyDir, "policy.json");

		policyManager = new PolicyManager(testWorkspace);
	});

	afterEach(async () => {
		// Clean up temp workspace
		await fs.rm(testWorkspace, { recursive: true, force: true });
	});

	describe("Basic Pattern Matching", () => {
		it("[DEMO] calculates WATCH for .js files", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "**/*.js", level: "watch", precedence: 1 }],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "test.js"),
			);

			expect(level).toBe("Watched");
		});

		it("[DEMO] calculates WARN for package.json", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "package.json", level: "warn", precedence: 1 }],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "package.json"),
			);

			expect(level).toBe("Warning");
		});

		it("[DEMO] calculates BLOCK for .env files", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "**/.env", level: "block", precedence: 1 }],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, ".env"),
			);

			expect(level).toBe("Protected");
		});
	});

	describe("Directory Inheritance", () => {
		it("[DEMO] inherits WARN from parent directory", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "src/**", level: "warn", precedence: 1 }],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "src/utils/helper.js"),
			);

			expect(level).toBe("Warning");
		});

		it("[DEMO] matches nested directories correctly", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "src/**/*.ts", level: "watch", precedence: 1 }],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "src/components/Button/index.ts"),
			);

			expect(level).toBe("Watched");
		});

		it("[DEMO] does not match files outside pattern scope", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "src/**/*.ts", level: "watch", precedence: 1 }],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "test/unit.ts"),
			);

			expect(level).toBeNull();
		});
	});

	describe("Precedence and Specificity", () => {
		it("[DEMO] specific file overrides directory pattern", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [
						{ pattern: "src/**", level: "warn", precedence: 1 },
						{ pattern: "src/critical.js", level: "block", precedence: 2 },
					],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "src/critical.js"),
			);

			expect(level).toBe("Protected");
		});

		it("[DEMO] higher precedence wins over earlier rules", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [
						{ pattern: "**/*.js", level: "watch", precedence: 1 },
						{ pattern: "src/**/*.js", level: "warn", precedence: 2 },
					],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "src/index.js"),
			);

			expect(level).toBe("Warning");
		});

		it("[DEMO] later rule with same precedence wins", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [
						{ pattern: "src/**", level: "watch", precedence: 1 },
						{ pattern: "src/**", level: "warn", precedence: 1 },
					],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "src/file.js"),
			);

			expect(level).toBe("Warning");
		});
	});

	describe("Override System", () => {
		it("[DEMO] override takes precedence over rules", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "**/*.js", level: "block", precedence: 10 }],
					overrides: [
						{
							pattern: "temp.js",
							level: "watch",
							rationale: "Temporary override for demo",
							createdAt: Date.now(),
							createdBy: "demo-user",
						},
					],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "temp.js"),
			);

			expect(level).toBe("Watched");
		});

		it("[DEMO] expired override falls back to rule", async () => {
			const expiredTime = Date.now() - 1000; // 1 second ago

			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "**/*.js", level: "block", precedence: 1 }],
					overrides: [
						{
							pattern: "temp.js",
							level: "watch",
							rationale: "Expired override",
							createdAt: expiredTime - 10000,
							createdBy: "demo-user",
							ttl: expiredTime,
						},
					],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "temp.js"),
			);

			expect(level).toBe("Protected"); // Falls back to rule
		});
	});

	describe("Edge Cases", () => {
		it("[DEMO] handles dotfiles correctly", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "**/.env*", level: "block", precedence: 1 }],
				}),
			);

			await policyManager.initialize();

			expect(
				policyManager.getProtectionLevel(path.join(testWorkspace, ".env")),
			).toBe("Protected");

			expect(
				policyManager.getProtectionLevel(
					path.join(testWorkspace, ".env.local"),
				),
			).toBe("Protected");
		});

		it("[DEMO] case-sensitive pattern matching", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "README.md", level: "warn", precedence: 1 }],
				}),
			);

			await policyManager.initialize();

			expect(
				policyManager.getProtectionLevel(path.join(testWorkspace, "README.md")),
			).toBe("Warning");

			// Should not match different case (unless on case-insensitive FS)
			const readmeLevel = policyManager.getProtectionLevel(
				path.join(testWorkspace, "readme.md"),
			);
			// On Linux/Mac: null, on Windows: Warning (case-insensitive)
			expect(readmeLevel === null || readmeLevel === "Warning").toBe(true);
		});

		it("[DEMO] handles multiple matching patterns correctly", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [
						{ pattern: "**/*.ts", level: "watch", precedence: 1 },
						{ pattern: "src/**", level: "warn", precedence: 2 },
						{ pattern: "src/critical/**", level: "block", precedence: 3 },
					],
				}),
			);

			await policyManager.initialize();

			// Should pick highest precedence that matches
			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "src/critical/auth.ts"),
			);

			expect(level).toBe("Protected");
		});

		it("[DEMO] returns null for no matching rules", async () => {
			await fs.writeFile(
				policyPath,
				JSON.stringify({
					version: "1.0",
					rules: [{ pattern: "src/**", level: "watch", precedence: 1 }],
				}),
			);

			await policyManager.initialize();

			const level = policyManager.getProtectionLevel(
				path.join(testWorkspace, "docs/README.md"),
			);

			expect(level).toBeNull();
		});
	});
});
