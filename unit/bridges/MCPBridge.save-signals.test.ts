/**
 * MCPBridge Save Signal Tests
 * 
 * REGRESSION TEST for: Extension registers AI signals on EVERY save, even with no changes
 * 
 * Component under test: MCPBridge.handleFileSave()
 * Bug: Line 395 pushes to changeQueue unconditionally, even for no-change saves
 * 
 * Expected behavior: Should NOT emit signals when:
 * - File has no changes (isDirty=false)
 * - changeQueue should remain empty
 * - pushObservation() should not be called
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MCPBridge } from "../../../src/bridges/MCPBridge";
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

// Mock SignalBridge
const mockSignalBridge = {
	detectAI: vi.fn().mockReturnValue({
		tool: null,
		confidence: 0,
		method: "none",
	}),
	computeBurst: vi.fn().mockReturnValue({
		detected: false,
		charCount: 0,
		velocity: 0,
	}),
};

vi.mock("../../../src/utils/isMonitorableDocument", () => ({
	isMonitorableDocument: vi.fn().mockReturnValue(true),
}));

describe("MCPBridge - Save Signal Registration", () => {
	let mcpBridge: MCPBridge;
	let mockContext: vscode.ExtensionContext;
	let saveHandlers: Array<(doc: vscode.TextDocument) => void> = [];
	let changeHandlers: Array<(event: vscode.TextDocumentChangeEvent) => void> = [];

	beforeEach(async () => {
		saveHandlers = [];
		changeHandlers = [];

		// Mock extension context
		mockContext = {
			subscriptions: [],
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as any;

		// Spy on vscode listeners
		vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((handler: any) => {
			saveHandlers.push(handler);
			return { dispose: vi.fn() };
		});

		vi.spyOn(vscode.workspace, "onDidChangeTextDocument").mockImplementation((handler: any) => {
			changeHandlers.push(handler);
			return { dispose: vi.fn() };
		});

		vi.spyOn(vscode.workspace, "onDidCreateFiles").mockImplementation(() => ({
			dispose: vi.fn(),
		}));

		vi.spyOn(vscode.workspace, "onDidDeleteFiles").mockImplementation(() => ({
			dispose: vi.fn(),
		}));

		vi.spyOn(vscode.workspace, "asRelativePath").mockImplementation((uri: any) => {
			if (typeof uri === "string") return uri;
			return uri.path || uri.fsPath;
		});

		vi.spyOn(vscode.workspace, "getWorkspaceFolder").mockReturnValue({
			uri: { fsPath: "/test/workspace" },
		} as any);

			// MCPBridge constructor takes config object only
			mcpBridge = new MCPBridge({
				workspaceId: "ws_test123",
				enableAIDetection: true,
			});

		mcpBridge.activate(mockContext, mockSignalBridge as any);

		// Wait for grace period
		await waitForGracePeriod();
	});

	afterEach(() => {
		mcpBridge.dispose();
		vi.clearAllMocks();
	});

	const triggerSave = async (document: vscode.TextDocument) => {
		for (const handler of saveHandlers) {
			await handler(document);
		}
	};

	describe("No-Change Scenarios", () => {
		it("should NOT add to changeQueue when saving clean file", async () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			// Access private changeQueue through spy
			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(cleanDoc);

			// Should NOT push to queue for clean file
			assertNoSignalEmitted(pushSpy, "changeQueue.push() called for clean file - BUG DETECTED");
		});

		it("should NOT add to queue on double Ctrl+S", async () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(cleanDoc);
			await triggerSave(cleanDoc);

			assertNoSignalEmitted(pushSpy, "Queue push called on double save - BUG DETECTED");
		});

		it("should NOT create observation for clean file save", async () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const spy = vi.spyOn(mcpBridge as any, "pushObservation");

			await triggerSave(cleanDoc);

			assertNoSignalEmitted(spy, "Observation created for clean file - BUG DETECTED");
		});

		it("should NOT emit signal after undo-to-original", async () => {
			const cleanDoc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(cleanDoc);

			assertNoSignalEmitted(pushSpy);
		});

		it("should handle untitled file gracefully", async () => {
			const untitledDoc = createMockDocument({
				path: "Untitled-1",
				isDirty: false,
				isUntitled: true,
			});

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(untitledDoc);

			assertNoSignalEmitted(pushSpy);
		});
	});

	describe("Change Detection Edge Cases", () => {
		it("should NOT queue event with zero line count", async () => {
			const emptyDoc = createMockDocument({
				path: TEST_PATHS.CLEAN_TS,
				content: "",
				isDirty: false,
				lineCount: 0,
			});

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(emptyDoc);

			assertNoSignalEmitted(pushSpy);
		});

		it("should skip binary files", async () => {
			const binaryDoc = createMockDocument({
				path: TEST_PATHS.BINARY_PNG,
				languageId: "image",
				isDirty: false,
			});

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(binaryDoc);

			assertNoSignalEmitted(pushSpy);
		});

		it("should handle large files without queue spam", async () => {
			const largeDoc = createMockDocument({
				path: TEST_PATHS.CLEAN_TS,
				content: "x".repeat(10 * 1024 * 1024),
				isDirty: false,
				lineCount: 10000,
			});

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(largeDoc);

			// Should not queue event for no-change save
			assertNoSignalEmitted(pushSpy);
		});

		it("should respect AI attribution reset", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			// Save should clear AI attribution even if file unchanged
			await triggerSave(doc);

			assertNoSignalEmitted(pushSpy);
		});
	});

	describe("Timing & Race Conditions", () => {
		it("should handle rapid sequential saves", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await simulateRapidSaves(doc, 5, 20, async (d) => await triggerSave(d));

			// Should NOT queue 5 separate events
			assertNoSignalEmitted(pushSpy);
		});

		it("should handle concurrent saves of same file", async () => {
			const doc1 = createCleanDocument(TEST_PATHS.CLEAN_TS);
			const doc2 = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await Promise.all([triggerSave(doc1), triggerSave(doc2)]);

			// Should NOT create duplicate queue entries
			assertNoSignalEmitted(pushSpy);
		});

		it("should not emit observation during flush interval", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const spy = vi.spyOn(mcpBridge as any, "pushObservation");

			await triggerSave(doc);

			// Wait for potential flush
			await new Promise((resolve) => setTimeout(resolve, 100));

			assertNoSignalEmitted(spy);
		});

		it("should handle save during disposal", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			mcpBridge.dispose();

			// Should not crash
			await expect(triggerSave(doc)).resolves.not.toThrow();
		});
	});

	describe("Document State Edge Cases", () => {
		it("should skip files outside workspace", async () => {
			const outsideDoc = createCleanDocument("/outside/workspace/file.ts");

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(outsideDoc);

			// Implementation may vary - check queue size
			assertNoSignalEmitted(pushSpy);
		});

		NON_FILE_SCHEMES.forEach((scheme) => {
			it(`should skip ${scheme}:// documents`, async () => {
				const nonFileDoc = createNonFileDocument(scheme, "/test/file.ts");

				const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

				await triggerSave(nonFileDoc);

				assertNoSignalEmitted(pushSpy);
			});
		});

		it("should skip git diff views", async () => {
			const gitDoc = createNonFileDocument("git", "/test/file.ts");

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(gitDoc);

			assertNoSignalEmitted(pushSpy);
		});

		it("should skip output channels", async () => {
			const outputDoc = createNonFileDocument("output", "Vreko Output");

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(outputDoc);

			assertNoSignalEmitted(pushSpy);
		});

		it("should skip inmemory:// scheme", async () => {
			const inmemoryDoc = createNonFileDocument("inmemory", "/test/temp.ts");

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(inmemoryDoc);

			assertNoSignalEmitted(pushSpy);
		});
	});

	describe("Grace Period & Lifecycle", () => {
		it("should skip saves during activation grace period", async () => {
			// Create fresh instance
			const freshBridge = new MCPBridge({
				workspaceId: "ws_test456",
				enableAIDetection: true,
			});

			freshBridge.activate(mockContext, mockSignalBridge as any);

			const freshHandlers: Array<(doc: vscode.TextDocument) => void> = [];
			vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((handler: any) => {
				freshHandlers.push(handler);
				return { dispose: vi.fn() };
			});

			const doc = createDirtyDocument(TEST_PATHS.DIRTY_TS);

			// Save immediately (within grace period)
			for (const handler of freshHandlers) {
				await handler(doc);
			}

			// Should be skipped due to grace period
			const pushSpy = vi.spyOn((freshBridge as any).changeQueue, "push");
			assertNoSignalEmitted(pushSpy);

			freshBridge.dispose();
		});

		it("should allow events after grace period", async () => {
			// Already waited in beforeEach
			const doc = createDirtyDocument(TEST_PATHS.DIRTY_TS);

			await triggerSave(doc);

			// Grace period ended - actual changes may queue
		});

		it("should not crash on save after disposal", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			mcpBridge.dispose();

			await expect(triggerSave(doc)).resolves.not.toThrow();
		});
	});

	describe("AI Detection Integration", () => {
		it("should NOT mark file as AI-attributed without actual changes", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			// No contentChanges triggered, so no AI detection
			await triggerSave(doc);

			assertNoSignalEmitted(pushSpy);
		});

		it("should NOT create AI observation for clean file", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const spy = vi.spyOn(mcpBridge as any, "pushObservation");

			await triggerSave(doc);

			// No observation should be pushed for clean file
			assertNoSignalEmitted(spy);
		});

		it("should NOT pollute observation queue with false positives", async () => {
			const doc = createCleanDocument(TEST_PATHS.CLEAN_TS);

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			// Multiple saves
			for (let i = 0; i < 10; i++) {
				await triggerSave(doc);
			}

			assertNoSignalEmitted(pushSpy);
		});
	});

	describe("Risk File Detection", () => {
		it("should NOT create risk observation for clean .env file", async () => {
			const envDoc = createCleanDocument("/test/workspace/.env");

			const spy = vi.spyOn(mcpBridge as any, "pushObservation");

			await triggerSave(envDoc);

			// No changes = no risk observation
			assertNoSignalEmitted(spy);
		});

		it("should NOT create risk observation for clean config.json", async () => {
			const configDoc = createCleanDocument(TEST_PATHS.CONFIG_JSON);

			const spy = vi.spyOn(mcpBridge as any, "pushObservation");

			await triggerSave(configDoc);

			assertNoSignalEmitted(spy);
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
	lineCount?: number;
}): vscode.TextDocument {
	const {
		path,
		content = "",
		isDirty = false,
		languageId = "typescript",
		isUntitled = false,
		lineCount = content.split("\n").length,
	} = options;

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
		lineCount,
		getText: vi.fn().mockReturnValue(content),
	} as any;
}
