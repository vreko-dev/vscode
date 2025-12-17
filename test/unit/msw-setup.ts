/**
 * Centralized MSW (Mock Service Worker) Setup
 *
 * CRITICAL: This file handles the global MSW server lifecycle.
 * DO NOT call mswServer.listen() or mswServer.close() in individual test files!
 *
 * The "Failed to patch the fetch module: already patched" error occurs when
 * multiple test files try to call server.listen() - this centralizes that call.
 *
 * Usage in test files:
 * ```typescript
 * import { mswServer } from "../msw-setup";
 *
 * beforeEach(() => {
 *   // Add test-specific handlers
 *   mswServer.use(
 *     http.post("/your-endpoint", () => HttpResponse.json({ data: "test" }))
 *   );
 * });
 * // DO NOT call mswServer.listen() or mswServer.close()
 * ```
 */

import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// ============================================================================
// Default OAuth Handlers (commonly used across tests)
// ============================================================================

const AUTH_BASE_URL = "https://auth.snapback.dev";

/**
 * Default OAuth token handler - handles both authorization_code and refresh_token grants
 * Tests can override this using mswServer.use() for error scenarios
 */
const defaultOAuthHandler = http.post(`${AUTH_BASE_URL}/oauth/token`, async ({ request }) => {
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
});

/**
 * Default OAuth revoke handler
 */
const defaultRevokeHandler = http.post(`${AUTH_BASE_URL}/oauth/revoke`, () => {
	return HttpResponse.json({ revoked: true });
});

// ============================================================================
// Centralized MSW Server Instance
// ============================================================================

/**
 * Shared MSW server instance for all tests.
 * Starts with default OAuth handlers that can be overridden per-test.
 */
export const mswServer = setupServer(
	defaultOAuthHandler,
	defaultRevokeHandler,
);

// ============================================================================
// Global Lifecycle Hooks
// ============================================================================

/**
 * Start the server ONCE before all tests in this worker.
 * Using "bypass" for unhandled requests to avoid breaking unrelated tests.
 */
beforeAll(() => {
	mswServer.listen({
		onUnhandledRequest: "bypass",
	});
});

/**
 * Reset handlers after EACH test to restore default handlers.
 * This ensures test isolation without needing to restart the server.
 */
afterEach(() => {
	mswServer.resetHandlers();
});

/**
 * Close the server ONCE after all tests in this worker complete.
 */
afterAll(() => {
	mswServer.close();
});

// ============================================================================
// Utility Exports for Tests
// ============================================================================

export { http, HttpResponse } from "msw";
export { AUTH_BASE_URL };

/**
 * Helper to create standard error responses
 */
export function createOAuthError(error: string, description: string, status = 400) {
	return HttpResponse.json(
		{ error, error_description: description },
		{ status },
	);
}

/**
 * Helper to create standard token responses
 */
export function createTokenResponse(overrides?: Partial<{
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
}>) {
	return HttpResponse.json({
		access_token: "test_access_token_123",
		refresh_token: "test_refresh_token_456",
		expires_in: 3600,
		token_type: "Bearer",
		...overrides,
	});
}
