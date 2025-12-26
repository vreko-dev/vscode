/**
 * ManualAuthFlow.ts
 *
 * Manual API key authentication for corporate environments behind restrictive proxies.
 *
 * Spec Reference: unified_ux_spec.md §P1-5
 * Edge Cases Covered:
 *   - J1-E07: Corporate proxy blocks OAuth → manual token fallback
 *
 * Flow:
 * 1. User generates API key on SnapBack dashboard (console.snapback.dev/dashboard/api-key)
 * 2. User copies API key
 * 3. User pastes API key into VS Code via command or input box
 * 4. Extension validates key format and stores securely
 * 5. (Optional) Extension validates key with backend if network allows
 *
 * Use Cases:
 * - Corporate proxies blocking OAuth redirects
 * - Air-gapped environments with manual key distribution
 * - SSO/SAML environments where OAuth isn't feasible
 * - Enterprise customers with key management systems
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { DiagnosticEventTracker } from "../telemetry/diagnostic-event-tracker";
import { logger } from "../utils/logger";

/** Result of manual authentication */
export interface ManualAuthResult {
	api_key: string;
	user_id: string;
	tier: "free" | "pro" | "enterprise";
	validated: boolean; // Whether key was validated with backend
}

/** Configuration for manual auth behavior */
interface ManualAuthConfig {
	apiBaseUrl: string;
	validateKeyWithBackend: boolean; // Whether to validate key with backend (may fail behind proxy)
	keyValidationTimeout: number; // Timeout for key validation (ms)
}

const DEFAULT_CONFIG: ManualAuthConfig = {
	apiBaseUrl: "https://api.snapback.dev",
	validateKeyWithBackend: true,
	keyValidationTimeout: 5000, // 5 second timeout for validation
};

/** API key format: sb_live_... or sb_test_... */
const API_KEY_PATTERN = /^sb_(live|test)_[a-zA-Z0-9]{32,64}$/;

/**
 * Manual API key authentication flow for corporate/air-gapped environments.
 *
 * Allows users to paste API keys generated on the dashboard when OAuth
 * and device flow aren't available due to network restrictions.
 */
export class ManualAuthFlow {
	private readonly config: ManualAuthConfig;
	private readonly diagnosticTracker: DiagnosticEventTracker | null = null;

	constructor(
		private readonly context: ExtensionContext,
		config: Partial<ManualAuthConfig> = {},
		telemetryProxy?: TelemetryProxy,
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		if (telemetryProxy) {
			this.diagnosticTracker = new DiagnosticEventTracker(telemetryProxy);
		}
	}

	/**
	 * Prompt user for API key input.
	 *
	 * @returns Authentication result or null if cancelled
	 */
	async authenticate(): Promise<ManualAuthResult | null> {
		// Track auth method selection
		this.diagnosticTracker?.trackAuthProviderSelected("device_flow", "fallback");

		// Show info message with dashboard link
		const showDashboard = await vscode.window.showInformationMessage(
			"To authenticate manually, you'll need an API key from your SnapBack dashboard.",
			"Generate API Key",
			"I have a key",
		);

		if (showDashboard === "Generate API Key") {
			// Open dashboard in browser
			await vscode.env.openExternal(vscode.Uri.parse("https://console.snapback.dev/dashboard/api-key"));

			// Wait for user to generate and copy key
			await vscode.window.showInformationMessage(
				"Generate an API key in your dashboard, then click 'Enter Key' to continue.",
				"Enter Key",
			);
		} else if (!showDashboard) {
			// User cancelled
			logger.info("Manual auth cancelled by user at intro");
			return null;
		}

		// Prompt for API key
		const apiKey = await vscode.window.showInputBox({
			title: "Enter SnapBack API Key",
			prompt: "Paste your API key (starts with sb_live_ or sb_test_)",
			placeHolder: "sb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			password: true, // Mask input for security
			ignoreFocusOut: true, // Don't dismiss on focus loss
			validateInput: (value) => this.validateKeyFormat(value),
		});

		if (!apiKey) {
			// User cancelled
			logger.info("Manual auth cancelled by user at key input");
			return null;
		}

		// Validate key format
		if (!API_KEY_PATTERN.test(apiKey)) {
			vscode.window.showErrorMessage("Invalid API key format. Keys should start with sb_live_ or sb_test_");
			logger.warn("Manual auth failed: invalid key format");
			return null;
		}

		// Try to validate with backend (may fail if proxy blocks it)
		let validated = false;
		let userId = "manual-user";
		let tier: "free" | "pro" | "enterprise" = "free";

		if (this.config.validateKeyWithBackend) {
			try {
				const validation = await this.validateKeyWithBackend(apiKey);
				if (validation) {
					validated = true;
					userId = validation.userId;
					tier = validation.tier;
					logger.info("API key validated with backend", { userId, tier });
				}
			} catch (error) {
				// Validation failed (likely due to proxy) - accept key anyway
				logger.warn("Could not validate API key with backend (possibly behind proxy)", {
					error: error instanceof Error ? error.message : String(error),
				});

				// Show warning but continue
				const proceed = await vscode.window.showWarningMessage(
					"Could not verify API key online (network may be restricted). Store key anyway?",
					"Yes, Store Key",
					"Cancel",
				);

				if (proceed !== "Yes, Store Key") {
					logger.info("Manual auth cancelled after validation warning");
					return null;
				}
			}
		}

		// Store credentials securely
		await this.storeCredentials(apiKey, userId, tier);

		// Show success
		const validationStatus = validated ? "verified" : "stored locally (offline)";
		vscode.window.showInformationMessage(`SnapBack: API key ${validationStatus}. You're ready to go!`);

		logger.info("Manual auth completed", {
			validated,
			tier,
			keyPrefix: `${apiKey.substring(0, 12)}...`,
		});

		return {
			api_key: apiKey,
			user_id: userId,
			tier,
			validated,
		};
	}

