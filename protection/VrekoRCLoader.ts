import * as fs from "node:fs/promises";
import * as path from "node:path";
import { minimatch } from "minimatch";
import * as vscode from "vscode";
import { DEFAULT_VREKO_CONFIG } from "../config/defaultConfig";
// ServiceNotificationManager removed (Gate 2B)  -  notifications now use vscode.window directly
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
// Phase 2: Import protection policy infrastructure
import { ProtectionManager, type ProtectionPolicy } from "../services/protectionPolicy";
import { safeStringifyConfig } from "../types/config";
import type { ProtectionLevel } from "../types/protection";
import type { VrekoRC } from "../types/vrekorc.types";
import { logger } from "../utils/logger";

/**
 * VrekoRCLoader - Loads and applies .vrekorc configuration
 *
 * Ensures team-wide protection policies are synchronized via source control.
 * Delegates to the CLI daemon via DaemonBridge for configuration operations.
 *
 * @see DaemonBridge for the daemon RPC protocol
 */

/**
 * Loads and applies .vrekorc configuration to the protected file registry
 * Ensures team-wide protection policies are synchronized via source control
 *
 * Design Philosophy:
 * - Silent by default: No interruptions unless errors occur
 * - Automatic sync: Works invisibly in the background
 * - Status bar feedback: Non-intrusive indication of state
 * - Opt-in notifications: Users control visibility via settings
 */
export class VrekoRCLoader implements vscode.Disposable {
	private readonly configFileName = ".vrekorc";
	private watcher: vscode.FileSystemWatcher | null = null;
	private disposables: vscode.Disposable[] = [];
	private mergedConfig: VrekoRC | null = null;
	// Phase 2: Protection manager for policy computation
	private protectionManager: ProtectionManager | null = null;
	// Track parse errors so we can clear the notification when the user fixes the file
	private hadParseError = false;
	constructor(
		private readonly protectedFileRegistry: ProtectedFileRegistry,
		private readonly workspaceRoot: string,
	) {
		// Initialize ProtectionManager with lazy-loading config getter
		this.protectionManager = new ProtectionManager(protectedFileRegistry, () => this.mergedConfig);
	}

	/**
	 * Initialize: Load config and watch for changes (silent by default)
	 */
	async initialize(): Promise<void> {
		await this.loadAndApplyConfig(true);
		this.watchConfigFile();
	}

	/**
	 * Load .vrekorc and merge with defaults (NO side effects to registry)
	 * This is used during extension activation to prepare config without applying protection
	 * @returns void (stores result in this.mergedConfig)
	 */
	async loadConfig(): Promise<void> {
		const configPath = path.join(this.workspaceRoot, this.configFileName);

		try {
			const userConfig = await this.readConfig(configPath);
			// Merge: defaults first, user config overrides
			const mergedConfig = this.mergeConfigs(DEFAULT_VREKO_CONFIG, userConfig);
			// Store merged config for external access
			this.mergedConfig = mergedConfig;

			// If we previously had a parse error and now loaded successfully, clear the notification
			if (this.hadParseError) {
				this.hadParseError = false;
				logger.info(".vrekorc parse error resolved - config reloaded successfully");
				vscode.window.showInformationMessage(".vrekorc is now valid. Protection rules reloaded.");
			}

			if (!mergedConfig || !mergedConfig.protection || mergedConfig.protection.length === 0) {
				logger.debug("No protection rules found (no defaults or .vrekorc)");
				return;
			}

			// Fix: Accurately report config source based on whether user config was loaded
			const configSource = userConfig ? "defaults + .vrekorc" : "defaults only";
			logger.info(`Loaded ${mergedConfig.protection.length} protection rules (${configSource})`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				logger.debug(".vrekorc not found, using defaults only");
				return;
			}

			// Always log errors (they may be important for configuration)
			logger.error("Failed to load .vrekorc configuration", error as Error);
			// Note: We don't show notifications here - caller decides
		}
	}

