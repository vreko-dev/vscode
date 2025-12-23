import * as vscode from "vscode";
import { API_BASE_URL } from "../constants";
import { logger } from "../utils/logger";
import type { PioneerProfile } from "./types";

const SESSION_TOKEN_KEY = "snapback.pioneer.session";

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
	 * Login with GitHub via VS Code authentication
	 * Exchanges GitHub token for SnapBack session token
	 */
	async login(): Promise<vscode.AuthenticationSession | undefined> {
		try {
			const session = await vscode.authentication.getSession("github", ["read:user", "user:email"], {
				createIfNone: true,
			});

			if (!session) {
				logger.warn("GitHub authentication cancelled");
				return undefined;
			}

			logger.info("GitHub authentication successful", {
				account: session.account.label,
			});

			// Exchange GitHub token for SnapBack session token
			await this.exchangeGitHubToken(session.accessToken);

			return session;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("Pioneer login failed", err);
			throw error;
		}
	}

	/**
	 * Exchange GitHub token for SnapBack API session token
	 */
	private async exchangeGitHubToken(githubToken: string): Promise<void> {
		try {
			const response = await fetch(`${this.getApiBaseUrl()}/api/auth/extension/github`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					githubToken,
					client: "vscode",
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Token exchange failed: ${response.status} - ${error}`);
			}

			const data = (await response.json()) as { sessionToken: string };

			if (!data.sessionToken) {
				throw new Error("Token exchange response missing sessionToken");
			}

			// Store session token securely
			await this.storeSessionToken(data.sessionToken);
			logger.info("Session token stored successfully");
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("GitHub token exchange failed", err);
			throw error;
		}
	}

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
	 * Get stored session token
	 */
	async getSessionToken(): Promise<string | null> {
		if (!this.context) {
			logger.warn("Extension context not set for PioneerAuth");
			return null;
		}

		return (await this.context.secrets.get(SESSION_TOKEN_KEY)) ?? null;
	}

	/**
	 * Store session token
	 */
	private async storeSessionToken(token: string): Promise<void> {
		if (!this.context) {
			throw new Error("Extension context not set for PioneerAuth");
		}

		await this.context.secrets.store(SESSION_TOKEN_KEY, token);
	}

	/**
	 * Clear session token
	 */
	private async clearSessionToken(): Promise<void> {
		if (!this.context) {
			return;
		}

		await this.context.secrets.delete(SESSION_TOKEN_KEY);
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
