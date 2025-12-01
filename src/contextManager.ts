import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "./services/protectedFileRegistry.js";
import { logger } from "./utils/logger.js";

/**
 * ContextManager handles setting VS Code context variables for menu visibility
 * and dynamic menu titles based on file protection status.
 */
export class ContextManager {
	constructor(private readonly registry: ProtectedFileRegistry) {}

	/**
	 * Update context variables for the currently active file
	 * This should be called when:
	 * 1. Active editor changes
	 * 2. File protection status changes
	 * 3. Protection level changes
	 */
	public async updateContextForActiveFile(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			await this.clearFileContext();
			return;
		}

		const filePath = editor.document.uri.fsPath;
		await this.updateContextForFile(filePath);
	}

	/**
	 * Update context variables for a specific file
	 */
	public async updateContextForFile(filePath: string): Promise<void> {
		// Check if file is protected
		const isProtected = this.registry.isProtected(filePath);

		// Get protection level if file is protected
		const protectionLevel = isProtected
			? this.registry.getProtectionLevel(filePath)
			: undefined;

		// Check if file can be protected (not unsaved/untitled)
		const canProtect = !filePath.includes("Untitled");

		// Set context variables
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.isProtected",
			isProtected,
		);
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.currentLevel",
			protectionLevel,
		);
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.canProtect",
			canProtect,
		);

		logger.info(`[SnapBack] Context updated for ${filePath}:`, {
			isProtected,
			protectionLevel,
			canProtect,
		});
	}

	/**
	 * Clear file-specific context variables
	 */
	private async clearFileContext(): Promise<void> {
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.isProtected",
			false,
		);
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.currentLevel",
			undefined,
		);
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.canProtect",
			false,
		);
	}

	/**
	 * Update context when protection state changes
	 */
	public async onProtectionStateChanged(filePath: string): Promise<void> {
		// If this is the active file, update context immediately
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor && activeEditor.document.uri.fsPath === filePath) {
			await this.updateContextForFile(filePath);
		}
	}
}
