/**
 * @fileoverview Command Types and Utilities
 *
 * This module provides shared types and utilities for command handlers.
 * Extracted from commands/index.ts to break circular dependencies.
 *
 * @see commands/index.ts for command registration
 */

import type * as vscodeType from "vscode";
import * as vscode from "vscode";
import type { ConflictResolver } from "../conflictResolver";
import type { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider";
import type { VrekoEventBus } from "../events";
import type { OperationCoordinator } from "../operationCoordinator";
import type { ConfigFileManager } from "../protection/ConfigFileManager";
import type { FileSystemWatcher } from "../protection/FileSystemWatcher";
import type { VrekoRCLoader } from "../protection/VrekoRCLoader";
import type { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider";
import type { DaemonBridge } from "../services/DaemonBridge";
import type { MCPToolsService } from "../services/MCPToolsService";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import type { IRecoveryService, ISessionStatsProvider } from "../services/recovery/interfaces";
import type { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider";
import type { WorkspaceManager } from "../services/WorkspaceManager";
import type { SnapshotManager } from "../snapshot/SnapshotManager";
import type { IStorageManager } from "../storage/types";
import type { CooldownIndicator } from "../ui/cooldownIndicator";
import type { NotificationCoordinator } from "../ui/NotificationCoordinator";
import type { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider";
import type { SnapshotRestoreUI } from "../ui/SnapshotRestoreUI";
import type { RecoveryTreeProvider } from "../ui/tree/RecoveryTreeProvider";
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
 * const disposable = registerCommandSafely('vreko.action', async () => {
 *   // command implementation
 * });
 * context.subscriptions.push(disposable);
 * ```
 */
export function registerCommandSafely<T extends (...args: unknown[]) => unknown>(
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
	/** Sends user notifications and dialog messages */
	notificationCoordinator: NotificationCoordinator;
	/** Tracks workspace-level state and memory */
	workspaceMemoryManager: WorkspaceMemoryManager;
	/** Handles merge conflicts and file diff resolution */
	conflictResolver: ConflictResolver;
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
	/** Provides snapshot metadata and summaries */
	snapshotSummaryProvider: StorageSnapshotSummaryProvider;

	// Configuration Management
	/** Manages .vrekorc configuration files */
	configManager: ConfigFileManager;
	/** Watches filesystem for configuration changes */
	fileWatcher: FileSystemWatcher;
	/** Loads and parses .vrekorc policies */
	vrekorcLoader: VrekoRCLoader;

	// UI Components
	/** 🆕 Cooldown indicator for status bar */
	cooldownIndicator?: CooldownIndicator;

	// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Daemon Bridge for thin extension
	/** Daemon bridge for cross-surface coordination (Extension ↔ CLI ↔ MCP) */
	daemonBridge: DaemonBridge;

	// 🆕 Recovery UI Services (Phase 1.4)
	/** Recovery service for snapshot timeline operations */
	recoveryService?: IRecoveryService;
	/** Session statistics provider for recovery metrics */
	sessionStatsProvider?: ISessionStatsProvider;
	/** Recovery tree provider for timeline TreeView */
	recoveryTreeProvider?: RecoveryTreeProvider;

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
	storage: IStorageManager;

	// Event bus
	/** Event bus for inter-component communication */
	eventBus?: VrekoEventBus;

	// MCP Tools
	/** MCP Tools service for vreko check, snap, snap_end operations */
	mcpToolsService?: MCPToolsService;

	// Workspace Context
	/** 🆕 Multi-root workspace manager for workspace-aware operations */
	workspaceManager?: WorkspaceManager;
	/** Absolute path to workspace root directory (backward compatibility: first/primary workspace) */
	workspaceRoot: string;
}

/**
 * Type guard to check if AppContext has all required CommandContext properties.
 * SB-270: Validates that the context is fully initialized before command registration.
 *
 * @param appContext - The application context to validate
 * @returns true if all required properties are present, false otherwise
 */
export function isValidCommandContext(appContext: unknown): appContext is CommandContext {
	if (!appContext || typeof appContext !== "object") {
		return false;
	}

	const ctx = appContext as Record<string, unknown>;

	// Check ABSOLUTE MINIMUM required properties for basic extension functionality
	// These are the bare essentials - everything else can be undefined in degraded mode
	const absoluteMinimum = ["protectedFileRegistry", "operationCoordinator", "snapshotManager", "workspaceRoot"];

	return absoluteMinimum.every((prop) => ctx[prop] !== undefined && ctx[prop] !== null);
}
