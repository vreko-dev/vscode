import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import Ajv from "ajv";
import { glob } from "fast-glob";
import * as JSON5 from "json5";
import { minimatch } from "minimatch";
import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import type { ProtectionLevel } from "../types/protection";
import type { SnapshotTemplate, VrekoHooks, VrekoPolicies, VrekoRC, VrekoSettings } from "../types/vrekorc.types";
import { VREKORC_SCHEMA } from "../types/vrekorc.types";
import { logger } from "../utils/logger";
import { DEFAULT_IGNORE_PATTERNS, DEFAULT_VREKO_CONFIG } from "./defaultConfig";

type ConfigManagerEvents = "configLoaded" | "configDeleted";

export interface ConfigurationManagerOptions {
	onProtectionApplied?: (paths: string[]) => void;
}

export class ConfigurationManager extends EventEmitter {
	private config: VrekoRC | null = null;
	private readonly configPath: string;
	private watcher: vscode.FileSystemWatcher | null = null;
	private readonly ajv = new Ajv({ useDefaults: true });
	private readonly validate = this.ajv.compile(VREKORC_SCHEMA);
	private managedPaths = new Set<string>();

	constructor(
		private readonly workspaceRoot: string,
		readonly _context: vscode.ExtensionContext,
		private readonly protectedFileRegistry: ProtectedFileRegistry,
		private readonly options: ConfigurationManagerOptions = {},
	) {
		super();
		this.configPath = path.join(workspaceRoot, ".vrekorc");
	}

	async initialize(): Promise<void> {
		await this.load();
		this.setupWatcher();
	}

	async load(): Promise<VrekoRC> {
		try {
			const config = await this.loadVrekoRC();
			if (config) {
				await this.applyProtection(config);
				this.config = config;
				this.emitConfig("configLoaded", config);
				return config;
			}

			// No .vrekorc found, use default configuration
			const defaultConfig = this.getDefaultConfiguration();
			await this.applyProtection(defaultConfig);
			this.config = defaultConfig;
			this.emitConfig("configLoaded", defaultConfig);
			return defaultConfig;
		} catch (error) {
			logger.error("Configuration load error:", error instanceof Error ? error : undefined);
			const defaults = await this.applyDefaultConfiguration();
			this.config = defaults;
			return defaults;
		}
	}

	getProtectionLevel(filePath: string): ProtectionLevel | null {
		const current = this.config;
		if (!current?.protection) {
			return current?.settings?.defaultProtectionLevel ?? null;
		}

		for (const rule of current.protection) {
			if (minimatch(filePath, rule.pattern, { dot: true })) {
				return rule.level;
			}
		}

		return current.settings?.defaultProtectionLevel ?? null;
	}

	shouldIgnore(filePath: string): boolean {
		const patterns = this.config?.ignore ?? DEFAULT_IGNORE_PATTERNS;
		return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
	}

	getSetting<K extends keyof VrekoSettings>(key: K): VrekoSettings[K] | undefined {
		return this.config?.settings?.[key];
	}

	getPolicy<K extends keyof VrekoPolicies>(key: K): VrekoPolicies[K] | undefined {
		return this.config?.policies?.[key];
	}

	getHooks(): VrekoHooks | undefined {
		return this.config?.hooks;
	}

	getTemplates(): SnapshotTemplate[] | undefined {
		return this.config?.templates;
	}

	dispose(): void {
		this.watcher?.dispose();
		this.removeAllListeners();
	}

	private emitConfig(event: ConfigManagerEvents, config?: VrekoRC): void {
		if (event === "configLoaded" && config) {
			this.emit(event, config);
			return;
		}

		this.emit(event);
	}

