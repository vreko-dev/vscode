/**
 * SnapBack Extension Authentication Service
 *
 * High-level authentication interface that manages the full token lifecycle.
 * Abstracts over credential storage, OAuth flow, and token refresh.
 *
 * @package apps/vscode
 * @implements Token Management, OAuth Flow, Token Refresh
 */

import { logger } from "@snapback/infrastructure";
import type {
	CredentialsManager,
	ExtensionCredentials,
} from "./credentials.js";

/**
 * Authentication token with metadata
 */
export interface AuthToken {
	/** JWT access token (15 minute expiry) */
	accessToken: string;
	/** Opaque refresh token (90 day expiry) */
	refreshToken: string;
	/** Unix timestamp when access token expires */
	expiresAt: number;
	/** User information bound to token */
	user: {
		id: string;
		email: string;
		name?: string;
	};
	/** Workspace information (if applicable) */
	workspace?: {
		id: string;
		name: string;
		plan: "free" | "solo" | "team" | "enterprise";
	};
}

/**
 * Authentication service
 *
 * Provides simple token lifecycle management API:
 * - `getToken()` - Get current token (with auto-refresh)
 * - `setToken()` - Store new token pair
 * - `refreshToken()` - Explicitly refresh access token
 * - `clearToken()` - Sign out and clear credentials
 * - `isAuthenticated()` - Check if user is signed in
 */
export class AuthService {
	/** Storage key for credentials */
	// Note: Actual storage key defined in CredentialsManager

	// Token refresh buffer is handled by CredentialsManager.isAccessTokenExpired()

	// OAuth configuration is handled by OAuthProvider

	private readonly credentialsManager: CredentialsManager;
	private readonly apiBaseUrl: string;

	/**
	 * Create authentication service
	 *
	 * @param credentialsManager - Credential storage manager
	 * @param apiBaseUrl - API base URL for token refresh
	 */
	constructor(credentialsManager: CredentialsManager, apiBaseUrl: string) {
		this.credentialsManager = credentialsManager;
		this.apiBaseUrl = apiBaseUrl;
	}

	/**
	 * Get current authentication token
	 *
	 * If token is expired, automatically refreshes it.
	 * Returns null if not authenticated.
	 *
	 * @returns Token if authenticated, null otherwise
	 * @throws Error if token refresh fails
	 */
	async getToken(): Promise<AuthToken | null> {
		const credentials = await this.credentialsManager.getCredentials();

		if (!credentials) {
			return null;
		}

		// Check if token needs refresh (with buffer)
		const isExpired = await this.credentialsManager.isAccessTokenExpired();

		if (isExpired) {
			logger.info("Access token expired, refreshing...");
			await this.refreshToken();
			// Get updated credentials after refresh
			const updatedCredentials = await this.credentialsManager.getCredentials();
			if (!updatedCredentials) {
				throw new Error("Failed to refresh authentication token");
			}
			return this.credentialsToToken(updatedCredentials);
		}

		return this.credentialsToToken(credentials);
	}

	/**
	 * Store new authentication token pair
	 *
	 * Called after successful OAuth exchange or manual token setup.
	 *
	 * @param token - Token to store
	 */
	async setToken(token: AuthToken): Promise<void> {
		const credentials: ExtensionCredentials = {
			accessToken: token.accessToken,
			refreshToken: token.refreshToken,
			expiresAt: token.expiresAt,
			user: token.user,
			workspace: token.workspace,
		};

		await this.credentialsManager.setCredentials(credentials);
		logger.info("Authentication token stored", {
			userId: token.user.id,
			expiresIn: Math.round((token.expiresAt - Date.now()) / 1000),
		});
	}

	/**
	 * Refresh access token using refresh token
	 *
	 * Calls API's refresh endpoint to get new access token.
	 * Updates stored credentials if successful.
	 *
	 * @throws Error if refresh fails (session expired)
	 */
	async refreshToken(): Promise<void> {
		try {
			const credentials = await this.credentialsManager.getCredentials();

			if (!credentials) {
				throw new Error("No credentials to refresh");
			}

			const response = await fetch(
				`${this.apiBaseUrl}/api/auth/extension/refresh`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						refreshToken: credentials.refreshToken,
						client: "vscode",
					}),
				},
			);

			if (!response.ok) {
				// Refresh token invalid/revoked - clear credentials
				await this.credentialsManager.clearCredentials();
				logger.warn("Refresh token invalid, credentials cleared");
				throw new Error("Session expired - please sign in again");
			}

			const data = (await response.json()) as {
				accessToken: string;
				expiresIn: number;
			};

			// Update credentials with new access token
			const updatedCredentials: ExtensionCredentials = {
				...credentials,
				accessToken: data.accessToken,
				expiresAt: Date.now() + data.expiresIn * 1000,
			};

			await this.credentialsManager.setCredentials(updatedCredentials);
			logger.info("Access token refreshed successfully", {
				expiresIn: data.expiresIn,
			});
		} catch (error) {
			logger.error("Token refresh failed", error as Error);
			throw error;
		}
	}

	/**
	 * Clear authentication and sign out
	 *
	 * Removes all stored credentials.
	 * Does NOT revoke the token on server (can be done separately if needed).
	 */
	async clearToken(): Promise<void> {
		await this.credentialsManager.clearCredentials();
		logger.info("Authentication cleared");
	}

	/**
	 * Check if user is authenticated
	 *
	 * @returns true if valid credentials exist, false otherwise
	 */
	async isAuthenticated(): Promise<boolean> {
		const credentials = await this.credentialsManager.getCredentials();
		return credentials !== null;
	}

	/**
	 * Get current authenticated user info
	 *
	 * @returns User info if authenticated, null otherwise
	 */
	async getCurrentUser(): Promise<{
		id: string;
		email: string;
		name?: string;
	} | null> {
		const token = await this.getToken();
		return token?.user ?? null;
	}

	/**
	 * Get current workspace info
	 *
	 * @returns Workspace info if authenticated and available, null otherwise
	 */
	async getCurrentWorkspace(): Promise<{
		id: string;
		name: string;
		plan: "free" | "solo" | "team" | "enterprise";
	} | null> {
		const token = await this.getToken();
		return token?.workspace ?? null;
	}

	/**
	 * Convert credentials to token format
	 *
	 * @internal
	 */
	private credentialsToToken(credentials: ExtensionCredentials): AuthToken {
		return {
			accessToken: credentials.accessToken,
			refreshToken: credentials.refreshToken,
			expiresAt: credentials.expiresAt,
			user: credentials.user,
			workspace: credentials.workspace,
		};
	}
}
