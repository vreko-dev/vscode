import type * as vscode from "vscode";
import { ApiClient } from "../services/api-client";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { type BlockDialogOptions, SnapBackDialogs } from "../ui/dialogs";
import { logger } from "../utils/logger.js";

// Define the ProtectionDecision interface based on how it's used
interface ProtectionDecision {
	decision: "Allow" | "Warn" | "Block";
	riskScore: number;
	reasons: string[];
	diagnosticMessage: string;
}

export interface SaveContext {
	document: vscode.TextDocument;
	reason: string;
}

export class OnWillSaveHandler {
	private registry: ProtectedFileRegistry;
	private context: vscode.ExtensionContext;
	private apiClient: ApiClient;

	constructor(
		registry: ProtectedFileRegistry,
		context: vscode.ExtensionContext,
	) {
		this.registry = registry;
		this.context = context;
		this.apiClient = new ApiClient();
	}

	/**
	 * Handle onWillSaveTextDocument event
	 * This is the main entry point for save gating functionality
	 */
	async handleWillSave(event: vscode.TextDocumentWillSaveEvent): Promise<void> {
		try {
			const startTime = Date.now();

			const document = event.document;
			const uri = document.uri;

			// Check if this file is protected
			const protectedEntry = await this.registry.get(uri);
			if (!protectedEntry) {
				// Not a protected file, allow save
				return;
			}

			// Get protection level
			const protectionLevel = protectedEntry.protectionLevel || "Watched";

			// For Watch level, allow save but create snapshot
			if (protectionLevel === "Watched") {
				// Snapshot will be created by the save handler
				return;
			}

			// For Warn and Block levels, we need to check with backend
			const analysisStartTime = Date.now();
			const decision = await this.getProtectionDecision(document);
			const analysisTime = Date.now() - analysisStartTime;

			// Record analysis kickoff time budget probe
			this.recordBudgetProbe("analysis_kickoff_ms", analysisTime);

			// Handle based on protection level and decision
			if (protectionLevel === "Warning") {
				await this.handleWarningLevel(document, decision);
			} else if (protectionLevel === "Protected") {
				await this.handleBlockLevel(document, decision, event);
			}

			const uiActionTime = Date.now() - startTime;
			// Record UI action time budget probe
			this.recordBudgetProbe("ui_action_ms", uiActionTime);
		} catch (error) {
			// Log error but don't block save in case of internal errors
			logger.error(
				"Error in onWillSave handler",
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * Get protection decision from backend analysis
	 */
	private async getProtectionDecision(
		document: vscode.TextDocument,
	): Promise<ProtectionDecision> {
		try {
			// Call the backend API for analysis
			const content = document.getText();
			const filePath = document.uri.fsPath;

			const analysisResult = await this.apiClient.analyzeFiles([
				{ path: filePath, content: content },
			]);

			// Extract risk information from the analysis result
			// The actual structure will depend on the API response
			const riskScore =
				(analysisResult as unknown as { riskScore: number }).riskScore || 0;
			const riskFactors =
				(
					analysisResult as unknown as {
						riskFactors: Array<{ message?: string; type?: string }>;
					}
				).riskFactors || [];
			const riskLevel =
				(analysisResult as unknown as { riskLevel: string }).riskLevel || "low";

			// Convert risk factors to reasons
			const reasons = riskFactors.map(
				(factor) => factor.message || factor.type || "Unknown risk factor",
			);

			// Determine decision based on risk level and score
			let decision: "Allow" | "Warn" | "Block" = "Allow";
			if (riskLevel === "high" || riskLevel === "critical" || riskScore >= 8) {
				decision = "Block";
			} else if (riskLevel === "medium" || riskScore >= 5) {
				decision = "Warn";
			}

			// Get diagnostic message from the first risk factor or default message
			const diagnosticMessage =
				reasons.length > 0 ? reasons[0] : "Potential risk detected";

			return {
				decision,
				riskScore,
				reasons,
				diagnosticMessage,
			};
		} catch (error) {
			// If API call fails, fall back to basic pattern detection
			logger.warn(
				"Backend analysis failed, falling back to basic pattern detection",
				error instanceof Error ? error : undefined,
			);

			// Use the existing simplified logic as fallback
			const content = document.getText();
			const riskScore = this.calculateRiskScore(content);
			const reasons = this.getRiskReasons(content);

			// Simulate decision based on risk score
			let decision: "Allow" | "Warn" | "Block" = "Allow";
			if (riskScore >= 8) {
				decision = "Block";
			} else if (riskScore >= 5) {
				decision = "Warn";
			}

			return {
				decision,
				riskScore,
				reasons,
				diagnosticMessage:
					reasons.length > 0 ? reasons[0] : "Potential risk detected",
			};
		}
	}

	/**
	 * Calculate risk score based on content using comprehensive secret detection
	 */
	private calculateRiskScore(content: string): number {
		// This is a more comprehensive fallback - uses patterns from established libraries
		let score = 0;

		// Check for common secret patterns with weights based on severity
		const secretPatterns = [
			// High severity patterns (AWS keys, GitHub tokens, etc.)
			{ pattern: /AKIA[0-9A-Z]{16}/g, weight: 3, name: "AWS Access Key" },
			{
				pattern: /[a-z0-9]{32}-us[0-9]{1,2}/g,
				weight: 3,
				name: "MailChimp API Key",
			},
			{
				pattern: /sk_live_[0-9a-zA-Z]{24}/g,
				weight: 3,
				name: "Stripe Live Key",
			},
			{
				pattern: /xox[p|b|o|a]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[a-z0-9]{32}/g,
				weight: 3,
				name: "Slack Token",
			},
			{
				pattern:
					/[f|F][a|A][c|C][e|E][b|B][o|O][o|O][k|K].*['"][0-9a-f]{32}['"]/g,
				weight: 3,
				name: "Facebook Access Token",
			},
			{
				pattern: /[g|G][i|I][t|T][h|H][u|U][b|B].*['"][0-9a-zA-Z]{35,40}['"]/g,
				weight: 3,
				name: "GitHub Token",
			},

			// Medium severity patterns (API keys, secrets, etc.)
			{ pattern: /AIza[0-9A-Za-z\-_]{35}/g, weight: 2, name: "Google API Key" },
			{ pattern: /sk-[a-zA-Z0-9]{32,}/g, weight: 2, name: "OpenAI API Key" },
			{ pattern: /key-[0-9a-zA-Z]{32}/g, weight: 2, name: "Mailgun API Key" },
			{ pattern: /SK[0-9a-fA-F]{32}/g, weight: 2, name: "Twilio API Key" },
			{
				pattern:
					/[a|A][p|P][i|I][_]?[k|K][e|E][y|Y].*['"][0-9a-zA-Z]{32,45}['"]/g,
				weight: 2,
				name: "Generic API Key",
			},
			{
				pattern: /[s|S][e|E][c|C][r|R][e|E][t|T].*['"][0-9a-zA-Z]{32,45}['"]/g,
				weight: 2,
				name: "Generic Secret",
			},

			// Lower severity patterns (passwords, etc.)
			{
				pattern: /[p|P][a|A][s|S][s|S][w|W][o|O][r|R][d|D].*['"][^"']{8,}['"]/g,
				weight: 1,
				name: "Password",
			},
			{
				pattern: /[t|T][o|O][k|K][e|E][n|N].*['"][0-9a-zA-Z]{15,}['"]/g,
				weight: 1,
				name: "Generic Token",
			},

			// Database connection strings
			{
				pattern: /mongodb\+srv:\/\/[a-zA-Z0-9:_@.-]+/g,
				weight: 2,
				name: "MongoDB Connection String",
			},
			{
				pattern: /postgres:\/\/[a-zA-Z0-9:_@.-]+/g,
				weight: 2,
				name: "PostgreSQL Connection String",
			},
			{
				pattern: /mysql:\/\/[a-zA-Z0-9:_@.-]+/g,
				weight: 2,
				name: "MySQL Connection String",
			},
		];

		// Check each pattern and accumulate weighted score
		for (const { pattern, weight } of secretPatterns) {
			const matches = (content.match(pattern) || []).length;
			score += matches * weight;
		}

		// Check for high entropy strings that might be secrets
		const highEntropyScore = this.detectHighEntropySecrets(content);
		score += highEntropyScore;

		// Cap at 10
		return Math.min(score, 10);
	}

	/**
	 * Detect high entropy strings that might be secrets
	 */
	private detectHighEntropySecrets(content: string): number {
		let score = 0;

		// Extract potential secret candidates (strings in quotes)
		const potentialSecrets =
			content.match(
				/["'`]([a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?]{16,100})["'`]/g,
			) || [];

		for (const potential of potentialSecrets) {
			// Extract the actual secret value (remove quotes)
			const secret = potential.substring(1, potential.length - 1);

			// Calculate entropy
			const entropy = this.calculateShannonEntropy(secret);

			// If entropy is high enough, it might be a secret
			// Threshold of 4.0 is commonly used for secret detection
			if (entropy > 4.0) {
				// Weight based on entropy value
				const entropyWeight = Math.min(3, Math.floor(entropy - 4.0));
				score += entropyWeight;
			}
		}

		return score;
	}

	/**
	 * Calculate Shannon entropy of a string
	 */
	private calculateShannonEntropy(str: string): number {
		if (str.length === 0) return 0;

		// Build a frequency map from the string
		const frequencies: Record<string, number> = {};
		for (const char of str) {
			frequencies[char] = (frequencies[char] || 0) + 1;
		}

		// Calculate entropy
		const len = str.length;
		let sum = 0;
		for (const f of Object.values(frequencies)) {
			const p = f / len;
			sum -= p * Math.log2(p);
		}

		return sum;
	}

	/**
	 * Get risk reasons based on content using comprehensive secret detection
	 */
	private getRiskReasons(content: string): string[] {
		const reasons: string[] = [];

		// Check for common secret patterns
		const secretPatterns = [
			{ pattern: /AKIA[0-9A-Z]{16}/g, name: "AWS Access Key" },
			{
				pattern: /[g|G][i|I][t|T][h|H][u|U][b|B].*['"][0-9a-zA-Z]{35,40}['"]/g,
				name: "GitHub Token",
			},
			{ pattern: /sk-[a-zA-Z0-9]{32,}/g, name: "OpenAI API Key" },
			{
				pattern: /[s|S][e|E][c|C][r|R][e|E][t|T].*['"][0-9a-zA-Z]{32,45}['"]/g,
				name: "Generic Secret",
			},
			{
				pattern: /[p|P][a|A][s|S][s|S][w|W][o|O][r|R][d|D].*['"][^"']{8,}['"]/g,
				name: "Password",
			},
			{
				pattern: /mongodb\+srv:\/\/[a-zA-Z0-9:_@.-]+/g,
				name: "MongoDB Connection String",
			},
			{
				pattern: /postgres:\/\/[a-zA-Z0-9:_@.-]+/g,
				name: "PostgreSQL Connection String",
			},
			{
				pattern: /mysql:\/\/[a-zA-Z0-9:_@.-]+/g,
				name: "MySQL Connection String",
			},
		];

		// Check each pattern
		for (const { pattern, name } of secretPatterns) {
			if (pattern.test(content)) {
				reasons.push(`${name} detected`);
			}
		}

		// Check for high entropy strings
		const potentialSecrets =
			content.match(
				/["'`]([a-zA-Z0-9!@#$%^&*()_+\-=[\]{}|;:,.<>?]{16,100})["'`]/g,
			) || [];
		for (const potential of potentialSecrets) {
			const secret = potential.substring(1, potential.length - 1);
			const entropy = this.calculateShannonEntropy(secret);
			if (entropy > 4.0) {
				reasons.push(
					`High entropy string detected (entropy: ${entropy.toFixed(2)})`,
				);
			}
		}

		// Fallback if no specific patterns matched but score is still high
		if (reasons.length === 0) {
			if (content.includes("API_KEY") || content.includes("SECRET")) {
				reasons.push("Hardcoded secret detected");
			}

			if (content.includes("password") || content.includes("Password")) {
				reasons.push("Password-related content detected");
			}

			if (content.includes("DELETE") || content.includes("DROP")) {
				reasons.push("Database operation detected");
			}
		}

		return reasons;
	}

	/**
	 * Handle warning level protection
	 */
	private async handleWarningLevel(
		document: vscode.TextDocument,
		decision: ProtectionDecision,
	): Promise<void> {
		// For warning level, we show a notification but don't block by default
		if (decision.decision === "Block" || decision.decision === "Warn") {
			// Show notification about potential risks
			const fileName = document.uri.path.split("/").pop() || "file";
			const message = `Potential risk detected in ${fileName}. Consider creating a snapshot before saving.`;

			// This would normally show a notification
			// For now, we'll just log it
			logger.info(message);
		}
	}

	/**
	 * Handle block level protection
	 */
	private async handleBlockLevel(
		document: vscode.TextDocument,
		decision: ProtectionDecision,
		event: vscode.TextDocumentWillSaveEvent,
	): Promise<void> {
		// For block level, we block the save unless user explicitly allows it
		if (decision.decision === "Block") {
			const fileName = document.uri.path.split("/").pop() || "file";

			// Show blocking dialog
			const dialogOptions: BlockDialogOptions = {
				fileName,
				filePath: document.uri.fsPath,
				protectionLevel: "Block",
				riskScore: decision.riskScore,
				reasons: decision.reasons,
				diagnosticMessage: decision.diagnosticMessage,
			};

			const action = await SnapBackDialogs.showBlockDialog(dialogOptions);

			switch (action) {
				case "continue":
					// Allow save without snapshot (not recommended)
					return;

				case "createSnapshot": {
					// Show override dialog to collect justification
					const overrideResult =
						await SnapBackDialogs.showOverrideDialog(dialogOptions);
					if (overrideResult.action === "override") {
						// Record justification and allow save
						await this.recordJustification(
							document,
							overrideResult.justification,
						);
						return;
					} else {
						// Cancel the save operation
						event.waitUntil(
							Promise.reject(
								new Error("Save cancelled by SnapBack protection"),
							),
						);
						return;
					}
				}

				case "cancel":
					// Cancel the save operation
					event.waitUntil(
						Promise.reject(new Error("Save cancelled by SnapBack protection")),
					);
					return;
			}
		}
	}

	/**
	 * Record justification for snapshot creation
	 */
	private async recordJustification(
		document: vscode.TextDocument,
		justification: string,
	): Promise<void> {
		// In a real implementation, this would:
		// 1. Create a snapshot of the document
		// 2. Record the justification with the snapshot
		// 3. Store in audit log

		const fileName = document.uri.path.split("/").pop() || "file";
		logger.info(
			`Snapshot created for ${fileName} with justification: ${justification}`,
		);

		// For now, we'll just store the justification in context state for demonstration
		const justifications = this.context.globalState.get<Record<string, string>>(
			"snapback.justifications",
			{},
		);
		justifications[document.uri.toString()] = justification;
		await this.context.globalState.update(
			"snapback.justifications",
			justifications,
		);
	}

	/**
	 * Record budget probe metrics
	 */
	private recordBudgetProbe(probeName: string, value: number): void {
		// In a real implementation, this would send metrics to a monitoring system
		logger.debug(`Budget probe ${probeName}: ${value}ms`);

		// For now, we'll just store in context state for demonstration
		const probes = this.context.globalState.get<Record<string, number[]>>(
			"snapback.budgetProbes",
			{},
		);
		if (!probes[probeName]) {
			probes[probeName] = [];
		}
		probes[probeName].push(value);
		this.context.globalState
			.update("snapback.budgetProbes", probes)
			.then(undefined, (error) =>
				logger.error(
					"Failed to update budget probes",
					error instanceof Error ? error : undefined,
				),
			);
	}
}
