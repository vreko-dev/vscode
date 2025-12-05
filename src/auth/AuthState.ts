/**
 * AuthState - Authentication Status Manager
 *
 * Single responsibility: Check if user is authenticated and retrieve credentials.
 * Does NOT handle credential generation (that's AuthService).
 * Does NOT handle anonymous ID (that's AnonymousIdManager).
 *
 * Reference: feedback.md §3.1 Issue 1 - Split AnonymousMode God Object
 * TDD Status: GREEN (implementation)
 *
 * @package apps/vscode/src/auth
 */

import type { CredentialsManager } from "./credentials.js";

/**
 * Simple credentials view
 * (Full ExtensionCredentials is in credentials.ts)
 */
export interface UserCredentials {
	id: string;
	email: string;
	name?: string;
}

/**
 * AuthState - Checks authentication status without side effects
 *
 * Responsibilities:
 * - Query: isAuthenticated()
 * - Query: getCredentials()
 * - Mutation: signOut() (clear credentials)
 *
 * NOT responsible for:
 * - Token generation (AuthService)
 * - Token refresh (AuthService)
 * - Anonymous ID (AnonymousIdManager)
 * - Feature gating (FeatureGate)
 * - Nudges (NudgeManager)
 */
export class AuthState {
	constructor(private credentialsManager: CredentialsManager) {}

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
	 * Get current user credentials
	 *
	 * @returns User credentials if authenticated, null otherwise
	 */
	async getCredentials(): Promise<UserCredentials | null> {
		const credentials = await this.credentialsManager.getCredentials();
		if (!credentials) {
			return null;
		}

		return {
			id: credentials.user.id,
			email: credentials.user.email,
			name: credentials.user.name,
		};
	}

	/**
	 * Sign out and clear credentials
	 *
	 * This delegates to the credentials manager to actually clear storage.
	 */
	async signOut(): Promise<void> {
		await this.credentialsManager.clearCredentials();
	}
}
