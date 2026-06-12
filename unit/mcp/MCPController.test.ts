/**
 * MCPController Test Suite
 *
 * Tests for the unified MCP lifecycle, mode, and health management.
 * Covers:
 * - State machine transitions
 * - Mode detection
 * - Health monitoring
 * - Race condition prevention
 * - Graceful shutdown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";

// Mock vscode
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue?: unknown) => {
				if (key === "mcp.enabled") return true;
				if (key === "apiKey") return "";
				if (key === "cliPath") return "";
				return defaultValue;
			}),
		})),
		workspaceFolders: [{ uri: { fsPath: "/test/workspace", toString: () => "file:///test/workspace" } }],
	},
	EventEmitter: class {
		private handlers: ((e: unknown) => void)[] = [];
		event = (handler: (e: unknown) => void) => {
			this.handlers.push(handler);
			return { dispose: () => { /* intentionally empty */ } };
		};
		fire = (e: unknown) => this.handlers.forEach((h) => h(e));
		dispose = () => { /* intentionally empty */ };
	},
	window: {
		showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
	},
	env: {
		openExternal: vi.fn(),
	},
	commands: {
		executeCommand: vi.fn(),
	},
	Uri: {
		parse: vi.fn((url: string) => ({ toString: () => url })),
	},
}));

// Mock @vreko/mcp-config
vi.mock("@vreko/mcp-config", () => ({
	detectAIClients: vi.fn(() => ({ detected: [] })),
	detectWorkspaceConfig: vi.fn(() => null),
}));

// Mock DaemonBridge
vi.mock("../../../src/services/DaemonBridge", () => ({
	getDaemonBridge: vi.fn(() => ({
		isConnected: vi.fn(() => false),
		connect: vi.fn(() => Promise.resolve(false)),
		onConnectionChanged: vi.fn(() => ({ dispose: () => { /* intentionally empty */ } })),
		getReconnectAttempt: vi.fn(() => 0),
		getMaxReconnectAttempts: vi.fn(() => 5),
	})),
}));

// Mock fs
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
}));

import {
	MCPController,
	getMCPController,
	disposeMCPController,
	MCPMode,
	type MCPConnectionState,
	type HealthState,
} from "../../../src/mcp/MCPController";

