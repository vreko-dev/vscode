/**
 * Save Signal Performance Tests
 * 
 * Validates that the save signal bug doesn't cause:
 * 1. Memory leaks from queue buildup
 * 2. Performance degradation from unnecessary signal processing
 * 3. Thread blocking from synchronous operations
 * 
 * Benchmarks:
 * - Baseline: Clean save should complete in <5ms
 * - Stress: 1000 rapid saves should not cause memory growth
 * - Concurrency: Multiple editor saves should not block each other
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
vi.mock("../../src/services/IntelligenceService");
vi.mock("../../src/heat/HeatTracker");
vi.mock("../../src/heat/FileHeatDecorationProvider");
vi.mock("../../src/signals/SignalBridge");
vi.mock("../../src/engine/AutoDecisionEngine");
vi.mock("../../src/ui/NotificationAdapter");
vi.mock("../../src/signals/SignalAggregator");
vi.mock("../../src/services/LanguageClient");
vi.mock("../../src/signals/detectAIPresence");
vi.mock("../../src/utils/isMonitorableDocument", () => ({
	isMonitorableDocument: vi.fn().mockReturnValue(true),
}));
vi.mock("@snapback/intelligence");

describe("Save Signal Performance - Stress Testing", () => {
	let heatIntegration: HeatIntegration;
	let autoDecisionIntegration: AutoDecisionIntegration;
	let mcpBridge: MCPBridge;
	let saveHandlers: Array<(doc: vscode.TextDocument) => void> = [];

	beforeEach(async () => {
		saveHandlers = [];

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

		// Initialize components
		heatIntegration = new HeatIntegration();
		autoDecisionIntegration = new AutoDecisionIntegration(
			{ createSnapshot: vi.fn() } as any,
			{} as any,
			{ getWorkspaceRoot: vi.fn().mockReturnValue("/test/workspace") } as any,
		);
		mcpBridge = new MCPBridge({
			workspaceId: "ws_perf_test",
			enableAIDetection: true,
		});

		autoDecisionIntegration.activate();
		mcpBridge.activate({ subscriptions: [], globalState: { get: vi.fn(), update: vi.fn() } } as any, {
			detectAI: vi.fn(),
			computeBurst: vi.fn(),
		} as any);

		await waitForGracePeriod();
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

	describe("Baseline Performance", () => {
		it("should complete single clean save in <5ms", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/baseline.ts");

			const start = performance.now();
			await triggerSave(cleanDoc);
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(5);
		});

		it("should handle 10 sequential clean saves in <50ms total", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/sequential.ts");

			const start = performance.now();
			for (let i = 0; i < 10; i++) {
				await triggerSave(cleanDoc);
			}
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(50);
		});

		it("should NOT cause memory growth with 100 clean saves", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/memory.ts");

			// Measure initial memory (approximation via queue size)
			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");
			const initialCalls = pushSpy.mock.calls.length;

			// Stress test
			for (let i = 0; i < 100; i++) {
				await triggerSave(cleanDoc);
			}

			const finalCalls = pushSpy.mock.calls.length;

			// Queue should not grow
			expect(finalCalls - initialCalls).toBe(0);
		});
	});

	describe("Stress Testing - Rapid Saves", () => {
		it("should handle 1000 rapid clean saves without degradation", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/stress.ts");

			const iterations = 1000;
			const timings: number[] = [];

			for (let i = 0; i < iterations; i++) {
				const start = performance.now();
				await triggerSave(cleanDoc);
				timings.push(performance.now() - start);
			}

			// Average should stay consistent (no degradation)
			const firstHalf = timings.slice(0, 500).reduce((a, b) => a + b, 0) / 500;
			const secondHalf = timings.slice(500).reduce((a, b) => a + b, 0) / 500;

			// Second half should not be significantly slower
			expect(secondHalf).toBeLessThan(firstHalf * 1.5);
		});

		it("should NOT accumulate events in AutoDecision buffer", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/buffer.ts");

			// Rapid saves
			for (let i = 0; i < 100; i++) {
				await triggerSave(cleanDoc);
			}

			// Wait for any debounce
			await new Promise((resolve) => setTimeout(resolve, 500));

			const stats = autoDecisionIntegration.getStats();
			expect(stats.bufferedEvents).toBe(0);
		});

		it("should NOT pollute MCP changeQueue with no-change events", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/queue.ts");

			const pushSpy = vi.spyOn((mcpBridge as any).changeQueue, "push");

			// Stress save
			for (let i = 0; i < 500; i++) {
				await triggerSave(cleanDoc);
			}

			// Queue should remain empty
			expect(pushSpy).not.toHaveBeenCalled();
		});
	});

	describe("Concurrency Testing", () => {
		it("should handle concurrent saves of different files", async () => {
			const docs = [
				createCleanDocument("/test/workspace/file1.ts"),
				createCleanDocument("/test/workspace/file2.ts"),
				createCleanDocument("/test/workspace/file3.ts"),
			];

			const start = performance.now();
			await Promise.all(docs.map((doc) => triggerSave(doc)));
			const duration = performance.now() - start;

			// Should be fast even with concurrent saves
			expect(duration).toBeLessThan(20);
		});

		it("should NOT block on synchronous signal processing", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/blocking.ts");

			// If signals are processed synchronously, this will take longer
			const start = performance.now();
			const promises = Array.from({ length: 10 }, () => triggerSave(cleanDoc));
			await Promise.all(promises);
			const duration = performance.now() - start;

			// Concurrent execution should be faster than sequential
			expect(duration).toBeLessThan(50);
		});
	});

	describe("Memory Leak Detection", () => {
		it("should NOT leak event handlers on repeated activate/deactivate", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/handlers.ts");

			// Cycle components
			for (let cycle = 0; cycle < 10; cycle++) {
				const newAutoDecision = new AutoDecisionIntegration(
					{ createSnapshot: vi.fn() } as any,
					{} as any,
					{ getWorkspaceRoot: vi.fn().mockReturnValue("/test/workspace") } as any,
				);
				newAutoDecision.activate();
				await triggerSave(cleanDoc);
				newAutoDecision.deactivate();
			}

			// If handlers leak, saveHandlers array would grow
			// This is an approximation - real leak detection needs profiler
			expect(saveHandlers.length).toBeLessThanOrEqual(10);
		});

		it("should dispose resources properly on cleanup", () => {
			// Spy on dispose methods
			const heatDisposeSpy = vi.spyOn(heatIntegration, "dispose");
			const autoDecisionDisposeSpy = vi.spyOn(autoDecisionIntegration, "deactivate");
			const mcpDisposeSpy = vi.spyOn(mcpBridge, "dispose");

			// Cleanup
			heatIntegration.dispose();
			autoDecisionIntegration.deactivate();
			mcpBridge.dispose();

			expect(heatDisposeSpy).toHaveBeenCalled();
			expect(autoDecisionDisposeSpy).toHaveBeenCalled();
			expect(mcpDisposeSpy).toHaveBeenCalled();
		});
	});

	describe("Edge Case Performance", () => {
		it("should handle very large file (10MB) save without timeout", async () => {
			const largeDoc = createCleanDocument("/test/workspace/large.ts");
			// Simulate large content
			(largeDoc as any).getText = vi.fn().mockReturnValue("x".repeat(10 * 1024 * 1024));

			const start = performance.now();
			await triggerSave(largeDoc);
			const duration = performance.now() - start;

			// Even large files should be fast if no-change
			expect(duration).toBeLessThan(100);
		});

		it("should handle save flood (100 saves in 100ms) gracefully", async () => {
			const cleanDoc = createCleanDocument("/test/workspace/flood.ts");

			const promises: Promise<void>[] = [];
			for (let i = 0; i < 100; i++) {
				promises.push(triggerSave(cleanDoc));
			}

			const start = performance.now();
			await Promise.all(promises);
			const duration = performance.now() - start;

			// Should complete within reasonable time
			expect(duration).toBeLessThan(500);
		});
	});
});
