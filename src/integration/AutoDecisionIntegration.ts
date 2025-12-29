/**
 * AutoDecisionIntegration
 *
 * Bridges VS Code file events to AutoDecisionEngine domain logic.
 *
 * Flow:
 * 1. onDidChangeTextDocument fires → onFileChange() buffers event
 * 2. 300ms debounce expires → processBatch() called
 * 3. processBatch() builds SaveContext from buffered events
 * 4. AutoDecisionEngine.makeDecision() evaluates signals
 * 5. NotificationAdapter converts decision to UserNotification
 * 6. SnapshotOrchestrator creates snapshot if needed
 * 7. Show notification to user
 *
 * Runs parallel to SaveHandler (no replacement).
 */

import * as crypto from "node:crypto";
import * as path from "node:path";
import { SnapBackEvent, type SnapBackEventBus } from "@snapback/contracts";
import * as vscode from "vscode";
import { SettingsLoader } from "../config/settingsLoader";
import { AutoDecisionEngine } from "../domain/engine";
import { NotificationAdapter } from "../domain/notificationAdapter";
import type { FileInfo } from "../domain/signalAggregator";
import { createSignalAggregator, type SignalAggregator } from "../domain/signalAggregator";
import type { AutoDecisionConfig, ProtectionDecision, SaveContext } from "../domain/types";
import { DEFAULT_CONFIG } from "../domain/types";
import { FeedbackManager } from "../engine/FeedbackManager";
import type { NotificationManager } from "../notificationManager";
import { RecoveryUXNotification } from "../notifications/RecoveryUXNotification";
import type { OperationCoordinator } from "../operationCoordinator";
import type { AIRiskAssessment, AIRiskService, ChangeToAssess } from "../services/aiRiskService";
import { getWorkspaceVitalsSync } from "../services/IntelligenceService";
import type { WorkspaceVitalsProxy } from "../services/LanguageClient";
import { refreshVitalsCache } from "../services/LanguageClient";
import type { WorkspaceContextManager } from "../services/WorkspaceContextManager";
import type { SnapshotManager } from "../snapshot/SnapshotManager";
import { absoluteToWorkspaceRelative, createAbsolutePath } from "../types/PathBrands";
import { detectAIPresence } from "../utils/AIPresenceDetector";
import { logger } from "../utils/logger";

export interface FileChangeEvent {
	type: "change" | "save" | "create" | "delete";
	filePath: string;
	content?: string;
	timestamp: number;
}

/**
 * Orchestrates domain components for session-level file protection
 */
export class AutoDecisionIntegration {
	private engine: AutoDecisionEngine;
	private adapter: NotificationAdapter;
	private signalAggregator: SignalAggregator;
	private settingsLoader: SettingsLoader | null = null;
	private snapshotManager: SnapshotManager;
	private operationCoordinator: OperationCoordinator | null = null;
	private workspaceContextManager: WorkspaceContextManager;
	private aiRiskService: AIRiskService | null = null;
	private eventBus: SnapBackEventBus | null = null;

	/** Workspace Vitals Proxy - provides vitals interface via LSP */
	private vitals: WorkspaceVitalsProxy;

	/** Handler for SNAPSHOT_CREATED events - needs to be stored for unsubscription */
	private snapshotCreatedHandler: ((payload: unknown) => void) | null = null;

	private fileBuffer: FileChangeEvent[] = [];
	private bufferTimeout: NodeJS.Timeout | null = null;
	private isProcessing = false;
	private disposables: vscode.Disposable[] = [];
	private isActive = false;
	// private repoId: string;

	private readonly DEBOUNCE_MS = 300;
	private readonly IGNORE_PATTERNS = ["node_modules/**", "dist/**", ".git/**", ".vscode/**", "*.lock", "*.log"];

	private readonly BINARY_EXTENSIONS = [
		".png",
		".jpg",
		".jpeg",
		".gif",
		".svg",
		".pdf",
		".zip",
		".exe",
		".dll",
		".so",
		".dylib",
		".bin",
	];

