import * as path from "node:path";
import type { EvaluationContext, ProtectionDecision, ProtectionDecisionEngine } from "@snapback/sdk";
import * as vscode from "vscode";
import type { OperationCoordinator } from "../operationCoordinator";
import type { MilestoneService } from "../services/MilestoneService";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { SnapshotNamingStrategy } from "../snapshot/SnapshotNamingStrategy";
import { logger } from "../utils/logger";
import type { ProtectionLevel } from "../views/types";
import type { AuditLogger } from "./AuditLogger";
import type { CooldownService } from "./CooldownService";

/**
 * Result of protection level handling
 */
export interface ProtectionHandlingResult {
	/** Whether the save should proceed */
	shouldProceed: boolean;
	/** Whether a snapshot should be created */
	shouldSnapshot: boolean;
	/** Reason for the decision (for logging/audit) */
	reason: string;
	/** Optional snapshot ID if snapshot was created */
	snapshotId?: string;
}

/**
 * Handles protection level logic (Watch/Warn/Block) for protected files.
 *
 * Per arch_remediation.md Task 1.3: This handler now DELEGATES protection decisions
 * to SDK's ProtectionDecisionEngine. The handler is responsible for:
 * - HOW to execute snapshots (VSCode owns)
 * - HOW to display UI/notifications (VSCode owns)
 * - HOW to handle user interactions (VSCode owns)
 *
 * The SDK's ProtectionDecisionEngine is responsible for:
 * - WHETHER to snapshot (SDK owns)
 * - WHETHER save should proceed (SDK owns)
 */
export class ProtectionLevelHandler {
	/**
	 * SDK Protection Decision Engine - Single Source of Truth for protection decisions.
	 * Per arch_remediation.md Task 1.3: SDK owns the "whether" decisions.
	 */
	private decisionEngine: ProtectionDecisionEngine | null = null;

	constructor(
		private registry: ProtectedFileRegistry,
		private operationCoordinator: OperationCoordinator,
		private cooldownService: CooldownService,
		private auditLogger: AuditLogger,
		private milestoneService?: MilestoneService,
	) {}

	/**
	 * Initialize SDK Decision Engine.
	 * Per arch_remediation.md Task 1.3: SDK is the Single Source of Truth for decisions.
	 */
	initializeDecisionEngine(engine: ProtectionDecisionEngine): void {
		this.decisionEngine = engine;
		logger.info("[SnapBack] ProtectionDecisionEngine initialized");
	}

	/**
	 * Handle protection level logic for a file save.
	 * Returns a result indicating whether save should proceed and if snapshot is needed.
	 *
	 * @param filePath - Absolute path to the file being saved
	 * @param filename - Base name of the file (for UI messages)
	 * @param preSaveContent - Pre-save content to snapshot
	 * @param document - VS Code document being saved
	 * @returns Promise with handling result
	 * @throws vscode.CancellationError if save should be blocked
	 */
	async handleProtectionLevel(
		filePath: string,
		filename: string,
		preSaveContent: string,
		document: vscode.TextDocument,
	): Promise<ProtectionHandlingResult> {
		const protectionLevel = this.registry.getProtectionLevel(filePath) || "watch";

		logger.debug("Handling protection level", {
			filePath,
			protectionLevel,
			contentLength: preSaveContent.length,
			hasDecisionEngine: !!this.decisionEngine,
		});

		// Check cooldown and temporary allowance status
		// Per arch_remediation.md Task 2.3: isInCooldown is now synchronous (CooldownCache is in-memory)
		const inCooldown = this.cooldownService.isInCooldown(filePath);
		const hasTemporaryAllowance = this.registry.hasTemporaryAllowance(filePath);

		// Build evaluation context for SDK
		const context: EvaluationContext = {
			filePath,
			trigger: "save",
			inCooldown,
			hasTemporaryAllowance,
		};

		// Delegate decision to SDK (if available)
		if (this.decisionEngine) {
			const decision = this.decisionEngine.evaluate(context);
			logger.debug("SDK protection decision", {
				filePath,
				decision,
			});

			// Execute the decision (VSCode's job)
			return await this.executeDecision(decision, filePath, filename, preSaveContent, document, protectionLevel);
		}

		// Fallback: SDK not yet initialized, use legacy logic
		logger.warn("SDK DecisionEngine not initialized - using legacy decision logic");
		return await this.handleProtectionLevelLegacy(
			filePath,
			filename,
			preSaveContent,
			document,
			protectionLevel,
			inCooldown,
			hasTemporaryAllowance,
		);
	}

