import * as vscode from "vscode";
import { API_BASE_URL } from "../constants";
import { logger } from "../utils/logger";
import type { PioneerProfile } from "./types";

/**
 * Pioneer authentication service for VS Code extension.
 *
 * Handles:
 * - GitHub OAuth login via VS Code authentication API
 * - Token exchange with SnapBack API for session token
 * - Profile fetching from real API
 * - Session token storage in VS Code secrets
 */
export class PioneerAuth implements vscode.Disposable {
	private context?: vscode.ExtensionContext;
	private cachedProfile: PioneerProfile | null = null;
	private profileFetchedAt = 0;
	private readonly CACHE_TTL_MS = 60000; // 1 minute

	/**
	 * Set the extension context for secrets storage
	 */
	setContext(context: vscode.ExtensionContext): void {
		this.context = context;
	}

	/**
	 * Login is now delegated to DeviceAuthFlow
	 * This method is deprecated and should not be called directly
	 * @deprecated Use DeviceAuthFlow from @vscode/auth/DeviceAuthFlow instead
	 */
	async login(): Promise<vscode.AuthenticationSession | undefined> {
		throw new Error(
			"PioneerAuth.login() is deprecated. Use DeviceAuthFlow for authentication. " +
				"Pioneer features will automatically use the stored API key from DeviceAuthFlow.",
		);
	}

	/**
	 * Removed: exchangeGitHubToken
	 * This method called a non-existent endpoint /api/auth/extension/github
	 * Pioneer now uses the API key stored by DeviceAuthFlow in 'snapback.apiKey'
	 */

	/**
	 * Get pioneer profile from API
	 * Uses caching to avoid excessive API calls
	 */
	async getProfile(): Promise<PioneerProfile | null> {
		// Return cached profile if still fresh
		if (this.cachedProfile && Date.now() - this.profileFetchedAt < this.CACHE_TTL_MS) {
			return this.cachedProfile;
		}

		const sessionToken = await this.getSessionToken();

		if (!sessionToken) {
			// No session token - user needs to authenticate via login command
			// Don't return fake profile data as it misleads users about their actual tier/points
			return null;
		}

		try {
			const response = await fetch(`${this.getApiBaseUrl()}/api/pioneer/me`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
					"Content-Type": "application/json",
				},
			});

			if (response.status === 401) {
				// Session token expired - clear and return null
				logger.warn("Session token expired, clearing");
				await this.clearSessionToken();
				return null;
			}

			if (!response.ok) {
				logger.error(`Failed to fetch profile: ${response.status}`);
				// Return cached profile if available on error
				return this.cachedProfile;
			}

			const data = (await response.json()) as { success: boolean; profile: PioneerProfile };

			if (!data.success || !data.profile) {
				logger.warn("Profile response invalid", { data });
				return this.cachedProfile;
			}

			// Update cache
			this.cachedProfile = data.profile;
			this.profileFetchedAt = Date.now();

			logger.info("Pioneer profile fetched", {
				tier: data.profile.tier,
				totalPoints: data.profile.totalPoints,
			});

			return data.profile;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("Error fetching profile", err);
			// Return cached profile on network error
			return this.cachedProfile;
		}
	}

	/**
	 * Logout - clear session token and cached profile
	 */
	async logout(): Promise<void> {
		await this.clearSessionToken();
		this.cachedProfile = null;
		this.profileFetchedAt = 0;
		logger.info("Pioneer session cleared");
	}

	/**
	 * Get stored session token (now reads from DeviceAuthFlow's storage)
	 * Migration: Previously stored in 'pioneer.sessionToken', now in 'snapback.apiKey'
	 */
	async getSessionToken(): Promise<string | null> {
		if (!this.context) {
			logger.warn("Extension context not set for PioneerAuth");
			return null;
		}

		// Read from DeviceAuthFlow's shared storage
		return (await this.context.secrets.get("snapback.apiKey")) ?? null;
	}

	/**
	 * Removed: storeSessionToken
	 * Tokens are now stored by DeviceAuthFlow in 'snapback.apiKey'
	 * Pioneer features read from that shared storage
	 */

	/**
	 * Clear session token (now clears DeviceAuthFlow's shared token)
	 */
	private async clearSessionToken(): Promise<void> {
		if (!this.context) {
			return;
		}

		// Clear shared API key storage
		await this.context.secrets.delete("snapback.apiKey");
	}

	/**
	 * Invalidate cached profile (force re-fetch on next call)
	 */
	invalidateCache(): void {
		this.profileFetchedAt = 0;
	}

	/**
	 * Get API base URL from configuration
	 */
	private getApiBaseUrl(): string {
		const config = vscode.workspace.getConfiguration("snapback");
		return config.get<string>("apiBaseUrl") || API_BASE_URL;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.cachedProfile = null;
		this.context = undefined;
	}
}
