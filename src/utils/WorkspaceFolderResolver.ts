import * as vscode from "vscode";
import { getDepth, isWithin } from "./PathNormalizer";

/**
 * Handles multi-root workspace scenarios for SnapBack
 *
 * Provides utilities to:
 * - Resolve which workspace folder a file belongs to
 * - Handle single vs multi-root workspace selection
 * - Sort workspace folders by specificity (deepest first)
 * - Cache lookups for performance (<10ms budget)
 */
export class WorkspaceFolderResolver {
	private folders: vscode.WorkspaceFolder[];
	private folderCache = new Map<string, vscode.WorkspaceFolder>();
	private disposable: vscode.Disposable | undefined;

	/**
	 * Create a new workspace folder resolver
	 *
	 * @param workspaceFolders - Array of workspace folders to manage
	 *                          Defaults to vscode.workspace.workspaceFolders
	 */
	constructor(
		workspaceFolders: readonly vscode.WorkspaceFolder[] = vscode.workspace
			.workspaceFolders || [],
		listenForChanges = true,
	) {
		// Sort by path depth (deepest first) for specificity in nested workspaces
		// This ensures that if you have both /monorepo and /monorepo/packages/app,
		// a file in /monorepo/packages/app/src will match the more specific folder
		this.folders = [...workspaceFolders].sort((a, b) => {
			const depthA = getDepth(a.uri.fsPath);
			const depthB = getDepth(b.uri.fsPath);
			return depthB - depthA; // Descending order (deepest first)
		});

		// Listen for workspace folder changes to invalidate cache
		if (listenForChanges) {
			this.disposable = vscode.workspace.onDidChangeWorkspaceFolders(
				(_event) => {
					// Rebuild folder list with new folders
					this.folders = [...(vscode.workspace.workspaceFolders || [])].sort(
						(a, b) => {
							const depthA = getDepth(a.uri.fsPath);
							const depthB = getDepth(b.uri.fsPath);
							return depthB - depthA;
						},
					);

					// Clear cache as folder mappings have changed
					this.folderCache.clear();
				},
			);
		}
	}

	/**
	 * Get the workspace folder that contains the given file URI
	 * Returns the most specific (deepest) workspace folder if multiple match
	 *
	 * Uses caching for performance - repeated lookups are <1ms
	 *
	 * @param fileUri - URI of the file to resolve
	 * @returns WorkspaceFolder containing the file, or null if not in any workspace
	 *
	 * @example
	 * // Single workspace
	 * const folder = resolver.getWorkspaceFolderForFile(Uri.file('/project/src/index.ts'));
	 * // folder.uri.fsPath === '/project'
	 *
	 * @example
	 * // Nested workspaces - returns most specific
	 * const folders = [
	 *   { uri: Uri.file('/monorepo') },
	 *   { uri: Uri.file('/monorepo/packages/app') }
	 * ];
	 * const resolver = new WorkspaceFolderResolver(folders);
	 * const folder = resolver.getWorkspaceFolderForFile(
	 *   Uri.file('/monorepo/packages/app/src/index.ts')
	 * );
	 * // folder.uri.fsPath === '/monorepo/packages/app' (more specific)
	 */
	getWorkspaceFolderForFile(
		fileUri: vscode.Uri,
	): vscode.WorkspaceFolder | null {
		const filePath = fileUri.fsPath;

		// Check cache first (performance optimization)
		const cached = this.folderCache.get(filePath);
		if (cached) {
			return cached;
		}

		// Iterate sorted folders (deepest first for specificity)
		for (const folder of this.folders) {
			if (isWithin(filePath, folder.uri.fsPath)) {
				// Cache the result
				this.folderCache.set(filePath, folder);
				return folder;
			}
		}

		return null;
	}

	/**
	 * Get all workspace folders sorted by depth (deepest first)
	 *
	 * @returns Array of workspace folders, sorted by path depth
	 */
	getAllWorkspaceFolders(): vscode.WorkspaceFolder[] {
		return [...this.folders]; // Return copy to prevent mutations
	}

	/**
	 * Require exactly one workspace folder, or prompt user to select
	 * Throws if no workspace folders exist
	 *
	 * Use this when you need a workspace folder but can handle multi-root
	 * by asking the user which one to use.
	 *
	 * @returns The single workspace folder, or user-selected folder
	 * @throws Error if no workspace folders exist or user cancels selection
	 *
	 * @example
	 * const folder = await resolver.requireSingleWorkspace();
	 * const storage = new Storage(folder.uri.fsPath);
	 */
	async requireSingleWorkspace(): Promise<vscode.WorkspaceFolder> {
		if (this.folders.length === 0) {
			throw new Error("SnapBack requires an open workspace folder");
		}

		if (this.folders.length === 1) {
			return this.folders[0];
		}

		// Multiple workspaces - prompt user to select
		const selected = await vscode.window.showWorkspaceFolderPick({
			placeHolder: "Select workspace folder for SnapBack",
			ignoreFocusOut: true,
		});

		if (!selected) {
			throw new Error("No workspace folder selected");
		}

		return selected;
	}

	/**
	 * Update workspace folders and clear cache
	 * Call this when workspace folders are added/removed at runtime
	 *
	 * @param workspaceFolders - New workspace folders array
	 */
	updateWorkspaceFolders(
		workspaceFolders: readonly vscode.WorkspaceFolder[],
	): void {
		// Re-sort by depth
		this.folders = [...workspaceFolders].sort((a, b) => {
			const depthA = getDepth(a.uri.fsPath);
			const depthB = getDepth(b.uri.fsPath);
			return depthB - depthA;
		});
		// Clear cache as folder mappings may have changed
		this.folderCache.clear();
	}

	/**
	 * Clear cache (call when workspace folders change)
	 *
	 * Should be called when:
	 * - Workspace folders are added/removed
	 * - For testing purposes
	 */
	clearCache(): void {
		this.folderCache.clear();
	}

	/**
	 * Check if there are multiple workspace folders
	 *
	 * @returns true if more than one workspace folder exists
	 */
	hasMultipleWorkspaces(): boolean {
		return this.folders.length > 1;
	}

	/**
	 * Check if there are any workspace folders
	 *
	 * @returns true if at least one workspace folder exists
	 */
	hasWorkspace(): boolean {
		return this.folders.length > 0;
	}

	/**
	 * Get the number of workspace folders
	 *
	 * @returns Count of workspace folders
	 */
	getWorkspaceCount(): number {
		return this.folders.length;
	}

	/**
	 * Dispose of event listeners and cleanup resources
	 * Should be called when the resolver is no longer needed
	 */
	dispose(): void {
		this.disposable?.dispose();
	}
}
