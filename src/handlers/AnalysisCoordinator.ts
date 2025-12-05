import * as vscode from "vscode";
import type { AIRiskService } from "../services/aiRiskService.js";
import { ApiClient } from "../services/api-client.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import type { AnalysisResult, BasicAnalysisResult } from "../types/api.js";
import { logger } from "../utils/logger.js";
import type { ProtectionLevel } from "../views/types.js";
import type { AuditLogger } from "./AuditLogger.js";

/**
 * Result of risk analysis with blocking decision
 */
export interface RiskAnalysisResult {
	/** Analysis result from API or fallback */
	analysis: AnalysisResult | BasicAnalysisResult;
	/** Whether the save should be blocked */
	shouldBlock: boolean;
	/** Whether user chose to override */
	userOverride: boolean;
}

/**
 * Coordinates risk analysis for protected files.
 * Manages API analysis, offline fallback, and diagnostic publishing.
 *
 * Responsibilities:
 * - Run pattern detection analysis via backend API
 * - Fallback to basic pattern detection if API unavailable
 * - Publish VS Code diagnostics for detected issues
 * - Handle risk-based blocking (critical issues)
 * - Cache analysis results (future optimization)
 */
export class AnalysisCoordinator {
	private diagnosticPublisher: DiagnosticPublisher;
	public lastAnalysisResult: AnalysisResult | BasicAnalysisResult | null = null;

	constructor(
		private registry: ProtectedFileRegistry,
		private auditLogger: AuditLogger,
		private aiRiskService: AIRiskService,
	) {
		this.diagnosticPublisher = new DiagnosticPublisher();
	}

	/**
	 * Analyze a file for security risks and publish diagnostics.
	 * Uses AIRiskService for risk assessment with API fallback.
	 *
	 * @param filePath - Absolute path to the file
	 * @param filename - Base name of the file (for UI messages)
	 * @param content - File content to analyze
	 * @param document - VS Code document for potential restoration
	 * @returns Promise with risk analysis result
	 */
	async analyzeAndPublish(
		filePath: string,
		filename: string,
		content: string,
		document: vscode.TextDocument,
	): Promise<RiskAnalysisResult> {
		// Run AI risk assessment using the risk service
		const riskAssessment = await this.aiRiskService.assessChange({
			filePath,
			before: "",
			after: content,
			category: "save-time-analysis",
		});

		// Map risk assessment to analysis result for backward compatibility
		let analysisResult: AnalysisResult | BasicAnalysisResult;
		try {
			// For now, try to get detailed analysis from API for diagnostics
			const apiClient = new ApiClient();
			const apiResult = await apiClient.analyzeFiles([
				{ path: filePath, content },
			]);
			analysisResult = apiResult as AnalysisResult | BasicAnalysisResult;
		} catch (error) {
			logger.error(
				"API analysis failed, using risk assessment result",
				error as Error,
			);
			// Fallback to risk assessment result
			analysisResult = {
				score: riskAssessment.score / 100, // Normalize to 0-1
				factors: riskAssessment.factors,
				recommendations: [],
				severity:
					riskAssessment.level === "high"
						? "critical"
						: riskAssessment.level === "medium"
							? "high"
							: "low",
			};
		}

		// Publish diagnostics to VS Code
		await this.publishDiagnostics(filePath, analysisResult);

		// Check if risk requires blocking
		const protectionLevel =
			this.registry.getProtectionLevel(filePath) || "Watched";
		const blockingResult = await this.handleRiskBasedBlocking(
			filePath,
			filename,
			content,
			document,
			analysisResult,
			protectionLevel,
		);

		// Store the last analysis result for decoration updates
		this.lastAnalysisResult = analysisResult;

		return {
			analysis: analysisResult,
			shouldBlock: blockingResult.shouldBlock,
			userOverride: blockingResult.userOverride,
		};
	}

	/**
	 * Publish diagnostics to VS Code Problems panel.
	 *
	 * @param filePath - Absolute path to the file
	 * @param analysisResult - Analysis result with factors
	 */
	private async publishDiagnostics(
		filePath: string,
		analysisResult: AnalysisResult | BasicAnalysisResult,
	): Promise<void> {
		const fileUri = vscode.Uri.file(filePath);

		if (analysisResult.factors?.length > 0) {
			const diagnostics: vscode.Diagnostic[] = [];

			// Create diagnostics for each factor
			// Handle both string[] (BasicAnalysisResult) and object[] (AnalysisResult)
			analysisResult.factors.forEach((factor, index: number) => {
				const factorMessage =
					typeof factor === "string"
						? factor
						: factor.message || "Unknown issue";
				const diagnostic = new vscode.Diagnostic(
					new vscode.Range(0, 0, 0, 1), // Place at beginning of file for now
					`SnapBack: ${factorMessage}`,
					this.getDiagnosticSeverity(analysisResult.severity),
				);
				diagnostic.source = "SnapBack";
				diagnostic.code = `snapback-${index}`;
				diagnostics.push(diagnostic);
			});

			// Publish diagnostics
			this.diagnosticPublisher.publish(fileUri, diagnostics);
		} else {
			// Clear diagnostics if no factors
			this.diagnosticPublisher.clear(fileUri);
		}
	}

