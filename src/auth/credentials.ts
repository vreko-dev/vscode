/**
 * @fileoverview Credentials Manager - Extension Authentication
 *
 * Manages extension credentials in VS Code's SecretStorage.
 * Credentials include JWT access token, refresh token, user info, and workspace info.
 *
 * Storage Key: "snapback.extensionCredentials"
 *
 * Security:
 * - Uses OS-level encrypted storage (Keychain on macOS, Credential Manager on Windows)
 * - Tokens never logged or exposed
 * - Proactive token refresh (60 second buffer)
 *
 * @package apps/vscode
 */

import type * as vscode from "vscode";
import { logger } from "../utils/logger.js";

/**
 * Extension credentials structure
 *
 * Stored in SecretStorage as JSON.
 */
export interface ExtensionCredentials {
	user: {
		id: string;
		email: string;
		name?: string;
	};
	workspace?: {
		id: string;
		name: string;
		plan: "free" | "solo" | "team" | "enterprise";
	};
	accessToken: string; // JWT access token (15 min expiry)
	refreshToken: string; // Opaque refresh token (90 day expiry)
	expiresAt: number; // Unix timestamp (Date.now() + 900000)
}

/**
 * Credentials manager interface
 */
export interface CredentialsManager {
	/**
	 * Get current credentials
	 * @returns ExtensionCredentials if authenticated, null otherwise
	 */
	getCredentials(): Promise<ExtensionCredentials | null>;

	/**
	 * Set credentials (after token exchange or refresh)
	 * @param credentials - New credentials to store
	 */
	setCredentials(credentials: ExtensionCredentials): Promise<void>;

	/**
	 * Clear stored credentials (on sign out)
	 */
	clearCredentials(): Promise<void>;

	/**
	 * Check if access token is expired or will expire soon
	 * Uses 60 second buffer for proactive refresh
	 * @returns true if token needs refresh
	 */
	isAccessTokenExpired(): Promise<boolean>;
}

/**
 * Create credentials manager instance
 *
 * Implements secure credential storage using VS Code's SecretStorage.
 *
 * @param secrets - VS Code secret storage
 * @returns CredentialsManager instance
 *
 * @example
 * ```ts
 * const credentialsManager = createCredentialsManager(context.secrets);
 * const creds = await credentialsManager.getCredentials();
 * if (creds) {
 *   console.log("Authenticated as:", creds.user.email);
 * }
 * ```
 */
export function createCredentialsManager(
	secrets: vscode.SecretStorage,
): CredentialsManager {
	const STORAGE_KEY = "snapback.extensionCredentials";

	return {
		async getCredentials(): Promise<ExtensionCredentials | null> {
			const stored = await secrets.get(STORAGE_KEY);
			if (!stored) {
				return null;
			}

			try {
				return JSON.parse(stored) as ExtensionCredentials;
			} catch (error) {
				logger.error("Failed to parse stored credentials", error as Error);
				return null;
			}
		},

		async setCredentials(credentials: ExtensionCredentials): Promise<void> {
			await secrets.store(STORAGE_KEY, JSON.stringify(credentials));
		},

		async clearCredentials(): Promise<void> {
			await secrets.delete(STORAGE_KEY);
		},

		async isAccessTokenExpired(): Promise<boolean> {
			const creds = await this.getCredentials();
			if (!creds) {
				return true;
			}

			// Check if token expires in next 60 seconds (proactive refresh)
			return creds.expiresAt <= Date.now() + 60000;
		},
	};
}
