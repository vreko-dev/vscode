/**
 * @deprecated This test file tests the legacy VitalsDashboardPanel which has been
 * consolidated into UnifiedDashboardPanel (vitals tab). See UnifiedDashboardPanel.test.ts
 * for the current implementation tests.
 *
 * Integration Test: VitalsDashboardPanel → DaemonBridge Wiring
 *
 * Per ARCHITECTURE_REFACTOR_SPEC.md Section 8 Migration Checklist:
 * - [x] Wire DaemonBridge into UnifiedDashboardPanel (consolidation complete)
 *
 * Target Architecture (from spec Section 4.4):
 * - UnifiedDashboardPanel now handles vitals via the "vitals" tab
 * - DaemonBridge wiring is in UnifiedDashboardPanel.wireDaemonBridge()
 *
 * Test Status:
 * - These tests are deprecated - use UnifiedDashboardPanel.test.ts instead
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		createWebviewPanel: vi.fn(() => ({
			webview: {
				html: "",
				onDidReceiveMessage: vi.fn((callback) => callback),
				postMessage: vi.fn(),
				asWebviewUri: vi.fn((uri) => uri),
			},
			onDidDispose: vi.fn((callback) => callback),
			onDidChangeViewState: vi.fn((callback) => callback),
			dispose: vi.fn(),
			reveal: vi.fn(),
			visible: true,
		})),
		activeTextEditor: {
			document: {
				uri: { fsPath: "/test/file.ts" },
			},
		},
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
		})),
	},
	Uri: {
		file: (path: string) => ({ fsPath: path, scheme: "file" }),
		joinPath: vi.fn((...args) => ({ fsPath: args.join("/") })),
	},
	ViewColumn: {
		One: 1,
		Two: 2,
		Active: -1,
	},
	ExtensionContext: class {
		subscriptions = [];
		extensionUri = { fsPath: "/test/extension" };
	},
}));

// Type definitions for Vitals
interface VitalsData {
	pulse: number;
	temperature: number;
	pressure: number;
	oxygen: number;
	healthScore: number;
}

interface SnapshotCreatedEvent {
	snapshotId: string;
	filePath: string;
	source: "extension" | "cli" | "mcp";
	timestamp: number;
}

// Mock DaemonBridge for vitals integration
function createMockDaemonBridge() {
	const eventCallbacks: Array<(event: SnapshotCreatedEvent) => void> = [];

	return {
		// Vitals retrieval
		getVitals: vi.fn().mockResolvedValue({
			pulse: 5,
			temperature: 15,
			pressure: 60,
			oxygen: 95,
			healthScore: 85,
		} as VitalsData),

		// Event subscriptions - store callbacks to simulate events later
		onSnapshotCreated: vi.fn((callback: (event: SnapshotCreatedEvent) => void) => {
			eventCallbacks.push(callback);
			return { dispose: vi.fn() };
		}),

		// Helper to emit snapshot events for testing
		_emitSnapshotCreated: (event: SnapshotCreatedEvent) => {
			for (const callback of eventCallbacks) {
				callback(event);
			}
		},

		// Connection management
		isConnected: vi.fn().mockReturnValue(true),
		connect: vi.fn().mockResolvedValue(undefined),

		// Record file modification
		recordFileModification: vi.fn().mockResolvedValue(true),
	};
}

describe("VitalsDashboardPanel → DaemonBridge Integration", () => {
	let mockDaemonBridge: ReturnType<typeof createMockDaemonBridge>;

	beforeEach(() => {
		mockDaemonBridge = createMockDaemonBridge();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("Infrastructure Verification", () => {
		it("DaemonBridge mock has getVitals method", () => {
			expect(mockDaemonBridge.getVitals).toBeDefined();
			expect(typeof mockDaemonBridge.getVitals).toBe("function");
		});

		it("DaemonBridge mock has onSnapshotCreated event", () => {
			expect(mockDaemonBridge.onSnapshotCreated).toBeDefined();
			expect(typeof mockDaemonBridge.onSnapshotCreated).toBe("function");
		});

		it("DaemonBridge mock returns valid vitals structure", async () => {
			const vitals = await mockDaemonBridge.getVitals();
			expect(vitals).toHaveProperty("pulse");
			expect(vitals).toHaveProperty("temperature");
			expect(vitals).toHaveProperty("pressure");
			expect(vitals).toHaveProperty("oxygen");
			expect(vitals).toHaveProperty("healthScore");
		});
	});

	describe("DaemonBridge Setter Injection", () => {
		/**
		 * Per ARCHITECTURE_REFACTOR_SPEC.md Phase 1:
		 * VitalsDashboardPanel.setDaemonBridge(bridge) should be callable.
		 *
		 * IMPLEMENTED: VitalsDashboardPanel now has:
		 * - setDaemonBridge(bridge: DaemonBridge): void
		 * - static wireDaemonBridge(bridge: DaemonBridge): void
		 * - Subscribes to onSnapshotCreated to refresh vitals
		 */
		it("VitalsDashboardPanel should have setDaemonBridge method", async () => {
			// Dynamic import to avoid vscode activation issues
			const { VitalsDashboardPanel } = await import("../../src/ui/VitalsDashboardPanel");

			// Verify static wireDaemonBridge exists
			expect(VitalsDashboardPanel.wireDaemonBridge).toBeDefined();
			expect(typeof VitalsDashboardPanel.wireDaemonBridge).toBe("function");
		});

		it("wireDaemonBridge should be callable with mock bridge", async () => {
			const { VitalsDashboardPanel } = await import("../../src/ui/VitalsDashboardPanel");

			// Should not throw
			expect(() => VitalsDashboardPanel.wireDaemonBridge(mockDaemonBridge as never)).not.toThrow();
		});
	});

	describe("Event Subscription for Cross-Surface Coordination", () => {
		/**
		 * Per ARCHITECTURE_REFACTOR_SPEC.md Phase 1:
		 * VitalsDashboardPanel should refresh when CLI/MCP creates snapshots.
		 */
		it("onSnapshotCreated subscription should register callback", () => {
			// Simulate subscription
			const callback = vi.fn();
			mockDaemonBridge.onSnapshotCreated(callback);

			expect(mockDaemonBridge.onSnapshotCreated).toHaveBeenCalledWith(callback);
		});

		it("snapshot created event should trigger callback", () => {
			const callback = vi.fn();
			mockDaemonBridge.onSnapshotCreated(callback);

			// Simulate CLI snapshot
			const event: SnapshotCreatedEvent = {
				snapshotId: "snap-456",
				filePath: "/test/file.ts",
				source: "cli",
				timestamp: Date.now(),
			};

			mockDaemonBridge._emitSnapshotCreated(event);

			expect(callback).toHaveBeenCalledWith(event);
		});

		it("MCP-originated snapshot should trigger callback", () => {
			const callback = vi.fn();
			mockDaemonBridge.onSnapshotCreated(callback);

			const event: SnapshotCreatedEvent = {
				snapshotId: "snap-789",
				filePath: "/test/another.ts",
				source: "mcp",
				timestamp: Date.now(),
			};

			mockDaemonBridge._emitSnapshotCreated(event);

			expect(callback).toHaveBeenCalledWith(event);
			expect(callback.mock.calls[0][0].source).toBe("mcp");
		});
	});

	describe("Vitals Data Flow (Future Implementation)", () => {
		/**
		 * Future: VitalsDashboardPanel should fetch vitals through DaemonBridge
		 * instead of UnifiedDataService for CLI-centric architecture.
		 */
		it("TODO: getVitals should be called on refresh", async () => {
			// Will be implemented when data flow is migrated to DaemonBridge
		});

		it("TODO: vitals should update after snapshot created event", async () => {
			// Will be implemented when full data flow migration is complete
		});
	});
});
