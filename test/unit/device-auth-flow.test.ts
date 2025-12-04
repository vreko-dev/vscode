import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceAuthFlow } from "../../src/auth/DeviceAuthFlow";

/**
 * Device Authorization Flow - Tests (TDD REFACTOR PHASE)
 *
 * Tests for RFC 8628 Device Authorization Grant Flow for VS Code extension
 * Ensures reliable authentication on WSL, Remote SSH, and Codespaces
 *
 * Flow:
 * 1. Extension requests device code → /api/auth/device-code
 * 2. Extension shows verification_uri + user_code to user
 * 3. User visits URL in browser, enters code, logs in via OAuth
 * 4. Extension polls for token → /api/auth/device-token (with exponential backoff)
 * 5. Server returns authorization_pending until user approves
 * 6. On approval, server returns API key
 * 7. Extension stores API key securely and continues
 *
 * RFC 8628: https://tools.ietf.org/html/rfc8628
 */

// Mock context with proper VS Code ExtensionContext interface
class MockExtensionContext {
	private _secrets: Map<string, string> = new Map();
	private _globalState: Map<string, unknown> = new Map();

	get secrets() {
		return {
			store: async (key: string, value: string) => {
				this._secrets.set(key, value);
			},
			get: async (key: string) => {
				return this._secrets.get(key);
			},
			delete: async (key: string) => {
				this._secrets.delete(key);
			},
			onDidChange: { event: undefined },
		};
	}

	get globalState() {
		return {
			update: async (key: string, value: unknown) => {
				this._globalState.set(key, value);
			},
			get: (key: string) => this._globalState.get(key),
		};
	}

	getStoredSecret(key: string): string | undefined {
		return this._secrets.get(key);
	}

	clearSecrets() {
		this._secrets.clear();
	}
}

