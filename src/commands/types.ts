/**
 * @fileoverview Command Types and Utilities
 *
 * This module provides shared types and utilities for command handlers.
 * Extracted from commands/index.ts to break circular dependencies.
 *
 * @see commands/index.ts for command registration
 */

import type { SnapBackEventBus } from "@snapback/events";
import type * as vscodeType from "vscode";
import * as vscode from "vscode";
import type { ConflictResolver } from "../conflictResolver";
import type { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider";
import type { NotificationManager } from "../notificationManager";
import type { OperationCoordinator } from "../operationCoordinator";
import type { ConfigFileManager } from "../protection/ConfigFileManager";
import type { FileSystemWatcher } from "../protection/FileSystemWatcher";
import type { SnapBackRCLoader } from "../protection/SnapBackRCLoader";
import type { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider";
import type { FeatureFlagService } from "../services/feature-flag-service";
import type { MCPLifecycleManager } from "../services/MCPLifecycleManager";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import type { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider";
import type { WorkspaceManager } from "../services/WorkspaceManager";
import type { SnapshotManager } from "../snapshot/SnapshotManager";
import type { StorageManager } from "../storage/StorageManager";
import type { CooldownIndicator } from "../ui/cooldownIndicator";
import type { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider";
import type { SnapshotRestoreUI } from "../ui/SnapshotRestoreUI";
import type { StatusBarController } from "../ui/statusBar";
import type { SnapBackExplorerTreeProvider } from "../views/explorerTree/SnapBackExplorerTreeProvider";
import type { ProtectedFilesTreeProvider } from "../views/ProtectedFilesTreeProvider";
import type { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider";
import type { WelcomeView } from "../welcomeView";
import type { WorkflowIntegration } from "../workflowIntegration";
import type { WorkspaceMemoryManager } from "../workspaceMemory";

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
export function registerCommandSafely<T extends (...args: any[]) => any>(
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
	fileHealthDecorationProvider: FileHealthDecorationProvider;
	/** Handles multi-file session restore UI */
	snapshotRestoreUI: SnapshotRestoreUI;

	// Other dependencies
	/** Provides tree view data for protected files list */
	protectedFilesTreeProvider: ProtectedFilesTreeProvider;
	/** Provides tree view data for snapshot navigation */
	snapshotNavigatorProvider?: SnapshotNavigatorProvider;
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
	/** 🆕 Cooldown indicator for status bar */
	cooldownIndicator?: CooldownIndicator;

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

	// Event bus
	/** Event bus for inter-component communication */
	eventBus?: SnapBackEventBus;

	// Workspace Context
	/** 🆕 Multi-root workspace manager for workspace-aware operations */
	workspaceManager?: WorkspaceManager;
	/** Absolute path to workspace root directory (backward compatibility: first/primary workspace) */
	workspaceRoot: string;
}