	/**
	 * Validate key format for input box.
	 */
	private validateKeyFormat(value: string): string | null {
		if (!value) {
			return "API key is required";
		}
		if (!value.startsWith("sb_")) {
			return "API key should start with sb_";
		}
		if (!API_KEY_PATTERN.test(value)) {
			return "Invalid API key format";
		}
		return null; // Valid
	}

	/**
	 * Validate API key with backend.
	 *
	 * @returns User info if valid, null if invalid, throws if network error
	 */
	private async validateKeyWithBackend(
		apiKey: string,
	): Promise<{ userId: string; tier: "free" | "pro" | "enterprise" } | null> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.config.keyValidationTimeout);

		try {
			const response = await fetch(`${this.config.apiBaseUrl}/api/v1/auth/validate-key`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({ key: apiKey }),
				signal: controller.signal,
			});

			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					vscode.window.showErrorMessage("Invalid API key. Please check and try again.");
					return null;
				}
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as {
				valid: boolean;
				userId?: string;
				tier?: "free" | "pro" | "enterprise";
			};

			if (!data.valid) {
				vscode.window.showErrorMessage("API key is invalid or expired.");
				return null;
			}

			return {
				userId: data.userId || "user",
				tier: data.tier || "free",
			};
		} finally {
			clearTimeout(timeout);
		}
	}

	/**
	 * Store credentials in VS Code SecretStorage.
	 */
	private async storeCredentials(apiKey: string, userId: string, tier: "free" | "pro" | "enterprise"): Promise<void> {
		await this.context.secrets.store("snapback.apiKey", apiKey);
		await this.context.secrets.store("snapback.userId", userId);
		await this.context.secrets.store("snapback.userTier", tier);
		await this.context.secrets.store("snapback.authMethod", "manual");

		logger.debug("Manual auth credentials stored in SecretStorage");
	}

	/**
	 * Clear stored credentials (for sign out).
	 */
	async clearCredentials(): Promise<void> {
		await this.context.secrets.delete("snapback.apiKey");
		await this.context.secrets.delete("snapback.userId");
		await this.context.secrets.delete("snapback.userTier");
		await this.context.secrets.delete("snapback.authMethod");

		logger.info("Manual auth credentials cleared");
	}

	/**
	 * Check if manual auth credentials exist.
	 */
	async hasCredentials(): Promise<boolean> {
		const apiKey = await this.context.secrets.get("snapback.apiKey");
		const authMethod = await this.context.secrets.get("snapback.authMethod");
		return !!apiKey && authMethod === "manual";
	}
}

/**
 * Create and return a ManualAuthFlow instance.
 */
export function createManualAuthFlow(context: ExtensionContext, telemetryProxy?: TelemetryProxy): ManualAuthFlow {
	return new ManualAuthFlow(context, {}, telemetryProxy);
}
