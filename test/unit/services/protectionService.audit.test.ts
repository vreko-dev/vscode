import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIRiskService } from "../../../src/services/aiRiskService.js";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry.js";
import type { ProtectionManager } from "../../../src/services/protectionPolicy.js";
import { ProtectionService } from "../../../src/services/protectionService.js";

describe("ProtectionService - Enhanced Audit Features", () => {
	let protectionService: ProtectionService;
	let mockRegistry: ProtectedFileRegistry;
	let mockPolicyManager: ProtectionManager;
	let mockAIRiskService: AIRiskService;
	let mockSetContext: ReturnType<typeof vi.fn>;
	let contextKeys: Map<string, any>;

	beforeEach(() => {
		// Track context key changes
		contextKeys = new Map();
		mockSetContext = vi.fn((key, value) => {
			contextKeys.set(key, value);
			return Promise.resolve();
		});

		// Mock registry
		mockRegistry = {
			list: vi.fn().mockResolvedValue([]),
			isProtected: vi.fn().mockReturnValue(false),
			getProtectionLevel: vi.fn().mockReturnValue(undefined),
		} as any;

		// Mock policy manager
		mockPolicyManager = {
			computeRepoStatus: vi.fn().mockResolvedValue({
				status: "unprotected",
				protectedCount: 0,
				unprotectedCount: 0,
				criticalUnprotectedCount: 0,
				attentionItems: [],
				computedAt: Date.now(),
			}),
			invalidateCache: vi.fn(),
		} as any;

		// Mock AI risk service
		mockAIRiskService = {
			getCachedRisk: vi.fn().mockReturnValue(undefined),
		} as any;

		protectionService = new ProtectionService(
			mockRegistry,
			mockPolicyManager,
			mockAIRiskService,
			mockSetContext,
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Context Key Management", () => {
		it("should set protection status to 'unprotected' initially", async () => {
			await protectionService.auditRepo();

			expect(contextKeys.get("snapback.protectionStatus")).toBe("unprotected");
		});

		it("should set protection status to 'partial' when some files protected", async () => {
			vi.mocked(mockPolicyManager.computeRepoStatus).mockResolvedValue({
				status: "partial",
				protectedCount: 3,
				unprotectedCount: 2,
				criticalUnprotectedCount: 2,
				attentionItems: [],
				computedAt: Date.now(),
			});

			await protectionService.auditRepo();

			expect(contextKeys.get("snapback.protectionStatus")).toBe("partial");
		});

		it("should set protection status to 'complete' when all critical files protected", async () => {
			vi.mocked(mockPolicyManager.computeRepoStatus).mockResolvedValue({
				status: "complete",
				protectedCount: 10,
				unprotectedCount: 0,
				criticalUnprotectedCount: 0,
				attentionItems: [],
				computedAt: Date.now(),
			});

			await protectionService.auditRepo();

			expect(contextKeys.get("snapback.protectionStatus")).toBe("complete");
		});

		it("should update attention count based on audit results", async () => {
			const attentionItems = [
				{
					type: "unprotected_critical" as const,
					filePath: "/test/.env",
					message: "Environment: not protected (should be Block)",
					severity: "error" as const,
					action: "snapback.protectFile",
				},
				{
					type: "unprotected_critical" as const,
					filePath: "/test/package.json",
					message: "Dependencies: not protected (should be Block)",
					severity: "error" as const,
					action: "snapback.protectFile",
				},
			];

			vi.mocked(mockPolicyManager.computeRepoStatus).mockResolvedValue({
				status: "partial",
				protectedCount: 0,
				unprotectedCount: 2,
				criticalUnprotectedCount: 2,
				attentionItems,
				computedAt: Date.now(),
			});

			await protectionService.auditRepo();

			expect(contextKeys.get("snapback.attentionCount")).toBe(2);
		});
	});

	describe("Cache Invalidation Workflow", () => {
		it("should invalidate cache when protection state changes", () => {
			protectionService.invalidateAuditCache();

			expect(mockPolicyManager.invalidateCache).toHaveBeenCalled();
		});

		it("should force refresh when specified", async () => {
			await protectionService.auditRepo(true);

			expect(mockPolicyManager.computeRepoStatus).toHaveBeenCalledWith(true);
		});

		it("should use cache by default", async () => {
			await protectionService.auditRepo(false);

			expect(mockPolicyManager.computeRepoStatus).toHaveBeenCalledWith(false);
		});
	});

	describe("Full Workflow Integration", () => {
		it("should handle transition from unprotected to complete", async () => {
			// Step 1: Initial state - unprotected
			await protectionService.auditRepo();
			expect(contextKeys.get("snapback.protectionStatus")).toBe("unprotected");
			expect(contextKeys.get("snapback.attentionCount")).toBe(0);

			// Step 2: User protects some files - partial
			vi.mocked(mockPolicyManager.computeRepoStatus).mockResolvedValue({
				status: "partial",
				protectedCount: 2,
				unprotectedCount: 1,
				criticalUnprotectedCount: 1,
				attentionItems: [
					{
						type: "unprotected_critical",
						filePath: "/test/.env",
						message: "not protected",
						severity: "error",
					},
				],
				computedAt: Date.now(),
			});

			protectionService.invalidateAuditCache();
			await protectionService.auditRepo(true);

			expect(contextKeys.get("snapback.protectionStatus")).toBe("partial");
			expect(contextKeys.get("snapback.attentionCount")).toBe(1);

			// Step 3: User protects remaining files - complete
			vi.mocked(mockPolicyManager.computeRepoStatus).mockResolvedValue({
				status: "complete",
				protectedCount: 3,
				unprotectedCount: 0,
				criticalUnprotectedCount: 0,
				attentionItems: [],
				computedAt: Date.now(),
			});

			protectionService.invalidateAuditCache();
			await protectionService.auditRepo(true);

			expect(contextKeys.get("snapback.protectionStatus")).toBe("complete");
			expect(contextKeys.get("snapback.attentionCount")).toBe(0);
		});

		it("should handle detection of insufficiently protected files", async () => {
			vi.mocked(mockPolicyManager.computeRepoStatus).mockResolvedValue({
				status: "partial",
				protectedCount: 1,
				unprotectedCount: 1,
				criticalUnprotectedCount: 1,
				attentionItems: [
					{
						type: "unprotected_critical",
						filePath: "/test/.env",
						message: "Environment: protected at Watch, should be Block",
						severity: "warning",
						action: "snapback.setProtectionLevel",
					},
				],
				computedAt: Date.now(),
			});

			await protectionService.auditRepo();

			expect(contextKeys.get("snapback.protectionStatus")).toBe("partial");
			expect(contextKeys.get("snapback.attentionCount")).toBe(1);
		});
	});

	describe("Error Handling", () => {
		it("should not throw when audit fails", async () => {
			vi.mocked(mockPolicyManager.computeRepoStatus).mockRejectedValue(
				new Error("Audit failed"),
			);

			await expect(protectionService.auditRepo()).resolves.not.toThrow();
		});

		it("should not set context keys when audit fails", async () => {
			vi.mocked(mockPolicyManager.computeRepoStatus).mockRejectedValue(
				new Error("Audit failed"),
			);

			await protectionService.auditRepo();

			// Should not have called setContext
			expect(mockSetContext).not.toHaveBeenCalled();
		});
	});
});
