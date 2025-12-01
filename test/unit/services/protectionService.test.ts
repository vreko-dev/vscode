/**
 * @fileoverview ProtectionService Test Suite
 *
 * Tests for ProtectionService facade
 * Covers repo status, context keys, and save checks
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIRiskService } from "../../../src/services/aiRiskService";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import type { ProtectionManager } from "../../../src/services/protectionPolicy";
import type { ProtectionService } from "../../../src/services/protectionService";
import { ProtectionService as ProtectionServiceImpl } from "../../../src/services/protectionService";

describe("ProtectionService", () => {
	let service: ProtectionService;
	let mockRegistry: any;
	let mockPolicyManager: any;
	let mockAiRiskService: any;
	let mockVscodeContext: any;

	beforeEach(() => {
		// Mock registry
		mockRegistry = {
			isProtected: vi.fn(),
			getProtectionLevel: vi.fn(),
			list: vi.fn().mockResolvedValue([]),
		};

		// Mock policy manager
		mockPolicyManager = {
			computeRepoStatus: vi.fn(),
			getEffectivePolicy: vi.fn(),
		};

		// Mock AI risk service
		mockAiRiskService = {
			getCachedRisk: vi.fn().mockReturnValue(null),
			assessChange: vi.fn(),
		};

		// Mock VS Code context API - takes (key, value) not ("setContext", key, value)
		mockVscodeContext = vi.fn().mockResolvedValue(undefined);

		service = new ProtectionServiceImpl(
			mockRegistry,
			mockPolicyManager,
			mockAiRiskService,
			mockVscodeContext,
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("getRepoStatus", () => {
		it("should pass through policy manager status", async () => {
			const expectedStatus = {
				status: "complete" as const,
				protectedCount: 10,
				unprotectedCount: 0,
				criticalUnprotectedCount: 0,
				attentionItems: [],
				computedAt: Date.now(),
			};

			mockPolicyManager.computeRepoStatus.mockResolvedValue(expectedStatus);

			const status = await service.getRepoStatus();

			expect(status).toEqual(expectedStatus);
			expect(mockPolicyManager.computeRepoStatus).toHaveBeenCalled();
		});

		it("should handle policy manager errors", async () => {
			mockPolicyManager.computeRepoStatus.mockRejectedValue(
				new Error("Policy computation failed"),
			);

			const status = await service.getRepoStatus();

			expect(status.status).toBe("error");
			expect(status.protectedCount).toBe(0);
		});

		it("should return partial status when some files protected", async () => {
			const partialStatus = {
				status: "partial" as const,
				protectedCount: 5,
				unprotectedCount: 3,
				criticalUnprotectedCount: 1,
				attentionItems: [
					{
						type: "unprotected_critical" as const,
						filePath: "/app/secrets.ts",
						message: "Critical file not protected",
						severity: "error" as const,
					},
				],
				computedAt: Date.now(),
			};

			mockPolicyManager.computeRepoStatus.mockResolvedValue(partialStatus);

			const status = await service.getRepoStatus();

			expect(status.status).toBe("partial");
			expect(status.attentionItems.length).toBe(1);
		});
	});

	describe("refreshContextKeys", () => {
		it("should set context keys based on repo status", async () => {
			const repoStatus = {
				status: "complete" as const,
				protectedCount: 10,
				unprotectedCount: 0,
				criticalUnprotectedCount: 0,
				attentionItems: [],
				computedAt: Date.now(),
			};

			mockPolicyManager.computeRepoStatus.mockResolvedValue(repoStatus);

			await service.refreshContextKeys();

			expect(mockVscodeContext).toHaveBeenCalledWith(
				"snapback.protectionStatus",
				"complete",
			);
			expect(mockVscodeContext).toHaveBeenCalledWith(
				"snapback.attentionCount",
				0,
			);
		});

		it("should set attention count from audit items", async () => {
			const repoStatus = {
				status: "partial" as const,
				protectedCount: 5,
				unprotectedCount: 3,
				criticalUnprotectedCount: 2,
				attentionItems: [
					{
						type: "unprotected_critical" as const,
						filePath: "/file1.ts",
						message: "Not protected",
						severity: "error" as const,
					},
					{
						type: "unprotected_critical" as const,
						filePath: "/file2.ts",
						message: "Not protected",
						severity: "error" as const,
					},
				],
				computedAt: Date.now(),
			};

			mockPolicyManager.computeRepoStatus.mockResolvedValue(repoStatus);

			await service.refreshContextKeys();

			expect(mockVscodeContext).toHaveBeenCalledWith(
				"snapback.attentionCount",
				2,
			);
		});

		it("should set unprotected status when no files protected", async () => {
			const emptyStatus = {
				status: "unprotected" as const,
				protectedCount: 0,
				unprotectedCount: 5,
				criticalUnprotectedCount: 2,
				attentionItems: [],
				computedAt: Date.now(),
			};

			mockPolicyManager.computeRepoStatus.mockResolvedValue(emptyStatus);

			await service.refreshContextKeys();

			expect(mockVscodeContext).toHaveBeenCalledWith(
				"snapback.protectionStatus",
				"unprotected",
			);
		});

		it("should handle context setting errors gracefully", async () => {
			mockPolicyManager.computeRepoStatus.mockResolvedValue({
				status: "complete" as const,
				protectedCount: 10,
				unprotectedCount: 0,
				criticalUnprotectedCount: 0,
				attentionItems: [],
				computedAt: Date.now(),
			});

			mockVscodeContext.mockRejectedValue(new Error("Context API failed"));

			// Should not throw
			await expect(service.refreshContextKeys()).resolves.not.toThrow();
		});
	});

	describe("checkSaveAllowed", () => {
		it("should allow save for unprotected files", async () => {
			mockRegistry.isProtected.mockReturnValue(false);

			const mockDocument = {
				uri: { fsPath: "/unprotected/file.ts" },
			};

			const result = await service.checkSaveAllowed(mockDocument as any);

			expect(result.allowed).toBe(true);
		});

		it("should allow save when protection level is Watched", async () => {
			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("Watched");

			const mockDocument = {
				uri: { fsPath: "/protected/file.ts" },
			};

			const result = await service.checkSaveAllowed(mockDocument as any);

			expect(result.allowed).toBe(true);
		});

		it("should check cached AI risk for protected files", async () => {
			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("Protected");

			const cachedRisk = {
				level: "high" as const,
				score: 85,
				confidence: 0.9,
				factors: ["eval() detected"],
				timestamp: Date.now(),
			};

			mockAiRiskService.getCachedRisk.mockReturnValue(cachedRisk);

			const mockDocument = {
				uri: { fsPath: "/protected/file.ts" },
			};

			const result = await service.checkSaveAllowed(mockDocument as any);

			expect(mockAiRiskService.getCachedRisk).toHaveBeenCalled();
			// For now, we still allow (future: might block based on risk)
			expect(result.allowed).toBe(true);
		});

		it("should include protection level in result", async () => {
			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("Warning");

			const mockDocument = {
				uri: { fsPath: "/protected/file.ts" },
			};

			const result = await service.checkSaveAllowed(mockDocument as any);

			expect(result.protectionLevel).toBe("Warning");
		});
	});

	describe("auditRepo", () => {
		it("should call getRepoStatus and refreshContextKeys", async () => {
			const repoStatus = {
				status: "complete" as const,
				protectedCount: 10,
				unprotectedCount: 0,
				criticalUnprotectedCount: 0,
				attentionItems: [],
				computedAt: Date.now(),
			};

			mockPolicyManager.computeRepoStatus.mockResolvedValue(repoStatus);

			await service.auditRepo();

			expect(mockPolicyManager.computeRepoStatus).toHaveBeenCalled();
			expect(mockVscodeContext).toHaveBeenCalled();
		});

		it("should handle audit errors gracefully", async () => {
			mockPolicyManager.computeRepoStatus.mockRejectedValue(
				new Error("Audit failed"),
			);

			// Should not throw
			await expect(service.auditRepo()).resolves.not.toThrow();
		});
	});

	describe("edge cases", () => {
		it("should handle files with no protection level", async () => {
			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue(undefined);

			const mockDocument = {
				uri: { fsPath: "/protected/file.ts" },
			};

			const result = await service.checkSaveAllowed(mockDocument as any);

			expect(result.allowed).toBe(true);
			expect(result.protectionLevel).toBeUndefined();
		});

		it("should handle concurrent auditRepo calls", async () => {
			mockPolicyManager.computeRepoStatus.mockResolvedValue({
				status: "complete" as const,
				protectedCount: 10,
				unprotectedCount: 0,
				criticalUnprotectedCount: 0,
				attentionItems: [],
				computedAt: Date.now(),
			});

			// Call multiple times concurrently
			const results = await Promise.all([
				service.auditRepo(),
				service.auditRepo(),
				service.auditRepo(),
			]);

			expect(results.length).toBe(3);
			expect(mockPolicyManager.computeRepoStatus).toHaveBeenCalledTimes(3);
		});
	});
});
