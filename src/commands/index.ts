import type { ServiceFederation } from "@snapback/core";
import type * as vscodeType from "vscode";
import * as vscode from "vscode";
import type { ConflictResolver } from "../conflictResolver.js";
import type { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider.js"; // 🆕 Import FileHealthDecorationProvider
import type { NotificationManager } from "../notificationManager.js";
import type { OperationCoordinator } from "../operationCoordinator.js";
import type { ConfigFileManager } from "../protection/ConfigFileManager.js";
import type { FileSystemWatcher } from "../protection/FileSystemWatcher.js";
import type { SnapBackRCLoader } from "../protection/SnapBackRCLoader.js";
import type { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider.js";
import type { FeatureFlagService } from "../services/feature-flag-service.js"; // 🆕 Import FeatureFlagService type
import type { MCPLifecycleManager } from "../services/MCPLifecycleManager.js"; // 🆕 Import MCPLifecycleManager
// Import proper types
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import type { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider.js";
import type { WorkspaceManager } from "../services/WorkspaceManager.js"; // 🆕 Import WorkspaceManager
import type { SnapshotManager } from "../snapshot/SnapshotManager.js";
import type { StorageManager } from "../storage/StorageManager.js";
import type { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider.js";
import type { SnapshotRestoreUI } from "../ui/SnapshotRestoreUI.js";
import type { StatusBarController } from "../ui/statusBar.js";
import type { SnapBackExplorerTreeProvider } from "../views/explorerTree/SnapBackExplorerTreeProvider.js";
import type { ProtectedFilesTreeProvider } from "../views/ProtectedFilesTreeProvider.js";

import type { WelcomeView } from "../welcomeView.js";
import type { WorkflowIntegration } from "../workflowIntegration.js";
import type { WorkspaceMemoryManager } from "../workspaceMemory.js";
import { registerAuthCommands } from "./authCommands.js";
import { registerDecorationCommands } from "./decorationCommands.js"; // 🆕 Import decoration commands
import { registerDetectionCommands } from "./detectionCommands.js";
import {
	registerConnectCommand,
	registerOpenSnapshotInWebCommand,
	registerRefreshTreeCommand,
} from "./explorerTree.js";
import { registerMcpCommands } from "./mcpCommands.js"; // 🆕 Import MCP commands
import { registerOfflineModeCommands } from "./offlineModeCommands.js";
import { registerPolicyOverrideCommands } from "./policyOverrideCommands.js";
import { registerProtectionCommands } from "./protectionCommands.js";
import { registerSessionCommands } from "./sessionCommands.js";
import { registerSnapshotCommands } from "./snapshotCommands.js";
import { registerSnapshotCreationCommands } from "./snapshotCreationCommands.js";
import { registerStatusBarCommands } from "./statusBarCommands.js";
import { registerUtilityCommands } from "./utilityCommands.js";
import { registerViewCommands } from "./viewCommands.js";
import { registerWorkflowCommands } from "./workflowCommands.js";

/**
 * Helper to safely register a command with deduplication
 * Prevents "command already exists" errors when extension activates multiple times
 * (e.g., during reload, hot reload, or if subscriptions aren't properly disposed)
 *
 * @param commandId - Unique identifier for the command
 * @param handler - Function to execute when command is invoked
 * @returns Disposable that can be added to extension subscriptions
 *
 * @example
 * ```typescript
 * const disposable = registerCommandSafely('snapback.action', async () => {
 *   // command implementation
 * });
 * context.subscriptions.push(disposable);
 * ```
 */
function registerCommandSafely<T extends (...args: any[]) => any>(
	commandId: string,
	handler: T,
): vscode.Disposable {
	try {
		return vscode.commands.registerCommand(commandId, handler);
	} catch (error) {
		if (error instanceof Error && error.message.includes("already exists")) {
			// Command is already registered (likely from a previous activation)
			// Return a no-op disposable to maintain consistent contract
			return {
				dispose: () => {
					// no-op: command will be handled by existing registration
				},
			};
		}
		throw error;
	}
}

/**
 * Export the registerCommandSafely helper for use in other command modules.
 * This allows command registration functions throughout the extension to safely
 * handle "command already exists" errors during reactivation or reload.
 */
export { registerCommandSafely };

/**
 * Command context containing all services and utilities needed by command handlers.
 *
 * Passed to all command registration functions to provide centralized access to
 * extension services, avoiding circular dependencies and making testing easier.
 */
export interface CommandContext {
	// Core Services
	/** Manages file protection states (Watch/Warn/Block levels) */
	protectedFileRegistry: ProtectedFileRegistry;
	/** Orchestrates snapshot and session operations */
	operationCoordinator: OperationCoordinator;
	/** Handles snapshot CRUD operations */
	snapshotManager: SnapshotManager;
	/** Integrates with Git and CI/CD workflows */
	workflowIntegration: WorkflowIntegration;
	/** Manages VS Code status bar display and interactions */
	statusBarController: StatusBarController;
	/** Sends user notifications and dialog messages */
	notificationManager: NotificationManager;
	/** Tracks workspace-level state and memory */
	workspaceMemoryManager: WorkspaceMemoryManager;
	/** Handles merge conflicts and file diff resolution */
	conflictResolver: ConflictResolver;
	/** Manages feature flags for A/B testing and gradual rollouts */
	featureFlagService: FeatureFlagService;
	/** 🟢 Protection audit service for repo-level protection status */
	protectionService?: import("../services/protectionService.js").ProtectionService;

	// Providers for UI rendering
	/** Provides snapshot content to diff editors */
	snapshotDocumentProvider: SnapshotDocumentProvider;
	/** Provides file decoration (icons/colors) for protection levels */
	protectionDecorationProvider: ProtectionDecorationProvider;
	/** 🆕 Provides file health decorations (risk/health status) */
	fileHealthDecorationProvider: FileHealthDecorationProvider; // 🆕 Add FileHealthDecorationProvider to CommandContext
	/** Handles multi-file session restore UI */
	snapshotRestoreUI: SnapshotRestoreUI;

	// Other dependencies
	/** Provides tree view data for protected files list */
	protectedFilesTreeProvider: ProtectedFilesTreeProvider;
	/** Provides snapshot metadata and summaries */
	snapshotSummaryProvider: StorageSnapshotSummaryProvider;
	/** 🆕 Provides Explorer tree view data for workspace safety and snapshots */
	explorerTreeProvider?: SnapBackExplorerTreeProvider;

	// Configuration Management
	/** Manages .snapbackrc configuration files */
	configManager: ConfigFileManager;
	/** Watches filesystem for configuration changes */
	fileWatcher: FileSystemWatcher;
	/** Loads and parses .snapbackrc policies */
	snapbackrcLoader: SnapBackRCLoader;

	// UI Components
	/** Displays welcome screen for new users */
	welcomeView: WelcomeView;

	// MCP Manager
	/** 🆕 Manages MCP server lifecycle */
	mcpManager?: MCPLifecycleManager;

	// Utility functions
	/** Refreshes all tree views to reflect state changes */
	refreshViews: () => void;
	/** Updates context key for file protection status */
	updateFileProtectionContext: (uri: vscodeType.Uri) => Promise<void>;
	/** Updates context key for presence of protected files */
	updateHasProtectedFilesContext: () => Promise<void>;
	/** Gets human-readable summary of current protection state */
	getProtectionStateSummary: () => Promise<{
		state: unknown;
		message: string;
	}>;

	// Storage Layer
	/** File-based storage manager for persistent snapshot and session storage */
	storage: StorageManager;

	// Workspace Context
	/** 🆕 Multi-root workspace manager for workspace-aware operations */
	workspaceManager?: WorkspaceManager;
	/** Absolute path to workspace root directory (backward compatibility: first/primary workspace) */
	workspaceRoot: string;
}

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
							new Promise((resolve) =>
								setTimeout(() => resolve(fallback()), timeout),
							),
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
		...registerSnapshotCommands(
			context,
			commandContext.snapshotManager,
			commandContext.refreshViews,
		),
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
		// 🆕 Register Explorer Tree commands (cloud features) - only if available
		...(commandContext.explorerTreeProvider
			? [
					registerConnectCommand(context, commandContext.explorerTreeProvider),
					registerRefreshTreeCommand(
						context,
						commandContext.explorerTreeProvider,
					),
					registerOpenSnapshotInWebCommand(context),
				]
			: []),
		// NOTE: snapback.createSnapshot is registered in registerSnapshotCreationCommands above
	];
}
