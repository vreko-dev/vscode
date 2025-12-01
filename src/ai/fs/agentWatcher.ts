// chokidar on .continue/pending, .cursor/tmp, etc. → analyze diffs pre-apply; block with override reason

import * as fs from "node:fs";
import * as path from "node:path";
import * as chokidar from "chokidar";
import * as vscode from "vscode";
import { ApiClient } from "../../services/api-client.js";
import type { AnalysisResult, BasicAnalysisResult } from "../../types/api.js";
import { logger } from "../../utils/logger.js";

export class AgentWatcher {
	private watchers: chokidar.FSWatcher[] = [];
	private disposables: vscode.Disposable[] = [];
	private apiClient: ApiClient;

	constructor() {
		// Initialize ApiClient
		this.apiClient = new ApiClient();

		this.initializeWatchers();
	}

	private initializeWatchers() {
		// Watch common AI agent directories
		const agentPaths = [
			".continue/pending",
			".cursor/tmp",
			".windsurf/tmp",
			".aider.tmp",
		];

		for (const agentPath of agentPaths) {
			try {
				const fullPath = path.join(vscode.workspace.rootPath || "", agentPath);
				const watcher = chokidar.watch(fullPath, {
					persistent: true,
					ignoreInitial: true,
					awaitWriteFinish: true,
				});

				watcher
					.on("add", (filePath) => this.handleFileChange(filePath))
					.on("change", (filePath) => this.handleFileChange(filePath));

				this.watchers.push(watcher);
			} catch (error) {
				logger.warn(`Failed to watch ${agentPath}`, undefined, { error });
			}
		}
	}

	private async handleFileChange(filePath: string) {
		try {
			// Read the file content
			const content = fs.readFileSync(filePath, "utf-8");

			// Analyze with backend API
			let result: AnalysisResult | BasicAnalysisResult;
			try {
				const apiResult = await this.apiClient.analyzeFiles([
					{ path: filePath, content: content },
				]);
				// Cast the unknown result to our expected type
				result = apiResult as AnalysisResult | BasicAnalysisResult;
			} catch (error) {
				logger.error(
					"API analysis failed, falling back to basic patterns",
					error instanceof Error ? error : undefined,
					{ error },
				);
				// Fallback to basic pattern detection if API is unavailable
				result = await this.basicPatternDetection(content);
			}

			if (result.score >= 8) {
				// Block critical changes
				// Convert factors to string array for requestOverride
				const factors = result.factors.map((f) =>
					typeof f === "string" ? f : f.message || "Unknown issue",
				);
				const override = await this.requestOverride(result.score, factors);
				if (!override) {
					// Delete the file to prevent application
					fs.unlinkSync(filePath);
					vscode.window.showErrorMessage(
						`SnapBack blocked critical AI change in ${path.basename(filePath)} (Risk: ${result.score}/10)`,
					);
					return;
				}
			} else if (result.score >= 5) {
				// Warn for moderate risk
				vscode.window.showWarningMessage(
					`SnapBack detected moderate risk (${result.score}/10) in AI change: ${path.basename(filePath)}`,
				);
			}
		} catch (error) {
			logger.error(
				"Error handling file change",
				error instanceof Error ? error : undefined,
				{ error },
			);
		}
	}

	private async requestOverride(
		score: number,
		factors: string[],
	): Promise<boolean> {
		const factorsText =
			factors.length > 0
				? `\n\nRisk factors:\n${factors.map((f) => `- ${f}`).join("\n")}`
				: "";

		const result = await vscode.window.showWarningMessage(
			`SnapBack detected a critical risk (${score}/10) in AI-generated change.${factorsText}`,
			{ modal: true },
			"Override",
			"Cancel",
		);

		if (result === "Override") {
			const reason = await vscode.window.showInputBox({
				prompt: "Reason for override (optional)",
				placeHolder: "Enter reason for overriding this change",
			});

			if (reason !== undefined) {
				// Log the override reason
				logger.info(
					`[AUDIT] AI change override: ${reason || "No reason provided"} (Risk: ${score}/10)`,
				);
				return true;
			}
		}

		return false;
	}

	// Basic pattern detection for offline fallback
	private async basicPatternDetection(
		content: string,
	): Promise<BasicAnalysisResult> {
		// Simple pattern detection for basic security issues
		const factors: string[] = [];
		const recommendations: string[] = [];

		// Check for common patterns
		if (content.includes("eval(")) {
			factors.push("eval() usage detected - security risk");
			recommendations.push(
				"Avoid using eval() as it can execute arbitrary code",
			);
		}

		if (content.includes("Function(")) {
			factors.push("Function constructor usage detected - security risk");
			recommendations.push(
				"Avoid using Function constructor as it can execute arbitrary code",
			);
		}

		// Simple score calculation
		const score = factors.length > 0 ? Math.min(factors.length * 0.2, 1.0) : 0;
		const severity =
			factors.length > 0 ? (factors.length > 2 ? "high" : "medium") : "low";

		return {
			score,
			factors,
			recommendations,
			severity,
		};
	}

	dispose() {
		// Close all watchers
		for (const watcher of this.watchers) {
			watcher.close();
		}

		// Dispose of VS Code disposables
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}

// Export singleton instance and start/stop functions
let agentWatcher: AgentWatcher | null = null;

export function start(): AgentWatcher {
	if (!agentWatcher) {
		agentWatcher = new AgentWatcher();
	}
	return agentWatcher;
}

export function stop(): void {
	if (agentWatcher) {
		agentWatcher.dispose();
		agentWatcher = null;
	}
}
