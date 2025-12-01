import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import {
	ProtectionManager,
	type ProtectionPolicy,
} from "../../../src/services/protectionPolicy";
import type { SnapBackRC } from "../../../src/types/snapbackrc.types";

describe("ProtectionManager", () => {
	let mockRegistry: Partial<ProtectedFileRegistry>;
	let manager: ProtectionManager;

	const mockConfig: SnapBackRC = {
		protection: [
			{ pattern: "package.json", level: "Protected" },
			{ pattern: ".env*", level: "Protected" },
			{ pattern: "src/**/*.ts", level: "Watched" },
		],
		ignore: [],
		settings: {},
		policies: {},
		hooks: {},
		templates: [],
	};

	beforeEach(() => {
		mockRegistry = {
			list: vi.fn().mockResolvedValue([
				{ path: "package.json", protectionLevel: "Protected" },
				{ path: ".env.local", protectionLevel: "Protected" },
			]),
		};

		manager = new ProtectionManager(
			mockRegistry as ProtectedFileRegistry,
			() => mockConfig,
			"/workspace",
		);
	});

	describe("getEffectivePolicy", () => {
		it("should return null when no config is available", () => {
			const manager2 = new ProtectionManager(
				mockRegistry as ProtectedFileRegistry,
				() => null,
				"/workspace",
			);
			expect(manager2.getEffectivePolicy()).toBeNull();
		});

		it("should build a policy from merged config", () => {
			const policy = manager.getEffectivePolicy();

			expect(policy).not.toBeNull();
			if (policy) {
				expect(policy.version).toBe("1.0");
				expect(policy.rules).toEqual(mockConfig.protection);
				expect(policy.audit.rulesCount).toBe(3);
				expect(policy.audit.source).toBe("merged");
			}
		});

		it("should include audit information in policy", () => {
			const policy = manager.getEffectivePolicy();

			expect(policy).not.toBeNull();
			if (policy) {
				expect(policy.audit).toHaveProperty("loadedAt");
				expect(policy.audit).toHaveProperty("source");
				expect(policy.audit).toHaveProperty("rulesCount");
				expect(policy.audit.loadedAt).toBeGreaterThan(0);
			}
		});

		it("should cache policy for performance", () => {
			const policy1 = manager.getEffectivePolicy();
			const policy2 = manager.getEffectivePolicy();

			// Should be the same object if called within cache period
			expect(policy1).toBe(policy2);
		});
	});

	describe("computeRepoStatus", () => {
		it("should return error status when no config available", async () => {
			const manager2 = new ProtectionManager(
				mockRegistry as ProtectedFileRegistry,
				() => null,
				"/workspace",
			);

			const audit = await manager2.computeRepoStatus();

			expect(audit.status).toBe("error");
			expect(audit.protectedCount).toBe(0);
			expect(audit.attentionItems).toEqual([]);
		});

		it("should compute protected file count from registry", async () => {
			const audit = await manager.computeRepoStatus();

			expect(audit.protectedCount).toBe(2);
			expect(audit.computedAt).toBeGreaterThan(0);
		});

		it("should return 'unprotected' status when no files are protected", async () => {
			mockRegistry.list = vi.fn().mockResolvedValue([]);

			const audit = await manager.computeRepoStatus();

			expect(audit.status).toBe("unprotected");
			expect(audit.protectedCount).toBe(0);
		});

		it("should return 'complete' status when critical files are protected and unprotected count is 0", async () => {
			const audit = await manager.computeRepoStatus();

			// With current mock data: 2 files protected, 0 unprotected critical
			// This results in 'complete' status
			expect(audit.status).toBe("complete");
			expect(audit.protectedCount).toBeGreaterThan(0);
		});

		it("should include audit metadata in result", async () => {
			const audit = await manager.computeRepoStatus();

			expect(audit).toHaveProperty("status");
			expect(audit).toHaveProperty("protectedCount");
			expect(audit).toHaveProperty("unprotectedCount");
			expect(audit).toHaveProperty("attentionItems");
			expect(audit).toHaveProperty("computedAt");
		});

		it("should handle registry errors gracefully", async () => {
			mockRegistry.list = vi
				.fn()
				.mockRejectedValue(new Error("Registry error"));

			const audit = await manager.computeRepoStatus();

			expect(audit.status).toBe("error");
			expect(audit.attentionItems).toEqual([]);
		});
	});

	describe("policy building", () => {
		it("should handle config with no protection rules", () => {
			const emptyConfig: SnapBackRC = {
				protection: [],
				ignore: [],
				settings: {},
				policies: {},
				hooks: {},
				templates: [],
			};

			const manager2 = new ProtectionManager(
				mockRegistry as ProtectedFileRegistry,
				() => emptyConfig,
				"/workspace",
			);

			const policy = manager2.getEffectivePolicy();

			expect(policy).not.toBeNull();
			if (policy) {
				expect(policy.rules).toEqual([]);
				expect(policy.audit.rulesCount).toBe(0);
			}
		});

		it("should mark policies with correct audit source", () => {
			const policy = manager.getEffectivePolicy();

			expect(policy).not.toBeNull();
			if (policy) {
				expect(policy.audit.source).toBe("merged");
			}
		});
	});
});