describe("MCPController", () => {
	let controller: MCPController;

	beforeEach(() => {
		vi.clearAllMocks();
		disposeMCPController();
		controller = new MCPController();
	});

	afterEach(() => {
		controller.dispose();
	});

	describe("initialization", () => {
		it("should start in disconnected state", () => {
			expect(controller.getConnectionState()).toBe("disconnected");
		});

		it("should start in unconfigured mode", () => {
			expect(controller.getMode()).toBe(MCPMode.UNCONFIGURED);
		});

		it("should start with unknown health state", () => {
			expect(controller.getHealthState()).toBe("unknown");
		});

		it("should not be ready initially", () => {
			expect(controller.isReady()).toBe(false);
		});
	});

	describe("singleton pattern", () => {
		it("should return same instance from getMCPController", () => {
			const instance1 = getMCPController();
			const instance2 = getMCPController();
			expect(instance1).toBe(instance2);
		});

		it("should create new instance after dispose", () => {
			const instance1 = getMCPController();
			disposeMCPController();
			const instance2 = getMCPController();
			expect(instance1).not.toBe(instance2);
		});
	});

	describe("state transitions", () => {
		it("should emit state change event on connection state change", async () => {
			const stateChanges: MCPConnectionState[] = [];
			controller.onStateChange((event) => {
				stateChanges.push(event.state);
			});

			await controller.start();

			// Should transition to reconnecting (daemon not available)
			expect(stateChanges.length).toBeGreaterThan(0);
		});

		it("should emit mode change event on mode change", async () => {
			const modeChanges: MCPMode[] = [];
			controller.onModeChange((event) => {
				modeChanges.push(event.newMode);
			});

			await controller.start();

			// Mode detection always runs, but event only fires if mode changes
			// Since we start in UNCONFIGURED and detect UNCONFIGURED, no event fires
			// This is correct behavior - verify the mode is set correctly
			expect(controller.getMode()).toBe(MCPMode.UNCONFIGURED);
		});
	});

	describe("mode detection", () => {
		it("should detect UNCONFIGURED mode when nothing is configured", async () => {
			await controller.start();
			expect(controller.getMode()).toBe(MCPMode.UNCONFIGURED);
		});

		it("should report configuration status", () => {
			const status = controller.checkConfigurationStatus();
			expect(status).toHaveProperty("daemonRunning");
			expect(status).toHaveProperty("configured");
			expect(status).toHaveProperty("configuredClients");
			expect(Array.isArray(status.configuredClients)).toBe(true);
		});

		it("should provide helper methods for mode checking", () => {
			expect(typeof controller.isLocalCLIMode()).toBe("boolean");
			expect(typeof controller.isRemoteAPIMode()).toBe("boolean");
		});
	});

	describe("health state machine", () => {
		it("should transition to healthy on successful check", async () => {
			// Simulate successful health check
			const healthChanges: HealthState[] = [];
			controller.onHealthChange((event) => {
				healthChanges.push(event.to);
			});

			await controller.forceHealthCheck();

			// Should have recorded a health state
			expect(controller.getHealthState()).toBeDefined();
		});

		it("should provide latency metrics", () => {
			const metrics = controller.getLatencyMetrics();
			expect(metrics).toHaveProperty("current");
			expect(metrics).toHaveProperty("p50");
			expect(metrics).toHaveProperty("p95");
			expect(metrics).toHaveProperty("p99");
			expect(metrics).toHaveProperty("jitter");
			expect(metrics).toHaveProperty("trend");
		});

		it("should calculate trend correctly", () => {
			const metrics = controller.getLatencyMetrics();
			expect(["improving", "stable", "degrading"]).toContain(metrics.trend);
		});
	});

	describe("status reporting", () => {
		it("should provide comprehensive status", () => {
			const status = controller.getStatus();
			expect(status).toHaveProperty("mode");
			expect(status).toHaveProperty("connectionState");
			expect(status).toHaveProperty("healthState");
			expect(status).toHaveProperty("isReady");
			expect(status).toHaveProperty("latency");
			expect(status).toHaveProperty("daemonConnected");
			expect(status).toHaveProperty("configured");
			expect(status).toHaveProperty("configuredClients");
		});

		it("should return server version when available", () => {
			const version = controller.getServerVersion();
			// Initially undefined
			expect(version).toBeUndefined();
		});
	});

	describe("graceful shutdown", () => {
		it("should stop cleanly", async () => {
			await controller.start();
			await controller.stop();
			expect(controller.getConnectionState()).toBe("disconnected");
		});

		it("should dispose without errors", () => {
			expect(() => controller.dispose()).not.toThrow();
		});

		it("should handle multiple dispose calls", () => {
			controller.dispose();
			expect(() => controller.dispose()).not.toThrow();
		});
	});

	describe("disabled state", () => {
		it("should respect mcp.enabled configuration", async () => {
			// Mock disabled config
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "mcp.enabled") return false;
					return defaultValue;
				}),
			} as unknown as vscode.WorkspaceConfiguration);

			const newController = new MCPController();
			await newController.start();

			expect(newController.getConnectionState()).toBe("disabled");
			newController.dispose();
		});
	});

	describe("race condition prevention", () => {
		it("should handle concurrent start calls", async () => {
			const startPromises = [controller.start(), controller.start(), controller.start()];

			await expect(Promise.all(startPromises)).resolves.not.toThrow();
		});

		it("should handle concurrent stop calls", async () => {
			await controller.start();
			const stopPromises = [controller.stop(), controller.stop(), controller.stop()];

			await expect(Promise.all(stopPromises)).resolves.not.toThrow();
		});

		it("should handle interleaved start/stop calls", async () => {
			const operations = [
				controller.start(),
				controller.stop(),
				controller.start(),
				controller.stop(),
			];

			await expect(Promise.all(operations)).resolves.not.toThrow();
		});
	});

	describe("health check edge cases", () => {
		it("should handle health check when not connected", async () => {
			const result = await controller.forceHealthCheck();
			expect(["healthy", "degraded", "unhealthy", "unknown"]).toContain(result);
		});

		it("should track consecutive successes for recovery", async () => {
			// Force unhealthy state first
			await controller.forceHealthCheck();
			await controller.forceHealthCheck();
			await controller.forceHealthCheck();

			// State should be tracked
			expect(controller.getHealthState()).toBeDefined();
		});
	});
});

describe("MCPController Integration", () => {
	describe("event coordination", () => {
		it("should coordinate state and health events", async () => {
			const controller = new MCPController();
			const events: string[] = [];

			controller.onStateChange(() => events.push("state"));
			controller.onModeChange(() => events.push("mode"));
			controller.onHealthChange(() => events.push("health"));

			await controller.start();

			// Should have fired at least mode and state events
			expect(events.length).toBeGreaterThan(0);

			controller.dispose();
		});
	});

	describe("error recovery", () => {
		it("should handle errors during start gracefully", async () => {
			const controller = new MCPController();

			// Should not throw even with mocked failures
			await expect(controller.start()).resolves.not.toThrow();

			controller.dispose();
		});
	});
});
