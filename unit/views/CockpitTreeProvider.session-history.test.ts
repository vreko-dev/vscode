/**
 * CockpitTreeProvider Session History Tests
 *
 * Tests for the session history display feature in the cockpit tree view.
 *
 * TEST PATHS:
 * 1. Happy: Sessions load and display correctly with click handlers
 * 2. Empty: No sessions shows empty state
 * 3. Refresh: Session end triggers history reload
 * 4. Click: Clicking session opens ceremony view with sessionId
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ExtensionContext, TreeItem, TreeItemCollapsibleState } from "vscode";

// Mock vscode module
vi.mock("vscode", () => ({
	TreeItem: class MockTreeItem {
		label: string;
		collapsibleState?: number;
		iconPath?: unknown;
		tooltip?: string;
		contextValue?: string;
		command?: unknown;
		description?: string;

		constructor(label: string, collapsibleState?: number) {
			this.label = label;
			this.collapsibleState = collapsibleState;
		}
	},
	TreeItemCollapsibleState: {
		None: 0,
		Collapsed: 1,
		Expanded: 2,
	},
	ThemeIcon: class MockThemeIcon {
		id: string;
		constructor(id: string) {
			this.id = id;
		}
	},
	EventEmitter: class MockEventEmitter {
		private listeners: Array<() => void> = [];
		event = (listener: () => void) => {
			this.listeners.push(listener);
			return { dispose: () => { /* intentionally empty */ } };
		};
		fire() {
			this.listeners.forEach((l) => l());
		}
	},
	Uri: {
		file: (path: string) => ({ fsPath: path, path }),
		joinPath: (base: any, ...paths: string[]) => ({
			fsPath: `${base.fsPath}/${paths.join("/")}`,
			path: `${base.path}/${paths.join("/")}`,
		}),
	},
	RelativePattern: class MockRelativePattern {
		constructor(public base: unknown, public pattern: string) {}
	},
	workspace: {
		createFileSystemWatcher: vi.fn(() => ({
			onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
			onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
			onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
			dispose: vi.fn(),
		})),
		fs: {
			readFile: vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify({}))),
		},
	},
	window: {
		createTreeView: vi.fn(() => ({
			dispose: vi.fn(),
		})),
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Import after mocks
import { CockpitTreeProvider } from "../../../src/views/CockpitTreeProvider";

describe("CockpitTreeProvider - Session History", () => {
	let provider: CockpitTreeProvider;
	let mockStorageManager: any;
	let mockDaemonBridge: any;
	let mockContext: any;
	let sessionEndedCallback: (() => void) | null = null;

	const mockSessions = [
		{
			sessionId: "session-1",
			workspace: "/test/workspace",
			startedAt: Date.now() - 3600000, // 1 hour ago
			endedAt: Date.now() - 1800000, // 30 mins ago
			snapshotCount: 5,
			learningCount: 2,
			isLive: false,
		},
		{
			sessionId: "session-2",
			workspace: "/test/workspace",
			startedAt: Date.now() - 7200000, // 2 hours ago
			endedAt: Date.now() - 5400000, // 1.5 hours ago
			snapshotCount: 3,
			learningCount: 1,
			isLive: false,
		},
	];

	beforeEach(() => {
		sessionEndedCallback = null;

		mockStorageManager = {
			listSnapshots: vi.fn().mockResolvedValue([]),
		};

		mockDaemonBridge = {
			getBaseline: vi.fn().mockResolvedValue({ fragileFiles: [] }),
			listLearnings: vi.fn().mockResolvedValue({ learnings: [] }),
			listSessionCeremonies: vi.fn().mockResolvedValue({ sessions: mockSessions }),
			getWorkspaceHealth: vi.fn().mockResolvedValue({ guards: [], staleMs: 0, refreshing: false }),
			onSessionStarted: vi.fn(),
			onSessionEnded: vi.fn((cb) => {
				sessionEndedCallback = cb;
			}),
			onSnapshotCreated: vi.fn(),
			onGuardChanged: vi.fn(),
		};

		mockContext = {
			subscriptions: [],
			extensionUri: { fsPath: "/test/extension", path: "/test/extension" },
		} as unknown as ExtensionContext;

		provider = new CockpitTreeProvider(
			mockContext,
			mockStorageManager,
			mockDaemonBridge,
			"/test/workspace"
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// =========================================================================
	// HAPPY PATH: Sessions display correctly
	// =========================================================================

	describe("happy path - session history display", () => {
		it("should show brand header at the top of root items", async () => {
			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			const rootItems = await provider.getChildren(undefined);

			// Brand header should be first item
			expect(rootItems[0].data.type).toBe("brand-header");
			expect(rootItems[0].label).toBe("Vreko");
			expect(rootItems[0].command?.command).toBe("vreko.openDashboard");
		});

		it("should load session history on initialization", async () => {
			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(mockDaemonBridge.listSessionCeremonies).toHaveBeenCalledWith(
				"/test/workspace",
				{ limit: 5 }
			);
		});

		it("should show session history header when sessions exist", async () => {
			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			const rootItems = await provider.getChildren(undefined);

			// Find session history header
			const sessionHistoryHeader = rootItems.find(
				(item) => item.data.type === "session-history-header"
			);

			expect(sessionHistoryHeader).toBeDefined();
			expect(sessionHistoryHeader?.data.count).toBe(2);
		});

		it("should display session items with correct data", async () => {
			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			const rootItems = await provider.getChildren(undefined);
			const sessionHistoryHeader = rootItems.find(
				(item) => item.data.type === "session-history-header"
			);

			expect(sessionHistoryHeader).toBeDefined();

			// Get children of session history header
			const sessionItems = await provider.getChildren(sessionHistoryHeader);

			expect(sessionItems.length).toBe(2);
			expect(sessionItems[0].data.type).toBe("session-history-item");
			expect(sessionItems[0].data.id).toContain("session-1");
		});

		it("should add click command to open ceremony view with sessionId", async () => {
			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			const rootItems = await provider.getChildren(undefined);
			const sessionHistoryHeader = rootItems.find(
				(item) => item.data.type === "session-history-header"
			);

			const sessionItems = await provider.getChildren(sessionHistoryHeader);

			// Check click command
			expect(sessionItems[0].command).toBeDefined();
			expect(sessionItems[0].command?.command).toBe("vreko.openCeremony");
			expect(sessionItems[0].command?.arguments).toEqual(["session-1"]);
		});

		it("should calculate session duration correctly", async () => {
			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			const rootItems = await provider.getChildren(undefined);
			const sessionHistoryHeader = rootItems.find(
				(item) => item.data.type === "session-history-header"
			);

			const sessionItems = await provider.getChildren(sessionHistoryHeader);

			// First session was 30 mins (1800000ms / 60000 = 30m)
			expect(sessionItems[0].data.description).toContain("30m");
		});
	});

	// =========================================================================
	// EMPTY STATE: No sessions
	// =========================================================================

	describe("empty state - no sessions", () => {
		beforeEach(() => {
			mockDaemonBridge.listSessionCeremonies.mockResolvedValue({ sessions: [] });
		});

		it("should not show session history header when no sessions", async () => {
			provider = new CockpitTreeProvider(
				mockContext,
				mockStorageManager,
				mockDaemonBridge,
				"/test/workspace"
			);

			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			const rootItems = await provider.getChildren(undefined);

			const sessionHistoryHeader = rootItems.find(
				(item) => item.data.type === "session-history-header"
			);

			expect(sessionHistoryHeader).toBeUndefined();
		});
	});

	// =========================================================================
	// REFRESH: Session end triggers reload
	// =========================================================================

	describe("refresh on session end", () => {
		it("should reload session history when session ends", async () => {
			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Reset the mock to track new calls
			mockDaemonBridge.listSessionCeremonies.mockClear();

			// Simulate session end
			if (sessionEndedCallback) {
				sessionEndedCallback();
			}

			// Wait for async reload
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Should have reloaded session history
			expect(mockDaemonBridge.listSessionCeremonies).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// ERROR HANDLING: Graceful degradation
	// =========================================================================

	describe("error handling", () => {
		it("should handle listSessionCeremonies failure gracefully", async () => {
			mockDaemonBridge.listSessionCeremonies.mockRejectedValue(
				new Error("Network error")
			);

			provider = new CockpitTreeProvider(
				mockContext,
				mockStorageManager,
				mockDaemonBridge,
				"/test/workspace"
			);

			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			const rootItems = await provider.getChildren(undefined);

			// Should not throw, just not show session history
			const sessionHistoryHeader = rootItems.find(
				(item) => item.data.type === "session-history-header"
			);

			expect(sessionHistoryHeader).toBeUndefined();
		});

		it("should handle null daemon bridge", async () => {
			provider = new CockpitTreeProvider(
				mockContext,
				mockStorageManager,
				null, // No daemon bridge
				"/test/workspace"
			);

			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Should not throw
			const rootItems = await provider.getChildren(undefined);
			expect(rootItems).toBeDefined();
		});
	});

	// =========================================================================
	// FILTERING: Live sessions excluded
	// =========================================================================

	describe("live session filtering", () => {
		it("should filter out live sessions from history", async () => {
			const sessionsWithLive = [
				...mockSessions,
				{
					sessionId: "session-live",
					workspace: "/test/workspace",
					startedAt: Date.now() - 300000, // 5 mins ago
					endedAt: null,
					snapshotCount: 1,
					learningCount: 0,
					isLive: true, // This is a live session
				},
			];

			mockDaemonBridge.listSessionCeremonies.mockResolvedValue({
				sessions: sessionsWithLive,
			});

			provider = new CockpitTreeProvider(
				mockContext,
				mockStorageManager,
				mockDaemonBridge,
				"/test/workspace"
			);

			// Wait for initial load
			await new Promise((resolve) => setTimeout(resolve, 50));

			const rootItems = await provider.getChildren(undefined);
			const sessionHistoryHeader = rootItems.find(
				(item) => item.data.type === "session-history-header"
			);

			// Should only count non-live sessions
			expect(sessionHistoryHeader?.data.count).toBe(2);

			const sessionItems = await provider.getChildren(sessionHistoryHeader);

			// Live session should not be in list
			const liveSession = sessionItems.find((item) =>
				item.data.id?.includes("session-live")
			);
			expect(liveSession).toBeUndefined();
		});
	});
});
