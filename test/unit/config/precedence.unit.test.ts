import { describe, expect, it } from "vitest";
import { getProtectionLevelForFile } from "@vscode/config/merge";
import type { SnapBackRC } from "@vscode/types/snapbackrc.types";

describe("Ignore vs Protection Precedence", () => {
	it("should prioritize ignore over protection (ignore wins)", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/*.json", level: "block" }, // Block all JSON files
			],
			ignore: [
				"**/dist/**", // But ignore everything in dist folder
			],
		};

		// A JSON file in dist should be ignored (not protected)
		const level = getProtectionLevelForFile(
			config,
			"/project/dist/output.json",
		);
		expect(level).toBeNull(); // Should be null (ignored) not 'block'
	});

	it("should handle specific protection within ignored directories", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/package.json", level: "block" }, // Specifically block package.json everywhere
			],
			ignore: [
				"**/dist/**", // Ignore everything in dist folder
			],
		};

		// A package.json in dist should be ignored (ignore takes precedence)
		const level = getProtectionLevelForFile(
			config,
			"/project/dist/package.json",
		);
		expect(level).toBeNull(); // Should be null (ignored) not 'block'
	});

	it("should handle negation patterns in ignore", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/*.js", level: "warn" }, // Warn on all JS files
			],
			ignore: [
				"**/node_modules/**", // Ignore node_modules
				"!**/node_modules/critical/**", // But don't ignore critical subdirectory
			],
		};

		// A JS file in node_modules should be ignored
		const level1 = getProtectionLevelForFile(
			config,
			"/project/node_modules/lib/util.js",
		);
		expect(level1).toBeNull();

		// A JS file in node_modules/critical should be protected
		const level2 = getProtectionLevelForFile(
			config,
			"/project/node_modules/critical/main.js",
		);
		expect(level2).toBe("warn");
	});

	it("should handle complex precedence with multiple overlapping rules", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/*.txt", level: "block" }, // Block all txt files
				{ pattern: "**/secrets/**", level: "block" }, // Block everything in secrets
				{ pattern: "**/README.md", level: "watch" }, // Watch README.md files
			],
			ignore: [
				"**/temp/**", // Ignore temp directory
				"**/build/**", // Ignore build directory
				"!**/build/important/**", // But don't ignore build/important
			],
		};

		// txt file in temp should be ignored
		const level1 = getProtectionLevelForFile(config, "/project/temp/data.txt");
		expect(level1).toBeNull();

		// txt file in build should be ignored
		const level2 = getProtectionLevelForFile(config, "/project/build/data.txt");
		expect(level2).toBeNull();

		// txt file in build/important should be protected
		const level3 = getProtectionLevelForFile(
			config,
			"/project/build/important/data.txt",
		);
		expect(level3).toBe("block");

		// README.md in temp should be ignored
		const level4 = getProtectionLevelForFile(config, "/project/temp/README.md");
		expect(level4).toBeNull();

		// README.md in build/important should be watched
		const level5 = getProtectionLevelForFile(
			config,
			"/project/build/important/README.md",
		);
		expect(level5).toBe("watch");
	});
});