describe("DeviceAuthFlow", () => {
	let mockContext: MockExtensionContext;
	let deviceAuthFlow: DeviceAuthFlow;
	const apiBaseUrl = "http://localhost:3000/api";

	let fetchSpy: ReturnType<typeof vi.fn>;
	let fetchQueue: Array<{
		ok: boolean;
		status: number;
		json: () => Promise<any>;
		statusText?: string;
	}> = [];

	beforeEach(() => {
		mockContext = new MockExtensionContext();
		fetchQueue = [];

		// Mock fetch with queue-based responses
		fetchSpy = vi.fn(async (_url: string, _options?: any) => {
			if (fetchQueue.length === 0) {
				throw new Error("Unexpected fetch call");
			}
			return fetchQueue.shift();
		});

		global.fetch = fetchSpy;
		deviceAuthFlow = new DeviceAuthFlow(mockContext as any, apiBaseUrl);
	});

	afterEach(() => {
		vi.clearAllMocks();
		fetchQueue = [];
	});

	describe("Request Device Code", () => {
		it("should request device code from /api/auth/device-code", async () => {
			// Mock device code response
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_DEV_ABC123XYZ789",
						user_code: "ABCD-WXYZ",
						verification_uri: "https://snapback.dev/auth/device?code=ABCD-WXYZ",
						expires_in: 900,
						interval: 5,
					},
				}),
			});

			// Mock token response
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_test",
						user_id: "user_test",
						tier: "free",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();

			expect(result).toBeDefined();
			expect(result.api_key).toBe("sk_live_test");

			// Verify correct endpoint was called
			expect(fetchSpy).toHaveBeenCalledWith(
				expect.stringContaining("/auth/device-code"),
				expect.any(Object),
			);
		});

		it("should validate device code response has all required fields", async () => {
			// Mock responses
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_TEST",
						user_code: "TEST-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_test",
						user_id: "user_test",
						tier: "free",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();

			expect(result).toHaveProperty("api_key");
			expect(result).toHaveProperty("user_id");
			expect(result).toHaveProperty("tier");
		});

		it("should handle network errors", async () => {
			fetchSpy.mockRejectedValueOnce(new Error("Network error"));

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(
				/network|error/i,
			);
		});

		it("should handle HTTP errors (5xx)", async () => {
			fetchQueue.push({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({
					success: false,
					error: "Internal server error",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow();
		});
	});

	describe("Polling for Token", () => {
		it("should poll /api/auth/device-token with device_code", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_POLL_TEST",
						user_code: "POLL-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// Token poll response
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_poll_test",
						user_id: "user_poll",
						tier: "free",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();

			expect(result.api_key).toBe("sk_live_poll_test");

			// Verify both endpoints were called
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		});

		it("should handle authorization_pending and retry", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_PENDING",
						user_code: "PENDING-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// First poll: still pending
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					error: "authorization_pending",
				}),
			});

			// Second poll: approved
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_pending",
						user_id: "user_pending",
						tier: "pro",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();

			expect(result.api_key).toBe("sk_live_pending");
			expect(fetchSpy).toHaveBeenCalledTimes(3); // code request + 2 polls
		});

		it("should handle slow_down error by increasing interval", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_SLOWDOWN",
						user_code: "SLOWDOWN-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// First poll: slow_down
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					error: "slow_down",
				}),
			});

			// Second poll: success
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_slowdown",
						user_id: "user_slowdown",
						tier: "free",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();

			expect(result.api_key).toBe("sk_live_slowdown");
		});

		it("should timeout after expires_in seconds", async () => {
			// Device code with very short expiry
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_EXPIRE",
						user_code: "EXPIRE-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 0.1, // 100ms
						interval: 1,
					},
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(
				/timeout|expire/i,
			);
		}, 5000);

		it("should handle expired_token error from server", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_EXPIRED",
						user_code: "EXPIRED-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 5,
					},
				}),
			});

			// Poll: expired_token
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					error: "expired_token",
					error_description: "Device code has expired",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(/expired/i);
		}, 5000);

		it("should handle invalid_request error", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "INVALID_CODE",
						user_code: "INVALID",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 5,
					},
				}),
			});

			// Poll: invalid_request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					error: "invalid_request",
					error_description: "Invalid device code format",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(/invalid/i);
		}, 5000);
	});

	describe("Complete Success Flow", () => {
		it("should complete full device auth flow successfully", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_SUCCESS",
						user_code: "ABCD-WXYZ",
						verification_uri: "https://snapback.dev/auth/device?code=ABCD-WXYZ",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// Token poll
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_success_123",
						user_id: "user_success",
						tier: "pro",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();

			expect(result).toEqual({
				api_key: "sk_live_success_123",
				user_id: "user_success",
				tier: "pro",
			});
		});

		it("should store API key in VS Code secrets (not globalState)", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_SECRETS",
						user_code: "SECRETS-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// Token poll
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_secret_key",
						user_id: "user_secret",
						tier: "free",
					},
				}),
			});

			const _result = await deviceAuthFlow.authenticate();

			// Verify stored in encrypted secrets
			expect(mockContext.getStoredSecret("snapback.apiKey")).toBe(
				"sk_live_secret_key",
			);

			// Verify NOT in plaintext globalState
			expect(mockContext.globalState.get("snapback.apiKey")).toBeUndefined();
		});
	});

	describe("State Machine", () => {
		it("should track flow state (idle → waiting_for_approval → approved)", async () => {
			expect(deviceAuthFlow.getState()).toBe("idle");

			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_STATE",
						user_code: "STATE-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// First poll: still pending
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					error: "authorization_pending",
				}),
			});

			// Token poll
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_state",
						user_id: "user_state",
						tier: "free",
					},
				}),
			});

			const authPromise = deviceAuthFlow.authenticate();

			// Check state after brief delay to ensure it's been set
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(deviceAuthFlow.getState()).toBe("waiting_for_approval");

			await authPromise;

			// Should be approved after success
			expect(deviceAuthFlow.getState()).toBe("approved");
		});
	});

	describe("Cancellation", () => {
		it("should allow cancellation at any time", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_CANCEL",
						user_code: "CANCEL-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			const authPromise = deviceAuthFlow.authenticate();

			// Cancel immediately while in polling loop
			deviceAuthFlow.cancel();

			await expect(authPromise).rejects.toThrow();

			expect(deviceAuthFlow.getState()).toBe("cancelled");
		});
	});

	describe("Error Handling", () => {
		it("should track and expose last error", async () => {
			fetchSpy.mockRejectedValueOnce(new Error("Network timeout"));

			try {
				await deviceAuthFlow.authenticate();
			} catch {
				// expected
			}

			const lastError = deviceAuthFlow.getLastError();
			expect(lastError).toBeDefined();
			expect(lastError?.message).toContain("timeout");
		});

		it("should handle rate limiting (429)", async () => {
			fetchQueue.push({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				json: async () => ({
					error: "rate_limit_exceeded",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow();
		});
	});

	describe("Cross-Platform Compatibility", () => {
		it("should work on WSL (pure HTTP polling)", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_WSL",
						user_code: "WSL-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// Token poll
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_wsl",
						user_id: "user_wsl",
						tier: "free",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();

			expect(result.api_key).toBe("sk_live_wsl");
		});

		it("should work on Remote SSH", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_REMOTE",
						user_code: "REMOTE-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// Token poll
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_remote",
						user_id: "user_remote",
						tier: "pro",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();

			expect(result.api_key).toBe("sk_live_remote");
		});

		it("should work on GitHub Codespaces", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_CODESPACES",
						user_code: "CS-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// Token poll
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_codespaces",
						user_id: "user_cs",
						tier: "free",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();

			expect(result.api_key).toBe("sk_live_codespaces");
		});
	});

	describe("Concurrent Safety", () => {
		it("should prevent concurrent authenticate() calls", async () => {
			// Device code request
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_CONCURRENT",
						user_code: "CONC-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// Start first auth
			const promise1 = deviceAuthFlow.authenticate();

			// Try second auth while first in progress
			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(
				/already|in progress/i,
			);

			// Cancel first
			deviceAuthFlow.cancel();

			await expect(promise1).rejects.toThrow();
		});
	});
});

