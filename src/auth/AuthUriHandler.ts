/**
 * Auth URI Handler
 *
 * Handles deep links from web browser for extension authentication.
 * Expected URI format: vscode://snapback.snapback/auth?token={linkToken}
 *
 * Flow:
 * 1. User opens browser to console.snapback.dev/connect/vscode
 * 2. Web creates link token
 * 3. Browser redirects to vscode://snapback.snapback/auth?token=...
 * 4. This handler receives the URI
 * 5. Exchanges link token for access/refresh tokens
 * 6. Stores credentials in SecretStorage
 * 7. Refreshes tree view
 *
 * @package apps/vscode
 */

import * as os from "node:os";
import * as vscode from "vscode";
import type { CredentialsManager, ExtensionCredentials } from "./credentials";

/**
 * Auth URI Handler
 *
 * Implements vscode.UriHandler for processing authentication deep links.
 */
export class AuthUriHandler implements vscode.UriHandler {
	private readonly credentialsManager: CredentialsManager;
	private readonly apiBaseUrl: string;
	private readonly outputChannel: vscode.OutputChannel;

	constructor(
		credentialsManager: CredentialsManager,
		apiBaseUrl: string,
		outputChannel: vscode.OutputChannel,
	) {
		this.credentialsManager = credentialsManager;
		this.apiBaseUrl = apiBaseUrl;
		this.outputChannel = outputChannel;
	}

	/**
	 * Handle incoming URI
	 *
	 * @param uri - Deep link URI from browser
	 */
	async handleUri(uri: vscode.Uri): Promise<void> {
		// Expected format: vscode://snapback.snapback/auth?token=...
		if (uri.path !== "/auth") {
			this.outputChannel.appendLine(`[Auth] Unknown URI path: ${uri.path}`);
			return;
		}

		// Extract link token from query
		const query = new URLSearchParams(uri.query);
		const linkToken = query.get("token");

		if (!linkToken) {
			vscode.window.showErrorMessage(
				"SnapBack: Invalid authentication link (missing token)",
			);
			return;
		}

		this.outputChannel.appendLine("[Auth] Received link token, exchanging...");

		// Exchange token for credentials
		await this.exchangeToken(linkToken);
	}

	/**
	 * Exchange link token for access/refresh tokens
	 *
	 * Calls POST /api/auth/extension/exchange endpoint.
	 *
	 * @param linkToken - Link token from deep link
	 */
	private async exchangeToken(linkToken: string): Promise<void> {
		try {
			// Get extension version for device info
			const extension = vscode.extensions.getExtension("snapback.snapback");
			const extensionVersion = extension?.packageJSON.version || "unknown";

			// Call exchange endpoint
			const response = await fetch(
				`${this.apiBaseUrl}/api/auth/extension/exchange`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						linkToken,
						client: "vscode",
						deviceInfo: {
							extensionVersion,
							vscodeVersion: vscode.version,
							platform: process.platform,
							hostname: os.hostname(),
						},
					}),
				},
			);

			if (!response.ok) {
				const error = (await response.json()) as { message?: string };
				throw new Error(error.message || "Token exchange failed");
			}

			const data = (await response.json()) as {
				accessToken: string;
				refreshToken: string;
				expiresIn: number;
				user: { id: string; email: string; name?: string };
				workspace?: {
					id: string;
					name: string;
					plan: "free" | "solo" | "team" | "enterprise";
				};
			};

			// Store credentials in SecretStorage
			const credentials: ExtensionCredentials = {
				accessToken: data.accessToken,
				refreshToken: data.refreshToken,
				expiresAt: Date.now() + data.expiresIn * 1000,
				user: data.user,
				workspace: data.workspace,
			};

			await this.credentialsManager.setCredentials(credentials);

			this.outputChannel.appendLine(
				`[Auth] Successfully linked to ${data.user.email}`,
			);

			// Show success message
			vscode.window.showInformationMessage(
				`SnapBack: VS Code is now linked to ${data.user.email}`,
			);

			// Refresh tree view
			await vscode.commands.executeCommand("snapback.refreshTree");
		} catch (error) {
			this.outputChannel.appendLine(
				`[Auth] Token exchange failed: ${(error as Error).message}`,
			);

			vscode.window.showErrorMessage(
				`SnapBack: Failed to link account - ${(error as Error).message}`,
			);
		}
	}
}
