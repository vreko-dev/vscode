import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ProtectionLevel } from "../types/protection.js";
import type { ProtectionRule, SnapBackRC } from "../types/snapbackrc.types";
import { logger } from "../utils/logger.js";

interface LegacyConfig {
	protection: Array<{
		pattern: string;
		level: ProtectionLevel;
		reason?: string;
	}>;
	ignore: string[];
	hasContent: boolean;
}

export class MigrationCommand {
	constructor(private readonly workspaceRoot: string) {}

	async execute(): Promise<void> {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Migrating SnapBack configuration...",
				cancellable: false,
			},
			async (progress) => {
				try {
					const rcPath = path.join(this.workspaceRoot, ".snapbackrc");
					if (await this.fileExists(rcPath)) {
						vscode.window.showWarningMessage(
							".snapbackrc already exists. Migration is not required.",
						);
						return;
					}

					progress.report({
						increment: 20,
						message: "Reading legacy files...",
					});
					const legacyConfig = await this.readLegacyConfiguration();

					if (!legacyConfig.hasContent) {
						vscode.window.showInformationMessage(
							"No legacy SnapBack configuration files found.",
						);
						return;
					}

					progress.report({
						increment: 40,
						message: "Creating .snapbackrc...",
					});
					const newConfig = this.createConfiguration(legacyConfig);
					await this.writeConfiguration(rcPath, newConfig);

					progress.report({
						increment: 20,
						message: "Configuration migrated.",
					});

					const shouldClean = await this.askCleanupLegacy();
					if (shouldClean) {
						progress.report({
							increment: 10,
							message: "Removing legacy files...",
						});
						await this.removeLegacyFiles();
					}

					progress.report({ increment: 10, message: "Done!" });
					await this.openConfiguration(rcPath);

					vscode.window.showInformationMessage(
						"✅ Successfully migrated SnapBack configuration to .snapbackrc.",
					);
				} catch (error) {
					logger.error(
						"[SnapBack] Migration error:",
						error instanceof Error ? error : undefined,
					);
					vscode.window.showErrorMessage(
						`Migration failed: ${
							error instanceof Error ? error.message : "Unknown error"
						}`,
					);
				}
			},
		);
	}

	private async readLegacyConfiguration(): Promise<LegacyConfig> {
		const protection = await this.readProtectedFile();
		const ignore = await this.readIgnoreFile();

		return {
			protection,
			ignore,
			hasContent: protection.length > 0 || ignore.length > 0,
		};
	}

	private async readProtectedFile(): Promise<LegacyConfig["protection"]> {
		const filePath = path.join(this.workspaceRoot, ".snapbackprotected");
		try {
			const content = await fs.readFile(filePath, "utf8");
			const rules: LegacyConfig["protection"] = [];

			content.split("\n").forEach((line) => {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) {
					return;
				}

				const match =
					trimmed.match(
						/^(.+?)(?:\s+@(Watched|Warning|Protected))?(?:\s+#(.+))?$/,
					) ?? [];
				const pattern = (match[1] || trimmed).trim();
				const level = (match[2] || "Watched") as ProtectionLevel;
				const reason = match[3]?.trim();

				rules.push({ pattern, level, reason });
			});

			return rules;
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") {
				return [];
			}
			throw err;
		}
	}

	private async readIgnoreFile(): Promise<string[]> {
		const filePath = path.join(this.workspaceRoot, ".snapbackignore");
		try {
			const content = await fs.readFile(filePath, "utf8");
			return content
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("#"));
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") {
				return [];
			}
			throw err;
		}
	}

	private createConfiguration(legacy: LegacyConfig): SnapBackRC {
		const defaultsIgnore = [
			"node_modules/**",
			"dist/**",
			".git/**",
			"*.log",
			"*.tmp",
			".snapback/**",
		];

		const protectionRules: ProtectionRule[] = legacy.protection.map((rule) => {
			const normalizedLevel: ProtectionLevel = [
				"Watched",
				"Warning",
				"Protected",
			].includes(rule.level)
				? (rule.level as ProtectionLevel)
				: "Watched";

			return {
				pattern: rule.pattern,
				level: normalizedLevel,
				reason: rule.reason,
			};
		});

		return {
			protection: protectionRules,
			ignore: legacy.ignore.length > 0 ? legacy.ignore : defaultsIgnore,
			settings: {
				maxSnapshots: 100,
				compressionEnabled: true,
				notificationDuration: 1000,
				showStatusBarItem: true,
				confirmRestore: true,
				defaultProtectionLevel: "Watched",
			},
		};
	}

	private async writeConfiguration(
		rcPath: string,
		config: SnapBackRC,
	): Promise<void> {
		const lines: string[] = [
			"{",
			"  // SnapBack Configuration",
			"  // Migrated from legacy .snapbackprotected and .snapbackignore files",
			"  // Documentation: https://docs.snapback.dev/configuration",
			"",
		];

		const protectionRules = config.protection ?? [];
		if (protectionRules.length) {
			lines.push('  "protection": [');
			protectionRules.forEach((rule, index) => {
				lines.push("    {");
				lines.push(`      "pattern": "${rule.pattern}",`);
				lines.push(`      "level": "${rule.level}"${rule.reason ? "," : ""}`);
				if (rule.reason) {
					lines.push(`      "reason": "${rule.reason}"`);
				}
				lines.push(`    }${index < protectionRules.length - 1 ? "," : ""}`);
			});
			lines.push("  ],", "");
		}

		const ignorePatterns = config.ignore ?? [];
		if (ignorePatterns.length) {
			lines.push('  "ignore": [');
			ignorePatterns.forEach((pattern, index) => {
				lines.push(
					`    "${pattern}"${index < ignorePatterns.length - 1 ? "," : ""}`,
				);
			});
			lines.push("  ],", "");
		}

		lines.push('  "settings": {');
		lines.push(`    "maxSnapshots": ${config.settings?.maxSnapshots ?? 100},`);
		lines.push(
			`    "compressionEnabled": ${
				config.settings?.compressionEnabled ?? true
			},`,
		);
		lines.push(
			`    "notificationDuration": ${
				config.settings?.notificationDuration ?? 1000
			},`,
		);
		lines.push('    "defaultProtectionLevel": "Watched"');
		lines.push("  }");
		lines.push("}", "");

		await fs.writeFile(rcPath, lines.join("\n"), "utf8");
	}

	private async askCleanupLegacy(): Promise<boolean> {
		const choice = await vscode.window.showInformationMessage(
			"Remove legacy .snapbackprotected and .snapbackignore files?",
			"Yes, Clean Up",
			"No, Keep Both",
		);
		return choice === "Yes, Clean Up";
	}

	private async removeLegacyFiles(): Promise<void> {
		for (const file of [".snapbackprotected", ".snapbackignore"]) {
			try {
				await fs.unlink(path.join(this.workspaceRoot, file));
			} catch (error) {
				logger.warn(`[SnapBack] Could not remove legacy file ${file}:`, error);
			}
		}
	}

	private async openConfiguration(rcPath: string): Promise<void> {
		const doc = await vscode.workspace.openTextDocument(rcPath);
		const editor = await vscode.window.showTextDocument(doc);

		const text = doc.getText();
		const protectionIndex = text.indexOf('"protection"');
		if (protectionIndex >= 0) {
			const position = doc.positionAt(protectionIndex);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(new vscode.Range(position, position));
		}
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
