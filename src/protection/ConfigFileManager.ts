import * as fs from "node:fs/promises";
import * as path from "node:path";
import { minimatch } from "minimatch";
import { logger } from "../utils/logger.js";

export class ConfigFileManager {
	private static readonly MAX_PATTERN_LENGTH = 512;
	private static readonly MAX_WILDCARD_COUNT = 32;
	private static readonly MAX_COMPLEX_SEGMENTS = 64;
	private static readonly MAX_BRACE_DEPTH = 4;

	constructor(private workspaceRoot: string) {}

	/**
	 * Read and parse a config file
	 * @returns Array of glob patterns (comments and empty lines removed)
	 */
	async readConfig(_configType: "protected" | "ignore"): Promise<string[]> {
		const fileName = ".snapbackrc";
		const configPath = path.join(this.workspaceRoot, fileName);

		try {
			const content = await fs.readFile(configPath, "utf-8");
			const patterns = this.parseConfigContent(content);
			return this.sanitizePatterns(patterns, configPath);
		} catch (error) {
			// File doesn't exist - return empty array
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return [];
			}
			throw error;
		}
	}

	/**
	 * Write patterns to config file
	 */
	async writeConfig(
		_configType: "protected" | "ignore",
		patterns: string[],
	): Promise<void> {
		const fileName = ".snapbackrc";
		const configPath = path.join(this.workspaceRoot, fileName);
		const content = `${patterns.join("\n")}\n`;

		await fs.writeFile(configPath, content, "utf-8");
	}

	/**
	 * Add a pattern to config file (appends if not exists)
	 */
	async addPattern(
		configType: "protected" | "ignore",
		pattern: string,
	): Promise<void> {
		const patterns = await this.readConfig(configType);

		// Avoid duplicates
		if (patterns.includes(pattern)) {
			return;
		}

		patterns.push(pattern);
		await this.writeConfig(configType, patterns);
	}

	/**
	 * Remove a pattern from config file
	 */
	async removePattern(
		configType: "protected" | "ignore",
		pattern: string,
	): Promise<void> {
		const patterns = await this.readConfig(configType);
		const filtered = patterns.filter((p) => p !== pattern);

		if (filtered.length !== patterns.length) {
			await this.writeConfig(configType, filtered);
		}
	}

	/**
	 * Check if a pattern exists in config
	 */
	async hasPattern(
		configType: "protected" | "ignore",
		pattern: string,
	): Promise<boolean> {
		const patterns = await this.readConfig(configType);
		return patterns.includes(pattern);
	}

	/**
	 * Check if a file path matches any pattern in config
	 */
	async matchesConfig(
		configType: "protected" | "ignore",
		filePath: string,
	): Promise<boolean> {
		const patterns = await this.readConfig(configType);
		const relativePath = path.relative(this.workspaceRoot, filePath);

		for (const pattern of patterns) {
			try {
				if (
					minimatch(relativePath, pattern, {
						dot: true,
						windowsPathsNoEscape: true,
					})
				) {
					return true;
				}
			} catch (error) {
				logger.warn(
					`Failed to evaluate pattern "${pattern}"`,
					error instanceof Error ? error.message : error,
				);
			}
		}
		return false;
	}

	/**
	 * Parse config file content into patterns array
	 */
	private parseConfigContent(content: string): string[] {
		return content
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith("#"));
	}

	/**
	 * Create default config file if it doesn't exist
	 */
	async ensureConfigExists(
		configType: "protected" | "ignore",
		defaultPatterns: string[] = [],
	): Promise<void> {
		const fileName = ".snapbackrc";
		const configPath = path.join(this.workspaceRoot, fileName);

		try {
			await fs.access(configPath);
			// File exists, do nothing
		} catch {
			// File doesn't exist, create with defaults
			await this.writeConfig(configType, defaultPatterns);
		}
	}

	/**
	 * Validate a glob pattern
	 */
	private validatePattern(pattern: string): boolean {
		if (!pattern) {
			return false;
		}

		if (pattern.length > ConfigFileManager.MAX_PATTERN_LENGTH) {
			return false;
		}

		const wildcardCount = (pattern.match(/[*?]/g) ?? []).length;
		if (wildcardCount > ConfigFileManager.MAX_WILDCARD_COUNT) {
			return false;
		}

		const specialCount = pattern.match(/[{}()[\]!@+?*|]/g)?.length ?? 0;
		if (specialCount > ConfigFileManager.MAX_COMPLEX_SEGMENTS) {
			return false;
		}

		let braceDepth = 0;
		for (const char of pattern) {
			if (char === "{") {
				braceDepth += 1;
				if (braceDepth > ConfigFileManager.MAX_BRACE_DEPTH) {
					return false;
				}
			} else if (char === "}") {
				braceDepth = Math.max(0, braceDepth - 1);
			}
		}

		const extglobSegments = pattern.match(/[?*@+!]\([^)]*\)/g)?.length ?? 0;
		if (extglobSegments > ConfigFileManager.MAX_COMPLEX_SEGMENTS) {
			return false;
		}

		try {
			minimatch("probe", pattern, { windowsPathsNoEscape: true });
			return true;
		} catch {
			return false;
		}
	}

	private sanitizePatterns(patterns: string[], source: string): string[] {
		const safePatterns: string[] = [];

		for (const pattern of patterns) {
			if (this.validatePattern(pattern)) {
				safePatterns.push(pattern);
			} else {
				logger.warn(`Skipping unsafe pattern "${pattern}" from ${source}`);
			}
		}

		return safePatterns;
	}

	/**
	 * Add a pattern with validation
	 */
	async addPatternWithValidation(
		configType: "protected" | "ignore",
		pattern: string,
	): Promise<void> {
		if (!this.validatePattern(pattern)) {
			throw new Error(`Invalid glob pattern: ${pattern}`);
		}
		await this.addPattern(configType, pattern);
	}
}
