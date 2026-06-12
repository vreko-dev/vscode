/**
 * AuthState  -  Authentication Status
 *
 * Gutted for the invite-gated alpha. JWT-based methods are removed;
 * all auth is now API-key-only.
 *
 * Remaining responsibilities:
 * - `isAuthenticated()`  -  check if an API key is stored
 * - `signOut()`          -  clear stored API key
 *
 * @see docs/alpha_trials.md §P5
 * @package apps/vscode/src/auth
 */

import type { CredentialsManager } from "./credentials";

export class AuthState {
	constructor(private credentialsManager: CredentialsManager) {
		/* intentionally empty */
	}

	/**
	 * Check if user has a stored API key.
	 */
	async isAuthenticated(): Promise<boolean> {
		const credentials = await this.credentialsManager.getCredentials();
		return credentials !== null;
	}

	/**
	 * Clear stored API key (sign out).
	 */
	async signOut(): Promise<void> {
		await this.credentialsManager.clearCredentials();
	}
}
