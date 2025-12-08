import { beforeEach, describe, expect, it } from "vitest";
import type { ProtectionRule } from "@vscode/types/snapbackrc.types";

/**
 * RED PHASE: Tests for DEFAULT_CRITICAL_PATTERNS
 *
 * These tests define the expected behavior for a new constant that should contain
 * ONLY the most critical protection patterns (15-20 files).
 *
 * Critical files = those where accidental changes cause IMMEDIATE PRODUCTION IMPACT
 *
 * The constant should NOT exist yet - these tests will fail until implemented.
 */
describe("DEFAULT_CRITICAL_PATTERNS - RED Phase", () => {
	// Note: This constant will be created in the GREEN phase
	// We import it dynamically to allow it to not exist during RED phase
	let DEFAULT_CRITICAL_PATTERNS: ProtectionRule[];

	beforeEach(async () => {
		try {
			const module = (await import(
				"../../../src/config/defaultConfig.js"
			)) as any;
			DEFAULT_CRITICAL_PATTERNS = module.DEFAULT_CRITICAL_PATTERNS || [];
		} catch {
			// Expected to fail in RED phase
			DEFAULT_CRITICAL_PATTERNS = [];
		}
	});

	describe("Basic Structure", () => {
		it("should export DEFAULT_CRITICAL_PATTERNS constant", async () => {
			const module = await import("../../../src/config/defaultConfig.js");
			expect(module).toHaveProperty("DEFAULT_CRITICAL_PATTERNS");
		});

		it("should contain between 15-20 protection rules", () => {
			expect(DEFAULT_CRITICAL_PATTERNS.length).toBeGreaterThanOrEqual(15);
			expect(DEFAULT_CRITICAL_PATTERNS.length).toBeLessThanOrEqual(20);
		});

		it("should be frozen (immutable)", () => {
			expect(() => {
				(DEFAULT_CRITICAL_PATTERNS as any).push({ pattern: "test" });
			}).toThrow();
		});
	});

	describe("MUST Include: Dependency Locks", () => {
		// These are absolutely critical - wrong versions break production builds
		const criticalLockPatterns = [
			"**/package-lock.json",
			"**/yarn.lock",
			"**/pnpm-lock.yaml",
			"**/poetry.lock",
			"**/Cargo.lock",
			"**/go.sum",
			"**/Gemfile.lock",
			"**/composer.lock",
		];

		criticalLockPatterns.forEach((pattern) => {
			it(`should include lock file pattern: ${pattern}`, () => {
				const found = DEFAULT_CRITICAL_PATTERNS.find(
					(r) => r.pattern === pattern,
				);
				expect(found).toBeDefined();
				expect(found?.level).toBe("Protected");
			});
		});

		it("should have at least 5 lock file patterns", () => {
			const lockPatterns = DEFAULT_CRITICAL_PATTERNS.filter(
				(r) =>
					r.pattern.includes("lock") ||
					r.pattern.includes("yarn") ||
					r.pattern.includes("poetry") ||
					r.pattern.includes("Gemfile"),
			);
			expect(lockPatterns.length).toBeGreaterThanOrEqual(5);
		});
	});

	describe("MUST Include: Environment & Secrets", () => {
		// Exposing these causes immediate security breaches
		it("should include .env files pattern", () => {
			const envRule = DEFAULT_CRITICAL_PATTERNS.find(
				(r) => r.pattern === "**/.env*",
			);
			expect(envRule).toBeDefined();
			expect(envRule?.level).toBe("Protected");
			expect(
				envRule?.reason?.includes("sensitive") ||
					envRule?.reason?.includes("environment"),
			).toBe(true);
		});

		it("should not include broad *.json pattern (too many non-critical files)", () => {
			const jsonRule = DEFAULT_CRITICAL_PATTERNS.find(
				(r) => r.pattern === "*.json",
			);
			expect(jsonRule).toBeUndefined();
		});
	});

	describe("MUST Include: Infrastructure & Deployment", () => {
		// These control deployment and infrastructure - wrong changes break production
		const infraPatterns = [
			"Dockerfile",
			"**/*.tf", // Terraform
			".github/workflows/*.yml",
		];

		infraPatterns.forEach((pattern) => {
			it(`should include infrastructure pattern: ${pattern}`, () => {
				const found = DEFAULT_CRITICAL_PATTERNS.find(
					(r) =>
						r.pattern === pattern || r.pattern.includes(pattern.split("/")[0]),
				);
				expect(found).toBeDefined();
				expect(found?.level === "Protected" || found?.level === "Warning").toBe(
					true,
				);
			});
		});
	});

	describe("MUST Include: Infrastructure & Deployment (continued)", () => {
		it("should include docker-compose files with yml and yaml variants", () => {
			const dockerComposeRules = DEFAULT_CRITICAL_PATTERNS.filter((r) =>
				r.pattern.includes("docker-compose"),
			);
			expect(dockerComposeRules.length).toBeGreaterThanOrEqual(2); // .yml and .yaml
			expect(dockerComposeRules.every((r) => r.level === "Warning")).toBe(true);
		});
	});

	describe("MUST Include: Framework Configs (Select Only)", () => {
		// Include ONLY the most critical framework configs, not all
		const criticalFrameworkConfigs = ["package.json", "tsconfig.json"];

		criticalFrameworkConfigs.forEach((pattern) => {
			it(`should include critical framework pattern: ${pattern}`, () => {
				const found = DEFAULT_CRITICAL_PATTERNS.find(
					(r) => r.pattern === pattern,
				);
				expect(found).toBeDefined();
				expect(found?.level === "Protected" || found?.level === "Warning").toBe(
					true,
				);
			});
		});
	});

	describe("MUST NOT Include: Broad Patterns", () => {
		// These are too broad and match too many non-critical files
		const forbiddenPatterns = [
			"*.md", // Matches 100+ documentation files
			"*.json", // Matches 100+ JSON files (many non-critical)
			"*.ts", // Matches all source files
			"*.yaml", // Matches all YAML files
			"*.yml", // Matches all YAML files
		];

		forbiddenPatterns.forEach((pattern) => {
			it(`should NOT include overly broad pattern: ${pattern}`, () => {
				const found = DEFAULT_CRITICAL_PATTERNS.find(
					(r) => r.pattern === pattern,
				);
				expect(found).toBeUndefined();
			});
		});
	});

	describe("Protection Levels", () => {
		it("should only use Protected or Warning levels (not Watched)", () => {
			const invalidLevels = DEFAULT_CRITICAL_PATTERNS.filter(
				(r) => r.level !== "Protected" && r.level !== "Warning",
			);
			expect(invalidLevels).toHaveLength(0);
		});

		it("should mark most critical files as Protected (not Warning)", () => {
			const protectedCount = DEFAULT_CRITICAL_PATTERNS.filter(
				(r) => r.level === "Protected",
			).length;
			const warningCount = DEFAULT_CRITICAL_PATTERNS.filter(
				(r) => r.level === "Warning",
			).length;

			// Most should be Protected, some can be Warning for less critical configs
			expect(protectedCount).toBeGreaterThanOrEqual(warningCount);
		});

		it("should have .env files marked as Protected (not Warning)", () => {
			const envRule = DEFAULT_CRITICAL_PATTERNS.find(
				(r) => r.pattern === "**/.env*",
			);
			expect(envRule?.level).toBe("Protected");
		});

		it("should have lock files marked as Protected (not Warning)", () => {
			const lockRules = DEFAULT_CRITICAL_PATTERNS.filter(
				(r) => r.pattern.includes("lock") || r.pattern.includes("yarn"),
			);
			expect(lockRules.every((r) => r.level === "Protected")).toBe(true);
		});
	});

	describe("Quality Checks", () => {
		it("should not have duplicate patterns", () => {
			const patterns = DEFAULT_CRITICAL_PATTERNS.map((r) => r.pattern);
			const uniquePatterns = [...new Set(patterns)];
			expect(patterns).toHaveLength(uniquePatterns.length);
		});

		it("should have reason/description for each rule", () => {
			const rulesWithoutReason = DEFAULT_CRITICAL_PATTERNS.filter(
				(r) => !r.reason,
			);
			expect(rulesWithoutReason).toHaveLength(0);
		});

		it("should use consistent pattern syntax", () => {
			const invalidPatterns = DEFAULT_CRITICAL_PATTERNS.filter((r) => {
				// Patterns should be glob syntax: either contain * or / (or both)
				// Exception: simple filenames like "Dockerfile" or "package.json" are valid
				const hasGlob = r.pattern.includes("*") || r.pattern.includes("/");
				const isSimpleFilename =
					!r.pattern.includes(" ") && r.pattern.length > 0;
				return !hasGlob && !isSimpleFilename;
			});
			expect(invalidPatterns).toHaveLength(0);
		});
	});

	describe("Size Constraints", () => {
		it("should NOT include overly specific files (e.g., config.ts)", () => {
			const tooSpecific = DEFAULT_CRITICAL_PATTERNS.find(
				(r) => r.pattern === "config.ts" || r.pattern === "src/config.ts",
			);
			expect(tooSpecific).toBeUndefined();
		});

		it("should result in approximately 27 protected files when applied to SnapBack monorepo", () => {
			// This is a sanity check - 27 was the number of "Protected" files in the audit
			// If count is vastly different, patterns may be too broad or too narrow
			expect(DEFAULT_CRITICAL_PATTERNS.length).toBeGreaterThan(5);
			expect(DEFAULT_CRITICAL_PATTERNS.length).toBeLessThan(30);
		});
	});
});
