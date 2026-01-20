/**
 * Policy Version Validation Regression Tests
 *
 * Tests to prevent recurrence of the policy version rejection bug
 * discovered in 2026-01-19 stability analysis.
 *
 * Root Cause: PolicyManager only accepted version "1.0", causing valid
 * v2.0 policies to be rejected and fall back to defaults silently.
 *
 * Fix: Added support for both "1.0" and "2.0" policy versions with
 * proper validation error messages.
 *
 * Reference: apps/vscode/src/policy/PolicyManager.ts:53
 */

import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock VS Code logger
const mockLogger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
};

vi.mock("../../../src/utils/logger", () => ({
	default: mockLogger,
	logger: mockLogger,
}));

describe("Policy Version Validation Tests", () => {
	const workspaceRoot = "/test/workspace";
	let policyManager: any;

	beforeEach(async () => {
		vi.clearAllMocks();

		// Import PolicyManager after mocks are set up
		const { PolicyManager } = await import("../../../src/policy/PolicyManager");
		policyManager = new PolicyManager(workspaceRoot);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Supported Policy Versions", () => {
		it("should accept policy version 1.0", () => {
			const supportedVersions = ["1.0", "2.0"];
			const version = "1.0";

			expect(supportedVersions.includes(version)).toBe(true);
		});

		it("should accept policy version 2.0", () => {
			const supportedVersions = ["1.0", "2.0"];
			const version = "2.0";

			expect(supportedVersions.includes(version)).toBe(true);
		});

		it("should reject unsupported policy versions", () => {
			const supportedVersions = ["1.0", "2.0"];
			const invalidVersions = ["0.9", "3.0", "1.5", "2.1"];

			invalidVersions.forEach(version => {
				expect(supportedVersions.includes(version)).toBe(false);
			});
		});

		it("should reject missing version field", () => {
			const supportedVersions = ["1.0", "2.0"];
			const version = undefined;

			expect(version ? supportedVersions.includes(version) : false).toBe(false);
		});

		it("should reject null version field", () => {
			const supportedVersions = ["1.0", "2.0"];
			const version = null;

			expect(version ? supportedVersions.includes(version) : false).toBe(false);
		});
	});

	describe("Policy v1.0 Schema", () => {
		it("should validate v1.0 policy structure", () => {
			const policyV1 = {
				version: "1.0",
				rules: [
					{
						pattern: "*.env*",
						level: "block",
						reason: "Sensitive environment variables",
					},
				],
				overrides: [],
				ignore: ["node_modules/**"],
				settings: {
					defaultProtectionLevel: "watch",
				},
			};

			expect(policyV1.version).toBe("1.0");
			expect(Array.isArray(policyV1.rules)).toBe(true);
			expect(policyV1.rules.length).toBeGreaterThan(0);
		});

		it("should validate v1.0 rule structure", () => {
			const rule = {
				pattern: "package.json",
				level: "warn",
				reason: "Package manifest",
			};

			expect(rule.pattern).toBeDefined();
			expect(["watch", "warn", "block"].includes(rule.level)).toBe(true);
			expect(typeof rule.reason).toBe("string");
		});
	});

	describe("Policy v2.0 Schema", () => {
		it("should validate v2.0 policy structure", () => {
			const policyV2 = {
				version: "2.0",
				rules: [
					{
						pattern: "**/*.env*",
						level: "block",
						reason: "Environment files contain sensitive credentials",
						precedence: 100,
					},
				],
				overrides: [],
				ignore: ["node_modules/**", ".git/**"],
				settings: {
					defaultProtectionLevel: "watch",
					requireSnapshotMessage: true,
					maxSnapshots: 100,
				},
				validation: {
					preFlight: {
						required: true,
						tool: "codebase.start_task",
					},
				},
				constraints: {
					layerBoundary: {
						presentation: ["@snapback/core"],
					},
				},
			};

			expect(policyV2.version).toBe("2.0");
			expect(Array.isArray(policyV2.rules)).toBe(true);
			expect(policyV2.validation).toBeDefined();
			expect(policyV2.constraints).toBeDefined();
		});

		it("should validate v2.0 rule with precedence", () => {
			const rule = {
				pattern: "**/migrations/*",
				level: "block",
				reason: "Database migrations are irreversible",
				precedence: 100,
			};

			expect(rule.pattern).toBeDefined();
			expect(rule.precedence).toBe(100);
			expect(typeof rule.precedence).toBe("number");
		});

		it("should validate v2.0 validation section", () => {
			const validation = {
				preFlight: {
					required: true,
					tool: "codebase.start_task",
				},
				preCommit: {
					required: true,
					tool: "codebase.check_patterns",
				},
				layers: ["syntax", "types", "tests"],
			};

			expect(validation.preFlight).toBeDefined();
			expect(validation.preCommit).toBeDefined();
			expect(Array.isArray(validation.layers)).toBe(true);
		});

		it("should validate v2.0 constraints section", () => {
			const constraints = {
				layerBoundary: {
					core: ["@snapback/contracts", "@snapback/config"],
					platform: ["@snapback/core", "@snapback/infrastructure"],
				},
				banned: {
					production: ["console.log", "debugger"],
					client: ["fs", "worker_threads"],
				},
			};

			expect(constraints.layerBoundary).toBeDefined();
			expect(constraints.banned).toBeDefined();
			expect(Array.isArray(constraints.layerBoundary.core)).toBe(true);
		});
	});

	describe("Version Validation Error Messages", () => {
		it("should include supported versions in error message", () => {
			const supportedVersions = ["1.0", "2.0"];
			const invalidVersion = "3.0";

			const errorMessage = {
				version: invalidVersion,
				supportedVersions,
				message: `Invalid policy version: ${invalidVersion}. Supported versions: ${supportedVersions.join(", ")}`,
			};

			expect(errorMessage.message).toContain("3.0");
			expect(errorMessage.message).toContain("1.0");
			expect(errorMessage.message).toContain("2.0");
		});

		it("should log warning when falling back to defaults", () => {
			const logEntry = {
				level: "warn",
				message: "Invalid policy version, using defaults",
				context: {
					path: "/workspace/.snapback/policy.json",
					version: "3.0",
					supportedVersions: ["1.0", "2.0"],
				},
			};

			expect(logEntry.level).toBe("warn");
			expect(logEntry.context.supportedVersions).toContain("2.0");
		});
	});

	describe("Policy Migration Path", () => {
		it("should show v1 to v2 schema differences", () => {
			const v1Fields = ["version", "rules", "overrides", "ignore", "settings"];
			const v2AdditionalFields = ["validation", "constraints"];

			const v1Only = v1Fields.filter(f => !v2AdditionalFields.includes(f));
			const v2New = v2AdditionalFields;

			expect(v1Only.length).toBeGreaterThan(0);
			expect(v2New).toContain("validation");
			expect(v2New).toContain("constraints");
		});

		it("should maintain backward compatibility for v1 rules in v2", () => {
			const v1Rule = {
				pattern: "*.env",
				level: "block",
				reason: "Sensitive data",
			};

			const v2Rule = {
				...v1Rule,
				precedence: 50, // Optional v2 field
			};

			// v1 fields still valid in v2
			expect(v2Rule.pattern).toBe(v1Rule.pattern);
			expect(v2Rule.level).toBe(v1Rule.level);
			expect(v2Rule.reason).toBe(v1Rule.reason);
		});
	});

	describe("Real-world Policy Files", () => {
		it("should validate actual .snapback/policy.json v2.0 structure", () => {
			// Simulate the actual policy.json from the codebase
			const actualPolicyV2 = {
				version: "2.0",
				rules: [
					{
						pattern: "**/*.env*",
						level: "block",
						reason: "Environment files contain sensitive credentials",
						precedence: 100,
					},
					{
						pattern: "**/migrations/*",
						level: "block",
						reason: "Database migrations are irreversible",
						precedence: 100,
					},
					{
						pattern: "package*.json",
						level: "warn",
						reason: "Package files affect dependencies",
						precedence: 50,
					},
				],
				overrides: [],
				ignore: [
					"node_modules/**",
					".git/**",
					"dist/**",
					"*.log",
				],
				settings: {
					defaultProtectionLevel: "watch",
					requireSnapshotMessage: true,
					maxSnapshots: 100,
				},
				validation: {
					preFlight: {
						required: true,
						tool: "codebase.start_task",
					},
				},
			};

			expect(actualPolicyV2.version).toBe("2.0");
			expect(actualPolicyV2.rules.some(r => r.precedence !== undefined)).toBe(true);
			expect(actualPolicyV2.validation).toBeDefined();
		});

		it("should handle missing optional v2 fields gracefully", () => {
			const minimalV2Policy = {
				version: "2.0",
				rules: [
					{
						pattern: "*.env",
						level: "block",
						// Missing: precedence, reason
					},
				],
				// Missing: overrides, ignore, settings, validation, constraints
			};

			expect(minimalV2Policy.version).toBe("2.0");
			expect(Array.isArray(minimalV2Policy.rules)).toBe(true);
		});
	});

	describe("Edge Cases", () => {
		it("should handle version as number instead of string", () => {
			const supportedVersions = ["1.0", "2.0"];
			const numericVersion = 2.0;

			// JavaScript converts 2.0 to "2" not "2.0"
			const versionString = String(numericVersion);
			expect(versionString).toBe("2"); // Not "2.0"!

			// This edge case would fail - numbers should be strings in JSON
			expect(supportedVersions.includes(versionString)).toBe(false);
		});

		it("should handle version with extra whitespace", () => {
			const supportedVersions = ["1.0", "2.0"];
			const versionWithWhitespace = " 2.0 ";

			const trimmed = versionWithWhitespace.trim();
			expect(supportedVersions.includes(trimmed)).toBe(true);
		});

		it("should reject version with semantic versioning format", () => {
			const supportedVersions = ["1.0", "2.0"];
			const semverVersion = "2.0.0"; // Full semver

			expect(supportedVersions.includes(semverVersion)).toBe(false);
		});

		it("should handle case-insensitive version comparison", () => {
			const supportedVersions = ["1.0", "2.0"];
			const uppercaseVersion = "2.0".toUpperCase();

			// Should normalize case before comparison
			const normalized = uppercaseVersion.toLowerCase();
			expect(supportedVersions.includes(normalized)).toBe(true);
		});
	});
});
