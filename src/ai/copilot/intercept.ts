// API hook if available; else watch Copilot staging; score/block via backend API with override reason

import * as vscode from "vscode";
import { ApiClient } from "../../services/api-client.js";
import { logger } from "../../utils/logger.js";

// Define a type for the Copilot solution object
interface CopilotSolution {
	content?: string;
	text?: string;
	// Add other potential properties as needed
	[key: string]: unknown;
}

export class CopilotInterceptor {
	private disposables: vscode.Disposable[] = [];
	private isActive = false;
	private apiClient: ApiClient;

	constructor() {
		// Initialize ApiClient
		this.apiClient = new ApiClient();
	}

	start() {
		if (this.isActive) {
			return;
		}

		this.isActive = true;
		this.initialize();
	}

	stop() {
		if (!this.isActive) {
			return;
		}

		this.isActive = false;
		this.dispose();
	}

	private initialize() {
		// Try to hook into Copilot API if available
		try {
			this.hookCopilotAPI();
		} catch (error) {
			logger.warn(
				"Could not hook into Copilot API, falling back to file watching",
				undefined,
				{ error },
			);
			this.watchCopilotStaging();
		}
	}

	private hookCopilotAPI() {
		// Try to get the Copilot extension
		const copilotExtension = vscode.extensions.getExtension("GitHub.copilot");
		if (copilotExtension?.exports) {
			try {
				// Try to access the Copilot API
				const copilotAPI = copilotExtension.exports;

				// Check if the API has the methods we need
				if (
					copilotAPI &&
					typeof copilotAPI.onWillAcceptSolution === "function"
				) {
					// Hook into the Copilot API
					const disposable = copilotAPI.onWillAcceptSolution(
						async (solution: CopilotSolution) => {
							return await this.analyzeAndBlockSolution(solution);
						},
					);

					this.disposables.push(disposable);
					logger.info("Successfully hooked into Copilot API");
					return;
				}
			} catch (error) {
				logger.warn("Error accessing Copilot API", undefined, { error });
			}
		}

		// Fallback to file watching if API hook fails
		logger.info("Falling back to file watching for Copilot");
		this.watchCopilotStaging();
	}

	private async analyzeAndBlockSolution(solution: unknown): Promise<boolean> {
		try {
			// Extract the content from the solution
			const content =
				typeof solution === "object" && solution !== null
					? "content" in solution
						? (solution as CopilotSolution).content
						: "text" in solution
							? (solution as CopilotSolution).text
							: JSON.stringify(solution)
					: String(solution);

			// Run analysis using backend API
			let result: unknown;
			try {
				result = await this.apiClient.analyzeFiles([
					{ path: "copilot-suggestion", content: content || "" },
				]);
			} catch (error) {
				logger.error(
					"API analysis failed, falling back to basic patterns",
					error instanceof Error ? error : undefined,
					{ error },
				);
				// Fallback to basic pattern detection if API is unavailable
				result = await this.basicPatternDetection(content || "");
			}

			// Type guard to check if result has the expected properties
			if (
				result &&
				typeof result === "object" &&
				"score" in result &&
				"factors" in result
			) {
				const analysisResult = result as { score: number; factors: string[] };

				// Check if we should block based on the risk score
				if (analysisResult.score >= 8) {
					// Block critical suggestions
					const override = await this.requestOverride(
						analysisResult.score,
						analysisResult.factors,
					);
					if (!override) {
						// Cancel the suggestion
						vscode.window.showErrorMessage(
							`SnapBack blocked a critical Copilot suggestion (Risk: ${analysisResult.score}/10)`,
						);
						return false; // Block the solution
					}
				} else if (analysisResult.score >= 5) {
					// Warn for moderate risk
					vscode.window.showWarningMessage(
						`SnapBack detected a moderate risk (${analysisResult.score}/10) in Copilot suggestion`,
					);
				}
			}

			return true; // Allow the solution
		} catch (error) {
			logger.error(
				"Error analyzing Copilot solution",
				error instanceof Error ? error : undefined,
				{ error },
			);
			// In case of error, allow the solution to proceed
			return true;
		}
	}

