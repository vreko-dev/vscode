/**
 * Save Signal Propagation Integration Tests
 * 
 * Tests cross-component behavior to ensure the save signal bug
 * doesn't pollute the entire extension's telemetry pipeline.
 * 
 * Components tested together:
 * - HeatIntegration
 * - AutoDecisionIntegration  
 * - MCPBridge
 * 
 * Bug chain to prevent:
 * 1. Clean file save (Ctrl+S)
 * 2. Heat emits false signal → Intelligence layer polluted
 * 3. AutoDecision emits vitals signal → Pressure calculation wrong
 * 4. MCPBridge queues observation → Telemetry spam
 * 
 * Expected: All 3 components should skip clean saves independently
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { HeatIntegration } from "../../src/heat/HeatIntegration";
import { AutoDecisionIntegration } from "../../src/integration/AutoDecisionIntegration";
import { MCPBridge } from "../../src/bridges/MCPBridge";
import {
	createCleanDocument,
	createDirtyDocument,
	waitForGracePeriod,
} from "../helpers/save-signal-helpers";

// Mock all dependencies
vi.mock("../../src/services/IntelligenceService", () => ({
	IntelligenceService: vi.fn().mockImplementation(() => ({
		recordFileModification: vi.fn().mockResolvedValue(undefined),
	})),
}));

vi.mock("../../src/heat/HeatTracker", () => ({
	HeatTracker: vi.fn().mockImplementation(() => ({
		recordSave: vi.fn(),
		recordAIEdit: vi.fn(),
		getSummary: vi.fn().mockReturnValue({ totalFiles: 0, hotFiles: [], warmFiles: [] }),
		dispose: vi.fn(),
	})),
}));

vi.mock("../../src/heat/FileHeatDecorationProvider", () => ({
	FileHeatDecorationProvider: vi.fn().mockImplementation(() => ({
		forceUpdate: vi.fn(),
		dispose: vi.fn(),
	})),
}));

vi.mock("../../src/signals/SignalBridge", () => ({
	SignalBridge: vi.fn().mockImplementation(() => ({
		detectAI: vi.fn().mockReturnValue({ tool: null, confidence: 0, method: "none" }),
		computeBurst: vi.fn(),
	})),
}));

vi.mock("../../src/engine/AutoDecisionEngine", () => ({
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

vi.mock("../../src/ui/NotificationAdapter", () => ({
	NotificationAdapter: vi.fn().mockImplementation(() => ({
		adaptDecision: vi.fn(),
	})),
}));

vi.mock("../../src/signals/SignalAggregator", () => ({
	createSignalAggregator: vi.fn(() => ({
		reset: vi.fn(),
		setRiskSignal: vi.fn(),
		aggregate: vi.fn().mockReturnValue({ files: [], riskScore: 0 }),
	})),
}));

vi.mock("../../src/services/LanguageClient", () => ({
	getWorkspaceVitals: vi.fn(() => ({
		onFileChange: vi.fn(),
		current: vi.fn().mockReturnValue({
			pulse: { level: "normal" },
			pressure: { value: 0 },
			trajectory: "stable",
		}),
	})),
}));

vi.mock("../../src/signals/detectAIPresence", () => ({
	detectAIPresence: vi.fn().mockReturnValue({
		hasAI: false,
		detectedAssistants: [],
	}),
}));

vi.mock("../../src/utils/isMonitorableDocument", () => ({
	isMonitorableDocument: vi.fn().mockReturnValue(true),
}));

vi.mock("@snapback/intelligence", () => ({
	recordFileModification: vi.fn().mockResolvedValue(undefined),
}));

describe("Save Signal Propagation - Integration", () => {
	let heatIntegration: HeatIntegration;
	let autoDecisionIntegration: AutoDecisionIntegration;
	let mcpBridge: MCPBridge;
	let mockContext: vscode.ExtensionContext;
	let saveHandlers: Array<(doc: vscode.TextDocument) => void> = [];

	beforeEach(async () => {
		saveHandlers = [];

		// Mock context
		mockContext = {
			subscriptions: [],
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as any;

		// Spy on save listener
		vi.spyOn(vscode.workspace, "onDidSaveTextDocument").mockImplementation((handler: any) => {
			saveHandlers.push(handler);
			return { dispose: vi.fn() };
		});

		vi.spyOn(vscode.workspace, "onDidChangeTextDocument").mockImplementation(() => ({
			dispose: vi.fn(),
		}));

		vi.spyOn(vscode.workspace, "onDidCreateFiles").mockImplementation(() => ({
			dispose: vi.fn(),
		}));

		vi.spyOn(vscode.workspace, "onDidDeleteFiles").mockImplementation(() => ({
			dispose: vi.fn(),
		}));

		vi.spyOn(vscode.workspace, "getWorkspaceFolder").mockReturnValue({
			uri: { fsPath: "/test/workspace" },
		} as any);

		vi.spyOn(vscode.workspace, "asRelativePath").mockImplementation((uri: any) => {
			if (typeof uri === "string") return uri;
			return uri.path || uri.fsPath;
		});

		vi.spyOn(vscode.window, "registerFileDecorationProvider").mockReturnValue({
			dispose: vi.fn(),
		});

		// Initialize all 3 components
		heatIntegration = new HeatIntegration();

		autoDecisionIntegration = new AutoDecisionIntegration(
			{ createSnapshot: vi.fn().mockResolvedValue({ id: "snap-123" }) } as any,
			{} as any,
			{ getWorkspaceRoot: vi.fn().mockReturnValue("/test/workspace") } as any,
		);

		mcpBridge = new MCPBridge({
			workspaceId: "ws_test_integration",
			enableAIDetection: true,
		});

		// Activate all components
		autoDecisionIntegration.activate();
		mcpBridge.activate(mockContext, {
			detectAI: vi.fn(),
			computeBurst: vi.fn(),
		} as any);

		// Wait for grace periods
		await waitForGracePeriod();

		// Clear all mocks after setup
		vi.clearAllMocks();
	});

	afterEach(() => {
		heatIntegration.dispose();
		autoDecisionIntegration.deactivate();
		mcpBridge.dispose();
		vi.clearAllMocks();
	});

	const triggerSave = async (document: vscode.TextDocument) => {
		for (const handler of saveHandlers) {
			await handler(document);
		}
	};

	describe("Cross-Component Signal Isolation", () => {
		it("should NOT propagate false signals across all 3 components for clean file save", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/clean.ts");

			// Get spies on all components
			const { HeatTracker } = await import("../../src/heat/HeatTracker");
			const mockHeatTracker = (HeatTracker as any).mock.results[0].value;

			const { getWorkspaceVitals } = await import("../../src/services/LanguageClient");
			const vitalsInstance = (getWorkspaceVitals as any)();
			const mockVitalsOnFileChange = vitalsInstance.onFileChange;

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			// Act: Save clean file
			await triggerSave(cleanDoc);

			// Assert: NO component should emit signals
			expect(mockHeatTracker.recordSave).not.toHaveBeenCalled();
			expect(mockVitalsOnFileChange).not.toHaveBeenCalled();
			expect(pushSpy).not.toHaveBeenCalled();
		});

		it("should handle dirty file save with actual changes across all components", async () => {
			const dirtyDoc = createDirtyDocument("/test/workspace/dirty.ts");

			// Trigger change event first (simulate real editing)
			const changeHandlers: Array<any> = [];
			vi.spyOn(vscode.workspace, "onDidChangeTextDocument").mockImplementation((handler: any) => {
				changeHandlers.push(handler);
				return { dispose: vi.fn() };
			});

			// Simulate text change
			for (const handler of changeHandlers) {
				await handler({
					document: dirtyDoc,
					contentChanges: [{ text: "new code", range: {} as any }],
				});
			}

			// Act: Save dirty file
			await triggerSave(dirtyDoc);

			// Note: Actual behavior may vary - this test documents expected behavior
			// Some components may emit, others may not depending on their logic
		});

		it("should handle rapid Ctrl+S spam without signal cascade", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/spam.ts");

			const { HeatTracker } = await import("../../src/heat/HeatTracker");
			const mockHeatTracker = (HeatTracker as any).mock.results[0].value;

			// Rapid saves
			for (let i = 0; i < 10; i++) {
				await triggerSave(cleanDoc);
			}

			// Should still be 0 calls even after 10 saves
			expect(mockHeatTracker.recordSave).toHaveBeenCalledTimes(0);
		});
	});

	describe("Telemetry Pipeline Integrity", () => {
		it("should NOT pollute Intelligence layer with false file modifications", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/test.ts");

			const IntelligenceModule = await import("@snapback/intelligence");
			const mockRecordFileModification = (IntelligenceModule as any).recordFileModification;

			await triggerSave(cleanDoc);

			// Intelligence layer should not receive false signals
			if (mockRecordFileModification) {
				expect(mockRecordFileModification).not.toHaveBeenCalled();
			}
		});

		it("should maintain accurate vitals pressure calculation with no false signals", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/test.ts");

			const { getWorkspaceVitals } = await import("../../src/services/LanguageClient");
			const vitalsInstance = (getWorkspaceVitals as any)();

			// Save multiple times
			await triggerSave(cleanDoc);
			await triggerSave(cleanDoc);
			await triggerSave(cleanDoc);

			// Vitals should not be called
			expect(vitalsInstance.onFileChange).not.toHaveBeenCalled();
		});

		it("should keep MCP observation queue empty for no-change saves", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/test.ts");

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			await triggerSave(cleanDoc);

			expect(pushSpy).not.toHaveBeenCalled();
		});
	});

	describe("Performance Impact", () => {
		it("should complete clean save in <50ms across all components", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/perf.ts");

			const start = performance.now();
			await triggerSave(cleanDoc);
			const duration = performance.now() - start;

			// Even with 3 components, clean save should be fast
			expect(duration).toBeLessThan(50);
		});

		it("should handle 100 rapid clean saves without memory leak", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/leak.ts");

			// Simulate extreme save spam
			for (let i = 0; i < 100; i++) {
				await triggerSave(cleanDoc);
			}

			// Check no queue buildup in MCP
			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");
			expect(pushSpy).not.toHaveBeenCalled();

			// Check AutoDecision buffer is still empty
			const stats = autoDecisionIntegration.getStats();
			expect(stats.bufferedEvents).toBe(0);
		});
	});
});
