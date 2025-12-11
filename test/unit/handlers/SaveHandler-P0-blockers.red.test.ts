/**
 * @fileoverview P0 Blocker Tests for SaveHandler (RED PHASE)
 *
 * Tests that FAIL until P0 fixes are implemented
 *
 * Coverage:
 * 1. Error boundary for analyzeAndPublish()
 * 2. Safe default protection fallback
 * 3. Error telemetry tracking
 *
 * @see error_spec.md - SaveHandler Error Boundary (45 min)
 * @see TDD_CORE.md - Phase 1 (RED)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SaveHandler } from "@vscode/handlers/SaveHandler";
import { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";

// Mock all SaveHandler dependencies at module level (hoisted)
vi.mock("../../../src/handlers/AnalysisCoordinator.js", () => ({
	AnalysisCoordinator: vi.fn().mockImplementation(() => ({
		analyzeAndPublish: vi.fn(async () => undefined),
		dispose: vi.fn(),
		lastAnalysisResult: null,
	})),
}));

vi.mock("../../../src/handlers/ProtectionLevelHandler.js", () => ({
	ProtectionLevelHandler: vi.fn().mockImplementation(() => ({
		handleProtectionLevel: vi.fn(async () => ({
			shouldSnapshot: false,
			reason: "test",
			snapshotId: undefined,
		})),
		applyDecision: vi.fn(async () => undefined),
		handleSnapshot: vi.fn(async () => "snap-123"),
	})),
}));

vi.mock("../../../src/services/CooldownService.js", () => ({
	CooldownService: vi.fn().mockImplementation(() => ({
		setCooldownIndicator: vi.fn(),
		clearAll: vi.fn(),
	})),
}));

vi.mock("../../../src/services/AuditLogger.js", () => ({
	AuditLogger: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../../../src/ui/AIWarningManager.js", () => ({
	AIWarningManager: vi.fn().mockImplementation(() => ({
		showWarning: vi.fn(async () => ({ success: false, error: new Error("test") })),
	})),
	shouldWarn: vi.fn(() => false),
}));

vi.mock("../../../src/ai/AIRiskService.js", () => ({
	NoopAIRiskService: vi.fn().mockImplementation(() => ({})),
}));

describe("SaveHandler P0 Blockers - RED PHASE", () => {
	let saveHandler: SaveHandler;
	let registry: ProtectedFileRegistry;
	let mockOperationCoordinator: any;
	let mockTelemetryProxy: any;
	let mockContext: any;
	let mockStorage: Map<string, any>;

	beforeEach(async () => {
		vi.clearAllMocks();

		// Create proper storage mock
		mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		// Create real registry
		registry = new ProtectedFileRegistry(mockState as any);

		// Create mock operation coordinator
		mockOperationCoordinator = {
			coordinateSnapshotCreation: vi.fn(async () => "snap-123"),
		};

		// Create mock telemetry proxy
		mockTelemetryProxy = {
			trackEvent: vi.fn(),
		};

		// Create mock context
		mockContext = {
			subscriptions: [],
			globalState: {
				update: vi.fn(),
				get: vi.fn(),
			},
		};

		// Create SaveHandler
		saveHandler = new SaveHandler(
			registry,
			mockOperationCoordinator,
			mockContext,
			mockTelemetryProxy
		);
	});

	afterEach(async () => {
		saveHandler.dispose();
		vi.restoreAllMocks();
	});

	describe("Blocker #1: analyzeAndPublish Error Boundary", () => {
		it("should catch analyzeAndPublish errors and apply safe default protection", async () => {
			// ARRANGE
			const filePath = "/test/protected-file.ts";
			const filename = "protected-file.ts";
			const preSaveContent = "const x = 1;";

			// Mock AnalysisCoordinator to throw an error
			const mockAnalysisCoordinator = (saveHandler as any).analysisCoordinator;
			vi.spyOn(mockAnalysisCoordinator, "analyzeAndPublish").mockRejectedValueOnce(
				new Error("API connection failed")
			);

			// Mock ProtectionLevelHandler to track what decision is applied
			const mockProtectionLevelHandler = (saveHandler as any).protectionLevelHandler;
			const applySpy = vi.spyOn(mockProtectionLevelHandler, "applyDecision");

			const mockDocument = {
				uri: vscode.Uri.file(filePath),
				getText: vi.fn().mockReturnValue("const x = 1;"),
				fileName: filename,
				isDirty: false,
				version: 1,
			} as any;

			// ACT - Call the protected file save handler
			await (saveHandler as any).executeProtectedFileSave(
				filePath,
				preSaveContent,
				mockDocument
			);

			// ASSERT
			// 1. Error should be caught (no throw)
			expect(true).toBe(true);

			// 2. Should track error event
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"error.analysis_failed",
				expect.objectContaining({
					errorType: expect.any(String),
				})
			);

			// 3. Should apply safe default protection (WARN level)
			expect(applySpy).toHaveBeenCalled();
			const callArgs = applySpy.mock.calls[applySpy.mock.calls.length - 1];
			const decision = callArgs[0] as any;
			expect(decision.action).toBe("warn");
			expect(decision.createSnapshot).toBe(true);
		});

		it("should show user-friendly notification on analysis failure", async () => {
			// ARRANGE
			const filePath = "/test/protected-file.ts";
			const mockAnalysisCoordinator = (saveHandler as any).analysisCoordinator;
			vi.spyOn(mockAnalysisCoordinator, "analyzeAndPublish").mockRejectedValueOnce(
				new Error("Network timeout")
			);

			const mockDocument = {
				uri: vscode.Uri.file(filePath),
				getText: vi.fn().mockReturnValue("const x = 1;"),
				fileName: "protected-file.ts",
			} as any;

			const showWarningMessageSpy = vi.spyOn(vscode.window, "showWarningMessage");

			// ACT
			await (saveHandler as any).executeProtectedFileSave(
				filePath,
				"const x = 1;",
				mockDocument
			);

			// ASSERT
			expect(showWarningMessageSpy).toHaveBeenCalledWith(
				expect.stringContaining("Code analysis unavailable")
			);
		});

		it("should not lose work - save should complete even if analysis fails", async () => {
			// ARRANGE
			const filePath = "/test/protected-file.ts";
			const mockAnalysisCoordinator = (saveHandler as any).analysisCoordinator;
			vi.spyOn(mockAnalysisCoordinator, "analyzeAndPublish").mockRejectedValueOnce(
				new Error("Analysis failed")
			);

			const mockDocument = {
				uri: vscode.Uri.file(filePath),
				getText: vi.fn().mockReturnValue("const y = 2;"),
				fileName: "protected-file.ts",
			} as any;

			// ACT & ASSERT - Should not throw
			let threwError = false;
			try {
				await (saveHandler as any).executeProtectedFileSave(
					filePath,
					"const x = 1;",
					mockDocument
				);
			} catch (error) {
				threwError = true;
			}

			expect(threwError).toBe(false);
		});
	});

	describe("Safe Default Protection Fallback (WARN level)", () => {
		it("should create snapshot with WARN decision on analysis failure", async () => {
			// ARRANGE
			const filePath = "/test/protected-file.ts";
			const mockAnalysisCoordinator = (saveHandler as any).analysisCoordinator;
			vi.spyOn(mockAnalysisCoordinator, "analyzeAndPublish").mockRejectedValueOnce(
				new Error("API error")
			);

			const mockDocument = {
				uri: vscode.Uri.file(filePath),
				getText: vi.fn().mockReturnValue("code"),
				fileName: "protected-file.ts",
			} as any;

			// Mock ProtectionLevelHandler to track applyDecision
			const mockProtectionLevelHandler = (saveHandler as any).protectionLevelHandler;
			const applyDecisionSpy = vi.spyOn(mockProtectionLevelHandler, "applyDecision");

			// ACT
			await (saveHandler as any).executeProtectedFileSave(
				filePath,
				"code",
				mockDocument
			);

			// ASSERT
			expect(applyDecisionSpy).toHaveBeenCalled();
			const decision = applyDecisionSpy.mock.calls[0][0] as any;
			expect(decision.action).toBe("warn");
			expect(decision.createSnapshot).toBe(true);
		});
	});

	describe("Error Telemetry (4-path coverage)", () => {
		it("[HAPPY] should not track analysis errors on success", async () => {
			// ARRANGE - Mock successful analysis
			const mockAnalysisCoordinator = (saveHandler as any).analysisCoordinator;
			vi.spyOn(mockAnalysisCoordinator, "analyzeAndPublish").mockResolvedValueOnce({
				analysis: { score: 10, severity: "low" },
				shouldBlock: false,
			});

			const mockDocument = {
				uri: vscode.Uri.file("/test/file.ts"),
				getText: vi.fn().mockReturnValue("const x = 1;"),
				fileName: "file.ts",
			} as any;

			// ACT
			await (saveHandler as any).executeProtectedFileSave(
				"/test/file.ts",
				"const x = 1;",
				mockDocument
			);

			// ASSERT - Should not track error.analysis_failed
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalledWith(
				"error.analysis_failed",
				expect.anything()
			);
		});

		it("[SAD] should track analysis error on network timeout", async () => {
			// ARRANGE
			const mockAnalysisCoordinator = (saveHandler as any).analysisCoordinator;
			vi.spyOn(mockAnalysisCoordinator, "analyzeAndPublish").mockRejectedValueOnce(
				new TypeError("Failed to fetch")
			);

			const mockDocument = {
				uri: vscode.Uri.file("/test/file.ts"),
				getText: vi.fn().mockReturnValue("code"),
				fileName: "file.ts",
			} as any;

			// ACT
			await (saveHandler as any).executeProtectedFileSave(
				"/test/file.ts",
				"code",
				mockDocument
			);

			// ASSERT
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"error.analysis_failed",
				expect.objectContaining({
					errorType: "TypeError",
				})
			);
		});

		it("[EDGE] should handle unknown error type gracefully", async () => {
			// ARRANGE
			const mockAnalysisCoordinator = (saveHandler as any).analysisCoordinator;
			vi.spyOn(mockAnalysisCoordinator, "analyzeAndPublish").mockRejectedValueOnce(
				"String error" // Non-Error object
			);

			const mockDocument = {
				uri: vscode.Uri.file("/test/file.ts"),
				getText: vi.fn().mockReturnValue("code"),
				fileName: "file.ts",
			} as any;

			// ACT
			await (saveHandler as any).executeProtectedFileSave(
				"/test/file.ts",
				"code",
				mockDocument
			);

			// ASSERT
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"error.analysis_failed",
				expect.objectContaining({
					errorType: "unknown",
				})
			);
		});

		it("[ERROR] should track API errors with error type information", async () => {
			// ARRANGE
			const mockAnalysisCoordinator = (saveHandler as any).analysisCoordinator;
			const customError = new Error("API Rate Limited");
			customError.name = "RateLimitError";

			vi.spyOn(mockAnalysisCoordinator, "analyzeAndPublish").mockRejectedValueOnce(
				customError
			);

			const mockDocument = {
				uri: vscode.Uri.file("/test/file.ts"),
				getText: vi.fn().mockReturnValue("code"),
				fileName: "file.ts",
			} as any;

			// ACT
			await (saveHandler as any).executeProtectedFileSave(
				"/test/file.ts",
				"code",
				mockDocument
			);

			// ASSERT
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"error.analysis_failed",
				expect.objectContaining({
					errorType: "RateLimitError",
				})
			);
		});
	});
});
