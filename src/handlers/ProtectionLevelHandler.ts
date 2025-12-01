import * as path from "node:path";
import * as vscode from "vscode";
import type { OperationCoordinator } from "../operationCoordinator.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { SnapshotNamingStrategy } from "../snapshot/SnapshotNamingStrategy.js";
import { logger } from "../utils/logger.js";
import type { ProtectionLevel } from "../views/types.js";
import type { AuditLogger } from "./AuditLogger.js";
import type { CooldownService } from "./CooldownService.js";

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
 * Manages temporary allowances and protection-specific UI interactions.
 *
 * Responsibilities:
 * - Evaluate protection level rules (Watch/Warn/Block)
 * - Handle temporary allowances
 * - Show protection-specific dialogs and notifications
 * - Coordinate snapshot creation for protected files
 * - Restore document contents when save is cancelled
 */
export class ProtectionLevelHandler {
	constructor(
		private registry: ProtectedFileRegistry,
		private operationCoordinator: OperationCoordinator,
		private cooldownService: CooldownService,
		private auditLogger: AuditLogger,
	) {}

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
		const protectionLevel =
			this.registry.getProtectionLevel(filePath) || "Watched";

		logger.debug("Handling protection level", {
			filePath,
			protectionLevel,
			contentLength: preSaveContent.length,
		});

		// Check if file is in cooldown
		const inCooldown = await this.cooldownService.isInCooldown(filePath);
		if (inCooldown) {
			logger.info(
				"File is in cooldown, allowing save without additional checks",
				{
					filePath,
					protectionLevel,
				},
			);

			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{ reason: "cooldown_bypass" },
			);

