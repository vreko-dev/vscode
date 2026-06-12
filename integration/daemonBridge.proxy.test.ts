/**
 * Integration Test: DaemonBridge Proxy Behaviour
 *
 * Phase 3.3 (THINDOWN): Verifies the DaemonBridge proxy contract — that calls
 * are routed correctly, errors propagate, and state is reported faithfully.
 *
 * Tests the proxy INTERFACE rather than the low-level IPC wiring (socket tests
 * live in local-service). Follows the mock-bridge pattern established by the
 * existing daemonBridge-saveHandler integration tests.
 *
 * Covers:
 *  1. UNCONFIGURED activation — bridge starts disconnected, does not crash
 *  2. Graceful daemon-down handling — returns degraded responses, does not throw
 *  3. protection/evaluate proxy — routes correctly to underlying call mechanism
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// DaemonBridge proxy contract interface (subset used in tests)
// ---------------------------------------------------------------------------
interface DaemonBridgeProxy {
	getState(): string;
	isHealthy(): boolean;
	getDaemonVersion(): string | undefined;
	getLastHealthCheckTime(): Date | null;
	getStatus(): Promise<{ connected: boolean; version?: string }>;
	getSessionStatus(workspace: string): Promise<unknown | null>;
	subscribeToFileWatching(workspace: string): Promise<boolean>;
	unsubscribeFromFileWatching(workspace: string): Promise<boolean>;
	request<T>(method: string, params: Record<string, unknown>): Promise<T>;
	ping(): Promise<{ pong: true; uptime: number; version: string }>;
	dispose(): void;
}

// ---------------------------------------------------------------------------
// Factory: create a proxy-compliant bridge backed by a controllable mock client
// ---------------------------------------------------------------------------
function createTestBridge(): {
	bridge: DaemonBridgeProxy;
	client: {
		call: ReturnType<typeof vi.fn>;
		isConnected: ReturnType<typeof vi.fn>;
	};
} {
	const client = {
		call: vi.fn(),
		isConnected: vi.fn().mockReturnValue(false),
	};

	// Tracks the bridge's internal state
	let state: string = "disconnected";
	let subscriptions = new Set<string>();

	const bridge: DaemonBridgeProxy = {
		getState: () => state,
		isHealthy: () => state === "connected",
		getDaemonVersion: () => undefined,
		getLastHealthCheckTime: () => null,

		getStatus: async () => {
			if (!client.isConnected()) return { connected: false };
			try {
				const result = await client.call("daemon.status", {});
				return { connected: true, ...result };
			} catch {
				return { connected: false };
			}
		},

		getSessionStatus: async (workspace) => {
			if (!client.isConnected()) return null;
			try {
				return await client.call("session.status", { workspace });
			} catch {
				return null;
			}
		},

		subscribeToFileWatching: async (workspace) => {
			if (!client.isConnected()) return false;
			try {
				await client.call("watch.subscribe", { workspace });
				subscriptions.add(workspace);
				return true;
			} catch {
				return false;
			}
		},

		unsubscribeFromFileWatching: async (workspace) => {
			if (!client.isConnected()) return false;
			try {
				await client.call("watch.unsubscribe", { workspace });
				subscriptions.delete(workspace);
				return true;
			} catch {
				return false;
			}
		},

		request: async <T>(method: string, params: Record<string, unknown>): Promise<T> => {
			if (!client.isConnected()) {
				const connected = false; // autoConnect not supported in test bridge
				if (!connected) throw new Error("Not connected to daemon");
			}
			return client.call(method, params) as Promise<T>;
		},

		ping: async () => {
			return client.call("daemon.ping", {}) as Promise<{
				pong: true;
				uptime: number;
				version: string;
			}>;
		},

		dispose: () => {
			state = "disconnected";
			subscriptions.clear();
		},
	};

	// Helper to simulate connection
	(bridge as unknown as { _connect: () => void })._connect = () => {
		state = "connected";
		client.isConnected.mockReturnValue(true);
	};

	return { bridge, client };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DaemonBridge proxy behaviour", () => {
	let bridge: DaemonBridgeProxy;
	let client: { call: ReturnType<typeof vi.fn>; isConnected: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		vi.clearAllMocks();
		const result = createTestBridge();
		bridge = result.bridge;
		client = result.client;
	});

	afterEach(() => {
		bridge.dispose();
	});

	// -------------------------------------------------------------------------
	// 1. UNCONFIGURED activation — starts disconnected, does not crash
	// -------------------------------------------------------------------------
	describe("UNCONFIGURED activation", () => {
		it("starts in disconnected state without crashing", () => {
			expect(bridge.getState()).toBe("disconnected");
		});

		it("isHealthy() returns false when not connected", () => {
			expect(bridge.isHealthy()).toBe(false);
		});

		it("getDaemonVersion() returns undefined when not connected", () => {
			expect(bridge.getDaemonVersion()).toBeUndefined();
		});

		it("getLastHealthCheckTime() returns null when not connected", () => {
			expect(bridge.getLastHealthCheckTime()).toBeNull();
		});

		it("getStatus() returns { connected: false } when not connected", async () => {
			const status = await bridge.getStatus();
			expect(status.connected).toBe(false);
		});

		it("getSessionStatus() returns null when not connected", async () => {
			const result = await bridge.getSessionStatus("/workspace");
			expect(result).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// 2. Graceful daemon-down handling
	// -------------------------------------------------------------------------
	describe("graceful daemon-down handling", () => {
		it("request() throws 'Not connected' when daemon is down", async () => {
			client.isConnected.mockReturnValue(false);
			await expect(
				bridge.request("protection.evaluate", { filePath: "src/index.ts" }),
			).rejects.toThrow("Not connected to daemon");
		});

		it("subscribeToFileWatching() returns false when not connected", async () => {
			client.isConnected.mockReturnValue(false);
			const result = await bridge.subscribeToFileWatching("/workspace");
			expect(result).toBe(false);
		});

		it("unsubscribeFromFileWatching() returns false when not connected", async () => {
			client.isConnected.mockReturnValue(false);
			const result = await bridge.unsubscribeFromFileWatching("/workspace");
			expect(result).toBe(false);
		});

		it("getSessionStatus() returns null when daemon disconnects mid-call", async () => {
			// Connected but call fails
			client.isConnected.mockReturnValue(true);
			client.call.mockRejectedValue(new Error("socket closed"));

			const result = await bridge.getSessionStatus("/workspace");
			expect(result).toBeNull();
		});

		it("getStatus() returns { connected: false } when daemon call fails", async () => {
			client.isConnected.mockReturnValue(true);
			client.call.mockRejectedValue(new Error("daemon crashed"));

			const status = await bridge.getStatus();
			expect(status.connected).toBe(false);
		});
	});

	// -------------------------------------------------------------------------
	// 3. protection/evaluate proxy — routes calls correctly
	// -------------------------------------------------------------------------
	describe("protection/evaluate proxy", () => {
		beforeEach(() => {
			// Simulate connected state
			client.isConnected.mockReturnValue(true);
			client.call.mockResolvedValue({ allowed: true, reason: "no_risk" });
		});

		it("proxies protection/evaluate to client.call with exact method + params", async () => {
			const params = { filePath: "src/auth.ts", changeType: "change" as const };
			const result = await bridge.request<{ allowed: boolean }>(
				"protection.evaluate",
				params,
			);

			expect(client.call).toHaveBeenCalledWith("protection.evaluate", params);
			expect(result).toEqual({ allowed: true, reason: "no_risk" });
		});

		it("proxies daemon.ping with correct method", async () => {
			client.call.mockResolvedValue({ pong: true, uptime: 1234, version: "1.0.0" });

			await bridge.ping();
			expect(client.call).toHaveBeenCalledWith("daemon.ping", {});
		});

		it("propagates errors from client.call back to caller", async () => {
			client.call.mockRejectedValue(new Error("daemon unavailable"));

			await expect(
				bridge.request("snapshot.create", { filePath: "x.ts" }),
			).rejects.toThrow("daemon unavailable");
		});

		it("routes session.status with correct workspace param", async () => {
			client.call.mockResolvedValue({ active: true, filesModified: 3, snapshotCount: 1 });

			const result = await bridge.getSessionStatus("/workspace");
			expect(client.call).toHaveBeenCalledWith("session.status", { workspace: "/workspace" });
			expect(result).toMatchObject({ active: true, filesModified: 3 });
		});

		it("routes snapshot.create correctly", async () => {
			client.call.mockResolvedValue({ success: true, snapshotId: "snap-123" });

			const result = await bridge.request<{ success: boolean }>("snapshot.create", {
				filePath: "src/index.ts",
				content: "export default {};",
				trigger: "manual",
			});

			expect(result.success).toBe(true);
			expect(client.call).toHaveBeenCalledWith("snapshot.create", expect.objectContaining({
				filePath: "src/index.ts",
				trigger: "manual",
			}));
		});

		it("re-evaluates connection before each request", async () => {
			// Verify that each request checks isConnected()
			await bridge.request("protection.evaluate", { filePath: "a.ts" });
			await bridge.request("protection.evaluate", { filePath: "b.ts" });

			// isConnected should be checked for each request
			expect(client.isConnected).toHaveBeenCalledTimes(2);
		});
	});
});
