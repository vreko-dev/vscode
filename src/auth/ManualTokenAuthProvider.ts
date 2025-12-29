/**
 * ManualTokenAuthProvider.ts
 *
 * Provides manual token authentication as fallback when OAuth is blocked.
 *
 * Spec Reference: unified_ux_spec_UPDATED.md §3.2, J1-E07
 * Edge Case: Corporate proxy blocks OAuth
 *
 * Implementation:
 *   1. Detect proxy environment
 *   2. Offer manual token entry as fallback
 *   3. Validate token with API
 *   4. Create session from valid token
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec_UPDATED.md
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Result of manual token authentication attempt
 */
export interface ManualTokenAuthResult {
	success: boolean;
	session?: {
		accessToken: string;
		account: { id: string; label: string };
	};
	error?: string;
}

/**
 * Proxy environment detection result
 */
export interface ProxyEnvironment {
	hasProxy: boolean;
	proxyUrl?: string;
	likelyBlocked: boolean;
}

/**
 * Manual Token Auth Provider
 *
 * When OAuth flow is blocked by corporate proxy/firewall:
 * 1. Detect proxy environment
 * 2. Offer manual token entry as fallback
 * 3. Validate token with API
 * 4. Create session from valid token
 */
export class ManualTokenAuthProvider {
	private readonly apiBaseUrl: string;

	constructor(apiBaseUrl: string = "https://api.snapback.dev") {
		this.apiBaseUrl = apiBaseUrl;
	}

	/**
	 * Detect if running in a proxy environment that may block OAuth
	 */
	async detectProxyEnvironment(): Promise<ProxyEnvironment> {
		const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
		const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
		const noProxy = process.env.NO_PROXY || process.env.no_proxy;

		const hasProxy = !!(httpProxy || httpsProxy);

		// Check if our auth domain is likely blocked
		const likelyBlocked = hasProxy && !noProxy?.includes("snapback.dev");

		logger.debug("Proxy environment detected", {
			hasProxy,
			likelyBlocked,
			proxyUrl: httpsProxy || httpProxy,
		});

		return {
			hasProxy,
			proxyUrl: httpsProxy || httpProxy,
			likelyBlocked,
		};
	}

	/**
	 * Show manual token entry dialog
	 */
	async promptForManualToken(): Promise<string | undefined> {
		const result = await vscode.window.showInputBox({
			title: "SnapBack Manual Authentication",
			prompt: "Enter your API token from https://snapback.dev/settings/tokens",
			placeHolder: "sb_xxxxxxxxxxxxxxxxxxxx",
			password: true,
			ignoreFocusOut: true,
			validateInput: (value) => {
				if (!value) {
					return "Token is required";
				}
				if (!value.startsWith("sb_")) {
					return 'Token should start with "sb_"';
				}
				if (value.length < 20) {
					return "Token appears too short";
				}
				return undefined;
			},
		});

		return result;
	}

	/**
	 * Validate token with API and return session
	 */
	async validateToken(token: string): Promise<ManualTokenAuthResult> {
		try {
			logger.info("Validating manual token with API");

			const response = await fetch(`${this.apiBaseUrl}/api/auth/validate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				const error =
					response.status === 401
						? "Invalid or expired token"
						: `Validation failed: ${response.statusText}`;

				logger.warn("Token validation failed", { status: response.status });
				return { success: false, error };
			}

			const data = (await response.json()) as {
				user_id: string;
				email: string;
			};

			logger.info("Token validated successfully", { userId: data.user_id });

			return {
				success: true,
				session: {
					accessToken: token,
					account: {
						id: data.user_id,
						label: data.email,
					},
				},
			};
		} catch (error) {
			const errorInstance = error instanceof Error ? error : new Error(String(error));
			logger.error("Token validation network error", errorInstance);

			return {
				success: false,
				error: `Network error: ${errorInstance.message}`,
			};
		}
	}

	/**
	 * Main entry point for manual token auth flow
	 */
	async authenticate(): Promise<ManualTokenAuthResult> {
		logger.info("Starting manual token authentication flow");

		// Show info about why manual auth is needed
		const proceed = await vscode.window.showWarningMessage(
			"OAuth authentication may be blocked by your network. Would you like to use manual token authentication instead?",
			"Enter Token",
			"Try OAuth Again",
			"Cancel",
		);

		if (proceed === "Try OAuth Again") {
			logger.info("User chose to retry OAuth");
			return { success: false, error: "User chose to retry OAuth" };
		}

		if (proceed !== "Enter Token") {
			logger.info("User cancelled manual auth");
			return { success: false, error: "User cancelled" };
		}

		const token = await this.promptForManualToken();
		if (!token) {
			logger.info("No token provided");
			return { success: false, error: "No token provided" };
		}

		return this.validateToken(token);
	}

	/**
	 * Check if manual auth should be offered based on environment
	 */
	async shouldOfferManualAuth(): Promise<boolean> {
		const proxyEnv = await this.detectProxyEnvironment();
		return proxyEnv.likelyBlocked;
	}
}