	/**
	 * Execute SDK's protection decision.
	 * VSCode owns HOW to execute, SDK owns WHETHER to execute.
	 */
	private async executeDecision(
		decision: ProtectionDecision,
		filePath: string,
		filename: string,
		preSaveContent: string,
		document: vscode.TextDocument,
		protectionLevel: ProtectionLevel,
	): Promise<ProtectionHandlingResult> {
		let snapshotId: string | undefined;

		// Handle cooldown bypass
		if (decision.reason === "cooldown_bypass") {
			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_allowed", {
				reason: "cooldown_bypass",
			});
			return {
				shouldProceed: true,
				shouldSnapshot: false,
				reason: "cooldown_bypass",
			};
		}

		// Handle temporary allowance
		if (decision.reason === "temporary_allowance") {
			try {
				if (decision.shouldSnapshot) {
					snapshotId = await this.createSnapshotForFile(filePath, filename, preSaveContent);
					if (snapshotId) {
						this.cooldownService.setCooldown(filePath, protectionLevel, "user_override", snapshotId);
					}
				}
			} catch (error) {
				logger.error("Failed to create snapshot for temporary allowance", error as Error, { filePath });
			}
			this.registry.consumeTemporaryAllowance(filePath);
			vscode.window.setStatusBarMessage(`✅ Save allowed once for ${filename}`, 2000);
			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{ reason: "temporary_allowance", snapshotCreated: !!snapshotId },
				snapshotId,
			);
			return {
				shouldProceed: true,
				shouldSnapshot: !!snapshotId,
				reason: "temporary_allowance",
				snapshotId,
			};
		}

		// Handle block mode - requires user confirmation
		if (protectionLevel === "block") {
			return await this.handleBlockModeExecution(
				decision,
				filePath,
				filename,
				preSaveContent,
				document,
				protectionLevel,
			);
		}

		// Handle warn/watch modes - auto-snapshot if SDK says so
		if (decision.shouldSnapshot) {
			try {
				snapshotId = await this.createSnapshotForFile(filePath, filename, preSaveContent);
				if (snapshotId) {
					this.cooldownService.setCooldown(filePath, protectionLevel, "snapshot_created", snapshotId);
					await this.auditLogger.recordAudit(
						filePath,
						protectionLevel,
						"snapshot_created",
						{ reason: decision.reason },
						snapshotId,
					);

					// Show notification based on protection level
					if (protectionLevel === "warn") {
						this.showWarnNotification(
							filename,
							snapshotId,
							path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "", filePath),
						);
					} else {
						vscode.window.setStatusBarMessage(`✅ Snapshot created: ${filename}`, 2000);
					}

					return {
						shouldProceed: decision.shouldProceed,
						shouldSnapshot: true,
						reason: decision.reason,
						snapshotId,
					};
				}
			} catch (error) {
				logger.error("Failed to create snapshot", error as Error, { filePath });
				vscode.window.showErrorMessage(`SnapBack: Failed to snapshot ${filename}. Save will proceed.`);
				await this.auditLogger.recordAudit(filePath, protectionLevel, "save_allowed", {
					reason: "snapshot_creation_failed",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			shouldProceed: decision.shouldProceed,
			shouldSnapshot: false,
			reason: decision.reason,
		};
	}

	/**
	 * Handle block mode execution - requires user confirmation.
	 */
	private async handleBlockModeExecution(
		_decision: ProtectionDecision, // SDK decision passed for future use
		filePath: string,
		filename: string,
		preSaveContent: string,
		document: vscode.TextDocument,
		protectionLevel: ProtectionLevel,
	): Promise<ProtectionHandlingResult> {
		logger.info("BLOCK mode save attempt - showing confirmation dialog", {
			filePath,
			filename,
		});

		// Show confirmation dialog
		const result = await vscode.window.showWarningMessage(
			`🔴 This file is protected (BLOCK mode).

File: ${filename}

A snapshot will be created before saving.`,
			{ modal: true },
			"Create Snapshot & Save",
			"Cancel",
		);

		if (result !== "Create Snapshot & Save") {
			logger.info("User cancelled BLOCK mode save", { filePath });
			vscode.window.setStatusBarMessage(`🔴 Save cancelled for ${filename}`, 2000);
			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_blocked", {
				reason: "user_cancelled_block_dialog",
			});
			await this.restoreDocumentContents(document, preSaveContent);
			throw new vscode.CancellationError();
		}

		// User confirmed - create snapshot
		try {
			const snapshotId = await this.createSnapshotForFile(filePath, filename, preSaveContent);
			if (snapshotId) {
				this.cooldownService.setCooldown(filePath, protectionLevel, "snapshot_created", snapshotId);
				await this.auditLogger.recordAudit(
					filePath,
					protectionLevel,
					"snapshot_created",
					{ reason: "block_mode_confirmed" },
					snapshotId,
				);
				vscode.window.setStatusBarMessage(`✅ Snapshot created for ${filename} - save allowed`, 3000);
				return {
					shouldProceed: true,
					shouldSnapshot: true,
					reason: "block_mode_snapshot_created",
					snapshotId,
				};
			}
		} catch (error) {
			logger.error("Failed to create snapshot in BLOCK mode", error as Error, { filePath });
			vscode.window.showErrorMessage(
				`SnapBack: Failed to create snapshot for ${filename}. Save will be blocked.`,
			);
			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_blocked", {
				reason: "snapshot_creation_failed",
				error: error instanceof Error ? error.message : String(error),
			});
			await this.restoreDocumentContents(document, preSaveContent);
			throw new vscode.CancellationError();
		}

		return {
			shouldProceed: false,
			shouldSnapshot: false,
			reason: "block_mode_default_deny",
		};
	}

	/**
	 * Legacy handling (fallback when SDK not initialized).
	 * This will be removed once SDK integration is complete.
	 */
	private async handleProtectionLevelLegacy(
		filePath: string,
		filename: string,
		preSaveContent: string,
		document: vscode.TextDocument,
		protectionLevel: ProtectionLevel,
		inCooldown: boolean,
		hasTemporaryAllowance: boolean,
	): Promise<ProtectionHandlingResult> {
		// Check if file is in cooldown
		if (inCooldown) {
			logger.info("File is in cooldown, allowing save without additional checks", {
				filePath,
				protectionLevel,
			});
			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_allowed", {
				reason: "cooldown_bypass",
			});
			return {
				shouldProceed: true,
				shouldSnapshot: false,
				reason: "cooldown_bypass",
			};
		}

		// Check for temporary allowance
		if (hasTemporaryAllowance) {
			logger.info("Save allowed due to temporary allowance", { filePath });
			let snapshotId: string | undefined;
			try {
				snapshotId = await this.createSnapshotForFile(filePath, filename, preSaveContent);
				if (snapshotId) {
					this.cooldownService.setCooldown(filePath, protectionLevel, "user_override", snapshotId);
				}
			} catch (error) {
				logger.error("Failed to create snapshot for temporary allowance", error as Error, { filePath });
			}
			this.registry.consumeTemporaryAllowance(filePath);
			vscode.window.setStatusBarMessage(`✅ Save allowed once for ${filename}`, 2000);
			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{ reason: "temporary_allowance", snapshotCreated: !!snapshotId },
				snapshotId,
			);
			return {
				shouldProceed: true,
				shouldSnapshot: !!snapshotId,
				reason: "temporary_allowance",
				snapshotId,
			};
		}

		// Handle based on protection level
		switch (protectionLevel) {
			case "block":
				return await this.handleBlockLevel(filePath, filename, preSaveContent, document, protectionLevel);
			case "warn":
				return await this.handleWarnLevel(filePath, filename, preSaveContent, protectionLevel);
			default:
				return await this.handleWatchLevel(filePath, filename, preSaveContent, protectionLevel);
		}
	}

	/**
	 * Handle BLOCK protection level.
	 * Requires user action to proceed with save.
	 */
	private async handleBlockLevel(
		filePath: string,
		filename: string,
		preSaveContent: string,
		document: vscode.TextDocument,
		protectionLevel: ProtectionLevel,
	): Promise<ProtectionHandlingResult> {
		logger.info("BLOCK mode save attempt - showing confirmation dialog", {
			filePath,
			filename,
		});

		// Show confirmation dialog to user
		const result = await vscode.window.showWarningMessage(
			`🔴 This file is protected (BLOCK mode).

File: ${filename}

A snapshot will be created before saving.`,
			{ modal: true },
			"Create Snapshot & Save",
			"Cancel",
		);

		if (result !== "Create Snapshot & Save") {
			// User cancelled - revert and block save
			logger.info("User cancelled BLOCK mode save", { filePath });

			vscode.window.setStatusBarMessage(`🔴 Save cancelled for ${filename}`, 2000);

			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_blocked", {
				reason: "user_cancelled_block_dialog",
			});

			await this.restoreDocumentContents(document, preSaveContent);
			throw new vscode.CancellationError();
		}

		// User confirmed - create snapshot and allow save
		logger.info("User confirmed BLOCK mode save - creating snapshot", {
			filePath,
		});

		try {
			const snapshotId = await this.createSnapshotForFile(filePath, filename, preSaveContent);

			if (snapshotId) {
				// Set cooldown for this file
				this.cooldownService.setCooldown(filePath, protectionLevel, "snapshot_created", snapshotId);

				await this.auditLogger.recordAudit(
					filePath,
					protectionLevel,
					"snapshot_created",
					{ reason: "block_mode_confirmed" },
					snapshotId,
				);

				vscode.window.setStatusBarMessage(`✅ Snapshot created for ${filename} - save allowed`, 3000);

				logger.info("Snapshot created for BLOCK mode save", {
					filePath,
					snapshotId,
				});

				return {
					shouldProceed: true,
					shouldSnapshot: true,
					reason: "block_mode_snapshot_created",
					snapshotId,
				};
			}
		} catch (error) {
			logger.error("Failed to create snapshot in BLOCK mode", error as Error, {
				filePath,
			});

			vscode.window.showErrorMessage(
				`SnapBack: Failed to create snapshot for ${filename}. Save will be blocked.`,
			);

			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_blocked", {
				reason: "snapshot_creation_failed",
				error: error instanceof Error ? error.message : String(error),
			});

			await this.restoreDocumentContents(document, preSaveContent);
			throw new vscode.CancellationError();
		}

		return {
			shouldProceed: false,
			shouldSnapshot: false,
			reason: "block_mode_default_deny",
		};
	}

	/**
	 * Handle WARN protection level.
	 * Creates automatic snapshot with optional debounce.
	 */
	private async handleWarnLevel(
		filePath: string,
		filename: string,
		preSaveContent: string,
		protectionLevel: ProtectionLevel,
	): Promise<ProtectionHandlingResult> {
		// Check if we should skip snapshot due to recent snapshot (debounce)
		const shouldDebounce = this.cooldownService.shouldDebounce(filePath);
		if (shouldDebounce) {
			logger.debug("Skipping snapshot due to debounce (warn level)", {
				filePath,
				timeSinceLastSnapshot: this.cooldownService.getTimeSinceLastSnapshot(filePath),
			});

			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_allowed", {
				reason: "debounce_bypass",
			});

			return {
				shouldProceed: true,
				shouldSnapshot: false,
				reason: "debounce_bypass",
			};
		}

		// Create snapshot
		try {
			const snapshotId = await this.createSnapshotForFile(filePath, filename, preSaveContent);

			if (snapshotId) {
				// Set cooldown for this file
				this.cooldownService.setCooldown(filePath, protectionLevel, "snapshot_created", snapshotId);

				await this.auditLogger.recordAudit(
					filePath,
					protectionLevel,
					"snapshot_created",
					{ reason: "warning_level" },
					snapshotId,
				);

				this.showWarnNotification(
					filename,
					snapshotId,
					path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "", filePath),
				);

				return {
					shouldProceed: true,
					shouldSnapshot: true,
					reason: "warning_level",
					snapshotId,
				};
			}
		} catch (error) {
			logger.error("Failed to create warn-level snapshot", error as Error, {
				filePath,
			});
			vscode.window.showErrorMessage(`SnapBack: Failed to snapshot ${filename}. Save will proceed.`);

			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_allowed", {
				reason: "snapshot_creation_failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}

		return {
			shouldProceed: true,
			shouldSnapshot: false,
			reason: "snapshot_creation_failed",
		};
	}

	/**
	 * Handle WATCH protection level.
	 * Creates snapshot immediately (no setTimeout delay).
	 */
	private async handleWatchLevel(
		filePath: string,
		filename: string,
		preSaveContent: string,
		protectionLevel: ProtectionLevel,
	): Promise<ProtectionHandlingResult> {
		// Check if we should skip snapshot due to recent snapshot (debounce)
		const shouldDebounce = this.cooldownService.shouldDebounce(filePath);
		if (shouldDebounce) {
			logger.debug("Skipping snapshot due to debounce (watch level)", {
				filePath,
				timeSinceLastSnapshot: this.cooldownService.getTimeSinceLastSnapshot(filePath),
			});

			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_allowed", {
				reason: "debounce_bypass",
			});

			return {
				shouldProceed: true,
				shouldSnapshot: false,
				reason: "debounce_bypass",
			};
		}

		// Create snapshot IMMEDIATELY, synchronously blocking the save with PRE-SAVE content
		try {
			const snapshotId = await this.createSnapshotForFile(filePath, filename, preSaveContent);

			if (snapshotId) {
				// Set cooldown for this file
				this.cooldownService.setCooldown(filePath, protectionLevel, "snapshot_created", snapshotId);

				await this.auditLogger.recordAudit(
					filePath,
					protectionLevel,
					"snapshot_created",
					{ reason: "watch_level" },
					snapshotId,
				);

				vscode.window.setStatusBarMessage(`✅ Snapshot created: ${filename}`, 2000);

				return {
					shouldProceed: true,
					shouldSnapshot: true,
					reason: "watch_level",
					snapshotId,
				};
			}
		} catch (error) {
			logger.error("Failed to create auto-snapshot", error as Error, {
				filePath,
			});

			vscode.window.showErrorMessage(`SnapBack: Failed to snapshot ${filename}. Save will proceed.`);

			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_allowed", {
				reason: "snapshot_creation_failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}

		return {
			shouldProceed: true,
			shouldSnapshot: false,
			reason: "snapshot_creation_failed",
		};
	}

	/**
	 * Create snapshot for a specific file.
	 *
	 * @param filePath - Absolute path to the file
	 * @param filename - Base name for snapshot naming
	 * @param preSaveContent - Pre-save content to snapshot (CRITICAL)
	 * @returns Promise with snapshot ID, or undefined if creation failed
	 */
	private async createSnapshotForFile(
		filePath: string,
		_filename: string,
		preSaveContent: string,
	): Promise<string | undefined> {
		logger.info("Creating snapshot for file", {
			filePath,
			contentLength: preSaveContent.length,
		});

		// Get workspace root
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
		// Convert absolute path to relative path
		const relativePath = path.relative(workspaceRoot, filePath);

		// Use intelligent snapshot naming strategy for GitLens parity
		const namingStrategy = new SnapshotNamingStrategy(workspaceRoot);
		const snapshotInfo = {
			files: [
				{
					path: relativePath,
					status: "modified" as const,
					linesAdded: 0,
					linesDeleted: 0,
				},
			],
			workspaceRoot,
		};

		const snapshotName = await namingStrategy.generateName(snapshotInfo);

		// Pass PRE-SAVE content to snapshot creation with relative paths
		const snapshotId = await this.operationCoordinator.coordinateSnapshotCreation(
			false, // Don't show notification (we'll show our own)
			[relativePath], // Only snapshot this specific file (relative path)
			{ [relativePath]: preSaveContent }, // PRE-SAVE content map with relative path
			snapshotName, // Intelligent snapshot name
		);

		if (snapshotId) {
			await this.registry.markSnapshot(snapshotId, [filePath]);
			this.cooldownService.recordSnapshotTime(filePath);

			// Track Milestone (files protected)
			if (this.milestoneService) {
				void this.milestoneService.incrementProtectedFiles();

				// P0 FIX: Track first snapshot creation (P0 Blocker #3)
				void this.milestoneService.trackFirstSnapshot();
			}

			logger.info("Snapshot created successfully", {
				filePath,
				snapshotId,
				snapshotName,
			});
		}

		return snapshotId;
	}

	/**
	 * Show notification for warn-level snapshot with restore option.
	 */
	private showWarnNotification(filename: string, snapshotId: string, relativePath: string): void {
		vscode.window.setStatusBarMessage(`🟡 Snapshot captured for ${filename}`, 5000);

		vscode.window.showInformationMessage(`SnapBack captured a snapshot for "${filename}"`, "Restore Snapshot").then(
			async (selection) => {
				if (selection !== "Restore Snapshot") {
					return;
				}

				try {
					const restored = await this.operationCoordinator.restoreToSnapshot(snapshotId, {
						files: [relativePath],
					});
					if (restored) {
						vscode.window.showInformationMessage(`SnapBack restored "${filename}" from latest snapshot`);
					}
				} catch (error) {
					logger.error("Failed to restore warn-level snapshot", error as Error, { snapshotId, relativePath });
					vscode.window.showErrorMessage(`SnapBack: Unable to restore ${filename} from snapshot`);
				}
			},
			(error: unknown) => {
				logger.warn("Warn notification action failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			},
		);
	}

	/**
	 * Restore document contents when save is cancelled.
	 * Used when user cancels a protected save operation.
	 *
	 * @param document - VS Code document to restore
	 * @param preSaveContent - Content to restore
	 */
	async restoreDocumentContents(document: vscode.TextDocument, preSaveContent: string): Promise<void> {
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
}
