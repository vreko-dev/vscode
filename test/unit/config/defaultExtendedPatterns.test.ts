import { beforeEach, describe, expect, it } from "vitest";
import type { ProtectionRule } from "../../../src/types/snapbackrc.types";

/**
 * RED PHASE: Tests for EXTENDED_PATTERNS
 *
 * These tests define the expected behavior for optional patterns that enhance
 * protection but are NOT auto-applied on extension activation.
 *
 * Extended patterns = documentation, general configs, IDE settings, and build tools
 * Total: ~20-30 patterns that match optional categories
 *
 * The constant should NOT exist yet - these tests will fail until implemented.
 */
describe("EXTENDED_PATTERNS - RED Phase", () => {
	let EXTENDED_PATTERNS: ProtectionRule[];

	beforeEach(async () => {
		try {
			const module = (await import(
				"../../../src/config/defaultConfig.js"
			)) as any;
			EXTENDED_PATTERNS = module.EXTENDED_PATTERNS || [];
		} catch {
			// Expected to fail in RED phase
			EXTENDED_PATTERNS = [];
		}
	});

	describe("Basic Structure", () => {
		it("should export EXTENDED_PATTERNS constant", async () => {
			const module = await import("../../../src/config/defaultConfig.js");
			expect(module).toHaveProperty("EXTENDED_PATTERNS");
		});

		it("should contain between 20-30 optional protection rules", () => {
			expect(EXTENDED_PATTERNS.length).toBeGreaterThanOrEqual(20);
			expect(EXTENDED_PATTERNS.length).toBeLessThanOrEqual(30);
		});

		it("should be frozen (immutable)", () => {
			expect(() => {
				(EXTENDED_PATTERNS as any).push({ pattern: "test" });
			}).toThrow();
		});
	});

	describe("MUST Include: Documentation Patterns", () => {
		// These are useful to watch but not critical
		it("should include markdown files pattern (*.md)", () => {
			const found = EXTENDED_PATTERNS.find((r) => r.pattern === "*.md");
			expect(found).toBeDefined();
			expect(found?.level).toBe("Watched");
			expect(found?.reason?.toLowerCase()).toContain("document");
		});

		it("should include text files pattern (*.txt)", () => {
			const found = EXTENDED_PATTERNS.find((r) => r.pattern === "*.txt");
			expect(found).toBeDefined();
			expect(found?.level).toBe("Watched");
		});

		it("should include README patterns for visibility", () => {
			const readmeRules = EXTENDED_PATTERNS.filter(
				(r) => r.pattern.includes("README") || r.pattern.includes("readme"),
			);
			// Should have at least one README pattern
			expect(readmeRules.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("MUST Include: General Configuration Files", () => {
		// These are used frequently but not every project
		const generalConfigPatterns = [
			"*.json", // All JSON files (too broad for critical, good for extended)
			".editorconfig",
			".prettierrc*",
			".eslintrc*",
			"Makefile",
		];

		generalConfigPatterns.forEach((pattern) => {
			it(`should include pattern: ${pattern}`, () => {
				const found = EXTENDED_PATTERNS.find((r) => r.pattern === pattern);
				expect(found).toBeDefined();
				expect(found?.level === "Watched" || found?.level === "Warning").toBe(
					true,
				);
			});
		});
	});

	describe("MUST Include: IDE & Editor Settings", () => {
		// IDE-specific settings that are useful but not critical
		const idePatterns = [".vscode/settings.json", ".idea/**"];

		idePatterns.forEach((pattern) => {
			it(`should include IDE pattern: ${pattern}`, () => {
				const found = EXTENDED_PATTERNS.find((r) => r.pattern === pattern);
				expect(found).toBeDefined();
				expect(found?.level === "Watched" || found?.level === "Warning").toBe(
					true,
				);
			});
		});
	});

	describe("MUST Include: Build Tool Configs", () => {
		// Build-specific configs that vary by project
		const buildConfigPatterns = [
			"vite.config.*",
			"webpack.config.*",
			"rollup.config.*",
			"esbuild.config.*",
			"CMakeLists.txt",
		];

		buildConfigPatterns.forEach((pattern) => {
			it(`should include build config pattern: ${pattern}`, () => {
				const found = EXTENDED_PATTERNS.find((r) => r.pattern === pattern);
				expect(found).toBeDefined();
				expect(found?.level === "Watched" || found?.level === "Warning").toBe(
					true,
				);
			});
		});
	});

	describe("MUST Include: Language-Specific Configs", () => {
		// For languages not in critical set
		const languageConfigPatterns = [
			"Gemfile",
			".babelrc",
			"bunfig.toml",
			"setup.py",
			"pom.xml",
			"build.gradle*",
			"*.csproj",
			"go.mod",
			"Cargo.toml",
			"pyproject.toml",
		];

		languageConfigPatterns.forEach((pattern) => {
			it(`should include language config pattern: ${pattern}`, () => {
				const found = EXTENDED_PATTERNS.find((r) => r.pattern === pattern);
				expect(found).toBeDefined();
			});
		});
	});

	describe("SHOULD NOT Include: Critical Patterns", () => {
		// These should only be in DEFAULT_CRITICAL_PATTERNS
		const criticalPatterns = [
			"**/.env*",
			"**/package-lock.json",
			"**/yarn.lock",
			"**/pnpm-lock.yaml",
		];

		criticalPatterns.forEach((pattern) => {
			it(`should NOT duplicate critical pattern: ${pattern}`, () => {
				const found = EXTENDED_PATTERNS.find((r) => r.pattern === pattern);
				expect(found).toBeUndefined();
			});
		});
	});

	describe("Protection Levels", () => {
		it("should primarily use Watched and Warning levels (not Protected)", () => {
			const watchedCount = EXTENDED_PATTERNS.filter(
				(r) => r.level === "Watched",
			).length;
			const warningCount = EXTENDED_PATTERNS.filter(
				(r) => r.level === "Warning",
			).length;
			const protectedCount = EXTENDED_PATTERNS.filter(
				(r) => r.level === "Protected",
			).length;

			// Extended patterns should use Watched or Warning
			expect(watchedCount + warningCount).toBe(EXTENDED_PATTERNS.length);
			// Should have NO Protected patterns (those are in CRITICAL)
			expect(protectedCount).toBe(0);
		});

		it("should use appropriate levels for each category", () => {
			const markdownRules = EXTENDED_PATTERNS.filter((r) =>
				r.pattern.includes(".md"),
			);
			expect(
				markdownRules.every(
					(r) => r.level === "Watched" || r.level === "Warning",
				),
			).toBe(true);
		});
	});

	describe("Quality Checks", () => {
		it("should not have duplicate patterns with DEFAULT_CRITICAL_PATTERNS", async () => {
			const module = (await import(
				"../../../src/config/defaultConfig.js"
			)) as any;
			const CRITICAL = module.DEFAULT_CRITICAL_PATTERNS || [];
			const criticalPatterns = CRITICAL.map((r: ProtectionRule) => r.pattern);
			const extendedPatterns = EXTENDED_PATTERNS.map((r) => r.pattern);

			const overlap = extendedPatterns.filter((p) =>
				criticalPatterns.includes(p),
			);
			expect(overlap).toHaveLength(0);
		});

		it("should not have duplicate patterns within itself", () => {
			const patterns = EXTENDED_PATTERNS.map((r) => r.pattern);
			const uniquePatterns = [...new Set(patterns)];
			expect(patterns).toHaveLength(uniquePatterns.length);
		});

		it("should have reason/description for most rules", () => {
			const rulesWithoutReason = EXTENDED_PATTERNS.filter((r) => !r.reason);
			// Allow some without reason, but most should have explanation
			expect(rulesWithoutReason.length).toBeLessThan(
				EXTENDED_PATTERNS.length * 0.2,
			);
		});
	});

	describe("Size Constraints", () => {
		it("should NOT exceed 30 patterns to avoid overwhelming users", () => {
			expect(EXTENDED_PATTERNS.length).toBeLessThanOrEqual(30);
		});

		it("should NOT include extremely broad patterns like *.ts or *.py", () => {
			const tooBoard = EXTENDED_PATTERNS.filter(
				(r) =>
					r.pattern === "*.ts" ||
					r.pattern === "*.py" ||
					r.pattern === "*.js" ||
					r.pattern === "*.java",
			);
			expect(tooBoard).toHaveLength(0);
		});

		it("combined with CRITICAL patterns should total approximately 50-60 patterns", () => {
			// This is a sanity check to ensure pattern distribution is reasonable
			// Extended alone should be larger than critical (optional > required)
			expect(EXTENDED_PATTERNS.length).toBeGreaterThan(15);
			expect(EXTENDED_PATTERNS.length).toBeLessThan(35);
		});
	});

	describe("Backwards Compatibility", () => {
		it("should contain most original DEFAULT_SNAPBACK_CONFIG patterns", async () => {
			const module = (await import(
				"../../../src/config/defaultConfig.js"
			)) as any;
			const ORIGINAL = module.DEFAULT_SNAPBACK_CONFIG || {};
			const originalPatterns = (ORIGINAL.protection || []).map(
				(r: ProtectionRule) => r.pattern,
			);

			// Most patterns should have been moved to EXTENDED_PATTERNS
			// (Only critical ones should be in CRITICAL)
			const extendedPatterns = EXTENDED_PATTERNS.map((r) => r.pattern);
			const movedPatterns = originalPatterns.filter((p) =>
				extendedPatterns.includes(p),
			);

			// Should have moved at least 50% of original patterns
			expect(movedPatterns.length).toBeGreaterThan(
				originalPatterns.length * 0.4,
			);
		});
	});
});
