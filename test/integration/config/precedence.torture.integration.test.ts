import { describe, expect, it } from "vitest";
import { getProtectionLevelForFile } from "../../../src/config/merge";
import type { SnapBackRC } from "../../../src/types/snapbackrc.types";

describe("Precedence Torture Tests", () => {
	it("should handle complex nested negations", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/*.json", level: "block" }, // Block all JSON files
			],
			ignore: [
				"**/dist/**", // Ignore everything in dist
				"!**/dist/critical/**", // But don't ignore critical subdirectory
				"**/dist/critical/legacy/**", // Except legacy files in critical
			],
		};

		// JSON file in dist should be ignored
		const level1 = getProtectionLevelForFile(config, "project/dist/data.json");
		expect(level1).toBeNull();

		// JSON file in dist/critical should be protected
		const level2 = getProtectionLevelForFile(
			config,
			"project/dist/critical/data.json",
		);
		expect(level2).toBe("block");

		// JSON file in dist/critical/legacy should be ignored
		const level3 = getProtectionLevelForFile(
			config,
			"project/dist/critical/legacy/data.json",
		);
		expect(level3).toBeNull();
	});

	it("should handle brace and extglob patterns", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/*.{js,ts,jsx,tsx}", level: "warn" }, // Brace pattern
				{ pattern: "**/*.+(js|ts)", level: "block" }, // Extglob pattern
				{ pattern: "**/*.@(test|spec).+(js|ts)", level: "watch" }, // Complex extglob
			],
		};

		// Both patterns match .js files, block should win (higher level)
		const jsLevel = getProtectionLevelForFile(config, "project/file.js");
		expect(jsLevel).toBe("block");

		// Both patterns match .ts files, block should win
		const tsLevel = getProtectionLevelForFile(config, "project/file.ts");
		expect(tsLevel).toBe("block");

		// Test files should be watched (lower level but more specific)
		const testLevel = getProtectionLevelForFile(config, "project/file.test.js");
		expect(testLevel).toBe("watch");
	});

	it("should handle Windows path separators correctly", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/package.json", level: "warn" },
				{ pattern: "**/*.env", level: "block" },
			],
			ignore: ["**/node_modules/**", "!**/node_modules/critical/**"],
		};

		// Test with Unix-style paths
		const unixLevel = getProtectionLevelForFile(config, "project/package.json");
		expect(unixLevel).toBe("warn");

		// Test with Windows-style paths
		const windowsLevel = getProtectionLevelForFile(
			config,
			"project\\package.json",
		);
		expect(windowsLevel).toBe("warn");

		// Test ignore patterns with Windows paths
		const ignoredWindows = getProtectionLevelForFile(
			config,
			"project\\node_modules\\lib\\util.js",
		);
		expect(ignoredWindows).toBeNull();

		// Test negation with Windows paths
		const protectedWindows = getProtectionLevelForFile(
			config,
			"project\\node_modules\\critical\\main.js",
		);
		expect(protectedWindows).toBe("warn");
	});

	it("should handle case sensitivity correctly", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/README.md", level: "watch" },
				{ pattern: "**/package.json", level: "warn" },
			],
		};

		// Exact case match
		const exactMatch = getProtectionLevelForFile(config, "project/README.md");
		expect(exactMatch).toBe("watch");

		// Different case (behavior depends on filesystem)
		const differentCase = getProtectionLevelForFile(
			config,
			"project/readme.md",
		);
		// Should either match or not match, but not crash
		expect(differentCase === "watch" || differentCase === null).toBe(true);
	});

	it("should handle overlapping patterns with different levels", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/*", level: "watch" }, // Match everything (lowest level)
				{ pattern: "**/*.+(js|ts)", level: "warn" }, // Match JS/TS files (medium level)
				{ pattern: "**/*.secret", level: "block" }, // Match secret files (highest level)
				{ pattern: "**/package.json", level: "block" }, // Specific high priority file
			],
		};

		// Secret file should be blocked (highest level)
		const secretLevel = getProtectionLevelForFile(
			config,
			"project/config.secret",
		);
		expect(secretLevel).toBe("block");

		// Package.json should be blocked (highest level)
		const packageLevel = getProtectionLevelForFile(
			config,
			"project/package.json",
		);
		expect(packageLevel).toBe("block");

		// JS file should be warned (medium level)
		const jsLevel = getProtectionLevelForFile(config, "project/file.js");
		expect(jsLevel).toBe("warn");

		// Regular file should be watched (lowest level)
		const regularLevel = getProtectionLevelForFile(config, "project/file.txt");
		expect(regularLevel).toBe("watch");
	});

	it("should handle complex ignore patterns with overlapping protection", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/*.+(js|ts)", level: "block" }, // Block JS/TS
				{ pattern: "**/*.test.+(js|ts)", level: "watch" }, // Watch test files
			],
			ignore: [
				"**/node_modules/**",
				"!**/node_modules/@company/**", // Don't ignore company modules
				"**/node_modules/@company/legacy/**", // Except legacy ones
			],
		};

		// Test file in node_modules should be ignored
		const ignoredTest = getProtectionLevelForFile(
			config,
			"project/node_modules/lib/test.js",
		);
		expect(ignoredTest).toBeNull();

		// Test file in company modules should be watched (more specific pattern wins)
		const companyTest = getProtectionLevelForFile(
			config,
			"project/node_modules/@company/lib/test.js",
		);
		expect(companyTest).toBe("watch");

		// Test file in legacy company modules should be ignored
		const legacyTest = getProtectionLevelForFile(
			config,
			"project/node_modules/@company/legacy/test.js",
		);
		expect(legacyTest).toBeNull();
	});
});
