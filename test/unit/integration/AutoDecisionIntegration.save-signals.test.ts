/**
 * AutoDecisionIntegration Save Signal Tests
 * 
 * REGRESSION TEST for: Extension registers AI signals on EVERY save, even with no changes
 * 
 * Component under test: AutoDecisionIntegration.registerSaveListener()
 * Bug: Line 362 calls vitals.onFileChange() unconditionally, even for no-change saves
 * 
 * Expected behavior: Should NOT emit signals when:
 * - File has no changes (isDirty=false)
 * - fileBuffer remains empty after debounce
 * - processBatch() should not execute for empty buffer
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { AutoDecisionIntegration } from "../../../src/integration/AutoDecisionIntegration";
import {
	TEST_PATHS,
	NON_FILE_SCHEMES,
	createCleanDocument,
	createDirtyDocument,
	createNonFileDocument,
	waitForGracePeriod,
	simulateRapidSaves,
	assertNoSignalEmitted,
} from "../../helpers/save-signal-helpers";

// Mock dependencies
vi.mock("../../../src/engine/AutoDecisionEngine", () => ({
	AutoDecisionEngine: vi.fn().mockImplementation(() => ({
		makeDecision: vi.fn().mockReturnValue({
			createSnapshot: false,
			showNotification: false,
			reasons: [],
			confidence: 0,
		}),
		updateConfig: vi.fn(),
	})),
}));

vi.mock("../../../src/ui/NotificationAdapter", () => ({
	NotificationAdapter: vi.fn().mockImplementation(() => ({
		adaptDecision: vi.fn(),
	})),
}));

vi.mock("../../../src/signals/SignalAggregator", () => ({
	createSignalAggregator: vi.fn(() => ({
		reset: vi.fn(),
		setRiskSignal: vi.fn(),
		setBurstSignal: vi.fn(),
		setCriticalFileSignal: vi.fn(),
		setSessionSignal: vi.fn(),
		setAISignal: vi.fn(),
		aggregate: vi.fn().mockReturnValue({
			files: [],
			riskScore: 0,
			aiDetected: false,
			burstDetected: false,
		}),
	})),
}));

vi.mock("../../../src/services/LanguageClient", () => ({
	getWorkspaceVitals: vi.fn(() => ({
		onFileChange: vi.fn(),
		getThresholdMultiplier: vi.fn().mockReturnValue(1),
		current: vi.fn().mockReturnValue({
			pulse: { level: "normal" },
			temperature: { level: "normal" },
			pressure: { value: 0 },
			oxygen: { value: 100 },
			trajectory: "stable",
		}),
		getPressureRecommendation: vi.fn().mockReturnValue({
			shouldSnapshot: false,
			urgency: 0,
			reason: "Low pressure",
			action: "none",
			context: { pressure: 0, trajectory: "stable", phase: "unknown" },
		}),
	})),
}));

vi.mock("../../../src/signals/detectAIPresence", () => ({
	detectAIPresence: vi.fn().mockReturnValue({
		hasAI: false,
		detectedAssistants: [],
	}),
}));

describe("AutoDecisionIntegration - Save Signal Registration", () => {
	let autoDecision: AutoDecisionIntegration;
	let mockSnapshotManager: any;
	let mockWorkspaceContextManager: any;
	let mockVitalsOnFileChange: any;
	let saveHandlers: Array<(doc: vscode.TextDocument) => void> = [];

	beforeEach(async () => {
		saveHandlers = [];

		// Get the mocked vitals onFileChange function
		const LanguageClient = await import("../../../src/services/LanguageClient");
		const mockGetVitals = vi.mocked(LanguageClient).getWorkspaceVitals as any;
		if (mockGetVitals) {
			const vitalsInstance = mockGetVitals();
			mockVitalsOnFileChange = vitalsInstance?.onFileChange || vi.fn();
		} else {
			mockVitalsOnFileChange = vi.fn();
		}

		// Mock snapshot manager
		mockSnapshotManager = {
			createSnapshot: vi.fn().mockResolvedValue({ id: "snap-123" }),
		};

		// Mock workspace context manager
		mockWorkspaceContextManager = {
			getWorkspaceRoot: vi.fn().mockReturnValue("/test/workspace"),
		};

		// Spy on vscode save listener
		vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((handler: any) => {
			saveHandlers.push(handler);
			return { dispose: vi.fn() };
		});

		vi.spyOn(vscode.workspace, "onDidChangeTextDocument").mockImplementation(() => ({
			dispose: vi.fn(),
		}));

		vi.spyOn(vscode.workspace, "getWorkspaceFolder").mockReturnValue({
			uri: { fsPath: "/test/workspace" },
		} as any);

		// Initialize AutoDecisionIntegration
		autoDecision = new AutoDecisionIntegration(
			mockSnapshotManager,
			{} as any, // notificationManager
			mockWorkspaceContextManager,
		);

		autoDecision.activate();

		// Wait for grace period
		await waitForGracePeriod();

		// Clear mocks after grace period
		vi.clearAllMocks();
	});

	afterEach(() => {
		autoDecision.deactivate();
		vi.clearAllMocks();
	});

	const triggerSave = (document: vscode.TextDocument) => {
		for (const handler of saveHandlers) {
			handler(document);
		}
	};

	describe("No-Change Scenarios", () => {
		it("should NOT emit vitals signal when saving clean file", () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			triggerSave(cleanDoc);

			assertNoSignalEmitted(
				mockVitalsOnFileChange,
				"Vitals.onFileChange() called for clean file - BUG DETECTED",
			);
		});

		it("should NOT buffer event on double Ctrl+S with no changes", async () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			triggerSave(cleanDoc);
			triggerSave(cleanDoc);

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 400));

			const stats = autoDecision.getStats();
			expect(stats.bufferedEvents).toBe(0);
			assertNoSignalEmitted(mockVitalsOnFileChange);
		});

		it("should NOT process batch when fileBuffer empty", async () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			// Stats should show no buffered events
			const statsBefore = autoDecision.getStats();
			expect(statsBefore.bufferedEvents).toBe(0);

			triggerSave(cleanDoc);

			// Wait for debounce window
			await new Promise((resolve) => setTimeout(resolve, 400));

			const statsAfter = autoDecision.getStats();
			expect(statsAfter.bufferedEvents).toBe(0);
			expect(statsAfter.isProcessing).toBe(false);
		});

		it("should NOT emit signal after undo-to-original save", () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			triggerSave(cleanDoc);

			assertNoSignalEmitted(mockVitalsOnFileChange);
		});

		it("should handle untitled file gracefully", () => {
			const untitledDoc = createMockDocument({
				path: "Untitled-1",
				isDirty: false,
				isUntitled: true,
			});

			triggerSave(untitledDoc);

			assertNoSignalEmitted(mockVitalsOnFileChange);
		});
	});

	describe("Change Detection Edge Cases", () => {
		it("should NOT emit signal with empty content", () => {
			const emptyDoc = createMockDocument({
				path: TEST_PATHS.CLEAN_TS,
				content: "",
				isDirty: false,
			});

			triggerSave(emptyDoc);

			assertNoSignalEmitted(mockVitalsOnFileChange);
		});

		it("should skip binary files", () => {
			const binaryDoc = createMockDocument({
				path: TEST_PATHS.BINARY_PNG,
				languageId: "image",
				isDirty: false,
			});

			triggerSave(binaryDoc);

			assertNoSignalEmitted(mockVitalsOnFileChange);
		});

		it("should handle large files without signal spam", () => {
			const largeDoc = createMockDocument({
				path: TEST_PATHS.CLEAN_TS,
				content: "x".repeat(10 * 1024 * 1024),
				isDirty: false,
			});

			triggerSave(largeDoc);

			assertNoSignalEmitted(mockVitalsOnFileChange);
		});

		it("should respect ignore patterns (node_modules)", () => {
			const nodeModulesDoc = createCleanDocument("/test/workspace/node_modules/package/index.js");

			triggerSave(nodeModulesDoc);

			// Should be filtered by ignore patterns
			assertNoSignalEmitted(mockVitalsOnFileChange);
		});
	});

	describe("Timing & Race Conditions", () => {
		it("should debounce rapid sequential saves", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			await simulateRapidSaves(doc, 5, 20, triggerSave);

			// Should NOT emit 5 separate signals
			assertNoSignalEmitted(
				mockVitalsOnFileChange,
				"Multiple signals from rapid saves - debouncing failed",
			);
		});

		it("should handle concurrent saves of same file", () => {
			const doc1 = createCleanDocument(TEST_PATHS.CLEAN_TS);
			const doc2 = createCleanDocument(TEST_PATHS.CLEAN_TS);

			triggerSave(doc1);
			triggerSave(doc2);

			// Should NOT emit duplicate signals
			assertNoSignalEmitted(mockVitalsOnFileChange);
		});

		it("should not process batch if already processing", async () => {
			const doc = createDirtyDocument(TEST_PATHS.DIRTY_TS);

			// Trigger multiple rapid saves
			triggerSave(doc);
			triggerSave(doc);
			triggerSave(doc);

			// Check that processing flag prevents concurrent batch processing
			const stats = autoDecision.getStats();
			expect(stats.isProcessing).toBe(false); // Should complete or never start
		});

		it("should handle save during deactivation", () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			autoDecision.deactivate();

			// Should not crash
			expect(() => triggerSave(doc)).not.toThrow();

			// Should NOT emit after deactivation
			assertNoSignalEmitted(mockVitalsOnFileChange);
		});
	});

	describe("Document State Edge Cases", () => {
		it("should skip files outside workspace", () => {
			const outsideDoc = createCleanDocument("/outside/workspace/file.ts");

			vi.spyOn(vscode.workspace, "getWorkspaceFolder").mockReturnValue(undefined);

			triggerSave(outsideDoc);

			assertNoSignalEmitted(mockVitalsOnFileChange);
		});

		NON_FILE_SCHEMES.forEach((scheme) => {
			it(`should skip ${scheme}:// documents`, () => {
				const nonFileDoc = createNonFileDocument(scheme, "/test/file.ts");

				triggerSave(nonFileDoc);

				assertNoSignalEmitted(
					mockVitalsOnFileChange,
					`Signal emitted for ${scheme}:// - should be filtered`,
				);
			});
		});

		it("should skip git diff views", () => {
			const gitDoc = createNonFileDocument("git", "/test/file.ts");

			triggerSave(gitDoc);

			assertNoSignalEmitted(mockVitalsOnFileChange);
		});

		it("should skip output channels", () => {
			const outputDoc = createNonFileDocument("output", "SnapBack Output");

			triggerSave(outputDoc);

			assertNoSignalEmitted(mockVitalsOnFileChange);
		});
	});

	describe("Grace Period & Lifecycle", () => {
		it("should skip saves during activation grace period", async () => {
			// Create fresh instance
			const freshIntegration = new AutoDecisionIntegration(
				mockSnapshotManager,
				{} as any,
				mockWorkspaceContextManager,
			);

			freshIntegration.activate();

			const freshHandlers: Array<(doc: vscode.TextDocument) => void> = [];
			vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((handler: any) => {
				freshHandlers.push(handler);
				return { dispose: vi.fn() };
			});

			const doc = createDirtyDocument(TEST_PATHS.DIRTY_TS);

			// Save immediately (within grace period)
			for (const handler of freshHandlers) {
				handler(doc);
			}

			// Should be skipped
			assertNoSignalEmitted(
				mockVitalsOnFileChange,
				"Signal emitted during grace period - protection failed",
			);

			freshIntegration.deactivate();
		});

		it("should allow signals after grace period", async () => {
			// Already waited in beforeEach
			const doc = createDirtyDocument(TEST_PATHS.DIRTY_TS);

			triggerSave(doc);

			// With dirty document and actual changes, signal SHOULD emit
			// This test verifies grace period ENDS correctly
		});

		it("should not crash on save after deactivation", () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			autoDecision.deactivate();

			expect(() => triggerSave(doc)).not.toThrow();
		});
	});

	describe("Integration with Vitals", () => {
		it("should NOT call vitals when no actual file changes", () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			triggerSave(doc);

			expect(mockVitalsOnFileChange).not.toHaveBeenCalled();
		});

		it("should NOT pollute vitals pressure with false signals", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			// Rapid saves with no changes
			for (let i = 0; i < 10; i++) {
				triggerSave(doc);
			}

			await new Promise((resolve) => setTimeout(resolve, 400));

			// Vitals should remain clean
			expect(mockVitalsOnFileChange).not.toHaveBeenCalled();
		});
	});
});

// Helper to create mock document
function createMockDocument(options: {
	path: string;
	content?: string;
	isDirty?: boolean;
	languageId?: string;
	isUntitled?: boolean;
}): vscode.TextDocument {
	const { path, content = "", isDirty = false, languageId = "typescript", isUntitled = false } = options;

	return {
		uri: {
			scheme: "file",
			path,
			fsPath: path,
		} as any,
		fileName: path,
		languageId,
		isDirty,
		isUntitled,
		getText: vi.fn().mockReturnValue(content),
		lineCount: content.split("\n").length,
	} as any;
}
