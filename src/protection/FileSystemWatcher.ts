import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { logger } from "../utils/logger.js";

export class FileSystemWatcher {
	private watcher: vscode.FileSystemWatcher;
	private disposables: vscode.Disposable[] = [];

	constructor(private registry: ProtectedFileRegistry) {
		// Watch all files in workspace
		this.watcher = vscode.workspace.createFileSystemWatcher("**/*");

		// Handle file deletion
		this.disposables.push(
			this.watcher.onDidDelete((uri) => {
				if (this.registry.isProtected(uri.fsPath)) {
					logger.info(
						`[SnapBack] Protected file deleted, removing from registry: ${uri.fsPath}`,
					);
					this.registry.remove(uri.fsPath);
				}
			}),
		);

		// Handle file creation (to detect when a protected file is restored)
		this.disposables.push(
			this.watcher.onDidCreate((uri) => {
				// Could implement logic to handle file creation if needed
				logger.info(`[SnapBack] File created: ${uri.fsPath}`);
			}),
		);

		// Handle file changes (to detect when a protected file is modified)
		this.disposables.push(
			this.watcher.onDidChange((uri) => {
				// Could implement logic to handle file changes if needed
				logger.info(`[SnapBack] File changed: ${uri.fsPath}`);
			}),
		);
	}

	dispose(): void {
		this.watcher.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
