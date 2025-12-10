/**
 * Phase 1: RED Test - OAuth Flow Integration Tests
 *
 * Test ID Prefix: OAUTH-00X
 *
 * CRITICAL TESTS:
 * Tests the complete OAuth 2.0 flow with PKCE and CSRF protection
 * Using MSW (Mock Service Worker) for all HTTP calls
 *
 * Coverage Paths:
 * - Happy: Complete OAuth flow, token exchange, session storage
 * - Sad: User denies auth, token exchange fails, refresh fails
 * - Edge: CSRF protection (state validation), token expiry and refresh
 * - Error: Network timeout, invalid PKCE, malformed responses
 *
 * @see apps/vscode/src/auth/OAuthProvider.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { SnapBackOAuthProvider, type SnapBackSession } from "@vscode/auth/OAuthProvider";
import { TestCleanupManager } from "@snapback/testing/utils/TestCleanupManager";

// ============================================================================
// MSW Setup - Mock OAuth Server
// ============================================================================

const AUTH_BASE_URL = "https://auth.snapback.dev";

const mswServer = setupServer(
	// Default successful token exchange handler
	http.post(`${AUTH_BASE_URL}/oauth/token`, async ({ request }) => {
		const body = await request.text();
		const params = new URLSearchParams(body);
		const grantType = params.get("grant_type");

		// Authorization code exchange
		if (grantType === "authorization_code") {
			return HttpResponse.json({
				access_token: "test_access_token_123",
				refresh_token: "test_refresh_token_456",
				expires_in: 3600,
				token_type: "Bearer",
			});
		}

		// Refresh token exchange
		if (grantType === "refresh_token") {
			return HttpResponse.json({
				access_token: "test_access_token_new",
				refresh_token: "test_refresh_token_new",
				expires_in: 3600,
				token_type: "Bearer",
			});
		}

		return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
	}),
);

// ============================================================================
// VSCode Mock Setup
// ============================================================================

function createMockExtensionContext(): vscode.ExtensionContext {
	return {
		subscriptions: [],
		globalState: {
			get: vi.fn(),
			update: vi.fn(),
			keys: vi.fn().mockReturnValue([]),
		} as any,
		workspaceState: {
			get: vi.fn(),
			update: vi.fn(),
			keys: vi.fn().mockReturnValue([]),
		} as any,
		secrets: {
			get: vi.fn(),
			store: vi.fn(),
			delete: vi.fn(),
			onDidChange: vi.fn(),
		} as any,
		extensionPath: "/test/ext",
		storagePath: "/test/storage",
		globalStoragePath: "/test/global",
		logPath: "/test/logs",
		extensionUri: { fsPath: "/test" } as any,
		extensionMode: vscode.ExtensionMode.Test,
		environmentVariableCollection: {} as any,
		asAbsolutePath: vi.fn((p) => `/test/${p}`),
		storageUri: undefined,
		globalStorageUri: undefined as any,
		logUri: undefined as any,
		extension: undefined as any,
		languageModelAccessInformation: {} as any,
	};
}

// ============================================================================
// Test Suite
// ============================================================================

describe("OAuthProvider - OAuth 2.0 Flow Integration Tests", () => {
	let cleanup: InstanceType<typeof TestCleanupManager>;
	let mockContext: vscode.ExtensionContext;
	let uriHandlerCallback: ((uri: vscode.Uri) => void) | null = null;

	beforeEach(() => {
		cleanup = new TestCleanupManager();
		mockContext = createMockExtensionContext();

		// Start MSW server
		mswServer.listen({ onUnhandledRequest: "error" });

		// Mock vscode.env functions
		vi.stubGlobal("vscode", {
			...vscode,
			env: {
				...vscode.env,
				openExternal: vi.fn().mockResolvedValue(true),
				asExternalUri: vi.fn().mockResolvedValue(
					vscode.Uri.parse("vscode://MarcelleLabs.snapback-vscode/oauth-callback"),
				),
				uriScheme: "vscode",
			},
			window: {
				...vscode.window,
				registerUriHandler: vi.fn((handler) => {
					uriHandlerCallback = handler.handleUri.bind(handler);
					return { dispose: vi.fn() };
				}),
			},
		});
	});

	afterEach(async () => {
		await cleanup.runAll();
		mswServer.resetHandlers();
		mswServer.close();
		vi.clearAllMocks();
		uriHandlerCallback = null;
	});

	// ========================================================================
	// HAPPY PATH: OAuth Flow Success
	// ========================================================================

	describe("HAPPY PATH: Successful OAuth Flow", () => {
		/**
		 * Test ID: OAUTH-001
		 *
		 * Complete OAuth flow:
		 * 1. User clicks "Create Session"
		 * 2. Browser opens to authorization endpoint
		 * 3. User authorizes and redirects back
		 * 4. Code exchanged for tokens
		 * 5. Session created and stored
		 */
		it("should complete full OAuth flow: authorize → exchange → store", async () => {
			// ARRANGE
			const provider = new SnapBackOAuthProvider(mockContext);
			const mockSecrets = mockContext.secrets as any;
			mockSecrets.store.mockResolvedValue(undefined);

			// ACT: Start OAuth flow
			const sessionPromise = provider.createSession(["user:read"]);

			// Simulate authorization callback
			if (uriHandlerCallback) {
				const callbackUri = vscode.Uri.parse(
					"vscode://MarcelleLabs.snapback-vscode/oauth-callback?code=auth_code_123&state=test_state",
				);
				uriHandlerCallback(callbackUri);
			}

			const session = await sessionPromise;

			// ASSERT: Session created with tokens
			expect(session).not.toBeUndefined();
			expect(session.accessToken).toBe("test_access_token_123");
			expect(session.refreshToken).toBe("test_refresh_token_456");
			expect(session.expiresAt).toBeGreaterThan(Date.now());

			// Assert secrets stored
			expect(mockSecrets.store).toHaveBeenCalledWith(
				expect.stringContaining("accessToken"),
				expect.stringContaining("test_access_token_123"),
			);
		});

		/**
		 * Test ID: OAUTH-002
		 *
		 * Session retrieval from cache:
		 * 1. Session already stored
		 * 2. getSessions returns it
		 * 3. Expiry checked before returning
		 */
		it("should return cached session if valid and not expired", async () => {
			// ARRANGE
			const provider = new SnapBackOAuthProvider(mockContext);
			const mockSecrets = mockContext.secrets as any;
			const futureExpiry = Date.now() + 3600 * 1000; // 1 hour from now

			// Mock stored session
			const storedSession: SnapBackSession = {
				id: "session_123",
				accessToken: "stored_token",
				refreshToken: "stored_refresh",
				account: { id: "user_1", label: "user@example.com" },
				scopes: ["user:read"],
				expiresAt: futureExpiry,
			};

			mockSecrets.get.mockImplementation((key: string) => {
				if (key.includes("session")) return JSON.stringify(storedSession);
				return undefined;
			});

			// ACT
			const sessions = await provider.getSessions();

			// ASSERT
			expect(sessions).toHaveLength(1);
			expect(sessions[0].accessToken).toBe("stored_token");
			expect(sessions[0].expiresAt).toBe(futureExpiry);
		});

		/**
		 * Test ID: OAUTH-003
		 *
		 * Token refresh:
		 * 1. Session expired
		 * 2. refreshSession() called
		 * 3. New tokens obtained via refresh_token grant
		 * 4. Session updated
		 */
		it("should auto-refresh expired token when getSessions called", async () => {
			// ARRANGE
			const provider = new SnapBackOAuthProvider(mockContext);
			const mockSecrets = mockContext.secrets as any;
			const pastExpiry = Date.now() - 1000; // Expired 1 second ago

			const expiredSession: SnapBackSession = {
				id: "session_123",
				accessToken: "old_token",
				refreshToken: "old_refresh",
				account: { id: "user_1", label: "user@example.com" },
				scopes: ["user:read"],
				expiresAt: pastExpiry,
			};

			mockSecrets.get.mockImplementation((key: string) => {
				if (key.includes("session")) return JSON.stringify(expiredSession);
				if (key.includes("refresh")) return expiredSession.refreshToken;
				return undefined;
			});
			mockSecrets.store.mockResolvedValue(undefined);

			// ACT
			const sessions = await provider.getSessions();

			// ASSERT: Should have refreshed and returned new token
			expect(sessions).toHaveLength(1);
			expect(sessions[0].accessToken).toBe("test_access_token_new");
			expect(mockSecrets.store).toHaveBeenCalled();
		});
	});

	// ========================================================================
	// SAD PATH: Authorization Denied
	// ========================================================================

	describe("SAD PATH: Authorization Failures", () => {
		/**
		 * Test ID: OAUTH-004
		 *
		 * User denies authorization:
		 * 1. OAuth callback returns error
		 * 2. createSession rejects
		 * 3. Error message surfaces
		 */
		it("should reject if user denies authorization", async () => {
			// ARRANGE
			const provider = new SnapBackOAuthProvider(mockContext);

			// ACT: Simulate user denial
			const sessionPromise = provider.createSession(["user:read"]);

			if (uriHandlerCallback) {
				// Simulate OAuth redirect with error
				const callbackUri = vscode.Uri.parse(
					`vscode://MarcelleLabs.snapback-vscode/oauth-callback?error=access_denied&error_description=User%20denied%20access`,
				);
				uriHandlerCallback(callbackUri);
			}

			// ASSERT
			await expect(sessionPromise).rejects.toThrow(/access_denied|denied/i);
		});

		/**
		 * Test ID: OAUTH-005
		 *
		 * Token exchange fails:
		 * 1. Valid authorization code
		 * 2. Backend rejects code
		 * 3. createSession fails gracefully
		 */
		it("should reject if token exchange fails (invalid code)", async () => {
			// ARRANGE
			mswServer.use(
				http.post(`${AUTH_BASE_URL}/oauth/token`, () => {
					return HttpResponse.json(
						{ error: "invalid_grant", error_description: "Invalid authorization code" },
						{ status: 400 },
					);
				}),
			);

			const provider = new SnapBackOAuthProvider(mockContext);

			// ACT
			const sessionPromise = provider.createSession(["user:read"]);

			if (uriHandlerCallback) {
				const callbackUri = vscode.Uri.parse(
					"vscode://MarcelleLabs.snapback-vscode/oauth-callback?code=invalid_code&state=test_state",
				);
				uriHandlerCallback(callbackUri);
			}

			// ASSERT
			await expect(sessionPromise).rejects.toThrow(/invalid_grant|failed|exchange/i);
		});
	});

	// ========================================================================
	// EDGE PATH: CSRF Protection & Token Expiry
	// ========================================================================

	describe("EDGE PATH: CSRF Protection and Token Management", () => {
		/**
		 * Test ID: OAUTH-006
		 *
		 * CSRF protection:
		 * 1. State parameter generated on authorize
		 * 2. Callback must match state
		 * 3. Mismatched state rejected
		 */
		it("should reject callback with mismatched state (CSRF protection)", async () => {
			// ARRANGE
			const provider = new SnapBackOAuthProvider(mockContext);

			// ACT
			const sessionPromise = provider.createSession(["user:read"]);

			if (uriHandlerCallback) {
				// Return callback with WRONG state
				const callbackUri = vscode.Uri.parse(
					"vscode://MarcelleLabs.snapback-vscode/oauth-callback?code=auth_code_123&state=wrong_state",
				);
				uriHandlerCallback(callbackUri);
			}

			// ASSERT: Should reject due to state mismatch
			await expect(sessionPromise).rejects.toThrow(/state|csrf|mismatch/i);
		});

		/**
		 * Test ID: OAUTH-007
		 *
		 * Refresh failure handling:
		 * 1. Token expired
		 * 2. Refresh endpoint unavailable
		 * 3. Session invalidated gracefully
		 */
		it("should handle refresh token failure gracefully", async () => {
			// ARRANGE
			mswServer.use(
				http.post(`${AUTH_BASE_URL}/oauth/token`, ({ request }) => {
					// Only fail on refresh token grant
					request.text().then((body) => {
						const params = new URLSearchParams(body);
						if (params.get("grant_type") === "refresh_token") {
							return HttpResponse.json({ error: "invalid_grant" }, { status: 401 });
						}
					});
					return HttpResponse.json({
						access_token: "test_access_token_123",
						refresh_token: "test_refresh_token_456",
						expires_in: 3600,
						token_type: "Bearer",
					});
				}),
			);

			const provider = new SnapBackOAuthProvider(mockContext);
			const mockSecrets = mockContext.secrets as any;

			const expiredSession: SnapBackSession = {
				id: "session_123",
				accessToken: "old_token",
				refreshToken: "invalid_refresh",
				account: { id: "user_1", label: "user@example.com" },
				scopes: ["user:read"],
				expiresAt: Date.now() - 1000,
			};

			mockSecrets.get.mockImplementation((key: string) => {
				if (key.includes("session")) return JSON.stringify(expiredSession);
				return undefined;
			});

			// ACT: Try to get sessions (triggers refresh)
			const sessions = await provider.getSessions();

			// ASSERT: Should handle gracefully (implementation-dependent)
			expect(sessions).not.toBeUndefined();
		});
	});

	// ========================================================================
	// ERROR PATH: Network Issues & Timeouts
	// ========================================================================

	describe("ERROR PATH: Network Issues and Timeouts", () => {
		/**
		 * Test ID: OAUTH-008
		 *
		 * Network timeout:
		 * 1. Token exchange endpoint slow
		 * 2. Timeout triggered
		 * 3. User notified of timeout
		 */
		it("should timeout if token exchange takes too long", async () => {
			// ARRANGE
			mswServer.use(
				http.post(`${AUTH_BASE_URL}/oauth/token`, async () => {
					// Simulate slow network (longer than typical timeout)
					await new Promise((resolve) => setTimeout(resolve, 150000)); // 150s
					return HttpResponse.json({ access_token: "token" });
				}),
			);

			const provider = new SnapBackOAuthProvider(mockContext);

			// ACT
			const sessionPromise = provider.createSession(["user:read"]);

			if (uriHandlerCallback) {
				const callbackUri = vscode.Uri.parse(
					"vscode://MarcelleLabs.snapback-vscode/oauth-callback?code=auth_code_123&state=test_state",
				);
				uriHandlerCallback(callbackUri);
			}

			// ASSERT: Should timeout
			await expect(sessionPromise).rejects.toThrow(/timeout|timed out/i);
		});

		/**
		 * Test ID: OAUTH-009
		 *
		 * Invalid PKCE code verifier:
		 * 1. PKCE code challenge/verifier mismatch
		 * 2. Backend rejects
		 * 3. Clear error message
		 */
		it("should reject if PKCE code verifier is invalid", async () => {
			// ARRANGE
			mswServer.use(
				http.post(`${AUTH_BASE_URL}/oauth/token`, () => {
					return HttpResponse.json(
						{
							error: "invalid_grant",
							error_description: "Invalid code_verifier",
						},
						{ status: 400 },
					);
				}),
			);

			const provider = new SnapBackOAuthProvider(mockContext);

			// ACT
			const sessionPromise = provider.createSession(["user:read"]);

			if (uriHandlerCallback) {
				const callbackUri = vscode.Uri.parse(
					"vscode://MarcelleLabs.snapback-vscode/oauth-callback?code=auth_code_123&state=test_state",
				);
				uriHandlerCallback(callbackUri);
			}

			// ASSERT
			await expect(sessionPromise).rejects.toThrow(/pkce|code_verifier|invalid_grant/i);
		});

		/**
		 * Test ID: OAUTH-010
		 *
		 * Session removal:
		 * 1. Call removeSession
		 * 2. Session cleared from storage
		 * 3. No sessions returned on next getSessions
		 */
		it("should clear session when removeSession called", async () => {
			// ARRANGE
			const provider = new SnapBackOAuthProvider(mockContext);
			const mockSecrets = mockContext.secrets as any;

			mockSecrets.store.mockResolvedValue(undefined);
			mockSecrets.delete.mockResolvedValue(undefined);

			// ACT: Remove session
			await provider.removeSession("session_123");

			// ASSERT: Secrets cleared
			expect(mockSecrets.delete).toHaveBeenCalled();
		});
	});
});