	private watchCopilotStaging() {
		// Watch for Copilot staging files in common locations
		const patterns = [
			"**/.copilot/**/*",
			"**/.github/copilot/**/*",
			"**/copilot/**/*",
			"**/*.copilot.*",
		];

		for (const pattern of patterns) {
			try {
				const watcher = vscode.workspace.createFileSystemWatcher(
					new vscode.RelativePattern(vscode.workspace.rootPath || "", pattern),
				);

				watcher.onDidChange((uri) => this.analyzeCopilotFileChange(uri));
				watcher.onDidCreate((uri) => this.analyzeCopilotFileChange(uri));

				this.disposables.push(watcher);
			} catch (error) {
				logger.warn(
					`Failed to create file watcher for pattern ${pattern}`,
					undefined,
					{ error },
				);
			}
		}
	}

	private async analyzeCopilotFileChange(uri: vscode.Uri): Promise<boolean> {
		// Analyze the Copilot-generated content
		try {
			const document = await vscode.workspace.openTextDocument(uri);
			const content = document.getText();

			// Run analysis using backend API
			let result: unknown;
			try {
				result = await this.apiClient.analyzeFiles([
					{ path: uri.fsPath, content: content },
				]);
			} catch (error) {
				logger.error(
					"API analysis failed, falling back to basic patterns",
					error instanceof Error ? error : undefined,
					{ error },
				);
				// Fallback to basic pattern detection if API is unavailable
				result = await this.basicPatternDetection(content);
			}

			// Type guard to check if result has the expected properties
			if (
				result &&
				typeof result === "object" &&
				"score" in result &&
				"factors" in result
			) {
				const analysisResult = result as { score: number; factors: string[] };

				if (analysisResult.score >= 8) {
					// Block critical suggestions
					const override = await this.requestOverride(
						analysisResult.score,
						analysisResult.factors,
					);
					if (!override) {
						// Show error message
						vscode.window.showErrorMessage(
							`SnapBack blocked a critical Copilot file change (Risk: ${analysisResult.score}/10)`,
						);
						return false;
					}
				} else if (analysisResult.score >= 5) {
					// Warn for moderate risk
					vscode.window.showWarningMessage(
						`SnapBack detected a moderate risk (${analysisResult.score}/10) in Copilot file change`,
					);
					return true;
				}
			}
		} catch (error) {
			logger.error(
				"Error analyzing Copilot file change",
				error instanceof Error ? error : undefined,
				{ error },
			);
		}
		return true;
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
			`SnapBack detected a critical risk (${score}/10) in Copilot suggestion.${factorsText}`,
			{ modal: true },
			"Override",
			"Cancel",
		);

		if (result === "Override") {
			const reason = await vscode.window.showInputBox({
				prompt: "Reason for override (optional)",
				placeHolder: "Enter reason for overriding this suggestion",
			});

			if (reason !== undefined) {
				// Log the override reason
				logger.info(
					`[AUDIT] Copilot override: ${reason || "No reason provided"} (Risk: ${score}/10)`,
				);
				return true;
			}
		}

		return false;
	}

	// Basic pattern detection for offline fallback
	private async basicPatternDetection(content: string): Promise<unknown> {
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
		this.disposables.forEach((d) => {
			d.dispose();
		});
		this.disposables = [];
	}
}

// Export singleton instance and start/stop functions
let copilotInterceptor: CopilotInterceptor | null = null;

export function start(): CopilotInterceptor {
	if (!copilotInterceptor) {
		copilotInterceptor = new CopilotInterceptor();
	}
	copilotInterceptor.start();
	return copilotInterceptor;
}

export function stop(): void {
	if (copilotInterceptor) {
		copilotInterceptor.stop();
		copilotInterceptor = null;
	}
}
