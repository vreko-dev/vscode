import * as path from "node:path";
import * as vscode from "vscode";
import { SNAPBACK_ICONS } from "./constants/index.js";
import type { ProtectedFileRegistry } from "./services/protectedFileRegistry.js";
import type { ProtectionLevel } from "./views/types.js";

export class ContextualTriggers {
	constructor(private readonly protectedFileRegistry: ProtectedFileRegistry) {}

	/**
	 * Check for contextual triggers when a file is saved
	 */
	async checkOnFileSave(document: vscode.TextDocument): Promise<void> {
		const fileName = path.basename(document.fileName);

		// Check for package.json modifications
		if (fileName === "package.json") {
			await this.handlePackageJsonSave(document);
		}

		// Check for .env file modifications
		if (fileName.includes(".env")) {
			await this.handleEnvFileSave(document);
		}

		// Check for other configuration files
		if (this.isConfigurationFile(fileName)) {
			await this.handleConfigFileSave(document);
		}
	}

	/**
	 * Check for contextual triggers after a file revert
	 */
	async checkAfterFileRevert(filePath: string): Promise<void> {
		const isProtected = this.protectedFileRegistry.isProtected(filePath);
		if (!isProtected) {
			// Show prompt to protect the file
			const fileName = path.basename(filePath);
			const response = await vscode.window.showInformationMessage(
				`Looks like you needed to revert ${fileName}. Add protection to prevent future issues?`,
				"Yes, protect it",
				"Not now",
			);

			if (response === "Yes, protect it") {
				await this.protectFile(filePath, "Warning");
			}
		}
	}

	private async handlePackageJsonSave(
		document: vscode.TextDocument,
	): Promise<void> {
		const filePath = document.fileName;
		const isProtected = this.protectedFileRegistry.isProtected(filePath);

		if (!isProtected) {
			// Show prompt to protect package.json
			const response = await vscode.window.showInformationMessage(
				`${SNAPBACK_ICONS.SESSION} Package.json modified. This is a critical configuration file. Add ${SNAPBACK_ICONS.WARN} Warning protection to get notified before future changes?`,
				"Yes, protect it",
				"Not now",
				"Never ask",
			);

			switch (response) {
				case "Yes, protect it":
					await this.protectFile(filePath, "Warning");
					break;
				case "Never ask":
					// We could store this preference in settings
					await vscode.workspace
						.getConfiguration("snapback")
						.update(
							"neverAskForPackageJsonProtection",
							true,
							vscode.ConfigurationTarget.Global,
						);
					break;
			}
		}
	}

	private async handleEnvFileSave(
		document: vscode.TextDocument,
	): Promise<void> {
		const filePath = document.fileName;
		const isProtected = this.protectedFileRegistry.isProtected(filePath);

		if (!isProtected) {
			// Show prompt to protect .env files
			const response = await vscode.window.showWarningMessage(
				"🔐 Environment file detected! This file contains sensitive credentials. Add \u{1f6d1} Block protection to require a snapshot before any changes?",
				{ modal: true },
				"Yes, protect it",
				"Not now",
			);

			if (response === "Yes, protect it") {
				await this.protectFile(filePath, "Protected");
			}
		}
	}

	private async handleConfigFileSave(
		document: vscode.TextDocument,
	): Promise<void> {
		const filePath = document.fileName;
		const fileName = path.basename(filePath);
		const isProtected = this.protectedFileRegistry.isProtected(filePath);

		if (!isProtected) {
			// Show prompt to protect configuration files
			const response = await vscode.window.showInformationMessage(
				`${SNAPBACK_ICONS.SETTINGS} ${fileName} modified. This is a configuration file. Add ${SNAPBACK_ICONS.WARN} Warning protection to get notified before future changes?`,
				"Yes, protect it",
				"Not now",
			);

			if (response === "Yes, protect it") {
				await this.protectFile(filePath, "Warning");
			}
		}
	}

	private async protectFile(
		filePath: string,
		level: ProtectionLevel,
	): Promise<void> {
		try {
			await this.protectedFileRegistry.add(filePath, {
				protectionLevel: level,
			});
			const levelIcon = this.getProtectionIcon(level);
			const fileName = path.basename(filePath);
			vscode.window.showInformationMessage(
				`Protection level set to ${level} ${levelIcon} for ${fileName}`,
			);
		} catch (error) {
			vscode.window.showErrorMessage(
				`Failed to protect file: ${(error as Error).message}`,
			);
		}
	}

	private isConfigurationFile(fileName: string): boolean {
		const configFiles = [
			"tsconfig.json",
			"webpack.config.js",
			"vite.config.js",
			"docker-compose.yml",
			"Dockerfile",
			"Makefile",
			"pom.xml",
			"build.gradle",
			"requirements.txt",
			"gemfile",
			"composer.json",
		];

		return configFiles.includes(fileName);
	}

	private getProtectionIcon(level: ProtectionLevel): string {
		switch (level) {
			case "Watched":
				return "\u{1f7e2}";
			case "Warning":
				return "\u{26a0}";
			case "Protected":
				return "\u{1f6d1}";
			default:
				return "\u{1f7e2}";
		}
	}
}
