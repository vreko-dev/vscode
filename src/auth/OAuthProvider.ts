/**
 * SnapBack OAuth Authentication Provider
 *
 * Implements VSCode's AuthenticationProvider interface for OAuth 2.0 authentication
 * with the SnapBack backend API.
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";
import { DeviceAuthFlow } from "./DeviceAuthFlow";
import { RemoteEnvironmentDetector } from "./RemoteEnvironmentDetector";
import { getOrCreateWorkspaceId } from "./workspace-id";

export interface SnapBackSession extends vscode.AuthenticationSession {
	/** OAuth access token */
	accessToken: string;
	/** OAuth refresh token (optional) */
	refreshToken?: string;
	/** Token expiration time (Unix timestamp in ms) */
	expiresAt?: number;
}

/**
 * OAuth 2.0 Authentication Provider for SnapBack
 *
 * Flow:
 * 1. User clicks "Sign in to SnapBack"
 * 2. VSCode opens browser to https://auth.snapback.dev/oauth/authorize
 * 3. User authorizes
 * 4. Redirect to vscode://redirect with authorization code
 * 5. Exchange code for access/refresh tokens
 * 6. Store tokens securely in VSCode secret storage
 */
export class SnapBackOAuthProvider implements vscode.AuthenticationProvider {
	private static readonly AUTH_PROVIDER_ID = "snapback";
	private static readonly AUTH_PROVIDER_LABEL = "SnapBack";
	private static readonly AUTH_BASE_URL = "https://auth.snapback.dev";

	private _onDidChangeSessions =
		new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	public readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private _pendingStates: Map<string, string> = new Map(); // state -> nonce mapping
	private _currentSession: SnapBackSession | undefined;

	constructor(private readonly context: vscode.ExtensionContext) {
		// Try to restore session on initialization
		this.restoreSession();
	}

	/**
	 * Get all sessions
	 */
	async getSessions(
		_scopes?: readonly string[],
		_options?: vscode.AuthenticationProviderSessionOptions,
	): Promise<vscode.AuthenticationSession[]> {
		if (this._currentSession) {
			// Check if session is expired
			if (this._currentSession.expiresAt && Date.now() >= this._currentSession.expiresAt) {
				logger.info("Session expired, attempting refresh");
				await this.refreshSession();
			}
			return [this._currentSession];
		}
		return [];
	}

