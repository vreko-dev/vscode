import { describe, it, expect } from "vitest";
import {
	createPatternMatcher,
	matchesAnyPattern,
	shouldProtectFile,
	filterProtectedFiles,
	countPatternMatches,
} from "@/domain/patternMatcher";

describe("PatternMatcher", () => {
	describe("createPatternMatcher", () => {
		it("should match exact filenames", () => {
			const matcher = createPatternMatcher("package.json");
			expect(matcher.matches("package.json")).toBe(true);
			expect(matcher.matches("apps/vscode/package.json")).toBe(true);
			expect(matcher.matches("package.json.bak")).toBe(false);
		});

		it("should match extension patterns (*.ts)", () => {
			const matcher = createPatternMatcher("*.ts");
			expect(matcher.matches("file.ts")).toBe(true);
			expect(matcher.matches("src/index.ts")).toBe(true);
			expect(matcher.matches("file.tsx")).toBe(false);
		});

		it("should match config files (*.config.js)", () => {
			const matcher = createPatternMatcher("*.config.js");
			expect(matcher.matches("webpack.config.js")).toBe(true);
			expect(matcher.matches("utils.js")).toBe(false);
		});

		it("should match prefix patterns (.env*)", () => {
			const matcher = createPatternMatcher(".env*");
			expect(matcher.matches(".env")).toBe(true);
			expect(matcher.matches(".env.local")).toBe(true);
			expect(matcher.matches(".env.production")).toBe(true);
			expect(matcher.matches(".environment")).toBe(false);
		});

		it("should match directory patterns (node_modules/**)", () => {
			const matcher = createPatternMatcher("node_modules/**");
			expect(matcher.matches("node_modules/package/index.js")).toBe(true);
			expect(matcher.matches("node_modules/@types/node/index.d.ts")).toBe(true);
			expect(matcher.matches("src/index.ts")).toBe(false);
		});

		it("should match dist/** pattern", () => {
			const matcher = createPatternMatcher("dist/**");
			expect(matcher.matches("dist/bundle.js")).toBe(true);
			expect(matcher.matches("dist/types/index.d.ts")).toBe(true);
			expect(matcher.matches("src/index.ts")).toBe(false);
		});

		it("should match log files (*.log)", () => {
			const matcher = createPatternMatcher("*.log");
			expect(matcher.matches("debug.log")).toBe(true);
			expect(matcher.matches("logs/app.log")).toBe(true);
			expect(matcher.matches("file.txt")).toBe(false);
		});

		it("should support negation patterns (!pattern)", () => {
			const matcher = createPatternMatcher("!node_modules/**");
			expect(matcher.matches("node_modules/package/index.js")).toBe(false);
			expect(matcher.matches("src/index.ts")).toBe(true);
		});

		it("should throw error on empty pattern", () => {
			expect(() => createPatternMatcher("")).toThrow("Pattern cannot be empty");
		});
	});

	describe("matchesAnyPattern", () => {
		it("should match critical file patterns", () => {
			const patterns = ["package.json", "tsconfig.json", ".env*", "*.config.js", "*.config.ts"];

			expect(matchesAnyPattern("package.json", patterns)).toBe(true);
			expect(matchesAnyPattern("tsconfig.json", patterns)).toBe(true);
			expect(matchesAnyPattern(".env", patterns)).toBe(true);
			expect(matchesAnyPattern(".env.local", patterns)).toBe(true);
			expect(matchesAnyPattern("webpack.config.js", patterns)).toBe(true);
			expect(matchesAnyPattern("vitest.config.ts", patterns)).toBe(true);
			expect(matchesAnyPattern("src/index.ts", patterns)).toBe(false);
		});

		it("should exclude generated and dependency files", () => {
			const patterns = ["node_modules/**", "dist/**", "*.log", "*.lock"];

			expect(matchesAnyPattern("node_modules/package/index.js", patterns)).toBe(true);
			expect(matchesAnyPattern("dist/bundle.js", patterns)).toBe(true);
			expect(matchesAnyPattern("debug.log", patterns)).toBe(true);
			expect(matchesAnyPattern("pnpm-lock.yaml", patterns)).toBe(false);
			expect(matchesAnyPattern("src/index.ts", patterns)).toBe(false);
		});

		it("should return false for empty pattern array", () => {
			expect(matchesAnyPattern("file.ts", [])).toBe(false);
		});

		it("should return false for empty filename", () => {
			const patterns = ["*.ts"];
			expect(matchesAnyPattern("", patterns)).toBe(false);
		});
	});

	describe("shouldProtectFile", () => {
		const alwaysProtect = ["package.json", "pnpm-workspace.yaml", "tsconfig.json", ".env*", "*.config.js", "*.config.ts"];
		const neverProtect = ["node_modules/**", "dist/**", "*.log", "*.lock"];

		it("should protect critical files", () => {
			expect(shouldProtectFile("package.json", alwaysProtect, neverProtect)).toBe(true);
			expect(shouldProtectFile("tsconfig.json", alwaysProtect, neverProtect)).toBe(true);
			expect(shouldProtectFile(".env", alwaysProtect, neverProtect)).toBe(true);
		});

		it("should not protect generated files", () => {
			expect(shouldProtectFile("node_modules/package/index.js", alwaysProtect, neverProtect)).toBe(false);
			expect(shouldProtectFile("dist/bundle.js", alwaysProtect, neverProtect)).toBe(false);
			expect(shouldProtectFile("debug.log", alwaysProtect, neverProtect)).toBe(false);
		});

		it("should not protect regular source files", () => {
			expect(shouldProtectFile("src/index.ts", alwaysProtect, neverProtect)).toBe(false);
			expect(shouldProtectFile("components/Button.tsx", alwaysProtect, neverProtect)).toBe(false);
		});

		it("should give precedence to never-protect", () => {
			// Even if a file matches always-protect pattern, never-protect takes precedence
			const customNeverProtect = ["*-lock.yaml"];
			expect(shouldProtectFile("webpack.config.js", alwaysProtect, customNeverProtect)).toBe(true);
		});
	});

	describe("filterProtectedFiles", () => {
		const alwaysProtect = ["package.json", "tsconfig.json"];
		const neverProtect = ["node_modules/**", "dist/**"];

		it("should filter and return only protected files", () => {
			const files = ["package.json", "src/index.ts", "node_modules/pkg/index.js", "tsconfig.json"];

			const result = filterProtectedFiles(files, alwaysProtect, neverProtect);

			expect(result).toEqual(["package.json", "tsconfig.json"]);
		});

		it("should return empty array when no files match", () => {
			const files = ["src/index.ts", "components/Button.tsx"];

			const result = filterProtectedFiles(files, alwaysProtect, neverProtect);

			expect(result).toEqual([]);
		});

		it("should handle empty input list", () => {
			const result = filterProtectedFiles([], alwaysProtect, neverProtect);
			expect(result).toEqual([]);
		});
	});

	describe("countPatternMatches", () => {
		const alwaysProtect = ["package.json", "tsconfig.json", ".env*"];
		const neverProtect = ["node_modules/**", "dist/**", "*.log"];

		it("should count pattern matches correctly", () => {
			const files = [
				"package.json",
				"src/index.ts",
				"node_modules/pkg/index.js",
				"dist/bundle.js",
				".env",
				".env.local",
				"debug.log",
			];

			const result = countPatternMatches(files, alwaysProtect, neverProtect);

			expect(result.alwaysProtected).toBe(3); // package.json, .env, .env.local
			expect(result.neverProtected).toBe(3); // node_modules, dist, debug.log
			expect(result.neutral).toBe(1); // src/index.ts
		});

		it("should handle files with no matches", () => {
			const files = ["README.md", "LICENSE"];

			const result = countPatternMatches(files, alwaysProtect, neverProtect);

			expect(result.alwaysProtected).toBe(0);
			expect(result.neverProtected).toBe(0);
			expect(result.neutral).toBe(2);
		});

		it("should prioritize never-protect over always-protect", () => {
			const customAlways = ["*.js"];
			const customNever = ["dist/**"];
			const files = ["dist/app.js", "src/app.js"];

			const result = countPatternMatches(files, customAlways, customNever);

			// dist/app.js matches never-protect, so it's counted there
			expect(result.neverProtected).toBe(1);
			expect(result.alwaysProtected).toBe(1);
			expect(result.neutral).toBe(0);
		});
	});

	describe("Real-world scenarios", () => {
		it("should handle monorepo file structure", () => {
			const alwaysProtect = ["package.json", "pnpm-workspace.yaml", "tsconfig.json"];
			const neverProtect = ["node_modules/**", "dist/**", ".next/**", "out/**"];

			const files = [
				"package.json",
				"pnpm-workspace.yaml",
				"apps/vscode/package.json",
				"packages/core/tsconfig.json",
				"apps/vscode/node_modules/dep/index.js",
				"apps/web/dist/bundle.js",
				"apps/web/.next/build-manifest.json",
				"src/index.ts",
			];

			const protected_ = filterProtectedFiles(files, alwaysProtect, neverProtect);

			expect(protected_).toContain("package.json");
			expect(protected_).toContain("pnpm-workspace.yaml");
			expect(protected_).toContain("apps/vscode/package.json");
			expect(protected_).toContain("packages/core/tsconfig.json");
			expect(protected_).not.toContain("apps/vscode/node_modules/dep/index.js");
			expect(protected_).not.toContain("apps/web/dist/bundle.js");
			expect(protected_).not.toContain("src/index.ts");
		});

		it("should handle environment file patterns", () => {
			const alwaysProtect = [".env*"];
			const neverProtect: string[] = [];

			const envFiles = [".env", ".env.local", ".env.production", ".env.development"];
			const nonEnvFiles = [".environment", "env.txt", ".envrc"];

			envFiles.forEach((file) => {
				expect(matchesAnyPattern(file, alwaysProtect)).toBe(true);
			});

			nonEnvFiles.forEach((file) => {
				expect(matchesAnyPattern(file, alwaysProtect)).toBe(false);
			});
		});

		it("should handle complex config file matching", () => {
			const alwaysProtect = ["*.config.js", "*.config.ts", "*.config.mts"];
			const neverProtect: string[] = [];

			const configFiles = [
				"webpack.config.js",
				"vitest.config.ts",
				"vite.config.mts",
				"tailwind.config.js",
			];
			const nonConfigFiles = ["utils.js", "index.ts", "config-parser.js"];

			configFiles.forEach((file) => {
				expect(matchesAnyPattern(file, alwaysProtect)).toBe(true);
			});

			nonConfigFiles.forEach((file) => {
				expect(matchesAnyPattern(file, alwaysProtect)).toBe(false);
			});
		});
	});
});
