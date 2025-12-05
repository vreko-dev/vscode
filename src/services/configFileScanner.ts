import { createHash } from "node:crypto";
import * as path from "node:path";
import fg from "fast-glob";
import { minimatch } from "minimatch";
import * as vscode from "vscode";

export interface ConfigFile {
	path: string;
	type: ConfigFileType;
	language: SupportedLanguage;
	critical: boolean;
	baseline?: FileBaseline;
}

export interface FileBaseline {
	path: string;
	hash: string;
	timestamp: number;
	size: number;
}

export type ConfigFileType =
	| "package"
	| "typescript"
	| "linting"
	| "build"
	| "environment"
	| "testing"
	| "framework";

export type SupportedLanguage = "javascript" | "python" | "universal";

const CONFIG_PATTERNS = {
	javascript: {
		package: [
			"package.json",
			"package-lock.json",
			"yarn.lock",
			"pnpm-lock.yaml",
		],
		typescript: ["tsconfig.json", "tsconfig.*.json", "jsconfig.json"],
		linting: [".eslintrc.*", "eslint.config.js", ".prettierrc*", "biome.json"],
		build: [
			"webpack.config.*",
			"vite.config.*",
			"rollup.config.*",
			"esbuild.config.*",
			"rspack.config.*",
		],
		testing: ["jest.config.*", "vitest.config.*", "playwright.config.*"],
	},
	python: {
		package: ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"],
		linting: [".pylintrc", "ruff.toml", ".flake8", "mypy.ini"],
		testing: ["pytest.ini", "tox.ini"],
	},
	universal: {
		environment: [".env", ".env.*"],
	},
};

const EXCLUDE_PATTERNS = [
	"**/node_modules/**",
	"**/.git/**",
	"**/dist/**",
	"**/build/**",
	"**/out/**",
	"**/.pnpm-store/**",
];

export class ConfigFileScanner {
	async scanWorkspace(workspacePath: string): Promise<ConfigFile[]> {
		const allPatterns = this.getAllPatterns();

		const files = await fg(allPatterns, {
			cwd: workspacePath,
			ignore: EXCLUDE_PATTERNS,
			absolute: true,
			onlyFiles: true,
		});

		return files.map((filePath: string) => ({
			...this.categorizeFile(filePath),
			path: filePath,
		}));
	}

	categorizeFile(filePath: string): Omit<ConfigFile, "path"> {
		const fileName = path.basename(filePath);

		// Check JavaScript patterns
		for (const [type, patterns] of Object.entries(CONFIG_PATTERNS.javascript)) {
			if (patterns.some((pattern) => minimatch(fileName, pattern))) {
				return {
					type: type as ConfigFileType,
					language: "javascript",
					critical: type === "package",
				};
			}
		}

		// Check Python patterns
		for (const [type, patterns] of Object.entries(CONFIG_PATTERNS.python)) {
			if (patterns.some((pattern) => minimatch(fileName, pattern))) {
				return {
					type: type as ConfigFileType,
					language: "python",
					critical: type === "package",
				};
			}
		}

		// Check universal patterns
		for (const [type, patterns] of Object.entries(CONFIG_PATTERNS.universal)) {
			if (patterns.some((pattern) => minimatch(fileName, pattern))) {
				return {
					type: type as ConfigFileType,
					language: "universal",
					critical: true,
				};
			}
		}

		return {
			type: "framework",
			language: "universal",
			critical: false,
		};
	}

	async createBaseline(filePath: string): Promise<FileBaseline> {
		const uri = vscode.Uri.file(filePath);
		const content = await vscode.workspace.fs.readFile(uri);
		const stats = await vscode.workspace.fs.stat(uri);

		const hash = createHash("sha256").update(content).digest("hex");

		return {
			path: filePath,
			hash,
			timestamp: Date.now(),
			size: stats.size,
		};
	}

	async validateConfigFile(
		filePath: string,
	): Promise<{ valid: boolean; errors: string[] }> {
		try {
			const uri = vscode.Uri.file(filePath);
			const content = await vscode.workspace.fs.readFile(uri);
			const text = Buffer.from(content).toString("utf-8");
			const fileName = path.basename(filePath);

			if (fileName === "package.json") {
				return this.validatePackageJson(text);
			}

			return { valid: true, errors: [] };
		} catch (error) {
			return {
				valid: false,
				errors: [
					`Invalid JSON: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				],
			};
		}
	}

	private validatePackageJson(content: string): {
		valid: boolean;
		errors: string[];
	} {
		try {
			const pkg = JSON.parse(content);
			const errors: string[] = [];

			if (!pkg.name) errors.push("Missing required field: name");
			if (!pkg.version) errors.push("Missing required field: version");

			return {
				valid: errors.length === 0,
				errors,
			};
		} catch (error) {
			return {
				valid: false,
				errors: [
					`Invalid JSON: ${
						error instanceof Error ? error.message : "Parse error"
					}`,
				],
			};
		}
	}

	private getAllPatterns(): string[] {
		const patterns: string[] = [];

		for (const langPatterns of Object.values(CONFIG_PATTERNS)) {
			for (const typePatterns of Object.values(langPatterns)) {
				patterns.push(...typePatterns);
			}
		}

		return patterns;
	}
}
