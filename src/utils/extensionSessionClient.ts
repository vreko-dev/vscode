import * as vscode from "vscode";
import { toError } from "./errorHelpers.js";
import { logger } from "./logger.js";

// Define the session data structure
interface ExtensionSessionData {
	id: string;
	startTime: number;
	endTime: number;
	extensionVersion: string;
	vscodeVersion: string;
	platform: string;
	// Add other properties as needed
	[key: string]: unknown; // Allow additional properties
}

/**
 * Send extension session data to the backend API
 * @param sessionData The session data to send
 * @returns Promise that resolves when the data is sent
 */
export async function sendExtensionSession(
	sessionData: ExtensionSessionData,
): Promise<void> {
	try {
		// Get configuration from VS Code settings
		const config = vscode.workspace.getConfiguration("snapback");

		// Get proxy URL from configuration
		const proxyUrl =
			config.get<string>("telemetryProxy") ||
			process.env.SNAPBACK_TELEMETRY_PROXY ||
			"https://telemetry.snapback.dev";

		const apiEndpoint = `${proxyUrl}/api/extension/session`;

		// Send session data to backend
		const response = await fetch(apiEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				// Note: Authentication will be handled by the session cookie
				// which should be automatically included in the request
			},
			body: JSON.stringify(sessionData),
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error(
				`Failed to send extension session: ${response.status} ${errorText}`,
			);
			throw new Error(
				`Failed to send extension session: ${response.status} ${errorText}`,
			);
		}

		logger.debug("Extension session sent successfully", {
			sessionId: sessionData.id,
		});
	} catch (error) {
		logger.error("Error sending extension session", toError(error));
		// Don't throw the error to avoid breaking the session finalization
	}
}
