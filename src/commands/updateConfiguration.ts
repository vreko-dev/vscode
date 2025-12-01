import * as fs from "node:fs/promises";
import * as path from "node:path";
import { minimatch } from "minimatch";
import * as vscode from "vscode";
import type { ConfigDetector } from "../config-detector.js";
import type { ProtectionLevel } from "../types/protection.js";
import type { SnapBackRC } from "../types/snapbackrc.types";
import { logger } from "../utils/logger.js";

interface FileProtectionStatus {
	filePath: string;
	currentlyProtected: boolean;
	suggestedProtection: ProtectionLevel | null;
	reason?: string;
}

export class UpdateConfigurationCommand {
	constructor(
		private readonly workspaceRoot: string,
		private readonly configDetector: ConfigDetector,
	) {}

	async execute(): Promise<void> {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Analyzing SnapBack configuration...",
				cancellable: false,
			},
			async (progress) => {
				try {
					progress.report({
						increment: 20,
						message: "Scanning files...",
					});
					const fileStatuses = await this.analyzeFileProtectionStatus();

					progress.report({
						increment: 40,
						message: "Checking configuration...",
					});
					const configPath = path.join(this.workspaceRoot, ".snapbackrc");
					const configExists = await this.fileExists(configPath);

					if (!configExists) {
						await this.handleMissingConfig(fileStatuses);
						return;
					}

					progress.report({
						increment: 20,
						message: "Analyzing differences...",
					});
					const configDifferences = await this.analyzeConfigDifferences(
						fileStatuses,
						// configPath,
					);

					if (configDifferences.length === 0) {
						vscode.window.showInformationMessage(
							"✅ SnapBack configuration is up to date with your project files.",
						);
						return;
					}

					progress.report({ increment: 20, message: "Done!" });
					await this.showUpdateSuggestions(configDifferences, configPath);
				} catch (error) {
					logger.error(
						"[SnapBack] Configuration update error:",
						error instanceof Error ? error : undefined,
					);
					vscode.window.showErrorMessage(
						`Configuration analysis failed: ${
							error instanceof Error ? error.message : "Unknown error"
						}`,
					);
				}
			},
		);
	}

	private async analyzeFileProtectionStatus(): Promise<FileProtectionStatus[]> {
		// Detect config files in the project
		const configFiles = await this.configDetector.detectConfigFiles();

		// Get all files in the workspace
		const allFiles = await vscode.workspace.findFiles(
			"**/*",
			"{node_modules/**,.git/**,dist/**,build/**}",
		);

		const fileStatuses: FileProtectionStatus[] = [];

		// For each file, determine if it should be protected based on our default rules
		for (const file of allFiles) {
			const relativePath = path.relative(this.workspaceRoot, file.fsPath);
			const protectionInfo = this.getSuggestedProtectionLevel(relativePath);

			fileStatuses.push({
				filePath: relativePath,
				currentlyProtected: false, // This would need to be determined from current config
				suggestedProtection: protectionInfo.level,
				reason: protectionInfo.reason,
			});
		}

		// Also add config files that were detected
		for (const configFile of configFiles) {
			const relativePath = path.relative(this.workspaceRoot, configFile.path);
			const protectionInfo = this.getSuggestedProtectionLevel(relativePath);

			// Check if this file is already in our list
			const existingIndex = fileStatuses.findIndex(
				(f) => f.filePath === relativePath,
			);
			if (existingIndex >= 0) {
				// Update existing entry
				fileStatuses[existingIndex].suggestedProtection = protectionInfo.level;
				fileStatuses[existingIndex].reason = protectionInfo.reason;
			} else {
				// Add new entry
				fileStatuses.push({
					filePath: relativePath,
					currentlyProtected: false,
					suggestedProtection: protectionInfo.level,
					reason: protectionInfo.reason,
				});
			}
		}

		return fileStatuses;
	}

	private getSuggestedProtectionLevel(filePath: string): {
		level: ProtectionLevel | null;
		reason?: string;
	} {
		// Block level - Sensitive environment variables and lock files
		const blockPatterns = [
			{ pattern: "**/.env*", reason: "Sensitive environment variables" },
			{
				pattern: "package-lock.json",
				reason: "Ensure reproducible Node.js builds",
			},
			{
				pattern: "yarn.lock",
				reason: "Ensure reproducible Node.js builds",
			},
			{
				pattern: "pnpm-lock.yaml",
				reason: "Ensure reproducible Node.js builds",
			},
			{ pattern: "bun.lockb", reason: "Ensure reproducible Bun builds" },
			{
				pattern: "Cargo.lock",
				reason: "Ensure reproducible Rust builds",
			},
			{ pattern: "go.sum", reason: "Ensure reproducible Go builds" },
			{
				pattern: "Gemfile.lock",
				reason: "Ensure reproducible Ruby builds",
			},
			{
				pattern: "composer.lock",
				reason: "Ensure reproducible PHP builds",
			},
		];

		for (const { pattern, reason } of blockPatterns) {
			if (minimatch(filePath, pattern, { dot: true })) {
				return { level: "Protected", reason };
			}
		}

		// Warn level - Core configuration files
		const warnPatterns = [
			{ pattern: "package.json", reason: "Core Node.js configuration" },
			{
				pattern: "tsconfig.json",
				reason: "TypeScript compiler settings",
			},
			{
				pattern: "pyproject.toml",
				reason: "Python project configuration",
			},
			{ pattern: "setup.py", reason: "Python setup configuration" },
			{ pattern: "pom.xml", reason: "Maven project configuration" },
			{ pattern: "build.gradle*", reason: "Gradle build configuration" },
			{ pattern: "*.csproj", reason: "C# project configuration" },
			{ pattern: "go.mod", reason: "Go module configuration" },
			{ pattern: "Cargo.toml", reason: "Rust package configuration" },
			{ pattern: "Gemfile", reason: "Ruby dependency configuration" },
			{
				pattern: "composer.json",
				reason: "PHP dependency configuration",
			},
			{ pattern: "bunfig.toml", reason: "Bun configuration" },
			{ pattern: "vite.config.*", reason: "Vite build configuration" },
			{
				pattern: "webpack.config.*",
				reason: "Webpack build configuration",
			},
			{
				pattern: "rollup.config.*",
				reason: "Rollup build configuration",
			},
			{ pattern: "esbuild.config.*", reason: "ESBuild configuration" },
			{ pattern: "Dockerfile", reason: "Docker build configuration" },
			{
				pattern: "docker-compose.yml",
				reason: "Docker Compose configuration",
			},
			{ pattern: ".gitignore", reason: "Git ignore configuration" },
			{
				pattern: ".github/workflows/*.yml",
				reason: "GitHub Actions workflows",
			},
			{ pattern: "**/*.tf", reason: "Terraform configuration" },
			{
				pattern: "kubernetes/*.yaml",
				reason: "Kubernetes configuration",
			},
			{ pattern: ".vscode/settings.json", reason: "VS Code settings" },
			{ pattern: ".idea/**", reason: "JetBrains IDE configuration" },
		];

		for (const { pattern, reason } of warnPatterns) {
			if (minimatch(filePath, pattern, { dot: true })) {
				return { level: "Warning", reason };
			}
		}

		// Watch level - Auxiliary files
		const watchPatterns = [
			{ pattern: "requirements.txt", reason: "Python dependencies" },
			{ pattern: "*.sln", reason: "Visual Studio solution" },
			{ pattern: ".eslintrc*", reason: "ESLint configuration" },
			{ pattern: ".prettierrc*", reason: "Prettier configuration" },
			{ pattern: "*.babelrc", reason: "Babel configuration" },
			{ pattern: "*.editorconfig", reason: "Editor configuration" },
			{ pattern: "Makefile", reason: "Make build configuration" },
			{ pattern: "CMakeLists.txt", reason: "CMake build configuration" },
			{ pattern: "*.md", reason: "Documentation files" },
		];

		for (const { pattern, reason } of watchPatterns) {
			if (minimatch(filePath, pattern, { dot: true })) {
				return { level: "Watched", reason };
			}
		}

		// No suggested protection
		return { level: null };
	}

	private async handleMissingConfig(
		fileStatuses: FileProtectionStatus[],
	): Promise<void> {
		const protectedFiles = fileStatuses.filter(
			(f) => f.suggestedProtection !== null,
		);

		if (protectedFiles.length === 0) {
			vscode.window.showInformationMessage(
				"No files requiring protection were found in your project.",
			);
			return;
		}

		const choice = await vscode.window.showInformationMessage(
			`Found ${protectedFiles.length} files that should be protected. Would you like to create a .snapbackrc configuration file?`,
			"Create Configuration",
			"Cancel",
		);

		if (choice === "Create Configuration") {
			await this.createConfigurationFromSuggestions(protectedFiles);
		}
	}

	private async analyzeConfigDifferences(
		fileStatuses: FileProtectionStatus[],
		// configPath: string,
	): Promise<FileProtectionStatus[]> {
		try {
			// const _content = await fs.readFile(configPath, "utf8");
			// In a real implementation, we would parse the config and compare with fileStatuses
			// For now, we'll just return all files that should be protected
			return fileStatuses.filter((f) => f.suggestedProtection !== null);
		} catch (error) {
			logger.error(
				"Error reading config file:",
				error instanceof Error ? error : undefined,
			);
			return fileStatuses.filter((f) => f.suggestedProtection !== null);
		}
	}

	private async showUpdateSuggestions(
		differences: FileProtectionStatus[],
		_configPath: string,
	): Promise<void> {
		if (differences.length === 0) {
			vscode.window.showInformationMessage(
				"✅ SnapBack configuration is up to date with your project files.",
			);
			return;
		}

		const blockFiles = differences.filter(
			(d) => d.suggestedProtection === "Protected",
		);
		const warnFiles = differences.filter(
			(d) => d.suggestedProtection === "Warning",
		);
		const watchFiles = differences.filter(
			(d) => d.suggestedProtection === "Watched",
		);

		let _message = `Found ${differences.length} files with suggested protection levels:\n`;
		if (blockFiles.length > 0)
			_message += `\nBlock (${blockFiles.length} files): ${blockFiles
				.map((f) => path.basename(f.filePath))
				.join(", ")}`;
		if (warnFiles.length > 0)
			_message += `\nWarn (${warnFiles.length} files): ${warnFiles
				.map((f) => path.basename(f.filePath))
				.join(", ")}`;
		if (watchFiles.length > 0)
			_message += `\nWatch (${watchFiles.length} files): ${watchFiles
				.map((f) => path.basename(f.filePath))
				.join(", ")}`;

		/**
		 * MVP Note: Configuration update modal has been commented out for MVP and will be replaced with
		 * inline CodeLens + status-bar toast UI instead of full-screen modals.
		 *
		 * For context: Modal dialogs create interruption cost for users. The MVP approach
		 * uses inline banners with "Allow once · Mark wrong · Details" chips that store
		 * rationale without flow break.
		 */
		/*
		message += "\n\nWould you like to update your .snapbackrc configuration?";

		const choice = await vscode.window.showInformationMessage(
			message,
			{ modal: true },
			"Update Configuration",
			"View Details",
			"Cancel",
		);

		if (choice === "Update Configuration") {
			await this.updateConfiguration(differences, configPath);
		} else if (choice === "View Details") {
			// Open the config file
			const doc = await vscode.workspace.openTextDocument(configPath);
			await vscode.window.showTextDocument(doc);
		}
		*/

		// MVP implementation uses inline CodeLens + status-bar toast instead of modals
		// For now, we'll just show an information message without a modal
		vscode.window.showInformationMessage(
			"SnapBack has detected file protection differences. Check the status bar for options.",
		);
	}

	private async createConfigurationFromSuggestions(
		protectedFiles: FileProtectionStatus[],
	): Promise<void> {
		const config: SnapBackRC = {
			protection: protectedFiles
				.filter((f) => f.suggestedProtection)
				.map((f) => ({
					pattern: f.filePath,
					level: f.suggestedProtection as ProtectionLevel,
					reason: f.reason,
				})),
			ignore: [
				"node_modules/**",
				"dist/**",
				"build/**",
				"coverage/**",
				"*.log",
				"*.tmp",
				".snapback/**",
				".git/**",
				"vendor/**",
				"target/**",
			],
			settings: {
				maxSnapshots: 100,
				compressionEnabled: true,
				autoSnapshotInterval: 0,
				notificationDuration: 1000,
				showStatusBarItem: true,
				confirmRestore: true,
				defaultProtectionLevel: "Watched",
				protectionDebounce: 1000,
				enableCaching: true,
			},
		};

		const configPath = path.join(this.workspaceRoot, ".snapbackrc");
		await this.writeConfiguration(configPath, config);

		vscode.window.showInformationMessage(
			"✅ Created .snapbackrc configuration file with suggested protection levels.",
		);

		// Open the file
		const doc = await vscode.workspace.openTextDocument(configPath);
		await vscode.window.showTextDocument(doc);
	}

	private async writeConfiguration(
		rcPath: string,
		config: SnapBackRC,
	): Promise<void> {
		// Convert to JSON with proper formatting
		const content = JSON.stringify(config, null, 2);
		await fs.writeFile(rcPath, content, "utf8");
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}
}
