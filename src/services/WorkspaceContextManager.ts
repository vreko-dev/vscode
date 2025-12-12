/**
 * WorkspaceContextManager - Fixes Antipattern #2: Runtime Workspace Context Mismatch
 *
 * This manager provides a dynamic, event-driven interface for workspace context that:
 * 1. Never caches workspace root at initialization time
 * 2. Always fetches fresh workspace root on demand
 * 3. Emits events when workspace context changes (multi-root support)
 * 4. Allows dependent services to react to workspace changes
 *
 * Solves the problem where components capture workspace root in constructor:
 * ```typescript
 * // ❌ ANTIPATTERN: Caches workspaceRoot forever
 * class SnapshotNamingStrategy {
 *   constructor(workspaceRoot: string) {
 *     this.workspaceRoot = workspaceRoot; // Captured at activation, never changes
 *   }
 * }
 *
 * // ✅ SOLUTION: Always fetch fresh workspace root
 * class SnapshotNamingStrategy {
 *   constructor(workspaceContextManager: WorkspaceContextManager) {
 *     this.contextManager = workspaceContextManager;
 *   }
 *   get workspaceRoot() {
 *     return this.contextManager.getWorkspaceRoot(); // Fresh every time
 *   }
 * }
 * ```
 *
 * Reference: AUTODECISION_ANTIPATTERNS_DEEP_DIVE.md - Section 1 & 2
 */

import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";

/**
 * Events emitted by WorkspaceContextManager
 */
export interface WorkspaceContextEvents {
	/**
	 * Emitted when workspace folder changes (multi-root workspace scenario)
	 */
	onWorkspaceChanged: vscode.Event<WorkspaceChangedEvent>;

	/**
	 * Emitted when user explicitly refreshes workspace context
	 */
	onRefresh: vscode.Event<void>;

	/**
	 * Emitted when workspace root validation fails
	 */
	onValidationFailed: vscode.Event<string>;
}

export interface WorkspaceChangedEvent {
	previousRoot: string;
	currentRoot: string;
	timestamp: number;
}

/**
 * Manages workspace context with proper multi-root support
 *
 * This service acts as the single source of truth for:
 * - Current workspace root
 * - Whether workspace exists
 * - Multi-root workspace changes
 *
 * All dependent services should depend on this manager, not the workspace root string
 */
export class WorkspaceContextManager {
	private previousRoot: string | null = null;
	private disposables: vscode.Disposable[] = [];

	// Event emitters
	private workspaceChangedEmitter = new vscode.EventEmitter<WorkspaceChangedEvent>();
	private refreshEmitter = new vscode.EventEmitter<void>();
	private validationFailedEmitter = new vscode.EventEmitter<string>();

	/**
	 * Create a new WorkspaceContextManager
	 *
	 * This manager is designed to be a singleton, created once during extension activation.
	 * It monitors VS Code's workspace changes and emits events to dependent services.
	 */
	constructor() {
		// Listen for workspace folder changes (multi-root scenario)
		if (vscode.workspace.onDidChangeWorkspaceFolders) {
			this.disposables.push(
				vscode.workspace.onDidChangeWorkspaceFolders(() => {
					this.onWorkspaceFoldersChanged();
				}),
			);
		}

		// Listen for configuration changes that might affect workspace context
		if (vscode.workspace.onDidChangeConfiguration) {
			this.disposables.push(
				vscode.workspace.onDidChangeConfiguration((e) => {
					// If any snapback-related config changed, refresh context
					if (e && e.affectsConfiguration && e.affectsConfiguration("snapback")) {
						this.refresh();
					}
				}),
			);
		}

		// Initial log of workspace state
		const root = this.getWorkspaceRoot();
		logger.debug("WorkspaceContextManager initialized", {
			workspaceRoot: root || "(none)",
			isSingleFolder: vscode.workspace.workspaceFolders?.length === 1,
			isMultiFolder: (vscode.workspace.workspaceFolders?.length ?? 0) > 1,
		});

		this.previousRoot = root;
	}

	/**
	 * Get the current workspace root as an absolute path
	 *
	 * Returns the primary workspace folder (first folder in multi-root).
	 * Returns null/empty if no workspace is open.
	 *
	 * This is called on-demand, never cached at initialization
	 *
	 * @returns Workspace root path, or empty string if not in a workspace
	 */
	public getWorkspaceRoot(): string {
		const folders = vscode.workspace.workspaceFolders;

		if (!folders || folders.length === 0) {
			return "";
		}

		// Use primary (first) folder
		return folders[0].uri.fsPath;
	}

