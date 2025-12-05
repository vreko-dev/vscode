import { logger } from "@snapback/infrastructure";
import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { TelemetryProxy } from "../services/telemetry-proxy.js";
import { DiagnosticEventTracker } from "../telemetry/diagnostic-event-tracker.js";

/**
 * Device Authorization Flow (RFC 8628)
 *
 * Implements OAuth-less authentication for VS Code extension
 * Perfect for WSL, Remote SSH, and Codespaces where OAuth callbacks don't work
 *
 * Flow:
 * 1. Extension requests device code → /api/auth/device-code
 * 2. Shows verification_uri + user_code to user
 * 3. User visits URL in browser, enters code, logs in via OAuth
 * 4. Extension polls /api/auth/device-token until approval
 * 5. Returns API key for authenticated requests
 * 6. Events tracked: auth.provider.selected, auth.browser.opened, auth.approval.received
 */
export interface AuthResult {
	api_key: string;
	user_id: string;
	tier: "free" | "pro" | "enterprise";
}

export type FlowState =
	| "idle"
	| "waiting_for_approval"
	| "approved"
	| "cancelled"
	| "error";

export class DeviceAuthFlow {
	private state: FlowState = "idle";
	private lastError: Error | null = null;
	private abortController: AbortController | null = null;
	private isAuthenticating = false;

	// Polling state
	private currentInterval = 0;
	private pollStartTime = 0;

	// Event tracking
	private diagnosticTracker: DiagnosticEventTracker;

	constructor(
		private context: ExtensionContext,
		private apiBaseUrl: string = "http://localhost:3000/api",
	) {
		// Initialize diagnostic event tracker
		const telemetryProxy = new TelemetryProxy(context);
		this.diagnosticTracker = new DiagnosticEventTracker(telemetryProxy);
	}

	/**
	 * Start device authorization flow
	 * Returns API key when approved, throws if cancelled or timeout
	 * Tracks events: auth.provider.selected, auth.browser.opened, auth.approval.received
	 */
	async authenticate(): Promise<AuthResult> {
		// Prevent concurrent authentications
		if (this.isAuthenticating) {
			throw new Error("Authentication already in progress");
		}

		this.isAuthenticating = true;
		this.state = "idle";
		this.lastError = null;
		this.abortController = new AbortController();

		try {
			// Track: User selected device flow as auth provider
			this.diagnosticTracker.trackAuthProviderSelected(
				"device_flow",
				"user_selected",
			);

			// Step 1: Request device code
			const deviceCodeResponse = await this.requestDeviceCode();

			if (!deviceCodeResponse.device_code) {
				throw new Error(
					`Failed to get device code: Device code response missing required field`,
				);
			}

			const { device_code, expires_in, interval, verification_uri, user_code } =
				deviceCodeResponse;

			// Step 2: Set up polling
			this.currentInterval = interval * 1000; // Convert to milliseconds
			this.pollStartTime = Date.now();
			this.state = "waiting_for_approval";

			logger.info("Device code obtained, polling for approval", {
				userCode: user_code,
				expiresIn: expires_in,
				initialInterval: interval,
			});

			// Step 2a: Display verification URI to user and attempt to open browser
			await this.showVerificationPrompt(verification_uri, user_code);

			// Step 3: Poll for token with exponential backoff
			return await this.pollForToken(device_code, expires_in);
		} catch (error) {
			// Don't override cancelled state (set by cancel() method)
			// @ts-expect-error - state can be set by cancel() from outside
			if (this.state !== "cancelled") {
				this.state = "error";
			}
			this.lastError =
				error instanceof Error ? error : new Error(String(error));
			logger.error("Device auth failed", {
				error: this.lastError.message,
				state: this.state,
			});
			throw this.lastError;
		} finally {
			this.isAuthenticating = false;
		}
	}