	/**
	 * Create a new authentication session
	 *
	 * Automatically detects remote environments (SSH, Container) and falls back
	 * to RFC 8628 Device Authorization Flow when direct OAuth won't work.
	 */
	async createSession(scopes: readonly string[]): Promise<SnapBackSession> {
		logger.info("Creating new OAuth session", { scopes });

		try {
			// Validate workspace exists before OAuth
			if (!vscode.workspace.workspaceFolders?.length) {
				const result = await vscode.window.showWarningMessage(
					"SnapBack requires an open workspace folder to protect your code.",
					"Open Folder",
					"Cancel",
				);

				if (result === "Open Folder") {
					await vscode.commands.executeCommand("vscode.openFolder");
				}

				throw new Error("Workspace required before authentication");
			}

			// Check for remote environment - use device flow if OAuth won't work
			const remoteDetector = new RemoteEnvironmentDetector();
			const remoteEnv = remoteDetector.detect();

			if (remoteEnv.isRemote && !remoteDetector.canUseOAuth()) {
				logger.info("Remote environment detected, using device flow", {
					remoteType: remoteEnv.remoteType,
				});
				return this.createSessionViaDeviceFlow(scopes);
			}

			// Track auth started
			// Note: Full telemetry tracking happens in auth_completed event after token exchange
			logger.info("OAuth authentication flow initiated");

			// Generate PKCE challenge
			const { codeVerifier, codeChallenge } = await this.generatePKCE();

			// Generate random state for CSRF protection
			const state = this.generateRandomString(32);
			this._pendingStates.set(state, codeVerifier);

			// Build authorization URL
			const authUrl = this.buildAuthUrl(state, codeChallenge, scopes);

			logger.info("Opening authorization URL", { authUrl });

			// Open external browser for OAuth flow
			const callbackUri = await vscode.env.asExternalUri(
				vscode.Uri.parse(`${vscode.env.uriScheme}://MarcelleLabs.snapback-vscode/oauth-callback`),
			);

			// Open browser to authorization endpoint
			await vscode.env.openExternal(vscode.Uri.parse(authUrl));

			// Wait for redirect callback with timeout
			const authResult = await this.waitForAuthCallback(state);

			// Exchange authorization code for access token
			const tokenResponse = await this.exchangeCodeForToken(
				authResult.code,
				codeVerifier,
				callbackUri.toString(),
			);

			// Create session from token response
			const session: SnapBackSession = {
				id: this.generateRandomString(16),
				accessToken: tokenResponse.access_token,
				refreshToken: tokenResponse.refresh_token,
				expiresAt: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined,
				account: {
					id: tokenResponse.user_id || "unknown",
					label: tokenResponse.user_email || "SnapBack User",
				},
				scopes: scopes as string[],
			};

			// Store session
			await this.storeSession(session);
			this._currentSession = session;

			// Link workspace to user for MCP tier resolution
			await this.linkWorkspaceToUser(session, tokenResponse.user_id);

			// Notify listeners
			this._onDidChangeSessions.fire({
				added: [session],
				removed: [],
				changed: [],
			});

			logger.info("OAuth session created successfully");
			return session;
		} catch (error) {
			logger.error("Failed to create OAuth session", error as Error);
			throw new Error(`Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	/**
	 * Create session via RFC 8628 Device Authorization Flow
	 *
	 * Used for remote environments (SSH, Container) where browser redirect doesn't work.
	 * User visits snapback.dev/link and enters the displayed code.
	 */
	private async createSessionViaDeviceFlow(scopes: readonly string[]): Promise<SnapBackSession> {
		logger.info("Starting device authorization flow", { scopes });

		const deviceFlow = new DeviceAuthFlow(this.context, process.env.SNAPBACK_API_URL || "https://snapback.dev/api");

		try {
			const result = await deviceFlow.authenticate();

			// Convert device flow result to SnapBackSession
			const session: SnapBackSession = {
				id: this.generateRandomString(16),
				accessToken: result.api_key,
				refreshToken: result.refresh_token,
				expiresAt: result.expires_in ? Date.now() + result.expires_in * 1000 : undefined,
				account: {
					id: result.user_id,
					label: result.tier ? `SnapBack ${result.tier}` : "SnapBack User",
				},
				scopes: scopes as string[],
			};

			// Store session
			await this.storeSession(session);
			this._currentSession = session;

			// Link workspace to user for MCP tier resolution
			await this.linkWorkspaceToUser(session, result.user_id);

			// Notify listeners
			this._onDidChangeSessions.fire({
				added: [session],
				removed: [],
				changed: [],
			});

			logger.info("Device flow session created successfully");
			return session;
		} catch (error) {
			logger.error("Device flow authentication failed", error as Error);
			throw new Error(
				`Device authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Remove an authentication session
	 */
	async removeSession(sessionId: string): Promise<void> {
		logger.info("Removing OAuth session", { sessionId });

		if (this._currentSession?.id === sessionId) {
			// Revoke token on backend
			try {
				await this.revokeToken(this._currentSession.accessToken);
			} catch (error) {
				logger.error("Failed to revoke token", error as Error);
			}

			// Clear session storage
			await this.context.secrets.delete("snapback.oauth.session");
			const previousSession = this._currentSession;
			this._currentSession = undefined;

			// Notify listeners
			this._onDidChangeSessions.fire({
				added: [],
				removed: [previousSession],
				changed: [],
			});

			logger.info("OAuth session removed");
		}
	}

	/**
	 * Refresh an expired session
	 */
	private async refreshSession(): Promise<void> {
		if (!this._currentSession?.refreshToken) {
			logger.warn("Cannot refresh session: no refresh token");
			return;
		}

		try {
			logger.info("Refreshing OAuth session");

			const response = await fetch(`${SnapBackOAuthProvider.AUTH_BASE_URL}/oauth/token`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					grant_type: "refresh_token",
					refresh_token: this._currentSession.refreshToken,
					client_id: "vscode-extension",
				}),
			});

			if (!response.ok) {
				throw new Error(`Token refresh failed: ${response.statusText}`);
			}

			const tokenResponse = (await response.json()) as {
				access_token: string;
				refresh_token?: string;
				expires_in?: number;
			};

			// Update session
			const updatedSession: SnapBackSession = {
				...this._currentSession,
				accessToken: tokenResponse.access_token,
				refreshToken: tokenResponse.refresh_token || this._currentSession.refreshToken,
				expiresAt: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined,
			};

			await this.storeSession(updatedSession);
			this._currentSession = updatedSession;

			logger.info("OAuth session refreshed successfully");
		} catch (error) {
			logger.error("Failed to refresh OAuth session", error as Error);
			// Clear invalid session
			if (this._currentSession) {
				await this.removeSession(this._currentSession.id);
			}
		}
	}