	private async loadVrekoRC(): Promise<VrekoRC | null> {
		try {
			// Find all .vrekorc files recursively in the workspace
			const configFiles = await glob("**/.vrekorc", {
				cwd: this.workspaceRoot,
				absolute: true,
				ignore: ["**/node_modules/**", "**/.git/**"],
			});

			// If no config files found, return null to use defaults
			if (configFiles.length === 0) {
				return null;
			}

			// FIXED: Sort by depth (deepest first) for nearest-up-wins precedence
			const sortedConfigs = configFiles
				.map((file) => ({
					path: file,
					depth: file.split(path.sep).length,
				}))
				.sort((a, b) => b.depth - a.depth); // Deepest first

			// Debug logging for config precedence visualization
			logger.debug("Config merge precedence (deepest first):", {
				configs: sortedConfigs.map((c) => ({
					path: path.relative(this.workspaceRoot, c.path),
					depth: c.depth,
				})),
			});

			// Load and merge all config files (nearest-up-wins precedence)
			let mergedConfig: VrekoRC = {};

			// Process from shallowest to deepest (deepest configs override shallower ones)
			// Reverse the sorted configs so that deeper configs override shallower ones
			for (const { path: configFile } of sortedConfigs.reverse()) {
				try {
					const content = await fs.readFile(configFile, "utf8");
					const parsed = JSON5.parse(content);

					const isValid = this.validate(parsed);
					if (!isValid) {
						const errors = this.validate.errors
							?.map(
								(validationError: { instancePath?: string; message?: string }) =>
									`${validationError.instancePath || "(root)"}: ${validationError.message}`,
							)
							.join(", ");

						vscode.window
							.showErrorMessage(
								`Invalid .vrekorc configuration in ${path.relative(
									this.workspaceRoot,
									configFile,
								)}: ${errors}`,
								"Open File",
								"Use Defaults",
							)
							.then((choice) => {
								if (choice === "Open File") {
									vscode.workspace
										.openTextDocument(configFile)
										.then((doc) => vscode.window.showTextDocument(doc));
								}
							});
						continue; // Skip invalid config but continue processing others
					}

					// Debug logging for each config being processed
					logger.debug(`Processing config file: ${path.relative(this.workspaceRoot, configFile)}`);

					// Merge with existing config (deeper configs override shallower ones)
					mergedConfig = this.deepMergeConfigs(mergedConfig, parsed as VrekoRC, configFile);
				} catch (fileError) {
					const fileErr = fileError as NodeJS.ErrnoException;
					if (fileErr.message?.includes("JSON")) {
						this.showSyntaxError(fileErr, configFile);
					} else {
						logger.error(`Error loading config file ${configFile}:`, fileErr);
					}
					// Continue with other config files even if one fails
				}
			}

			// Debug logging for final merged config
			logger.debug("Final merged configuration:", {
				protectionCount: mergedConfig.protection?.length,
				ignoreCount: mergedConfig.ignore?.length,
				hasSettings: !!mergedConfig.settings,
				hasPolicies: !!mergedConfig.policies,
				hasHooks: !!mergedConfig.hooks,
				hasTemplates: !!mergedConfig.templates,
			});

			return mergedConfig.protection ||
				mergedConfig.ignore ||
				mergedConfig.settings ||
				mergedConfig.policies ||
				mergedConfig.hooks ||
				mergedConfig.templates
				? this.mergeWithDefaults(mergedConfig)
				: null;
		} catch (error) {
			logger.error("Error loading .vrekorc configurations:", error instanceof Error ? error : undefined);
			return null;
		}
	}

	private setupWatcher(): void {
		const pattern = new vscode.RelativePattern(this.workspaceRoot, ".vrekorc");
		this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

		this.watcher.onDidChange(async () => {
			logger.info(".vrekorc changed, reloading configuration...");
			await this.loadAndApplySafe();
		});

		this.watcher.onDidCreate(async () => {
			logger.info(".vrekorc created, loading configuration...");
			await this.loadAndApplySafe();
		});

		this.watcher.onDidDelete(() => {
			logger.info(".vrekorc removed, falling back to defaults.");
			this.applyDefaultConfiguration()
				.then((defaults) => {
					this.config = defaults;
					this.emit("configDeleted");
				})
				.catch((error) => {
					logger.error("Failed to apply default configuration:", error);
				});
		});
	}

	private async loadAndApplySafe(): Promise<void> {
		try {
			await this.load();
		} catch (error) {
			logger.error("Failed to reload configuration:", error instanceof Error ? error : undefined);
			await this.applyDefaultConfiguration();
		}
	}

