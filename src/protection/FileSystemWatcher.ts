import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { logger } from "../utils/logger";

/**
 * @deprecated **ARCHITECTURE_REFACTOR_SPEC.md Phase 3**: Extension-side file watching is deprecated.
 * File system monitoring is now handled by the CLI daemon.
 * This class will be removed in Phase 4 of the architecture refactor.
 *
 * @see DaemonBridge for the new API
 * @see ARCHITECTURE_REFACTOR_SPEC.md for migration details
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
					logger.info(`[SnapBack] Protected file deleted, removing from registry: ${uri.fsPath}`);
					this.registry.remove(uri.fsPath);
				}
			}),
		);

		// Handle file creation (only log for non-ignored files)
		this.disposables.push(
			this.watcher.onDidCreate((uri) => {
				if (this.shouldIgnore(uri.fsPath)) {
					return;
				}
				// Only log if it's a protected file or potentially protectable
				if (this.registry.isProtected(uri.fsPath)) {
					logger.info(`[SnapBack] Protected file created: ${uri.fsPath}`);
				}
			}),
		);

		// Handle file changes (only log for non-ignored files)
		this.disposables.push(
			this.watcher.onDidChange((uri) => {
				if (this.shouldIgnore(uri.fsPath)) {
					return;
				}
				// Only log if it's a protected file
				if (this.registry.isProtected(uri.fsPath)) {
					logger.info(`[SnapBack] Protected file changed: ${uri.fsPath}`);
				}
			}),
		);
	}

	/**
	 * Check if a file path should be ignored from monitoring
	 */
	private shouldIgnore(filePath: string): boolean {
		const patterns = ["/.git/", "/.snapback/", "/node_modules/", "/dist/", "/build/", "/.vscode/"];

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
