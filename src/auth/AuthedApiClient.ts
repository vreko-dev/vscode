/**
 * Authenticated API Client
 *
 * Provides automatic token refresh and retry logic for API calls.
 * Uses single-flight pattern to prevent concurrent refresh requests.
 *
 * Error Contract:
 * - Throws exact string "Session expired - please reconnect your account" on refresh failure
 * - Tree provider special-cases this string to show reconnect prompt
 *
 * @package apps/vscode
 */

import type { CredentialsManager, ExtensionCredentials } from "./credentials";

/**
 * Authenticated API Client
 *
 * Automatically handles:
 * - Bearer token injection
 * - Token expiration detection (proactive 60s buffer)
 * - Automatic token refresh
 * - Retry on 401 errors
 * - Concurrent refresh deduplication (single-flight pattern)
 */
export class AuthedApiClient {
	private readonly credentialsManager: CredentialsManager;
	private readonly apiBaseUrl: string;
	private refreshPromise: Promise<void> | null = null; // Single-flight pattern

	constructor(credentialsManager: CredentialsManager, apiBaseUrl: string) {
		this.credentialsManager = credentialsManager;
		this.apiBaseUrl = apiBaseUrl;
	}

	/**
	 * Make authenticated API call
	 *
	 * Automatically adds Bearer token and handles token refresh.
	 *
	 * @param path - API path (e.g., "/api/v1/workspace/snapshots")
	 * @param init - Fetch init options
	 * @returns Parsed JSON response
	 * @throws Error if request fails or authentication is required
	 *
	 * @example
	 * ```ts
	 * const client = new AuthedApiClient(credentialsManager, apiBaseUrl);
	 * const snapshots = await client.fetch("/api/v1/workspace/snapshots");
	 * ```
	 */
	async fetch<T>(path: string, init?: RequestInit): Promise<T> {
		// Ensure access token is valid
		await this.ensureValidAccessToken();

		// Get credentials
		const creds = await this.credentialsManager.getCredentials();
		if (!creds) {
			throw new Error("Not authenticated");
		}

		// Make request with Bearer token
		const response = await fetch(`${this.apiBaseUrl}${path}`, {
			...init,
			headers: {
				...init?.headers,
				Authorization: `Bearer ${creds.accessToken}`,
				"Content-Type": "application/json",
			},
		});

		// Handle 401 (token expired mid-request despite check)
		if (response.status === 401) {
			// Refresh and retry once
			await this.refreshAccessToken();

			const creds2 = await this.credentialsManager.getCredentials();
			if (!creds2) {
				throw new Error("Refresh failed");
			}

			// Retry with new token
			const retryResponse = await fetch(`${this.apiBaseUrl}${path}`, {
				...init,
				headers: {
					...init?.headers,
					Authorization: `Bearer ${creds2.accessToken}`,
					"Content-Type": "application/json",
				},
			});

			if (!retryResponse.ok) {
				throw new Error(`API error: ${retryResponse.status}`);
			}

			return retryResponse.json() as Promise<T>;
		}

		if (!response.ok) {
			throw new Error(`API error: ${response.status}`);
		}

		return response.json() as Promise<T>;
	}

	/**
	 * Ensure access token is valid
	 *
	 * Checks if token will expire in next 60 seconds and refreshes if needed.
	 */
	private async ensureValidAccessToken(): Promise<void> {
		const isExpired = await this.credentialsManager.isAccessTokenExpired();

		if (isExpired) {
			await this.refreshAccessToken();
		}
	}

	/**
	 * Refresh access token
	 *
	 * Uses single-flight pattern to prevent concurrent refresh requests.
	 */
	private async refreshAccessToken(): Promise<void> {
		// Prevent concurrent refresh requests
		if (this.refreshPromise) {
			return this.refreshPromise;
		}

		this.refreshPromise = this.doRefreshAccessToken();

		try {
			await this.refreshPromise;
		} finally {
			this.refreshPromise = null;
		}
	}

	/**
	 * Perform actual token refresh
	 *
	 * Calls POST /api/auth/extension/refresh endpoint.
	 * On failure, clears credentials and throws exact error message for tree provider.
	 */
	private async doRefreshAccessToken(): Promise<void> {
		const creds = await this.credentialsManager.getCredentials();
		if (!creds) {
			throw new Error("No credentials to refresh");
		}

		const response = await fetch(
			`${this.apiBaseUrl}/api/auth/extension/refresh`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					refreshToken: creds.refreshToken,
					client: "vscode",
				}),
			},
		);

		if (!response.ok) {
			// Refresh token invalid/revoked - clear credentials
			await this.credentialsManager.clearCredentials();

			// CRITICAL: Must throw exact string for tree provider to detect
			throw new Error("Session expired - please reconnect your account");
		}

		const data = (await response.json()) as {
			accessToken: string;
			expiresIn: number;
		};

		// Update credentials with new access token
		const updatedCreds: ExtensionCredentials = {
			...creds,
			accessToken: data.accessToken,
			expiresAt: Date.now() + data.expiresIn * 1000,
		};

		await this.credentialsManager.setCredentials(updatedCreds);
	}
}
