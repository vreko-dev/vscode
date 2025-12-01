/**
 * @fileoverview Snapshot Document Provider - Virtual Document Content Provider
 *
 * This provider implements the VS Code TextDocumentContentProvider interface to serve
 * snapshot file content through a virtual URI scheme. This enables the diff editor
 * to display snapshot content without creating temporary files on disk.
 *
 * VIRTUAL DOCUMENT PATTERN:
 * ┌─ URI Scheme: snapback-snapshot: ───────────────────────────────────────────┐
 * │ snapback-snapshot:src/components/auth.ts → snapshot content for auth.ts  │
 * │ snapback-snapshot:deep/nested/file.ts → snapshot content for file.ts     │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * ARCHITECTURE:
 * - Implements vscode.TextDocumentContentProvider for virtual documents
 * - Uses EventEmitter for document change notifications
 * - Thread-safe content storage with Map-based cache
 * - Automatic cleanup of stale content references
 *
 * USAGE:
 * 1. Register provider in extension.ts:
 *    const provider = new SnapshotDocumentProvider();
 *    vscode.workspace.registerTextDocumentContentProvider('snapback-snapshot', provider);
 *
 * 2. Set snapshot content:
 *    provider.setSnapshotContent('src/file.ts', 'snapshot content here');
 *
 * 3. Create virtual URI:
 *    const uri = vscode.Uri.parse('snapback-snapshot:src/file.ts');
 *
 * 4. Use in diff editor:
 *    vscode.commands.executeCommand('vscode.diff', snapshotUri, currentUri, title);
 *
 * @see https://code.visualstudio.com/api/extension-guides/virtual-documents
 * @see https://code.visualstudio.com/api/references/vscode-api#TextDocumentContentProvider
 *
 * @author SnapBack Architecture Team
 * @version 1.0.0
 * @since 2024-01-09
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger.js";

/**
 * SnapshotDocumentProvider - Virtual Document Content Provider for Snapshots
 *
 * Provides snapshot file content through VS Code's virtual document system.
 * This eliminates the need for temporary files and provides a clean separation
 * between current file state and snapshot state.
 *
 * THREAD SAFETY:
 * - Content map is managed synchronously within the extension host
 * - No concurrent access issues in single-threaded extension context
 * - Event emitter handles change notifications safely
 *
 * MEMORY MANAGEMENT:
 * - Content is stored in memory only while needed
 * - Automatic cleanup through clearContent() method
 * - No disk I/O for temporary files
 * - Efficient for diff operations
 *
 * ERROR HANDLING:
 * - Returns empty string for missing content (graceful degradation)
 * - Logs warnings for content lookup failures
 * - Never throws errors that would break diff editor
 *
 * @implements {vscode.TextDocumentContentProvider}
 */
