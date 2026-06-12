/**
 * DaemonBridge Tests
 *
 * Comprehensive test suite for DaemonBridge covering:
 * - Constructor initialization
 * - State machine (getState, transitionTo)
 * - Connection management (connect, disconnect, scheduleReconnect)
 * - Health monitoring delegation
 * - Notification handling
 * - Snapshot operations
 * - Session operations
 * - Request/response handling
 * - Performance metrics
 * - Lifecycle (dispose)
 * - Registry functions
 *
 * @module test/unit/DaemonBridge.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DaemonBridge,
	disposeAllDaemonBridges,
	disposeDaemonBridge,
	getActiveWorkspaces,
	getCurrentWorkspaceId,
	getDaemonBridge,
	resetDaemonCircuitBreaker,
} from "../../src/services/DaemonBridge";
import { toRelativePath, toRelativePaths } from "../../src/services/daemon-bridge";
import { mockVscodeWorkspace, mockVscodeWindow } from "./setup";
import {
	mockCall,
	mockClose,
	mockConnect,
	mockInitialize,
	mockIsConnected,
	mockOn,
	resetMockClient,
} from "../../__mocks__/@vreko/local-service-client.mjs";
import { existsSync, readFileSync } from "../../__mocks__/node:fs.mjs";

// =============================================================================
// HELPER: Setup bridge as connected
// =============================================================================

/**
 * Set up a bridge as already connected for testing operations
 */
