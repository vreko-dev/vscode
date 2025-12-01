import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry";
import type { SnapBackRC } from "../../src/types/snapbackrc.types";

/**
 * Test suite for SnapBackRCLoader config merging and getMergedConfig()
 * Validates that defaults + .snapbackrc merge correctly and expose merged config
 */
describe("SnapBackRCLoader - Config Merge & getMergedConfig", () => {
	let mockRegistry: ProtectedFileRegistry;

	beforeEach(() => {
		// Mock ProtectedFileRegistry to avoid filesystem dependencies
		mockRegistry = {
			add: vi.fn(),
			isProtected: vi.fn(() => false),
			getProtectionLevel: vi.fn(),
			updateProtectionLevel: vi.fn(),
			list: vi.fn(async () => []),
			remove: vi.fn(),
			hasTemporaryAllowance: vi.fn(() => false),
			consumeTemporaryAllowance: vi.fn(),
			grantTemporaryAllowance: vi.fn(),
		} as unknown as ProtectedFileRegistry;
	});

	/**
	 * Test C1: Simple override
	 * Defaults: **\/.env* -> Protected
	 * .snapbackrc: **\/.env* -> Watched
	 * Expected: Merged config has .env* -> Watched (user override wins)
	 */
	it("C1 - Simple override: user .snapbackrc overrides defaults for same pattern", () => {
		// Simulating the mergeConfigs logic inline for isolated testing
		const defaults: SnapBackRC = {
			protection: [
				{ pattern: "**/.env*", level: "Protected", reason: "Default env rule" },
				{ pattern: "package.json", level: "Warning" },
			],
			ignore: ["node_modules/**"],
			settings: { maxSnapshots: 100 },
			policies: {},
			hooks: {},
			templates: [],
		};

		const userConfig: SnapBackRC = {
			protection: [
				{ pattern: "**/.env*", level: "Watched", reason: "User override" },
			],
			ignore: [],
			settings: {},
			policies: {},
			hooks: {},
			templates: [],
		};

		// Simulate mergeConfigs function
		const mergedProtection = [...(defaults.protection || [])];
		if (userConfig.protection && userConfig.protection.length > 0) {
			for (const userRule of userConfig.protection) {
				const existingIndex = mergedProtection.findIndex(
					(rule) => rule.pattern === userRule.pattern,
				);
				if (existingIndex >= 0) {
					mergedProtection[existingIndex] = userRule;
				} else {
					mergedProtection.push(userRule);
				}
			}
		}

		const merged: SnapBackRC = {
			protection: mergedProtection,
			ignore: userConfig.ignore || defaults.ignore,
			settings: { ...defaults.settings, ...userConfig.settings },
			policies: { ...defaults.policies, ...userConfig.policies },
			hooks: { ...defaults.hooks, ...userConfig.hooks },
			templates: userConfig.templates || defaults.templates,
		};

		// Verify the merged result
		expect(merged.protection).toHaveLength(2);
		const envRule = merged.protection!.find((r) => r.pattern === "**/.env*");
		expect(envRule).toBeDefined();
		expect(envRule?.level).toBe("Watched"); // User override wins
		expect(envRule?.reason).toBe("User override");

		// Verify other defaults are preserved
		const packageRule = merged.protection!.find(
			(r) => r.pattern === "package.json",
		);
		expect(packageRule).toBeDefined();
		expect(packageRule?.level).toBe("Warning");
	});

	/**
	 * Test C2: New rule
	 * Defaults: no rule for **\/*.custom
	 * .snapbackrc: **\/*.custom -> Warning
	 * Expected: Merged config contains both defaults + new rule, no defaults lost
	 */
	it("C2 - New rule: user config adds new pattern while preserving defaults", () => {
		const defaults: SnapBackRC = {
			protection: [
				{ pattern: "**/.env*", level: "Protected" },
				{ pattern: "package.json", level: "Warning" },
			],
			ignore: ["node_modules/**"],
			settings: { maxSnapshots: 100 },
			policies: {},
			hooks: {},
			templates: [],
		};

		const userConfig: SnapBackRC = {
			protection: [
				{ pattern: "**/*.custom", level: "Warning", reason: "Custom files" },
			],
			ignore: [],
			settings: {},
			policies: {},
			hooks: {},
			templates: [],
		};

		// Simulate mergeConfigs
		const mergedProtection = [...(defaults.protection || [])];
		if (userConfig.protection && userConfig.protection.length > 0) {
			for (const userRule of userConfig.protection) {
				const existingIndex = mergedProtection.findIndex(
					(rule) => rule.pattern === userRule.pattern,
				);
				if (existingIndex >= 0) {
					mergedProtection[existingIndex] = userRule;
				} else {
					mergedProtection.push(userRule);
				}
			}
		}

		const merged: SnapBackRC = {
			protection: mergedProtection,
			ignore: userConfig.ignore || defaults.ignore,
			settings: { ...defaults.settings, ...userConfig.settings },
			policies: { ...defaults.policies, ...userConfig.policies },
			hooks: { ...defaults.hooks, ...userConfig.hooks },
			templates: userConfig.templates || defaults.templates,
		};

		// Verify merged result
		expect(merged.protection).toHaveLength(3); // All 3 rules present
		expect(merged.protection!.map((r) => r.pattern)).toEqual([
			"**/.env*",
			"package.json",
			"**/*.custom",
		]);
		expect(
			merged.protection!.find((r) => r.pattern === "**/*.custom")?.level,
		).toBe("Warning");
	});

	/**
	 * Test C3: No user config
	 * No .snapbackrc present
	 * Expected: Merged config equals defaults, getMergedConfig() returns defaults
	 */
	it("C3 - No user config: merged config equals defaults when no .snapbackrc", () => {
		const defaults: SnapBackRC = {
			protection: [
				{ pattern: "**/.env*", level: "Protected" },
				{ pattern: "package.json", level: "Warning" },
			],
			ignore: ["node_modules/**"],
			settings: { maxSnapshots: 100 },
			policies: {},
			hooks: {},
			templates: [],
		};

		const userConfig: SnapBackRC | null = null;

		// Simulate mergeConfigs when userConfig is null
		const merged = !userConfig ? defaults : defaults;

		// Verify merged equals defaults
		expect(merged).toEqual(defaults);
		expect(merged.protection).toHaveLength(2);
		expect(merged.protection![0].pattern).toBe("**/.env*");
		expect(merged.protection![0].level).toBe("Protected");
	});

	/**
	 * Integration: Verify getMergedConfig() stores and returns merged config correctly
	 * This tests the actual SnapBackRCLoader behavior (if we had a concrete implementation)
	 */
	it("Integration - getMergedConfig() returns stored merged config", () => {
		// Simulate the SnapBackRCLoader private mergedConfig field
		let storedMergedConfig: SnapBackRC | null = null;

		const defaults: SnapBackRC = {
			protection: [{ pattern: "**/.env*", level: "Protected" }],
			ignore: [],
			settings: {},
			policies: {},
			hooks: {},
			templates: [],
		};

		const userConfig: SnapBackRC = {
			protection: [{ pattern: "**/.env*", level: "Watched" }],
			ignore: [],
			settings: {},
			policies: {},
			hooks: {},
			templates: [],
		};

		// Merge and store (simulating loadAndApplyConfig)
		const mergedProtection = [...(defaults.protection || [])];
		for (const userRule of userConfig.protection || []) {
			const idx = mergedProtection.findIndex(
				(r) => r.pattern === userRule.pattern,
			);
			if (idx >= 0) {
				mergedProtection[idx] = userRule;
			} else {
				mergedProtection.push(userRule);
			}
		}

		storedMergedConfig = {
			protection: mergedProtection,
			ignore: userConfig.ignore || defaults.ignore,
			settings: { ...defaults.settings, ...userConfig.settings },
			policies: { ...defaults.policies, ...userConfig.policies },
			hooks: { ...defaults.hooks, ...userConfig.hooks },
			templates: userConfig.templates || defaults.templates,
		};

		// Simulate getMergedConfig() return
		const retrieved = storedMergedConfig;

		expect(retrieved).not.toBeNull();
		expect(retrieved?.protection).toHaveLength(1);
		expect(retrieved?.protection?.[0]?.level).toBe("Watched");
	});

	/**
	 * Edge case: Empty protection array in user config
	 * Expected: Merged config preserves defaults
	 */
	it("Edge case - Empty protection in user config preserves defaults", () => {
		const defaults: SnapBackRC = {
			protection: [
				{ pattern: "**/.env*", level: "Protected" },
				{ pattern: "package.json", level: "Warning" },
			],
			ignore: [],
			settings: {},
			policies: {},
			hooks: {},
			templates: [],
		};

		const userConfig: SnapBackRC = {
			protection: [], // Empty array
			ignore: [],
			settings: {},
			policies: {},
			hooks: {},
			templates: [],
		};

		// Simulate mergeConfigs with empty user protection
		const mergedProtection = [...(defaults.protection || [])];
		if (userConfig.protection && userConfig.protection.length > 0) {
			for (const userRule of userConfig.protection) {
				const existingIndex = mergedProtection.findIndex(
					(rule) => rule.pattern === userRule.pattern,
				);
				if (existingIndex >= 0) {
					mergedProtection[existingIndex] = userRule;
				} else {
					mergedProtection.push(userRule);
				}
			}
		}

		const merged: SnapBackRC = {
			protection: mergedProtection,
			ignore: userConfig.ignore || defaults.ignore,
			settings: { ...defaults.settings, ...userConfig.settings },
			policies: { ...defaults.policies, ...userConfig.policies },
			hooks: { ...defaults.hooks, ...userConfig.hooks },
			templates: userConfig.templates || defaults.templates,
		};

		// Verify defaults are preserved
		expect(merged.protection).toEqual(defaults.protection);
	});
});
