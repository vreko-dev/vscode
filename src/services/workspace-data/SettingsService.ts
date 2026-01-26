/**
 * SettingsService - VS Code Settings Management
 *
 * Single responsibility: Read and aggregate VS Code settings related to SnapBack.
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import { getCliStatusSync } from "../../utils/cli-status";
import type { SettingsState } from "./types";

/**
 * Service for reading VS Code settings
 */
export class SettingsService {
	/**
	 * Get settings state for the settings tab
	 */
	async getSettingsState(): Promise<SettingsState> {
		const config = vscode.workspace.getConfiguration("snapback");
		const sensitivity = config.get<string>("snapshot.sensitivity", "medium");
		const excludePatterns = config.get<string[]>("snapshot.excludePatterns", ["node_modules", "dist", ".git"]);

		const languagePacks = this.getLanguagePacks();

		// Get actual CLI status
		const cliStatus = getCliStatusSync();

		return {
			detectedAITool: null, // Would detect from workspace
			cliInstalled: cliStatus.installed,
			cliVersion: cliStatus.version,
			protectionThreshold: sensitivity as "low" | "medium" | "high",
			excludePatterns,
			languagePacks,
		};
	}

	/**
	 * Get language pack status
	 */
	private getLanguagePacks(): SettingsState["languagePacks"] {
		const config = vscode.workspace.getConfiguration("snapback");
		const enabledLanguages = config.get<string[]>("languages.enabled", ["typescript", "javascript"]);

		return [
			{
				name: "TypeScript / JavaScript",
				enabled: enabledLanguages.some((l) => ["typescript", "javascript"].includes(l.toLowerCase())),
				builtin: true,
			},
			{
				name: "React / JSX",
				enabled: enabledLanguages.some((l) => ["typescriptreact", "javascriptreact"].includes(l.toLowerCase())),
				builtin: true,
			},
			{
				name: "Python",
				enabled: enabledLanguages.includes("python"),
				builtin: false,
			},
			{
				name: "Go",
				enabled: enabledLanguages.includes("go"),
				builtin: false,
			},
			{
				name: "Rust",
				enabled: enabledLanguages.includes("rust"),
				builtin: false,
			},
		];
	}
}
