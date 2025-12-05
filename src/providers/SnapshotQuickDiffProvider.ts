import * as vscode from "vscode";

/**
 * SnapshotQuickDiffProvider - QuickDiffProvider for "pre-AI" state tracking
 *
 * Provides original resource URIs (snapback://) to VSCode's diff gutter
 * for files with tracked "pre-AI" snapshots. Enables inline diff visualization
 * of changes made since AI activation.
 *
 * Architecture:
 * - Tracks workspace-relative paths → snapshot IDs (Map-based, O(1) lookup)
 * - Returns snapback:// URIs when tracked, null otherwise
 * - Latest-wins update strategy for snapshot replacements
 * - Performance: <5ms lookup with 1000 tracked files
 *
 * @example
 * ```typescript
 * const provider = new SnapshotQuickDiffProvider();
 * context.subscriptions.push(
 *   vscode.workspace.registerQuickDiffProvider('snapback-pre-ai', provider)
 * );
 *
 * // Track snapshot when AI is detected
 * const uri = vscode.Uri.file('/workspace/src/auth.ts');
 * provider.trackSnapshot(uri, 'snap-123');
 *
 * // VSCode will call provideOriginalResource() for diff gutter
 * // Returns: snapback://snap-123/src%2Fauth.ts
 * ```
 *
 * @see {@link https://code.visualstudio.com/api/references/vscode-api#QuickDiffProvider}
 */
export class SnapshotQuickDiffProvider implements vscode.QuickDiffProvider {
	/**
	 * Map of workspace-relative paths to snapshot IDs
	 * Key: workspace-relative path (e.g., "src/auth.ts")
	 * Value: snapshot ID (e.g., "snap-123")
	 */
	private trackedSnapshots: Map<string, string> = new Map();

	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChange.event;

	readonly label = "SnapBack (Pre-AI State)";

	/**
	 * Provide original resource URI for a file
	 *
	 * Called by VSCode to get the "original" version of a file for diff gutter.
	 * Returns snapback:// URI if snapshot is tracked, null otherwise.
	 *
	 * @param uri - File URI to check
	 * @param _token - Cancellation token (unused, but required by interface)
	 * @returns snapback:// URI if tracked, null if not tracked
	 */
	provideOriginalResource(
		uri: vscode.Uri,
		_token: vscode.CancellationToken,
	): vscode.Uri | null {
		if (!uri) {
			return null;
		}

		// Get workspace-relative path
		const relativePath = this.getRelativePath(uri);
		if (!relativePath) {
			return null;
		}

		// Look up snapshot ID
		const snapshotId = this.trackedSnapshots.get(relativePath);
		if (!snapshotId) {
			return null;
		}

		// Construct snapback:// URI
		// Format: snapback://<snapshotId>/<encodedFilePath>
		const encodedPath = encodeURIComponent(relativePath);
		return vscode.Uri.parse(`snapback://${snapshotId}/${encodedPath}`);
	}

	/**
	 * Track a snapshot for a file
	 *
	 * Associates a file with a "pre-AI" snapshot. When tracked, the diff gutter
	 * will show changes relative to this snapshot.
	 *
	 * Latest-wins strategy: If a file is already tracked, the new snapshot ID
	 * replaces the old one.
	 *
	 * @param uri - File URI to track
	 * @param snapshotId - Snapshot ID to associate
	 */
	public trackSnapshot(uri: vscode.Uri, snapshotId: string): void {
		const relativePath = this.getRelativePath(uri);
		if (!relativePath) {
			return;
		}

		// Store in map (latest-wins)
		this.trackedSnapshots.set(relativePath, snapshotId);

		// Fire change event to update diff gutter
		this._onDidChange.fire(uri);
	}

	/**
	 * Clear tracking for a file
	 *
	 * Removes snapshot association for a file. The diff gutter will revert
	 * to default behavior (typically showing diff vs saved file or git HEAD).
	 *
	 * @param uri - File URI to clear
	 */
	public clearTracking(uri: vscode.Uri): void {
		const relativePath = this.getRelativePath(uri);
		if (!relativePath) {
			return;
		}

		// Remove from map
		const hadTracking = this.trackedSnapshots.delete(relativePath);

		// Fire change event only if tracking existed
		if (hadTracking) {
			this._onDidChange.fire(uri);
		}
	}

	/**
	 * Get workspace-relative path for a URI
	 *
	 * Converts absolute file URI to workspace-relative path for storage.
	 * Handles multi-root workspaces by using the most specific workspace folder.
	 *
	 * @param uri - File URI
	 * @returns Workspace-relative path or null if not in workspace
	 */
	private getRelativePath(uri: vscode.Uri): string | null {
		if (uri.scheme !== "file") {
			return null;
		}

		// Get workspace folder containing this file
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
		if (!workspaceFolder) {
			// File not in any workspace folder
			return null;
		}

		// Get relative path from workspace root
		const relativePath = vscode.workspace.asRelativePath(uri, false);

		return relativePath;
	}

	/**
	 * Dispose provider and clean up resources
	 */
	dispose(): void {
		this._onDidChange.dispose();
		this.trackedSnapshots.clear();
	}
}