export class SnapshotDocumentProvider
	implements vscode.TextDocumentContentProvider
{
	/**
	 * Event emitter for document change notifications
	 *
	 * When snapshot content changes, this emitter notifies VS Code to refresh
	 * any open editors displaying the virtual document.
	 */
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();

	/**
	 * Public event for document change notifications
	 *
	 * VS Code subscribes to this event to know when to refresh virtual documents.
	 * This is part of the TextDocumentContentProvider interface contract.
	 */
	public readonly onDidChange = this._onDidChange.event;

	/**
	 * In-memory storage for snapshot file contents
	 *
	 * Maps file paths to their snapshot content. The key is the file path
	 * as it appears in the URI (e.g., 'src/components/auth.ts').
	 *
	 * STRUCTURE:
	 * Map<filePath: string, content: string>
	 *
	 * EXAMPLE:
	 * {
	 *   'src/auth.ts' => 'export function login() { ... }',
	 *   'src/utils.ts' => 'export function helper() { ... }'
	 * }
	 */
	private readonly contentMap = new Map<string, string>();

	/**
	 * Provide text document content for a virtual URI
	 *
	 * This method is called by VS Code when it needs to display content for
	 * a virtual document URI with the 'snapback-snapshot' scheme.
	 *
	 * Supports both simple file paths and composite snapshot/file paths.
	 *
	 * OPERATION FLOW:
	 * 1. Extract file path from URI (handles both simple and composite formats)
	 * 2. Lookup content in contentMap
	 * 3. Return content or empty string if not found
	 * 4. Log warning for missing content (debugging aid)
	 *
	 * URI FORMATS:
	 * - Simple: snapback-snapshot:src/auth.ts
	 * - Composite: snapback-snapshot:snapshot-123/src/auth.ts
	 *
	 * ERROR HANDLING:
	 * - Never throws exceptions (would break diff editor)
	 * - Returns empty string for missing content (graceful degradation)
	 * - Logs warnings for troubleshooting
	 *
	 * @param uri - Virtual document URI (scheme: snapback-snapshot)
	 * @returns Document content as string, or empty string if not found
	 *
	 * @example
	 * // VS Code calls this automatically when opening a diff editor
	 * const uri = vscode.Uri.parse('snapback-snapshot:src/auth.ts');
	 * const content = provider.provideTextDocumentContent(uri);
	 * // Returns the snapshot content previously set via setSnapshotContent()
	 */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		// Extract file path from URI
		// For URI 'snapback-snapshot:src/auth.ts', path is 'src/auth.ts'
		// For URI 'snapback-snapshot:snapshot-123/src/auth.ts', path is 'snapshot-123/src/auth.ts'
		let lookupKey = uri.path;

		// Check if this is a composite key format (snapshot-id/file-path)
		// If so, convert to composite key format (snapshot-id::file-path)
		if (lookupKey.includes("/")) {
			const firstSlashIndex = lookupKey.indexOf("/");
			const snapshotId = lookupKey.substring(0, firstSlashIndex);
			const filePath = lookupKey.substring(firstSlashIndex + 1);

			// Try composite key first
			const compositeKey = `${snapshotId}::${filePath}`;
			const compositeContent = this.contentMap.get(compositeKey);

			if (compositeContent !== undefined) {
				return compositeContent;
			}

			// Fall back to original path if composite key not found
			lookupKey = uri.path;
		}

		// Lookup content in cache
		const content = this.contentMap.get(lookupKey);

		if (content === undefined) {
			// Content not found - log for debugging but don't fail
			logger.warn(
				`[SnapshotDocumentProvider] No content found for: ${lookupKey}`,
			);
			return ""; // Return empty content for graceful degradation
		}

		return content;
	}

	/**
	 * Set snapshot content for a file path
	 *
	 * Stores the snapshot content in memory and notifies VS Code to refresh
	 * any open editors displaying this virtual document.
	 *
	 * Supports optional snapshot ID for multi-snapshot scenarios where
	 * multiple snapshots need to be previewed simultaneously.
	 *
	 * OPERATION FLOW:
	 * 1. Store content in contentMap with file path (or composite key) as key
	 * 2. Create virtual URI for the file path
	 * 3. Fire change event to notify VS Code of update
	 *
	 * CHANGE NOTIFICATION:
	 * If a diff editor is already open showing this snapshot, VS Code will
	 * automatically refresh it to show the new content.
	 *
	 * @param filePathOrSnapshotId - File path or snapshot ID (for composite key)
	 * @param contentOrFilePath - Content (if 2 params) or file path (if 3 params)
	 * @param optionalContent - Content (if 3 params provided)
	 *
	 * @example
	 * // Simple usage (2 params) - single snapshot
	 * provider.setSnapshotContent('src/auth.ts', 'export function login() { ... }');
	 *
	 * // Multi-snapshot usage (3 params) - multiple snapshots
	 * provider.setSnapshotContent('snapshot-123', 'src/auth.ts', 'export function login() { ... }');
	 *
	 * // Then create virtual URI and open diff
	 * const snapshotUri = vscode.Uri.parse('snapback-snapshot:src/auth.ts');
	 * const currentUri = vscode.Uri.file('src/auth.ts');
	 * await vscode.commands.executeCommand('vscode.diff', snapshotUri, currentUri, 'Diff Title');
	 */
	public setSnapshotContent(
		filePathOrSnapshotId: string,
		contentOrFilePath: string,
		optionalContent?: string,
	): void {
		// Determine if this is a 2-param or 3-param call
		const isMultiSnapshot = optionalContent !== undefined;

		let key: string;
		let content: string;
		let uriPath: string;

		if (isMultiSnapshot) {
			// 3-param call: (snapshotId, filePath, content)
			const snapshotId = filePathOrSnapshotId;
			const filePath = contentOrFilePath;
			content = optionalContent;

			// Create composite key: snapshotId::filePath
			key = `${snapshotId}::${filePath}`;
			uriPath = `${snapshotId}/${filePath}`;
		} else {
			// 2-param call: (filePath, content)
			key = filePathOrSnapshotId;
			content = contentOrFilePath;
			uriPath = filePathOrSnapshotId;
		}

		// Store content in memory cache
		this.contentMap.set(key, content);

		// Create virtual URI for change notification
		const uri = vscode.Uri.parse(`snapback-snapshot:${uriPath}`);

		// Notify VS Code that content has changed
		this._onDidChange.fire(uri);
	}

	/**
	 * Clear snapshot content for a specific file
	 *
	 * Removes the snapshot content from memory. This is useful for cleanup
	 * after a diff editor is closed or when the snapshot is no longer needed.
	 *
	 * MEMORY MANAGEMENT:
	 * - Frees memory by removing content from cache
	 * - Should be called when diff editor is closed
	 * - Can be called for all files when snapshots are deleted
	 *
	 * @param filePath - Relative file path to clear content for
	 *
	 * @example
	 * // Clear content after diff editor is closed
	 * provider.clearContent('src/auth.ts');
	 */
	public clearContent(filePath: string): void {
		// Clear by exact file path match
		this.contentMap.delete(filePath);

		// Also clear any composite keys that contain this file path
		for (const key of this.contentMap.keys()) {
			if (key.endsWith(`::${filePath}`)) {
				this.contentMap.delete(key);
			}
		}
	}

	/**
	 * Clear snapshot content for a specific snapshot ID and file path
	 *
	 * Removes the snapshot content from memory for a specific snapshot.
	 * This is useful for cleanup after a diff editor is closed.
	 *
	 * @param snapshotId - Snapshot ID
	 * @param filePath - Relative file path to clear content for
	 */
	public clearContentForSnapshot(snapshotId: string, filePath: string): void {
		// Clear composite key
		const compositeKey = `${snapshotId}::${filePath}`;
		this.contentMap.delete(compositeKey);

		// Also clear any path that matches the composite format
		const compositePath = `${snapshotId}/${filePath}`;
		this.contentMap.delete(compositePath);
	}

	/**
	 * Clear all snapshot content
	 *
	 * Removes all snapshot content from memory. Useful for cleanup when:
	 * - Extension is deactivating
	 * - All snapshots are deleted
	 * - Reset operation is performed
	 *
	 * MEMORY MANAGEMENT:
	 * - Clears all memory used by snapshot content cache
	 * - Should be called during extension cleanup
	 * - Safe to call multiple times
	 *
	 * @example
	 * // Clear all content during extension deactivation
	 * export function deactivate() {
	 *   snapshotProvider.clearAllContent();
	 * }
	 */
	public clearAllContent(): void {
		this.contentMap.clear();
	}

	/**
	 * Dispose of the provider and cleanup resources
	 *
	 * Implements the Disposable pattern for proper resource cleanup.
	 * Should be called when the provider is no longer needed.
	 *
	 * CLEANUP OPERATIONS:
	 * - Disposes event emitter to prevent memory leaks
	 * - Clears all content from memory
	 * - Prevents further use of the provider
	 *
	 * @example
	 * // Register provider with extension context for automatic disposal
	 * const provider = new SnapshotDocumentProvider();
	 * const disposable = vscode.workspace.registerTextDocumentContentProvider(
	 *   'snapback-snapshot',
	 *   provider
	 * );
	 * context.subscriptions.push(disposable);
	 * context.subscriptions.push(new vscode.Disposable(() => provider.dispose()));
	 */
	public dispose(): void {
		this._onDidChange.dispose();
		this.clearAllContent();
	}
}
