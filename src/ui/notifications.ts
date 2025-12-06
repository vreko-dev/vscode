import * as vscode from "vscode";
import { DesignTokens, type ProtectionLevel } from "../styles/designTokens";

/**
 * Format notification message with appropriate icon prefix
 */
export function formatNotification(
	message: string,
	level: ProtectionLevel,
): string {
	if (level === "watch") {
		return `${DesignTokens.icons.watch} SnapBack Monitoring Active\n\n${message}`;
	}

	if (level === "warn") {
		return `${DesignTokens.icons.warn} CAUTION ZONE\n\n${message}`;
	}

	if (level === "block") {
		return `${DesignTokens.icons.block} EMERGENCY LOCKDOWN\n\n${message}`;
	}

	return message;
}

/**
 * Show notification with appropriate severity based on protection level
 */
export async function showProtectionNotification(
	level: ProtectionLevel,
	message: string,
	...actions: string[]
): Promise<string | undefined> {
	// Format message with icon prefix
	const formatters: Record<ProtectionLevel, (msg: string) => string> = {
		watch: (msg) => `${DesignTokens.icons.watch} ${msg}`,
		warn: (msg) => `${DesignTokens.icons.warn} ${msg}`,
		block: (msg) => `${DesignTokens.icons.block} ${msg}`,
	};

	const formattedMessage = formatters[level](message);

	// Map protection level to VS Code notification severity
	const severities = {
		watch: vscode.window.showInformationMessage,
		warn: vscode.window.showWarningMessage,
		block: vscode.window.showErrorMessage,
	};

	return await severities[level](formattedMessage, ...actions);
}
