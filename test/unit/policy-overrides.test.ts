import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { PolicyManager } from "../../src/policy/PolicyManager";

// vscode mock provided by setup.ts

// Mock fs
vi.mock("node:fs/promises", () => ({
	default: {
		access: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
	},
}));

describe("PolicyManager - Overrides with TTL", () => {
	let policyManager: PolicyManager;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		policyManager = new PolicyManager(workspaceRoot);
		vi.clearAllMocks();
	});

	it("should apply override over rule (GREEN TEST - should pass now)", () => {
		const policy = {
			version: "1.0",
			rules: [{ pattern: "*.env", level: "block" } as any],
			overrides: [
				{
					pattern: "*.env",
					level: "watch",
					rationale: "testing",
					ttl: Date.now() + 86400000, // 1 day in future
				} as any,
			],
		};

		(policyManager as any).policy = policy;

		const level = policyManager.getProtectionLevel(
			path.join(workspaceRoot, ".env"),
		);
		expect(level).toBe("Watched"); // Override should win
	});

	it("should skip expired overrides (GREEN TEST - should pass now)", () => {
		const policy = {
			version: "1.0",
			rules: [{ pattern: "*.env", level: "block" } as any],
			overrides: [
				{
					pattern: "*.env",
					level: "watch",
					rationale: "testing",
					ttl: Date.now() - 1000, // Expired 1 second ago
				} as any,
			],
		};

		(policyManager as any).policy = policy;

		const level = policyManager.getProtectionLevel(
			path.join(workspaceRoot, ".env"),
		);
		expect(level).toBe("Protected"); // Should fall back to rule
	});

	it("should require rationale for overrides (GREEN TEST - should pass now)", async () => {
		const policy = {
			version: "1.0",
			rules: [{ pattern: "*.env", level: "block" } as any],
		};

		(policyManager as any).policy = policy;

		// This should throw an error because rationale is required
		await expect(
			(policyManager as any).createOverride(
				path.join(workspaceRoot, ".env"),
				"watch",
				undefined, // No rationale
				"7d",
			),
		).rejects.toThrow("Rationale is required for policy overrides");
	});

	it("should notify for expiring overrides (GREEN TEST - should pass now)", async () => {
		const showInfoSpy = vi.spyOn(vscode.window, "showInformationMessage");

		const policy = {
			version: "1.0",
			settings: { overrideExpirationWarningDays: 7 },
			overrides: [
				{
					pattern: "*.test.ts",
					level: "unprotected",
					rationale: "testing",
					ttl: Date.now() + 3 * 24 * 60 * 60 * 1000, // Expires in 3 days
				} as any,
			],
		};

		(policyManager as any).policy = policy;

		await (policyManager as any).checkExpiringOverrides();

		expect(showInfoSpy).toHaveBeenCalledWith(
			expect.stringContaining("expires in 3 day(s)"),
			"Renew Override",
			"Remove Override",
			"Dismiss",
		);
	});
});
