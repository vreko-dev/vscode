import type { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import { SNAPBACK_ICONS } from "../constants/index.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { logger } from "../utils/logger.js";

/**
 * Migration Service for users upgrading from auto-protection version
 *
 * Previous versions auto-protected 140+ files on startup.
 * This service detects existing users and provides migration options.
 */
export class MigrationService {
	private readonly MIGRATION_COMPLETED_KEY = "snapback.migration.completed";
	private readonly MIGRATION_ACTION_KEY = "snapback.migration.action";
	private readonly AUTO_PROTECTED_THRESHOLD = 100;

	constructor(
		private readonly context: ExtensionContext,
		private readonly protectedFileRegistry: ProtectedFileRegistry,
	) {}

	/**
	 * Check if user needs migration and show UI if needed (non-blocking)
	 * Runs asynchronously without blocking extension activation
	 */
	async checkAndMigrate(): Promise<void> {
		try {
			// Skip if already completed
			const migrationCompleted = this.context.globalState.get<boolean>(
				this.MIGRATION_COMPLETED_KEY,
			);
			if (migrationCompleted) {
				logger.debug("Migration already completed, skipping");
				return;
			}

			// Check if user should see migration banner
			const shouldShowMigration = await this.shouldShowMigration();
			if (!shouldShowMigration) {
				logger.debug("User does not need migration");
				return;
			}

			// Get protected file count
			const protectedFiles = await this.protectedFileRegistry.list();
			logger.info(
				`Detected ${protectedFiles.length} protected files - showing migration UI`,
			);

			// ⚡ PERF: Show migration dialog asynchronously
			// Don't await - let user interact with UI while dialog is open
			this.showMigrationDialog(protectedFiles.length).catch((err) => {
				logger.error("Migration dialog failed", err as Error);
			});
		} catch (error) {
			logger.error("Migration check failed", error as Error);
			// Don't block extension activation on migration errors
		}
	}

	/**
	 * Determine if user needs migration
	 * A user needs migration if they have 100+ protected files
	 */
	private async shouldShowMigration(): Promise<boolean> {
		const protectedFiles = await this.protectedFileRegistry.list();

		// Migration needed if 100+ files are protected (indicates old auto-protection)
		return protectedFiles.length >= this.AUTO_PROTECTED_THRESHOLD;
	}

	/**
	 * Show migration dialog with three options:
	 * 1. Keep All - Keep existing protection
	 * 2. Review - Open files tree for manual cleanup
	 * 3. Start Fresh - Clear all and start over
	 */
	private async showMigrationDialog(protectedCount: number): Promise<void> {
		const message = `SnapBack has been updated! You have ${protectedCount} protected files from the previous version.

Previously, SnapBack automatically protected files on startup. Now, protection requires your consent.

Your existing protections remain active. You can:
• Keep All: Keep your existing protections unchanged
• Review: Manually remove files you no longer want protected
• Start Fresh: Clear all protections and protect only critical files`;

		const choice = await vscode.window.showInformationMessage(
			message,
			"Keep All",
			"Review",
			"Start Fresh",
		);

		if (!choice) {
			// User dismissed the dialog
			logger.debug("Migration dialog dismissed without choice");
			return;
		}

		logger.info(`User chose migration action: ${choice}`);

		switch (choice) {
			case "Keep All":
				await this.handleKeepAll();
				break;
			case "Review":
				await this.handleReview();
				break;
			case "Start Fresh":
				await this.handleStartFresh();
				break;
		}
	}

	/**
	 * Handle "Keep All" option - keep existing protections
	 */
	private async handleKeepAll(): Promise<void> {
		// Mark migration as completed
		await this.context.globalState.update(this.MIGRATION_COMPLETED_KEY, true);
		await this.context.globalState.update(
			this.MIGRATION_ACTION_KEY,
			"keep_all",
		);

		logger.info("User chose to keep all protected files");

		// Show confirmation
		vscode.window.showInformationMessage(
			`${SNAPBACK_ICONS.SUCCESS} Migration complete! Your protected files remain unchanged.`,
		);
	}

	/**
	 * Handle "Review" option - open protected files tree
	 */
	private async handleReview(): Promise<void> {
		logger.info("User chose to review protected files");

		// Focus on protected files view for manual cleanup
		await vscode.commands.executeCommand("snapback.showAllProtectedFiles");

		// Mark migration as completed
		await this.context.globalState.update(this.MIGRATION_COMPLETED_KEY, true);
		await this.context.globalState.update(this.MIGRATION_ACTION_KEY, "review");

		vscode.window.showInformationMessage(
			"You can now remove files you don't want protected. Migration will be marked complete once you're done.",
		);
	}

	/**
	 * Handle "Start Fresh" option - clear all protected files
	 */
	private async handleStartFresh(): Promise<void> {
		const confirm = await vscode.window.showWarningMessage(
			`This will clear all protected files. Continue?`,
			"Clear All",
			"Cancel",
		);

		if (confirm !== "Clear All") {
			logger.debug("User cancelled start fresh");
			return;
		}

		try {
			// Clear all protected files
			const protectedFiles = await this.protectedFileRegistry.list();
			for (const file of protectedFiles) {
				await this.protectedFileRegistry.remove(file.path);
			}

			logger.info(
				`Cleared ${protectedFiles.length} protected files for fresh start`,
			);

			// Mark migration as completed
			await this.context.globalState.update(this.MIGRATION_COMPLETED_KEY, true);
			await this.context.globalState.update(
				this.MIGRATION_ACTION_KEY,
				"start_fresh",
			);

			vscode.window.showInformationMessage(
				`${SNAPBACK_ICONS.SUCCESS} All ${protectedFiles.length} protected files cleared! You can now use "Protect This Repo" to protect only the files you need.`,
			);
		} catch (error) {
			logger.error("Failed to clear protected files", error as Error);
			vscode.window.showErrorMessage(
				`Failed to clear protected files: ${(error as Error).message}`,
			);
		}
	}
}
