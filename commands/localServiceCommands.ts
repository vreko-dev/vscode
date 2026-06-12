/**
 * Local Service Commands
 *
 * Registers the vreko.local-service.call command that delegates to DaemonBridge.
 * This command is used by webviews and other components to call local-service methods
 * via the unified IPC interface.
 *
 * @module commands/localServiceCommands
 */

import * as vscode from "vscode";
import { getCurrentWorkspaceId, getDaemonBridge } from "../services/DaemonBridge";
import { logger } from "../utils/logger";

/**
 * Register local service commands
 *
 * @param context - VS Code extension context
 * @returns Array of command disposables
 */
export function registerLocalServiceCommands(_context: vscode.ExtensionContext): vscode.Disposable[] {
	return [
		// Register the local-service.call command that delegates to DaemonBridge
		vscode.commands.registerCommand(
			"vreko.local-service.call",
			async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
				try {
					const workspaceId = getCurrentWorkspaceId();
					if (!workspaceId) {
						throw new Error("No workspace open");
					}

					const bridge = getDaemonBridge(workspaceId);
					return await bridge.request(method, params ?? {});
				} catch (error) {
					logger.error(`Local-service call failed: ${method}`, error as Error);
					throw error;
				}
			},
		),
	];
}
