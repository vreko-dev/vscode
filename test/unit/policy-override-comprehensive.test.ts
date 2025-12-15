import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PolicyManager } from "../../src/policy/PolicyManager";

// vscode mock provided by setup.ts
,
	},
	RelativePattern: vi.fn(),
}));

// Mock fs
vi.mock("node:fs/promises", () => {
	const actual = vi.importActual("node:fs/promises");
	return {
		...actual,
		access: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
	};
});

describe("PolicyManager - Comprehensive Override Tests", () => {
	let policyManager: PolicyManager;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		policyManager = new PolicyManager(workspaceRoot);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should create a policy override with correct properties", async () => {
		// Mock fs.writeFile to capture the saved policy
		let savedPolicy: any = null;
		(fs.writeFile as any).mockImplementation(
			async (_path: string, content: string) => {
				savedPolicy = JSON.parse(content);
			},
		);

		const filePath = path.join(workspaceRoot, "test.ts");
		const rationale = "testing" as const;
		const ttl = "7d";

		await policyManager.createOverride(filePath, "watch", rationale, ttl);

		expect(savedPolicy).toBeDefined();
		expect(savedPolicy.overrides).toHaveLength(1);

		const override = savedPolicy.overrides[0];
		expect(override.pattern).toBe("test.ts"); // Relative path
		expect(override.level).toBe("watch");
		expect(override.rationale).toBe("testing");
		expect(override.ttl).toBeGreaterThan(Date.now()); // Should be in the future
		expect(override.metadata).toBeDefined();
		expect(override.metadata.createdAt).toBeDefined();
		expect(override.metadata.createdBy).toBe("User");
	});

	it("should create a permanent override without TTL", async () => {
		// Mock fs.writeFile to capture the saved policy
		let savedPolicy: any = null;
		(fs.writeFile as any).mockImplementation(
			async (_path: string, content: string) => {
				savedPolicy = JSON.parse(content);
			},
		);

		const filePath = path.join(workspaceRoot, "test.ts");
		const rationale = "testing" as const;
		const ttl = "permanent";

		await policyManager.createOverride(filePath, "warn", rationale, ttl);

		expect(savedPolicy).toBeDefined();
		expect(savedPolicy.overrides).toHaveLength(1);

		const override = savedPolicy.overrides[0];
		expect(override.pattern).toBe("test.ts");
		expect(override.level).toBe("warn");
		expect(override.rationale).toBe("testing");
		expect(override.ttl).toBeUndefined(); // No TTL for permanent overrides
	});

	it("should update existing override for same pattern", async () => {
		// Mock fs.writeFile to capture the saved policy
		let savedPolicy: any = null;
		(fs.writeFile as any).mockImplementation(
			async (_path: string, content: string) => {
				savedPolicy = JSON.parse(content);
			},
		);

		const filePath = path.join(workspaceRoot, "test.ts");
		const rationale = "testing" as const;

		// Create first override
		await policyManager.createOverride(filePath, "watch", rationale, "7d");

		// Create second override for same pattern
		await policyManager.createOverride(filePath, "block", rationale, "30d");

		expect(savedPolicy).toBeDefined();
		expect(savedPolicy.overrides).toHaveLength(1); // Should still be 1, not 2

		const override = savedPolicy.overrides[0];
		expect(override.level).toBe("block"); // Should be updated to the new level
		expect(override.ttl).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000); // ~30 days
	});

	it("should handle multiple overrides for different patterns", async () => {
		// Mock fs.writeFile to capture the saved policy
		let savedPolicy: any = null;
		(fs.writeFile as any).mockImplementation(
			async (_path: string, content: string) => {
				savedPolicy = JSON.parse(content);
			},
		);

		const filePath1 = path.join(workspaceRoot, "test1.ts");
		const filePath2 = path.join(workspaceRoot, "test2.ts");
		const rationale = "testing" as const;

		// Create first override
		await policyManager.createOverride(filePath1, "watch", rationale, "7d");

		// Create second override for different pattern
		await policyManager.createOverride(filePath2, "block", rationale, "30d");

		expect(savedPolicy).toBeDefined();
		expect(savedPolicy.overrides).toHaveLength(2); // Should have 2 overrides

		const override1 = savedPolicy.overrides[0];
		const override2 = savedPolicy.overrides[1];

		expect(override1.pattern).toBe("test1.ts");
		expect(override1.level).toBe("watch");

		expect(override2.pattern).toBe("test2.ts");
		expect(override2.level).toBe("block");
	});

	it("should apply override precedence over rules", async () => {
		const policy = {
			version: "1.0",
			rules: [{ pattern: "*.ts", level: "block" } as any],
			overrides: [
				{
					pattern: "test.ts",
					level: "watch",
					rationale: "testing",
					ttl: Date.now() + 86400000, // 1 day in future
				} as any,
			],
		};

		(policyManager as any).policy = policy;

		const level = policyManager.getProtectionLevel(
			path.join(workspaceRoot, "test.ts"),
		);
		expect(level).toBe("Watched"); // Override should win over rule
	});

	it("should fall back to rules when override expires", async () => {
		const policy = {
			version: "1.0",
			rules: [{ pattern: "*.ts", level: "block" } as any],
			overrides: [
				{
					pattern: "test.ts",
					level: "watch",
					rationale: "testing",
					ttl: Date.now() - 1000, // Expired 1 second ago
				} as any,
			],
		};

		(policyManager as any).policy = policy;

		const level = policyManager.getProtectionLevel(
			path.join(workspaceRoot, "test.ts"),
		);
		expect(level).toBe("Protected"); // Should fall back to rule when override expires
	});

	it("should handle invalid TTL format", async () => {
		const filePath = path.join(workspaceRoot, "test.ts");
		const rationale = "testing" as const;
		const invalidTtl = "invalid";

		await expect(
			policyManager.createOverride(filePath, "watch", rationale, invalidTtl),
		).rejects.toThrow("Invalid TTL format");
	});

	it("should require rationale for overrides", async () => {
		const filePath = path.join(workspaceRoot, "test.ts");
		const ttl = "7d";

		await expect(
			policyManager.createOverride(filePath, "watch", undefined as any, ttl),
		).rejects.toThrow("Rationale is required for policy overrides");
	});
});