function setupConnectedBridge(bridge: DaemonBridge): void {
	// Set internal state
	(bridge as any)._state = "connected";
	// Mock isConnected to return true
	mockIsConnected.mockReturnValue(true);
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe("DaemonBridge", () => {
	let bridge: DaemonBridge;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();
		resetMockClient();

		// Reset mock client state
		mockIsConnected.mockReturnValue(false);
		mockConnect.mockResolvedValue(undefined);
		mockInitialize.mockResolvedValue(undefined);
		mockCall.mockResolvedValue({ pong: true, uptime: 1000, version: "1.0.0" });

		// Reset fs mocks
		existsSync.mockReturnValue(true);
		readFileSync.mockReturnValue("12345");

		// Setup vscode workspace mock
		(mockVscodeWorkspace as any).workspaceFolders = [{ uri: { fsPath: "/workspace/test" } }];
		(mockVscodeWorkspace as any).getWorkspaceFolder = vi.fn().mockReturnValue({ uri: { fsPath: "/workspace/test" } });

		// Create fresh bridge instance
		bridge = new DaemonBridge();

		// Use fake timers
		vi.useFakeTimers();
	});

	afterEach(() => {
		if (bridge) {
			bridge.dispose();
		}
		vi.useRealTimers();
	});

	// =========================================================================
	// INITIALIZATION
	// =========================================================================

	describe("constructor", () => {
		it("should initialize with disconnected state", () => {
			const newBridge = new DaemonBridge();
			expect(newBridge.getState()).toBe("disconnected");
			newBridge.dispose();
		});

		it("should register notification handler on client", () => {
			expect(mockOn).toHaveBeenCalledWith("notification", expect.any(Function));
		});

		it("should register disconnected handler on client", () => {
			expect(mockOn).toHaveBeenCalledWith("disconnected", expect.any(Function));
		});
	});

	// =========================================================================
	// STATE MACHINE
	// =========================================================================

	describe("getState", () => {
		it("should return disconnected initially", () => {
			expect(bridge.getState()).toBe("disconnected");
		});
	});

	describe("transitionTo", () => {
		it("should update state", () => {
			bridge["transitionTo"]("connected");
			expect(bridge.getState()).toBe("connected");
		});

		it("should not transition to same state (except reconnecting)", () => {
			const onStateChange = vi.fn();
			bridge.onStateChange(onStateChange);

			bridge["transitionTo"]("connected");
			bridge["transitionTo"]("connected");

			expect(onStateChange).toHaveBeenCalledTimes(1);
		});

		it("should allow multiple transitions to reconnecting", () => {
			const onStateChange = vi.fn();
			bridge.onStateChange(onStateChange);

			bridge["transitionTo"]("reconnecting");
			bridge["transitionTo"]("reconnecting");

			expect(onStateChange).toHaveBeenCalledTimes(2);
		});

		it("should fire StateChangeEvent with correct data", () => {
			const onStateChange = vi.fn();
			bridge.onStateChange(onStateChange);

			bridge["transitionTo"]("connected", { daemonVersion: "1.2.3" });

			expect(onStateChange).toHaveBeenCalledWith(
				expect.objectContaining({
					state: "connected",
					previousState: "disconnected",
					daemonVersion: "1.2.3",
				}),
			);
		});

		it("should fire onConnectionChanged event", () => {
			const onConnectionChanged = vi.fn();
			bridge.onConnectionChanged(onConnectionChanged);

			bridge["transitionTo"]("connected");

			expect(onConnectionChanged).toHaveBeenCalledWith(true);
		});

		it("should fire onConnectionChanged with false when transitioning from connected", () => {
			const onConnectionChanged = vi.fn();
			bridge.onConnectionChanged(onConnectionChanged);

			// First go to connected, then back to disconnected
			bridge["transitionTo"]("connected");
			bridge["transitionTo"]("disconnected");

			expect(onConnectionChanged).toHaveBeenCalledWith(false);
		});
	});

	// =========================================================================
	// CONNECTION MANAGEMENT
	// =========================================================================

	describe("isConnected", () => {
		it("should return client connection status", () => {
			mockIsConnected.mockReturnValue(true);
			expect(bridge.isConnected()).toBe(true);

			mockIsConnected.mockReturnValue(false);
			expect(bridge.isConnected()).toBe(false);
		});
	});

	describe("connect", () => {
		it("should return true if already connected", async () => {
			mockIsConnected.mockReturnValue(true);

			const result = await bridge.connect();

			expect(result).toBe(true);
			expect(mockConnect).not.toHaveBeenCalled();
		});

		it("should return false if already connecting", async () => {
			bridge["isConnecting"] = true;

			const result = await bridge.connect();

			expect(result).toBe(false);
		});

		it("should verify auto-start with an isolated probe instead of recursively awaiting connect()", async () => {
			const connectionManager = (bridge as any).connectionManager;
			const probeSpy = vi.spyOn(bridge as any, "probeDaemonStartup").mockResolvedValue(true);
			const pingSpy = vi.spyOn((bridge as any).daemonOperations, "ping").mockResolvedValue({
				pong: true,
				uptime: 1000,
				version: "1.0.0",
			});

			vi.spyOn(connectionManager, "isDaemonRunning").mockReturnValue(false);
			vi.spyOn(connectionManager, "autoStartDaemon").mockImplementation(async (verifyCallback?: () => Promise<boolean>) => {
				expect(await verifyCallback?.()).toBe(true);
				return true;
			});

			const result = await bridge.connect();

			expect(result).toBe(true);
			expect(probeSpy).toHaveBeenCalledTimes(1);
			expect(pingSpy).toHaveBeenCalled();
			expect(bridge["connectPromise"]).toBeNull();
		});
	});

	describe("disconnect", () => {
		it("should close client connection", () => {
			bridge.disconnect();

			expect(mockClose).toHaveBeenCalled();
		});

		it("should transition to disconnected state", () => {
			// First go to connected, then disconnect
			bridge["transitionTo"]("connected");

			const onStateChange = vi.fn();
			bridge.onStateChange(onStateChange);

			bridge.disconnect();

			expect(bridge.getState()).toBe("disconnected");
			expect(onStateChange).toHaveBeenCalledWith(
				expect.objectContaining({
					state: "disconnected",
					reason: "Manual disconnect",
				}),
			);
		});
	});

	// =========================================================================
	// HEALTH MONITORING DELEGATION
	// =========================================================================

	describe("isHealthy", () => {
		it("should return true initially when connected (no checks yet)", () => {
			// Bridge needs to be connected to be considered healthy
			setupConnectedBridge(bridge);
			expect(bridge.isHealthy()).toBe(true);
		});

		it("should return false when disconnected", () => {
			expect(bridge.isHealthy()).toBe(false);
		});
	});

	describe("getLastHealthCheckTime", () => {
		it("should return null initially", () => {
			expect(bridge.getLastHealthCheckTime()).toBeNull();
		});
	});

	// =========================================================================
	// NOTIFICATION HANDLING
	// =========================================================================

	describe("handleNotification", () => {
		it("should fire onRiskDetected for risk.detected type", () => {
			const onRiskDetected = vi.fn();
			bridge.onRiskDetected(onRiskDetected);

			// Get notification handler from mock client
			const notificationHandler = mockOn.mock.calls.find(
				(call: unknown[]) => call[0] === "notification",
			)?.[1];

			// Simulate daemon notification
			notificationHandler?.("event", {
				type: "risk.detected",
				data: {
					file: "/workspace/test/file.ts",
					changeType: "change",
					riskLevel: "high",
					reason: "Large file deletion",
					suggestion: "Create snapshot before deletion",
				},
			});

			expect(onRiskDetected).toHaveBeenCalled();
		});

		it("should fire onSnapshotCreated for snapshot.created type", () => {
			const onSnapshotCreated = vi.fn();
			bridge.onSnapshotCreated(onSnapshotCreated);

			// Get notification handler from mock client
			const notificationHandler = mockOn.mock.calls.find(
				(call: unknown[]) => call[0] === "notification",
			)?.[1];

			// Simulate daemon notification
			notificationHandler?.("event", {
				type: "snapshot.created",
				data: {
					snapshotId: "snap-123",
					filePath: "/workspace/test/file.ts",
					trigger: "manual",
					source: "extension",
					workspaceId: "ws-1",
				},
			});

			expect(onSnapshotCreated).toHaveBeenCalled();
		});

		it("should fire onDaemonShuttingDown for daemon.shutdown type", () => {
			const onDaemonShuttingDown = vi.fn();
			bridge.onDaemonShuttingDown(onDaemonShuttingDown);

			// Get notification handler from mock client
			const notificationHandler = mockOn.mock.calls.find(
				(call: unknown[]) => call[0] === "notification",
			)?.[1];

			// Simulate daemon notification
			notificationHandler?.("event", {
				type: "daemon.shutdown",
				data: {},
			});

			expect(onDaemonShuttingDown).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// REQUEST HANDLING
	// =========================================================================

	describe("request", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should call client with normalized method", async () => {
			mockCall.mockResolvedValue({ result: "ok" });

			await bridge.request("watch.subscribe", { workspace: "/workspace/test" });

			expect(mockCall).toHaveBeenCalledWith("watch/subscribe", { workspace: "/workspace/test" });
		});

		it("should normalize method with METHOD_MAP", async () => {
			mockCall.mockResolvedValue({ result: "ok" });

			// daemon.ping is mapped to health/ping
			await bridge.request("daemon.ping", {});

			expect(mockCall).toHaveBeenCalledWith("health/ping", {});
		});

		it("should record response time on success", async () => {
			mockCall.mockResolvedValue({ result: "ok" });

			await bridge.request("daemon.ping", {});

			const metrics = bridge.getAverageDaemonResponseTime();
			expect(metrics.samples).toBeGreaterThanOrEqual(1);
		});

		it("should record response time on failure", async () => {
			mockCall.mockRejectedValue(new Error("Request failed"));

			try {
				await bridge.request("daemon.ping", {});
			} catch {
				// Expected
			}

			const metrics = bridge.getAverageDaemonResponseTime();
			expect(metrics.samples).toBeGreaterThanOrEqual(1);
		});
	});

	describe("getAverageDaemonResponseTime", () => {
		it("should return zeros with no samples", () => {
			const metrics = bridge.getAverageDaemonResponseTime();

			expect(metrics).toEqual({ averageMs: 0, samples: 0, p95Ms: 0 });
		});

		it("should calculate average and p95 from samples", () => {
			// Add samples directly
			bridge["responseTimeSamples"] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

			const metrics = bridge.getAverageDaemonResponseTime();

			expect(metrics.samples).toBe(10);
			expect(metrics.averageMs).toBe(55);
			// p95Index = Math.floor(10 * 0.95) = 9, sorted[9] = 100
			expect(metrics.p95Ms).toBe(100);
		});

		it("should use nearest-rank method for p95", () => {
			// With 20 samples, p95Index = Math.floor(20 * 0.95) = 19
			bridge["responseTimeSamples"] = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);

			const metrics = bridge.getAverageDaemonResponseTime();

			// sorted[19] = 100
			expect(metrics.p95Ms).toBe(100);
		});
	});

	// =========================================================================
	// DAEMON OPERATIONS
	// =========================================================================

	describe("ping", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should call daemon.ping method", async () => {
			mockCall.mockResolvedValue({ pong: true, uptime: 5000, version: "1.0.0" });

			const result = await bridge.ping();

			// daemon.ping maps to health/ping via METHOD_MAP
			expect(mockCall).toHaveBeenCalledWith("health/ping", {});
			expect(result).toEqual({ pong: true, uptime: 5000, version: "1.0.0" });
		});
	});

	describe("getStatus", () => {
		it("should return disconnected status when not connected", async () => {
			mockIsConnected.mockReturnValue(false);

			const status = await bridge.getStatus();

			expect(status).toEqual({ connected: false });
		});

		it("should return full status when connected", async () => {
			setupConnectedBridge(bridge);
			mockCall.mockResolvedValue({
				pid: 12345,
				version: "1.0.0",
				uptime: 3600,
				workspaces: 2,
			});

			const status = await bridge.getStatus();

			expect(status).toEqual({
				connected: true,
				pid: 12345,
				version: "1.0.0",
				uptime: 3600,
				workspaces: 2,
			});
		});

		it("should return disconnected on error", async () => {
			setupConnectedBridge(bridge);
			mockCall.mockRejectedValue(new Error("Failed"));

			const status = await bridge.getStatus();

			expect(status).toEqual({ connected: false });
		});
	});

	// =========================================================================
	// SNAPSHOT OPERATIONS
	// =========================================================================

	describe("createSnapshot", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should create snapshot with files", async () => {
			mockCall.mockResolvedValue({
				snapshotId: "snap-1",
				createdAt: "2024-01-01T00:00:00Z",
			});

			const result = await bridge.createSnapshot("/workspace/test", ["/workspace/test/file.ts"]);

			// Method is normalized: snapshot.create -> snapshot/create
			expect(mockCall).toHaveBeenCalledWith(
				"snapshot/create",
				expect.objectContaining({
					workspace: "/workspace/test",
					files: ["file.ts"],
				}),
			);
			expect(result).toEqual({
				snapshotId: "snap-1",
				createdAt: "2024-01-01T00:00:00Z",
			});
		});

		it("should convert absolute paths to relative", async () => {
			mockCall.mockResolvedValue({
				snapshotId: "snap-1",
				createdAt: "2024-01-01T00:00:00Z",
			});

			await bridge.createSnapshot("/workspace/test", [
				"/workspace/test/src/file1.ts",
				"/workspace/test/src/file2.ts",
			]);

			expect(mockCall).toHaveBeenCalledWith(
				"snapshot/create",
				expect.objectContaining({
					files: ["src/file1.ts", "src/file2.ts"],
				}),
			);
		});
	});

	describe("listSnapshots", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should list snapshots for workspace", async () => {
			// Daemon returns { id: "..." } which is normalized to { snapshotId: "..." }
			mockCall.mockResolvedValue({
				snapshots: [
					{ id: "snap-1", createdAt: 1704067200000, files: ["file.ts"] },
				],
			});

			const result = await bridge.listSnapshots("/workspace/test");

			expect(mockCall).toHaveBeenCalledWith("snapshot/list", {
				workspace: "/workspace/test",
			});
			// Result is normalized from { id } to { snapshotId }
			expect(result).toEqual([
				{ snapshotId: "snap-1", createdAt: 1704067200000, files: ["file.ts"] },
			]);
		});
	});

	describe("restoreSnapshot", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should restore snapshot", async () => {
			mockCall.mockResolvedValue({
				restored: ["file.ts"],
				skipped: ["other.ts"],
			});

			const result = await bridge.restoreSnapshot("/workspace/test", "snap-1");

			expect(mockCall).toHaveBeenCalledWith("snapshot/restore", {
				workspace: "/workspace/test",
				snapshotId: "snap-1",
			});
			expect(result).toEqual({ restored: ["file.ts"], skipped: ["other.ts"] });
		});
	});

	// =========================================================================
	// SESSION OPERATIONS
	// =========================================================================

	describe("beginSession", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should begin session with task", async () => {
			const mockResult = {
				taskId: "task-1",
				patterns: [{ name: "pattern1", description: "desc" }],
				constraints: [],
				learnings: [],
				risk: { level: "low", factors: [] },
				nextActions: [],
			};
			mockCall.mockResolvedValue(mockResult);

			const result = await bridge.beginSession("/workspace/test", "Refactor module");

			expect(mockCall).toHaveBeenCalledWith("session/start", {
				workspacePath: "/workspace/test",
				task: "Refactor module",
				files: undefined,
				keywords: undefined,
			});
			expect(result).toEqual(mockResult);
		});
	});

	describe("endSession", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should end session with outcome", async () => {
			const mockResult = {
				finalized: true,
				sessionId: "sess-1",
				filesModified: 5,
				snapshotId: "snap-1",
			};
			mockCall.mockResolvedValue(mockResult);

			const result = await bridge.endSession("/workspace/test", "completed", true, "All done");

			// Method is normalized via METHOD_MAP: session.end -> session/end-daemon
			expect(mockCall).toHaveBeenCalledWith("session/end-daemon", {
				workspace: "/workspace/test",
				outcome: "completed",
				createSnapshot: true,
				notes: "All done",
			});
			expect(result).toEqual(mockResult);
		});
	});

	// =========================================================================
	// FILE WATCHING
	// =========================================================================

	describe("subscribeToFileWatching", () => {
		it("should subscribe to workspace", async () => {
			setupConnectedBridge(bridge);
			mockCall.mockResolvedValue(undefined);

			const result = await bridge.subscribeToFileWatching("/workspace/test");

			expect(mockCall).toHaveBeenCalledWith("watch/subscribe", {
				workspace: "/workspace/test",
			});
			expect(result).toBe(true);
		});

		it("should return false on error", async () => {
			setupConnectedBridge(bridge);
			mockCall.mockRejectedValue(new Error("Failed"));

			const result = await bridge.subscribeToFileWatching("/workspace/test");

			expect(result).toBe(false);
		});
	});

	describe("unsubscribeFromFileWatching", () => {
		it("should return false if not connected", async () => {
			mockIsConnected.mockReturnValue(false);

			const result = await bridge.unsubscribeFromFileWatching("/workspace/test");

			expect(result).toBe(false);
		});

		it("should unsubscribe from workspace", async () => {
			setupConnectedBridge(bridge);
			mockCall.mockResolvedValue(undefined);

			const result = await bridge.unsubscribeFromFileWatching("/workspace/test");

			expect(mockCall).toHaveBeenCalledWith("watch/unsubscribe", {
				workspace: "/workspace/test",
			});
			expect(result).toBe(true);
		});
	});

	// =========================================================================
	// PROTECTION OPERATIONS
	// =========================================================================

	describe("getProtectionLevel", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should get protection level for file", async () => {
			mockCall.mockResolvedValue({ level: "block", reason: "Important file", pattern: "*.ts" });

			const result = await bridge.getProtectionLevel("/workspace/test", "/workspace/test/src/file.ts");

			// Method is normalized via METHOD_MAP: protection.getLevel -> protection/get-level
			expect(mockCall).toHaveBeenCalledWith("protection/get-level", {
				workspace: "/workspace/test",
				filePath: "src/file.ts",
			});
			expect(result).toEqual({ level: "block", reason: "Important file", pattern: "*.ts" });
		});
	});

	// =========================================================================
	// LEARNING OPERATIONS
	// =========================================================================

	describe("addLearning", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should add learning", async () => {
			mockCall.mockResolvedValue({ id: "learn-1", recorded: true });

			const result = await bridge.addLearning("/workspace/test", {
				trigger: "Large refactor",
				action: "Create snapshot first",
				type: "pattern",
			});

			expect(mockCall).toHaveBeenCalledWith("learning/add", {
				workspace: "/workspace/test",
				trigger: "Large refactor",
				action: "Create snapshot first",
				type: "pattern",
			});
			expect(result).toEqual({ id: "learn-1", recorded: true });
		});
	});

	// =========================================================================
	// VALIDATION OPERATIONS
	// =========================================================================

	describe("validateQuick", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should validate files quickly", async () => {
			const mockResult = {
				passed: true,
				errors: [],
				warnings: [],
			};
			mockCall.mockResolvedValue(mockResult);

			const result = await bridge.validateQuick("/workspace/test", ["/workspace/test/src/file.ts"]);

			expect(mockCall).toHaveBeenCalledWith("validate/quick", {
				workspace: "/workspace/test",
				files: ["src/file.ts"],
			});
			expect(result).toEqual(mockResult);
		});
	});

	// =========================================================================
	// CONTEXT OPERATIONS
	// =========================================================================

	describe("getContext", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should get context for task", async () => {
			const mockResult = {
				patterns: "pattern description",
				constraints: [],
				learnings: [],
			};
			mockCall.mockResolvedValue(mockResult);

			const result = await bridge.getContext("/workspace/test", "Refactor module", ["typescript"]);

			expect(mockCall).toHaveBeenCalledWith("context/get", {
				workspace: "/workspace/test",
				task: "Refactor module",
				keywords: ["typescript"],
			});
			expect(result).toEqual(mockResult);
		});
	});

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	describe("dispose", () => {
		it("should close client connection", () => {
			bridge.dispose();

			expect(mockClose).toHaveBeenCalled();
		});

		it("should be safe to call multiple times", () => {
			expect(() => {
				bridge.dispose();
				bridge.dispose();
			}).not.toThrow();
		});
	});

	// =========================================================================
	// REGISTRY FUNCTIONS
	// =========================================================================

	describe("getDaemonBridge", () => {
		afterEach(() => {
			disposeAllDaemonBridges();
		});

		it("should create new bridge for new workspace", () => {
			const bridge1 = getDaemonBridge("workspace-1");

			expect(bridge1).toBeInstanceOf(DaemonBridge);
		});

		it("should return same bridge for same workspace", () => {
			const bridge1 = getDaemonBridge("workspace-1");
			const bridge2 = getDaemonBridge("workspace-1");

			expect(bridge1).toBe(bridge2);
		});

		it("should create different bridges for different workspaces", () => {
			const bridge1 = getDaemonBridge("workspace-1");
			const bridge2 = getDaemonBridge("workspace-2");

			expect(bridge1).not.toBe(bridge2);
		});
	});

	describe("disposeDaemonBridge", () => {
		it("should dispose and remove bridge from registry", () => {
			const bridge1 = getDaemonBridge("workspace-to-dispose");
			const disposeSpy = vi.spyOn(bridge1, "dispose");

			disposeDaemonBridge("workspace-to-dispose");

			expect(disposeSpy).toHaveBeenCalled();
			expect(getActiveWorkspaces()).not.toContain("workspace-to-dispose");
		});

		it("should do nothing if workspace not in registry", () => {
			expect(() => disposeDaemonBridge("non-existent")).not.toThrow();
		});
	});

	describe("disposeAllDaemonBridges", () => {
		it("should dispose all bridges", () => {
			getDaemonBridge("workspace-1");
			getDaemonBridge("workspace-2");

			disposeAllDaemonBridges();

			expect(getActiveWorkspaces()).toHaveLength(0);
		});
	});

	describe("getActiveWorkspaces", () => {
		afterEach(() => {
			disposeAllDaemonBridges();
		});

		it("should return empty array when no workspaces", () => {
			disposeAllDaemonBridges();

			expect(getActiveWorkspaces()).toEqual([]);
		});

		it("should return all active workspace IDs", () => {
			getDaemonBridge("workspace-1");
			getDaemonBridge("workspace-2");

			expect(getActiveWorkspaces()).toEqual(expect.arrayContaining(["workspace-1", "workspace-2"]));
		});
	});

	describe("getCurrentWorkspaceId", () => {
		it("should return null when no active editor or workspace", () => {
			(mockVscodeWorkspace as any).workspaceFolders = undefined;
			(mockVscodeWindow as any).activeTextEditor = null;

			expect(getCurrentWorkspaceId()).toBeNull();
		});

		it("should return workspace from active editor", () => {
			(mockVscodeWindow as any).activeTextEditor = {
				document: { uri: { fsPath: "/workspace/test/file.ts" } },
			};
			(mockVscodeWorkspace as any).getWorkspaceFolder.mockReturnValue({ uri: { fsPath: "/workspace/test" } });

			expect(getCurrentWorkspaceId()).toBe("/workspace/test");
		});

		it("should return first workspace folder when no active editor", () => {
			(mockVscodeWindow as any).activeTextEditor = null;
			(mockVscodeWorkspace as any).workspaceFolders = [{ uri: { fsPath: "/workspace/test" } }];

			expect(getCurrentWorkspaceId()).toBe("/workspace/test");
		});
	});

	describe("resetDaemonCircuitBreaker", () => {
		it("should reset circuit breaker", () => {
			resetDaemonCircuitBreaker();
			// Should not throw
			expect(true).toBe(true);
		});
	});

	// =========================================================================
	// PATH CONVERSION
	// =========================================================================

	describe("toRelativePath", () => {
		it("should convert absolute path to relative", () => {
			const result = toRelativePath("/workspace/test", "/workspace/test/src/file.ts");

			expect(result).toBe("src/file.ts");
		});

		it("should return unchanged if not under workspace", () => {
			const result = toRelativePath("/workspace/test", "/other/path/file.ts");

			expect(result).toBe("/other/path/file.ts");
		});

		it("should return unchanged if already relative", () => {
			const result = toRelativePath("/workspace/test", "src/file.ts");

			expect(result).toBe("src/file.ts");
		});
	});

	describe("toRelativePaths", () => {
		it("should convert multiple paths", () => {
			const result = toRelativePaths("/workspace/test", [
				"/workspace/test/src/file1.ts",
				"/workspace/test/src/file2.ts",
			]);

			expect(result).toEqual(["src/file1.ts", "src/file2.ts"]);
		});
	});

	// =========================================================================
	// CLIENT EVENT HANDLERS
	// =========================================================================

	describe("client disconnected event", () => {
		it("should schedule reconnect on disconnect", () => {
			// Get the disconnected handler
			const disconnectedHandler = mockOn.mock.calls.find(
				(call: unknown[]) => call[0] === "disconnected",
			)?.[1];

			if (disconnectedHandler) {
				disconnectedHandler();
			}

			// Should transition to reconnecting state
			expect(bridge.getState()).toBe("reconnecting");
		});
	});
});
