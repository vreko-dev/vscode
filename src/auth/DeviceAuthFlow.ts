import { logger } from "@snapback/infrastructure";
import type { ExtensionContext } from "vscode";

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

	constructor(
		private context: ExtensionContext,
		private apiBaseUrl: string = "http://localhost:3000/api",
	) {}

	/**
	 * Start device authorization flow
	 * Returns API key when approved, throws if cancelled or timeout
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
			// Step 1: Request device code
			const deviceCodeResponse = await this.requestDeviceCode();

			if (!deviceCodeResponse.data) {
				throw new Error(
					`Failed to get device code: ${deviceCodeResponse.error}`,
				);
			}

			const { device_code, expires_in, interval } = deviceCodeResponse.data;

			// Step 2: Set up polling
			this.currentInterval = interval * 1000; // Convert to milliseconds
			this.pollStartTime = Date.now();
			this.state = "waiting_for_approval";

			logger.info("Device code obtained, polling for approval", {
				userCode: deviceCodeResponse.data.user_code,
				expiresIn: expires_in,
				initialInterval: interval,
			});

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
	 * Request device code from backend
	 */
	private async requestDeviceCode(): Promise<{
		success: boolean;
		data?: {
			device_code: string;
			user_code: string;
			verification_uri: string;
			expires_in: number;
			interval: number;
		};
		error?: string;
	}> {
		try {
			const response = await fetch(`${this.apiBaseUrl}/auth/device-code`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					client_id: "vscode-extension",
				}),
				signal: this.abortController?.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return (await response.json()) as any;
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
				const response = await fetch(`${this.apiBaseUrl}/auth/device-token`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						device_code: deviceCode,
					}),
					signal: this.abortController?.signal,
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const data = (await response.json()) as any;

				// Handle success
				if ((data as any).success && (data as any).data) {
					const { api_key, user_id, tier } = (data as any).data;

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
				if ((data as any).error) {
					switch ((data as any).error) {
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

						default:
							throw new Error(`Unknown error: ${(data as any).error}`);
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
}