			return {
				shouldProceed: true,
				shouldSnapshot: false,
				reason: "cooldown_bypass",
			};
		}

		// Check for temporary allowance (applies to all levels)
		if (this.registry.hasTemporaryAllowance(filePath)) {
			logger.info("Save allowed due to temporary allowance", { filePath });

			// M2: Create snapshot before allowing save (even for Protected level with override)
			let snapshotId: string | undefined;
			try {
				snapshotId = await this.createSnapshotForFile(
					filePath,
					filename,
					preSaveContent,
				);

				if (snapshotId) {
					// Set cooldown for this file
					await this.cooldownService.setCooldown(
						filePath,
						protectionLevel,
						"user_override",
						snapshotId,
					);

					logger.info("Snapshot created for temporary allowance", {
						filePath,
						snapshotId,
					});
				}
			} catch (error) {
				logger.error(
					"Failed to create snapshot for temporary allowance",
					error as Error,
					{ filePath },
				);
				// Continue anyway - don't block save
			}

			// Consume the allowance
			this.registry.consumeTemporaryAllowance(filePath);

			vscode.window.setStatusBarMessage(
				`✅ Save allowed once for ${filename}`,
				2000,
			);

			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{ reason: "temporary_allowance", snapshotCreated: !!snapshotId },
				snapshotId,
			);

			return {
				shouldProceed: true,
				shouldSnapshot: !!snapshotId, // M2: Return true if snapshot was created
				reason: "temporary_allowance",
				snapshotId,
			};
		}

		// Handle based on protection level
		switch (protectionLevel) {
			case "Protected":
				return await this.handleBlockLevel(
					filePath,
					filename,
					preSaveContent,
					document,
					protectionLevel,
				);

			case "Warning":
				return await this.handleWarnLevel(
					filePath,
					filename,
					preSaveContent,
					protectionLevel,
				);

			default:
				return await this.handleWatchLevel(
					filePath,
					filename,
					preSaveContent,
					protectionLevel,
				);
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

			vscode.window.setStatusBarMessage(
				`🔴 Save cancelled for ${filename}`,
				2000,
			);

			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_blocked",
				{ reason: "user_cancelled_block_dialog" },
			);

			await this.restoreDocumentContents(document, preSaveContent);
			throw new vscode.CancellationError();
		}

		// User confirmed - create snapshot and allow save
		logger.info("User confirmed BLOCK mode save - creating snapshot", {
			filePath,
		});

		try {
			const snapshotId = await this.createSnapshotForFile(
				filePath,
				filename,
				preSaveContent,
			);

			if (snapshotId) {
				// Set cooldown for this file
				await this.cooldownService.setCooldown(
					filePath,
					protectionLevel,
					"snapshot_created",
					snapshotId,
				);

				await this.auditLogger.recordAudit(
					filePath,
					protectionLevel,
					"snapshot_created",
					{ reason: "block_mode_confirmed" },
					snapshotId,
				);

				vscode.window.setStatusBarMessage(
					`✅ Snapshot created for ${filename} - save allowed`,
					3000,
				);

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

			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_blocked",
				{
					reason: "snapshot_creation_failed",
					error: error instanceof Error ? error.message : String(error),
				},
			);

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
				timeSinceLastSnapshot:
					this.cooldownService.getTimeSinceLastSnapshot(filePath),
			});

			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{ reason: "debounce_bypass" },
			);

			return {
				shouldProceed: true,
				shouldSnapshot: false,
				reason: "debounce_bypass",
			};
		}

		// Create snapshot
		try {
			const snapshotId = await this.createSnapshotForFile(
				filePath,
				filename,
				preSaveContent,
			);

			if (snapshotId) {
				// Set cooldown for this file
				await this.cooldownService.setCooldown(
					filePath,
					protectionLevel,
					"snapshot_created",
					snapshotId,
				);

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
					path.relative(
						vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
						filePath,
					),
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
			vscode.window.showErrorMessage(
				`SnapBack: Failed to snapshot ${filename}. Save will proceed.`,
			);

			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{
					reason: "snapshot_creation_failed",
					error: error instanceof Error ? error.message : String(error),
				},
			);
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
				timeSinceLastSnapshot:
					this.cooldownService.getTimeSinceLastSnapshot(filePath),
			});

			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{ reason: "debounce_bypass" },
			);

			return {
				shouldProceed: true,
				shouldSnapshot: false,
				reason: "debounce_bypass",
			};
		}

		// Create snapshot IMMEDIATELY, synchronously blocking the save with PRE-SAVE content
		try {
			const snapshotId = await this.createSnapshotForFile(
				filePath,
				filename,
				preSaveContent,
			);

			if (snapshotId) {
				// Set cooldown for this file
				await this.cooldownService.setCooldown(
					filePath,
					protectionLevel,
					"snapshot_created",
					snapshotId,
				);

				await this.auditLogger.recordAudit(
					filePath,
					protectionLevel,
					"snapshot_created",
					{ reason: "watch_level" },
					snapshotId,
				);

				vscode.window.setStatusBarMessage(
					`✅ Snapshot created: ${filename}`,
					2000,
				);

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

			vscode.window.showErrorMessage(
				`SnapBack: Failed to snapshot ${filename}. Save will proceed.`,
			);

			await this.auditLogger.recordAudit(
				filePath,
				protectionLevel,
				"save_allowed",
				{
					reason: "snapshot_creation_failed",
					error: error instanceof Error ? error.message : String(error),
				},
			);
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
		const workspaceRoot =
			vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
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
		const snapshotId =
			await this.operationCoordinator.coordinateSnapshotCreation(
				false, // Don't show notification (we'll show our own)
				[relativePath], // Only snapshot this specific file (relative path)
				{ [relativePath]: preSaveContent }, // PRE-SAVE content map with relative path
				snapshotName, // Intelligent snapshot name
			);

		if (snapshotId) {
			await this.registry.markSnapshot(snapshotId, [filePath]);
			this.cooldownService.recordSnapshotTime(filePath);
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
	private showWarnNotification(
		filename: string,
		snapshotId: string,
		relativePath: string,
	): void {
		vscode.window.setStatusBarMessage(
			`🟡 Snapshot captured for ${filename}`,
			5000,
		);

		vscode.window
			.showInformationMessage(
				`SnapBack captured a snapshot for "${filename}"`,
				"Restore Snapshot",
			)
			.then(
				async (selection) => {
					if (selection !== "Restore Snapshot") {
						return;
					}

					try {
						const restored = await this.operationCoordinator.restoreToSnapshot(
							snapshotId,
							{ files: [relativePath] },
						);
						if (restored) {
							vscode.window.showInformationMessage(
								`SnapBack restored "${filename}" from latest snapshot`,
							);
						}
					} catch (error) {
						logger.error(
							"Failed to restore warn-level snapshot",
							error as Error,
							{ snapshotId, relativePath },
						);
						vscode.window.showErrorMessage(
							`SnapBack: Unable to restore ${filename} from snapshot`,
						);
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
	async restoreDocumentContents(
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
}
