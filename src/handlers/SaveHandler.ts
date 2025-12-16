import * as path from "node:path";
import type { ProtectionDecisionEngine } from "@snapback/sdk";
import * as vscode from "vscode";
import { type AIDetection, AIWarningManager } from "../ai/AIWarningManager";
import type { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider";
import type { OperationCoordinator } from "../operationCoordinator";
import type { AIRiskService } from "../services/aiRiskService";
import { NoopAIRiskService } from "../services/aiRiskService";
import type { MilestoneService } from "../services/MilestoneService";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import type { AnalysisResult, BasicAnalysisResult } from "../types/api";
import type { CooldownIndicator } from "../ui/cooldownIndicator";
import { logger } from "../utils/logger";
import { AnalysisCoordinator } from "./AnalysisCoordinator";
import { AuditLogger } from "./AuditLogger";
import { CooldownService } from "./CooldownService";
import { ProtectionLevelHandler } from "./ProtectionLevelHandler";

// Interface for cluster cache entries
interface ClusterTreeCache {
	anchorPath: string;
	depth1: string[];
	depth2: string[];
	timestamp: number; // For TTL-based invalidation
}

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
	private milestoneService?: MilestoneService;

	// Store iteration tracking data per file
	private iterationData: Map<string, IterationData> = new Map();

	// Cluster detection cache (in-memory with TTL-based invalidation)
	// NOTE: Cluster detection is disabled until @snapback/engine provides this functionality
	private clusterCache: Map<string, ClusterTreeCache> = new Map();
	// NOTE: ImportAnalyzer removed - cluster detection disabled until engine provides this

	constructor(
		private registry: ProtectedFileRegistry,
		operationCoordinator: OperationCoordinator,
		decorationProvider?: FileHealthDecorationProvider,
		aiRiskService?: AIRiskService,
		milestoneService?: MilestoneService,
	) {
		this.milestoneService = milestoneService;
		// Initialize services with proper dependency injection
		this.auditLogger = new AuditLogger(registry);
		this.cooldownService = new CooldownService(registry);

		// Use provided AIRiskService or create NoopAIRiskService
		const riskService = aiRiskService || new NoopAIRiskService();

		this.analysisCoordinator = new AnalysisCoordinator(registry, this.auditLogger, riskService, milestoneService);
		this.protectionLevelHandler = new ProtectionLevelHandler(
			registry,
			operationCoordinator,
			this.cooldownService,
			this.auditLogger,
			milestoneService,
		);
		this.aiWarningManager = new AIWarningManager();
		this.decorationProvider = decorationProvider || null;
		// NOTE: ImportAnalyzer removed - cluster detection disabled until engine provides this
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
	 * Initialize SDK ProtectionDecisionEngine.
	 * Per arch_remediation.md Task 1.3: SDK is the Single Source of Truth for protection decisions.
	 *
	 * @param engine - SDK ProtectionDecisionEngine instance
	 */
	public initializeDecisionEngine(engine: ProtectionDecisionEngine): void {
		this.protectionLevelHandler.initializeDecisionEngine(engine);
		logger.info("[SnapBack] SDK ProtectionDecisionEngine initialized in SaveHandler");
	}

	/**
	 * Check if user is allowed to save a file.
	 * Blocks non-pioneer users from saving files in clusters (protected dependent files).
	 *
	 * @param filePath - Absolute path to the file being saved
	 * @param profile - Current user's pioneer profile (null if not pioneer)
	 * @returns SaveCheckResult with allowed status and reason
	 */
	public async canSaveFile(
		filePath: string,
		profile: any | null, // PioneerProfile | null (avoid circular import)
	): Promise<{ allowed: boolean; reason?: string; clusterAnchor?: string; requiresSnapshot?: boolean }> {
		// If not a protected file, allow save
		if (!this.registry.isProtected(filePath)) {
			return { allowed: true };
		}

		// Get current anchor map from registry (simplified - in real impl, this would be more complex)
		// For now, just check if file is in registry as a dependent
		const clusterAnchor = await this.detectFileInCluster(filePath);

		// If file is in a cluster, check user tier
		if (clusterAnchor) {
			const isPioneer = this.isUserPioneer(profile);
			if (!isPioneer) {
				return {
					allowed: false,
					reason: "Only pioneers can modify files in clusters",
					clusterAnchor,
				};
			}
		}

		return { allowed: true, clusterAnchor: clusterAnchor ?? undefined, requiresSnapshot: !!clusterAnchor };
	}

	/**
	 * Detect if a file is part of any cluster (dependent file).
	 * Returns the anchor file if found, null otherwise.
	 *
	 * NOTE: Cluster detection is disabled until @snapback/engine provides this functionality.
	 * The ClusterManager and ImportAnalyzer were orphaned and have been removed.
	 *
	 * @param filePath - Absolute path to check
	 * @returns null (cluster detection disabled)
	 */
	public async detectFileInCluster(_filePath: string): Promise<string | null> {
		// Cluster detection disabled - ImportAnalyzer was removed
		// TODO: Re-enable when @snapback/engine provides cluster detection
		return null;
	}

	/**
	 * Check if user is a pioneer (has active profile).
	 * All pioneer tiers (seedling+) can use clusters.
	 *
	 * @param profile - Pioneer profile or null
	 * @returns true if user is a pioneer, false otherwise
	 */
	public isUserPioneer(profile: any | null): boolean {
		// Simplified check - profile must exist and have a tier
		return profile !== null && profile !== undefined && profile.tier !== undefined;
	}

	/**
	 * Invalidate cluster cache for files that were edited.
	 * Called when a file is modified to prevent stale cluster detection.
	 *
	 * Invalidation Behavior:
	 * - If anchor file is edited: removes entire cluster cache entry
	 * - If dependency file is edited: removes anchor's cache (rebuilds on next access)
	 * - Prevents stale detection when imports change
	 * - O(c*d) complexity where c = cached anchors, d = dependency depth
	 *
	 * @param filePath - Path to file that was edited
	 */
	private invalidateFileCache(filePath: string): void {
		// Remove any cache entries where this file is the anchor OR appears in depth1/depth2
		const toDelete: string[] = [];

		for (const [anchorPath, tree] of this.clusterCache.entries()) {
			// Invalidate if:
			// 1. This file is the anchor itself
			// 2. This file is in the dependency tree (invalidate entire cluster)
			if (anchorPath === filePath || tree.depth1.includes(filePath) || tree.depth2.includes(filePath)) {
				toDelete.push(anchorPath);
			}
		}

		// Remove invalidated entries
		for (const anchorPath of toDelete) {
			this.clusterCache.delete(anchorPath);
		}

		logger.debug("Cache invalidated for file edits", {
			filePath,
			entriesRemoved: toDelete.length,
		});
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

			// 🔍 DIAGNOSTIC: Save triggered
			console.log("[SaveHandler] =====================================");
			console.log(`[SaveHandler] Save triggered for: ${filePath}`);
			console.log(`[SaveHandler] Timestamp: ${Date.now()}`);
			console.log(`[SaveHandler] Is protected: ${this.registry.isProtected(filePath)}`);

			// Check if protected (synchronous check)
			if (!this.registry.isProtected(filePath)) {
				console.log("[SaveHandler] File not protected, skipping");
				return; // Exit early, don't call waitUntil
			}

			logger.info("Protected file being saved", { filePath });

			// 🆕 Track First Protected Save (Activation Funnel)
			const hasTrackedSave = context.globalState.get<boolean>("snapback.hasProtectedSave", false);

			if (!hasTrackedSave && this.milestoneService) {
				// Fire and forget notification - wrapped in async IIFE
				void (async () => {
					if (this.milestoneService) {
						await this.milestoneService.triggerFirstTimeEvent(
							"first_protected_save",
							"SnapBack Active! 🛡️",
							"Your first protected save is secure. We'll watch your back from here.",
						);
						// Mark as tracked locally to avoid repeat calls
						await context.globalState.update("snapback.hasProtectedSave", true);
					}
				})();
			}

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
					this.handleProtectedFileSave(filePath, preSaveContent, event.document),
				),
			);
		});

		context.subscriptions.push(disposable);

		// Register document change listener to invalidate cache when files are edited
		// This prevents stale cluster detection after dependency changes
		const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
			const filePath = event.document.uri.fsPath;
			if (this.registry.isProtected(filePath)) {
				this.invalidateFileCache(filePath);
			}
		});

		context.subscriptions.push(changeDisposable);
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

		// P0 FIX: Error boundary for analyzeAndPublish
		// If analysis fails, continue with save using default protection
		try {
			await this.analysisCoordinator.analyzeAndPublish(filePath, filename, preSaveContent, document);
			logger.debug("Risk analysis completed", {
				correlationId,
				filePath,
				duration: Date.now() - analysisStartTime,
				step: "analysis_completed",
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const baseFilename = path.basename(filePath);

			logger.error(`Analysis failed for ${baseFilename}, applying safe default protection: ${errorMessage}`);

			// Show user-friendly message
			vscode.window.showWarningMessage(
				`Code analysis unavailable. Applied safe protection to ${baseFilename}.`,
				"OK",
			);

			// Continue with save - analysis failure does not block save
		}

		// If analysis resulted in blocking (user cancelled), the coordinator already threw CancellationError
		// If we get here, analysis passed or user chose to proceed

		// Step 1.5: Check for AI detection and show warning if needed
		const iterationStats = this.getIterationStats(filePath);
		if (iterationStats.riskLevel === "high" && AIWarningManager.shouldWarn(0.7)) {
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

			const warningResult = await this.aiWarningManager.showWarning(aiDetection);

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
				}
				if (choice === "review") {
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
		const protectionLevel = this.registry.getProtectionLevel(filePath) || "watch";
		const protectionStartTime = Date.now();

		// 🔍 DIAGNOSTIC: Before calling ProtectionLevelHandler
		console.log("[SaveHandler] Calling ProtectionLevelHandler.handleProtectionLevel()");
		console.log(`[SaveHandler] Protection level: ${protectionLevel}`);

		logger.debug("Starting protection level handling", {
			correlationId,
			filePath,
			step: "protection_started",
		});
		const protectionResult = await this.protectionLevelHandler.handleProtectionLevel(
			filePath,
			filename,
			preSaveContent,
			document,
		);

		// 🔍 DIAGNOSTIC: After ProtectionLevelHandler returns
		console.log("[SaveHandler] ProtectionLevelHandler returned:", JSON.stringify(protectionResult));
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
				const protectionLevel = this.registry.getProtectionLevel(filePath) || "watch";
				const analysisResult = this.analysisCoordinator.lastAnalysisResult;
				const healthLevel = this.determineHealthLevel(protectionLevel, analysisResult);
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
	private updateIterationData(filePath: string, preSaveContent: string, postSaveContent: string): void {
		const now = Date.now();
		const editSize = Math.abs(postSaveContent.length - preSaveContent.length);

		// Get existing data or create new
		const existingData = this.iterationData.get(filePath);

		let consecutiveAIEdits = 1;
		let velocity = 0;

		if (existingData) {
			// Calculate time difference in minutes
			const timeDiffMinutes = (now - existingData.lastEditTimestamp) / (1000 * 60);

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
		if (normalizedProtectionLevel === "warning" || (risk && risk.score >= 0.3)) {
			return "warning";
		}

		// Protected with no/low risk → green badge
		if (normalizedProtectionLevel === "protected" || normalizedProtectionLevel === "watched") {
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
