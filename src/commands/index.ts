import type { ServiceFederation } from "@snapback/core";
import type * as vscode from "vscode";
import { registerAuthCommands } from "./authCommands";
import { registerDecorationCommands } from "./decorationCommands";
import { registerDetectionCommands } from "./detectionCommands";
import { registerConnectCommand, registerOpenSnapshotInWebCommand, registerRefreshTreeCommand } from "./explorerTree";
import { registerFeedbackCommands } from "./feedbackCommands";
import { registerMcpCommands } from "./mcpCommands";
import { registerOfflineModeCommands } from "./offlineModeCommands";
import { registerPolicyOverrideCommands } from "./policyOverrideCommands";
import { registerProtectionCommands } from "./protectionCommands";
import { registerSessionCommands } from "./sessionCommands";
import { registerSnapshotCommands } from "./snapshotCommands";
import { registerSnapshotCreationCommands } from "./snapshotCreationCommands";
import { registerStatusBarCommands } from "./statusBarCommands";
import { registerUtilityCommands } from "./utilityCommands";
import { registerViewCommands } from "./viewCommands";
import { registerWorkflowCommands } from "./workflowCommands";

// Re-export from types.ts to maintain backward compatibility
export { type CommandContext, registerCommandSafely } from "./types";

import type { CommandContext } from "./types";

/**
 * Register all command handlers in the extension.
 *
 * Aggregates command registrations from all domain-specific modules
 * (protection, snapshots, sessions, etc.) into a single function call.
 *
 * @param context - VS Code extension context for managing disposables
 * @param commandContext - Shared context containing all required services
 *
 * @returns Array of all registered command disposables (to be added to context.subscriptions)
 *
 * @example
 * ```typescript
 * const disposables = registerAllCommands(context, commandContext);
 * disposables.forEach(d => context.subscriptions.push(d));
 * ```
 *
 * @see {@link registerProtectionCommands}
 * @see {@link registerSnapshotCommands}
 * @see {@link registerSessionCommands}
 * @see {@link registerDetectionCommands}
 */
export function registerAllCommands(
	context: vscode.ExtensionContext,
	commandContext: CommandContext,
): vscode.Disposable[] {
	const { mcpManager } = commandContext;

	// Only register MCP commands if MCP manager is available
	const mcpCommandDisposables = mcpManager
		? registerMcpCommands(
				context,
				// We need to provide the ServiceFederation instance here
				// For now, we'll pass a minimal implementation
				{
					executeWithFallback: async (
						_service: unknown,
						primary: () => Promise<unknown>,
						fallback: () => Promise<unknown>,
					) => {
						try {
							return await primary();
						} catch (_error) {
							return fallback();
						}
					},
					executeWithCache: async (
						_service: unknown,
						_key: string,
						primary: () => Promise<unknown>,
						fallback: () => Promise<unknown>,
					) => {
						try {
							return await primary();
						} catch (_error) {
							return fallback();
						}
					},
					executeWithTimeout: async (
						_service: unknown,
						primary: () => Promise<unknown>,
						fallback: () => Promise<unknown>,
						timeout: number,
					) => {
						return Promise.race([
							primary(),
							new Promise((resolve) => setTimeout(() => resolve(fallback()), timeout)),
						]);
					},
				} as InstanceType<typeof ServiceFederation>,
				commandContext.operationCoordinator,
				commandContext.workflowIntegration,
				commandContext.statusBarController,
			)
		: [];

	return [
		...registerAuthCommands(context),
		...registerProtectionCommands(context, commandContext),
		...registerSnapshotCommands(context, commandContext.snapshotManager, commandContext.refreshViews),
		...registerSessionCommands(context, commandContext),
		...registerViewCommands(context, commandContext),
		...registerWorkflowCommands(context, commandContext),
		...registerUtilityCommands(context, commandContext),
		...registerSnapshotCreationCommands(context, commandContext),
		...registerStatusBarCommands(context, commandContext),
		...registerOfflineModeCommands(context, commandContext),
		...registerPolicyOverrideCommands(context, commandContext),
		...registerDetectionCommands(context, commandContext),
		...registerDecorationCommands(context, commandContext), // 🆕 Register decoration commands
		...mcpCommandDisposables, // 🆕 Register MCP commands if available
		...registerFeedbackCommands(context), // 🆕 Register feedback commands
		// 🆕 Register Explorer Tree commands (cloud features) - only if available
		...(commandContext.explorerTreeProvider
			? [
					registerConnectCommand(context, commandContext.explorerTreeProvider),
					registerRefreshTreeCommand(context, commandContext.explorerTreeProvider),
					registerOpenSnapshotInWebCommand(context),
				]
			: []),
		// NOTE: snapback.createSnapshot is registered in registerSnapshotCreationCommands above
	];
}
