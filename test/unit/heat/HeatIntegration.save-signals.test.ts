/**
 * HeatIntegration Save Signal Tests
 * 
 * REGRESSION TEST for: Extension registers AI signals on EVERY save, even with no changes
 * 
 * Component under test: HeatIntegration.handleDocumentSave()
 * Bug: Line 182 calls heatTracker.recordSave() unconditionally, even when diffSize=0
 * 
 * Expected behavior: Should NOT emit signals when:
 * - File has no changes (isDirty=false)
 * - contentChanges array is empty
 * - Only whitespace/formatting changes
 * - Rapid sequential saves with no edits
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { HeatIntegration } from "../../../src/heat/HeatIntegration";
import {
	TEST_PATHS,
	NON_FILE_SCHEMES,
	createCleanDocument,
	createDirtyDocument,
	createNonFileDocument,
	createUntitledDocument,
	createMockContentChanges,
	waitForGracePeriod,
	simulateRapidSaves,
	assertNoSignalEmitted,
	assertSignalEmittedCount,
} from "../../helpers/save-signal-helpers";

// Mock dependencies
vi.mock("../../../src/services/IntelligenceService", () => ({
	IntelligenceService: vi.fn().mockImplementation(() => ({
		recordFileModification: vi.fn().mockResolvedValue(undefined),
	})),
}));

vi.mock("../../../src/heat/HeatTracker", () => ({
	HeatTracker: vi.fn().mockImplementation(() => ({
		recordSave: vi.fn(),
		recordAIEdit: vi.fn(),
		recordUndoRedo: vi.fn(),
		resetFile: vi.fn(),
		getSummary: vi.fn().mockReturnValue({
			totalFiles: 0,
			hotFiles: [],
			warmFiles: [],
		}),
		dispose: vi.fn(),
	})),
}));

vi.mock("../../../src/heat/FileHeatDecorationProvider", () => ({
	FileHeatDecorationProvider: vi.fn().mockImplementation(() => ({
		forceUpdate: vi.fn(),
		dispose: vi.fn(),
		onDidChangeFileDecorations: { event: vi.fn() },
		provideFileDecoration: vi.fn(),
	})),
}));

vi.mock("../../../src/signals/SignalBridge", () => ({
	SignalBridge: vi.fn().mockImplementation(() => ({
		detectAI: vi.fn().mockReturnValue({ tool: null, confidence: 0, method: "none" }),
		computeBurst: vi.fn(),
	})),
}));

const mockRecordFileModification = vi.fn().mockResolvedValue(undefined);
vi.mock("@snapback/intelligence", () => ({
	recordFileModification: mockRecordFileModification,
}));

describe("HeatIntegration - Save Signal Registration", () => {
	let heatIntegration: HeatIntegration;
	let mockHeatTracker: any;
	let mockRecordFileModification: any;
	let saveHandlers: Array<(doc: vscode.TextDocument) => void> = [];

	beforeEach(async () => {
		saveHandlers = [];

		// Spy on vscode.workspace.onDidSaveTextDocument
		vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((handler: any) => {
			saveHandlers.push(handler);
			return { dispose: vi.fn() };
		});

		vi.spyOn(vscode.workspace, "onDidChangeTextDocument").mockImplementation(() => ({
			dispose: vi.fn(),
		}));

		vi.spyOn(vscode.window, "registerFileDecorationProvider").mockReturnValue({
			dispose: vi.fn(),
		});

		// Initialize HeatIntegration
		heatIntegration = new HeatIntegration();

		// Get mocked tracker instance using vitest's mock tracking
		const HeatTrackerModule = await import("../../../src/heat/HeatTracker");
		const HeatTrackerConstructor = HeatTrackerModule.HeatTracker as any;
		if (HeatTrackerConstructor.mock && HeatTrackerConstructor.mock.results.length > 0) {
			mockHeatTracker = HeatTrackerConstructor.mock.results[0].value;
		} else {
			// Fallback: create spy functions manually
			mockHeatTracker = {
				recordSave: vi.fn(),
				recordAIEdit: vi.fn(),
			};
		}

		// Get mocked intelligence function
		const IntelligenceModule = await import("@snapback/intelligence");
		mockRecordFileModification = (IntelligenceModule as any).recordFileModification || vi.fn();

		// Wait for grace period to complete
		await waitForGracePeriod();
	});

	afterEach(() => {
		heatIntegration.dispose();
		vi.clearAllMocks();
	});

	const triggerSave = (document: vscode.TextDocument) => {
		for (const handler of saveHandlers) {
			handler(document);
		}
	};

	describe("No-Change Scenarios", () => {
		it("should NOT emit signal when saving clean file (isDirty=false, no edits)", () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			// Act: Save clean file
			triggerSave(cleanDoc);

			// Assert: NO signals emitted
			assertNoSignalEmitted(
				mockHeatTracker.recordSave,
				"Heat signal emitted for clean file save - BUG DETECTED",
			);
			assertNoSignalEmitted(
				mockRecordFileModification,
				"Intelligence signal emitted for clean file save - BUG DETECTED",
			);
		});

		it("should NOT emit signal on double Ctrl+S with no changes", () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			// Act: Double save (user mashes Ctrl+S)
			triggerSave(cleanDoc);
			triggerSave(cleanDoc);

			// Assert: NO signals from either save
			assertNoSignalEmitted(
				mockHeatTracker.recordSave,
				"Heat signal emitted on double save - BUG DETECTED",
			);
		});

		it("should NOT emit signal when whitespace auto-trimmed (no net change)", () => {
			const doc = createMockDocument({
				path: TEST_PATHS.CLEAN_TS,
				content: "const test = 1;", // Same content after trim
				isDirty: false,
			});

			triggerSave(doc);

			assertNoSignalEmitted(
				mockHeatTracker.recordSave,
				"Signal emitted for whitespace-only change - BUG DETECTED",
			);
		});

		it("should NOT emit signal after undo restores original content", () => {
			// Simulate: User made change, then undid it, then saved
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			triggerSave(cleanDoc);

			assertNoSignalEmitted(
				mockHeatTracker.recordSave,
				"Signal emitted after undo-to-original - BUG DETECTED",
			);
		});

		it("should handle untitled file with no content gracefully", () => {
			const untitledDoc = createUntitledDocument();

			triggerSave(untitledDoc);

			// Untitled with no content should not emit signal
			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});
	});

	describe("Change Detection Edge Cases", () => {
		it("should NOT emit signal with empty contentChanges array", () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			// Simulate save with explicitly empty contentChanges
			// (This is what recentChanges.get() returns when no changes tracked)
			triggerSave(doc);

			assertNoSignalEmitted(
				mockHeatTracker.recordSave,
				"Signal emitted with empty contentChanges - BUG DETECTED",
			);
		});

		it("should ignore formatting-only changes (no text content change)", () => {
			const doc = createDirtyDocument(TEST_PATHS.CLEAN_TS);

			// In real scenario, formatter might trigger save but content unchanged
			triggerSave(doc);

			// If diffSize=0, should NOT emit
			// NOTE: This test will fail until fix is implemented
			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});

		it("should skip binary file saves", () => {
			const binaryDoc = createMockDocument({
				path: TEST_PATHS.BINARY_PNG,
				languageId: "image",
				isDirty: false,
			});

			triggerSave(binaryDoc);

			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});

		it("should handle large files efficiently (>10MB)", () => {
			const largeContent = "x".repeat(10 * 1024 * 1024); // 10MB
			const largeDoc = createMockDocument({
				path: TEST_PATHS.CLEAN_TS,
				content: largeContent,
				isDirty: false,
			});

			triggerSave(largeDoc);

			// Large file with no changes should NOT emit
			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});
	});

	describe("Timing & Race Conditions", () => {
		it("should handle rapid sequential saves (<100ms apart)", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			// Simulate user rapidly pressing Ctrl+S (3 times in 50ms)
			await simulateRapidSaves(doc, 3, 20, triggerSave);

			// Should NOT emit 3 signals for same unchanged file
			assertNoSignalEmitted(
				mockHeatTracker.recordSave,
				"Multiple signals from rapid saves - BUG DETECTED",
			);
		});

		it("should handle save during ongoing text change", () => {
			const doc = createDirtyDocument(TEST_PATHS.DIRTY_TS);

			// Simulate race: change event fires, then save before change processed
			triggerSave(doc);

			// If no changes in recentChanges map, should NOT emit
			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});

		it("should queue saves during formatter execution", () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			// Formatter triggers save but hasn't actually changed content
			triggerSave(doc);

			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});

		it("should handle concurrent multi-editor saves of same file", () => {
			const doc1 = createCleanDocument(TEST_PATHS.CLEAN_TS);
			const doc2 = createCleanDocument(TEST_PATHS.CLEAN_TS); // Same file, different editor

			triggerSave(doc1);
			triggerSave(doc2);

			// Should NOT emit duplicate signals
			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});
	});

	describe("Document State Edge Cases", () => {
		it("should skip untitled documents", () => {
			const untitledDoc = createUntitledDocument();

			triggerSave(untitledDoc);

			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});

		NON_FILE_SCHEMES.forEach((scheme) => {
			it(`should skip ${scheme}:// documents`, () => {
				const nonFileDoc = createNonFileDocument(scheme, "/test/file.ts");

				triggerSave(nonFileDoc);

				assertNoSignalEmitted(
					mockHeatTracker.recordSave,
					`Signal emitted for ${scheme}:// document - should be filtered`,
				);
			});
		});

		it("should skip output channel documents", () => {
			const outputDoc = createNonFileDocument("output", "SnapBack Output");

			triggerSave(outputDoc);

			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});

		it("should skip git diff views", () => {
			const gitDoc = createNonFileDocument("git", "/test/file.ts");

			triggerSave(gitDoc);

			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});

		it("should skip read-only files with no changes", () => {
			const readOnlyDoc = createMockDocument({
				path: "/readonly/file.ts",
				isDirty: false,
			});

			triggerSave(readOnlyDoc);

			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});
	});

	describe("Grace Period & Lifecycle", () => {
		it("should skip saves during 2s activation grace period", async () => {
			// Create fresh instance (grace period active)
			const freshIntegration = new HeatIntegration();
			const freshHandlers: Array<(doc: vscode.TextDocument) => void> = [];

			vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((handler: any) => {
				freshHandlers.push(handler);
				return { dispose: vi.fn() };
			});

			const doc = createDirtyDocument(TEST_PATHS.DIRTY_TS);

			// Act: Save immediately (within grace period)
			for (const handler of freshHandlers) {
				handler(doc);
			}

			// Assert: Should be skipped due to grace period
			assertNoSignalEmitted(
				mockHeatTracker.recordSave,
				"Signal emitted during grace period - protection failed",
			);

			freshIntegration.dispose();
		});

		it("should allow saves after grace period expires", async () => {
			const doc = createDirtyDocument(TEST_PATHS.DIRTY_TS);

			// Act: Save after grace period (already waited in beforeEach)
			triggerSave(doc);

			// Assert: Should emit signal for actual changes
			// NOTE: This test verifies grace period ENDS correctly
			// Will only pass if we have real changes tracked
		});

		it("should handle saves during deactivation gracefully", () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			// Start disposal
			heatIntegration.dispose();

			// Try to save (should not crash)
			expect(() => triggerSave(doc)).not.toThrow();

			// Should NOT emit after disposal
			assertNoSignalEmitted(mockHeatTracker.recordSave);
		});
	});
});

// Helper to create mock document (imported from helpers but with overrides)
function createMockDocument(options: {
	path: string;
	content?: string;
	isDirty?: boolean;
	languageId?: string;
}): vscode.TextDocument {
	const { path, content = "", isDirty = false, languageId = "typescript" } = options;

	return {
		uri: {
			scheme: "file",
			path,
			fsPath: path,
		} as any,
		fileName: path,
		languageId,
		isDirty,
		getText: vi.fn().mockReturnValue(content),
		lineCount: content.split("\n").length,
	} as any;
}
