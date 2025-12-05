import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "fast-glob";
import { logger } from "./utils/logger.js";

interface ConfigFile {
	type: string;
	path: string;
	name: string;
}

interface ConfigParseResult {
	content: unknown;
	valid: boolean;
	error?: string;
	metadata?: Record<string, unknown>;
}

interface ConfigValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

interface ConfigChange {
	type: "added" | "modified" | "deleted";
	file: string;
	timestamp: number;
}

interface PackageJson {
	name?: string;
	version?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
	[key: string]: unknown;
}

interface TsConfig {
	compilerOptions?: {
		target?: string;
		module?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

interface ConfigContent {
	[key: string]: unknown;
}

export class ConfigDetector {
	private workspaceRoot: string;
	private excludePatterns: string[];
	private configFiles: Map<string, ConfigFile> = new Map();
	private changeHandlers: Array<(change: ConfigChange) => void> = [];

	constructor(workspaceRoot: string, options?: { exclude?: string[] }) {
		this.workspaceRoot = workspaceRoot;
		this.excludePatterns = options?.exclude || [
			"node_modules/**",
			".git/**",
			"dist/**",
			"build/**",
		];
	}

	async detectConfigFiles(): Promise<ConfigFile[]> {
		const patterns = [
			"package.json",
			"tsconfig.json",
			".env*",
			".eslintrc*",
			".prettierrc*",
			"jest.config.*",
			"vitest.config.*",
			"webpack.config.*",
			"next.config.*",
			"vite.config.*",
		];

		const globPatterns = patterns.map((pattern) => `**/${pattern}`);
		const exclude = { ignore: this.excludePatterns };

		try {
			const files = await glob(globPatterns, {
				cwd: this.workspaceRoot,
				...exclude,
			});

			const configFiles: ConfigFile[] = files.map((file) => {
				const fullPath = path.join(this.workspaceRoot, file);
				const type = this.determineConfigType(file);
				return {
					type,
					path: fullPath,
					name: path.basename(file),
				};
			});

			// Update internal cache
			this.configFiles.clear();
			configFiles.forEach((config) => {
				this.configFiles.set(config.path, config);
			});

			return configFiles;
		} catch (error) {
			logger.error(
				"Error detecting config files:",
				error instanceof Error ? error : undefined,
			);
			return [];
		}
	}

	private determineConfigType(fileName: string): string {
		if (fileName.includes(".env")) return "env";
		if (fileName.includes("package.json")) return "package.json";
		if (fileName.includes("tsconfig")) return "tsconfig";
		if (fileName.includes(".eslintrc")) return "eslint";
		if (fileName.includes(".prettierrc")) return "prettier";
		if (fileName.includes("jest.config")) return "jest";
		if (fileName.includes("vitest.config")) return "vitest";
		if (fileName.includes("webpack.config")) return "webpack";
		if (fileName.includes("next.config")) return "next";
		if (fileName.includes("vite.config")) return "vite";
		return "unknown";
	}

	async parseConfigFile(filePath: string): Promise<ConfigParseResult> {
		try {
			const content = await fs.readFile(filePath, "utf-8");

			// Try to parse as JSON first
			if (
				filePath.endsWith(".json") ||
				filePath.includes("package.json") ||
				filePath.includes("tsconfig")
			) {
				try {
					const parsed = JSON.parse(content);
					return {
						content: parsed,
						valid: true,
						metadata: this.extractMetadata(parsed, filePath),
					};
				} catch (jsonError) {
					return {
						content: null,
						valid: false,
						error: `Invalid JSON: ${(jsonError as Error).message}`,
					};
				}
			}

			// For non-JSON files, return as text
			return {
				content,
				valid: true,
			};
		} catch (error) {
			return {
				content: null,
				valid: false,
				error: `Failed to read file: ${(error as Error).message}`,
			};
		}
	}

	private extractMetadata(
		content: ConfigContent,
		filePath: string,
	): Record<string, unknown> | undefined {
		if (!content || typeof content !== "object") {
			return undefined;
		}

		const metadata: Record<string, unknown> = {};

		if (filePath.includes("package.json")) {
			const pkg = content as PackageJson;
			if (pkg.dependencies) {
				metadata.dependencies = Object.keys(pkg.dependencies);
			}
			if (pkg.devDependencies) {
				metadata.devDependencies = Object.keys(pkg.devDependencies);
			}
			if (pkg.scripts) {
				metadata.scripts = Object.keys(pkg.scripts);
			}
		}

		return metadata;
	}

	async validateConfig(filePath: string): Promise<ConfigValidationResult> {
		const result: ConfigValidationResult = {
			valid: true,
			errors: [],
			warnings: [],
		};

		try {
			const parseResult = await this.parseConfigFile(filePath);

			if (!parseResult.valid) {
				result.valid = false;
				result.errors.push(parseResult.error || "Failed to parse config file");
				return result;
			}

			// Add specific validation rules based on file type
			if (filePath.includes("package.json")) {
				this.validatePackageJson(parseResult.content as ConfigContent, result);
			} else if (filePath.includes("tsconfig")) {
				this.validateTsConfig(parseResult.content as ConfigContent, result);
			}

			return result;
		} catch (error) {
			result.valid = false;
			result.errors.push(`Validation error: ${(error as Error).message}`);
			return result;
		}
	}

	private validatePackageJson(
		content: ConfigContent,
		result: ConfigValidationResult,
	): void {
		const pkg = content as PackageJson;
		if (!pkg.name) {
			result.errors.push("Missing required field: name");
			result.valid = false;
		}

		if (!pkg.version) {
			result.errors.push("Missing required field: version");
			result.valid = false;
		}
	}

	private validateTsConfig(
		content: ConfigContent,
		result: ConfigValidationResult,
	): void {
		const tsconfig = content as TsConfig;
		if (tsconfig && typeof tsconfig === "object" && tsconfig.compilerOptions) {
			// Basic validation for tsconfig
			if (
				tsconfig.compilerOptions.target &&
				typeof tsconfig.compilerOptions.target !== "string"
			) {
				result.warnings.push("compilerOptions.target should be a string");
			}

			if (
				tsconfig.compilerOptions.module &&
				typeof tsconfig.compilerOptions.module !== "string"
			) {
				result.warnings.push("compilerOptions.module should be a string");
			}
		}
	}

	onConfigChange(handler: (change: ConfigChange) => void): void {
		this.changeHandlers.push(handler);
	}

	async scanForChanges(): Promise<void> {
		// This is a simplified implementation
		// In a real implementation, you would use file watching
		// const _currentFiles = await this.detectConfigFiles();

		// For now, we'll just emit a mock change event
		// A real implementation would compare with previous state
		for (const handler of this.changeHandlers) {
			handler({
				type: "added",
				file: "mock-file-path",
				timestamp: Date.now(),
			});
		}
	}
}
