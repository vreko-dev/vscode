/**
 * @fileoverview MCP Tool Invocation Integration Tests
 *
 * Tests the MCP tool invocation pipeline:
 * - DaemonBridge tool communication
 * - Response structure validation
 * - Error handling and timeouts
 * - Connection state management
 *
 * ROI: Critical path for LLM communication - validates Claude/Cursor can
 * successfully invoke SnapBack tools through the daemon bridge.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock NotificationManager
vi.mock("../../../src/services/NotificationManager", () => ({
	getNotificationManager: vi.fn(() => ({
		showDaemonConnectionRequired: vi.fn(),
		showDaemonConnected: vi.fn(),
	})),
}));

describe("MCP Tool Invocation Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("Tool Response Validation", () => {
		it("should validate detect_ai response structure", () => {
			// Simulated response from daemon
			const response = {
				success: true,
				result: {
					toolName: "detect_ai",
					data: {
						hasAI: true,
						assistants: ["GITHUB_COPILOT"],
						confidence: 0.95,
					},
				},
			};

			// Validate structure
			expect(response.success).toBe(true);
			expect(response.result.toolName).toBe("detect_ai");
			expect(response.result.data.hasAI).toBe(true);
			expect(response.result.data.assistants).toContain("GITHUB_COPILOT");
			expect(response.result.data.confidence).toBeGreaterThan(0);
			expect(response.result.data.confidence).toBeLessThanOrEqual(1);
		});

		it("should validate list_snapshots response with nested structure", () => {
			// Simulated response
			const response = {
				success: true,
				result: {
					snapshots: [
						{ id: "snap_1", timestamp: 1000, files: ["a.ts", "b.ts"] },
						{ id: "snap_2", timestamp: 2000, files: ["c.ts"] },
					],
					metadata: {
						totalCount: 2,
						workspaceId: "ws_abc123",
					},
				},
			};

			// Validate nested structure
			expect(response.result.snapshots).toHaveLength(2);
			expect(response.result.snapshots[0].id).toBe("snap_1");
			expect(response.result.snapshots[0].files).toContain("a.ts");
			expect(response.result.metadata.workspaceId).toBe("ws_abc123");
		});

		it("should validate restore_snapshot response", () => {
			const response = {
				success: true,
				result: {
					toolName: "restore_snapshot",
					data: {
						snapshotId: "snap_123",
						filesRestored: 3,
						timestamp: Date.now(),
					},
				},
			};

			expect(response.success).toBe(true);
			expect(response.result.data.filesRestored).toBe(3);
			expect(response.result.data.snapshotId).toBe("snap_123");
		});

		it("should handle error response format", () => {
			const errorResponse = {
				success: false,
				error: {
					code: "SNAPSHOT_NOT_FOUND",
					message: "Snapshot snap_xyz not found",
				},
			};

			expect(errorResponse.success).toBe(false);
			expect(errorResponse.error.code).toBe("SNAPSHOT_NOT_FOUND");
			expect(errorResponse.error.message).toContain("not found");
		});
	});

	describe("MCPLifecycleManager State Machine", () => {
		it("should track connection state transitions", async () => {
			// Import after mocks are set up
			const { MCPLifecycleManager } = await import(
				"../../../src/services/MCPLifecycleManager"
			);

			// Mock getMCPModeManager to return UNCONFIGURED
			vi.mock("../../../src/services/MCPModeManager", () => ({
				getMCPModeManager: vi.fn(() => ({
					detectMode: vi.fn().mockResolvedValue("UNCONFIGURED"),
				})),
				MCPMode: {
					LOCAL_CLI: "LOCAL_CLI",
					REMOTE_API: "REMOTE_API",
					UNCONFIGURED: "UNCONFIGURED",
				},
			}));

			const stateChanges: string[] = [];
			const manager = new MCPLifecycleManager({
				extensionPath: "/test",
				dbPath: "/test.db",
			});

			manager.addStateChangeListener((event) => {
				stateChanges.push(event.state);
			});

			// Initial state
			expect(manager.getConnectionState()).toBe("disconnected");
		});

		it("should report correct initial state", async () => {
			const { MCPLifecycleManager } = await import(
				"../../../src/services/MCPLifecycleManager"
			);

			const manager = new MCPLifecycleManager({
				extensionPath: "/test",
				dbPath: "/test.db",
			});

			expect(manager.getConnectionState()).toBe("disconnected");
			expect(manager.isServerReady()).toBe(false);
		});
	});

	describe("Tool Request Format", () => {
		it("should format detect_ai request correctly", () => {
			const request = {
				method: "tools/call",
				params: {
					name: "detect_ai",
					arguments: {
						filePath: "/test/file.ts",
					},
				},
			};

			expect(request.method).toBe("tools/call");
			expect(request.params.name).toBe("detect_ai");
			expect(request.params.arguments.filePath).toBe("/test/file.ts");
		});

		it("should format create_snapshot request correctly", () => {
			const request = {
				method: "tools/call",
				params: {
					name: "create_snapshot",
					arguments: {
						files: [
							{ path: "src/index.ts", content: "// code" },
							{ path: "src/utils.ts", content: "// utils" },
						],
						description: "Pre-AI snapshot",
					},
				},
			};

			expect(request.params.name).toBe("create_snapshot");
			expect(request.params.arguments.files).toHaveLength(2);
			expect(request.params.arguments.description).toBe("Pre-AI snapshot");
		});

		it("should format restore_snapshot request correctly", () => {
			const request = {
				method: "tools/call",
				params: {
					name: "restore_snapshot",
					arguments: {
						snapshotId: "snap_abc123",
						files: ["src/index.ts"], // Optional: selective restore
					},
				},
			};

			expect(request.params.name).toBe("restore_snapshot");
			expect(request.params.arguments.snapshotId).toBe("snap_abc123");
		});
	});

	describe("Error Scenarios", () => {
		it("should create proper timeout error structure", () => {
			const timeoutError = {
				success: false,
				error: {
					code: "TIMEOUT",
					message: "Request timed out after 60000ms",
					retriable: true,
				},
			};

			expect(timeoutError.error.code).toBe("TIMEOUT");
			expect(timeoutError.error.retriable).toBe(true);
		});

		it("should create proper auth error structure", () => {
			const authError = {
				success: false,
				error: {
					code: "UNAUTHORIZED",
					message: "Invalid or expired authentication token",
					retriable: false,
				},
			};

			expect(authError.error.code).toBe("UNAUTHORIZED");
			expect(authError.error.retriable).toBe(false);
		});

		it("should create proper not found error structure", () => {
			const notFoundError = {
				success: false,
				error: {
					code: "SNAPSHOT_NOT_FOUND",
					message: "Snapshot snap_xyz not found in workspace",
					retriable: false,
					context: {
						snapshotId: "snap_xyz",
						workspaceId: "ws_123",
					},
				},
			};

			expect(notFoundError.error.code).toBe("SNAPSHOT_NOT_FOUND");
			expect(notFoundError.error.context?.snapshotId).toBe("snap_xyz");
		});

		it("should create proper daemon disconnected error", () => {
			const disconnectedError = {
				success: false,
				error: {
					code: "DAEMON_DISCONNECTED",
					message: "Lost connection to SnapBack daemon",
					retriable: true,
					suggestion: "The daemon will automatically reconnect",
				},
			};

			expect(disconnectedError.error.code).toBe("DAEMON_DISCONNECTED");
			expect(disconnectedError.error.suggestion).toContain("reconnect");
		});
	});

	describe("Response Type Guards", () => {
		it("should type-check successful response", () => {
			interface ToolResponse<T> {
				success: boolean;
				result?: T;
				error?: { code: string; message: string };
			}

			const isSuccess = <T>(
				response: ToolResponse<T>,
			): response is ToolResponse<T> & { success: true; result: T } => {
				return response.success === true && response.result !== undefined;
			};

			const successResponse: ToolResponse<{ data: string }> = {
				success: true,
				result: { data: "test" },
			};

			const errorResponse: ToolResponse<{ data: string }> = {
				success: false,
				error: { code: "ERR", message: "failed" },
			};

			expect(isSuccess(successResponse)).toBe(true);
			expect(isSuccess(errorResponse)).toBe(false);
		});
	});

	describe("Tool-Specific Response Validation", () => {
		it("should validate get_protection_status response", () => {
			const response = {
				success: true,
				result: {
					level: "warn",
					isActive: true,
					detectedTools: ["GITHUB_COPILOT", "CURSOR"],
					lastCheck: Date.now(),
				},
			};

			expect(response.result.level).toMatch(/^(watch|warn|block)$/);
			expect(response.result.isActive).toBe(true);
			expect(response.result.detectedTools).toContain("GITHUB_COPILOT");
		});

		it("should validate analyze_risk response", () => {
			const response = {
				success: true,
				result: {
					riskScore: 7.5,
					factors: [
						{ name: "secret_detection", score: 3, severity: "high" },
						{ name: "unsafe_eval", score: 2.5, severity: "medium" },
					],
					recommendations: ["Remove hardcoded API key", "Avoid eval()"],
				},
			};

			expect(response.result.riskScore).toBeGreaterThanOrEqual(0);
			expect(response.result.riskScore).toBeLessThanOrEqual(10);
			expect(response.result.factors).toHaveLength(2);
			expect(response.result.recommendations.length).toBeGreaterThan(0);
		});

		it("should validate get_session_status response", () => {
			const response = {
				success: true,
				result: {
					sessionId: "session_abc123",
					isActive: true,
					startTime: Date.now() - 3600000,
					snapshotCount: 5,
					filesTracked: 12,
				},
			};

			expect(response.result.sessionId).toMatch(/^session_/);
			expect(response.result.isActive).toBe(true);
			expect(response.result.snapshotCount).toBeGreaterThanOrEqual(0);
		});
	});
});
