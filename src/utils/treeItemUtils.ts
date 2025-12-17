/**
 * Tree Item Utility Functions
 *
 * VS Code uses TreeItem.id for internal state management (expansion persistence, selection),
 * but commands need the actual data ID for operations. This module provides type-safe
 * utilities to extract the correct ID from tree items.
 *
 * **Background:**
 * - Tree providers set `item.id` to display IDs like "snapback:activity:snapshot:snap-123"
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
 * const item = { id: "snapback:activity:snapshot:snap-123", data: { id: "snap-123" } };
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
 * vscode.commands.registerCommand("snapback.deleteSnapshot", async (item) => {
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
 *   id: "snapback:activity:snapshot:snap-1765962781479-bg6b2i",
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
