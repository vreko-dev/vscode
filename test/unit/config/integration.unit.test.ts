import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPBACKRC } from "@vscode/config/defaults";
import {
	getProtectionLevelForFile,
	mergeConfigs,
} from "@vscode/config/merge";
import type { SnapBackRC } from "@vscode/types/snapbackrc.types";

describe("Basic Configuration Integration", () => {
	it("should work with default configuration only", () => {
		// Test that the default configuration properly protects files
		const envLevel = getProtectionLevelForFile(
			DEFAULT_SNAPBACKRC,
			"/project/.env.local",
		);
		expect(envLevel).toBe("block");

		// package.json should match the '**/package.json' pattern
		const packageJsonLevel = getProtectionLevelForFile(
			DEFAULT_SNAPBACKRC,
			"/project/package.json",
		);
		expect(packageJsonLevel).toBe("warn");

		// README.md should match the **/*.md pattern and not be ignored
		const readmeLevel = getProtectionLevelForFile(
			DEFAULT_SNAPBACKRC,
			"/project/README.md",
		);
		expect(readmeLevel).toBe("watch");
	});

	it("should allow overrides to modify default behavior", () => {
		// Create an override that changes package.json from warn to block
		const overrideConfig: SnapBackRC = {
			protection: [{ pattern: "**/package.json", level: "block" }],
		};

		const mergedConfig = mergeConfigs(DEFAULT_SNAPBACKRC, overrideConfig);

		// The override should take effect
		const packageJsonLevel = getProtectionLevelForFile(
			mergedConfig,
			"/project/package.json",
		);
		expect(packageJsonLevel).toBe("block"); // Should now be block instead of warn

		// Other defaults should remain unchanged
		const envLevel = getProtectionLevelForFile(
			mergedConfig,
			"/project/.env.local",
		);
		expect(envLevel).toBe("block"); // Should still be block

		// README.md should still match the **/*.md pattern
		const readmeLevel = getProtectionLevelForFile(
			mergedConfig,
			"/project/README.md",
		);
		expect(readmeLevel).toBe("watch"); // Should still be watch
	});

	it("should handle multiple levels of configuration", () => {
		// Base config
		const baseConfig: SnapBackRC = {
			protection: [{ pattern: "**/*.js", level: "watch" }],
		};

		// Team override
		const teamConfig: SnapBackRC = {
			protection: [
				{ pattern: "**/*.js", level: "warn" },
				{ pattern: "**/src/**", level: "block" },
			],
		};

		// User override
		const userConfig: SnapBackRC = {
			protection: [{ pattern: "**/src/critical/**", level: "block" }],
		};

		const mergedConfig = mergeConfigs(baseConfig, teamConfig, userConfig);

		// Test resolution with a file that matches **/*.js but is not in ignore patterns
		const jsLevel = getProtectionLevelForFile(
			mergedConfig,
			"/project/lib/util.js",
		);
		expect(jsLevel).toBe("warn"); // Should be warn from team config (last wins for same pattern)

		// A file in src should be blocked
		const srcLevel = getProtectionLevelForFile(
			mergedConfig,
			"/project/src/index.js",
		);
		expect(srcLevel).toBe("block"); // Should be block from team config

		// A file in src/critical should be blocked
		const criticalLevel = getProtectionLevelForFile(
			mergedConfig,
			"/project/src/critical/api.js",
		);
		expect(criticalLevel).toBe("block"); // Should be block (both team and user config apply, same level)
	});
});
