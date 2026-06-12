/**
 * @fileoverview Credentials Manager  -  API Key Storage
 *
 * Simplified for the invite-gated alpha: stores only the user's API key
 * in VS Code's SecretStorage (OS-level encrypted keychain).
 *
 * Storage Key: "vreko.apiKey" (plain string, not JSON)
 *
 * The previous implementation stored JWT access/refresh tokens, user info,
 * and workspace info. All of that is replaced by a single API key that is:
 * - Generated once on account creation
 * - Stored in ~/.vreko/credentials.json (CLI) and SecretStorage (extension)
 * - Used as `x-api-key` header on all API requests
 *
 * @see docs/alpha_trials.md §P5
 * @package apps/vscode
 */

import type * as vscode from "vscode";

const STORAGE_KEY = "vreko.apiKey";

/**
 * Minimal credentials interface  -  just the API key.
 */
export interface ExtensionCredentials {
	apiKey: string;
}

/**
 * Credentials manager interface
 */
export interface CredentialsManager {
	/** Get the stored API key, or null if not set. */
	getCredentials(): Promise<ExtensionCredentials | null>;

	/** Store an API key. */
	setCredentials(credentials: ExtensionCredentials): Promise<void>;

	/** Remove stored API key (sign out). */
	clearCredentials(): Promise<void>;
}

/**
 * Create credentials manager instance.
 *
 * @param secrets - VS Code SecretStorage
 * @returns CredentialsManager backed by OS-level encrypted storage
 */
export function createCredentialsManager(
	secrets: vscode.SecretStorage,
	// Keep unused params for call-site backward compat during transition
	_vscodeApi?: unknown,
	_telemetry?: unknown,
): CredentialsManager {
	return {
		async getCredentials(): Promise<ExtensionCredentials | null> {
			const apiKey = await secrets.get(STORAGE_KEY);
			if (!apiKey || apiKey.trim().length === 0) {
				return null;
			}
			return { apiKey: apiKey.trim() };
		},

		async setCredentials(credentials: ExtensionCredentials): Promise<void> {
			await secrets.store(STORAGE_KEY, credentials.apiKey);
		},

		async clearCredentials(): Promise<void> {
			await secrets.delete(STORAGE_KEY);
		},
	};
}
