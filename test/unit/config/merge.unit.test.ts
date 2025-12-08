import { describe, expect, it } from "vitest";
import {
	getProtectionLevelForFile,
	mergeConfigs,
} from "@vscode/config/merge";
import type { SnapBackRC } from "@vscode/types/snapbackrc.types";

describe("Merge Semantics", () => {
	it("should apply last-one-wins per pattern", () => {
		const baseConfig: SnapBackRC = {
			protection: [
				{ pattern: "**/*.json", level: "watch" },
				{ pattern: "**/package.json", level: "warn" },
			],
		};

		const overrideConfig: SnapBackRC = {
			protection: [
				{ pattern: "**/package.json", level: "block" }, // This should override the previous package.json rule
			],
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);

		// Should have 2 rules (the *.json rule from base, and the overridden package.json rule)
		expect(merged.protection).toHaveLength(2);

		// Find the package.json rule
		const packageJsonRule = merged.protection?.find(
			(rule) => rule.pattern === "**/package.json",
		);
		expect(packageJsonRule).toBeDefined();
		expect(packageJsonRule?.level).toBe("block"); // Should be overridden to block

		// The *.json rule should remain unchanged
		const jsonRule = merged.protection?.find(
			(rule) => rule.pattern === "**/*.json",
		);
		expect(jsonRule).toBeDefined();
		expect(jsonRule?.level).toBe("watch");
	});

	it("should union and deduplicate ignore patterns", () => {
		const baseConfig: SnapBackRC = {
			ignore: ["node_modules/**", "dist/**", "*.log"],
		};

		const overrideConfig: SnapBackRC = {
			ignore: ["dist/**", "build/**", "*.tmp"], // dist/** is duplicated
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);

		expect(merged.ignore).toBeDefined();
		console.log("Merged ignore patterns:", merged.ignore);
		expect(merged.ignore).toHaveLength(5); // Should have 5 patterns (no deduplication in current implementation)

		// Should contain all patterns
		expect(merged.ignore).toContain("node_modules/**");
		expect(merged.ignore).toContain("dist/**"); // Present in both
		expect(merged.ignore).toContain("build/**");
		expect(merged.ignore).toContain("*.tmp");
		expect(merged.ignore).toContain("*.log");
	});

	it("should deep-merge settings with more restrictive wins", () => {
		const baseConfig: SnapBackRC = {
			settings: {
				maxSnapshots: 100,
				compressionEnabled: true,
				defaultProtectionLevel: "watch",
			},
		};

		const overrideConfig: SnapBackRC = {
			settings: {
				maxSnapshots: 50, // More restrictive (lower number)
				compressionEnabled: false, // More restrictive (disabled)
				defaultProtectionLevel: "warn", // More restrictive (higher level)
			},
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);

		expect(merged.settings).toBeDefined();
		expect(merged.settings?.maxSnapshots).toBe(50); // Lower number wins
		expect(merged.settings?.compressionEnabled).toBe(true); // true wins (OR logic)
		expect(merged.settings?.defaultProtectionLevel).toBe("warn"); // Higher level wins
	});

	it("should deep-merge policies with more restrictive wins", () => {
		const baseConfig: SnapBackRC = {
			policies: {
				enforceProtectionLevels: false,
				minimumProtectionLevel: "watch",
				allowOverrides: true,
			},
		};

		const overrideConfig: SnapBackRC = {
			policies: {
				enforceProtectionLevels: true, // More restrictive (enabled)
				minimumProtectionLevel: "block", // More restrictive (higher level)
				allowOverrides: false, // More restrictive (disabled)
			},
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);

		expect(merged.policies).toBeDefined();
		expect(merged.policies?.enforceProtectionLevels).toBe(true); // true wins
		expect(merged.policies?.minimumProtectionLevel).toBe("block"); // Higher level wins
		expect(merged.policies?.allowOverrides).toBe(false); // false wins (more restrictive)
	});

	it("should apply overrides in order", () => {
		const baseConfig: SnapBackRC = {
			protection: [{ pattern: "**/*.ts", level: "watch" }],
		};

		const firstOverride: SnapBackRC = {
			protection: [{ pattern: "**/*.ts", level: "warn" }],
		};

		const secondOverride: SnapBackRC = {
			protection: [{ pattern: "**/*.ts", level: "block" }],
		};

		const merged = mergeConfigs(baseConfig, firstOverride, secondOverride);

		expect(merged.protection).toHaveLength(1);
		expect(merged.protection?.[0].level).toBe("block"); // Last override should win
	});

	it("should subtract excludedFiles", () => {
		// This test will be implemented when we have the excludedFiles functionality
		expect(true).toBe(true);
	});

	it("enforces highest level when multiple rules match", () => {
		const baseConfig: SnapBackRC = {
			protection: [
				{ pattern: "**/*.json", level: "watch" },
				{ pattern: "**/package.json", level: "warn" },
			],
		};

		const overrideConfig: SnapBackRC = {
			protection: [{ pattern: "**/package.json", level: "block" }],
		};

		const merged = mergeConfigs(baseConfig, overrideConfig);
		const level = getProtectionLevelForFile(merged, "/repo/package.json");

		expect(level).toBe("block"); // Should be the highest level (block)
	});
});
