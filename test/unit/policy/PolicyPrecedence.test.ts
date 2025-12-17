import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PolicyManager } from "@vscode/policy/PolicyManager";
import type { PolicyConfig } from "@vscode/types/policy.types";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("Policy Precedence Tests", () => {
	let policyManager: PolicyManager;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		policyManager = new PolicyManager(workspaceRoot);
	});

	it("should prioritize rules with higher precedence numbers", async () => {
		// Create a policy with conflicting rules where the later rule has higher precedence
		const policy: PolicyConfig = {
			version: "1.0",
			rules: [
				{
					pattern: "**/*.ts",
					level: "warn",
					reason: "TypeScript files",
					precedence: 50,
				},
				{
					pattern: "**/config/*.ts",
					level: "block",
					reason: "Config files are critical",
					precedence: 100,
				},
			],
			overrides: [],
			ignore: [],
			settings: {
				defaultProtectionLevel: "watch",
			},
		};

		// @ts-expect-error - accessing private property for testing
		policyManager.policy = policy;

		// Test a file in config directory - should be blocked due to higher precedence
		const configFilePath = path.join(
			workspaceRoot,
			"src",
			"config",
			"database.ts",
		);
		const protectionLevel = policyManager.getProtectionLevel(configFilePath);

		expect(protectionLevel).toBe("Protected");

		// Test a regular TypeScript file - should be warned
		const regularFilePath = path.join(workspaceRoot, "src", "utils.ts");
		const regularProtectionLevel =
			policyManager.getProtectionLevel(regularFilePath);

		expect(regularProtectionLevel).toBe("Warning");
	});

	it("should resolve conflicts with same precedence by rule order", async () => {
		// Create a policy with conflicting rules that have the same precedence
		const policy: PolicyConfig = {
			version: "1.0",
			rules: [
				{
					pattern: "**/*.ts",
					level: "warn",
					reason: "TypeScript files",
					precedence: 50,
				},
				{
					pattern: "**/src/*.ts",
					level: "block",
					reason: "Source files are critical",
					precedence: 50,
				},
			],
			overrides: [],
			ignore: [],
			settings: {
				defaultProtectionLevel: "watch",
			},
		};

		// @ts-expect-error - accessing private property for testing
		policyManager.policy = policy;

		// Test a file in src directory - should be blocked because it's the later rule
		const srcFilePath = path.join(workspaceRoot, "src", "utils.ts");
		const protectionLevel = policyManager.getProtectionLevel(srcFilePath);

		expect(protectionLevel).toBe("Protected");
	});

	it("should handle rules without explicit precedence (default to 0)", async () => {
		// Create a policy with a mix of rules with and without precedence
		const policy: PolicyConfig = {
			version: "1.0",
			rules: [
				{
					pattern: "**/*.ts",
					level: "warn",
					reason: "TypeScript files",
				},
				{
					pattern: "**/critical/*.ts",
					level: "block",
					reason: "Critical files",
					precedence: 10,
				},
			],
			overrides: [],
			ignore: [],
			settings: {
				defaultProtectionLevel: "watch",
			},
		};

		// @ts-expect-error - accessing private property for testing
		policyManager.policy = policy;

		// Test a file in critical directory - should be blocked due to higher precedence
		const criticalFilePath = path.join(
			workspaceRoot,
			"src",
			"critical",
			"security.ts",
		);
		const protectionLevel = policyManager.getProtectionLevel(criticalFilePath);

		expect(protectionLevel).toBe("Protected");

		// Test a regular TypeScript file - should be warned (default precedence 0)
		const regularFilePath = path.join(workspaceRoot, "src", "utils.ts");
		const regularProtectionLevel =
			policyManager.getProtectionLevel(regularFilePath);

		expect(regularProtectionLevel).toBe("Warning");
	});

	it("should maintain override precedence over rules", async () => {
		// Create a policy with both rules and overrides
		const policy: PolicyConfig = {
			version: "1.0",
			rules: [
				{
					pattern: "**/*.env",
					level: "block",
					reason: "Environment files",
					precedence: 100,
				},
			],
			overrides: [
				{
					pattern: "**/*.env",
					level: "warn",
					rationale: "testing",
					ttl: Date.now() + 86400000, // 1 day from now
					metadata: {
						createdAt: Date.now(),
						createdBy: "test",
					},
				},
			],
			ignore: [],
			settings: {
				defaultProtectionLevel: "watch",
			},
		};

		// @ts-expect-error - accessing private property for testing
		policyManager.policy = policy;

		// Test an env file - should be warned due to override taking precedence
		const envFilePath = path.join(workspaceRoot, ".env");
		const protectionLevel = policyManager.getProtectionLevel(envFilePath);

		expect(protectionLevel).toBe("Warning");
	});

	it("should fall back to default when no rules match", async () => {
		// Create a policy with no matching rules
		const policy: PolicyConfig = {
			version: "1.0",
			rules: [
				{
					pattern: "**/*.ts",
					level: "warn",
					reason: "TypeScript files",
				},
			],
			overrides: [],
			ignore: [],
			settings: {
				defaultProtectionLevel: "block",
			},
		};

		// @ts-expect-error - accessing private property for testing
		policyManager.policy = policy;

		// Test a JSON file - should be blocked due to default setting
		const jsonFilePath = path.join(workspaceRoot, "config.json");
		const protectionLevel = policyManager.getProtectionLevel(jsonFilePath);

		expect(protectionLevel).toBe("Protected");
	});
});
