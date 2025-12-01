import * as vscode from "vscode";
import { DesignTokens, type ProtectionLevel } from "../styles/designTokens.js";

export function createWatchNotification(message: string): string {
	return `${DesignTokens.icons.Watched} SnapBack Monitoring Active\n\n${message}`;
}

export function createWarnNotification(message: string): string {
	return `${DesignTokens.icons.Warning} CAUTION ZONE\n\n${message}`;
}

export function createBlockNotification(message: string): string {
	return `${DesignTokens.icons.Protected} EMERGENCY LOCKDOWN\n\n${message}`;
}

export async function showLevelNotification(
	level: ProtectionLevel,
	message: string,
	...actions: string[]
): Promise<string | undefined> {
	const formatters = {
		Watched: createWatchNotification,
		Warning: createWarnNotification,
		Protected: createBlockNotification,
	};

	const formattedMessage = formatters[level](message);

	const severities = {
		Watched: vscode.window.showInformationMessage,
		Warning: vscode.window.showWarningMessage,
		Protected: vscode.window.showErrorMessage,
	};

	return await severities[level](formattedMessage, ...actions);
}