	private async applyProtection(config: VrekoRC): Promise<void> {
		if (this.managedPaths.size > 0) {
			const removals = Array.from(this.managedPaths).map(async (pathToRemove) => {
				try {
					await this.protectedFileRegistry.remove(pathToRemove);
				} catch (error) {
					logger.warn("Failed to remove managed path during config reload:", {
						path: pathToRemove,
						error,
					});
				}
			});
			await Promise.all(removals);
			this.managedPaths.clear();
		}

		const ignorePatterns = config.ignore ?? DEFAULT_IGNORE_PATTERNS;
		const ignoreGlob = ignorePatterns.length > 0 ? `{${ignorePatterns.join(",")}}` : undefined;

		const protectedPaths: string[] = [];

		if (config.protection?.length) {
			for (const rule of config.protection) {
				const files = (await vscode.workspace.findFiles(rule.pattern, ignoreGlob)) || [];

				for (const file of files) {
					await this.protectedFileRegistry.add(file.fsPath, {
						protectionLevel: rule.level,
					});
					protectedPaths.push(file.fsPath);
					this.managedPaths.add(file.fsPath);
				}
			}
		}

		if (protectedPaths.length > 0 && this.options.onProtectionApplied) {
			this.options.onProtectionApplied(protectedPaths);
		}
	}

	private async applyDefaultConfiguration(): Promise<VrekoRC> {
		const defaults = this.getDefaultConfiguration();
		await this.applyProtection(defaults);
		this.emitConfig("configLoaded", defaults);
		return defaults;
	}

	private getDefaultConfiguration(): VrekoRC {
		// Return a deep copy to avoid mutations
		return JSON.parse(JSON.stringify(DEFAULT_VREKO_CONFIG));
	}

	private mergeWithDefaults(config: Partial<VrekoRC>): VrekoRC {
		const defaults = this.getDefaultConfiguration();

		return {
			protection: config.protection ?? defaults.protection,
			ignore: config.ignore ?? defaults.ignore,
			settings: {
				...defaults.settings,
				...config.settings,
			},
			policies: {
				...defaults.policies,
				...config.policies,
			},
			hooks: {
				...defaults.hooks,
				...config.hooks,
			},
			templates: config.templates ?? defaults.templates,
		};
	}

	/**
	 * Deep merge two configuration objects with provenance tracking
	 * @param base The base configuration
	 * @param override The configuration to merge on top
	 * @param overridePath The path of the override config file (for logging/provenance)
	 * @returns Merged configuration
	 */
	private deepMergeConfigs(base: VrekoRC, override: VrekoRC, overridePath: string): VrekoRC {
		// Debug logging for merge operation
		logger.debug(`Merging config from ${path.relative(this.workspaceRoot, overridePath)}`, {
			overrideProtectionCount: override.protection?.length,
			baseProtectionCount: base.protection?.length,
			hasOverrideSettings: !!override.settings,
			hasBaseSettings: !!base.settings,
		});

		const result = {
			protection: this.deepMergeProtections(base.protection, override.protection, overridePath),
			ignore: this.deepMergeIgnore(base.ignore, override.ignore),
			settings: this.deepMergeSettings(base.settings, override.settings),
			policies: this.deepMergePolicies(base.policies, override.policies),
			hooks: this.deepMergeHooks(base.hooks, override.hooks),
			templates: this.deepMergeTemplates(base.templates, override.templates),
		};

		// Debug logging for merged result
		logger.debug(`Merge result from ${path.relative(this.workspaceRoot, overridePath)}`, {
			resultProtectionCount: result.protection?.length,
		});

		return result;
	}