	/**
	 * Restore session from secure storage
	 */
	private async restoreSession(): Promise<void> {
		try {
			const sessionJson = await this.context.secrets.get("snapback.oauth.session");
			if (sessionJson) {
				const session = JSON.parse(sessionJson) as SnapBackSession;
				this._currentSession = session;
				logger.info("Restored OAuth session from storage");

				// Check if session needs refresh
				if (session.expiresAt && Date.now() >= session.expiresAt) {
					await this.refreshSession();
				}
			}
		} catch (error) {
			logger.error("Failed to restore OAuth session", error as Error);
		}
	}

	/**
	 * Store session in secure storage
	 */
	private async storeSession(session: SnapBackSession): Promise<void> {
		await this.context.secrets.store("snapback.oauth.session", JSON.stringify(session));
	}

	/**
	 * Link workspace ID to user for MCP tier resolution
	 *
	 * This enables the MCP server to resolve the user's tier without
	 * requiring API keys in MCP config files. The workspace ID is
	 * generated on extension activation and stored in SecretStorage.
	 */
	private async linkWorkspaceToUser(session: SnapBackSession, userId?: string): Promise<void> {
		try {
			// Get workspace ID from secret storage
			const workspaceIdResult = await getOrCreateWorkspaceId(this.context.secrets);
			const workspaceId = workspaceIdResult.workspaceId;

			if (!workspaceId) {
				logger.warn("No workspace ID available for linking");
				return;
			}

			// Determine tier from account info
			// In production, this would come from the token response or a separate API call
			const tier = "pro"; // Authenticated users get pro tier

			// MCP server URL
			const mcpServerUrl = process.env.SNAPBACK_MCP_URL || "https://snapback-mcp.fly.dev";

			logger.info("Linking workspace to user", {
				workspaceId: `${workspaceId.slice(0, 10)}...`,
				tier,
			});

			const response = await fetch(`${mcpServerUrl}/auth/link-workspace`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${session.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					workspace_id: workspaceId,
					user_id: userId || session.account.id,
					tier,
				}),
			});