	/**
	 * Request device code from backend (oRPC endpoint)
	 */
	private async requestDeviceCode(): Promise<{
		device_code: string;
		user_code: string;
		verification_uri: string;
		verification_uri_complete?: string;
		expires_in: number;
		interval: number;
	}> {
		try {
			const response = await fetch(
				`${this.apiBaseUrl}/deviceAuth/requestCode`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						client_id: "vscode-extension",
					}),
					signal: this.abortController?.signal,
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			// oRPC returns the device code response directly
			const data = (await response.json()) as {
				device_code: string;
				user_code: string;
				verification_uri: string;
				verification_uri_complete?: string;
				expires_in: number;
				interval: number;
			};
			return data;
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to request device code";
			throw new Error(`Device code request failed: ${message}`);
		}
	}

	/**
	 * Poll for token with exponential backoff and slow_down handling
	 */
	private async pollForToken(
		deviceCode: string,
		expiresInSeconds: number,
	): Promise<AuthResult> {
		const timeoutMs = expiresInSeconds * 1000;
		const maxWaitTime = this.pollStartTime + timeoutMs;

		while (true) {
			// Check timeout
			if (Date.now() > maxWaitTime) {
				throw new Error("Device code expired - authentication timeout");
			}

			// Check for cancellation
			if (this.abortController?.signal.aborted) {
				this.state = "cancelled";
				const error = new Error("Authentication cancelled");
				this.lastError = error;
				throw error;
			}

			try {
				// Poll for token
				const response = await fetch(
					`${this.apiBaseUrl}/deviceAuth/pollToken`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							device_code: deviceCode,
							grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						}),
						signal: this.abortController?.signal,
					},
				);

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const data = (await response.json()) as
					| {
							access_token: string;
							token_type: "Bearer";
							expires_in?: number;
							refresh_token?: string;
							scope?: string;
					  }
					| {
							error:
								| "authorization_pending"
								| "slow_down"
								| "expired_token"
								| "invalid_request";
							error_description?: string;
					  };

				// Handle success - oRPC returns token directly or error object
				if ("access_token" in data) {
					const { access_token } = data;

					// Track: Server approved the authentication request
					const approvalTimeMs = Date.now() - this.pollStartTime;
					this.diagnosticTracker.trackAuthApprovalReceived(approvalTimeMs);

					// TODO: In production, use access_token as Bearer token or exchange for API key
					// For now, treat access_token as the api_key
					const api_key = access_token;
					const user_id = "user-from-token"; // Extract from token in production
					const tier: "free" | "pro" | "enterprise" = "free"; // Extract from token in production

					// Store API key securely
					await this.context.secrets.store("snapback.apiKey", api_key);
					await this.context.secrets.store("snapback.userId", user_id);
					await this.context.secrets.store("snapback.userTier", tier);

					this.state = "approved";

					logger.info("Device auth approved", {
						userId: user_id,
						tier,
					});

					return { api_key, user_id, tier };
				}

				// Handle RFC 8628 errors
				if ("error" in data) {
					switch (data.error) {
						case "authorization_pending":
							// User hasn't approved yet - continue polling
							logger.debug("Waiting for user approval...");
							break;

						case "slow_down":
							// Server requested slower polling - increase interval by 5s
							this.currentInterval += 5000;
							logger.debug("Server requested slower polling", {
								newInterval: this.currentInterval,
							});
							break;

						case "expired_token":
							throw new Error("Device code has expired on server");

						case "invalid_request":
							throw new Error("Invalid device code format");

						default: {
							const _exhaustive: never = data.error;
							throw new Error(`Unknown error: ${_exhaustive}`);
						}
					}
				}
			} catch (error) {
				// Don't override cancelled state
				if (this.state !== "cancelled") {
					if (error instanceof Error) {
						if (error.message.includes("cancelled")) {
							throw error; // Re-throw cancellation
						}
						// Re-throw RFC 8628 errors (expired_token, invalid_request)
						if (
							error.message.includes("expired") ||
							error.message.includes("Invalid device code")
						) {
							throw error;
						}
						logger.warn("Poll request failed, retrying", {
							error: error.message,
						});
					}
				} else {
					// Already cancelled
					throw error;
				}
			}

			// Wait before next poll with exponential backoff
			await this.delay(this.currentInterval);
		}
	}

	/**
	 * Cancel authentication flow
	 */
	cancel(): void {
		this.abortController?.abort();
		this.state = "cancelled";
		logger.info("Device auth cancelled by user");
	}

	/**
	 * Get current flow state
	 */
	getState(): FlowState {
		return this.state;
	}

	/**
	 * Get last error (for debugging)
	 */
	getLastError(): Error | null {
		return this.lastError;
	}

	/**
	 * Helper: delay execution
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => {
			const timeout = setTimeout(resolve, ms);
			this.abortController?.signal.addEventListener("abort", () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	}

	/**
	 * Show verification prompt to user and attempt to open browser
	 * Tracks browser opening attempt with diagnostic event
	 */
	private async showVerificationPrompt(
		verificationUri: string,
		userCode: string,
	): Promise<void> {
		const message = `SnapBack: Visit the link below and enter code: **${userCode}**`;
		const action = await vscode.window.showInformationMessage(
			message,
			"Open Browser",
			"Copy Code",
		);

		if (action === "Open Browser") {
			try {
				await vscode.env.openExternal(vscode.Uri.parse(verificationUri));
				// Track successful browser opening
				this.diagnosticTracker.trackAuthBrowserOpened(true, "external_command");
				logger.info("Browser opened for device auth");
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				// Track failed browser opening
				this.diagnosticTracker.trackAuthBrowserOpened(false, "error", errorMsg);
				logger.warn("Failed to open browser", { error: errorMsg });

				// Show fallback UI with copy-to-clipboard option
				await vscode.window.showInformationMessage(
					`Couldn't open browser. Visit this link manually: ${verificationUri}`,
					"Copy Link",
				);
			}
		} else if (action === "Copy Code") {
			// User chose to copy code
			await vscode.env.clipboard.writeText(userCode);
			// Track clipboard method
			this.diagnosticTracker.trackAuthBrowserOpened(true, "clipboard");
			logger.info("Device code copied to clipboard");
		} else {
			// User dismissed the prompt
			logger.debug("Device auth prompt dismissed by user");
		}
	}
}