	constructor(
		snapshotManager: SnapshotManager,
		_notificationManager: NotificationManager,
		workspaceContextManager: WorkspaceContextManager,
		config?: Partial<AutoDecisionConfig>,
		context?: vscode.ExtensionContext,
		aiRiskService?: AIRiskService,
		operationCoordinator?: OperationCoordinator,
		eventBus?: SnapBackEventBus,
	) {
		// Store dependencies
		this.snapshotManager = snapshotManager;
		this.operationCoordinator = operationCoordinator ?? null;
		this.workspaceContextManager = workspaceContextManager;
		this.aiRiskService = aiRiskService ?? null;
		this.eventBus = eventBus ?? null;

		// Initialize SettingsLoader if context available
		if (context) {
			this.settingsLoader = new SettingsLoader(context);

			// Listen for settings changes and update engine
			this.settingsLoader.onSettingsChange((settings) => {
				this.engine.updateConfig({
					riskThreshold: settings.autoDecision.riskThreshold,
					notifyThreshold: settings.autoDecision.notifyThreshold,
					minFilesForBurst: settings.autoDecision.minFilesForBurst,
					maxSnapshotsPerMinute: settings.autoDecision.maxSnapshotsPerMinute,
				});
				logger.info("AutoDecisionEngine updated with new settings", {
					settings: settings.autoDecision,
				});
			});
		}

		// Merge settings-based config if available
		let mergedConfig: AutoDecisionConfig = { ...DEFAULT_CONFIG, ...config };
		if (this.settingsLoader) {
			const loadedSettings = this.settingsLoader.loadAutoDecisionSettings();
			mergedConfig = {
				...mergedConfig,
				riskThreshold: loadedSettings.riskThreshold,
				notifyThreshold: loadedSettings.notifyThreshold,
				minFilesForBurst: loadedSettings.minFilesForBurst,
				maxSnapshotsPerMinute: loadedSettings.maxSnapshotsPerMinute,
			};
		}

		this.engine = new AutoDecisionEngine(mergedConfig);
		this.adapter = new NotificationAdapter();
		// this.repoId = this.getRepoId();

		this.signalAggregator = createSignalAggregator();

		// Initialize WorkspaceVitals for this workspace (singleton via IntelligenceService)
		const workspaceId = workspaceContextManager.getWorkspaceRoot() || "default";
		this.vitals = getWorkspaceVitalsSync(workspaceId);

		logger.info("AutoDecisionIntegration initialized", {
			config: mergedConfig,
			hasOperationCoordinator: !!operationCoordinator,
		});
	}

	/**
	 * Activate integration: start listening to file change events
	 */
	activate(): void {
		if (this.isActive) {
			logger.warn("AutoDecisionIntegration already active");
			return;
		}

		this.isActive = true;
		this.registerTextDocumentListener();
		this.registerSaveListener();

		// Subscribe to SNAPSHOT_CREATED events from the EventBus
		// This ensures vitals.onSnapshot() is called for ALL snapshot sources
		// (manual, AI-detected, MCP, CLI) - not just AI-triggered ones
		if (this.eventBus) {
			this.snapshotCreatedHandler = (payload: unknown) => {
				// Extract file path from payload if available
				const typedPayload = payload as { id?: string; name?: string; filePath?: string } | undefined;
				const filePath = typedPayload?.filePath || typedPayload?.name || "unknown";

				logger.debug("SNAPSHOT_CREATED event received, resetting vitals pressure", {
					snapshotId: typedPayload?.id,
					filePath,
				});

				// Reset vitals pressure - sends to Language Server
				this.vitals.onSnapshot({ filePath });

				// CRITICAL FIX: Refresh vitals cache immediately after onSnapshot
				// Without this, the cache (30s TTL) would still show stale high pressure
				// which causes the popup to keep appearing
				const workspaceId = this.workspaceContextManager.getWorkspaceRoot() || "default";
				void refreshVitalsCache(workspaceId).catch((err) => {
					logger.warn("Failed to refresh vitals cache after snapshot", {
						error: err instanceof Error ? err.message : String(err),
					});
				});
			};

			this.eventBus.on(SnapBackEvent.SNAPSHOT_CREATED, this.snapshotCreatedHandler);
			logger.debug("Subscribed to SNAPSHOT_CREATED events for vitals pressure reset");
		}

		logger.info("AutoDecisionIntegration activated");
	}

