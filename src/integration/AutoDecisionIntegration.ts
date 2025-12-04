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

import * as vscode from "vscode";
import * as crypto from "node:crypto";
import * as path from "node:path";
import type { SnapshotManager } from "../snapshot/SnapshotManager";
import type { NotificationManager } from "../notifications/notificationManager";
import { AutoDecisionEngine } from "../domain/engine";
import { SaveContextBuilder } from "../domain/saveContextBuilder";
import { NotificationAdapter } from "../domain/notificationAdapter";
import { SnapshotOrchestrator } from "../domain/snapshotOrchestrator";
import { type SignalAggregator, createSignalAggregator } from "../domain/signalAggregator";
import { GlobalStateStorageAdapter } from "../adapters/GlobalStateStorageAdapter";
import { SettingsLoader } from "../config/settingsLoader";
import type {
	AutoDecisionConfig,
	SaveContext,
	ProtectionDecision,
} from "../domain/types";
import { DEFAULT_CONFIG } from "../domain/types";
import type { FileInfo } from "../domain/signalAggregator";
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

	private fileBuffer: FileChangeEvent[] = [];
	private bufferTimeout: NodeJS.Timeout | null = null;
	private isProcessing = false;
	private disposables: vscode.Disposable[] = [];
	private isActive = false;
	private repoId: string;

	private readonly DEBOUNCE_MS = 300;
	private readonly IGNORE_PATTERNS = [
		"node_modules/**",
		"dist/**",
		".git/**",
		".vscode/**",
		"*.lock",
		"*.log",
	];

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

	constructor(_snapshotManager: SnapshotManager,
		private notificationManager: NotificationManager,
		config?: Partial<AutoDecisionConfig>,context?: vscode.ExtensionContext,
	) {
		// Initialize SettingsLoader if context available
		if (context) {
			this.settingsLoader = new SettingsLoader(context);

			// Listen for settings changes and update engine
			this.settingsLoader.onSettingsChange((settings) => {
				this.engine.updateConfig({
					riskThreshold: settings.autoDecision.riskThreshold,
					notifyThreshold:
						settings.autoDecision.notifyThreshold,
					minFilesForBurst:
						settings.autoDecision.minFilesForBurst,
					maxSnapshotsPerMinute:
						settings.autoDecision
							.maxSnapshotsPerMinute,
				});
				logger.info("AutoDecisionEngine updated with new settings",
					{ settings: settings.autoDecision });
			});
		}

		// Merge settings-based config if available
		let mergedConfig: AutoDecisionConfig = { ...DEFAULT_CONFIG, ...config };
		if (this.settingsLoader) {
			const loadedSettings =
				this.settingsLoader.loadAutoDecisionSettings();
			mergedConfig = {
				...mergedConfig,
				riskThreshold: loadedSettings.riskThreshold,
				notifyThreshold: loadedSettings.notifyThreshold,
				minFilesForBurst: loadedSettings.minFilesForBurst,
				maxSnapshotsPerMinute: loadedSettings.maxSnapshotsPerMinute,
			};
		}

		this.engine = new AutoDecisionEngine(mergedConfig);
		this.builder = new SaveContextBuilder("snapback-vscode");
		this.adapter = new NotificationAdapter();
		this.repoId = this.getRepoId();

		// Create storage adapter if context available (for persistence)
		const storage = context
			? new GlobalStateStorageAdapter(context.globalState)
			: undefined;
		this.orchestrator = new SnapshotOrchestrator(
			this.repoId,
			undefined,
			storage,
		);
		this.signalAggregator = createSignalAggregator();

		logger.info("AutoDecisionIntegration initialized", { config: mergedConfig });
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
			const regexPattern = pattern
				.replace(/\*\*/g, "(.*/)?")
				.replace(/\*/g, "[^/]*")
				.replace(/\./g, "\\.");
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

		this.fileBuffer.push(event);

		// Reset debounce timer
		if (this.bufferTimeout) {
			clearTimeout(this.bufferTimeout);
		}

		this.bufferTimeout = setTimeout(
			() => this.processBatch(),
			this.DEBOUNCE_MS,
		);
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
				this.fileBuffer.map((event) =>
					this.extractFileInfo(event.filePath, event.content || ""),
				),
			);

			// Step 2: Build SaveContext
			const saveContext = await this.buildSaveContext(fileInfos);

			logger.debug("SaveContext built", {
				fileCount: saveContext.files.length,
				riskScore: saveContext.riskScore,
				aiDetected: saveContext.aiDetected,
				burstDetected: saveContext.burstDetected,
			});

			// Step 3: Run AutoDecisionEngine
			const decision = this.engine.makeDecision(saveContext);

			logger.debug("Decision made", {
				createSnapshot: decision.createSnapshot,
				showNotification: decision.showNotification,
				reasons: decision.reasons,
				confidence: decision.confidence,
			});

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
	 */
	private async extractFileInfo(
		filePath: string,
		content: string,
	): Promise<FileInfo> {
		const relativePathResult = vscode.workspace.asRelativePath(filePath);
		const relativePath =
			relativePathResult === filePath ? filePath : relativePathResult;

		return {
			path: relativePath,
			extension: path.extname(filePath),
			sizeBytes: Buffer.byteLength(content, "utf-8"),
			isNew: false, // TODO: Check if file existed before
			isBinary: this.isBinaryContent(content, path.extname(filePath)),
			nextHash: crypto
				.createHash("sha256")
				.update(content)
				.digest("hex"),
		};
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

		// Set risk signal based on file patterns
		this.signalAggregator.setRiskSignal({
			score: this.estimateRiskScore(fileInfos),
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

		// Aggregate into SaveContext
		const context = this.signalAggregator.aggregate(fileInfos, repoId);

		return context;
	}

	/**
	 * Estimate risk score from file patterns
	 */
	private estimateRiskScore(fileInfos: FileInfo[]): number {
		let score = 0;

		// Critical files add risk
		const criticalCount = fileInfos.filter((f) =>
			this.isCriticalFile(f.path),
		).length;
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
		const criticalPatterns = [
			"package.json",
			".env",
			".snapbackrc",
			"tsconfig.json",
			".config.ts",
			".config.js",
		];

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
	 */
	private async executeDecision(
		decision: ProtectionDecision,
		context: SaveContext,
	): Promise<void> {
		try {
			// Create snapshot if needed
			if (decision.createSnapshot) {
				logger.info("Creating snapshot from decision", {
					reasons: decision.reasons,
					confidence: decision.confidence,
				});

				// TODO: Implement snapshot creation
				// await this.orchestrator.createSnapshot(context, decision);
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

				// Show using NotificationManager with audit trail
				await this.notificationManager.show(notificationConfig, {
					filePath: context.files[0]?.path,
					riskScore: context.riskScore,
					threats: decision.reasons || [],
					timestamp: Date.now(),
				});
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
}

/**
 * Factory function
 */
export function createAutoDecisionIntegration(
	snapshotManager: SnapshotManager,
	notificationManager: NotificationManager,
	config?: Partial<AutoDecisionConfig>,
): AutoDecisionIntegration {
	return new AutoDecisionIntegration(snapshotManager, notificationManager, config);
}
