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
// MOCKS - Setup before imports
// =============================================================================

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
const mockDataService = {
	getSnapshot: vi.fn().mockResolvedValue({
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
	}),
	onDataChange: vi.fn(() => ({ dispose: vi.fn() })),
	recordRestore: vi.fn(),
	recordAIDetection: vi.fn(),
	dispose: vi.fn(),
};

vi.mock("../../../src/services/WorkspaceDataService", () => ({
	WorkspaceDataService: {
		for: vi.fn(() => mockDataService),
		disposeAll: vi.fn(),
	},
	createWorkspaceDataService: vi.fn(() => mockDataService),
}));

// Mock vscode module
const mockWebviewPanel = {
	webview: {
		html: "",
		onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
		postMessage: vi.fn().mockResolvedValue(true),
		asWebviewUri: vi.fn((uri) => uri),
		cspSource: "test-csp",
	},
	onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
	onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
	reveal: vi.fn(),
	dispose: vi.fn(),
	visible: true,
	viewColumn: 1,
};

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

		// Reset mocks
		vi.clearAllMocks();

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
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Simulate webviewReady message
			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });

			// Should have called getSnapshot and sent data
			expect(mockDataService.getSnapshot).toHaveBeenCalled();
			expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "update",
				}),
			);
		});

		it("should include stats in data update", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });

			const sentMessage = vi.mocked(mockWebviewPanel.webview.postMessage).mock.calls.find(
				(call) => call[0].type === "update",
			)?.[0];

			expect(sentMessage.stats).toBeDefined();
			expect(sentMessage.stats.snapshotsToday).toBe(5);
		});

		it("should include vitals in data update when available", async () => {
			// Update mock to return vitals
			mockDataService.getSnapshot.mockResolvedValueOnce({
				...mockDataService.getSnapshot(),
				vitals: {
					pulse: { changesPerMinute: 10, level: "normal" },
					temperature: { aiPercentage: 30, level: "warm" },
					pressure: { value: 50 },
					oxygen: { value: 90 },
					trajectory: "stable",
				},
			});

			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });

			const sentMessage = vi.mocked(mockWebviewPanel.webview.postMessage).mock.calls.find(
				(call) => call[0].type === "update",
			)?.[0];

			expect(sentMessage.vitals).toBeDefined();
		});

		it("should handle missing vitals gracefully", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });

			const sentMessage = vi.mocked(mockWebviewPanel.webview.postMessage).mock.calls.find(
				(call) => call[0].type === "update",
			)?.[0];

			// Should still send data even if vitals is null
			expect(sentMessage).toBeDefined();
			expect(sentMessage.vitals).toBeNull();
		});

		it("should update webview when data service fires change event", async () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Simulate webviewReady first
			const messageHandler = vi.mocked(mockWebviewPanel.webview.onDidReceiveMessage).mock
				.calls[0][0];
			await messageHandler({ type: "webviewReady" });

			// Get the onDataChange callback
			const onDataChangeCallback = vi.mocked(mockDataService.onDataChange).mock.calls[0][0];

			// Clear postMessage calls
			vi.mocked(mockWebviewPanel.webview.postMessage).mockClear();

			// Fire data change event
			onDataChangeCallback({ type: "stats-updated" });

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should have sent updated data
			expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalled();
		});

		it("should not send data before webviewReady", () => {
			const panel = UnifiedDashboardPanel.createOrShow(
				mockExtensionUri as any,
				mockCoordinator as any,
			);

			// Before webviewReady, no update messages should be sent
			const updateCalls = vi
				.mocked(mockWebviewPanel.webview.postMessage)
				.mock.calls.filter((call) => call[0].type === "update");

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
});
