/**
 * IntelligenceService Tests
 *
 * RED-GREEN-REFACTOR: Tests for IntelligenceService adapter
 * that bridges @snapback/intelligence to VS Code extension.
 *
 * REPLACES: apps/vscode/src/stacks/stackDetection.ts
 * REPLACES: apps/vscode/src/stacks/stackProfiles.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const mocks = vi.hoisted(() => {
	// Create mock functions with implementations
	const mockIntelligenceInstance = {
		initialize: vi.fn(() => Promise.resolve()),
		getContext: vi.fn(() => Promise.resolve({ patterns: [], constraints: [], learnings: [] })),
		checkPatterns: vi.fn(() => Promise.resolve({ passed: true, violations: [], confidence: 1.0 })),
		validateCode: vi.fn(() => Promise.resolve({ passed: true, violations: [], confidence: 1.0 })),
		reportViolation: vi.fn(() => Promise.resolve({ count: 1, promoted: false })),
		getStats: vi.fn(() => ({ totalLearnings: 0, totalViolations: 0 })),
		dispose: vi.fn(() => Promise.resolve()),
	};

	const mockVitalsInstance = {
		getSnapshot: vi.fn(() => ({
			timestamp: Date.now(),
			pulse: { level: "resting", changesPerMinute: 0 },
			temperature: { level: "cold", aiPercentage: 0 },
			pressure: { value: 0, unsnapshotedChanges: 0, timeSinceLastSnapshot: 0, criticalFilesTouched: [] },
			oxygen: { value: 100, coveragePercentage: 100, staleSnapshots: 0 },
			trajectory: "stable",
		})),
		dispose: vi.fn(),
	};

	const mockDetectFrameworks = vi.fn(() => Promise.resolve([
		{ id: "nextjs", name: "Next.js", confidence: 0.95, category: "fullstack" },
		{ id: "typescript", name: "TypeScript", confidence: 1.0, category: "language" },
	]));

	const mockDetectPrimaryFramework = vi.fn(() => Promise.resolve({
		id: "nextjs", name: "Next.js", confidence: 0.95, category: "fullstack",
	}));

	const MockIntelligence = vi.fn(() => mockIntelligenceInstance);
	const MockWorkspaceVitals = vi.fn(() => mockVitalsInstance);

	return {
		mockIntelligenceInstance,
		mockVitalsInstance,
		mockDetectFrameworks,
		mockDetectPrimaryFramework,
		MockIntelligence,
		MockWorkspaceVitals,
	};
});

// Mock VS Code API before imports
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace", toString: () => "file:///test/workspace" },
				name: "test-workspace",
				index: 0,
			},
		],
	},
}));

// Mock @snapback/intelligence
vi.mock("@snapback/intelligence", () => ({
	Intelligence: mocks.MockIntelligence,
	detectFrameworks: mocks.mockDetectFrameworks,
	detectPrimaryFramework: mocks.mockDetectPrimaryFramework,
	WorkspaceVitals: mocks.MockWorkspaceVitals,
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import after mocks
import {
	getIntelligence,
	hasIntelligence,
	getIntelligenceWithSemantic,
	detectWorkspaceFrameworks,
	getPrimaryFramework,
	validateCode,
	detectPatterns,
	getVitals,
	reportViolation,
	getLearningStats,
	disposeAll,
	clearCache,
	type ExtensionIntelligenceOptions,
} from "../../../src/services/IntelligenceService";
import { Intelligence } from "@snapback/intelligence";

describe("IntelligenceService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearCache();
	});

	afterEach(() => {
		clearCache();
	});

	describe("happy path - core", () => {
		it("should get Intelligence instance for workspace", async () => {
			const intel = await getIntelligence();
			expect(intel).toBeDefined();
			expect(Intelligence).toHaveBeenCalledWith(expect.objectContaining({ rootDir: expect.stringContaining(".snapback") }));
		});

		it("should cache Intelligence instance", async () => {
			const intel1 = await getIntelligence();
			const intel2 = await getIntelligence();
			expect(intel1).toBe(intel2);
			expect(Intelligence).toHaveBeenCalledTimes(1);
		});

		it("should check if Intelligence available (non-throwing)", async () => {
			const result = await hasIntelligence();
			expect(result).toBe(true);
		});

		it("should get Intelligence with semantic search", async () => {
			const intel = await getIntelligenceWithSemantic();
			expect(intel).toBeDefined();
			expect(intel.initialize).toHaveBeenCalled();
		});
	});

	describe("happy path - framework detection", () => {
		it("should detect frameworks in workspace", async () => {
			const frameworks = await detectWorkspaceFrameworks();
			expect(frameworks).toHaveLength(2);
			expect(frameworks[0]).toMatchObject({ id: "nextjs", confidence: 0.95 });
			// Verify called with context object (has filePaths property)
			expect(mocks.mockDetectFrameworks).toHaveBeenCalledWith(
				expect.objectContaining({ filePaths: expect.any(Array) }),
			);
		});

		it("should get primary framework", async () => {
			const primary = await getPrimaryFramework();
			expect(primary).toMatchObject({ id: "nextjs", confidence: 0.95 });
			// Verify called with context object (has filePaths property)
			expect(mocks.mockDetectPrimaryFramework).toHaveBeenCalledWith(
				expect.objectContaining({ filePaths: expect.any(Array) }),
			);
		});
	});

	describe("happy path - validation", () => {
		it("should validate code through Intelligence", async () => {
			const result = await validateCode('console.log("test");', "src/test.ts");
			expect(result).toMatchObject({ passed: true, violations: [] });
		});

		it("should detect patterns in code", async () => {
			const result = await detectPatterns('console.log("debug");', "src/test.ts");
			expect(result).toMatchObject({ passed: true });
		});
	});

	describe("happy path - vitals", () => {
		it("should get vitals snapshot", async () => {
			const vitals = await getVitals();
			expect(vitals).toBeDefined();
			expect(vitals).toMatchObject({
				pulse: expect.objectContaining({ level: expect.any(String) }),
				trajectory: expect.any(String),
			});
		});
	});

	describe("happy path - learning", () => {
		it("should report violations", async () => {
			await reportViolation({
				type: "test-violation",
				file: "src/test.ts",
				message: "Test",
				reason: "Testing violation reporting",
				prevention: "Use proper testing patterns",
			});
			const intel = await getIntelligence();
			expect(intel.reportViolation).toHaveBeenCalled();
		});

		it("should get learning statistics", async () => {
			const stats = await getLearningStats();
			expect(stats).toBeDefined();
		});
	});

	describe("sad path - error handling", () => {
		it("should throw error when no workspace open", async () => {
			const vscodeModule = await import("vscode");
			const original = vscodeModule.workspace.workspaceFolders;
			(vscodeModule.workspace as any).workspaceFolders = undefined;
			await expect(getIntelligence()).rejects.toThrow("No workspace folder open");
			(vscodeModule.workspace as any).workspaceFolders = original;
		});

		it("should return empty array for framework detection without workspace", async () => {
			const vscodeModule = await import("vscode");
			const original = vscodeModule.workspace.workspaceFolders;
			(vscodeModule.workspace as any).workspaceFolders = undefined;
			const frameworks = await detectWorkspaceFrameworks();
			expect(frameworks).toEqual([]);
			(vscodeModule.workspace as any).workspaceFolders = original;
		});

		it("should handle framework detection errors gracefully", async () => {
			mocks.mockDetectFrameworks.mockRejectedValueOnce(new Error("Detection failed"));
			const frameworks = await detectWorkspaceFrameworks();
			expect(frameworks).toEqual([]);
		});
	});

	describe("lifecycle", () => {
		it("should dispose all Intelligence instances", async () => {
			const intel = await getIntelligence();
			await disposeAll();
			expect(intel.dispose).toHaveBeenCalled();
		});

		it("should clear cache and allow fresh instances", async () => {
			await getIntelligence();
			expect(mocks.MockIntelligence).toHaveBeenCalledTimes(1);
			clearCache();
			await getIntelligence();
			// After clearing cache, a new Intelligence instance should be created
			expect(mocks.MockIntelligence).toHaveBeenCalledTimes(2);
		});
	});

	describe("configuration", () => {
		it("should use .snapback directory in workspace", async () => {
			await getIntelligence();
			expect(Intelligence).toHaveBeenCalledWith(expect.objectContaining({ rootDir: "/test/workspace/.snapback" }));
		});

		it("should have sensible defaults", async () => {
			await getIntelligence();
			expect(Intelligence).toHaveBeenCalledWith(expect.objectContaining({
				enableSemanticSearch: false,
				enableLearningLoop: true,
				enableAutoPromotion: true,
			}));
		});
	});
});
