import * as vscode from "vscode";
import { recordFileModification } from "../services/IntelligenceService";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { logger } from "../utils/logger";

/**
 * FileSystemWatcher - Monitors protected files for changes
 *
 * Watches workspace files for changes and triggers protection checks.
 * Notifies the daemon of file modifications for session tracking.
 *
 * SB-284: Fixed wiring gap - external file changes (e.g., from Claude Code Edit tool)
 * now notify the daemon for proper session file tracking.
 *
 * @see DaemonBridge for the daemon RPC protocol
 */
export class FileSystemWatcher {
	private watcher: vscode.FileSystemWatcher;
	private disposables: vscode.Disposable[] = [];

	constructor(private registry: ProtectedFileRegistry) {
		// Watch workspace files, excluding internal directories
		this.watcher = vscode.workspace.createFileSystemWatcher(
			"**/*",
			false, // ignoreCreateEvents
			false, // ignoreChangeEvents
			false, // ignoreDeleteEvents
		);

		// Handle file deletion
		this.disposables.push(
			this.watcher.onDidDelete((uri) => {
				if (this.shouldIgnore(uri.fsPath)) {
					return;
				}
				if (this.registry.isProtected(uri.fsPath)) {
					logger.info(`[Vreko] Protected file deleted, removing from registry: ${uri.fsPath}`);
					this.registry.remove(uri.fsPath);
				}
				// SB-284: Notify daemon of file deletion for session tracking
				void recordFileModification(uri.fsPath, "delete");
			}),
		);

		// Handle file creation
		this.disposables.push(
			this.watcher.onDidCreate((uri) => {
				if (this.shouldIgnore(uri.fsPath)) {
					return;
				}
				if (this.registry.isProtected(uri.fsPath)) {
					logger.info(`[Vreko] Protected file created: ${uri.fsPath}`);
				}
				// SB-284: Notify daemon of file creation for session tracking
				void recordFileModification(uri.fsPath, "create");
			}),
		);

		// Handle file changes - critical for tracking external modifications
		// (e.g., Claude Code Edit tool, git operations, external editors)
		this.disposables.push(
			this.watcher.onDidChange((uri) => {
				if (this.shouldIgnore(uri.fsPath)) {
					return;
				}
				if (this.registry.isProtected(uri.fsPath)) {
					logger.info(`[Vreko] Protected file changed: ${uri.fsPath}`);
				}
				// SB-284: Notify daemon of file change for session tracking
				// This is the critical fix - external file changes now tracked
				void recordFileModification(uri.fsPath, "update");
			}),
		);
	}

	/**
	 * Check if a file path should be ignored from monitoring
	 */
	private shouldIgnore(filePath: string): boolean {
		const patterns = ["/.git/", "/.vreko/", "/node_modules/", "/dist/", "/build/", "/.vscode/"];

		return (
			patterns.some((pattern) => filePath.includes(pattern)) ||
			filePath.endsWith(".log") ||
			filePath.endsWith(".lock")
		);
	}

	dispose(): void {
		this.watcher.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
