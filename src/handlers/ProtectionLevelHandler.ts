import * as path from "node:path";
import type { EvaluationContext, ProtectionDecision, ProtectionDecisionEngine } from "@snapback/sdk";
import { SnapshotNamingStrategy } from "@snapback-oss/sdk";
import * as vscode from "vscode";
import { RecoveryUXNotification } from "../notifications/RecoveryUXNotification";
import type { OperationCoordinator } from "../operationCoordinator";
import type { MilestoneService } from "../services/MilestoneService";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import { logger } from "../utils/logger";
import { sdkLogger } from "../utils/sdkLoggerAdapter";
import type { ProtectionLevel } from "../views/types";
import type { AuditLogger } from "./AuditLogger";
import type { CooldownService } from "./CooldownService";

/**
 * AI detection result for snapshot metadata
 */
export interface AIDetectionInfo {
	/** Whether AI was detected */
	detected: boolean;
	/** AI tool name (e.g., 'copilot', 'cursor', 'claude') */
	tool?: string;
	/** Detection confidence (0-1) */
	confidence?: number;
}

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
	/** AI detection information (for toast notifications) */
	aiDetection?: AIDetectionInfo;
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
	 * Apply protection inheritance from anchor file to dependent files.
	 * Implements: BLOCK → WARN (depth1) → WATCH (depth2) propagation
	 *
	 * @param anchorPath - Path to the anchor file
	 * @param anchorLevel - Protection level of anchor
	 * @param relatedFiles - Files at depth1 and depth2
	 * @returns InheritanceResult with protection map and inherited count
	 */
	async applyInheritance(
		anchorPath: string,
		anchorLevel: "watch" | "warn" | "block",
		relatedFiles: { depth1: string[]; depth2: string[] },
	): Promise<{
		anchorPath: string;
		protectionMap: Record<string, "watch" | "warn" | "block">;
		inheritedCount: number;
		reason?: string;
	}> {
		const protectionMap: Record<string, "watch" | "warn" | "block"> = {};
		let inheritedCount = 0;

		// Anchor gets its specified level (never overwrite)
		protectionMap[anchorPath] = anchorLevel;

		// Apply to depth1 files (highest priority)
		const depth1Level = this.getEffectiveLevel(anchorLevel, 1);
		for (const file of relatedFiles.depth1) {
			// Skip anchor if it appears in depth1 (circular)
			if (file === anchorPath) {
				continue;
			}
			protectionMap[file] = depth1Level;
			inheritedCount++;
		}

		// Apply to depth2 files (lower priority - don't override depth1)
		const depth2Level = this.getEffectiveLevel(anchorLevel, 2);
		for (const file of relatedFiles.depth2) {
			// Skip anchor if it appears in depth2 (circular)
			if (file === anchorPath) {
				continue;
			}
			// Skip if already assigned (depth1 takes precedence)
			if (file in protectionMap) {
				continue;
			}
			protectionMap[file] = depth2Level;
			inheritedCount++;
		}

		logger.debug("Applied protection inheritance", {
			anchorPath,
			anchorLevel,
			depth1Level,
			depth2Level,
			inheritedCount,
		});

		return {
			anchorPath,
			protectionMap,
			inheritedCount,
			reason: `Inherited ${anchorLevel} protection from anchor`,
		};
	}

	/**
	 * Calculate effective protection level based on anchor level and depth.
	 * Rules:
	 * - BLOCK: depth1→WARN, depth2→WATCH (escalating down)
	 * - WARN: depth1→WATCH, depth2→WATCH (both same)
	 * - WATCH: all depths→WATCH (minimum level)
	 *
	 * @param anchorLevel - The anchor file's protection level
	 * @param depth - Depth in dependency tree (1 or 2)
	 * @returns Effective protection level at this depth
	 */
	getEffectiveLevel(anchorLevel: "watch" | "warn" | "block", depth: number): "watch" | "warn" | "block" {
		const levelHierarchy: Record<"watch" | "warn" | "block", number> = {
			watch: 1,
			warn: 2,
			block: 3,
		};

		const anchorScore = levelHierarchy[anchorLevel];

		// Protection decreases by one level per depth
		const effectiveScore = Math.max(1, anchorScore - depth);

		// Map score back to level
		const scoreToLevel: Record<number, "watch" | "warn" | "block"> = {
			1: "watch",
			2: "warn",
			3: "block",
		};

		return scoreToLevel[effectiveScore] || "watch";
	}

	/**
	 * Validate that protection inheritance is correctly applied.
	 * Checks monotonic property: protection levels don't escalate up the chain.
	 *
	 * @param protectionMap - Map of files to protection levels
	 * @returns true if inheritance is valid, false otherwise
	 */
	async validateInheritanceChain(protectionMap: Record<string, "watch" | "warn" | "block">): Promise<boolean> {
		const levelScore: Record<"watch" | "warn" | "block", number> = {
			watch: 1,
			warn: 2,
			block: 3,
		};

		const levels = Object.values(protectionMap);

		// All levels should be defined
		if (levels.length === 0) {
			return false;
		}

		// All valid protection levels
		const allValid = levels.every((level) => level in levelScore);

		if (!allValid) {
			logger.warn("Invalid protection level in inheritance chain");
			return false;
		}

		// Monotonic check: max level should be unique (only anchor at top)
		const maxLevel = Math.max(...levels.map((l) => levelScore[l]));
		const maxCount = levels.filter((l) => levelScore[l] === maxLevel).length;

		if (maxCount !== 1) {
			logger.warn("Multiple files at same max protection level (should only be anchor)");
			return false;
		}

		return true;
	}

	/**
	 * Handle protection level logic for a file save.
	 * Returns a result indicating whether save should proceed and if snapshot is needed.
	 *
	 * @param filePath - Absolute path to the file being saved
	 * @param filename - Base name of the file (for UI messages)
	 * @param preSaveContent - Pre-save content to snapshot
	 * @param document - VS Code document being saved
	 * @param aiDetection - Optional AI detection result from SignalBridge
	 * @returns Promise with handling result
	 * @throws vscode.CancellationError if save should be blocked
	 */
	async handleProtectionLevel(
		filePath: string,
		filename: string,
		preSaveContent: string,
		document: vscode.TextDocument,
		aiDetection?: AIDetectionInfo,
	): Promise<ProtectionHandlingResult> {
		const protectionLevel = this.registry.getProtectionLevel(filePath) || "watch";

		// 🔍 DIAGNOSTIC: Entry point
		console.log("[ProtectionLevel] handleProtectionLevel() called");
		console.log(`[ProtectionLevel] File: ${filePath}`);
		console.log(`[ProtectionLevel] Level: ${protectionLevel}`);

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

		// 🔍 DIAGNOSTIC: Cooldown check
		console.log(`[ProtectionLevel] In cooldown: ${inCooldown}`);
		if (inCooldown) {
			console.log("[ProtectionLevel] SKIPPING - cooldown active");
		}

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
			const result = await this.executeDecision(
				decision,
				filePath,
				filename,
				preSaveContent,
				document,
				protectionLevel,
			);
			// Attach AI detection to result
			return { ...result, aiDetection };
		}

		// Fallback: SDK not yet initialized, use legacy logic
		logger.warn("SDK DecisionEngine not initialized - using legacy decision logic");
		const result = await this.handleProtectionLevelLegacy(
			filePath,
			filename,
			preSaveContent,
			document,
			protectionLevel,
			inCooldown,
			hasTemporaryAllowance,
		);
		// Attach AI detection to result
		return { ...result, aiDetection };
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

		// 🔍 DIAGNOSTIC: Before showing modal
		console.log("[ProtectionLevel] Showing modal: BLOCK confirmation dialog");

		// Show confirmation dialog (modal has its own dismiss/cancel)
		const result = await vscode.window.showWarningMessage(
			`🔴 This file is protected (BLOCK mode).

File: ${filename}

A snapshot will be created before saving.`,
			{ modal: true },
			"Create Snapshot & Save",
		);

		// 🔍 DIAGNOSTIC: After user responds
		console.log(`[ProtectionLevel] User response: ${result || "dismissed"}`);

		if (result !== "Create Snapshot & Save") {
			logger.info("User cancelled BLOCK mode save", { filePath });
			vscode.window.setStatusBarMessage(`🔴 Save cancelled for ${filename}`, 2000);
			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_blocked", {
				reason: "user_cancelled_block_dialog",
			});
			await this.restoreDocumentContents(document, preSaveContent);
			throw new vscode.CancellationError();
		}

		// Prompt for reason - QuickPick with preset options
		const reasons = [
			{ label: "$(bug) Fixing a bug", value: "bug-fix" },
			{ label: "$(key) Updating credentials/secrets", value: "credentials" },
			{ label: "$(sync) Refactoring", value: "refactor" },
			{ label: "$(beaker) Testing/experimentation", value: "testing" },
			{ label: "$(pencil) Other...", value: "custom" },
		];

		const selected = await vscode.window.showQuickPick(reasons, {
			title: "🔴 Protected File: Why are you modifying this?",
			placeHolder: "Select a reason or choose 'Other' to type custom",
			ignoreFocusOut: true, // Prevents accidental dismiss
		});

		if (!selected) {
			// User cancelled the quick pick
			logger.info("User cancelled BLOCK mode reason selection", { filePath });
			vscode.window.setStatusBarMessage(`🔴 Save cancelled for ${filename}`, 2000);
			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_blocked", {
				reason: "user_cancelled_reason_selection",
			});
			await this.restoreDocumentContents(document, preSaveContent);
			throw new vscode.CancellationError();
		}

		let justification: string;

		if (selected.value === "custom") {
			// User chose "Other" - show input box for custom reason
			const customReason = await vscode.window.showInputBox({
				title: "Custom Reason",
				prompt: "Why are you modifying this protected file?",
				placeHolder: "Describe why you need to override protection...",
				ignoreFocusOut: true,
				validateInput: (value: string) => {
					if (!value || value.trim().length < 5) {
						return "Please provide a reason (at least 5 characters)";
					}
					return null;
				},
			});

			if (!customReason) {
				// User cancelled the input box
				logger.info("User cancelled BLOCK mode custom reason input", { filePath });
				vscode.window.setStatusBarMessage(`🔴 Save cancelled for ${filename}`, 2000);
				await this.auditLogger.recordAudit(filePath, protectionLevel, "save_blocked", {
					reason: "user_cancelled_custom_reason_input",
				});
				await this.restoreDocumentContents(document, preSaveContent);
				throw new vscode.CancellationError();
			}

			justification = customReason;
		} else {
			// User selected a preset reason
			justification = selected.value;
		}

		logger.info("User provided BLOCK mode justification", { filePath, justification });

		// User confirmed - create snapshot
		try {
			const snapshotId = await this.createSnapshotForFile(filePath, filename, preSaveContent, justification);
			if (snapshotId) {
				this.cooldownService.setCooldown(filePath, protectionLevel, "snapshot_created", snapshotId);
				await this.auditLogger.recordAudit(
					filePath,
					protectionLevel,
					"snapshot_created",
					{ reason: "block_mode_confirmed", justification },
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
	 * Show protection notification to user.
	 * This is the viral moment - when AI tries to delete/overwrite a file and SnapBack catches it.
	 *
	 * @param filePath - Path to the protected file
	 * @param snapshotId - ID of the created snapshot
	 */
	private async showRecoveryNotification(filePath: string, snapshotId: string): Promise<void> {
		// 🔍 DIAGNOSTIC: Entry point to verify this method is actually called
		console.log("[ProtectionLevel] showRecoveryNotification() ENTERED");
		console.log(`[ProtectionLevel] filePath: ${filePath}, snapshotId: ${snapshotId}`);

		try {
			const notification = new RecoveryUXNotification();
			await notification.showProtectionAlert({
				filePath,
				snapshotId,
				aiTool: this.detectAITool(),
				operationType: "overwrite", // Detected from snapshot trigger context
			});
		} catch (error) {
			logger.error("Failed to show recovery notification", error instanceof Error ? error : undefined);
			// Fail gracefully - don't crash extension if notification fails
		}
	}

	/**
	 * Detect which AI tool is currently active in VS Code.
	 * Checks for Cursor and Copilot extensions.
	 *
	 * @returns AI tool name or generic "AI" fallback
	 */
	private detectAITool(): string {
		const cursor = vscode.extensions.getExtension("cursor.cursor");
		const copilot = vscode.extensions.getExtension("github.copilot");

		if (cursor?.isActive) {
			return "Cursor";
		}
		if (copilot?.isActive) {
			return "Copilot";
		}

		return "AI";
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

		// Show confirmation dialog (modal has its own dismiss/cancel)
		const result = await vscode.window.showWarningMessage(
			`🔴 This file is protected (BLOCK mode).

File: ${filename}

A snapshot will be created before saving.`,
			{ modal: true },
			"Create Snapshot & Save",
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

		// Prompt for reason/justification
		const justification = await vscode.window.showInputBox({
			prompt: "Why are you modifying this protected file?",
			placeHolder: "e.g., Updating API key rotation, fixing critical bug...",
			ignoreFocusOut: true,
			validateInput: (value: string) => {
				if (!value || value.trim().length < 5) {
					return "Please provide a reason (at least 5 characters)";
				}
				return null;
			},
		});

		if (!justification) {
			// User cancelled the input box
			logger.info("User cancelled BLOCK mode justification input", { filePath });
			vscode.window.setStatusBarMessage(`🔴 Save cancelled for ${filename}`, 2000);
			await this.auditLogger.recordAudit(filePath, protectionLevel, "save_blocked", {
				reason: "user_cancelled_justification_input",
			});
			await this.restoreDocumentContents(document, preSaveContent);
			throw new vscode.CancellationError();
		}

		// User confirmed - create snapshot and allow save
		logger.info("User confirmed BLOCK mode save - creating snapshot", {
			filePath,
			justification,
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
					{ reason: "block_mode_confirmed", justification },
					snapshotId,
				);

				vscode.window.setStatusBarMessage(`✅ Snapshot created for ${filename} - save allowed`, 3000);

				logger.info("Snapshot created for BLOCK mode save", {
					filePath,
					snapshotId,
				});

				// Show recovery notification - the viral moment!
				void this.showRecoveryNotification(filePath, snapshotId);

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

				// Show recovery notification - the viral moment!
				void this.showRecoveryNotification(filePath, snapshotId);

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

				// Show recovery notification - the viral moment!
				void this.showRecoveryNotification(filePath, snapshotId);

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
	 * @param userContext - Optional user-provided context (e.g., 'bug-fix', custom reason)
	 * @returns Promise with snapshot ID, or undefined if creation failed
	 */
	private async createSnapshotForFile(
		filePath: string,
		_filename: string,
		preSaveContent: string,
		userContext?: string,
	): Promise<string | undefined> {
		// 🔍 DIAGNOSTIC: Before snapshot creation
		console.log(`[ProtectionLevel] Creating snapshot for: ${filePath}`);
		console.log("[ProtectionLevel] Snapshot ID will be: pending");

		logger.info("Creating snapshot for file", {
			filePath,
			contentLength: preSaveContent.length,
			userContext,
		});

		// Get workspace root
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
		// Convert absolute path to relative path
		const relativePath = path.relative(workspaceRoot, filePath);

		// 🐛 FIX: Compute actual line changes for meaningful snapshot names
		// Previously linesAdded/linesDeleted were hardcoded to 0
		let linesAdded = 0;
		let linesDeleted = 0;
		try {
			// Read current file content from disk to compare with pre-save content
			const fileUri = vscode.Uri.file(filePath);
			const currentBytes = await vscode.workspace.fs.readFile(fileUri);
			const currentContent = Buffer.from(currentBytes).toString("utf8");

			// Simple line diff: count lines in each version
			const preSaveLines = preSaveContent.split(/\r?\n/).length;
			const currentLines = currentContent.split(/\r?\n/).length;

			// If current has more lines, those were added; if fewer, those were deleted
			if (currentLines > preSaveLines) {
				linesAdded = currentLines - preSaveLines;
			} else if (currentLines < preSaveLines) {
				linesDeleted = preSaveLines - currentLines;
			} else {
				// Same line count but content changed - mark as 1 line modified
				if (currentContent !== preSaveContent) {
					linesAdded = 1;
					linesDeleted = 1;
				}
			}
		} catch (error) {
			// File doesn't exist yet (new file) or read failed - use content length estimate
			linesAdded = preSaveContent.split(/\r?\n/).length;
			logger.debug("Could not compare files for line diff", {
				filePath,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		// Use intelligent snapshot naming strategy for GitLens parity
		const namingStrategy = new SnapshotNamingStrategy(workspaceRoot, { logger: sdkLogger });
		const snapshotInfo = {
			files: [
				{
					path: relativePath,
					status: "modified" as const,
					linesAdded,
					linesDeleted,
				},
			],
			workspaceRoot,
			userContext, // Include user-provided context for naming
		};

		const snapshotName = await namingStrategy.generateName(snapshotInfo);

		// Pass PRE-SAVE content to snapshot creation with relative paths
		const snapshotId = await this.operationCoordinator.coordinateSnapshotCreation(
			false, // Don't show notification (we'll show our own)
			[relativePath], // Only snapshot this specific file (relative path)
			{ [relativePath]: preSaveContent }, // PRE-SAVE content map with relative path
			snapshotName, // Intelligent snapshot name
		);

		// 🔍 DIAGNOSTIC: After snapshot creation
		if (snapshotId) {
			console.log(`[ProtectionLevel] Snapshot created: ${snapshotId}`);
			console.log("[ProtectionLevel] Calling showRecoveryNotification()");
		} else {
			console.log("[ProtectionLevel] Snapshot creation FAILED - no ID returned");
		}

		if (snapshotId) {
			await this.registry.markSnapshot(snapshotId, [filePath]);
			this.cooldownService.recordSnapshotTime(filePath);

			// P0 FIX: Show recovery notification (Bug #1 root cause)
			// This was logged but never called - the viral moment was missing!
			void this.showRecoveryNotification(filePath, snapshotId);

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