	/**
	 * Deep merge protection rules with last-one-wins per pattern and provenance tracking
	 * @param base The base protection rules
	 * @param override The override protection rules
	 * @param overridePath The path of the override config file (for provenance tracking)
	 * @returns Merged protection rules
	 */
	private deepMergeProtections(
		base: VrekoRC["protection"],
		override: VrekoRC["protection"],
		overridePath: string,
	): VrekoRC["protection"] {
		if (!override) {
			return base;
		}

		if (!base) {
			// Add provenance to all override rules
			return override.map((rule) => ({
				...rule,
				_provenance: overridePath,
			}));
		}

		// Create a map of existing patterns for efficient lookup
		const protectionMap = new Map<string, NonNullable<VrekoRC["protection"]>[number]>();
		for (const rule of base) {
			protectionMap.set(rule.pattern, { ...rule });
		}

		// Apply override rules with provenance tracking
		for (const rule of override) {
			protectionMap.set(rule.pattern, {
				...rule,
				_provenance: overridePath,
			});
		}

		// Convert back to array
		return Array.from(protectionMap.values());
	}

	/**
	 * Deep merge ignore patterns with union and deduplication
	 * @param base The base ignore patterns
	 * @param override The override ignore patterns
	 * @returns Merged ignore patterns
	 */
	private deepMergeIgnore(base: VrekoRC["ignore"], override: VrekoRC["ignore"]): VrekoRC["ignore"] {
		if (!override) {
			return base;
		}

		if (!base) {
			return override;
		}

		// Create a set for deduplication
		const ignoreSet = new Set([...base, ...override]);
		return Array.from(ignoreSet);
	}

	/**
	 * Deep merge settings with more restrictive wins
	 * @param base The base settings
	 * @param override The override settings
	 * @returns Merged settings
	 */
	private deepMergeSettings(base: VrekoRC["settings"], override: VrekoRC["settings"]): VrekoRC["settings"] {
		if (!override) {
			return base;
		}

		if (!base) {
			return override;
		}

		// Use the existing merge logic from the merge.ts file
		const result: Record<string, unknown> = { ...base };

		for (const [key, value] of Object.entries(override)) {
			if (key === "defaultProtectionLevel" && base[key as keyof VrekoSettings]) {
				// For protection levels, more restrictive wins
				const baseLevel = base[key as keyof VrekoSettings];
				const overrideLevel = value;
				// Assuming the order is Watched < Warning < Protected
				const levelPriority: Record<string, number> = {
					Watched: 1,
					Warning: 2,
					Protected: 3,
				};
				const basePriority = levelPriority[baseLevel as string] || 0;
				const overridePriority = levelPriority[overrideLevel as string] || 0;

				if (overridePriority > basePriority) {
					result[key] = value;
				}
			} else if (
				key === "maxSnapshots" &&
				typeof base[key as keyof VrekoSettings] === "number" &&
				typeof value === "number"
			) {
				// For numbers, lower values are more restrictive
				result[key] = Math.min(base[key as keyof VrekoSettings] as number, value);
			} else if (typeof value === "boolean" && typeof base[key as keyof VrekoSettings] === "boolean") {
				// For booleans, true is generally more restrictive
				result[key] = (base[key as keyof VrekoSettings] as boolean) || value;
			} else {
				// Default: override wins
				result[key] = value;
			}
		}

		return result as VrekoRC["settings"];
	}

	/**
	 * Deep merge policies with more restrictive wins
	 * @param base The base policies
	 * @param override The override policies
	 * @returns Merged policies
	 */
	private deepMergePolicies(base: VrekoRC["policies"], override: VrekoRC["policies"]): VrekoRC["policies"] {
		if (!override) {
			return base;
		}

		if (!base) {
			return override;
		}

		// Use the existing merge logic from the merge.ts file
		const result: Record<string, unknown> = { ...base };

		for (const [key, value] of Object.entries(override)) {
			if (key === "minimumProtectionLevel" && base[key as keyof VrekoPolicies]) {
				// For protection levels, more restrictive wins
				const baseLevel = base[key as keyof VrekoPolicies];
				const overrideLevel = value;
				// Assuming the order is Watched < Warning < Protected
				const levelPriority: Record<string, number> = {
					Watched: 1,
					Warning: 2,
					Protected: 3,
				};
				const basePriority = levelPriority[baseLevel as string] || 0;
				const overridePriority = levelPriority[overrideLevel as string] || 0;

				if (overridePriority > basePriority) {
					result[key] = value;
				}
			} else if (key === "enforceProtectionLevels" || key === "allowOverrides") {
				// For booleans, true is generally more restrictive for enforce, false for allow
				if (key === "enforceProtectionLevels") {
					result[key] = (base[key as keyof VrekoPolicies] as boolean) || value; // true wins
				} else {
					result[key] = (base[key as keyof VrekoPolicies] as boolean) && value; // false wins (more restrictive)
				}
			} else {
				// Default: override wins
				result[key] = value;
			}
		}

		return result as VrekoRC["policies"];
	}

