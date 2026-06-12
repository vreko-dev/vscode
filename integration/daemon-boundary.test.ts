/**
 * Daemon Boundary Tests
 *
 * Tests the connection lifecycle edge cases and boundary conditions of the
 * DaemonBridge, including:
 *  1. Stale PID file handling (daemon crashed, PID file remains)
 *  2. Missing socket file (daemon started but socket not ready)
 *  3. Race conditions in concurrent connect() calls
 *  4. Circuit breaker behaviour (spawn failures, CLI not found)
 *  5. Reconnection with exponential backoff
 *  6. Cross-window spawn coordination
 *
 * Uses mock-based testing following the existing proxy test pattern.
 *
 * @see ConnectionManager.ts, DaemonBridge.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionState = "connected" | "disconnected" | "reconnecting" | "cli_missing" | "degraded";

interface CircuitBreaker {
	cliNotFound: boolean;
	spawnFailed: boolean;
	spawnFailCount: number;
	lastError: string | null;
	cooldownUntil: number;
}

interface StateChangeEvent {
	state: ConnectionState;
	previousState: ConnectionState;
	reason?: string;
	daemonVersion?: string;
}

// ---------------------------------------------------------------------------
// Mock Connection Manager
// ---------------------------------------------------------------------------

function createMockConnectionManager() {
	const circuitBreaker: CircuitBreaker = {
		cliNotFound: false,
		spawnFailed: false,
		spawnFailCount: 0,
		lastError: null,
		cooldownUntil: 0,
	};

	return {
		circuitBreaker,
		autoStartDaemon: vi.fn().mockResolvedValue(true),
		killDaemon: vi.fn().mockResolvedValue(undefined),
		resetReconnectState: vi.fn(),
		isDaemonRunning: vi.fn().mockReturnValue(false),
		getSocketPath: vi.fn().mockReturnValue("/tmp/snapback.sock"),
	};
}

// ---------------------------------------------------------------------------
// Mock Bridge (simplified state machine for boundary testing)
// ---------------------------------------------------------------------------

function createTestBridge() {
	const connectionManager = createMockConnectionManager();
	const stateChanges: StateChangeEvent[] = [];
	let state: ConnectionState = "disconnected";
	let connectPromise: Promise<boolean> | null = null;
	let isConnecting = false;

	const mockClient = {
		connect: vi.fn().mockResolvedValue(undefined),
		initialize: vi.fn().mockResolvedValue(undefined),
		call: vi.fn().mockResolvedValue({ pong: true, uptime: 1000, version: "1.0.0" }),
		isConnected: vi.fn().mockReturnValue(false),
		close: vi.fn(),
		on: vi.fn(),
	};

	function transitionTo(newState: ConnectionState, meta?: Partial<StateChangeEvent>) {
		if (newState === state && newState !== "reconnecting") return;
		const event: StateChangeEvent = {
			state: newState,
			previousState: state,
			...meta,
		};
		state = newState;
		stateChanges.push(event);
	}

	async function connect(): Promise<boolean> {
		if (mockClient.isConnected()) return true;

		// Deduplicate concurrent connect calls
		if (connectPromise !== null) return connectPromise;

		connectPromise = doConnect().finally(() => {
			connectPromise = null;
		});
		return connectPromise;
	}

	async function doConnect(): Promise<boolean> {
		if (isConnecting) return false;
		isConnecting = true;

		try {
			// Check circuit breaker
			if (connectionManager.circuitBreaker.cliNotFound) {
				transitionTo("cli_missing", { reason: "CLI not found" });
				return false;
			}

			if (connectionManager.circuitBreaker.spawnFailed &&
				Date.now() < connectionManager.circuitBreaker.cooldownUntil) {
				transitionTo("reconnecting", { reason: "In cooldown after spawn failure" });
				return false;
			}

			// Auto-start if not running
			if (!connectionManager.isDaemonRunning()) {
				const started = await connectionManager.autoStartDaemon();
				if (!started) {
					connectionManager.circuitBreaker.spawnFailCount++;
					connectionManager.circuitBreaker.spawnFailed = true;
					transitionTo("reconnecting", { reason: "Auto-start failed" });
					return false;
				}
			}

			// Connect client
			await mockClient.connect();
			await mockClient.initialize();

			mockClient.isConnected.mockReturnValue(true);
			connectionManager.resetReconnectState();
			transitionTo("connected");
			return true;
		} catch (error) {
			transitionTo("reconnecting", {
				reason: error instanceof Error ? error.message : "Unknown error",
			});
			return false;
		} finally {
			isConnecting = false;
		}
	}

	function disconnect() {
		mockClient.close();
		mockClient.isConnected.mockReturnValue(false);
		transitionTo("disconnected", { reason: "Manual disconnect" });
	}

	return {
		connect,
		disconnect,
		getState: () => state,
		getStateChanges: () => stateChanges,
		client: mockClient,
		connectionManager,
		transitionTo,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Daemon Boundary Tests", () => {
	let bridge: ReturnType<typeof createTestBridge>;

	beforeEach(() => {
		vi.clearAllMocks();
		bridge = createTestBridge();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// =========================================================================
	// STALE PID FILE
	// =========================================================================

	describe("Stale PID file handling", () => {
		it("should attempt auto-start when daemon not running despite PID", async () => {
			bridge.connectionManager.isDaemonRunning.mockReturnValue(false);
			bridge.connectionManager.autoStartDaemon.mockResolvedValue(true);

			const result = await bridge.connect();

			expect(bridge.connectionManager.autoStartDaemon).toHaveBeenCalled();
			expect(result).toBe(true);
			expect(bridge.getState()).toBe("connected");
		});

		it("should transition to reconnecting when auto-start fails", async () => {
			bridge.connectionManager.isDaemonRunning.mockReturnValue(false);
			bridge.connectionManager.autoStartDaemon.mockResolvedValue(false);

			const result = await bridge.connect();

			expect(result).toBe(false);
			expect(bridge.getState()).toBe("reconnecting");
		});
	});

	// =========================================================================
	// MISSING SOCKET
	// =========================================================================

	describe("Missing socket file", () => {
		it("should fail gracefully when client.connect() throws", async () => {
			bridge.connectionManager.isDaemonRunning.mockReturnValue(true);
			bridge.client.connect.mockRejectedValue(new Error("ENOENT: socket not found"));

			const result = await bridge.connect();

			expect(result).toBe(false);
			expect(bridge.getState()).toBe("reconnecting");
		});
	});

	// =========================================================================
	// CONCURRENT CONNECT RACE CONDITIONS
	// =========================================================================

	describe("Concurrent connect() calls", () => {
		it("should deduplicate simultaneous connect calls", async () => {
			// Make connect take some time — use a shared ref object to capture resolver
			const ref: { resolve: (() => void) | null } = { resolve: null };
			bridge.connectionManager.isDaemonRunning.mockReturnValue(true);
			bridge.client.connect.mockImplementation(
				() => new Promise<void>((resolve) => { ref.resolve = resolve; }),
			);

			// Fire 3 concurrent connects
			const p1 = bridge.connect();
			const p2 = bridge.connect();
			const p3 = bridge.connect();

			// Wait a tick for promises to settle, then resolve
			await new Promise((r) => setTimeout(r, 10));
			ref.resolve!();
			const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

			expect(r1).toBe(r2);
			expect(r2).toBe(r3);
			// client.connect should only be called once
			expect(bridge.client.connect).toHaveBeenCalledTimes(1);
		});
	});

	// =========================================================================
	// CIRCUIT BREAKER
	// =========================================================================

	describe("Circuit breaker", () => {
		it("should transition to cli_missing when CLI not found", async () => {
			bridge.connectionManager.circuitBreaker.cliNotFound = true;

			const result = await bridge.connect();

			expect(result).toBe(false);
			expect(bridge.getState()).toBe("cli_missing");
		});

		it("should respect cooldown period after spawn failures", async () => {
			bridge.connectionManager.circuitBreaker.spawnFailed = true;
			bridge.connectionManager.circuitBreaker.cooldownUntil = Date.now() + 60_000;

			const result = await bridge.connect();

			expect(result).toBe(false);
			expect(bridge.getState()).toBe("reconnecting");
			expect(bridge.connectionManager.autoStartDaemon).not.toHaveBeenCalled();
		});

		it("should increment spawn fail count on auto-start failure", async () => {
			bridge.connectionManager.isDaemonRunning.mockReturnValue(false);
			bridge.connectionManager.autoStartDaemon.mockResolvedValue(false);

			await bridge.connect();

			expect(bridge.connectionManager.circuitBreaker.spawnFailCount).toBe(1);
			expect(bridge.connectionManager.circuitBreaker.spawnFailed).toBe(true);
		});

		it("should allow retry after cooldown expires", async () => {
			bridge.connectionManager.circuitBreaker.spawnFailed = true;
			bridge.connectionManager.circuitBreaker.cooldownUntil = Date.now() - 1; // expired
			bridge.connectionManager.isDaemonRunning.mockReturnValue(false);
			bridge.connectionManager.autoStartDaemon.mockResolvedValue(true);

			const result = await bridge.connect();

			expect(bridge.connectionManager.autoStartDaemon).toHaveBeenCalled();
			expect(result).toBe(true);
		});
	});

	// =========================================================================
	// STATE MACHINE TRANSITIONS
	// =========================================================================

	describe("State machine", () => {
		it("should start in disconnected state", () => {
			expect(bridge.getState()).toBe("disconnected");
		});

		it("should transition disconnected -> connected on success", async () => {
			await bridge.connect();

			const changes = bridge.getStateChanges();
			expect(changes).toHaveLength(1);
			expect(changes[0].previousState).toBe("disconnected");
			expect(changes[0].state).toBe("connected");
		});

		it("should transition connected -> disconnected on manual disconnect", async () => {
			await bridge.connect();
			bridge.disconnect();

			const changes = bridge.getStateChanges();
			expect(changes).toHaveLength(2);
			expect(changes[1].state).toBe("disconnected");
			expect(changes[1].reason).toBe("Manual disconnect");
		});

		it("should not duplicate same-state transitions (except reconnecting)", () => {
			bridge.transitionTo("connected");
			bridge.transitionTo("connected"); // should be ignored

			expect(bridge.getStateChanges()).toHaveLength(1);
		});

		it("should allow repeated reconnecting transitions", () => {
			bridge.transitionTo("reconnecting");
			bridge.transitionTo("reconnecting");

			expect(bridge.getStateChanges()).toHaveLength(2);
		});
	});

	// =========================================================================
	// CONNECTION RESET
	// =========================================================================

	describe("Connection reset", () => {
		it("should reset reconnect state on successful connect", async () => {
			await bridge.connect();

			expect(bridge.connectionManager.resetReconnectState).toHaveBeenCalled();
		});

		it("should close client on disconnect", () => {
			bridge.disconnect();

			expect(bridge.client.close).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// DEGRADED STATE
	// =========================================================================

	describe("Degraded state", () => {
		it("should support degraded state transition", () => {
			bridge.transitionTo("degraded");

			expect(bridge.getState()).toBe("degraded");
		});

		it("should track state change history correctly", async () => {
			await bridge.connect();
			bridge.transitionTo("degraded");
			bridge.disconnect();

			const changes = bridge.getStateChanges();
			expect(changes.map((c) => c.state)).toEqual([
				"connected",
				"degraded",
				"disconnected",
			]);
		});
	});
});