	/**
	 * Apply protection rules from mergedConfig to registry
	 * This applies the protection patterns that were loaded by loadConfig()
	 * @param silent - If true, suppresses notifications (for background operations)
	 */
	async applyProtections(silent = false): Promise<void> {
		if (!this.mergedConfig || !this.mergedConfig.protection) {
			logger.debug("No merged config available to apply");
			return;
		}

		try {
			// Get all workspace files
			const ignorePatterns = this.mergedConfig.ignore || [];
			const workspaceFiles = await this.getAllWorkspaceFiles(ignorePatterns);

			// Apply protection rules to matching files
			let protectedCount = 0;
			for (const rule of this.mergedConfig.protection) {
				const matchingFiles = workspaceFiles.filter((file) => this.matchesPattern(file, rule.pattern));

				for (const filePath of matchingFiles) {
					await this.protectedFileRegistry.add(filePath, {
						protectionLevel: rule.level,
					});
					protectedCount++;
				}

				logger.debug(`Pattern "${rule.pattern}" matched ${matchingFiles.length} files (level: ${rule.level})`);
			}

			logger.info(`Applied protection to ${protectedCount} files`);

			// Only show notification if user has opted in via settings
			if (!silent && this.shouldShowNotifications()) {
				vscode.window
					.showInformationMessage(`🦎 Vreko: Protected ${protectedCount} files`, "View Protected Files")
					.then((choice) => {
						if (choice === "View Protected Files") {
							vscode.commands.executeCommand("vreko.showAllProtectedFiles");
						}
					});
			}
		} catch (error) {
			// Always show errors (even in silent mode) because they need user attention
			logger.error("Failed to apply protections", error as Error);
			vscode.window
				.showWarningMessage(`⚠️ Vreko: Failed to apply protections: ${(error as Error).message}`, "View Logs")
				.then((choice) => {
					if (choice === "View Logs") {
						vscode.commands.executeCommand("workbench.action.output.toggleOutput", "Vreko");
					}
				});
		}
	}

	dispose(): void {
		this.watcher?.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		// Phase 2: Clean up ProtectionManager if needed
		this.protectionManager = null;
	}

	/**
	 * Load .vrekorc and apply protection rules to all matching files
	 * This is the main method that coordinates loading and applying in one operation
	 * Precedence (lowest to highest): defaults < .vrekorc
	 * User .vrekorc overrides canonical defaults
	 * @param silent - If true, suppresses all notifications (for automatic background sync)
	 */
	async loadAndApplyConfig(silent = false): Promise<void> {
		await this.loadConfig();
		await this.applyProtections(silent);
	}

	/**
	 * Merge canonical defaults with user .vrekorc configuration
	 * Precedence: defaults < user config (user overrides defaults)
	 * For protection rules: user rules override defaults with same pattern
	 * For other config: user settings extend/override defaults
	 */
	private mergeConfigs(defaults: VrekoRC, userConfig: VrekoRC | null): VrekoRC {
		if (!userConfig) {
			return defaults;
		}

		// Merge protection rules: defaults + user overrides
		const mergedProtection = [...(defaults.protection || [])];

		if (userConfig.protection && userConfig.protection.length > 0) {
			for (const userRule of userConfig.protection) {
				// Find if this pattern already exists in defaults
				const existingIndex = mergedProtection.findIndex((rule) => rule.pattern === userRule.pattern);

				if (existingIndex >= 0) {
					// Override existing default rule with user's version
					mergedProtection[existingIndex] = userRule;
				} else {
					// Add new user-defined rule
					mergedProtection.push(userRule);
				}
			}
		}

		return {
			protection: mergedProtection,
			ignore: userConfig.ignore || defaults.ignore,
			settings: { ...defaults.settings, ...userConfig.settings },
			policies: { ...defaults.policies, ...userConfig.policies },
			hooks: { ...defaults.hooks, ...userConfig.hooks },
			templates: userConfig.templates || defaults.templates,
		};
	}

