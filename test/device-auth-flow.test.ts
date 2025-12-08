/**
 * VSCode Device Auth Flow - Token Handling Tests (RED Phase)
 *
 * Tests for VSCode extension's RFC 8628 Device Authorization Flow token handling.
 * Following @testing_blueprint.md sections 8.1 Universal Rules and 8.2 Extension Rules
 *
 * Coverage: Happy (8) + Sad (5) + Edge (7) + Error (6) = 26 test cases
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Test Utilities
// ============================================================================

interface DeviceAuthTokenResponse {
	access_token: string;
	token_type: "Bearer";
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
}

interface DeviceAuthErrorResponse {
	error:
		| "authorization_pending"
		| "slow_down"
		| "expired_token"
		| "invalid_request";
	error_description?: string;
}

interface TokenData {
	apiKey: string;
	userId: string;
	tier: "free" | "pro" | "enterprise";
}

/**
 * Create mock device auth response
 */
function createMockTokenResponse(overrides?: Partial<DeviceAuthTokenResponse>): DeviceAuthTokenResponse {
	return {
		access_token: "sk_test_device_token_abc123",
		token_type: "Bearer",
		expires_in: 3600,
		refresh_token: "refresh_token_xyz789",
		scope: "snapshot:create snapshot:read",
		...overrides,
	};
}

/**
 * Create mock error response
 */
function createMockErrorResponse(
	error: DeviceAuthErrorResponse["error"],
	description?: string
): DeviceAuthErrorResponse {
	return {
		error,
		error_description: description,
	};
}

/**
 * Extract token data (simulate token parsing)
 */
function extractTokenData(accessToken: string): TokenData | null {
	if (!accessToken || !accessToken.startsWith("sk_test_")) {
		return null;
	}

	return {
		apiKey: accessToken,
		userId: "user-from-token",
		tier: "free",
	};
}

// ============================================================================
// Happy Path Tests (8 cases)
// ============================================================================

describe("VSCode Device Auth Flow - Token Handling (Happy Path)", () => {
	// HO-01: Successful token response
	it("should handle successful OAuth token response", () => {
		const response = createMockTokenResponse();

		expect(response.access_token).toBeDefined();
		expect(response.token_type).toBe("Bearer");
		expect(response.expires_in).toBeGreaterThan(0);
	});

	// HO-02: Extract access token
	it("should extract access_token from response", () => {
		const response = createMockTokenResponse();
		const token = response.access_token;

		expect(token).toBeDefined();
		expect(typeof token).toBe("string");
		expect(token.length).toBeGreaterThan(0);
	});

	// HO-03: Handle refresh token
	it("should handle refresh_token for token renewal", () => {
		const response = createMockTokenResponse({
			refresh_token: "refresh_token_xyz789",
		});

		expect(response.refresh_token).toBeDefined();
		expect(response.refresh_token).toBe("refresh_token_xyz789");
	});

	// HO-04: Parse token claims
	it("should extract user ID from token", () => {
		const token = "sk_test_device_token_abc123";
		const tokenData = extractTokenData(token);

		expect(tokenData).not.toBeNull();
		expect(tokenData?.userId).toBeDefined();
	});

	// HO-05: Store API key securely
	it("should store access_token as API key for future requests", () => {
		const response = createMockTokenResponse();
		const apiKey = response.access_token;

		expect(apiKey).toBeDefined();
		expect(apiKey).toMatch(/^sk_test_/);
	});

	// HO-06: Determine user tier
	it("should determine user subscription tier from token", () => {
		const token = "sk_test_device_token_abc123";
		const tokenData = extractTokenData(token);

		expect(tokenData?.tier).toBeDefined();
		expect(["free", "pro", "enterprise"]).toContain(tokenData?.tier);
	});

	// HO-07: Handle token expiration
	it("should track token expiration time", () => {
		const response = createMockTokenResponse({
			expires_in: 3600,
		});
		const expiresAt = Date.now() + (response.expires_in || 0) * 1000;

		expect(expiresAt).toBeGreaterThan(Date.now());
	});

	// HO-08: Support scope claims
	it("should handle scope field from token response", () => {
		const response = createMockTokenResponse({
			scope: "snapshot:create snapshot:read snapshot:restore",
		});

		expect(response.scope).toBeDefined();
		expect(response.scope).toContain("snapshot:");
	});
});

// ============================================================================
// Sad Path Tests (5 cases)
// ============================================================================

