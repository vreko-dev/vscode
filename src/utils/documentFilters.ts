/**
 * Document Filtering Utilities
 *
 * Provides guards for VS Code document events to prevent SnapBack from
 * monitoring its own output channels and other non-file documents.
 *
 * CRITICAL: These filters prevent recursive loops where SnapBack's logging
 * triggers AI detection on its own Output channel.
 *
 * @module documentFilters
 */

import type * as vscode from "vscode";

/**
 * Valid document URI schemes that SnapBack should monitor.
 *
 * - 'file': Regular file system files
 * - 'untitled': New unsaved files (user is actively editing)
 *
 * Excluded schemes:
 * - 'output': VS Code Output channels (causes recursive loops!)
 * - 'git': Git diff views
 * - 'vscode': VS Code internal documents
 * - 'vscode-notebook-cell': Notebook cells
 * - 'debug': Debug console
 * - 'walkthrough': VS Code walkthroughs
 */
const MONITORED_SCHEMES = new Set(["file", "untitled"]);

/**
 * Check if a document should be monitored by SnapBack.
 *
 * Returns true only for real file system files and unsaved files.
 * Returns false for Output channels, git diffs, and other virtual documents.
 *
 * @param document - VS Code TextDocument to check
 * @returns true if document should be monitored, false otherwise
 *
 * @example
 * ```typescript
 * vscode.workspace.onDidChangeTextDocument((event) => {
 *   if (!isMonitorableDocument(event.document)) {
 *     return; // Skip Output channels, git diffs, etc.
 *   }
 *   // Process real file changes...
 * });
 * ```
 */
export function isMonitorableDocument(document: vscode.TextDocument): boolean {
	return MONITORED_SCHEMES.has(document.uri.scheme);
}

/**
 * Check if a URI scheme represents a real file.
 *
 * Useful when you only have access to the URI, not the full document.
 *
 * @param uri - VS Code Uri to check
 * @returns true if URI represents a monitorable document
 */
export function isMonitorableUri(uri: vscode.Uri): boolean {
	return MONITORED_SCHEMES.has(uri.scheme);
}

/**
 * Check if a document is specifically from an Output channel.
 *
 * Output channels have scheme 'output' and their fsPath contains
 * the extension ID (e.g., "MarcelleLabs.snapback-vscode.SnapBack").
 *
 * @param document - VS Code TextDocument to check
 * @returns true if document is an Output channel
 */
export function isOutputChannel(document: vscode.TextDocument): boolean {
	return document.uri.scheme === "output";
}

/**
 * Check if a document is from SnapBack's own Output channel.
 *
 * This is a specific check to prevent SnapBack from monitoring itself.
 *
 * @param document - VS Code TextDocument to check
 * @returns true if document is SnapBack's Output channel
 */
export function isSnapBackOutputChannel(document: vscode.TextDocument): boolean {
	if (document.uri.scheme !== "output") {
		return false;
	}
	// SnapBack's output channel path contains the extension ID
	const fsPath = document.uri.fsPath;
	return fsPath.includes("snapback") || fsPath.includes("SnapBack");
}
