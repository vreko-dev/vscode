import { describe, expect, it } from "vitest";
import {
	getProtectionLevelForFile,
	mergeConfigs,
} from "@vscode/config/merge";
import type { SnapBackRC } from "@vscode/types/snapbackrc.types";

describe("Comprehensive Config Merge Scenarios", () => {
	it("should handle complex protection rule merging with provenance", () => {
		const baseConfig: SnapBackRC = {
			protection: [
				{ pattern: "**/*.json", level: "Watched" },
				{ pattern: "**/package.json", level: "Warning" },
			],
		};

		const overrideConfig: SnapBackRC = {
			protection: [
				{ pattern: "**/package.json", level: "Protected" }, // This should override the previous package.json rule
				{ pattern: "**/*.ts", level: "Warning" },
			],
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);

		// Should have 3 rules (the *.json rule from base, the overridden package.json rule, and the new *.ts rule)
		expect(merged.protection).toHaveLength(3);

		// Find the package.json rule
		const packageJsonRule = merged.protection?.find(
			(rule) => rule.pattern === "**/package.json",
		);
		expect(packageJsonRule).toBeDefined();
		expect(packageJsonRule?.level).toBe("Protected"); // Should be overridden to Protected

		// The *.json rule should remain unchanged
		const jsonRule = merged.protection?.find(
			(rule) => rule.pattern === "**/*.json",
		);
		expect(jsonRule).toBeDefined();
		expect(jsonRule?.level).toBe("Watched");

		// The *.ts rule should be added
		const tsRule = merged.protection?.find(
			(rule) => rule.pattern === "**/*.ts",
		);
		expect(tsRule).toBeDefined();
		expect(tsRule?.level).toBe("Warning");
	});

	it("should handle ignore pattern merging with deduplication", () => {
		const baseConfig: SnapBackRC = {
			ignore: ["node_modules/**", "dist/**", "*.log"],
		};

		const overrideConfig: SnapBackRC = {
			ignore: ["dist/**", "build/**", "*.tmp"], // dist/** is duplicated
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);

		expect(merged.ignore).toBeDefined();
		// Should have 5 unique patterns
		expect(merged.ignore).toHaveLength(5);

		// Should contain all unique patterns
		expect(merged.ignore).toContain("node_modules/**");
		expect(merged.ignore).toContain("dist/**"); // Present in both (deduplicated)
		expect(merged.ignore).toContain("build/**");
		expect(merged.ignore).toContain("*.tmp");
		expect(merged.ignore).toContain("*.log");
	});

	it("should handle settings merging with more restrictive wins", () => {
		const baseConfig: SnapBackRC = {
			settings: {
				maxSnapshots: 100,
				compressionEnabled: true,
				defaultProtectionLevel: "Watched",
			},
		};

		const overrideConfig: SnapBackRC = {
			settings: {
				maxSnapshots: 50, // More restrictive (lower number)
				compressionEnabled: false, // More restrictive (disabled)
				defaultProtectionLevel: "Warning", // More restrictive (higher level)
			},
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);

		expect(merged.settings).toBeDefined();
		expect(merged.settings?.maxSnapshots).toBe(50); // Lower number wins
		expect(merged.settings?.compressionEnabled).toBe(true); // true wins (OR logic)
		expect(merged.settings?.defaultProtectionLevel).toBe("Warning"); // Higher level wins
	});

	it("should handle policies merging with more restrictive wins", () => {
		const baseConfig: SnapBackRC = {
			policies: {
				enforceProtectionLevels: false,
				minimumProtectionLevel: "Watched",
				allowOverrides: true,
			},
		};

		const overrideConfig: SnapBackRC = {
			policies: {
				enforceProtectionLevels: true, // More restrictive (enabled)
				minimumProtectionLevel: "Protected", // More restrictive (higher level)
				allowOverrides: false, // More restrictive (disabled)
			},
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);

		expect(merged.policies).toBeDefined();
		expect(merged.policies?.enforceProtectionLevels).toBe(true); // true wins
		expect(merged.policies?.minimumProtectionLevel).toBe("Protected"); // Higher level wins
		expect(merged.policies?.allowOverrides).toBe(false); // false wins (more restrictive)
	});

	it("should handle multiple config overrides in order", () => {
		const baseConfig: SnapBackRC = {
			protection: [{ pattern: "**/*.ts", level: "Watched" }],
		};

		const firstOverride: SnapBackRC = {
			protection: [{ pattern: "**/*.ts", level: "Warning" }],
		};

		const secondOverride: SnapBackRC = {
			protection: [{ pattern: "**/*.ts", level: "Protected" }],
		};

		const merged = mergeConfigs(baseConfig, firstOverride, secondOverride);

		expect(merged.protection).toHaveLength(1);
		expect(merged.protection?.[0].level).toBe("Protected"); // Last override should win
	});

	it("should enforce highest level when multiple rules match", () => {
		const baseConfig: SnapBackRC = {
			protection: [
				{ pattern: "**/*.json", level: "Watched" },
				{ pattern: "**/package.json", level: "Warning" },
			],
		};

		const overrideConfig: SnapBackRC = {
			protection: [{ pattern: "**/package.json", level: "Protected" }],
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);

		// Test the getProtectionLevelForFile function
		const level = getProtectionLevelForFile(merged, "/repo/package.json");

		expect(level).toBe("Protected"); // Should be the highest level (Protected)
	});

	it("should handle empty configs gracefully", () => {
		const emptyConfig: SnapBackRC = {};
		const configWithProtection: SnapBackRC = {
			protection: [{ pattern: "**/*.ts", level: "Warning" }],
		};

		const merged1 = mergeConfigs(emptyConfig, configWithProtection);
		const merged2 = mergeConfigs(configWithProtection, emptyConfig);

		expect(merged1.protection).toHaveLength(1);
		expect(merged2.protection).toHaveLength(1);
		expect(merged1.protection?.[0].level).toBe("Warning");
		expect(merged2.protection?.[0].level).toBe("Warning");
	});

	it("should handle configs with undefined fields", () => {
		const configWithUndefined: SnapBackRC = {
			protection: undefined,
			ignore: undefined,
			settings: undefined,
		};

		const configWithValues: SnapBackRC = {
			protection: [{ pattern: "**/*.ts", level: "Warning" }],
			ignore: ["*.tmp"],
			settings: { maxSnapshots: 50 },
		};

		const merged1 = mergeConfigs(configWithUndefined, configWithValues);
		const merged2 = mergeConfigs(configWithValues, configWithUndefined);

		expect(merged1.protection).toHaveLength(1);
		expect(merged1.ignore).toHaveLength(1);
		expect(merged1.settings?.maxSnapshots).toBe(50);

		expect(merged2.protection).toHaveLength(1);
		expect(merged2.ignore).toHaveLength(1);
		expect(merged2.settings?.maxSnapshots).toBe(50);
	});
});
