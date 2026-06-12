/**
 * Tree Item Utility Functions
 *
 * VS Code uses TreeItem.id for internal state management (expansion persistence, selection),
 * but commands need the actual data ID for operations. This module provides type-safe
 * utilities to extract the correct ID from tree items.
 *
 * **Background:**
 * - Tree providers set `item.id` to display IDs like "vreko:activity:snapshot:snap-123"
 * - The actual snapshot ID ("snap-123") is stored in `item.data.id`
 * - Direct command invocations pass the actual ID in `item.id`
 *
 * **Usage Pattern:**
 * ```typescript
 * // In command handlers
 * const snapshotId = extractSnapshotId(item);
 * await snapshotManager.deleteSnapshot(snapshotId);
 * ```
 *
 * @see {@link https://code.visualstudio.com/api/extension-guides/tree-view Tree View API}
 */

/**
 * Extracts the actual data ID from a tree item.
 *
 * **ID Priority:**
 * 1. `item.data.id` - Actual data ID (preferred)
 * 2. `item.id` - Fallback for direct command invocations
 *
 * **When to use:**
 * - Generic tree item ID extraction across different item types
 * - When you need optional extraction (returns undefined if no ID)
 *
 * @param item - Tree item from TreeDataProvider or command argument
 * @returns The actual data ID, or undefined if not found
 *
 * @example
 * // Tree view item (with data.id)
 * const item = { id: "vreko:activity:snapshot:snap-123", data: { id: "snap-123" } };
 * extractTreeItemId(item); // "snap-123"
 *
 * @example
 * // Direct command invocation (only id)
 * const item = { id: "snap-456" };
 * extractTreeItemId(item); // "snap-456"
 */
export function extractTreeItemId<T extends { id?: string; data?: { id?: string } }>(
	item: T | undefined,
): string | undefined {
	if (!item) {
		return undefined;
	}

	// Prefer data.id (set by TreeDataProvider for display/operation separation)
	if (item.data?.id) {
		return item.data.id;
	}

	// Fall back to id (for direct command invocation or items without data)
	if (item.id) {
		return item.id;
	}

	return undefined;
}

/**
 * Extracts snapshot ID from a tree item with type-safe error handling.
 *
 * **Difference from extractTreeItemId:**
 * - Throws error if ID not found (strict validation)
 * - Type-safe for snapshot-specific operations
 * - Better for command handlers that require valid IDs
 *
 * **When to use:**
 * - Snapshot command handlers (delete, rename, protect, etc.)
 * - Any operation that MUST have a valid snapshot ID to proceed
 *
 * @param item - Snapshot tree item from tree view or command
 * @returns The actual snapshot ID
 * @throws Error if snapshot ID cannot be extracted
 *
 * @example
 * // Command handler pattern
 * vscode.commands.registerCommand("vreko.deleteSnapshot", async (item) => {
 *   try {
 *     const snapshotId = extractSnapshotId(item);
 *     await snapshotManager.deleteSnapshot(snapshotId);
 *   } catch (error) {
 *     vscode.window.showErrorMessage(error.message);
 *   }
 * });
 *
 * @example
 * // Regression test case (bug fix)
 * const item = {
 *   id: "vreko:activity:snapshot:snap-1765962781479-bg6b2i",
 *   data: { id: "snap-1765962781479-bg6b2i" }
 * };
 * extractSnapshotId(item); // "snap-1765962781479-bg6b2i" (not the display ID)
 */
export function extractSnapshotId(
	item:
		| {
				id?: string;
				label?: string;
				data?: { type?: "snapshot" | "file"; id?: string };
		  }
		| undefined,
): string {
	const id = extractTreeItemId(item);

	if (!id) {
		throw new Error("Snapshot ID not found in tree item");
	}

	return id;
}

// ============================================
// TREE ITEM FACTORY FUNCTIONS
// ============================================

import * as vscode from "vscode";

/**
 * Creates a TreeItem for a file entry with proper icon support.
 * Automatically sets resourceUri to enable file icon theming.
 *
 * CRITICAL: resourceUri must be set for ThemeIcon.File to render.
 * This enables VS Code's file icon theme to show the correct icon.
 *
 * @param label - The display label for the tree item
 * @param filePath - The file path (used for resourceUri)
 * @param collapsibleState - Whether the item is collapsible
 * @returns Configured TreeItem with proper icon support
 *
 * @see https://linear.app/marcelle-labs/issue/SB-256
 */
export function createFileTreeItem(
	label: string,
	filePath: string,
	collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
): vscode.TreeItem {
	const item = new vscode.TreeItem(label, collapsibleState);

	// CRITICAL: resourceUri must be set for ThemeIcon.File to render
	item.resourceUri = vscode.Uri.file(filePath);
	item.iconPath = vscode.ThemeIcon.File;
	item.tooltip = filePath;

	return item;
}

/**
 * Creates a TreeItem for a folder entry with proper icon support.
 * Automatically sets resourceUri to enable folder icon theming.
 *
 * @param label - The display label for the tree item
 * @param folderPath - The folder path (used for resourceUri)
 * @param collapsibleState - Whether the item is collapsible
 * @returns Configured TreeItem with proper folder icon support
 */
export function createFolderTreeItem(
	label: string,
	folderPath: string,
	collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
): vscode.TreeItem {
	const item = new vscode.TreeItem(label, collapsibleState);

	// CRITICAL: resourceUri must be set for ThemeIcon.Folder to render
	item.resourceUri = vscode.Uri.file(folderPath);
	item.iconPath = vscode.ThemeIcon.Folder;
	item.tooltip = folderPath;

	return item;
}
