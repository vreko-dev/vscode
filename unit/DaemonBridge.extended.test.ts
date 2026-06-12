/**
 * DaemonBridge Tests - Extended Coverage
 *
 * Additional tests to achieve ≥85% coverage for DaemonBridge.
 * Tests methods that were missing from the initial test suite.
 *
 * @module test/unit/DaemonBridge.extended.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DaemonBridge,
	disposeAllDaemonBridges,
	getDaemonBridge,
} from "../../src/services/DaemonBridge";
import { circuitBreaker } from "../../src/services/daemon-bridge";
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

function setupConnectedBridge(bridge: DaemonBridge): void {
	(bridge as any)._state = "connected";
	mockIsConnected.mockReturnValue(true);
}

// =============================================================================
// TEST SUITE - Extended Coverage
// =============================================================================

describe("DaemonBridge - Extended Coverage", () => {
	let bridge: DaemonBridge;

	beforeEach(() => {
		vi.clearAllMocks();
		resetMockClient();
		mockIsConnected.mockReturnValue(false);
		mockConnect.mockResolvedValue(undefined);
		mockInitialize.mockResolvedValue(undefined);
		mockCall.mockResolvedValue({ pong: true, uptime: 1000, version: "1.0.0" });
		existsSync.mockReturnValue(true);
		readFileSync.mockReturnValue("12345");
		(mockVscodeWorkspace as any).workspaceFolders = [{ uri: { fsPath: "/workspace/test" } }];
		(mockVscodeWorkspace as any).getWorkspaceFolder = vi.fn().mockReturnValue({ uri: { fsPath: "/workspace/test" } });
		(mockVscodeWorkspace as any).onDidChangeWorkspaceFolders = vi.fn();
		bridge = new DaemonBridge();
		vi.useFakeTimers();
	});

	afterEach(() => {
		if (bridge) {
			bridge.dispose();
		}
		vi.useRealTimers();
	});

	// =========================================================================
	// INITIALIZATION METHOD
	// =========================================================================

	describe("initialize", () => {
		it("should connect and subscribe to workspace folders", async () => {
			const connectSpy = vi.spyOn(bridge, "connect").mockResolvedValue(true);
			const subscribeSpy = vi.spyOn(bridge, "subscribeToFileWatching").mockResolvedValue(true);

			await bridge.initialize();

			expect(connectSpy).toHaveBeenCalled();
			expect(subscribeSpy).toHaveBeenCalledWith("/workspace/test");
		});

		it("should subscribe to existing workspace folders", async () => {
			vi.spyOn(bridge, "connect").mockResolvedValue(true);
			const subscribeSpy = vi.spyOn(bridge, "subscribeToFileWatching").mockResolvedValue(true);

			await bridge.initialize();

			expect(subscribeSpy).toHaveBeenCalledWith("/workspace/test");
		});
	});

	// =========================================================================
	// DAEMON VERSION
	// =========================================================================

	describe("getDaemonVersion", () => {
		it("should return daemon version from health monitor", () => {
			(bridge as any)._daemonVersion = "1.2.3";

			const version = bridge.getDaemonVersion();

			expect(version).toBe("1.2.3");
		});
	});

	// =========================================================================
	// RESET AND RETRY
	// =========================================================================

	describe("resetAndRetry", () => {
		it("should reset circuit breaker and attempt connection", async () => {
			const connectSpy = vi.spyOn(bridge, "connect").mockResolvedValue(true);

			bridge.resetAndRetry();

			await Promise.resolve();
			expect(connectSpy).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// RECONNECT ATTEMPTS
	// =========================================================================

	describe("getReconnectAttempt", () => {
		it("should return reconnect attempt count", () => {
			const attempt = bridge.getReconnectAttempt();
			expect(typeof attempt).toBe("number");
		});
	});

	describe("getMaxReconnectAttempts", () => {
		it("should return max reconnect attempts", () => {
			const max = bridge.getMaxReconnectAttempts();
			expect(typeof max).toBe("number");
		});
	});

	// =========================================================================
	// DAEMON SPAWN STATUS
	// =========================================================================

	describe("isDaemonRunning", () => {
		it("should return daemon running status", () => {
			const result = bridge.isDaemonRunning();
			expect(typeof result).toBe("boolean");
		});
	});

	describe("getDaemonSpawnStatus", () => {
		it("should return spawn status object", () => {
			const status = bridge.getDaemonSpawnStatus();

			expect(status).toHaveProperty("attempts");
			expect(status).toHaveProperty("maxAttempts");
			expect(status).toHaveProperty("isSpawning");
			expect(status).toHaveProperty("cooldownRemaining");
			expect(status).toHaveProperty("exhausted");
		});
	});

	describe("resetDaemonSpawnAttempts", () => {
		it("should reset spawn attempts without error", () => {
			expect(() => bridge.resetDaemonSpawnAttempts()).not.toThrow();
		});
	});

	// =========================================================================
	// SESSION STATUS
	// =========================================================================

	describe("getSessionStatus", () => {
		it("should return null when not connected", async () => {
			mockIsConnected.mockReturnValue(false);

			const result = await bridge.getSessionStatus("/workspace/test");

			expect(result).toBeNull();
		});

		it("should return session status when connected", async () => {
			setupConnectedBridge(bridge);
			mockCall.mockResolvedValue({
				active: true,
				taskId: "task-1",
				task: "Refactoring",
				startedAt: "2024-01-01T00:00:00Z",
				filesModified: 5,
				snapshotCount: 2,
			});

			const result = await bridge.getSessionStatus("/workspace/test");

			expect(mockCall).toHaveBeenCalledWith("session/status", {
				workspacePath: "/workspace/test",
			});
			expect(result).toEqual({
				active: true,
				taskId: "task-1",
				task: "Refactoring",
				startedAt: "2024-01-01T00:00:00Z",
				filesModified: 5,
				snapshotCount: 2,
			});
		});

		it("should return null on error", async () => {
			setupConnectedBridge(bridge);
			mockCall.mockRejectedValue(new Error("Failed"));

			const result = await bridge.getSessionStatus("/workspace/test");

			expect(result).toBeNull();
		});
	});

	// =========================================================================
	// FILE MODIFICATION RECORDING
	// =========================================================================

	describe("recordFileModification", () => {
		it("should return false when not connected", async () => {
			mockIsConnected.mockReturnValue(false);

			const result = await bridge.recordFileModification(
				"/workspace/test",
				"/workspace/test/file.ts",
				10,
				true,
			);

			expect(result).toBe(false);
		});

		it("should record modification when connected", async () => {
			setupConnectedBridge(bridge);
			mockCall.mockResolvedValue(undefined);

			const result = await bridge.recordFileModification(
				"/workspace/test",
				"/workspace/test/file.ts",
				10,
				true,
			);

			expect(mockCall).toHaveBeenCalledWith("intelligence/file-modified", {
				workspace: "/workspace/test",
				path: "file.ts",
				linesChanged: 10,
				aiAttributed: true,
			});
			expect(result).toBe(true);
		});

		it("should return false on error", async () => {
			setupConnectedBridge(bridge);
			mockCall.mockRejectedValue(new Error("Failed"));

			const result = await bridge.recordFileModification(
				"/workspace/test",
				"/workspace/test/file.ts",
				10,
				false,
			);

			expect(result).toBe(false);
		});
	});

	// =========================================================================
	// DELETE SNAPSHOT
	// =========================================================================

	describe("deleteSnapshot", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should delete snapshot", async () => {
			mockCall.mockResolvedValue(undefined);

			await bridge.deleteSnapshot("/workspace/test", "snap-1");

			expect(mockCall).toHaveBeenCalledWith("snapshot/delete", {
				workspace: "/workspace/test",
				snapshotId: "snap-1",
			});
		});
	});

	// =========================================================================
	// BULK DELETE SNAPSHOTS
	// =========================================================================

	describe("bulkDeleteSnapshots", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should bulk delete snapshots with options", async () => {
			mockCall.mockResolvedValue({ success: true, deletedCount: 5 });

			const result = await bridge.bulkDeleteSnapshots("/workspace/test", {
				olderThanDays: 30,
				keepProtected: true,
			});

			expect(mockCall).toHaveBeenCalledWith("snapshot/bulk-delete", {
				workspace: "/workspace/test",
				olderThanDays: 30,
				keepProtected: true,
			});
			expect(result).toEqual({ success: true, deletedCount: 5 });
		});
	});

	// =========================================================================
	// PROTECT/UNPROTECT SNAPSHOT
	// =========================================================================

	describe("protectSnapshot", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should protect snapshot", async () => {
			mockCall.mockResolvedValue({ success: true, snapshotId: "snap-1" });

			const result = await bridge.protectSnapshot("/workspace/test", "snap-1");

			expect(mockCall).toHaveBeenCalledWith("snapshot/protect", {
				workspace: "/workspace/test",
				snapshotId: "snap-1",
			});
			expect(result).toEqual({ success: true, snapshotId: "snap-1" });
		});
	});

	describe("unprotectSnapshot", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should unprotect snapshot", async () => {
			mockCall.mockResolvedValue({ success: true, snapshotId: "snap-1" });

			const result = await bridge.unprotectSnapshot("/workspace/test", "snap-1");

			expect(mockCall).toHaveBeenCalledWith("snapshot/unprotect", {
				workspace: "/workspace/test",
				snapshotId: "snap-1",
			});
			expect(result).toEqual({ success: true, snapshotId: "snap-1" });
		});
	});

	// =========================================================================
	// RENAME SNAPSHOT
	// =========================================================================

	describe("renameSnapshot", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should rename snapshot", async () => {
			mockCall.mockResolvedValue({ success: true, snapshotId: "snap-1", newName: "My Snapshot" });

			const result = await bridge.renameSnapshot("/workspace/test", "snap-1", "My Snapshot");

			expect(mockCall).toHaveBeenCalledWith("snapshot/rename", {
				workspace: "/workspace/test",
				snapshotId: "snap-1",
				newName: "My Snapshot",
			});
			expect(result).toEqual({ success: true, snapshotId: "snap-1", newName: "My Snapshot" });
		});
	});

	// =========================================================================
	// SESSION CHANGES
	// =========================================================================

	describe("getSessionChanges", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should get session changes", async () => {
			mockCall.mockResolvedValue({
				files: [
					{ path: "file1.ts", action: "change", linesChanged: 10 },
					{ path: "file2.ts", action: "add" },
				],
				diff: "some diff",
			});

			const result = await bridge.getSessionChanges("/workspace/test", true);

			expect(mockCall).toHaveBeenCalledWith("session/changes", {
				workspacePath: "/workspace/test",
				includeDiff: true,
			});
			expect(result.files).toHaveLength(2);
			expect(result.diff).toBe("some diff");
		});
	});

	// =========================================================================
	// LEARNING OPERATIONS
	// =========================================================================

	describe("searchLearnings", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should search learnings by keywords", async () => {
			mockCall.mockResolvedValue([
				{ type: "pattern", trigger: "test", action: "action", usageCount: 5, relevanceScore: 0.9 },
			]);

			const result = await bridge.searchLearnings("/workspace/test", ["refactor", "test"]);

			expect(mockCall).toHaveBeenCalledWith("learning/search", {
				workspace: "/workspace/test",
				keywords: ["refactor", "test"],
				limit: 10,
			});
			expect(result).toHaveLength(1);
		});

		it("should use custom limit", async () => {
			mockCall.mockResolvedValue([]);

			await bridge.searchLearnings("/workspace/test", ["test"], 20);

			expect(mockCall).toHaveBeenCalledWith("learning/search", {
				workspace: "/workspace/test",
				keywords: ["test"],
				limit: 20,
			});
		});
	});

	describe("listLearnings", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should list learnings for workspace", async () => {
			mockCall.mockResolvedValue({
				learnings: [
					{ type: "pattern", trigger: "test", action: "action" },
				],
				total: 1,
			});

			const result = await bridge.listLearnings("/workspace/test");

			expect(mockCall).toHaveBeenCalledWith("learning/list", {
				workspace: "/workspace/test",
				limit: 50,
			});
			expect(result.learnings).toHaveLength(1);
		});
	});

	// =========================================================================
	// VALIDATION OPERATIONS
	// =========================================================================

	describe("validateComprehensive", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should validate code comprehensively", async () => {
			mockCall.mockResolvedValue({
				passed: true,
				patternViolations: [],
				typescriptErrors: [],
				lintErrors: [],
			});

			const result = await bridge.validateComprehensive(
				"/workspace/test",
				"const x = 1;",
				"/workspace/test/file.ts",
			);

			expect(mockCall).toHaveBeenCalledWith("validate/comprehensive", {
				workspace: "/workspace/test",
				code: "const x = 1;",
				filePath: "file.ts",
			});
			expect(result.passed).toBe(true);
		});
	});

	describe("checkPatterns", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should check code patterns", async () => {
			mockCall.mockResolvedValue({
				passed: true,
				violations: [],
				suggestions: ["Consider using const"],
			});

			const result = await bridge.checkPatterns(
				"/workspace/test",
				"let x = 1;",
				"/workspace/test/file.ts",
			);

			expect(mockCall).toHaveBeenCalledWith("context/check-patterns", {
				workspace: "/workspace/test",
				code: "let x = 1;",
				filePath: "file.ts",
			});
			expect(result.suggestions).toContain("Consider using const");
		});
	});

	// =========================================================================
	// PROTECTION OPERATIONS
	// =========================================================================

	describe("setProtectionLevel", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should set protection level for file", async () => {
			mockCall.mockResolvedValue({ success: true, previousLevel: "watch" });

			const result = await bridge.setProtectionLevel(
				"/workspace/test",
				"/workspace/test/file.ts",
				"block",
				"Important file",
			);

			expect(mockCall).toHaveBeenCalledWith("protection/set-level", {
				workspace: "/workspace/test",
				filePath: "file.ts",
				level: "block",
				reason: "Important file",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("listProtectedFiles", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should list protected files", async () => {
			mockCall.mockResolvedValue({
				files: [
					{ path: "file.ts", level: "block", pattern: "*.ts", reason: "TypeScript" },
				],
				total: 1,
			});

			const result = await bridge.listProtectedFiles("/workspace/test", {
				level: "block",
				limit: 10,
			});

			expect(mockCall).toHaveBeenCalledWith("protection/list-daemon", {
				workspace: "/workspace/test",
				level: "block",
				limit: 10,
			});
			expect(result.files).toHaveLength(1);
		});
	});

	// =========================================================================
	// VIOLATION OPERATIONS
	// =========================================================================

	describe("reportViolation", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should report a violation", async () => {
			mockCall.mockResolvedValue({
				violationId: "viol-1",
				count: 1,
				promoted: false,
			});

			const result = await bridge.reportViolation("/workspace/test", {
				type: "pattern-violation",
				file: "file.ts",
				whatHappened: "Used let instead of const",
				whyItHappened: "Habit",
				prevention: "Use eslint rule",
			});

			expect(mockCall).toHaveBeenCalledWith("violation/report", {
				workspace: "/workspace/test",
				type: "pattern-violation",
				file: "file.ts",
				whatHappened: "Used let instead of const",
				whyItHappened: "Habit",
				prevention: "Use eslint rule",
			});
			expect(result.violationId).toBe("viol-1");
		});
	});

	describe("listViolations", () => {
		beforeEach(() => {
			setupConnectedBridge(bridge);
		});

		it("should list violations for workspace", async () => {
			mockCall.mockResolvedValue({
				violations: [
					{
						id: "viol-1",
						type: "pattern",
						file: "file.ts",
						whatHappened: "test",
						whyItHappened: "test",
						prevention: "test",
						occurrences: 3,
						createdAt: "2024-01-01T00:00:00Z",
					},
				],
				total: 1,
			});

			const result = await bridge.listViolations("/workspace/test");

			expect(mockCall).toHaveBeenCalledWith("violation/list", {
				workspace: "/workspace/test",
			});
			expect(result.violations).toHaveLength(1);
		});
	});

	// =========================================================================
	// NEW EVENT EMITTERS (Layer 2 wiring)
	// =========================================================================

	describe("new event emitters", () => {
		describe("onSessionStarted", () => {
			it("should fire on session.started notification", () => {
				const handler = vi.fn();
				bridge.onSessionStarted(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "session.started",
					data: {
						taskId: "task-123",
						task: "Refactor auth module",
					},
				});

				expect(handler).toHaveBeenCalledWith({
					taskId: "task-123",
					task: "Refactor auth module",
				});
			});
		});

		describe("onSessionEnded", () => {
			it("should fire on session.ended notification", () => {
				const handler = vi.fn();
				bridge.onSessionEnded(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "session.ended",
					data: {
						sessionId: "session-456",
						outcome: "completed",
					},
				});

				expect(handler).toHaveBeenCalledWith({
					sessionId: "session-456",
					outcome: "completed",
				});
			});
		});

		describe("onLearningAdded", () => {
			it("should fire on learning.added notification", () => {
				const handler = vi.fn();
				bridge.onLearningAdded(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "learning.added",
					data: {
						id: "learn-789",
						type: "pattern",
						trigger: "refactor",
					},
				});

				expect(handler).toHaveBeenCalledWith({
					id: "learn-789",
					type: "pattern",
					trigger: "refactor",
				});
			});
		});

		describe("onProtectionChanged", () => {
			it("should fire on protection.changed notification", () => {
				const handler = vi.fn();
				bridge.onProtectionChanged(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "protection.changed",
					data: {
						file: "auth.ts",
						level: "block",
						previousLevel: "watch",
					},
				});

				expect(handler).toHaveBeenCalledWith({
					file: "auth.ts",
					level: "block",
					previousLevel: "watch",
				});
			});
		});

		describe("onViolationReported", () => {
			it("should fire on violation.reported notification", () => {
				const handler = vi.fn();
				bridge.onViolationReported(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "violation.reported",
					data: {
						type: "pattern-violation",
						file: "utils.ts",
						message: "Used let instead of const",
					},
				});

				expect(handler).toHaveBeenCalledWith({
					type: "pattern-violation",
					file: "utils.ts",
					message: "Used let instead of const",
				});
			});
		});

		describe("onSyncCompleted", () => {
			it("should fire on sync.completed notification", () => {
				const handler = vi.fn();
				bridge.onSyncCompleted(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "sync.completed",
					data: { success: true },
				});

				expect(handler).toHaveBeenCalledWith({
					success: true,
				});
			});

			it("should fire on sync.failed notification with error", () => {
				const handler = vi.fn();
				bridge.onSyncCompleted(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "sync.failed",
					data: {
						error: "Connection timeout",
					},
				});

				expect(handler).toHaveBeenCalledWith({
					success: false,
					error: "Connection timeout",
				});
			});
		});

		describe("onDaemonUpdatePending", () => {
			it("P05-E-1: fires with newVersion and delayMs from inline params", () => {
				const handler = vi.fn();
				bridge.onDaemonUpdatePending(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "daemon.update_pending",
					newVersion: "2.1.0",
					delayMs: 30000,
				});

				expect(handler).toHaveBeenCalledWith({
					newVersion: "2.1.0",
					delayMs: 30000,
				});
			});

			it("P05-E-2: fires with defaults when newVersion/delayMs are absent", () => {
				const handler = vi.fn();
				bridge.onDaemonUpdatePending(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "daemon.update_pending",
				});

				expect(handler).toHaveBeenCalledWith({
					newVersion: "",
					delayMs: 30000,
				});
			});
		});

		describe("onDaemonHandoffComplete", () => {
			it("P05-E-3: fires with newSocketPath when provided", () => {
				const handler = vi.fn();
				bridge.onDaemonHandoffComplete(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "daemon.handoff_complete",
					newSocketPath: "/tmp/new-daemon.sock",
				});

				expect(handler).toHaveBeenCalledWith({
					newSocketPath: "/tmp/new-daemon.sock",
				});
			});

			it("P05-E-4: fires with undefined newSocketPath when absent", () => {
				const handler = vi.fn();
				bridge.onDaemonHandoffComplete(handler);

				(bridge as any).daemonEvents.handleNotification("notification", {
					type: "daemon.handoff_complete",
				});

				expect(handler).toHaveBeenCalledWith({
					newSocketPath: undefined,
				});
			});
		});
	});

	// =========================================================================
	// CONNECTION FLOW EDGE CASES
	// =========================================================================

	describe("connect - edge cases", () => {
		it("should handle connection failure and schedule reconnect", async () => {
			mockIsConnected.mockReturnValue(false);
			mockConnect.mockRejectedValue(new Error("Connection failed"));
			vi.spyOn(bridge, "isDaemonRunning").mockReturnValue(true);
			const scheduleReconnectSpy = vi.spyOn(bridge as any, "scheduleReconnect");

			const result = await bridge.connect();

			expect(result).toBe(false);
			expect(scheduleReconnectSpy).toHaveBeenCalled();
		});

		it("should handle daemon not running", async () => {
			mockIsConnected.mockReturnValue(false);
			// Mock isDaemonRunning to return false
			vi.spyOn(bridge, "isDaemonRunning").mockReturnValue(false);

			// Mock autoStartDaemon to return false
			const connectionManager = (bridge as any).connectionManager;
			vi.spyOn(connectionManager, "autoStartDaemon").mockResolvedValue(false);

			const result = await bridge.connect();

			expect(result).toBe(false);
		});
	});

	// =========================================================================
	// SCHEDULE RECONNECT
	// =========================================================================

	describe("scheduleReconnect", () => {
		it("should transition to cli_missing when CLI not found", () => {
			const originalCliNotFound = circuitBreaker.cliNotFound;

			circuitBreaker.cliNotFound = true;
			(bridge as any).scheduleReconnect();

			expect(bridge.getState()).toBe("cli_missing");

			circuitBreaker.cliNotFound = originalCliNotFound;
		});
	});
});
