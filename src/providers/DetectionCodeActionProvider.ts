import * as vscode from "vscode";
import { ApiClient } from "../services/api-client.js";
import { logger } from "../utils/logger.js";

export class DetectionCodeActionProvider implements vscode.CodeActionProvider {
	private apiClient: ApiClient;

	constructor() {
		this.apiClient = new ApiClient();
	}

	async provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range | vscode.Selection,
		_context: vscode.CodeActionContext,
		_token: vscode.CancellationToken,
	): Promise<vscode.CodeAction[]> {
		const actions: vscode.CodeAction[] = [];

		try {
			// Analyze the entire document using backend API
			const content = document.getText();
			let analysisResult: {
				score: number;
				factors: string[];
				recommendations: string[];
				severity?: string;
			};
			try {
				analysisResult = (await this.apiClient.analyzeFiles([
					{ path: document.uri.fsPath, content: content },
				])) as {
					score: number;
					factors: string[];
					recommendations: string[];
					severity?: string;
				};
			} catch (error) {
				logger.error(
					"API analysis failed, falling back to basic patterns",
					error instanceof Error ? error : undefined,
					{ error },
				);
				// Fallback to basic pattern detection if API is unavailable
				analysisResult = await this.basicPatternDetection(content);
			}

			// Create code actions based on the analysis results
			if (analysisResult.factors?.length > 0) {
				// Add a general "Review Security Issues" action
				const reviewAction = new vscode.CodeAction(
					"_snapback: Review Security Issues",
					vscode.CodeActionKind.QuickFix,
				);
				reviewAction.command = {
					command: "snapback.reviewSecurityIssues",
					title: "Review Security Issues",
					arguments: [document.uri, analysisResult],
				};
				actions.push(reviewAction);

				// Add specific actions based on the severity
				if (
					analysisResult.severity === "critical" ||
					analysisResult.severity === "high"
				) {
					const blockAction = new vscode.CodeAction(
						"_snapback: Block Save (Critical Security Issue)",
						vscode.CodeActionKind.QuickFix,
					);
					blockAction.command = {
						command: "snapback.blockSave",
						title: "Block Save Due to Security Issues",
						arguments: [document.uri, analysisResult],
					};
					actions.push(blockAction);
				}

				// Add quick fix actions for specific issues
				for (const factor of analysisResult.factors) {
					if (
						factor.includes("secret") ||
						factor.includes("password") ||
						factor.includes("key")
					) {
						const action = new vscode.CodeAction(
							`_snapback: Remove Secret - ${factor.substring(0, 50)}${factor.length > 50 ? "..." : ""}`,
							vscode.CodeActionKind.QuickFix,
						);
						action.command = {
							command: "snapback.removeSecret",
							title: "Remove Secret",
							arguments: [document.uri, factor],
						};
						actions.push(action);
					} else if (factor.includes("mock")) {
						const action = new vscode.CodeAction(
							`_snapback: Remove Mock - ${factor.substring(0, 50)}${factor.length > 50 ? "..." : ""}`,
							vscode.CodeActionKind.QuickFix,
						);
						action.command = {
							command: "snapback.removeMock",
							title: "Remove Mock",
							arguments: [document.uri, factor],
						};
						actions.push(action);
					} else if (
						factor.includes("phantom") ||
						factor.includes("dependency")
					) {
						const action = new vscode.CodeAction(
							`_snapback: Add Dependency - ${factor.substring(0, 50)}${factor.length > 50 ? "..." : ""}`,
							vscode.CodeActionKind.QuickFix,
						);
						action.command = {
							command: "snapback.addDependency",
							title: "Add Missing Dependency",
							arguments: [document.uri, factor],
						};
						actions.push(action);
					}
				}
			}
		} catch (error) {
			logger.error(
				"Error providing code actions",
				error instanceof Error ? error : undefined,
				{ error },
			);
		}

		return actions;
	}

	// Basic pattern detection for offline fallback
	private async basicPatternDetection(content: string): Promise<{
		score: number;
		factors: string[];
		recommendations: string[];
		severity: string;
	}> {
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
}