			if (response.ok) {
				const result = (await response.json()) as { linked: boolean; tier: string };
				logger.info("Workspace linked successfully", { tier: result.tier });

				// Show success notification
				vscode.window.showInformationMessage(
					"✅ SnapBack Pro activated! Your AI assistant now has full access.",
				);
			} else {
				const errorText = await response.text();
				logger.warn("Failed to link workspace", {
					status: response.status,
					error: errorText,
				});
				// Non-fatal - user can still use extension directly
			}
		} catch (error) {
			// Non-fatal error - workspace linking is optional
			logger.warn("Error linking workspace (non-fatal)", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Build OAuth authorization URL
	 */
	private buildAuthUrl(state: string, codeChallenge: string, scopes: readonly string[]): string {
		const params = new URLSearchParams({
			client_id: "vscode-extension",
			response_type: "code",
			redirect_uri: "vscode://MarcelleLabs.snapback-vscode/oauth-callback",
			state: state,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
			scope: scopes.join(" ") || "read write",
		});

		return `${SnapBackOAuthProvider.AUTH_BASE_URL}/oauth/authorize?${params.toString()}`;
	}

	/**
	 * Wait for OAuth callback from redirect
	 */
	private async waitForAuthCallback(state: string): Promise<{ code: string; state: string }> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Authentication timed out"));
			}, 120000); // 2 minute timeout

			// Register URI handler for callback
			const disposable = vscode.window.registerUriHandler({
				handleUri: async (uri: vscode.Uri) => {
					clearTimeout(timeout);
					disposable.dispose();

					try {
						const query = new URLSearchParams(uri.query);
						const code = query.get("code");
						const returnedState = query.get("state");
						const error = query.get("error");

						if (error) {
							reject(new Error(`OAuth error: ${error} - ${query.get("error_description") || ""}`));
							return;
						}

						if (!code || !returnedState) {
							reject(new Error("Invalid OAuth callback: missing code or state"));
							return;
						}

						if (returnedState !== state) {
							reject(new Error("Invalid state parameter (CSRF protection)"));
							return;
						}

						resolve({ code, state: returnedState });
					} catch (err) {
						reject(err);
					}
				},
			});
		});
	}

	/**
	 * Exchange authorization code for access token
	 */
	private async exchangeCodeForToken(
		code: string,
		codeVerifier: string,
		redirectUri: string,
	): Promise<{
		access_token: string;
		refresh_token?: string;
		expires_in?: number;
		user_id?: string;
		user_email?: string;
	}> {
		const response = await fetch(`${SnapBackOAuthProvider.AUTH_BASE_URL}/oauth/token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				grant_type: "authorization_code",
				code: code,
				code_verifier: codeVerifier,
				redirect_uri: redirectUri,
				client_id: "vscode-extension",
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`);
		}

		const tokenResponse = await response.json();
		return tokenResponse as {
			access_token: string;
			refresh_token?: string;
			expires_in?: number;
			user_id?: string;
			user_email?: string;
		};
	}

	/**
	 * Revoke OAuth token on backend
	 */
	private async revokeToken(token: string): Promise<void> {
		await fetch(`${SnapBackOAuthProvider.AUTH_BASE_URL}/oauth/revoke`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				token: token,
				client_id: "vscode-extension",
			}),
		});
	}

	/**
	 * Generate PKCE code verifier and challenge
	 */
	private async generatePKCE(): Promise<{
		codeVerifier: string;
		codeChallenge: string;
	}> {
		// Generate random code verifier (43-128 characters)
		const codeVerifier = this.generateRandomString(128);

		// Create SHA-256 hash and base64url encode
		const encoder = new TextEncoder();
		const data = encoder.encode(codeVerifier);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const codeChallenge = btoa(String.fromCharCode(...hashArray))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "");

		return { codeVerifier, codeChallenge };
	}

	/**
	 * Generate cryptographically secure random string
	 */
	private generateRandomString(length: number): string {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return Array.from(array, (byte) => chars[byte % chars.length]).join("");
	}

	/**
	 * Register this provider with VSCode
	 */
	static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new SnapBackOAuthProvider(context);

		const disposable = vscode.authentication.registerAuthenticationProvider(
			SnapBackOAuthProvider.AUTH_PROVIDER_ID,
			SnapBackOAuthProvider.AUTH_PROVIDER_LABEL,
			provider,
			{
				supportsMultipleAccounts: false,
			},
		);

		context.subscriptions.push(disposable);

		logger.info("SnapBack OAuth provider registered");

		return disposable;
	}
}