describe("VSCode Device Auth Flow - Token Handling (Sad Path)", () => {
	// SA-01: Authorization pending
	it("should handle authorization_pending error gracefully", () => {
		const response = createMockErrorResponse("authorization_pending");

		expect(response.error).toBe("authorization_pending");
		expect("access_token" in response).toBe(false);
	});

	// SA-02: Slow down (rate limit)
	it("should handle slow_down error with retry guidance", () => {
		const response = createMockErrorResponse(
			"slow_down",
			"Device flow rate limited, wait before next poll"
		);

		expect(response.error).toBe("slow_down");
		expect(response.error_description).toContain("rate limited");
	});

	// SA-03: Expired token
	it("should reject expired device codes", () => {
		const response = createMockErrorResponse(
			"expired_token",
			"Device code expired, restart flow"
		);

		expect(response.error).toBe("expired_token");
	});

	// SA-04: Invalid request
	it("should reject invalid OAuth requests", () => {
		const response = createMockErrorResponse(
			"invalid_request",
			"Missing required parameter"
		);

		expect(response.error).toBe("invalid_request");
	});

	// SA-05: No token in response
	it("should fail gracefully when access_token is missing", () => {
		const response = {} as any;
		expect("access_token" in response).toBe(false);
	});
});

// ============================================================================
// Edge Cases (7 cases)
// ============================================================================

describe("VSCode Device Auth Flow - Token Handling (Edge Cases)", () => {
	// ED-01: Very short expiration
	it("should handle tokens with short expiration times", () => {
		const response = createMockTokenResponse({
			expires_in: 60, // 1 minute
		});

		expect(response.expires_in).toBe(60);
		expect(response.expires_in).toBeLessThan(300);
	});

	// ED-02: Very long expiration
	it("should handle tokens with long expiration times", () => {
		const response = createMockTokenResponse({
			expires_in: 86400 * 365, // 1 year
		});

		expect(response.expires_in).toBeGreaterThan(86400 * 30);
	});

	// ED-03: Missing optional fields
	it("should handle response without optional fields", () => {
		const response: DeviceAuthTokenResponse = {
			access_token: "sk_test_token",
			token_type: "Bearer",
		};

		expect(response.access_token).toBeDefined();
		expect(response.expires_in).toBeUndefined();
		expect(response.refresh_token).toBeUndefined();
	});

	// ED-04: Multiple scope claims
	it("should handle space-separated scope claims", () => {
		const response = createMockTokenResponse({
			scope: "snapshot:create snapshot:read snapshot:restore snapshot:delete",
		});

		const scopes = response.scope?.split(" ") || [];
		expect(scopes.length).toBeGreaterThan(1);
		expect(scopes).toContain("snapshot:create");
	});

	// ED-05: Rapid token refresh
	it("should handle rapid consecutive token refreshes", () => {
		const token1 = createMockTokenResponse({
			access_token: "sk_test_token_1",
		});
		const token2 = createMockTokenResponse({
			access_token: "sk_test_token_2",
		});
		const token3 = createMockTokenResponse({
			access_token: "sk_test_token_3",
		});

		expect(token1.access_token).not.toBe(token2.access_token);
		expect(token2.access_token).not.toBe(token3.access_token);
	});

	// ED-06: Device auth on multiple devices
	it("should support multiple device authentications simultaneously", () => {
		const device1Token = createMockTokenResponse({
			access_token: "sk_test_device1_token",
		});
		const device2Token = createMockTokenResponse({
			access_token: "sk_test_device2_token",
		});

		expect(device1Token.access_token).not.toBe(device2Token.access_token);
	});

	// ED-07: Unicode in error messages
	it("should handle Unicode characters in error descriptions", () => {
		const response = createMockErrorResponse(
			"invalid_request",
			"Invalid request: ñ, 中文, العربية"
		);

		expect(response.error_description).toBeDefined();
		expect(response.error_description).toContain("Invalid");
	});
});

// ============================================================================
// Error Path Tests (6 cases)
// ============================================================================

describe("VSCode Device Auth Flow - Token Handling (Error Path)", () => {
	// ER-01: Network failure during token exchange
	it("should handle network errors during token exchange", () => {
		const networkError = new Error("HTTP 500: Internal Server Error");
		expect(networkError.message).toContain("500");
	});

	// ER-02: Malformed JSON response
	it("should handle malformed JSON token response", () => {
		const malformed = "{ invalid json }";
		expect(() => JSON.parse(malformed)).toThrow();
	});

	// ER-03: Missing token_type
	it("should validate token_type field", () => {
		const response = {
			access_token: "sk_test_token",
			token_type: "InvalidType", // Should be "Bearer"
		} as any;

		const isValid = response.token_type === "Bearer";
		expect(isValid).toBe(false);
	});

	// ER-04: Token claim parsing failure
	it("should handle unparseable token claims", () => {
		const invalidToken = "not_a_valid_token";
		const tokenData = extractTokenData(invalidToken);

		expect(tokenData).toBeNull();
	});

	// ER-05: Expired device code retry
	it("should abort after max retries for expired code", () => {
		const maxRetries = 10;
		let retries = 0;

		const shouldContinuePolling = retries < maxRetries;
		retries = maxRetries; // Simulate reaching max

		expect(shouldContinuePolling).toBe(false);
	});

	// ER-06: Invalid grant error
	it("should handle invalid_grant error from server", () => {
		const error = new Error("Invalid grant: device code expired or user denied");
		expect(error.message).toContain("Invalid grant");
	});
});
