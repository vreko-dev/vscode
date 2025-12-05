import * as vscode from "vscode";
import type { OperationCoordinator } from "../operationCoordinator.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { logger } from "../utils/logger.js";

/**
 * CodeLens provider for SnapBack inline UI elements
 *
 * This provider adds inline CodeLens elements to protected files with actions like:
 * - "Allow once" - Allow this save operation
 * - "Mark wrong" - Mark this as a false positive
 * - "Details" - Show more information about why this file is protected
 *
 * MVP Note: This replaces the modal dialogs with inline UI elements to reduce
 * interruption cost for users. The approach uses inline banners with chips that
 * store rationale without flow break.
 */
export class SnapBackCodeLensProvider implements vscode.CodeLensProvider {
	private disposables: vscode.Disposable[] = [];

	constructor(
		private protectedFileRegistry: ProtectedFileRegistry,
		_operationCoordinator: OperationCoordinator,
	) {}

	/**
	 * Provide CodeLenses for the given document
	 */
	provideCodeLenses(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken,
	): vscode.ProviderResult<vscode.CodeLens[]> {
		try {
			// Check if this is a protected file
			const filePath = document.fileName;
			const isProtected = this.protectedFileRegistry.isProtected(filePath);

			if (!isProtected) {
				return [];
			}

			// Get protection level
			const protectionLevel =
				this.protectedFileRegistry.getProtectionLevel(filePath);

			// Only show CodeLenses for BLOCK level protected files
			if (protectionLevel !== "Protected") {
				return [];
			}

			// Create CodeLenses at the top of the file
			const codeLenses: vscode.CodeLens[] = [];

			// Add main CodeLens with protection information
			const protectionInfoLens = new vscode.CodeLens(
				new vscode.Range(0, 0, 0, 0),
				{
					title: `$(shield) BLOCK Protection Active - Save requires snapshot`,
					command: "snapback.showProtectionDetails",
					arguments: [filePath],
				},
			);
			codeLenses.push(protectionInfoLens);

			// Add action CodeLenses
			const actionLens = new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
				title: "$(check) Allow once",
				command: "snapback.allowOnce",
				arguments: [filePath],
			});
			codeLenses.push(actionLens);

			const markWrongLens = new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
				title: "$(circle-slash) Mark wrong",
				command: "snapback.markWrong",
				arguments: [filePath],
			});
			codeLenses.push(markWrongLens);

			const detailsLens = new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
				title: "$(info) Details",
				command: "snapback.showProtectionDetails",
				arguments: [filePath],
			});
			codeLenses.push(detailsLens);

			// this.codeLenses = codeLenses;
			return codeLenses;
		} catch (error) {
			logger.error(
				"Error providing CodeLenses:",
				error instanceof Error ? error : undefined,
			);
			return [];
		}
	}

	/**
	 * Resolve a CodeLens (add more details if needed)
	 */
	resolveCodeLens(
		codeLens: vscode.CodeLens,
		_token: vscode.CancellationToken,
	): vscode.ProviderResult<vscode.CodeLens> {
		// For now, we don't need to resolve anything additional
		return codeLens;
	}

	/**
	 * Register the CodeLens provider with VS Code
	 */
	register(context: vscode.ExtensionContext): void {
		// Register the CodeLens provider for all file types
		const providerDisposable = vscode.languages.registerCodeLensProvider(
			{ scheme: "file" },
			this,
		);
		this.disposables.push(providerDisposable);

		// Register command handlers
		const allowOnceCommand = vscode.commands.registerCommand(
			"snapback.allowOnce",
			(filePath: string) => this.handleAllowOnce(filePath),
		);
		this.disposables.push(allowOnceCommand);

		const markWrongCommand = vscode.commands.registerCommand(
			"snapback.markWrong",
			(filePath: string) => this.handleMarkWrong(filePath),
		);
		this.disposables.push(markWrongCommand);

		const showDetailsCommand = vscode.commands.registerCommand(
			"snapback.showProtectionDetails",
			(filePath: string) => this.handleShowDetails(filePath),
		);
		this.disposables.push(showDetailsCommand);

		// Add disposables to extension context
		context.subscriptions.push(...this.disposables);
	}

	/**
	 * Handle "Allow once" command
	 */
	private async handleAllowOnce(filePath: string): Promise<void> {
		try {
			logger.info("Allow once requested for file", { filePath });

			// Grant temporary allowance for this file (valid for 5 minutes)
			this.protectedFileRegistry.grantTemporaryAllowance(
				filePath,
				5 * 60 * 1000,
			);

			// Show status bar message
			vscode.window.setStatusBarMessage(
				`✅ Save allowed once for ${vscode.workspace.asRelativePath(filePath)}`,
				3000,
			);
		} catch (error) {
			logger.error(
				"Error handling allow once:",
				error instanceof Error ? error : undefined,
			);
			vscode.window.showErrorMessage("Failed to allow save operation");
		}
	}

	/**
	 * Handle "Mark wrong" command
	 */
	private async handleMarkWrong(filePath: string): Promise<void> {
		try {
			logger.info("Mark wrong requested for file", { filePath });

			// Show status bar message
			vscode.window.setStatusBarMessage(
				`✅ Marked as false positive: ${vscode.workspace.asRelativePath(
					filePath,
				)}`,
				3000,
			);

			// TODO: Implement actual mark wrong logic
			// This would typically involve recording this as a false positive and potentially
			// adjusting protection rules
		} catch (error) {
			logger.error(
				"Error handling mark wrong:",
				error instanceof Error ? error : undefined,
			);
			vscode.window.showErrorMessage("Failed to mark as false positive");
		}
	}

	/**
	 * Handle "Details" command
	 */
	private async handleShowDetails(filePath: string): Promise<void> {
		try {
			logger.info("Show details requested for file", { filePath });

			// Get protection information
			const protectionLevel =
				this.protectedFileRegistry.getProtectionLevel(filePath);
			const relativePath = vscode.workspace.asRelativePath(filePath);

			// Show information message with details
			vscode.window.showInformationMessage(
				`File Protection Details`,
				{
					detail: `File: ${relativePath}\nProtection Level: ${protectionLevel}\n\nThis file requires a snapshot before saving to prevent accidental changes to critical code.`,
				},
				"OK",
			);
		} catch (error) {
			logger.error(
				"Error handling show details:",
				error instanceof Error ? error : undefined,
			);
			vscode.window.showErrorMessage("Failed to show protection details");
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this.disposables.forEach((disposable) => {
			disposable.dispose();
		});
		this.disposables = [];
		// this.codeLenses = [];
	}
}