	/**
	 * Get the merged configuration (defaults + .vrekorc)
	 * Returns null if no config has been loaded yet
	 */
	getMergedConfig(): VrekoRC | null {
		return this.mergedConfig;
	}

	/**
	 * Get the effective protection policy (Phase 2)
	 * Wraps the merged config in a ProtectionPolicy object with metadata
	 *
	 * @returns Effective protection policy or null if no config loaded
	 */
	getEffectivePolicy(): Promise<ProtectionPolicy | null> {
		if (!this.protectionManager) {
			return Promise.resolve(null);
		}
		return this.protectionManager.getEffectivePolicy();
	}

	/**
	 * Get the ProtectionManager instance (Phase 2)
	 * Allows external code to query repo protection status
	 *
	 * @returns The ProtectionManager instance
	 */
	getProtectionManager(): ProtectionManager | null {
		return this.protectionManager;
	}

	/**
	 * Check if user wants to see config sync notifications
	 */
	private shouldShowNotifications(): boolean {
		const config = vscode.workspace.getConfiguration("vreko");
		return config.get<boolean>("notifications.showConfigSync", false);
	}

	/**
	 * Read and parse .vrekorc file
	 * P1 UX: Shows actionable notification on parse errors with "Open & Fix" action
	 */
	private async readConfig(configPath: string): Promise<VrekoRC | null> {
		let content = "";

		try {
			content = await fs.readFile(configPath, "utf-8");

			// Remove comments and parse JSON5/JSONC
			const cleanedContent = this.removeComments(content);
			const config = JSON.parse(cleanedContent) as VrekoRC;

			return config;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return null;
			}

			// P1 UX: Handle JSON parse errors with actionable notification
			if (error instanceof SyntaxError) {
				this.hadParseError = true;
				this.showConfigParseErrorNotification(configPath, content, error);
				return null; // Return null to use defaults, don't throw
			}

			throw error;
		}
	}

	/**
	 * P1 UX: Show user-friendly notification for config parse errors.
	 * Uses NotificationManager for consistent cooldown and deduplication.
	 * Includes line/column info and "Open & Fix" action.
	 */
	private async showConfigParseErrorNotification(
		configPath: string,
		content: string,
		error: SyntaxError,
	): Promise<void> {
		// Extract position from JSON parse error message
		// Common formats: "at position 123", "at line 5 column 10"
		const { line, column } = this.extractErrorPosition(error.message, content);

		const locationInfo = line > 0 ? ` (line ${line}, col ${column})` : "";

		// 🆕 P0 FIX: Extract problematic content snippet (10-char window) for debugging
		// This helps users understand exactly what's wrong without exposing entire file
		const problemSnippet = this.extractProblemSnippet(content, line, column);

		// Enhanced error logging with all requested fields
		logger.error("Config error - user config unusable", {
			userConfigPath: configPath,
			reason: `JSON syntax error at line ${line}`,
			fallback: "using default rules",
			userNotified: true,
			suggestedFix: this.getSuggestedFix(error.message, problemSnippet),
			snippet: problemSnippet,
			line,
			column,
		});

		// Log policy precedence for clarity
		logger.info("Config precedence: Using default policy (.vrekorc invalid)");

		// Check whether a valid backup exists so we can offer one-click restore.
		// We re-validate the backup as JSON here so we never offer a broken restore.
		const backupPath = `${configPath}.backup`;
		let hasValidBackup = false;
		try {
			const backupContent = await fs.readFile(backupPath, "utf-8");
			JSON.parse(backupContent);
			hasValidBackup = true;
		} catch {
			// No backup file, or backup is also corrupt  -  skip restore option
		}

		const actions: string[] = hasValidBackup
			? ["Restore from backup", "Open & Fix", "View Logs"]
			: ["Open & Fix", "View Logs"];

		const choice = await vscode.window.showWarningMessage(
			`.vrekorc has invalid JSON${locationInfo}. Using default protection policy.`,
			...actions,
		);

		switch (choice) {
			case "Restore from backup":
				await this.restoreFromBackup(configPath, backupPath);
				break;
			case "Open & Fix":
				this.openConfigAtError(configPath, line, column);
				break;
			case "View Logs":
				vscode.commands.executeCommand("workbench.action.output.toggleOutput", "Vreko");
				break;
		}
	}

	/**
	 * Extract line and column from JSON parse error message
	 */
	private extractErrorPosition(errorMessage: string, content: string): { line: number; column: number } {
		// Try to extract "at position X" format
		const positionMatch = errorMessage.match(/position\s+(\d+)/i);
		if (positionMatch) {
			const position = Number.parseInt(positionMatch[1], 10);
			return this.offsetToLineColumn(content, position);
		}

		// Try to extract "at line X column Y" format
		const lineColMatch = errorMessage.match(/line\s+(\d+)\s+column\s+(\d+)/i);
		if (lineColMatch) {
			return {
				line: Number.parseInt(lineColMatch[1], 10),
				column: Number.parseInt(lineColMatch[2], 10),
			};
		}

		// Default to start of file if we can't parse
		return { line: 1, column: 1 };
	}

	/**
	 * Convert character offset to line/column
	 */
	private offsetToLineColumn(content: string, offset: number): { line: number; column: number } {
		const lines = content.substring(0, offset).split("\n");
		const line = lines.length;
		const column = (lines[lines.length - 1]?.length ?? 0) + 1;
		return { line, column };
	}

	/**
	 * Suggest a fix based on the error message and problematic snippet
	 */
	private getSuggestedFix(errorMessage: string, snippet: string): string {
		// Common JSON errors
		if (errorMessage.includes("Unexpected token") || errorMessage.includes("Expected")) {
			if (snippet.includes('"') && !snippet.includes(":")) {
				return "Add colon after property name";
			}
			if (snippet.includes(":") && snippet.endsWith(",")) {
				return "Remove trailing comma";
			}
			if (snippet.includes("{") || snippet.includes("[")) {
				return "Check for missing closing bracket";
			}
		}
		if (errorMessage.includes("Unterminated string")) {
			return "Add closing quote for string";
		}
		return "Check JSON syntax";
	}

	/**
	 * Extract a snippet of problematic content around the error location.
	 * Shows ~10 characters before and after the error position for context.
	 *
	 * @param content - Full file content
	 * @param line - Error line number (1-based)
	 * @param column - Error column number (1-based)
	 * @returns Formatted snippet with error indicator
	 */
	private extractProblemSnippet(content: string, line: number, column: number): string {
		if (line < 1 || column < 1) {
			return "<location unknown>";
		}

		try {
			const lines = content.split("\n");
			if (line > lines.length) {
				return "<line out of bounds>";
			}

			const errorLine = lines[line - 1] || "";
			const errorPos = Math.max(0, column - 1);

			// Extract 10 chars before and after error position
			const snippetStart = Math.max(0, errorPos - 10);
			const snippetEnd = Math.min(errorLine.length, errorPos + 10);
			const snippet = errorLine.substring(snippetStart, snippetEnd);

			// Calculate caret position within the snippet
			const caretPos = errorPos - snippetStart;

			// Format with indicator: "...some content^here..."
			const before = snippet.substring(0, caretPos);
			const after = snippet.substring(caretPos);

			// Escape special characters for logging
			const escaped = `${before}^${after}`.replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n");

			return escaped;
		} catch (_err) {
			return "<snippet extraction failed>";
		}
	}

	/**
	 * Restore .vrekorc from its last known-good backup.
	 *
	 * Uses an atomic tmp → rename write so a crash mid-write never leaves the
	 * file in a half-written state. The filesystem watcher (onDidChange) fires
	 * after the rename and triggers a silent config reload automatically.
	 */
	private async restoreFromBackup(configPath: string, backupPath: string): Promise<void> {
		try {
			const backupContent = await fs.readFile(backupPath, "utf-8");
			// Re-validate before writing  -  guard against backup being corrupted
			// between the initial check and the user clicking the button
			JSON.parse(backupContent);

			const tmpPath = `${configPath}.tmp`;
			await fs.writeFile(tmpPath, backupContent, "utf-8");
			await fs.rename(tmpPath, configPath);

			logger.info("Restored .vrekorc from backup", { configPath, backupPath });
			vscode.window.showInformationMessage(".vrekorc restored from backup. Protection rules reloaded.");
		} catch (err) {
			logger.error("Failed to restore .vrekorc from backup", {
				configPath,
				backupPath,
				error: err instanceof Error ? err.message : String(err),
			});
			vscode.window.showErrorMessage("Failed to restore .vrekorc from backup. Please fix it manually.");
		}
	}

	/**
	 * Open config file at the error location
	 */
	private openConfigAtError(configPath: string, line: number, column: number): void {
		vscode.workspace.openTextDocument(configPath).then(
			(doc) => {
				const position = new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1));
				const selection = new vscode.Selection(position, position);
				vscode.window.showTextDocument(doc, {
					selection,
					preview: false,
				});
			},
			(err) => {
				logger.error("Failed to open config file", err);
				// Fallback: just open the file without positioning
				vscode.commands.executeCommand("vscode.open", vscode.Uri.file(configPath));
			},
		);
	}

	/**
	 * Remove JavaScript-style comments from JSON content
	 */
	private removeComments(content: string): string {
		// Remove single-line comments
		let cleaned = content.replace(/\/\/.*$/gm, "");

		// Remove multi-line comments
		cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");

		return cleaned;
	}

	/**
	 * Get all files in workspace, excluding ignore patterns
	 */
	private async getAllWorkspaceFiles(ignorePatterns: string[]): Promise<string[]> {
		const defaultIgnores = [
			"**/node_modules/**",
			"**/.git/**",
			"**/.vreko/**",
			"**/dist/**",
			"**/build/**",
			"**/*.log",
		];

		const allIgnores = [...defaultIgnores, ...ignorePatterns];

		// Use VSCode's file search API
		const files = await vscode.workspace.findFiles("**/*", `{${allIgnores.join(",")}}`);

		return files.map((uri) => uri.fsPath);
	}

	/**
	 * Check if file path matches glob pattern
	 */
	private matchesPattern(filePath: string, pattern: string): boolean {
		const relativePath = path.relative(this.workspaceRoot, filePath);

		try {
			return minimatch(relativePath, pattern, {
				dot: true,
				windowsPathsNoEscape: true,
			});
		} catch (error) {
			logger.warn(`Failed to match pattern "${pattern}"`, error instanceof Error ? error.message : error);
			return false;
		}
	}

	/**
	 * Add a protection rule to .vrekorc
	 * Also immediately updates the registry and triggers decoration refresh
	 */
	async addProtectionRule(filePath: string, level: string, reason?: string): Promise<void> {
		const configPath = path.join(this.workspaceRoot, this.configFileName);
		const relativePath = path.relative(this.workspaceRoot, filePath);

		try {
			let config = await this.readConfig(configPath);

			// Create new config if it doesn't exist
			if (!config) {
				config = {
					protection: [...(DEFAULT_VREKO_CONFIG.protection || [])],
					ignore: ["**/node_modules/**", "**/.git/**", "**/.vreko/**", "**/dist/**", "**/build/**"],
				};
			}

			// Ensure protection array exists
			if (!config.protection) {
				config.protection = [];
			}

			// Check if rule already exists for this file
			const existingIndex = config.protection.findIndex((rule) => rule.pattern === relativePath);

			const newRule = {
				pattern: relativePath,
				level: level as ProtectionLevel,
				...(reason && { reason }),
			};

			if (existingIndex >= 0) {
				// Update existing rule
				config.protection[existingIndex] = newRule;
			} else {
				// Add new rule
				config.protection.push(newRule);
			}

			// Write back to file
			await this.writeConfig(configPath, config);
			logger.info(`Added protection rule to .vrekorc: ${relativePath} (${level})`);

			// CRITICAL FIX: Immediately update registry to trigger decoration refresh
			// This ensures UI updates instantly without waiting for file watcher
			const isProtected = this.protectedFileRegistry.isProtected(filePath);
			if (isProtected) {
				// File already protected - update level
				await this.protectedFileRegistry.updateProtectionLevel(filePath, level as ProtectionLevel);
			} else {
				// File not protected - add it
				await this.protectedFileRegistry.add(filePath, {
					protectionLevel: level as ProtectionLevel,
				});
			}
		} catch (error) {
			logger.error("Failed to add protection rule to .vrekorc", error as Error);
			throw error;
		}
	}

	/**
	 * Initialize .vrekorc with default protection rules
	 * Used by "Apply Protection Defaults" command
	 */
	async initializeWithDefaults(overwrite = false): Promise<void> {
		const configPath = path.join(this.workspaceRoot, this.configFileName);

		try {
			// Check if config already exists
			if (!overwrite) {
				const existing = await this.readConfig(configPath);
				if (existing) {
					logger.info(".vrekorc already exists, skipping initialization");
					return;
				}
			}

			// Create config with defaults
			const config: VrekoRC = {
				protection: [...(DEFAULT_VREKO_CONFIG.protection || [])],
				ignore: [...(DEFAULT_VREKO_CONFIG.ignore || [])],
				settings: { ...DEFAULT_VREKO_CONFIG.settings },
			};

			await this.writeConfig(configPath, config);
			logger.info("Initialized .vrekorc with default protection rules");
		} catch (error) {
			logger.error("Failed to initialize .vrekorc with defaults", error as Error);
			throw error;
		}
	}

	/**
	 * Remove a protection rule from .vrekorc
	 */
	async removeProtectionRule(filePath: string): Promise<void> {
		const configPath = path.join(this.workspaceRoot, this.configFileName);
		const relativePath = path.relative(this.workspaceRoot, filePath);

		try {
			const config = await this.readConfig(configPath);

			if (!config || !config.protection) {
				return;
			}

			// Remove rule matching the file path
			config.protection = config.protection.filter((rule) => rule.pattern !== relativePath);

			// Write back to file
			await this.writeConfig(configPath, config);
			logger.info(`Removed protection rule from .vrekorc: ${relativePath}`);
		} catch (error) {
			logger.error("Failed to remove protection rule from .vrekorc", error as Error);
			throw error;
		}
	}

	/**
	 * Write config back to file with validation
	 */
	private async writeConfig(configPath: string, config: VrekoRC): Promise<void> {
		const result = safeStringifyConfig(config, 2);
		if (!result.success || !result.json) {
			throw new Error(`Failed to serialize config: ${result.errors?.join(", ") ?? "Unknown error"}`);
		}
		await fs.writeFile(configPath, result.json, "utf-8");
	}

	/**
	 * Watch .vrekorc for changes and reload (silent background sync)
	 * Public method so it can be called separately from loadConfig()
	 */
	watchConfigFile(): void {
		const pattern = new vscode.RelativePattern(this.workspaceRoot, this.configFileName);
		this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

		// Reload on config file changes (silent)
		this.disposables.push(
			this.watcher.onDidChange(async () => {
				logger.debug(".vrekorc changed, reloading protection rules");
				await this.loadAndApplyConfig(true); // Silent reload
			}),
		);

		// Reload on config file creation (silent)
		this.disposables.push(
			this.watcher.onDidCreate(async () => {
				logger.info(".vrekorc created, loading protection rules");
				await this.loadAndApplyConfig(true); // Silent reload
			}),
		);

		// Log when config is deleted but keep existing protections
		// This allows users to work offline or switch branches without disruption
		this.disposables.push(
			this.watcher.onDidDelete(() => {
				logger.debug(".vrekorc deleted, keeping existing protections");
			}),
		);
	}
}