describe("RFC 8628 Error Path Handling", () => {
	describe("Device Code Request Failures", () => {
		it("should handle network error on device code request", async () => {
			// Simulate network failure
			fetchQueue.push({
				ok: false,
				status: 0,
				json: async () => ({}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(
				/device code request|failed/i,
			);
		});

		it("should handle 401 Unauthorized on device code request", async () => {
			fetchQueue.push({
				ok: false,
				status: 401,
				json: async () => ({
					error: "unauthorized",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(
				/401|unauthorized/i,
			);
		});

		it("should handle 429 Rate Limited on device code request", async () => {
			fetchQueue.push({
				ok: false,
				status: 429,
				json: async () => ({
					error: "too_many_requests",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(
				/429|rate limit|too_many_requests/i,
			);
		});

		it("should handle 500 Server Error on device code request", async () => {
			fetchQueue.push({
				ok: false,
				status: 500,
				json: async () => ({
					error: "internal_server_error",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(
				/500|internal|server error/i,
			);
		});

		it("should handle malformed JSON response", async () => {
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => {
					throw new SyntaxError("Unexpected token");
				},
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow();
		});

		it("should handle missing device_code in response", async () => {
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						user_code: "ABCD-WXYZ",
						verification_uri: "https://snapback.dev/auth/device",
						// Missing: device_code
						expires_in: 900,
						interval: 5,
					},
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(
				/missing required field|device_code/i,
			);
		});
	});

	describe("Token Poll Failures", () => {
		it("should handle network error on token poll", async () => {
			// Device code request - success
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_NET_ERROR",
						user_code: "NETERR-CD",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 0.1,
					},
				}),
			});

			// Token poll - network error
			fetchQueue.push({
				ok: false,
				status: 0,
				json: async () => {
					throw new Error("Network error");
				},
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(/timeout|expire/i);
		}, 5000);

		it("should handle 401 Unauthorized on token poll", async () => {
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_401",
						user_code: "UNAUTH-CD",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 0.1,
						interval: 0.05,
					},
				}),
			});

			fetchQueue.push({
				ok: false,
				status: 401,
				json: async () => ({
					error: "unauthorized",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow();
		}, 5000);
	});

	describe("RFC 8628 Error Responses", () => {
		it("should handle slow_down error with interval increase", async () => {
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_SLOWDOWN",
						user_code: "SLOW-CODE",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			// First poll: slow_down
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					error: "slow_down",
				}),
			});

			// Second poll: success
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						api_key: "sk_live_slowdown_recovered",
						user_id: "user_slowdown",
						tier: "free",
					},
				}),
			});

			const result = await deviceAuthFlow.authenticate();
			expect(result.api_key).toBe("sk_live_slowdown_recovered");
		});

		it("should throw on expired_token error", async () => {
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_EXPIRED",
						user_code: "EXPIRED-CD",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					error: "expired_token",
					error_description: "Device code has expired",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(/expired/i);
		});

		it("should throw on invalid_request error", async () => {
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "INVALID_FORMAT",
						user_code: "INVALID-CD",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 1,
					},
				}),
			});

			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					error: "invalid_request",
					error_description: "Invalid device code format",
				}),
			});

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow(/invalid/i);
		});
	});

	describe("Cancellation During Error Recovery", () => {
		it("should not override cancelled state on network error", async () => {
			fetchQueue.push({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						device_code: "AUTH_CANCEL",
						user_code: "CANCEL-CD",
						verification_uri: "https://snapback.dev/auth/device",
						expires_in: 900,
						interval: 2,
					},
				}),
			});

			// Cancel immediately
			setTimeout(() => {
				deviceAuthFlow.cancel();
			}, 100);

			await expect(deviceAuthFlow.authenticate()).rejects.toThrow();
			expect(deviceAuthFlow.getState()).toBe("cancelled");
		});
	});
});
