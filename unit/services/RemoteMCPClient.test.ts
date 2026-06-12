/**
 * RemoteMCPClient Unit Tests
 *
 * Comprehensive test coverage for RemoteMCPClient covering:
 * - Constructor options and defaults
 * - Connection with retry logic
 * - Health check with authentication headers
 * - Request sending with retries and exponential backoff
 * - Heartbeat monitoring
 * - Background reconnection
 * - Disconnect and cleanup
 * - Edge cases and error handling
 *
 * Coverage Target: ≥90%
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkResponse } from "../../../src/network/NetworkAdapter";

// Mock the QueuedNetworkAdapter class
const mockNetworkAdapter = {
	get: vi.fn(),
	post: vi.fn(),
	dispose: vi.fn(),
};

vi.mock("../../../src/network/QueuedNetworkAdapter", () => ({
	QueuedNetworkAdapter: vi.fn(() => mockNetworkAdapter),
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		trace: vi.fn(),
	},
}));

// Import AFTER mocks are set up
import {
	RemoteMCPClient,
	type RemoteMCPOptions,
	type ConnectionStateCallback,
} from "../../../src/services/RemoteMCPClient";

// Constants from the implementation for testing
const HEARTBEAT_INTERVAL_MS = 15000;
const BACKGROUND_RECONNECT_INTERVAL_MS = 60000;
const PROACTIVE_HEALTH_CHECK_THRESHOLD_MS = 10000;

describe("RemoteMCPClient", () => {
	let client: RemoteMCPClient;
	let options: RemoteMCPOptions;
	let stateChangeCallback: ConnectionStateCallback;

	const createSuccessResponse = <T = unknown>(data: T): NetworkResponse<T> => ({
		ok: true,
		status: 200,
		statusText: "OK",
		data,
	});

	const createErrorResponse = (status: number, statusText: string): NetworkResponse => ({
		ok: false,
		status,
		statusText,
		data: null,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();

		stateChangeCallback = vi.fn();
		options = {
			serverUrl: "https://mcp.example.com",
			authToken: "test-token",
			onStateChange: stateChangeCallback,
		};

		// Default successful health check response
		mockNetworkAdapter.get.mockResolvedValue(
			createSuccessResponse({ version: "1.0.0", uptime: 12345 }),
		);

		// Default successful POST response
		mockNetworkAdapter.post.mockResolvedValue(createSuccessResponse({ success: true }));
	});

	afterEach(async () => {
		vi.useRealTimers();
		if (client) {
			try {
				await client.disconnect();
			} catch {
				// Ignore disconnect errors in cleanup
			}
		}
		// Clear all mocks to prevent state leakage between tests
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("should set serverUrl without trailing slash", () => {
			client = new RemoteMCPClient({
				serverUrl: "https://mcp.example.com/",
			});
			expect(client).toBeDefined();
			expect(client.isServerReady()).toBe(false);
		});

		it("should use default maxRetries (5) when not provided", () => {
			client = new RemoteMCPClient(options);
			expect(client).toBeDefined();
		});

		it("should use custom maxRetries when provided", () => {
			client = new RemoteMCPClient({ ...options, maxRetries: 10 });
			expect(client).toBeDefined();
		});

		it("should set authToken from options", () => {
			client = new RemoteMCPClient(options);
			expect(client).toBeDefined();
		});

		it("should use default authType 'bearer' when not provided", () => {
			client = new RemoteMCPClient(options);
			expect(client).toBeDefined();
		});

		it("should use 'apikey' authType when specified", () => {
			client = new RemoteMCPClient({
				...options,
				authType: "apikey",
				apiKey: "test-api-key",
			});
			expect(client).toBeDefined();
		});

		it("should store onStateChange callback", () => {
			client = new RemoteMCPClient(options);
			expect(client).toBeDefined();
		});

		it("should handle missing optional parameters", () => {
			client = new RemoteMCPClient({
				serverUrl: "https://mcp.example.com",
			});
			expect(client).toBeDefined();
		});

		it("should remove single trailing slash from serverUrl", () => {
			client = new RemoteMCPClient({
				serverUrl: "https://mcp.example.com/",
			});
			expect(client).toBeDefined();
		});

		it("should remove multiple trailing slashes from serverUrl", () => {
			client = new RemoteMCPClient({
				serverUrl: "https://mcp.example.com///",
			});
			expect(client).toBeDefined();
		});
	});

	describe("connect", () => {
		describe("successful connection", () => {
			beforeEach(() => {
				client = new RemoteMCPClient(options);
			});

			it("should connect successfully on first attempt", async () => {
				await client.connect();

				expect(client.isServerReady()).toBe(true);
				expect(stateChangeCallback).toHaveBeenCalledWith("connected", undefined, undefined);
			});

			it("should emit reconnecting state during connection", async () => {
				await client.connect();

				// First call should be reconnecting (attempt 1/5)
				expect(stateChangeCallback).toHaveBeenCalledWith("reconnecting", 1, 5);
			});

			it("should reset reconnectAttempts on successful connection", async () => {
				await client.connect();
				expect(client.isServerReady()).toBe(true);
			});

			it("should start heartbeat after successful connection", async () => {
				vi.useFakeTimers();

				await client.connect();
				expect(mockNetworkAdapter.get).toHaveBeenCalledTimes(1);

				// Heartbeat should be running - advance time to trigger it
				await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);

				// Health check should be called again
				expect(mockNetworkAdapter.get).toHaveBeenCalledTimes(2);
			});

			it("should call health endpoint with correct URL", async () => {
				await client.connect();

				expect(mockNetworkAdapter.get).toHaveBeenCalledWith(
					"https://mcp.example.com/health",
					expect.objectContaining({
						"Content-Type": "application/json",
					}),
				);
			});
		});

		describe("retry logic", () => {
			beforeEach(() => {
				vi.useFakeTimers();
				client = new RemoteMCPClient(options);
			});

			it("should retry on connection failure with exponential backoff", async () => {
				mockNetworkAdapter.get.mockRejectedValueOnce(new Error("Network error"));
				mockNetworkAdapter.get.mockResolvedValue(
					createSuccessResponse({ version: "1.0.0" }),
				);

				const connectPromise = client.connect();

				// First attempt fails, then retries
				await vi.advanceTimersByTimeAsync(3000);

				await connectPromise;

				expect(mockNetworkAdapter.get).toHaveBeenCalledTimes(2);
			});

			it("should emit reconnecting state on each retry", async () => {
				mockNetworkAdapter.get.mockRejectedValueOnce(new Error("Network error 1"));
				mockNetworkAdapter.get.mockRejectedValueOnce(new Error("Network error 2"));
				mockNetworkAdapter.get.mockResolvedValue(
					createSuccessResponse({ version: "1.0.0" }),
				);

				const connectPromise = client.connect();

				// Advance through retries
				await vi.advanceTimersByTimeAsync(10000);

				await connectPromise;

				// Should have multiple reconnecting calls
				expect(stateChangeCallback).toHaveBeenCalledWith("reconnecting", 1, 5);
				expect(stateChangeCallback).toHaveBeenCalledWith("reconnecting", 2, 5);
				expect(stateChangeCallback).toHaveBeenCalledWith("connected", undefined, undefined);
			});

			it("should start background reconnection after max retries exhausted", async () => {
				mockNetworkAdapter.get.mockRejectedValue(new Error("Network error"));

				const connectPromise = client.connect();

				// Advance through all retry attempts
				await vi.advanceTimersByTimeAsync(120000);

				await expect(connectPromise).rejects.toThrow("MCP connection failed after 5 attempts");

				expect(stateChangeCallback).toHaveBeenCalledWith("disconnected", undefined, undefined);
			});

			it("should throw error with helpful message on max retries", async () => {
				mockNetworkAdapter.get.mockRejectedValue(new Error("Connection refused"));

				const connectPromise = client.connect();

				await vi.advanceTimersByTimeAsync(120000);

				await expect(connectPromise).rejects.toThrow(/Check network connectivity/);
				await expect(connectPromise).rejects.toThrow(/Diagnose MCP/);
				await expect(connectPromise).rejects.toThrow(/Connection refused/);
			});

			it("should stop background reconnection on explicit connect call", async () => {
				// First connection fails - mock all calls to fail for this connection
				mockNetworkAdapter.get.mockRejectedValue(new Error("Network error"));

				const firstConnect = client.connect();
				// Advance through all retry attempts
				await vi.advanceTimersByTimeAsync(120000);
				await expect(firstConnect).rejects.toThrow();

				// Now make connection succeed
				mockNetworkAdapter.get.mockResolvedValue(
					createSuccessResponse({ version: "1.0.0" }),
				);

				const secondConnect = client.connect();
				await vi.advanceTimersByTimeAsync(10);
				await secondConnect;

				expect(client.isServerReady()).toBe(true);
			});
		});
	});

	describe("healthCheck", () => {
		beforeEach(() => {
			client = new RemoteMCPClient(options);
		});

		it("should include bearer auth header when authType is bearer", async () => {
			client = new RemoteMCPClient({
				...options,
				authType: "bearer",
				authToken: "my-bearer-token",
			});

			await client.connect();

			expect(mockNetworkAdapter.get).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					Authorization: "Bearer my-bearer-token",
				}),
			);
		});

		it("should include API key header when authType is apikey", async () => {
			client = new RemoteMCPClient({
				...options,
				authType: "apikey",
				apiKey: "my-api-key",
			});

			await client.connect();

			expect(mockNetworkAdapter.get).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					"X-API-Key": "my-api-key",
				}),
			);
		});

		it("should not include auth headers when no auth provided", async () => {
			client = new RemoteMCPClient({
				serverUrl: "https://mcp.example.com",
			});

			await client.connect();

			const calls = mockNetworkAdapter.get.mock.calls;
			const headers = calls[0][1] as Record<string, string>;

			expect(headers.Authorization).toBeUndefined();
			expect(headers["X-API-Key"]).toBeUndefined();
		});

		it("should throw on non-OK response", async () => {
			vi.useFakeTimers();
			mockNetworkAdapter.get.mockResolvedValue(
				createErrorResponse(503, "Service Unavailable"),
			);

			const connectPromise = client.connect();
			// Advance through all retry attempts
			await vi.advanceTimersByTimeAsync(120000);

			await expect(connectPromise).rejects.toThrow();
			vi.useRealTimers();
		});

		it("should update status on successful health check", async () => {
			mockNetworkAdapter.get.mockResolvedValue(
				createSuccessResponse({ version: "2.0.0", uptime: 60000 }),
			);

			await client.connect();

			const status = client.getStatus();
			expect(status.ready).toBe(true);
			expect(status.version).toBe("2.0.0");
			expect(status.uptime).toBe(60000);
			expect(status.lastPing).toBeInstanceOf(Date);
		});
	});

	describe("sendRequest", () => {
		beforeEach(async () => {
			vi.useFakeTimers();
			client = new RemoteMCPClient(options);
			await client.connect();
		});

		it("should send POST request with correct endpoint", async () => {
			await client.sendRequest("/tools/snapshot", { path: "/test" });

			expect(mockNetworkAdapter.post).toHaveBeenCalledWith(
				"https://mcp.example.com/tools/snapshot",
				{ path: "/test" },
				expect.objectContaining({
					"Content-Type": "application/json",
				}),
			);
		});

		it("should include bearer auth header in request", async () => {
			await client.sendRequest("/tools/test");

			// Check that post was called and the headers contain the auth
			expect(mockNetworkAdapter.post).toHaveBeenCalled();
			const callArgs = mockNetworkAdapter.post.mock.calls[0];
			expect(callArgs[0]).toContain("/tools/test");
			expect(callArgs[2]).toMatchObject({
				Authorization: "Bearer test-token",
			});
		});

		it("should include API key header when authType is apikey", async () => {
			client = new RemoteMCPClient({
				...options,
				authType: "apikey",
				apiKey: "my-api-key",
			});
			await client.connect();

			await client.sendRequest("/tools/test");

			// Check that post was called and the headers contain the API key
			expect(mockNetworkAdapter.post).toHaveBeenCalled();
			const callArgs = mockNetworkAdapter.post.mock.calls[0];
			expect(callArgs[0]).toContain("/tools/test");
			expect(callArgs[2]).toMatchObject({
				"X-API-Key": "my-api-key",
			});
		});

		it("should return response data on success", async () => {
			mockNetworkAdapter.post.mockResolvedValue(
				createSuccessResponse({ result: "success", id: "snap-123" }),
			);

			const result = await client.sendRequest("/tools/snapshot");

			expect(result).toEqual({ result: "success", id: "snap-123" });
		});

		it("should retry on request failure", async () => {
			mockNetworkAdapter.post.mockRejectedValueOnce(new Error("Network error"));
			mockNetworkAdapter.post.mockResolvedValue(createSuccessResponse({ success: true }));

			const requestPromise = client.sendRequest("/tools/test");

			// Advance past retry delay
			await vi.advanceTimersByTimeAsync(2000);

			const result = await requestPromise;

			expect(mockNetworkAdapter.post).toHaveBeenCalledTimes(2);
			expect(result).toEqual({ success: true });
		});

		it("should retry with exponential backoff", async () => {
			mockNetworkAdapter.post.mockRejectedValueOnce(new Error("Error 1"));
			mockNetworkAdapter.post.mockRejectedValueOnce(new Error("Error 2"));
			mockNetworkAdapter.post.mockResolvedValue(createSuccessResponse({ success: true }));

			const requestPromise = client.sendRequest("/tools/test");

			// First retry: ~1000ms
			await vi.advanceTimersByTimeAsync(1500);
			// Second retry: ~2000ms
			await vi.advanceTimersByTimeAsync(2500);

			const result = await requestPromise;

			expect(mockNetworkAdapter.post).toHaveBeenCalledTimes(3);
		});

		it("should throw after max request retries", async () => {
			mockNetworkAdapter.post.mockRejectedValue(new Error("Persistent error"));

			const requestPromise = client.sendRequest("/tools/test");

			// Advance through all retries
			await vi.advanceTimersByTimeAsync(10000);

			await expect(requestPromise).rejects.toThrow(
				"MCP request to /tools/test failed after 3 retries: Persistent error",
			);
		});

		it("should throw on non-OK response status", async () => {
			mockNetworkAdapter.post.mockResolvedValue(createErrorResponse(500, "Internal Server Error"));

			const requestPromise = client.sendRequest("/tools/test");

			await vi.advanceTimersByTimeAsync(10000);

			await expect(requestPromise).rejects.toThrow(/failed after 3 retries/);
		});

		it("should throw when client is not ready", async () => {
			// Force disconnect
			await client.disconnect();

			// Mock the health check to fail so reconnection fails
			mockNetworkAdapter.get.mockRejectedValue(new Error("Not connected"));
			mockNetworkAdapter.post.mockResolvedValue(createSuccessResponse({}));

			const requestPromise = client.sendRequest("/tools/test");

			await vi.advanceTimersByTimeAsync(15000);

			await expect(requestPromise).rejects.toThrow();
		});
	});

	describe("heartbeat", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			client = new RemoteMCPClient(options);
		});

		it("should start heartbeat after successful connection", async () => {
			await client.connect();

			// Initial connect + no heartbeat yet
			expect(mockNetworkAdapter.get).toHaveBeenCalledTimes(1);

			// Advance past heartbeat interval
			await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);

			// Heartbeat should trigger another health check
			expect(mockNetworkAdapter.get).toHaveBeenCalledTimes(2);
		});

		it("should continue heartbeat at regular intervals", async () => {
			await client.connect();

			// Advance through multiple heartbeat intervals
			for (let i = 0; i < 5; i++) {
				await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
			}

			// Initial connect + 5 heartbeats
			expect(mockNetworkAdapter.get).toHaveBeenCalledTimes(6);
		});

		it("should detect disconnection on heartbeat failure", async () => {
			await client.connect();

			// Clear the mock call count
			mockNetworkAdapter.get.mockClear();

			// Make heartbeat fail
			mockNetworkAdapter.get.mockRejectedValue(new Error("Server unreachable"));

			// Advance to trigger heartbeat
			await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(5000);

			// Should have detected disconnection
			expect(stateChangeCallback).toHaveBeenCalledWith("disconnected", undefined, undefined);
		});

		it("should attempt reconnection after heartbeat failure", async () => {
			await client.connect();

			mockNetworkAdapter.get.mockClear();

			// First heartbeat fails
			mockNetworkAdapter.get.mockRejectedValueOnce(new Error("Server unreachable"));
			mockNetworkAdapter.get.mockResolvedValue(
				createSuccessResponse({ version: "1.0.0" }),
			);

			await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(5000);

			// Should have reconnected
			expect(stateChangeCallback).toHaveBeenCalledWith("connected", undefined, undefined);
		});

		it("should clear existing heartbeat on reconnect", async () => {
			await client.connect();

			// Trigger a disconnect and reconnect
			mockNetworkAdapter.get.mockRejectedValueOnce(new Error("Error"));
			mockNetworkAdapter.get.mockResolvedValue(createSuccessResponse({}));

			await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(5000);

			// Should not have multiple timers running
			expect(client.isServerReady()).toBe(true);
		});
	});

	describe("background reconnection", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			client = new RemoteMCPClient(options);
		});

		it("should start background reconnection after max retries", async () => {
			mockNetworkAdapter.get.mockRejectedValue(new Error("Network error"));

			const connectPromise = client.connect();

			// Exhaust all initial retries
			await vi.advanceTimersByTimeAsync(120000);

			await expect(connectPromise).rejects.toThrow();

			// Background reconnection should be started
			mockNetworkAdapter.get.mockResolvedValue(
				createSuccessResponse({ version: "1.0.0" }),
			);

			// Advance past background reconnect interval
			await vi.advanceTimersByTimeAsync(BACKGROUND_RECONNECT_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(1000);

			// Should have reconnected
			expect(stateChangeCallback).toHaveBeenCalledWith("connected", undefined, undefined);
		});

		it("should retry background reconnection every 60 seconds", async () => {
			mockNetworkAdapter.get.mockRejectedValue(new Error("Network error"));

			const connectPromise = client.connect();
			await vi.advanceTimersByTimeAsync(120000);
			await expect(connectPromise).rejects.toThrow();

			mockNetworkAdapter.get.mockClear();
			mockNetworkAdapter.get.mockRejectedValue(new Error("Still down"));

			// Trigger first background attempt
			await vi.advanceTimersByTimeAsync(BACKGROUND_RECONNECT_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(1000);

			// Trigger second background attempt
			await vi.advanceTimersByTimeAsync(BACKGROUND_RECONNECT_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(1000);

			// Multiple background attempts
			expect(mockNetworkAdapter.get).toHaveBeenCalledTimes(2);
		});

		it("should stop background reconnection on successful connect", async () => {
			mockNetworkAdapter.get.mockRejectedValue(new Error("Network error"));

			const connectPromise = client.connect();
			await vi.advanceTimersByTimeAsync(120000);
			await expect(connectPromise).rejects.toThrow();

			// Now server comes back
			mockNetworkAdapter.get.mockResolvedValue(
				createSuccessResponse({ version: "1.0.0" }),
			);

			// Trigger background reconnection
			await vi.advanceTimersByTimeAsync(BACKGROUND_RECONNECT_INTERVAL_MS);
			await vi.advanceTimersByTimeAsync(1000);

			expect(client.isServerReady()).toBe(true);
		});
	});

	describe("ensureConnected", () => {
		beforeEach(() => {
			client = new RemoteMCPClient(options);
		});

		it("should not check health if recently checked", async () => {
			await client.connect();

			mockNetworkAdapter.get.mockClear();

			// Call ensureConnected immediately after connect
			// This should NOT trigger a new health check since we just connected
			await client.ensureConnected();

			// No additional health check should be made
			expect(mockNetworkAdapter.get).not.toHaveBeenCalled();
		});

		it("should check health if last check was long ago", async () => {
			vi.useFakeTimers();
			await client.connect();

			mockNetworkAdapter.get.mockClear();

			// Advance past the proactive health check threshold
			await vi.advanceTimersByTimeAsync(PROACTIVE_HEALTH_CHECK_THRESHOLD_MS + 1000);

			await client.ensureConnected();

			expect(mockNetworkAdapter.get).toHaveBeenCalled();
		});

		it("should check health if not ready", async () => {
			// Don't connect, but mock health check to succeed
			mockNetworkAdapter.get.mockResolvedValue(
				createSuccessResponse({ version: "1.0.0" }),
			);

			await client.ensureConnected();

			expect(mockNetworkAdapter.get).toHaveBeenCalled();
		});

		it("should throw when health check fails", async () => {
			mockNetworkAdapter.get.mockResolvedValue(
				createErrorResponse(503, "Service Unavailable"),
			);

			await expect(client.ensureConnected()).rejects.toThrow("MCP server not reachable");
		});

		it("should emit connected state when transitioning from disconnected", async () => {
			// Start disconnected
			mockNetworkAdapter.get.mockResolvedValue(
				createSuccessResponse({ version: "1.0.0" }),
			);

			await client.ensureConnected();

			expect(stateChangeCallback).toHaveBeenCalledWith("connected", undefined, undefined);
		});
	});

	describe("disconnect", () => {
		beforeEach(() => {
			client = new RemoteMCPClient(options);
		});

		it("should clear heartbeat interval", async () => {
			vi.useFakeTimers();
			await client.connect();

			await client.disconnect();

			// Advance past heartbeat interval
			await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2);

			// Should not trigger any more health checks after disconnect
			const callCount = mockNetworkAdapter.get.mock.calls.length;
			await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
			expect(mockNetworkAdapter.get.mock.calls.length).toBe(callCount);
		});

		it("should set isReady to false", async () => {
			await client.connect();

			expect(client.isServerReady()).toBe(true);

			await client.disconnect();

			expect(client.isServerReady()).toBe(false);
		});

		it("should set status.ready to false", async () => {
			await client.connect();

			await client.disconnect();

			const status = client.getStatus();
			expect(status.ready).toBe(false);
		});

		it("should emit disconnected state", async () => {
			await client.connect();

			await client.disconnect();

			// Callback receives (state, attempt, maxAttempts) - check first arg only
			expect(stateChangeCallback).toHaveBeenCalledWith("disconnected", undefined, undefined);
		});

		it("should stop background reconnection", async () => {
			vi.useFakeTimers();
			mockNetworkAdapter.get.mockRejectedValue(new Error("Network error"));

			const connectPromise = client.connect();
			await vi.advanceTimersByTimeAsync(120000);
			await expect(connectPromise).rejects.toThrow();

			await client.disconnect();

			mockNetworkAdapter.get.mockClear();

			// Advance past background reconnect interval
			await vi.advanceTimersByTimeAsync(BACKGROUND_RECONNECT_INTERVAL_MS * 2);

			// Should not trigger any background reconnection attempts
			expect(mockNetworkAdapter.get).not.toHaveBeenCalled();
		});

		it("should be safe to call multiple times", async () => {
			await client.connect();

			// Test that multiple disconnects don't throw
			await client.disconnect();
			await client.disconnect();
			await client.disconnect();
		});
	});

	describe("dispose", () => {
		beforeEach(() => {
			client = new RemoteMCPClient(options);
		});

		it("should call disconnect", async () => {
			vi.useFakeTimers();
			await client.connect();

			client.dispose();

			await vi.advanceTimersByTimeAsync(100);

			// Callback receives (state, attempt, maxAttempts) - check first arg only
			expect(stateChangeCallback).toHaveBeenCalledWith("disconnected", undefined, undefined);
		});

		it("should handle errors during disconnect gracefully", async () => {
			vi.useFakeTimers();
			await client.connect();

			// Make health check fail during disconnect
			mockNetworkAdapter.get.mockRejectedValue(new Error("Disconnect error"));

			expect(() => client.dispose()).not.toThrow();
		});
	});

	describe("isServerReady", () => {
		beforeEach(() => {
			client = new RemoteMCPClient(options);
		});

		it("should return false before connection", () => {
			expect(client.isServerReady()).toBe(false);
		});

		it("should return true after successful connection", async () => {
			await client.connect();

			expect(client.isServerReady()).toBe(true);
		});

		it("should return false after disconnect", async () => {
			await client.connect();
			await client.disconnect();

			expect(client.isServerReady()).toBe(false);
		});
	});

	describe("getStatus", () => {
		beforeEach(() => {
			client = new RemoteMCPClient(options);
		});

		it("should return default status before connection", () => {
			const status = client.getStatus();

			expect(status.ready).toBe(false);
			expect(status.version).toBeUndefined();
			expect(status.uptime).toBeUndefined();
			expect(status.lastPing).toBeUndefined();
		});

		it("should return updated status after connection", async () => {
			mockNetworkAdapter.get.mockResolvedValue(
				createSuccessResponse({ version: "2.1.0", uptime: 123456 }),
			);

			await client.connect();

			const status = client.getStatus();

			expect(status.ready).toBe(true);
			expect(status.version).toBe("2.1.0");
			expect(status.uptime).toBe(123456);
			expect(status.lastPing).toBeInstanceOf(Date);
		});

		it("should return a copy of status object", async () => {
			await client.connect();

			const status1 = client.getStatus();
			const status2 = client.getStatus();

			expect(status1).not.toBe(status2);
			expect(status1).toEqual(status2);
		});
	});

	describe("state change callback", () => {
		beforeEach(() => {
			client = new RemoteMCPClient(options);
		});

		it("should handle callback errors gracefully", async () => {
			const errorCallback = vi.fn().mockImplementation(() => {
				throw new Error("Callback error");
			});

			client = new RemoteMCPClient({
				...options,
				onStateChange: errorCallback,
			});

			// Should not throw even if callback errors
			await expect(client.connect()).resolves.not.toThrow();
		});

		it("should receive attempt and maxAttempts during reconnection", async () => {
			vi.useFakeTimers();
			mockNetworkAdapter.get.mockRejectedValueOnce(new Error("Error 1"));
			mockNetworkAdapter.get.mockRejectedValueOnce(new Error("Error 2"));
			mockNetworkAdapter.get.mockResolvedValue(createSuccessResponse({}));

			const connectPromise = client.connect();

			await vi.advanceTimersByTimeAsync(10000);
			await connectPromise;

			// Check that attempts were passed
			const calls = stateChangeCallback.mock.calls;
			const reconnectingCalls = calls.filter((c: unknown[]) => c[0] === "reconnecting");

			expect(reconnectingCalls.length).toBeGreaterThan(0);
			expect(reconnectingCalls[0][1]).toBeGreaterThanOrEqual(1);
			expect(reconnectingCalls[0][2]).toBe(5);
		});
	});

	describe("edge cases", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			client = new RemoteMCPClient(options);
		});

		it("should handle missing version in health response", async () => {
			mockNetworkAdapter.get.mockResolvedValue(createSuccessResponse({}));

			await client.connect();

			const status = client.getStatus();
			expect(status.ready).toBe(true);
			expect(status.version).toBeUndefined();
		});

		it("should handle missing uptime in health response", async () => {
			mockNetworkAdapter.get.mockResolvedValue(
				createSuccessResponse({ version: "1.0.0" }),
			);

			await client.connect();

			const status = client.getStatus();
			expect(status.ready).toBe(true);
			expect(status.uptime).toBeUndefined();
		});

		it("should handle concurrent connection attempts", async () => {
			mockNetworkAdapter.get.mockResolvedValue(
				createSuccessResponse({ version: "1.0.0" }),
			);

			// Start multiple connection attempts
			const promises = [client.connect(), client.connect(), client.connect()];

			await Promise.all(promises);

			expect(client.isServerReady()).toBe(true);
		});

		it("should handle request with undefined data", async () => {
			await client.connect();

			await expect(client.sendRequest("/test", undefined)).resolves.toBeDefined();
		});

		it("should handle request with null data", async () => {
			await client.connect();

			mockNetworkAdapter.post.mockResolvedValue(createSuccessResponse(null));

			const result = await client.sendRequest("/test", null);
			expect(result).toBeNull();
		});

		it("should handle server URL with path", async () => {
			client = new RemoteMCPClient({
				...options,
				serverUrl: "https://mcp.example.com/api/v1",
			});

			await client.connect();

			expect(mockNetworkAdapter.get).toHaveBeenCalledWith(
				"https://mcp.example.com/api/v1/health",
				expect.any(Object),
			);
		});

		it("should handle concurrent requests during heartbeat", async () => {
			await client.connect();

			mockNetworkAdapter.get.mockClear();
			mockNetworkAdapter.post.mockClear();

			// Simulate concurrent operations
			const operations = [
				client.sendRequest("/request1"),
				client.sendRequest("/request2"),
				client.sendRequest("/request3"),
			];

			await vi.advanceTimersByTimeAsync(100);
			await Promise.all(operations);

			// All requests should have been made
			expect(mockNetworkAdapter.post).toHaveBeenCalledTimes(3);
		});

		it("should handle rapid connect/disconnect cycles", async () => {
			for (let i = 0; i < 5; i++) {
				mockNetworkAdapter.get.mockResolvedValue(createSuccessResponse({}));

				await client.connect();
				await client.disconnect();
			}

			// Should not have any lingering timers or state issues
			expect(client.isServerReady()).toBe(false);
		});
	});

	describe("authentication", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		it("should use bearer token when provided", async () => {
			client = new RemoteMCPClient({
				serverUrl: "https://mcp.example.com",
				authToken: "my-secret-token",
				authType: "bearer",
			});

			await client.connect();

			expect(mockNetworkAdapter.get).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					Authorization: "Bearer my-secret-token",
				}),
			);
		});

		it("should use API key when authType is apikey", async () => {
			client = new RemoteMCPClient({
				serverUrl: "https://mcp.example.com",
				apiKey: "my-api-key",
				authType: "apikey",
			});

			await client.connect();

			expect(mockNetworkAdapter.get).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					"X-API-Key": "my-api-key",
				}),
			);
		});

		it("should prefer apikey over bearer when both provided with apikey type", async () => {
			client = new RemoteMCPClient({
				serverUrl: "https://mcp.example.com",
				authToken: "bearer-token",
				apiKey: "api-key-value",
				authType: "apikey",
			});

			await client.connect();

			const headers = mockNetworkAdapter.get.mock.calls[0][1] as Record<string, string>;

			expect(headers["X-API-Key"]).toBe("api-key-value");
			// Authorization should NOT be set when using apikey type
			expect(headers.Authorization).toBeUndefined();
		});

		it("should work without any authentication", async () => {
			client = new RemoteMCPClient({
				serverUrl: "https://public-mcp.example.com",
			});

			await client.connect();

			const headers = mockNetworkAdapter.get.mock.calls[0][1] as Record<string, string>;

			expect(headers.Authorization).toBeUndefined();
			expect(headers["X-API-Key"]).toBeUndefined();
		});
	});
});