	/**
	 * Get all workspace folders (multi-root support)
	 *
	 * @returns Array of workspace folder paths
	 */
	public getAllWorkspaceFolders(): string[] {
		const folders = vscode.workspace.workspaceFolders ?? [];
		return folders.map((f) => f.uri.fsPath);
	}

	/**
	 * Check if a file path belongs to the workspace
	 *
	 * Used to handle multi-root scenarios where user might edit files
	 * from different workspace folders
	 *
	 * @param filePath - Absolute file path to check
	 * @returns Workspace root if file is in workspace, null otherwise
	 */
	public getWorkspaceFolderForFile(filePath: string): string | null {
		const folders = vscode.workspace.workspaceFolders ?? [];

		// Check each folder (multi-root scenario)
		for (const folder of folders) {
			const folderPath = folder.uri.fsPath;

			// Check if filePath is within this folder
			if (filePath.startsWith(folderPath)) {
				return folderPath;
			}
		}

		return null;
	}

	/**
	 * Check if workspace exists
	 *
	 * @returns true if at least one workspace folder is open
	 */
	public hasWorkspace(): boolean {
		return this.getWorkspaceRoot().length > 0;
	}

	/**
	 * Manually refresh workspace context
	 *
	 * Call this after making changes that should invalidate cached
	 * workspace context in dependent services
	 */
	public refresh(): void {
		logger.debug("WorkspaceContextManager refresh triggered");
		this.refreshEmitter.fire();
	}

	/**
	 * Validate that workspace is properly initialized
	 *
	 * Throws if workspace is required but not available
	 *
	 * @param errorMessage - Message to log if validation fails
	 * @throws Error if workspace not available
	 */
	public assertWorkspaceExists(errorMessage?: string): void {
		if (!this.hasWorkspace()) {
			const msg = errorMessage || "Workspace required but not available";
			this.validationFailedEmitter.fire(msg);
			throw new Error(msg);
		}
	}

	/**
	 * Subscribe to workspace changes
	 *
	 * Use this in dependent services to react to workspace folder changes
	 *
	 * @example
	 * ```typescript
	 * // In SnapshotManager constructor:
	 * context.subscriptions.push(
	 *   this.workspaceContextManager.onWorkspaceChanged((event) => {
	 *     logger.info("Workspace changed", {
	 *       from: event.previousRoot,
	 *       to: event.currentRoot,
	 *     });
	 *     this.clearCaches(); // React to change
	 *   })
	 * );
	 * ```
	 */
	get onWorkspaceChanged(): vscode.Event<WorkspaceChangedEvent> {
		return this.workspaceChangedEmitter.event;
	}

	/**
	 * Subscribe to manual refresh events
	 *
	 * Use in dependent services that cache workspace-specific data
	 */
	get onRefresh(): vscode.Event<void> {
		return this.refreshEmitter.event;
	}

	/**
	 * Subscribe to validation failures
	 */
	get onValidationFailed(): vscode.Event<string> {
		return this.validationFailedEmitter.event;
	}

	/**
	 * Dispose of this manager and all listeners
	 *
	 * Called during extension deactivation
	 */
	public dispose(): void {
		// Dispose all disposables (use for-of to avoid forEach return value lint)
		for (const d of this.disposables) {
			d.dispose();
		}
		this.workspaceChangedEmitter.dispose();
		this.refreshEmitter.dispose();
		this.validationFailedEmitter.dispose();
	}

	/**
	 * Handle workspace folder changes (internal)
	 *
	 * Called when user opens/closes workspace folders (multi-root scenario)
	 */
	private onWorkspaceFoldersChanged(): void {
		const currentRoot = this.getWorkspaceRoot();
		const changed = currentRoot !== this.previousRoot;

		if (changed) {
			logger.info("Workspace context changed", {
				previousRoot: this.previousRoot || "(none)",
				currentRoot: currentRoot || "(none)",
			});

			const event: WorkspaceChangedEvent = {
				previousRoot: this.previousRoot || "",
				currentRoot,
				timestamp: Date.now(),
			};

			this.workspaceChangedEmitter.fire(event);
			this.previousRoot = currentRoot;
		}
	}
}

/**
 * Create a singleton instance of WorkspaceContextManager
 *
 * Use this to ensure only one manager exists across the extension
 */
let workspaceContextManagerInstance: WorkspaceContextManager | null = null;

export function createWorkspaceContextManager(): WorkspaceContextManager {
	if (!workspaceContextManagerInstance) {
		workspaceContextManagerInstance = new WorkspaceContextManager();
	}
	return workspaceContextManagerInstance;
}

export function getWorkspaceContextManager(): WorkspaceContextManager {
	if (!workspaceContextManagerInstance) {
		throw new Error("WorkspaceContextManager not initialized. Call createWorkspaceContextManager() first.");
	}
	return workspaceContextManagerInstance;
}
