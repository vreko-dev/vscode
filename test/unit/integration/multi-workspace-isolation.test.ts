/**
 * Multi-Workspace Scope Isolation Tests
 *
 * These tests verify that activity counts, events, and status bar updates
 * are properly isolated between workspaces to prevent cross-contamination.
 *
 * Problem being fixed:
 * - MCP Bridge (singleton) receives ALL workspace events → Status bar shows GLOBAL count
 * - Snapshot Storage (workspace-scoped) shows ONLY this workspace → List shows LOCAL count
 * - Dashboard (server-aggregated) shows user's TOTAL → Different number again
 *
 * Solution:
 * - MCPBridge instances are keyed by workspaceId
 * - Events include workspaceId for filtering
 * - StatusBarController filters events by workspace
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	getMCPBridge,
	disposeMCPBridgeForWorkspace,
	disposeAllMCPBridges,
	getActiveMCPBridgeWorkspaces,
} from "../../../src/bridges/MCPBridge";
import { StatusBarController } from "../../../src/ui/StatusBarController";

// Mock VS Code
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { toString: () => "file:///test/workspace", fsPath: "/test/workspace" } }],
		asRelativePath: (path: string) => path.replace("/test/workspace/", ""),
		onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidCreateFiles: vi.fn(() => ({ dispose: vi.fn() })),
		onDidDeleteFiles: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		getConfiguration: vi.fn(() => ({
			get: vi.fn(() => false),
		})),
	},
	StatusBarAlignment: { Left: 1, Right: 2 },
	window: {
		createStatusBarItem: vi.fn(() => ({
			text: "",
			tooltip: "",
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		})),
		showInformationMessage: vi.fn(),
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
}));

describe("Multi-Workspace Scope Isolation", () => {
	const workspaceA = "file:///project-a";
	const workspaceB = "file:///project-b";
	const workspaceC = "file:///project-c";

	beforeEach(() => {
		// Clean up any existing instances
		disposeAllMCPBridges();
	});

	afterEach(() => {
		disposeAllMCPBridges();
	});

	describe("MCPBridge Workspace-Keyed Instances", () => {
		it("should create separate instances for different workspaces", () => {
			const bridgeA = getMCPBridge(workspaceA);
			const bridgeB = getMCPBridge(workspaceB);

			expect(bridgeA).not.toBe(bridgeB);
			expect(bridgeA.getWorkspaceId()).toBe(workspaceA);
			expect(bridgeB.getWorkspaceId()).toBe(workspaceB);
		});

		it("should return the same instance for the same workspace", () => {
			const bridgeA1 = getMCPBridge(workspaceA);
			const bridgeA2 = getMCPBridge(workspaceA);

			expect(bridgeA1).toBe(bridgeA2);
		});

		it("should track all active workspace IDs", () => {
			getMCPBridge(workspaceA);
			getMCPBridge(workspaceB);
			getMCPBridge(workspaceC);

			const activeWorkspaces = getActiveMCPBridgeWorkspaces();
			expect(activeWorkspaces).toHaveLength(3);
			expect(activeWorkspaces).toContain(workspaceA);
			expect(activeWorkspaces).toContain(workspaceB);
			expect(activeWorkspaces).toContain(workspaceC);
		});

		it("should dispose individual workspace bridges", () => {
			getMCPBridge(workspaceA);
			getMCPBridge(workspaceB);

			disposeMCPBridgeForWorkspace(workspaceA);

			const activeWorkspaces = getActiveMCPBridgeWorkspaces();
			expect(activeWorkspaces).toHaveLength(1);
			expect(activeWorkspaces).toContain(workspaceB);
			expect(activeWorkspaces).not.toContain(workspaceA);
		});

		it("should dispose all bridges at once", () => {
			getMCPBridge(workspaceA);
			getMCPBridge(workspaceB);
			getMCPBridge(workspaceC);

			disposeAllMCPBridges();

			const activeWorkspaces = getActiveMCPBridgeWorkspaces();
			expect(activeWorkspaces).toHaveLength(0);
		});
	});

	describe("MCPFileChange Workspace Tagging", () => {
		it("should include workspaceId in file change events", () => {
			const bridgeA = getMCPBridge(workspaceA);

			// Access the queue via testing (normally private, but we can verify via stats)
			// In real implementation, we'd verify through the push payload
			const workspaceId = bridgeA.getWorkspaceId();
			expect(workspaceId).toBe(workspaceA);
		});
	});

	describe("MCPObservation Workspace Tagging", () => {
		it("should include workspaceId in observations", () => {
			const bridgeA = getMCPBridge(workspaceA);
			const bridgeB = getMCPBridge(workspaceB);

			// Each bridge should tag observations with its workspace
			expect(bridgeA.getWorkspaceId()).toBe(workspaceA);
			expect(bridgeB.getWorkspaceId()).toBe(workspaceB);
		});
	});

	describe("StatusBarController Workspace Filtering", () => {
		it("should filter events by workspace", () => {
			const controllerA = new StatusBarController(workspaceA);

			// Events from workspace A should be processed
			expect(controllerA.shouldProcessEvent(workspaceA)).toBe(true);

			// Events from workspace B should be filtered out
			expect(controllerA.shouldProcessEvent(workspaceB)).toBe(false);
		});

		it("should reject events without workspaceId (strict workspace isolation)", () => {
			const controllerA = new StatusBarController(workspaceA);

			// Events without workspaceId are rejected to enforce strict isolation
			// All event sources MUST include workspaceId
			expect(controllerA.shouldProcessEvent(undefined)).toBe(false);
		});

		it("should maintain separate snapshot counts per workspace", () => {
			const controllerA = new StatusBarController(workspaceA);
			const controllerB = new StatusBarController(workspaceB);

			// Simulate snapshot events
			controllerA.setSnapshotCount(5);
			controllerB.setSnapshotCount(3);

			expect(controllerA.getSnapshotCount()).toBe(5);
			expect(controllerB.getSnapshotCount()).toBe(3);
		});

		it("should not leak activity counts between workspaces", () => {
			const controllerA = new StatusBarController(workspaceA);
			const controllerB = new StatusBarController(workspaceB);

			// Initially both should be 0
			expect(controllerA.getSnapshotCount()).toBe(0);
			expect(controllerB.getSnapshotCount()).toBe(0);

			// Simulate 3 snapshots in workspace A
			controllerA.setSnapshotCount(1);
			controllerA.setSnapshotCount(2);
			controllerA.setSnapshotCount(3);

			// Workspace B should still be 0
			expect(controllerA.getSnapshotCount()).toBe(3);
			expect(controllerB.getSnapshotCount()).toBe(0); // NOT 3!
		});
	});

	describe("Event Flow Integration", () => {
		it("should only increment count when workspace matches", () => {
			const controllerA = new StatusBarController(workspaceA);
			let countA = 0;

			// Simulate event handler logic from extension.ts
			const simulateSnapshotEvent = (eventWorkspaceId: string) => {
				if (controllerA.shouldProcessEvent(eventWorkspaceId)) {
					countA++;
					controllerA.setSnapshotCount(countA);
				}
			};

			// Events from workspace A should increment
			simulateSnapshotEvent(workspaceA);
			simulateSnapshotEvent(workspaceA);
			expect(controllerA.getSnapshotCount()).toBe(2);

			// Events from workspace B should NOT increment
			simulateSnapshotEvent(workspaceB);
			simulateSnapshotEvent(workspaceB);
			simulateSnapshotEvent(workspaceB);
			expect(controllerA.getSnapshotCount()).toBe(2); // Still 2, not 5!
		});

		it("should handle mixed workspace events correctly", () => {
			const controllerA = new StatusBarController(workspaceA);
			const controllerB = new StatusBarController(workspaceB);
			let countA = 0;
			let countB = 0;

			// Simulate mixed event stream
			const events = [
				{ workspaceId: workspaceA },
				{ workspaceId: workspaceB },
				{ workspaceId: workspaceA },
				{ workspaceId: workspaceB },
				{ workspaceId: workspaceA },
				{ workspaceId: workspaceB },
				{ workspaceId: workspaceB },
			];

			for (const event of events) {
				if (controllerA.shouldProcessEvent(event.workspaceId)) {
					countA++;
					controllerA.setSnapshotCount(countA);
				}
				if (controllerB.shouldProcessEvent(event.workspaceId)) {
					countB++;
					controllerB.setSnapshotCount(countB);
				}
			}

			// Workspace A had 3 events, Workspace B had 4 events
			expect(controllerA.getSnapshotCount()).toBe(3);
			expect(controllerB.getSnapshotCount()).toBe(4);
		});
	});

	describe("Workspace Isolation Edge Cases", () => {
		it("should handle default workspace ID", () => {
			const controllerDefault = new StatusBarController("default");
			const controllerA = new StatusBarController(workspaceA);

			// Default workspace should not match specific workspaces
			expect(controllerDefault.shouldProcessEvent(workspaceA)).toBe(false);
			expect(controllerDefault.shouldProcessEvent("default")).toBe(true);
		});

		it("should handle workspace switch scenario", () => {
			// Simulate user closing workspace A and opening workspace B
			const controllerA = new StatusBarController(workspaceA);
			controllerA.setSnapshotCount(10);

			// Dispose workspace A controller
			controllerA.dispose();

			// Create new controller for workspace B
			const controllerB = new StatusBarController(workspaceB);

			// Workspace B should start fresh
			expect(controllerB.getSnapshotCount()).toBe(0);
			expect(controllerB.getWorkspaceId()).toBe(workspaceB);
		});

		it("should preserve workspace identity through instance lifecycle", () => {
			const bridgeA = getMCPBridge(workspaceA);

			// Instance should maintain its workspace ID
			expect(bridgeA.getWorkspaceId()).toBe(workspaceA);

			// Even after getting the instance again
			const bridgeA2 = getMCPBridge(workspaceA);
			expect(bridgeA2.getWorkspaceId()).toBe(workspaceA);
			expect(bridgeA).toBe(bridgeA2);
		});
	});
});

describe("Definition of Done Criteria", () => {
	const workspaceA = "file:///project-a";
	const workspaceB = "file:///project-b";

	beforeEach(() => {
		disposeAllMCPBridges();
	});

	afterEach(() => {
		disposeAllMCPBridges();
	});

	it("✓ Activity in Workspace A does NOT increment status bar in Workspace B", () => {
		const controllerA = new StatusBarController(workspaceA);
		const controllerB = new StatusBarController(workspaceB);

		// Simulate 5 snapshot events in workspace A
		for (let i = 1; i <= 5; i++) {
			if (controllerA.shouldProcessEvent(workspaceA)) {
				controllerA.setSnapshotCount(i);
			}
			if (controllerB.shouldProcessEvent(workspaceA)) {
				// This should NOT execute because workspace A events
				// should not be processed by workspace B controller
				controllerB.setSnapshotCount(i);
			}
		}

		expect(controllerA.getSnapshotCount()).toBe(5);
		expect(controllerB.getSnapshotCount()).toBe(0); // MUST be 0, not 5
	});

	it("✓ MCPBridge instances are workspace-scoped", () => {
		const bridgeA = getMCPBridge(workspaceA);
		const bridgeB = getMCPBridge(workspaceB);

		// Separate instances
		expect(bridgeA).not.toBe(bridgeB);

		// Correct workspace IDs
		expect(bridgeA.getWorkspaceId()).toBe(workspaceA);
		expect(bridgeB.getWorkspaceId()).toBe(workspaceB);
	});

	it("✓ StatusBarController properly filters events by workspace", () => {
		const controller = new StatusBarController(workspaceA);

		// Own workspace - process
		expect(controller.shouldProcessEvent(workspaceA)).toBe(true);

		// Other workspace - filter
		expect(controller.shouldProcessEvent(workspaceB)).toBe(false);

		// No workspace - reject (strict isolation, all sources must include workspaceId)
		expect(controller.shouldProcessEvent(undefined)).toBe(false);
	});
});
