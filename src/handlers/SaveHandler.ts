import * as vscode from "vscode";
import { type AIDetection, AIWarningManager } from "../ai/AIWarningManager.js";
import type { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider.js";
import type { OperationCoordinator } from "../operationCoordinator.js";
import type { AIRiskService } from "../services/aiRiskService.js";
import { NoopAIRiskService } from "../services/aiRiskService.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import type { AnalysisResult, BasicAnalysisResult } from "../types/api.js";
import type { CooldownIndicator } from "../ui/cooldownIndicator.js";
import { logger } from "../utils/logger.js";
import { AnalysisCoordinator } from "./AnalysisCoordinator.js";
import { AuditLogger } from "./AuditLogger.js";
import { CooldownService } from "./CooldownService.js";
import { ProtectionLevelHandler } from "./ProtectionLevelHandler.js";

// Interface for iteration tracking data
interface IterationData {
	consecutiveAIEdits: number;
	lastEditTimestamp: number;
	riskLevel: "low" | "medium" | "high";
	velocity: number; // edits per minute
	lastEditSize: number; // size of last edit in characters
}

/**
 * Main orchestrator for protected file save handling.
 * Delegates to specialized services for analysis, protection, cooldown, and audit logging.
 *
 * Architecture:
 * - AnalysisCoordinator: Risk analysis and diagnostics
 * - ProtectionLevelHandler: Watch/Warn/Block logic
 * - CooldownService: Debouncing and cooldown periods
 * - AuditLogger: Audit trail recording
 *
 * Flow:
 * 1. Capture pre-save content from disk
 * 2. Run risk analysis (API or offline fallback)
 * 3. Handle protection level logic (delegated)
 * 4. Create snapshot if needed (delegated)
 * 5. Record audit trail (delegated)
 */
export class SaveHandler {
	private analysisCoordinator: AnalysisCoordinator;
	private protectionLevelHandler: ProtectionLevelHandler;
	private cooldownService: CooldownService;
	private auditLogger: AuditLogger;
	private aiWarningManager: AIWarningManager;
	private decorationProvider: FileHealthDecorationProvider | null = null;

	// Store iteration tracking data per file
	private iterationData: Map<string, IterationData> = new Map();

	constructor(
		private registry: ProtectedFileRegistry,
		operationCoordinator: OperationCoordinator,
		decorationProvider?: FileHealthDecorationProvider,
		aiRiskService?: AIRiskService,
	) {
		// Initialize services with proper dependency injection
		this.auditLogger = new AuditLogger(registry);
		this.cooldownService = new CooldownService(registry);

		// Use provided AIRiskService or create NoopAIRiskService
		const riskService = aiRiskService || new NoopAIRiskService();

		this.analysisCoordinator = new AnalysisCoordinator(
			registry,
			this.auditLogger,
			riskService,
		);
		this.protectionLevelHandler = new ProtectionLevelHandler(
			registry,
			operationCoordinator,
			this.cooldownService,
			this.auditLogger,
		);
		this.aiWarningManager = new AIWarningManager();
		this.decorationProvider = decorationProvider || null;
	}

	/**
	 * Set cooldown indicator for UI updates.
	 * Should be called during extension activation after cooldown indicator is created.
	 *
	 * @param cooldownIndicator - UI component for cooldown display
	 */
	public setCooldownIndicator(cooldownIndicator: CooldownIndicator): void {
		this.cooldownService.setCooldownIndicator(cooldownIndicator);
	}

	/**
	 * Register save event handler with VS Code.
	 * CRITICAL: waitUntil MUST be called synchronously!
	 *
	 * @param context - Extension context for disposable registration
	 */
	register(context: vscode.ExtensionContext): void {
		const disposable = vscode.workspace.onWillSaveTextDocument((event) => {
			const filePath = event.document.uri.fsPath;

			// Check if protected (synchronous check)
			if (!this.registry.isProtected(filePath)) {
				return; // Exit early, don't call waitUntil
			}

			logger.info("Protected file being saved", { filePath });

			// Capture PRE-SAVE content from disk, not from the in-memory document
			// This ensures we capture the actual state that will be overwritten by the save
			const getPreSaveContent = async (): Promise<string> => {
				try {
					// Read the current on-disk content
					const fileUri = vscode.Uri.file(filePath);
					const fileBytes = await vscode.workspace.fs.readFile(fileUri);
					return Buffer.from(fileBytes).toString("utf8");
				} catch (_error) {
					// If file doesn't exist on disk (new file), use the document content
					logger.debug("File doesn't exist on disk, using document content", {
						filePath,
					});
					return event.document.getText();
				}
			};

			// CRITICAL: waitUntil must be called SYNCHRONOUSLY
			// We pass a Thenable (Promise) but call waitUntil immediately
			event.waitUntil(
				getPreSaveContent().then((preSaveContent) =>
					this.handleProtectedFileSave(
						filePath,
						preSaveContent,
						event.document,
					),
				),
			);
		});

		context.subscriptions.push(disposable);
	}

	/**
	 * Handle protected file save with level-based behavior.
	 * This is the main orchestrator method that coordinates all services.
	 *
	 * Flow:
	 * 1. Run risk analysis (AnalysisCoordinator)
	 * 2. Handle protection level logic (ProtectionLevelHandler)
	 * 3. All audit logging and cooldown management is delegated
	 *
	 * @param filePath - Absolute path to the file being saved
	 * @param preSaveContent - PRE-SAVE content captured from disk (CRITICAL for proper snapshotting)
	 * @param document - VS Code document being saved
	 * @throws vscode.CancellationError if save should be blocked
	 */
	private async handleProtectedFileSave(
		filePath: string,
		preSaveContent: string,
		document: vscode.TextDocument,
	): Promise<void> {
		const filename = document.fileName.split(/[\\/]/).pop() || "unknown";
		// Generate unique correlation ID for this save operation
		const correlationId = Math.random().toString(36).substring(2, 8);
		const startTime = Date.now();

		logger.info("Save operation started", {
			correlationId,
			filePath,
			filename,
			contentLength: preSaveContent.length,
			operation: "save_started",
		});

		logger.debug("Iteration data and analysis prep", {
			correlationId,
			filePath,
			step: "prep_started",
		});

		// Update iteration tracking data
		this.updateIterationData(filePath, preSaveContent, document.getText());

		// Step 1: Run risk analysis and publish diagnostics
		// This handles API calls, fallback detection, and diagnostic publishing
		const analysisStartTime = Date.now();
		logger.debug("Starting risk analysis", {
			correlationId,
			filePath,
			step: "analysis_started",
		});
		await this.analysisCoordinator.analyzeAndPublish(
			filePath,
			filename,
			preSaveContent,
			document,
		);
		logger.debug("Risk analysis completed", {
			correlationId,
			filePath,
			duration: Date.now() - analysisStartTime,
			step: "analysis_completed",
		});

		// If analysis resulted in blocking (user cancelled), the coordinator already threw CancellationError
		// If we get here, analysis passed or user chose to proceed

		// Step 1.5: Check for AI detection and show warning if needed
		const iterationStats = this.getIterationStats(filePath);
		if (
			iterationStats.riskLevel === "high" &&
			AIWarningManager.shouldWarn(0.7)
		) {
			const aiDetection: AIDetection = {
				tool: "BURST_PATTERN",
				confidence: Math.min(1, iterationStats.velocity / 15),
				pattern: "rapid_edits",
			};

			logger.debug("Showing AI warning dialog", {
				correlationId,
				filePath,
				riskLevel: iterationStats.riskLevel,
				step: "ai_warning_dialog",
			});

			const warningResult =
				await this.aiWarningManager.showWarning(aiDetection);

			// Handle the Result type - check if warning dialog succeeded
			if (warningResult.success === false) {
				// Dialog failed or was dismissed
				logger.warn("AI warning dialog failed, proceeding with save", {
					correlationId,
					filePath,
					error: warningResult.error,
					step: "ai_warning_failed",
				});
				// Continue with save normally
			} else {
				// Dialog succeeded - check user choice
				const { choice } = warningResult.value;

				if (choice === "restore") {
					logger.info("User chose to restore after AI warning", {
						correlationId,
						filePath,
						step: "ai_warning_restore",
					});
					throw new vscode.CancellationError();
				} else if (choice === "review") {
					logger.info("User chose to review changes after AI warning", {
						correlationId,
						filePath,
						step: "ai_warning_review",
					});
					// User can review in editor before deciding to save
				}
				// If user chose "accept", continue normally
			}
		}

		// Step 2: Handle protection level logic (Watch/Warn/Block)
		// This handles temporary allowances, cooldown checks, snapshot creation, and audit logging
		const protectionStartTime = Date.now();
		logger.debug("Starting protection level handling", {
			correlationId,
			filePath,
			step: "protection_started",
		});
		const protectionResult =
			await this.protectionLevelHandler.handleProtectionLevel(
				filePath,
				filename,
				preSaveContent,
				document,
			);
		logger.debug("Protection level handling completed", {
			correlationId,
			filePath,
			duration: Date.now() - protectionStartTime,
			reason: protectionResult.reason,
			step: "protection_completed",
		});

		// If protection handler blocks the save, it will throw CancellationError
		// If we get here, save is allowed to proceed

		const decorationStartTime = Date.now();
		logger.debug("Starting decoration update", {
			correlationId,
			filePath,
			step: "decoration_started",
		});

		logger.info("Protected file save completed", {
			correlationId,
			filePath,
			filename,
			shouldSnapshot: protectionResult.shouldSnapshot,
			reason: protectionResult.reason,
			snapshotId: protectionResult.snapshotId,
			totalDuration: Date.now() - startTime,
			decorationDuration: 0,
			status: "completed",
		});

		// Update file decoration if provider is available
		if (this.decorationProvider) {
			try {
				const protectionLevel =
					this.registry.getProtectionLevel(filePath) || "Watched";
				const analysisResult = this.analysisCoordinator.lastAnalysisResult;
				const healthLevel = this.determineHealthLevel(
					protectionLevel,
					analysisResult,
				);
				// Convert protection level to lowercase for the decoration provider
				// Make case-insensitive to handle different registry return values
				const normalizedProtectionLevel = protectionLevel.toLowerCase();
				const decorationProtectionLevel =
					normalizedProtectionLevel === "watched"
						? "watch"
						: normalizedProtectionLevel === "warning"
							? "warn"
							: "block";
				this.decorationProvider.updateFileHealth(
					vscode.Uri.file(filePath),
					healthLevel,
					decorationProtectionLevel as "watch" | "warn" | "block",
				);
				logger.debug("File decoration updated", {
					correlationId,
					filePath,
					healthLevel,
					protectionLevel: decorationProtectionLevel,
					duration: Date.now() - decorationStartTime,
					step: "decoration_completed",
				});
			} catch (error) {
				logger.warn("Failed to update file decoration", {
					correlationId,
					filePath,
					error: error instanceof Error ? error.message : String(error),
					step: "decoration_failed",
				});
			}
		}
	}

	/**
	 * Update iteration tracking data for a file
	 *
	 * @param filePath - Absolute path to the file
	 * @param preSaveContent - Content before save
	 * @param postSaveContent - Content after save
	 */
	private updateIterationData(
		filePath: string,
		preSaveContent: string,
		postSaveContent: string,
	): void {
		const now = Date.now();
		const editSize = Math.abs(postSaveContent.length - preSaveContent.length);

		// Get existing data or create new
		const existingData = this.iterationData.get(filePath);

		let consecutiveAIEdits = 1;
		let velocity = 0;

		if (existingData) {
			// Calculate time difference in minutes
			const timeDiffMinutes =
				(now - existingData.lastEditTimestamp) / (1000 * 60);

			// If last edit was within 10 minutes, increment consecutive count
			if (timeDiffMinutes <= 10) {
				consecutiveAIEdits = existingData.consecutiveAIEdits + 1;
			}

			// Calculate velocity (edits per minute) based on last 5 edits
			velocity = consecutiveAIEdits / Math.max(timeDiffMinutes, 0.1);
		}

		// Determine risk level based on consecutive edits and velocity
		let riskLevel: "low" | "medium" | "high" = "low";
		if (consecutiveAIEdits >= 5 || velocity > 10) {
			riskLevel = "high";
		} else if (consecutiveAIEdits >= 3 || velocity > 5) {
			riskLevel = "medium";
		}

		// Store updated data
		this.iterationData.set(filePath, {
			consecutiveAIEdits,
			lastEditTimestamp: now,
			riskLevel,
			velocity,
			lastEditSize: editSize,
		});
	}

	/**
	 * Get iteration statistics for a file
	 *
	 * @param filePath - Absolute path to the file
	 * @returns Iteration statistics
	 */
	public getIterationStats(filePath: string): IterationData {
		return (
			this.iterationData.get(filePath) || {
				consecutiveAIEdits: 0,
				lastEditTimestamp: 0,
				riskLevel: "low",
				velocity: 0,
				lastEditSize: 0,
			}
		);
	}

	/**
	 * Determine health level based on protection level and risk analysis
	 *
	 * @param protectionLevel - The protection level of the file
	 * @param risk - The risk analysis result
	 * @returns The health level for decoration
	 */
	private determineHealthLevel(
		protectionLevel: string,
		risk: AnalysisResult | BasicAnalysisResult | null,
	): "protected" | "warning" | "risk" {
		// Normalize protection level to handle case differences
		const normalizedProtectionLevel = protectionLevel.toLowerCase();

		// High risk detected → red badge
		// Note: risk.score is normalized to 0-1 scale by AnalysisCoordinator
		if (risk && risk.score >= 0.6) {
			return "risk";
		}

		// Warn level OR moderate risk → yellow badge
		// Note: risk.score is normalized to 0-1 scale by AnalysisCoordinator
		if (
			normalizedProtectionLevel === "warning" ||
			(risk && risk.score >= 0.3)
		) {
			return "warning";
		}

		// Protected with no/low risk → green badge
		if (
			normalizedProtectionLevel === "protected" ||
			normalizedProtectionLevel === "watched"
		) {
			return "protected";
		}

		// Default: protected
		return "protected";
	}

	/**
	 * Dispose of resources.
	 * Called during extension deactivation.
	 */
	dispose(): void {
		this.analysisCoordinator.dispose();
		this.cooldownService.clearAll();
	}
}
