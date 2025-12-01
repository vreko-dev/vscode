import { beforeEach, describe, expect, it } from "vitest";
import { GlobValidator } from "../../../src/security/globValidator.js";

describe("GlobValidator - Safe Glob Pattern Validation", () => {
	let validator: GlobValidator;

	beforeEach(() => {
		validator = new GlobValidator();
	});

	describe("isGlobSafe", () => {
		// Valid patterns - should pass
		it("should allow simple glob patterns", () => {
			expect(validator.isGlobSafe("*.ts")).toBe(true);
			expect(validator.isGlobSafe("*.js")).toBe(true);
			expect(validator.isGlobSafe("*.{ts,js}")).toBe(true);
		});

		it("should allow directory glob patterns", () => {
			expect(validator.isGlobSafe("src/**/*.js")).toBe(true);
			expect(validator.isGlobSafe("**/*.ts")).toBe(true);
			expect(validator.isGlobSafe("test/**/*.test.ts")).toBe(true);
		});

		it("should allow complex valid patterns", () => {
			expect(validator.isGlobSafe("src/**/*.{ts,tsx,js,jsx}")).toBe(true);
			expect(validator.isGlobSafe("apps/*/src/**/*.ts")).toBe(true);
			expect(validator.isGlobSafe("**/*.spec.{ts,js}")).toBe(true);
		});

		// Length limit attacks
		it("should reject patterns exceeding length limit (1000 chars)", () => {
			const longPattern = "a".repeat(1001);
			expect(validator.isGlobSafe(longPattern)).toBe(false);
		});

		it("should allow patterns at exactly 1000 characters", () => {
			const exactLimit = "a".repeat(1000);
			expect(validator.isGlobSafe(exactLimit)).toBe(true);
		});

		it("should reject extremely long patterns with wildcards", () => {
			const longPattern = `${"src/".repeat(300)}*.ts`;
			expect(validator.isGlobSafe(longPattern)).toBe(false);
		});

		// Excessive wildcards attack (ReDoS via wildcard explosion)
		it("should reject patterns with excessive wildcards (>20)", () => {
			const excessiveWildcards = "*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*"; // 21 wildcards
			expect(validator.isGlobSafe(excessiveWildcards)).toBe(false);
		});

		it("should allow patterns with exactly 20 wildcards", () => {
			const exactWildcards = "*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/file.ts"; // 20 wildcards
			expect(validator.isGlobSafe(exactWildcards)).toBe(true);
		});

		it("should reject patterns with excessive globstars", () => {
			const excessiveGlobstars = `${"**/".repeat(15)}*.ts`; // 15 globstars
			expect(validator.isGlobSafe(excessiveGlobstars)).toBe(false);
		});

		// Excessive braces attack
		it("should reject patterns with excessive braces (>10 pairs)", () => {
			const excessiveBraces = "{a,{b,{c,{d,{e,{f,{g,{h,{i,{j,{k,l}}}}}}}}}}}"; // 11 pairs
			expect(validator.isGlobSafe(excessiveBraces)).toBe(false);
		});

		it("should allow patterns with exactly 10 brace pairs", () => {
			const exactBraces = "{a,{b,{c,{d,{e,{f,{g,{h,{i,{j}}}}}}}}}}"; // 10 pairs
			expect(validator.isGlobSafe(exactBraces)).toBe(true);
		});

		// Consecutive globstars attack (ReDoS)
		it("should reject patterns with 4 or more consecutive globstars", () => {
			expect(validator.isGlobSafe("**/**/**/**/file.ts")).toBe(false);
			expect(validator.isGlobSafe("src/**/**/**/**/*.ts")).toBe(false);
		});

		it("should allow patterns with up to 3 consecutive globstars", () => {
			expect(validator.isGlobSafe("**/**/file.ts")).toBe(true);
			expect(validator.isGlobSafe("src/**/**/*.ts")).toBe(true);
		});

		// Nested repetition patterns (ReDoS)
		it("should reject patterns with nested repetition (ReDoS)", () => {
			expect(validator.isGlobSafe("(a+)+b")).toBe(false);
			expect(validator.isGlobSafe("(.*)+file")).toBe(false);
			expect(validator.isGlobSafe("([a-z]+)+")).toBe(false);
		});

		// Empty patterns
		it("should reject empty patterns", () => {
			expect(validator.isGlobSafe("")).toBe(false);
		});

		it("should reject whitespace-only patterns", () => {
			expect(validator.isGlobSafe("   ")).toBe(false);
			expect(validator.isGlobSafe("\t\n")).toBe(false);
		});

		// Null/undefined handling
		it("should handle null/undefined safely", () => {
			expect(validator.isGlobSafe(null as any)).toBe(false);
			expect(validator.isGlobSafe(undefined as any)).toBe(false);
		});

		// Special characters that could cause issues
		it("should allow safe special characters", () => {
			expect(validator.isGlobSafe("src/**/*.test.ts")).toBe(true);
			expect(validator.isGlobSafe("**/@types/**/*.d.ts")).toBe(true);
			expect(validator.isGlobSafe("**/*.spec.[tj]s")).toBe(true);
		});

		// Edge case: multiple extensions
		it("should allow multiple extension patterns", () => {
			expect(validator.isGlobSafe("**/*.{ts,tsx,js,jsx,mjs,cjs}")).toBe(true);
		});

		// Edge case: negation patterns
		it("should allow negation patterns", () => {
			expect(validator.isGlobSafe("!node_modules/**")).toBe(true);
			expect(validator.isGlobSafe("!**/*.test.ts")).toBe(true);
		});
	});

	describe("sanitizeGlobPattern", () => {
		it("should return valid patterns unchanged", () => {
			expect(validator.sanitizeGlobPattern("*.ts")).toBe("*.ts");
			expect(validator.sanitizeGlobPattern("src/**/*.js")).toBe("src/**/*.js");
		});

		it("should throw error for unsafe patterns", () => {
			const longPattern = "a".repeat(1001);
			expect(() => validator.sanitizeGlobPattern(longPattern)).toThrow(
				"Unsafe glob pattern detected",
			);
		});

		it("should throw error for excessive wildcards", () => {
			const excessiveWildcards = "*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*/*";
			expect(() => validator.sanitizeGlobPattern(excessiveWildcards)).toThrow(
				"Unsafe glob pattern detected",
			);
		});

		it("should throw error for consecutive globstars", () => {
			expect(() =>
				validator.sanitizeGlobPattern("**/**/**/**/file.ts"),
			).toThrow("Unsafe glob pattern detected");
		});

		it("should throw error for nested repetition", () => {
			expect(() => validator.sanitizeGlobPattern("(a+)+b")).toThrow(
				"Unsafe glob pattern detected",
			);
		});

		it("should throw error for empty patterns", () => {
			expect(() => validator.sanitizeGlobPattern("")).toThrow(
				"Unsafe glob pattern detected",
			);
		});

		it("should provide descriptive error messages", () => {
			const longPattern = "a".repeat(1001);
			expect(() => validator.sanitizeGlobPattern(longPattern)).toThrow(
				/Unsafe glob pattern detected/,
			);
		});
	});

	describe("ReDoS Prevention", () => {
		it("should block catastrophic backtracking pattern 1", () => {
			expect(validator.isGlobSafe("(a*)*b")).toBe(false);
		});

		it("should block catastrophic backtracking pattern 2", () => {
			expect(validator.isGlobSafe("(.*)*suffix")).toBe(false);
		});

		it("should block exponential time complexity patterns", () => {
			expect(validator.isGlobSafe("**/**/**/**/**/**/**/**")).toBe(false);
		});

		it("should handle patterns that could cause CPU exhaustion", () => {
			const deepNesting = `${"{".repeat(50)}a${"}".repeat(50)}`;
			expect(validator.isGlobSafe(deepNesting)).toBe(false);
		});
	});

	describe("Security Limits Validation", () => {
		it("should enforce MAX_PATTERN_LENGTH correctly", () => {
			expect(validator.isGlobSafe("x".repeat(999))).toBe(true);
			expect(validator.isGlobSafe("x".repeat(1000))).toBe(true);
			expect(validator.isGlobSafe("x".repeat(1001))).toBe(false);
		});

		it("should enforce MAX_WILDCARDS correctly", () => {
			const nineteenWildcards = `${Array(19).fill("*").join("/")}/file.ts`;
			const twentyWildcards = `${Array(20).fill("*").join("/")}/file.ts`;
			const twentyOneWildcards = `${Array(21).fill("*").join("/")}/file.ts`;

			expect(validator.isGlobSafe(nineteenWildcards)).toBe(true);
			expect(validator.isGlobSafe(twentyWildcards)).toBe(true);
			expect(validator.isGlobSafe(twentyOneWildcards)).toBe(false);
		});

		it("should enforce MAX_BRACES correctly", () => {
			const nineBraces = "{a,{b,{c,{d,{e,{f,{g,{h,{i}}}}}}}}}";
			const tenBraces = "{a,{b,{c,{d,{e,{f,{g,{h,{i,{j}}}}}}}}}}";
			const elevenBraces = "{a,{b,{c,{d,{e,{f,{g,{h,{i,{j,{k}}}}}}}}}}}";

			expect(validator.isGlobSafe(nineBraces)).toBe(true);
			expect(validator.isGlobSafe(tenBraces)).toBe(true);
			expect(validator.isGlobSafe(elevenBraces)).toBe(false);
		});

		it("should enforce MAX_GLOBSTARS correctly", () => {
			expect(validator.isGlobSafe("**/file.ts")).toBe(true); // 1 globstar
			expect(validator.isGlobSafe("**/**/file.ts")).toBe(true); // 2 globstars
			expect(validator.isGlobSafe("**/**/**/file.ts")).toBe(true); // 3 globstars
			expect(validator.isGlobSafe("**/**/**/**/file.ts")).toBe(false); // 4 globstars
		});
	});
});