	/**
	 * Handle risk-based blocking for critical issues.
	 * Shows appropriate notifications based on severity.
	 *
	 * @returns Object with shouldBlock and userOverride flags
	 */
	private async handleRiskBasedBlocking(
		filePath: string,
		filename: string,
		content: string,
		document: vscode.TextDocument,
		analysisResult: AnalysisResult | BasicAnalysisResult,
		protectionLevel: ProtectionLevel,
	): Promise<{ shouldBlock: boolean; userOverride: boolean }> {
		// Block when risk > 0.8 (80% of 0-1 scale) and protectionLevel === 'Protected'
		if (analysisResult.score > 0.8 && protectionLevel === "Protected") {
			const selection = await vscode.window.showErrorMessage(
				`Critical security issues detected in ${filename}. Save blocked due to protection level.`,
				"Save Anyway (Override)",
				"Cancel Save",
			);

			if (selection !== "Save Anyway (Override)") {
				await this.auditLogger.recordAudit(
					filePath,
					protectionLevel,
					"save_blocked",
					{
						reason: "critical_security_issues_blocked",
						factors: analysisResult.factors,
						risk_score: analysisResult.score,
					},
				);
				await this.restoreDocumentContents(document, content);
				throw new vscode.CancellationError();
			}

			// Record override
			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{
					reason: "user_override_critical_security",
					factors: analysisResult.factors,
					risk_score: analysisResult.score,
				},
			);

			return { shouldBlock: false, userOverride: true };
		}

		// Show notification if critical issues are detected (for non-blocked cases)
		if (
			analysisResult.severity === "critical" &&
			protectionLevel !== "Protected"
		) {
			const selection = await vscode.window.showWarningMessage(
				`Critical security issues detected in ${filename}: ${analysisResult.factors?.join(", ")}`,
				"Save Anyway",
				"Review Issues",
				"Cancel Save",
			);

			switch (selection) {
				case "Cancel Save": {
					await this.auditLogger.recordAudit(
						filePath,
						protectionLevel,
						"save_blocked",
						{
							reason: "critical_security_issues",
							factors: analysisResult.factors,
						},
					);
					await this.restoreDocumentContents(document, content);
					throw new vscode.CancellationError();
				}
				case "Review Issues":
					// Show detailed information about the issues
					vscode.window.showInformationMessage(
						"Security Issues in " +
							filename +
							":\\n" +
							analysisResult.factors?.join("\\n") +
							"\\n\\nRecommendations:\\n" +
							analysisResult.recommendations?.join("\\n"),
						{ modal: true },
					);
					// Still allow save to proceed after review
					break;
				case "Save Anyway":
					// Allow save to proceed
					break;
				default: {
					// If user closes the dialog without selecting an option, cancel save
					await this.auditLogger.recordAudit(
						filePath,
						protectionLevel,
						"save_blocked",
						{ reason: "dialog_cancelled" },
					);
					await this.restoreDocumentContents(document, content);
					throw new vscode.CancellationError();
				}
			}
		} else if (analysisResult.severity === "high") {
			const selection = await vscode.window.showWarningMessage(
				`Security issues detected in ${filename}: ${analysisResult.factors?.join(", ")}`,
				"Save Anyway",
				"Review Issues",
			);

			if (selection === "Review Issues") {
				vscode.window.showInformationMessage(
					"Security Issues in " +
						filename +
						":\\n" +
						analysisResult.factors?.join("\\n") +
						"\\n\\nRecommendations:\\n" +
						analysisResult.recommendations?.join("\\n"),
				);
			}
		} else if (
			analysisResult.severity === "medium" &&
			analysisResult.factors?.length > 0
		) {
			// For medium severity, show a less intrusive notification
			vscode.window.setStatusBarMessage(
				`⚠️ Medium security issues detected in ${filename}`,
				5000,
			);
		}

		return { shouldBlock: false, userOverride: false };
	}

	/**
	 * Map analysis severity to VS Code diagnostic severity.
	 */
	private getDiagnosticSeverity(
		severity: string | undefined,
	): vscode.DiagnosticSeverity {
		switch (severity) {
			case "critical":
				return vscode.DiagnosticSeverity.Error;
			case "high":
				return vscode.DiagnosticSeverity.Warning;
			case "medium":
				return vscode.DiagnosticSeverity.Information;
			case "low":
				return vscode.DiagnosticSeverity.Hint;
			default:
				return vscode.DiagnosticSeverity.Information;
		}
	}

	/**
	 * Restore document contents when save is cancelled.
	 */
	private async restoreDocumentContents(
		document: vscode.TextDocument,
		preSaveContent: string,
	): Promise<void> {
		try {
			const currentContent = document.getText();
			if (currentContent === preSaveContent) {
				return;
			}

			const lines = currentContent.split(/\r?\n/);
			const endLineIndex = Math.max(lines.length - 1, 0);
			const endCharacter = lines[endLineIndex]?.length ?? 0;
			const start = new vscode.Position(0, 0);
			const end = new vscode.Position(endLineIndex, endCharacter);
			const edit = new vscode.WorkspaceEdit();
			edit.replace(document.uri, new vscode.Range(start, end), preSaveContent);
			const applied = await vscode.workspace.applyEdit(edit);

			if (!applied) {
				logger.warn("Failed to restore document after cancelled save", {
					filePath: document.uri.fsPath,
				});
			}
		} catch (error) {
			logger.warn("Error while restoring document contents", {
				filePath: document.uri.fsPath,
				error: error instanceof Error ? error.message : error,
			});
		}
	}

	/**
	 * Dispose of resources.
	 */
	dispose(): void {
		this.diagnosticPublisher.dispose();
	}
}

/**
 * Simple diagnostic publisher for VS Code Problems panel.
 */
class DiagnosticPublisher {
	private collection = vscode.languages.createDiagnosticCollection("snapback");

	publish(uri: vscode.Uri, diags: vscode.Diagnostic[]): void {
		this.collection.set(uri, diags);
	}

	clear(uri: vscode.Uri): void {
		this.collection.delete(uri);
	}

	dispose(): void {
		this.collection.dispose();
	}
}
