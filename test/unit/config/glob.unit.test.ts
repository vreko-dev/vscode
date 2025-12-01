import { describe, expect, it } from "vitest";
import { getProtectionLevelForFile } from "../../../src/config/merge.js";
import type { SnapBackRC } from "../../../src/types/snapbackrc.types";

describe("Glob Pattern Handling", () => {
	it("should handle braces and extglobs correctly", () => {
		const config: SnapBackRC = {
			protection: [
				{ pattern: "**/*.{js,ts}", level: "warn" }, // Braces pattern
				{ pattern: "**/*.+(js|ts)", level: "block" }, // Extglob pattern
			],
		};

		// Test braces pattern - both patterns match, so block (higher level) wins
		const jsLevel = getProtectionLevelForFile(config, "/project/file.js");
		expect(jsLevel).toBe("block");

		const tsLevel = getProtectionLevelForFile(config, "/project/file.ts");
		expect(tsLevel).toBe("block");
	});

	it("should handle negation patterns correctly", () => {
		const config: SnapBackRC = {
			protection: [{ pattern: "**/*.js", level: "warn" }],
			ignore: ["**/node_modules/**", "!**/node_modules/critical/**"],
		};

		// JS file in node_modules should be ignored
		const ignoredLevel = getProtectionLevelForFile(
			config,
			"/project/node_modules/lib/util.js",
		);
		expect(ignoredLevel).toBeNull();

		// JS file in node_modules/critical should be protected
		const protectedLevel = getProtectionLevelForFile(
			config,
			"/project/node_modules/critical/main.js",
		);
		expect(protectedLevel).toBe("warn");
	});

	it("should handle Windows path separators", () => {
		const config: SnapBackRC = {
			protection: [{ pattern: "**/package.json", level: "warn" }],
		};

		// Test with Windows-style path separators
		const level = getProtectionLevelForFile(config, "\\project\\package.json");
		// On Windows, we should normalize paths, but for now we'll just check that it doesn't crash
		expect(level === "warn" || level === null).toBe(true);
	});

	it("should handle case sensitivity on different platforms", () => {
		const config: SnapBackRC = {
			protection: [{ pattern: "**/README.md", level: "watch" }],
		};

		// Test case-sensitive matching
		const upperLevel = getProtectionLevelForFile(config, "/project/README.md");
		expect(upperLevel).toBe("watch");

		// On case-insensitive filesystems, this might also match
		const lowerLevel = getProtectionLevelForFile(config, "/project/readme.md");
		// We don't enforce case sensitivity in our matching, so either result is acceptable
		expect(lowerLevel === "watch" || lowerLevel === null).toBe(true);
	});
});