	/**
	 * Deactivate integration: stop listening and cleanup
	 */
	deactivate(): void {
		if (!this.isActive) {
			return;
		}

		this.isActive = false;

		// Cancel pending debounce
		if (this.bufferTimeout) {
			clearTimeout(this.bufferTimeout);
			this.bufferTimeout = null;
		}

		// Dispose all listeners
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
		this.fileBuffer = [];

		// Unsubscribe from EventBus events
		if (this.eventBus && this.snapshotCreatedHandler) {
			this.eventBus.off(SnapBackEvent.SNAPSHOT_CREATED, this.snapshotCreatedHandler);
			this.snapshotCreatedHandler = null;
			logger.debug("Unsubscribed from SNAPSHOT_CREATED events");
		}

		// Dispose settings loader
		if (this.settingsLoader) {
			this.settingsLoader.dispose();
		}

		logger.info("AutoDecisionIntegration deactivated");
	}

	/**
	 * Register listener for onDidChangeTextDocument events
	 */
	private registerTextDocumentListener(): void {
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				const { document } = event;

				// Skip if not in workspace
				if (!vscode.workspace.getWorkspaceFolder(document.uri)) {
					return;
				}

				// Skip ignored files
				if (this.shouldIgnoreFile(document.uri.fsPath)) {
					return;
				}

				this.onFileChange({
					type: "change",
					filePath: document.uri.fsPath,
					content: document.getText(),
					timestamp: Date.now(),
				});
			}),
		);

		logger.debug("Text document change listener registered");
	}

	/**
	 * Register listener for onDidSaveTextDocument events
	 */
	private registerSaveListener(): void {
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument((document) => {
				// Skip ignored files
				if (this.shouldIgnoreFile(document.uri.fsPath)) {
					return;
				}

				this.onFileChange({
					type: "save",
					filePath: document.uri.fsPath,
					content: document.getText(),
					timestamp: Date.now(),
				});
			}),
		);

		logger.debug("Save listener registered");
	}

	/**
	 * Check if file should be ignored
	 */
	private shouldIgnoreFile(filePath: string): boolean {
		const extension = path.extname(filePath).toLowerCase();

		// Ignore binary files
		if (this.BINARY_EXTENSIONS.includes(extension)) {
			return true;
		}

		// Ignore patterns
		for (const pattern of this.IGNORE_PATTERNS) {
			const regexPattern = pattern.replace(/\*\*/g, "(.*/)?").replace(/\*/g, "[^/]*").replace(/\./g, "\\.");
			const regex = new RegExp(regexPattern);

			if (regex.test(filePath)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Handle file change event: buffer and debounce
	 */
	private onFileChange(event: FileChangeEvent): void {
		if (!this.isActive) {
			return;
		}

		// Feed event to Vitals for real-time tracking
		const aiPresence = detectAIPresence();
		this.vitals.onFileChange({
			path: event.filePath,
			isAI: aiPresence.hasAI,
			tool: aiPresence.detectedAssistants[0],
		});

		this.fileBuffer.push(event);

		// Reset debounce timer
		if (this.bufferTimeout) {
			clearTimeout(this.bufferTimeout);
		}

		this.bufferTimeout = setTimeout(() => this.processBatch(), this.DEBOUNCE_MS);
	}

	/**
	 * Process buffered file changes:
	 * 1. Build SaveContext
	 * 2. Run AutoDecisionEngine
	 * 3. Adapt to notification
	 * 4. Execute decision (snapshot + notification)
	 */
	private async processBatch(): Promise<void> {
		if (this.fileBuffer.length === 0) {
			return;
		}

		// Prevent concurrent processing
		if (this.isProcessing) {
			logger.debug("Batch processing already in progress, queueing next batch");
			return;
		}

		this.isProcessing = true;

		try {
			// Step 1: Extract file info from buffered events
			const fileInfos = await Promise.all(
				this.fileBuffer.map((event) => this.extractFileInfo(event.filePath, event.content || "")),
			);

			// 🔍 DIAGNOSTIC: Process batch
			const workspaceRoot = this.workspaceContextManager.getWorkspaceRoot();
			console.log("[AutoDecision] processBatch() called");
			console.log(`[AutoDecision] Files in batch: ${fileInfos.length}`);
			console.log(`[AutoDecision] Workspace root: ${workspaceRoot}`);

			// Step 2: Build SaveContext
			const saveContext = await this.buildSaveContext(fileInfos);

			logger.debug("SaveContext built", {
				fileCount: saveContext.files.length,
				riskScore: saveContext.riskScore,
				aiDetected: saveContext.aiDetected,
				burstDetected: saveContext.burstDetected,
			});

			// Step 3: Get Vitals threshold multiplier for dynamic adjustment
			const thresholdMultiplier = this.vitals.getThresholdMultiplier();
			const currentVitals = this.vitals.current();

			logger.debug("Vitals state", {
				pulse: currentVitals.pulse.level,
				temperature: currentVitals.temperature.level,
				pressure: currentVitals.pressure.value,
				oxygen: currentVitals.oxygen.value,
				trajectory: currentVitals.trajectory,
				thresholdMultiplier,
			});

			// Apply threshold multiplier to risk score for vitals-informed decision
			const adjustedRiskScore = Math.min(100, saveContext.riskScore / thresholdMultiplier);
			const vitalsAdjustedContext: SaveContext = {
				...saveContext,
				riskScore: adjustedRiskScore,
			};

			// Step 4: Run AutoDecisionEngine with vitals-adjusted context
			const decision = this.engine.makeDecision(vitalsAdjustedContext);

			logger.debug("Decision made", {
				createSnapshot: decision.createSnapshot,
				showNotification: decision.showNotification,
				reasons: decision.reasons,
				confidence: decision.confidence,
			});

			// 🆕 Trigger FeedbackManager if burst is detected
			// This allows users to report AI detection accuracy
			if (saveContext.burstDetected) {
				const feedbackManager = FeedbackManager.getInstance();
				const detectionId = `burst-${Date.now()}-${Math.random().toString(36).slice(7)}`;
				const confidence = decision.confidence; // Use decision confidence as AI confidence
				feedbackManager.handleDetection(detectionId, confidence);
				logger.debug("FeedbackManager triggered for burst detection", {
					detectionId,
					confidence,
				});
			}

			// Step 4: Execute decision
			await this.executeDecision(decision, saveContext);
		} catch (error) {
			logger.error("Error processing batch", error as Error);
		} finally {
			this.isProcessing = false;
			this.fileBuffer = [];
		}
	}

	/**
	 * Extract file metadata for SaveContext
	 *
	 * CRITICAL: Uses WorkspaceContextManager for dynamic workspace resolution
	 * to prevent multi-workspace bugs (Antipattern #2)
	 */
	private async extractFileInfo(filePath: string, content: string): Promise<FileInfo> {
		// Get dynamic workspace root - NEVER cached (fixes Antipattern #2)
		const workspaceRoot = this.workspaceContextManager.getWorkspaceRoot();

		if (!workspaceRoot) {
			logger.warn("No workspace root available, using absolute path", { filePath });
			return {
				path: filePath,
				extension: path.extname(filePath),
				sizeBytes: Buffer.byteLength(content, "utf-8"),
				isNew: false,
				isBinary: this.isBinaryContent(content, path.extname(filePath)),
				nextHash: crypto.createHash("sha256").update(content).digest("hex"),
			};
		}

		try {
			// Use branded path types for type safety (fixes Antipattern #3)
			const absolutePath = createAbsolutePath(filePath);
			const workspaceRootPath = createAbsolutePath(workspaceRoot);

			// Convert to workspace-relative path
			const relativePath = absoluteToWorkspaceRelative(absolutePath, workspaceRootPath);

			logger.debug("Path conversion", {
				absolute: absolutePath,
				workspaceRoot: workspaceRootPath,
				relative: relativePath,
			});

			return {
				path: relativePath, // Store as workspace-relative
				extension: path.extname(filePath),
				sizeBytes: Buffer.byteLength(content, "utf-8"),
				isNew: false, // TODO: Check if file existed before
				isBinary: this.isBinaryContent(content, path.extname(filePath)),
				nextHash: crypto.createHash("sha256").update(content).digest("hex"),
			};
		} catch (error) {
			// Fallback: file is outside workspace, use absolute path
			logger.warn("File outside workspace, using absolute path", {
				filePath,
				workspaceRoot,
				error: (error as Error).message,
			});

			return {
				path: filePath,
				extension: path.extname(filePath),
				sizeBytes: Buffer.byteLength(content, "utf-8"),
				isNew: false,
				isBinary: this.isBinaryContent(content, path.extname(filePath)),
				nextHash: crypto.createHash("sha256").update(content).digest("hex"),
			};
		}
	}

	/**
	 * Check if content is binary
	 */
	private isBinaryContent(content: string, extension: string): boolean {
		// Check extension
		if (this.BINARY_EXTENSIONS.includes(extension.toLowerCase())) {
			return true;
		}

		// Check for null bytes (binary indicator)
		if (content.includes("\0")) {
			return true;
		}

		return false;
	}

	/**
	 * Build SaveContext from file infos using signal aggregation
	 */
	private async buildSaveContext(fileInfos: FileInfo[]): Promise<SaveContext> {
		const repoId = this.getRepoId();

		// Reset and aggregate all signals
		this.signalAggregator.reset();

		// Set risk signal - use AIRiskService if available, fallback to local heuristics
		const riskScore = await this.getRiskScore(fileInfos);
		this.signalAggregator.setRiskSignal({
			score: riskScore,
		});

		// Set burst signal
		this.signalAggregator.setBurstSignal({
			detected: fileInfos.length >= 3,
			fileCount: fileInfos.length,
		});

		// Set critical file signal
		const criticalFiles = fileInfos.filter((f) => this.isCriticalFile(f.path));
		this.signalAggregator.setCriticalFileSignal({
			detected: criticalFiles.length > 0,
			files: criticalFiles.map((f) => f.path),
			count: criticalFiles.length,
		});

		// Set session signal
		this.signalAggregator.setSessionSignal({
			sessionId: `session-${Date.now()}`,
			fileCount: fileInfos.length,
			durationMs: 0,
		});

		// Set AI signal - detect AI coding assistants
		const aiPresence = detectAIPresence();
		this.signalAggregator.setAISignal({
			detected: aiPresence.hasAI,
			toolName: aiPresence.detectedAssistants[0], // Primary assistant
			confidence: aiPresence.hasAI ? 0.85 : 0, // High confidence when detected
			indicators: aiPresence.detectedAssistants,
		});

		// Aggregate into SaveContext
		const context = this.signalAggregator.aggregate(fileInfos, repoId);

		return context;
	}

	/**
	 * Get risk score using AIRiskService if available, fallback to local estimation
	 */
	private async getRiskScore(fileInfos: FileInfo[]): Promise<number> {
		// Try AIRiskService first if available
		if (this.aiRiskService && fileInfos.length > 0) {
			try {
				const primaryFile = fileInfos[0];
				// Get file content for risk assessment
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
				const absolutePath = path.isAbsolute(primaryFile.path)
					? primaryFile.path
					: workspaceFolder
						? path.join(workspaceFolder, primaryFile.path)
						: primaryFile.path;

				const fileUri = vscode.Uri.file(absolutePath);
				const document = await vscode.workspace.openTextDocument(fileUri);
				const content = document.getText();

				const change: ChangeToAssess = {
					filePath: absolutePath,
					before: "", // We don't have previous content in this context
					after: content,
					category: "file-change",
				};

				const assessment: AIRiskAssessment = await this.aiRiskService.assessChange(change);
				logger.debug("AIRiskService assessment received", {
					filePath: primaryFile.path,
					score: assessment.score,
					level: assessment.level,
				});

				return assessment.score;
			} catch (error) {
				logger.warn("AIRiskService assessment failed, using fallback", {
					error: (error as Error).message,
				});
				// Fall through to local estimation
			}
		}

		// Fallback: Local heuristic estimation
		return this.estimateRiskScoreLocally(fileInfos);
	}

	/**
	 * Estimate risk score from file patterns (local fallback)
	 */
	private estimateRiskScoreLocally(fileInfos: FileInfo[]): number {
		let score = 0;

		// Critical files add risk
		const criticalCount = fileInfos.filter((f) => this.isCriticalFile(f.path)).length;
		score += criticalCount * 20;

		// Burst of files adds risk
		if (fileInfos.length >= 5) {
			score += 30;
		} else if (fileInfos.length >= 3) {
			score += 15;
		}

		// Large files add risk
		const largeFiles = fileInfos.filter((f) => f.sizeBytes > 10000).length;
		score += largeFiles * 10;

		return Math.min(score, 100);
	}

	/**
	 * Check if file is critical (config, env, etc.)
	 */
	private isCriticalFile(filePath: string): boolean {
		const criticalPatterns = ["package.json", ".env", ".snapbackrc", "tsconfig.json", ".config.ts", ".config.js"];

		return criticalPatterns.some((pattern) => filePath.includes(pattern));
	}

	/**
	 * Get repo ID from workspace
	 */
	private getRepoId(): string {
		const folder = vscode.workspace.workspaceFolders?.[0];
		return folder?.name ?? "unknown";
	}

	/**
	 * Execute decision: create snapshot and/or show notification
	 *
	 * CRITICAL FIX: Uses OperationCoordinator instead of SnapshotManager
	 * to ensure events are emitted on the correct event bus for UI refresh.
	 */
	private async executeDecision(decision: ProtectionDecision, context: SaveContext): Promise<void> {
		try {
			// Create snapshot if needed
			if (decision.createSnapshot && context.files.length > 0) {
				logger.info("Creating snapshot from AutoDecision", {
					reasons: decision.reasons,
					confidence: decision.confidence,
					hasOperationCoordinator: !!this.operationCoordinator,
				});

				// Create snapshot for the first file in context
				const primaryFile = context.files[0];
				try {
					// Read file content for snapshot
					// Convert relative path to absolute if needed
					const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
					const absolutePath = path.isAbsolute(primaryFile.path)
						? primaryFile.path
						: workspaceFolder
							? path.join(workspaceFolder, primaryFile.path)
							: primaryFile.path;

					const fileUri = vscode.Uri.file(absolutePath);
					const document = await vscode.workspace.openTextDocument(fileUri);
					const content = document.getText();

					let snapshotId: string | undefined;

					// FIX: Use OperationCoordinator for proper event bus integration
					if (this.operationCoordinator) {
						// Build file contents map with workspace-relative path as key
						const relativePath = workspaceFolder
							? path.relative(workspaceFolder, absolutePath)
							: absolutePath;

						const fileContents: Record<string, string> = {
							[relativePath]: content,
						};

						// Create snapshot through OperationCoordinator
						// This ensures SNAPSHOT_CREATED event is emitted on the global eventBus
						snapshotId = await this.operationCoordinator.coordinateSnapshotCreation(
							false, // showNotification - we show our own notification
							[absolutePath], // specificFiles
							fileContents, // providedFileContents
							`AI-detected: ${path.basename(absolutePath)}`, // customSnapshotName
						);

						logger.info("Snapshot created via OperationCoordinator", {
							snapshotId,
							filePath: absolutePath,
						});

						// Notify Vitals of snapshot creation (releases pressure)
						this.vitals.onSnapshot({ filePath: relativePath });
						// Record behavior for learning (user/AI created snapshot)
						this.vitals.recordBehavior(true);

						// CRITICAL: Refresh vitals cache to immediately reflect pressure release
						const workspaceId = this.workspaceContextManager.getWorkspaceRoot() || "default";
						void refreshVitalsCache(workspaceId);
					} else {
						// Fallback: Use SnapshotManager directly (UI won't refresh)
						logger.warn(
							"OperationCoordinator not available - snapshot will be created but UI may not refresh",
						);
						try {
							const snapshot = await this.snapshotManager.createSnapshot([
								{
									path: absolutePath,
									content,
									action: "modify" as const,
								},
							]);
							snapshotId = snapshot.id;

							// Notify Vitals of snapshot creation (releases pressure)
							this.vitals.onSnapshot({ filePath: absolutePath });
							// Record behavior for learning (user/AI created snapshot)
							this.vitals.recordBehavior(true);

							// CRITICAL: Refresh vitals cache for fallback path too
							const fallbackWorkspaceId = this.workspaceContextManager.getWorkspaceRoot() || "default";
							void refreshVitalsCache(fallbackWorkspaceId);
						} catch (fallbackError) {
							// SnapshotStorageAdapter throws "Direct save not supported"
							// This is expected when OperationCoordinator is not wired
							logger.error(
								"Fallback snapshot creation failed - wire OperationCoordinator to fix",
								fallbackError as Error,
							);
						}
					}

					if (snapshotId) {
						// Show recovery notification - the viral moment!
						const notification = new RecoveryUXNotification();
						void notification.showProtectionAlert({
							filePath: primaryFile.path,
							snapshotId,
							aiTool: detectAIPresence().detectedAssistants[0] || "AI",
							operationType: "auto-detected",
						});
					}
				} catch (snapshotError) {
					logger.error("Failed to create snapshot from AutoDecision", snapshotError as Error);
				}
			}

			// Show notification if needed
			if (decision.showNotification) {
				const notification = this.adapter.adaptDecision(decision);

				logger.info("Showing notification", {
					type: notification.type,
					severity: notification.severity,
					title: notification.title,
				});

				// Convert to NotificationManager format
				const notificationConfig = {
					id: `decision-${Date.now()}-${Math.random().toString(36).slice(7)}`,
					type: notification.severity as "info" | "warning" | "error",
					title: notification.title,
					message: notification.message,
				};

				// Show using VS Code's notification system
				this.showNotification(notificationConfig.title, notificationConfig.message);
			}
		} catch (error) {
			logger.error("Error executing decision", error as Error);
		}
	}

	/**
	 * Show notification to user
	 */
	private showNotification(title: string, message: string): void {
		// Show as information message for now
		// In Phase 17, integrate with NotificationManager for richer UI
		vscode.window.showInformationMessage(`${title}: ${message}`);
	}

	/**
	 * Get current statistics (for testing)
	 */
	getStats(): {
		isActive: boolean;
		bufferedEvents: number;
		isProcessing: boolean;
	} {
		return {
			isActive: this.isActive,
			bufferedEvents: this.fileBuffer.length,
			isProcessing: this.isProcessing,
		};
	}

	/**
	 * Get current Vitals proxy (for testing and status display)
	 */
	getVitals(): WorkspaceVitalsProxy {
		return this.vitals;
	}
}

/**
 * Factory function
 */
export function createAutoDecisionIntegration(
	snapshotManager: SnapshotManager,
	notificationManager: NotificationManager,
	workspaceContextManager: WorkspaceContextManager,
	config?: Partial<AutoDecisionConfig>,
	operationCoordinator?: OperationCoordinator,
	eventBus?: SnapBackEventBus,
): AutoDecisionIntegration {
	return new AutoDecisionIntegration(
		snapshotManager,
		notificationManager,
		workspaceContextManager,
		config,
		undefined,
		undefined,
		operationCoordinator,
		eventBus,
	);
}
