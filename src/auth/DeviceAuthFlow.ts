import { logger } from "@snapback/infrastructure";
import {
	type AuthResult,
	createDeviceAuthClient,
	DeviceAuthClient,
	type DeviceCodeResponse,
	type FlowState,
} from "@snapback-oss/sdk";
import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { TelemetryProxy } from "../services/telemetry-proxy";
import { DiagnosticEventTracker } from "../telemetry/diagnostic-event-tracker";

// Re-export types for backward compatibility
export type { AuthResult, FlowState };

/**
 * Device Authorization Flow (RFC 8628) for VS Code Extension
 *
 * Uses shared DeviceAuthClient from @snapback-oss/sdk for core authentication,
 * with VS Code-specific UI and credential storage.
 *
 * Perfect for WSL, Remote SSH, and Codespaces where OAuth callbacks don't work
 *
 * Flow:
 * 1. Extension requests device code → /api/deviceAuth/requestCode
 * 2. Shows verification_uri + user_code to user
 * 3. User visits URL in browser, enters code, logs in via OAuth
 * 4. Extension polls /api/deviceAuth/pollToken until approval
 * 5. Returns API key for authenticated requests
 * 6. Events tracked: auth.provider.selected, auth.browser.opened, auth.approval.received
 */
export class DeviceAuthFlow {
	private client: DeviceAuthClient;
	private lastError: Error | null = null;
	private diagnosticTracker: DiagnosticEventTracker;
	private pollStartTime = 0;

	constructor(
		private context: ExtensionContext,
		private apiBaseUrl = "http://localhost:3000/api",
	) {
		// Initialize diagnostic event tracker
		const telemetryProxy = new TelemetryProxy(context);
		this.diagnosticTracker = new DiagnosticEventTracker(telemetryProxy);

		// Initialize shared device auth client
		this.client = createDeviceAuthClient(apiBaseUrl, "vscode-extension");
	}

	/**
	 * Start device authorization flow
	 * Returns API key when approved, throws if cancelled or timeout
	 * Tracks events: auth.provider.selected, auth.browser.opened, auth.approval.received
	 */
	async authenticate(): Promise<AuthResult> {
		this.lastError = null;
		this.pollStartTime = Date.now();

		// Track: User selected device flow as auth provider
		this.diagnosticTracker.trackAuthProviderSelected("device_flow", "user_selected");

		// Create a new client for each authentication to reset state
		this.client = createDeviceAuthClient(this.apiBaseUrl, "vscode-extension");

		try {
			const result = await this.client.authenticate({
				onDeviceCode: async (response: DeviceCodeResponse) => {
					logger.info("Device code obtained, polling for approval", {
						userCode: response.user_code,
						expiresIn: response.expires_in,
						initialInterval: response.interval,
					});

					// Show VS Code verification prompt
					await this.showVerificationPrompt(response.verification_uri, response.user_code);
				},

				onPoll: (attempt: number, intervalMs: number) => {
					logger.debug("Waiting for user approval...", {
						attempt,
						interval: intervalMs,
					});
				},

				onSlowDown: (newIntervalMs: number) => {
					logger.debug("Server requested slower polling", {
						newInterval: newIntervalMs,
					});
				},

				onApproved: async (result: AuthResult) => {
					// Track: Server approved the authentication request
					const approvalTimeMs = Date.now() - this.pollStartTime;
					this.diagnosticTracker.trackAuthApprovalReceived(approvalTimeMs);

					// Log successful token reception
					logger.debug("Device auth token received", {
						hasRefreshToken: !!result.refresh_token,
						expiresIn: result.expires_in,
					});

					// Store credentials securely in VS Code Secrets
					await this.context.secrets.store("snapback.apiKey", result.api_key);
					await this.context.secrets.store("snapback.userId", result.user_id);
					await this.context.secrets.store("snapback.userTier", result.tier);

					logger.info("Device auth approved", {
						userId: result.user_id,
						tier: result.tier,
					});
				},

				onError: (error: Error) => {
					this.lastError = error;
					logger.error("Device auth failed", {
						error: error.message,
						state: this.getState(),
					});
				},

				onCancelled: () => {
					logger.info("Device auth cancelled by user");
				},
			});

			return result;
		} catch (error) {
			this.lastError = error instanceof Error ? error : new Error(String(error));
			throw this.lastError;
		}
	}

	/**
	 * Cancel authentication flow
	 */
	cancel(): void {
		this.client.cancel();
		logger.info("Device auth cancelled by user");
	}

	/**
	 * Get current flow state
	 */
	getState(): FlowState {
		return this.client.getState();
	}

	/**
	 * Get last error (for debugging)
	 */
	getLastError(): Error | null {
		return this.lastError;
	}

	/**
	 * Show verification prompt to user and attempt to open browser
	 * Tracks browser opening attempt with diagnostic event
	 */
	private async showVerificationPrompt(verificationUri: string, userCode: string): Promise<void> {
		const message = `SnapBack: Visit the link below and enter code: **${userCode}**`;
		const action = await vscode.window.showInformationMessage(message, "Open Browser", "Copy Code");

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
