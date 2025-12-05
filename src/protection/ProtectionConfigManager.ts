import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { toError } from "../utils/errorHelpers.js";
import { logger } from "../utils/logger.js";
import { showStatusBarMessage } from "../utils/notifications.js";
import { ConfigFileManager } from "./ConfigFileManager.js";

export class ProtectionConfigManager {
	private configManager: ConfigFileManager;
	private fileWatcher: vscode.FileSystemWatcher | null = null;
	private reloadDebounceTimer: NodeJS.Timeout | null = null;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private workspaceRoot: string,
		private protectedFileRegistry: ProtectedFileRegistry,
	) {
		this.configManager = new ConfigFileManager(workspaceRoot);
	}

	/**
	 * Initialize: Load configs and set up file watching
	 */
	async initialize(): Promise<void> {
		// Ensure config files exist with sensible defaults
		await this.configManager.ensureConfigExists(
			"protected",
			this.getDefaultProtectedPatterns(),
		);
		await this.configManager.ensureConfigExists(
			"ignore",
			this.getDefaultIgnorePatterns(),
		);

		// Load and apply protection settings
		await this.loadAndApplyProtection();

		// Watch for config file changes
		this.setupConfigWatcher();
	}

	/**
	 * Load protected patterns and auto-protect matching files
	 */
	async loadAndApplyProtection(): Promise<void> {
		const protectedPatterns = await this.configManager.readConfig("protected");
		const ignorePatterns = await this.configManager.readConfig("ignore");

		if (protectedPatterns.length === 0) {
			return;
		}

		// Find all files matching protected patterns (excluding ignored patterns)
		const includeGlob = `{${protectedPatterns.join(",")}}`;
		const excludeGlob =
			ignorePatterns.length > 0 ? `{${ignorePatterns.join(",")}}` : undefined;

		const files = await vscode.workspace.findFiles(includeGlob, excludeGlob);

		// Add all matching files to protected registry
		for (const file of files) {
			await this.protectedFileRegistry.add(file.fsPath);
		}

		logger.info(`[SnapBack] Auto-protected ${files.length} files from config`);
	}

	/**
	 * Handle user protecting a file via context menu
	 */
	async handleProtectFile(filePath: string): Promise<void> {
		const relativePath = vscode.workspace.asRelativePath(filePath);

		// Check if file is in ignore list
		const isIgnored = await this.configManager.hasPattern(
			"ignore",
			relativePath,
		);

		if (isIgnored) {
			// Ask user to confirm removal from ignore
			const choice = await vscode.window.showWarningMessage(
				`"${relativePath}" is in .snapbackignore. Remove it from ignore list to protect?`,
				"Yes, Remove from Ignore",
				"Cancel",
			);

			if (choice !== "Yes, Remove from Ignore") {
				return;
			}

			await this.configManager.removePattern("ignore", relativePath);
		}

		// Add to protected config
		await this.configManager.addPattern("protected", relativePath);

		// Add to in-memory registry
		await this.protectedFileRegistry.add(filePath);

		showStatusBarMessage(`Protected: ${relativePath}`, "lock", 1000);
	}

	/**
	 * Handle user unprotecting a file via context menu
	 */
	async handleUnprotectFile(filePath: string): Promise<void> {
		const relativePath = vscode.workspace.asRelativePath(filePath);

		// Remove from protected config file (.snapbackprotected)
		await this.configManager.removePattern("protected", relativePath);

		// Remove from in-memory registry (MUST await for persistence)
		await this.protectedFileRegistry.remove(filePath);

		// Clear from O(1) lookup index by reloading
		await this.loadAndApplyProtection();

		showStatusBarMessage(`Unprotected: ${relativePath}`, "unlock", 1000);
	}

	/**
	 * Set up file system watcher for config file changes
	 */
	private setupConfigWatcher(): void {
		const pattern = new vscode.RelativePattern(
			this.workspaceRoot,
			".snapback{protected,ignore}",
		);

		this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		this.disposables.push(
			this.fileWatcher.onDidChange(async (_uri) => {
				logger.info("[SnapBack] Config file changed, reloading...");

				// Clear existing debounce timer
				if (this.reloadDebounceTimer) {
					clearTimeout(this.reloadDebounceTimer);
				}

				// Set new debounce timer (500ms)
				this.reloadDebounceTimer = setTimeout(async () => {
					try {
						await this.reloadProtection();
						showStatusBarMessage(
							"SnapBack: Protection settings reloaded",
							"sync",
							1000,
						);
					} catch (error) {
						logger.error(
							"[SnapBack] Error reloading protection:",
							toError(error),
						);
						showStatusBarMessage(
							"SnapBack: Error reloading protection settings",
							"error",
							1000,
						);
					}
				}, 500);
			}),
		);

		this.disposables.push(
			this.fileWatcher.onDidCreate(async (_uri) => {
				logger.info("[SnapBack] Config file created, loading...");
				await this.reloadProtection();
			}),
		);

		this.disposables.push(
			this.fileWatcher.onDidDelete(async (_uri) => {
				logger.info("[SnapBack] Config file deleted, clearing protection");
				await this.protectedFileRegistry.clearAll();
			}),
		);
	}

	/**
	 * Reload protection from config files
	 */
	private async reloadProtection(): Promise<void> {
		// Clear current protection
		await this.protectedFileRegistry.clearAll();

		// Reload from config
		await this.loadAndApplyProtection();
	}

	/**
	 * Default protected patterns for first-time setup
	 */
	private getDefaultProtectedPatterns(): string[] {
		return [
			"# Core configuration files",
			"package.json",
			"tsconfig.json",
			"",
			"# Environment files",
			".env",
			".env.*",
		];
	}

	/**
	 * Default ignore patterns for first-time setup
	 */
	private getDefaultIgnorePatterns(): string[] {
		return [
			"# Dependencies",
			"node_modules/**",
			"",
			"# Build outputs",
			"dist/**",
			"build/**",
			"*.vsix",
			"",
			"# Logs",
			"*.log",
		];
	}

	/**
	 * Cleanup watchers on extension deactivation
	 */
	dispose(): void {
		// Clear debounce timer to prevent memory leaks
		if (this.reloadDebounceTimer) {
			clearTimeout(this.reloadDebounceTimer);
			this.reloadDebounceTimer = null;
		}

		this.fileWatcher?.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
