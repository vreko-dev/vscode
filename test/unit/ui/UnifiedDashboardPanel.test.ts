/**
 * UnifiedDashboardPanel Tests - TDD RED Phase
 *
 * Comprehensive tests for consolidated webview panel that replaces:
 * - DashboardPanel
 * - VitalsDashboardPanel
 * - OnboardingPanelProvider
 *
 * Test Structure:
 * 1. Singleton Pattern Tests
 * 2. Tab Navigation Tests
 * 3. Data Flow Tests
 * 4. Message Protocol Tests
 * 5. Lifecycle Tests
 * 6. Error Handling Tests
 *
 * @author SnapBack Engineering
 * @since 2025-01-08
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// MOCKS - Setup with vi.hoisted for proper mock factory access
// =============================================================================

// Use vi.hoisted to ensure mock values are available when vi.mock factories run
const { mockDataService, defaultSnapshot, mockWebviewPanel } = vi.hoisted(() => {
	const defaultSnapshot = {
		stats: {
			snapshotsToday: 5,
			totalSnapshots: 50,
			restoresToday: 2,
			linesProtected: 1000,
			tokensSaved: 5000,
			restoresThisWeek: 10,
			efficiencyPercentile: 75,
		},
		activity: {
			timeline: [],
			aiDetectionLog: [],
			todayEvents: 3,
			yesterdayEvents: 5,
			weekEvents: 20,
		},
		settings: {
			detectedAITool: "Cursor",
			cliInstalled: true,
			cliVersion: "1.0.0",
			protectionThreshold: "medium",
			excludePatterns: ["node_modules"],
			languagePacks: [{ name: "TypeScript", enabled: true, builtin: true }],
		},
		vitals: null,
		sessionHealth: {
			healthScore: 100,
			trajectory: "stable",
			activeWarnings: [],
			lastSnapshotMinutesAgo: null,
			suggestions: [],
		},
		recommendation: {
			should: false,
			reason: "Workspace healthy",
			urgency: "optional",
		},
		guidance: {
			safeOperations: ["read", "analyze"],
			blockedOperations: [],
			suggestion: "All operations safe",
		},
		learnings: [],
		violations: [],
		patterns: [],
	};

	const mockWebviewPanel = {
		webview: {
			html: "",
			onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
			postMessage: vi.fn().mockResolvedValue(true),
			// Return string path for HTML interpolation
			asWebviewUri: vi.fn((uri: { fsPath?: string; path?: string }) => {
				const path = uri?.fsPath || uri?.path || "unknown";
				return `vscode-webview://${path}`;
			}),
			cspSource: "test-csp",
		},
		onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
		reveal: vi.fn(),
		dispose: vi.fn(),
		visible: true,
		viewColumn: 1,
	};

	return {
		defaultSnapshot,
		mockDataService: {
			getSnapshot: vi.fn().mockResolvedValue(defaultSnapshot),
			onDataChange: vi.fn(() => ({ dispose: vi.fn() })),
			recordRestore: vi.fn(),
			recordAIDetection: vi.fn(),
			dispose: vi.fn(),
		},
		mockWebviewPanel,
	};
});

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock WorkspaceDataService
vi.mock("../../../src/services/WorkspaceDataService", () => ({
	WorkspaceDataService: {
		for: vi.fn(() => mockDataService),
		disposeAll: vi.fn(),
	},
	createWorkspaceDataService: vi.fn(() => mockDataService),
}));

// Mock vscode module
vi.mock("vscode", () => {
	class MockUri {
		static file(path: string) {
			return { fsPath: path, path, scheme: "file" };
		}
		static joinPath(base: { fsPath: string }, ...paths: string[]) {
			return { fsPath: `${base.fsPath}/${paths.join("/")}`, path: paths.join("/") };
		}
	}

	class MockEventEmitter<T> {
		private listeners: Array<(e: T) => void> = [];
		get event() {
			return (listener: (e: T) => void) => {
				this.listeners.push(listener);
				return { dispose: () => {} };
			};
		}
		fire(data: T) {
			for (const listener of this.listeners) {
				listener(data);
			}
		}
		dispose() {
			this.listeners = [];
		}
	}

	return {
		Uri: MockUri,
		EventEmitter: MockEventEmitter,
		ViewColumn: { One: 1, Two: 2, Active: -1 },
		window: {
			createWebviewPanel: vi.fn(() => mockWebviewPanel),
			showErrorMessage: vi.fn(),
			showInformationMessage: vi.fn(),
		},
		workspace: {
			workspaceFolders: [{ uri: { fsPath: "/test/workspace" }, name: "test" }],
			getConfiguration: vi.fn(() => ({
				get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
			})),
		},
		commands: {
			executeCommand: vi.fn(),
		},
	};
});

// =============================================================================
// IMPORT SERVICE (will fail until implementation exists)
// =============================================================================

import {
	UnifiedDashboardPanel,
	createUnifiedDashboardPanel,
	type DashboardTab,
} from "../../../src/ui/UnifiedDashboardPanel";

// =============================================================================
// TEST SUITE
// =============================================================================

describe("UnifiedDashboardPanel", () => {
	let mockExtensionUri: { fsPath: string };
	let mockCoordinator: { listSnapshots: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		// Reset singleton
		UnifiedDashboardPanel.disposeAll?.();

		// Reset mocks - use clearAllMocks to preserve implementations
		vi.clearAllMocks();

		// Re-configure mock implementations (clearAllMocks may affect hoisted mocks)
		mockDataService.getSnapshot.mockResolvedValue(defaultSnapshot);
		mockDataService.onDataChange.mockReturnValue({ dispose: vi.fn() });
		mockWebviewPanel.webview.postMessage.mockResolvedValue(true);
		mockWebviewPanel.webview.onDidReceiveMessage.mockReturnValue({ dispose: vi.fn() });
		mockWebviewPanel.onDidDispose.mockReturnValue({ dispose: vi.fn() });

		// Setup mock extension URI
		mockExtensionUri = { fsPath: "/test/extension" };

		// Setup mock coordinator
		mockCoordinator = {
			listSnapshots: vi.fn().mockResolvedValue([]),
		};

		// Reset webview panel mock state
		mockWebviewPanel.webview.html = "";
		mockWebviewPanel.visible = true;
	});

	afterEach(() => {
		UnifiedDashboardPanel.disposeAll?.();
		vi.clearAllMocks();
	});

	// =========================================================================
	// 1. SINGLETON PATTERN TESTS
	// =========================================================================

	describe("singleton pattern", () => {
		it("should create panel via createOrShow factory", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			expect(panel).toBeInstanceOf(UnifiedDashboardPanel);
		});

		it("should return same instance on subsequent createOrShow calls", () => {
			const panel1 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);
			const panel2 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			expect(panel1).toBe(panel2);
		});

		it("should reveal existing panel instead of creating new", () => {
			const panel1 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);
			const panel2 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// First createOrShow creates panel, second reveals it
			expect(mockWebviewPanel.reveal).toHaveBeenCalled();
		});

		it("should create new instance after disposeAll", () => {
			const panel1 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			UnifiedDashboardPanel.disposeAll();

			// Clear mock to track new panel creation
			vi.mocked(mockWebviewPanel.reveal).mockClear();

			const panel2 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Should be different instance (new panel created)
			expect(panel1).not.toBe(panel2);
		});

		it("should use correct viewType", () => {
			expect(UnifiedDashboardPanel.viewType).toBe("snapback.dashboard");
		});
	});

	// =========================================================================
	// 2. TAB NAVIGATION TESTS
	// =========================================================================

	describe("tab navigation", () => {
		it("should default to home tab", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// HTML should include data-panel="home"
			expect(mockWebviewPanel.webview.html).toContain('data-panel="home"');
		});

		it("should navigate to specified initial tab", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
				"vitals",
			);

			expect(mockWebviewPanel.webview.html).toContain('data-panel="vitals"');
		});

		it("should support all valid tab values", () => {
			const validTabs: DashboardTab[] = ["home", "vitals", "setup", "activity"];

			for (const tab of validTabs) {
				UnifiedDashboardPanel.disposeAll();
				vi.clearAllMocks();

				const panel = UnifiedDashboardPanel.createOrShow(
					mockExtensionUri as any,
					mockCoordinator as any,
					tab,
				);

				expect(mockWebviewPanel.webview.html).toContain(`data-panel="${tab}"`);
			}
		});

		it("should send navigate message to change tabs", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			panel.navigateTo("vitals");

			expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
				type: "navigate",
				tab: "vitals",
			});
		});

		it("should navigate existing panel to requested tab on createOrShow", () => {
			// Create panel with home tab
			const panel1 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
				"home",
			);

			// Clear postMessage calls
			vi.mocked(mockWebviewPanel.webview.postMessage).mockClear();

			// Request same panel with different tab
			const panel2 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
				"vitals",
			);

			// Should navigate existing panel to vitals
			expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({
				type: "navigate",
				tab: "vitals",
			});
		});
	});

	// =========================================================================
	// 3. DATA FLOW TESTS
	// =========================================================================

	describe("data flow", () => {
		it("should send data on webviewReady message", async () => {
			UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Simulate webviewReady message
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const messageHandler = (mockWebviewPanel.webview.onDidReceiveMessage as any).mock
				.calls[0]?.[0] as ((msg: unknown) => Promise<void>) | undefined;

			expect(messageHandler).toBeDefined();
			await messageHandler!({ type: "webviewReady" });

			// Should have called getSnapshot and sent data
			expect(mockDataService.getSnapshot).toHaveBeenCalled();
			expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "update",
				}),
			);
		});

		it("should include stats in data update", async () => {
			UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const messageHandler = (mockWebviewPanel.webview.onDidReceiveMessage as any).mock
				.calls[0]?.[0] as ((msg: unknown) => Promise<void>) | undefined;
			expect(messageHandler).toBeDefined();
			await messageHandler!({ type: "webviewReady" });

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const sentMessage = (mockWebviewPanel.webview.postMessage as any).mock.calls.find(
				(call: unknown[]) => (call[0] as { type: string }).type === "update",
			)?.[0] as { stats: { snapshotsToday: number } } | undefined;

			expect(sentMessage?.stats).toBeDefined();
			expect(sentMessage?.stats.snapshotsToday).toBe(5);
		});

		it("should include vitals in data update when available", async () => {
			// Update mock to return vitals
			mockDataService.getSnapshot.mockResolvedValueOnce({
				...defaultSnapshot,
				vitals: {
					pulse: { changesPerMinute: 10, level: "normal" },
					temperature: { aiPercentage: 30, level: "warm" },
					pressure: { value: 50 },
					oxygen: { value: 90 },
					trajectory: "stable",
				},
			});

			UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const messageHandler = (mockWebviewPanel.webview.onDidReceiveMessage as any).mock
				.calls[0]?.[0] as ((msg: unknown) => Promise<void>) | undefined;
			expect(messageHandler).toBeDefined();
			await messageHandler!({ type: "webviewReady" });

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const sentMessage = (mockWebviewPanel.webview.postMessage as any).mock.calls.find(
				(call: unknown[]) => (call[0] as { type: string }).type === "update",
			)?.[0] as { vitals: unknown } | undefined;

			expect(sentMessage?.vitals).toBeDefined();
		});

		it("should handle missing vitals gracefully", async () => {
			UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const messageHandler = (mockWebviewPanel.webview.onDidReceiveMessage as any).mock
				.calls[0]?.[0] as ((msg: unknown) => Promise<void>) | undefined;
			expect(messageHandler).toBeDefined();
			await messageHandler!({ type: "webviewReady" });

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const sentMessage = (mockWebviewPanel.webview.postMessage as any).mock.calls.find(
				(call: unknown[]) => (call[0] as { type: string }).type === "update",
			)?.[0] as { vitals: unknown } | undefined;

			// Should still send data even if vitals is null
			expect(sentMessage).toBeDefined();
			expect(sentMessage?.vitals).toBeNull();
		});

		it("should update webview when data service fires change event", async () => {
			UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Simulate webviewReady first
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const messageHandler = (mockWebviewPanel.webview.onDidReceiveMessage as any).mock
				.calls[0]?.[0] as ((msg: unknown) => Promise<void>) | undefined;
			expect(messageHandler).toBeDefined();
			await messageHandler!({ type: "webviewReady" });

			// Get the onDataChange callback
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const onDataChangeCallback = (mockDataService.onDataChange as any).mock.calls[0]?.[0] as
				| ((event: unknown) => void)
				| undefined;
			expect(onDataChangeCallback).toBeDefined();

			// Clear postMessage calls
			mockWebviewPanel.webview.postMessage.mockClear();

			// Fire data change event
			onDataChangeCallback!({ type: "stats-updated" });

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should have sent updated data
			expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalled();
		});

		it("should not send data before webviewReady", () => {
			UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Before webviewReady, no update messages should be sent
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const updateCalls = (mockWebviewPanel.webview.postMessage as any).mock.calls.filter(
				(call: unknown[]) => (call[0] as { type: string }).type === "update",
			);

			expect(updateCalls.length).toBe(0);
		});
	});

	// =========================================================================
	// 4. MESSAGE PROTOCOL TESTS
	// =========================================================================

	describe("message protocol", () => {
		it("should handle createSnapshot command", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });
			await messageHandler({ type: "createSnapshot" });

			const vscode = await import("vscode");
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("snapback.createSnapshot");
		});

		it("should handle openSettings command", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });
			await messageHandler({ type: "openSettings" });

			const vscode = await import("vscode");
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"workbench.action.openSettings",
				"@ext:snapback",
			);
		});

		it("should handle refresh command", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });

			vi.mocked(mockWebviewPanel.webview.postMessage).mockClear();
			await messageHandler({ type: "refresh" });

			// Should re-fetch and send data
			expect(mockDataService.getSnapshot).toHaveBeenCalled();
		});

		it("should handle restoreSnapshot command with payload", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });
			await messageHandler({ type: "restoreSnapshot", payload: { snapshotId: "snap-123" } });

			const vscode = await import("vscode");
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"snapback.restoreSnapshot",
				"snap-123",
			);
		});

		it("should ignore unknown message types", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];

			// Should not throw
			expect(() => messageHandler({ type: "unknownType" })).not.toThrow();
		});
	});

	// =========================================================================
	// 5. LIFECYCLE TESTS
	// =========================================================================

	describe("lifecycle", () => {
		it("should dispose cleanly", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			expect(() => panel.dispose()).not.toThrow();
		});

		it("should clear instance reference on dispose", () => {
			const panel1 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			panel1.dispose();

			// New panel should be created (not same instance)
			const panel2 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			expect(panel1).not.toBe(panel2);
		});

		it("should cleanup data service subscription on dispose", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const subscription = vi.mocked(mockDataService.onDataChange).mock.results[0].value;

			panel.dispose();

			expect(subscription.dispose).toHaveBeenCalled();
		});

		it("should handle panel onDidDispose event", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Get dispose handler
			const disposeHandler = vi.mocked(mockWebviewPanel.onDidDispose).mock.calls[0][0];

			// Simulate panel being closed by user
			disposeHandler();

			// Create new panel should work
			const panel2 = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			expect(panel2).not.toBe(panel);
		});

		it("should handle multiple dispose calls gracefully", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			panel.dispose();
			expect(() => panel.dispose()).not.toThrow();
		});
	});

	// =========================================================================
	// 6. ERROR HANDLING TESTS
	// =========================================================================

	describe("error handling", () => {
		it("should handle data service errors gracefully", async () => {
			mockDataService.getSnapshot.mockRejectedValueOnce(new Error("Data fetch failed"));

			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];

			// Should not throw
			await expect(messageHandler({ type: "webviewReady" })).resolves.not.toThrow();
		});

		it("should show error message on critical failures", async () => {
			mockDataService.getSnapshot.mockRejectedValueOnce(new Error("Critical error"));

			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });

			const vscode = await import("vscode");
			// Should show error to user
			expect(vscode.window.showErrorMessage).toHaveBeenCalled();
		});

		it("should continue functioning after error recovery", async () => {
			// First call fails
			mockDataService.getSnapshot.mockRejectedValueOnce(new Error("Temporary error"));

			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });

			// Second call succeeds (reset mock)
			mockDataService.getSnapshot.mockResolvedValueOnce({
				stats: { snapshotsToday: 1, totalSnapshots: 1 },
			} as any);

			vi.mocked(mockWebviewPanel.webview.postMessage).mockClear();
			await messageHandler({ type: "refresh" });

			// Should successfully send data
			expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "update" }),
			);
		});
	});

	// =========================================================================
	// 7. HTML GENERATION TESTS
	// =========================================================================

	describe("HTML generation", () => {
		it("should generate valid HTML with CSP", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const html = mockWebviewPanel.webview.html;

			expect(html).toContain("<!DOCTYPE html>");
			expect(html).toContain("Content-Security-Policy");
		});

		it("should include React bundle script", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const html = mockWebviewPanel.webview.html;

			expect(html).toContain("<script");
			expect(html).toContain("bundle.js");
		});

		it("should include styles", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const html = mockWebviewPanel.webview.html;

			expect(html).toContain("<style");
		});

		it("should set nonce for CSP compliance", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const html = mockWebviewPanel.webview.html;

			// Should have nonce attribute on script
			expect(html).toMatch(/nonce="[a-zA-Z0-9]+"/);
		});
	});

	// =========================================================================
	// 8. FACTORY FUNCTION TESTS
	// =========================================================================

	describe("factory function", () => {
		it("should create panel via createUnifiedDashboardPanel", () => {
			const panel = createUnifiedDashboardPanel(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			expect(panel).toBeInstanceOf(UnifiedDashboardPanel);
		});

		it("should pass initialTab to factory", () => {
			const panel = createUnifiedDashboardPanel(
				mockExtensionUri as any,
				mockCoordinator as any,
				"setup",
			);

			expect(mockWebviewPanel.webview.html).toContain('data-panel="setup"');
		});
	});

	// =========================================================================
	// 9. MCP CONNECTION TESTS (New functionality)
	// =========================================================================

	describe("MCP state change subscription", () => {
		let mockDaemonBridge: {
			onSnapshotCreated: ReturnType<typeof vi.fn>;
			onStateChange: ReturnType<typeof vi.fn>;
			getState: ReturnType<typeof vi.fn>;
			getDaemonVersion: ReturnType<typeof vi.fn>;
		};

		beforeEach(() => {
			mockDaemonBridge = {
				onSnapshotCreated: vi.fn().mockReturnValue({ dispose: vi.fn() }),
				onStateChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
				getState: vi.fn().mockReturnValue("disconnected" as const),
				getDaemonVersion: vi.fn().mockReturnValue(undefined),
			};
		});

		it("should subscribe to DaemonBridge state changes when wired", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Wire the daemon bridge
			panel.setDaemonBridge(mockDaemonBridge as any);

			// Should subscribe to both snapshot created and state change events
			expect(mockDaemonBridge.onSnapshotCreated).toHaveBeenCalled();
			expect(mockDaemonBridge.onStateChange).toHaveBeenCalled();
		});

		it("should send data update when MCP state changes", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Simulate webviewReady first
			const messageHandler = (mockWebviewPanel.webview.onDidReceiveMessage as any).mock
				.calls[0]?.[0] as ((msg: unknown) => Promise<void>) | undefined;
			expect(messageHandler).toBeDefined();
			await messageHandler!({ type: "webviewReady" });

			// Clear postMessage calls
			mockWebviewPanel.webview.postMessage.mockClear();

			// Wire the daemon bridge
			panel.setDaemonBridge(mockDaemonBridge as any);

			// Get the state change callback
			const stateChangeCallback = (mockDaemonBridge.onStateChange as any).mock.calls[0]?.[0] as
				| (() => void)
				| undefined;
			expect(stateChangeCallback).toBeDefined();

			// Simulate state change
			stateChangeCallback!();

			// Should send updated data to webview
			expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalled();
			expect(mockDataService.getSnapshot).toHaveBeenCalled();
		});

		it("should not send data updates before webview is ready", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Wire the daemon bridge WITHOUT webviewReady
			panel.setDaemonBridge(mockDaemonBridge as any);

			// Get the state change callback
			const stateChangeCallback = (mockDaemonBridge.onStateChange as any).mock.calls[0]?.[0] as
				| (() => void)
				| undefined;

			// Clear postMessage calls (from initial setup)
			mockWebviewPanel.webview.postMessage.mockClear();

			// Simulate state change before webview ready
			stateChangeCallback!();

			// Should NOT send data yet
			expect(mockWebviewPanel.webview.postMessage).not.toHaveBeenCalled();
		});

		it("should dispose state change subscription on cleanup", () => {
			const mockDispose = vi.fn();
			mockDaemonBridge.onStateChange.mockReturnValue({ dispose: mockDispose });

			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			panel.setDaemonBridge(mockDaemonBridge as any);
			panel.dispose();

			// Should dispose both subscriptions
			expect(mockDispose).toHaveBeenCalled();
		});

		it("should handle multiple setDaemonBridge calls gracefully", () => {
			const mockDispose1 = vi.fn();
			const mockDispose2 = vi.fn();

			const mockBridge1 = {
				...mockDaemonBridge,
				onSnapshotCreated: vi.fn().mockReturnValue({ dispose: mockDispose1 }),
				onStateChange: vi.fn().mockReturnValue({ dispose: mockDispose1 }),
			};

			const mockBridge2 = {
				...mockDaemonBridge,
				onSnapshotCreated: vi.fn().mockReturnValue({ dispose: mockDispose2 }),
				onStateChange: vi.fn().mockReturnValue({ dispose: mockDispose2 }),
			};

			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Wire first bridge
			panel.setDaemonBridge(mockBridge1 as any);

			// Wire second bridge (should dispose first)
			panel.setDaemonBridge(mockBridge2 as any);

			// First bridge subscriptions should be disposed
			expect(mockDispose1).toHaveBeenCalled();
			// Second bridge should be subscribed
			expect(mockBridge2.onStateChange).toHaveBeenCalled();
		});

		it("should send mcpConnection data in update message", async () => {
			// Update mock to include MCP connection info
			const snapshotWithMCP = {
				...defaultSnapshot,
				mcpConnection: {
					state: "connected" as const,
					daemonVersion: "1.2.3",
				},
			};
			mockDataService.getSnapshot.mockResolvedValue(snapshotWithMCP);

			UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Simulate webviewReady
			const messageHandler = (mockWebviewPanel.webview.onDidReceiveMessage as any).mock
				.calls[0]?.[0] as ((msg: unknown) => Promise<void>) | undefined;
			expect(messageHandler).toBeDefined();
			await messageHandler!({ type: "webviewReady" });

			// Find the update message
			const sentMessage = (mockWebviewPanel.webview.postMessage as any).mock.calls.find(
				(call: unknown[]) => (call[0] as { type: string }).type === "update",
			)?.[0] as { mcpConnection: { state: string; daemonVersion: string } } | undefined;

			expect(sentMessage).toBeDefined();
			expect(sentMessage?.mcpConnection).toBeDefined();
			expect(sentMessage?.mcpConnection.state).toBe("connected");
			expect(sentMessage?.mcpConnection.daemonVersion).toBe("1.2.3");
		});

		it("should use static wireDaemonBridge method", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Wire via static method
			UnifiedDashboardPanel.wireDaemonBridge(mockDaemonBridge as any);

			// Should subscribe to events
			expect(mockDaemonBridge.onSnapshotCreated).toHaveBeenCalled();
			expect(mockDaemonBridge.onStateChange).toHaveBeenCalled();
		});
	});
});