	/**
	 * Deep merge hooks (simple override)
	 * @param base The base hooks
	 * @param override The override hooks
	 * @returns Merged hooks
	 */
	private deepMergeHooks(base: VrekoRC["hooks"], override: VrekoRC["hooks"]): VrekoRC["hooks"] {
		if (!override) {
			return base;
		}

		if (!base) {
			return override;
		}

		return {
			...base,
			...override,
		};
	}

	/**
	 * Deep merge templates (simple override)
	 * @param base The base templates
	 * @param override The override templates
	 * @returns Merged templates
	 */
	private deepMergeTemplates(base: VrekoRC["templates"], override: VrekoRC["templates"]): VrekoRC["templates"] {
		// Templates are simply overridden
		return override ?? base;
	}

	private showSyntaxError(error: NodeJS.ErrnoException, configPath?: string): void {
		const filePath = configPath || this.configPath;
		const fileName = path.relative(this.workspaceRoot, filePath);

		// Extract position information from error message
		const { line, column, suggestion } = this.extractErrorDetails(error.message);

		const location = line ? ` at line ${line}, column ${column}` : "";
		const hint = suggestion ? `\n\n💡 ${suggestion}` : "";

		vscode.window
			.showErrorMessage(`⚠️ ${fileName} has invalid JSON${location}.${hint}`, "Fix Now", "Show Output")
			.then(async (choice) => {
				if (choice === "Show Output") {
					// Show output channel with detailed error info
					const outputChannel = vscode.window.createOutputChannel("Vreko Config");
					outputChannel.appendLine(`Configuration Error in ${fileName}:`);
					outputChannel.appendLine(`  Error: ${error.message}`);
					if (line) {
						outputChannel.appendLine(`  Line: ${line}`);
					}
					if (column) {
						outputChannel.appendLine(`  Column: ${column}`);
					}
					if (suggestion) {
						outputChannel.appendLine(`  Suggestion: ${suggestion}`);
					}
					outputChannel.appendLine("");
					outputChannel.appendLine("Falling back to default configuration.");
					outputChannel.show();
				} else if (choice === "Fix Now") {
					const doc = await vscode.workspace.openTextDocument(filePath);
					const editor = await vscode.window.showTextDocument(doc);

					// Navigate to error position if available
					if (typeof line === "number" && typeof column === "number") {
						const position = new vscode.Position(line - 1, column - 1);
						editor.selection = new vscode.Selection(position, position);
						editor.revealRange(new vscode.Range(position, position));
					}
				}
			});
	}

	/**
	 * Extract line/column and suggestion from JSON error message
	 */
	private extractErrorDetails(errorMessage: string): { line?: number; column?: number; suggestion?: string } {
		const result: { line?: number; column?: number; suggestion?: string } = {};

		// Try to extract line:column from message
		const lineColMatch = errorMessage.match(/line\s+(\d+)[,:]?\s*column\s+(\d+)/i);
		if (lineColMatch) {
			result.line = Number.parseInt(lineColMatch[1], 10);
			result.column = Number.parseInt(lineColMatch[2], 10);
		}

		// Try position-based extraction
		const positionMatch = errorMessage.match(/position\s+(\d+)/i);
		if (positionMatch && !result.line) {
			// Position-based line calculation would need content, skip for now
		}

		// Generate suggestion based on error type
		if (errorMessage.includes("Unexpected token")) {
			result.suggestion = "Check for missing commas, extra commas, or unmatched brackets";
		} else if (errorMessage.includes("Unexpected end")) {
			result.suggestion = "File appears truncated - check for missing closing braces";
		} else if (errorMessage.includes("Expected")) {
			result.suggestion = "Ensure all strings are quoted and values are valid JSON";
		}

		return result;
	}
}
