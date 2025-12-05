import type * as vscode from "vscode";
import { WorkspaceFolderResolver } from "../utils/WorkspaceFolderResolver";

/**
 * Coordinates workspace operations across multi-root workspaces
 *
 * Provides a unified interface for:
 * - Resolving which workspace folder a file belongs to
 * - Managing workspace-specific metadata (recent files, branches, protection status)
 * - Handling single vs multi-root workspace scenarios
 *
 * This service uses VS Code's workspaceState API for persistence,
 * ensuring all operations are workspace-aware and properly scoped.
 */
export class WorkspaceManager {
	private resolver: WorkspaceFolderResolver;
	private workspaceState: vscode.Memento;

	/**
	 * Create a new workspace manager
	 *
	 * @param workspaceFolders - Array of workspace folders to manage
	 * @param context - VS Code extension context for workspace state storage
	 */
	constructor(
		workspaceFolders: readonly vscode.WorkspaceFolder[],
		context: vscode.ExtensionContext,
	) {
		this.resolver = new WorkspaceFolderResolver(workspaceFolders);
		this.workspaceState = context.workspaceState;
	}

	/**
	 * Get the workspace folder that contains the given file
	 *
	 * @param fileUri - URI of the file to resolve
	 * @returns WorkspaceFolder containing the file, or null if not in any workspace
	 */
	getWorkspaceFolderForFile(
		fileUri: vscode.Uri,
	): vscode.WorkspaceFolder | null {
		return this.resolver.getWorkspaceFolderForFile(fileUri);
	}

	/**
	 * Get all workspace folders sorted by depth (deepest first)
	 *
	 * @returns Array of workspace folders
	 */
	getAllWorkspaceFolders(): vscode.WorkspaceFolder[] {
		return this.resolver.getAllWorkspaceFolders();
	}

	/**
	 * Require exactly one workspace folder, or prompt user to select
	 *
	 * @returns The single workspace folder, or user-selected folder
	 * @throws Error if no workspace folders exist or user cancels selection
	 */
	async requireSingleWorkspace(): Promise<vscode.WorkspaceFolder> {
		return this.resolver.requireSingleWorkspace();
	}

	/**
	 * Check if there are multiple workspace folders
	 *
	 * @returns true if more than one workspace folder exists
	 */
	hasMultipleWorkspaces(): boolean {
		return this.resolver.hasMultipleWorkspaces();
	}

	/**
	 * Check if there are any workspace folders
	 *
	 * @returns true if at least one workspace folder exists
	 */
	hasWorkspace(): boolean {
		return this.resolver.hasWorkspace();
	}

	/**
	 * Get the number of workspace folders
	 *
	 * @returns Count of workspace folders
	 */
	getWorkspaceCount(): number {
		return this.resolver.getWorkspaceCount();
	}

	/**
	 * Get workspace root path for a given file
	 *
	 * @param fileUri - URI of the file
	 * @returns Workspace root path
	 * @throws Error if file is not in any workspace
	 */
	private getWorkspaceRootForFile(fileUri: vscode.Uri): string {
		const folder = this.resolver.getWorkspaceFolderForFile(fileUri);
		if (!folder) {
			throw new Error("File is not in any workspace folder");
		}
		return folder.uri.fsPath;
	}

	/**
	 * Get recent files for the workspace containing the given file
	 *
	 * @param fileUri - URI of a file in the workspace
	 * @returns Array of recent file paths
	 */
	async getRecentFiles(fileUri: vscode.Uri): Promise<string[]> {
		const workspaceRoot = this.getWorkspaceRootForFile(fileUri);
		const key = `snapback.recentFiles.${workspaceRoot}`;
		return this.workspaceState.get<string[]>(key, []);
	}

	/**
	 * Add a file to recent files for its workspace
	 *
	 * @param fileUri - URI of the file to add
	 */
	async addRecentFile(fileUri: vscode.Uri): Promise<void> {
		const workspaceRoot = this.getWorkspaceRootForFile(fileUri);
		const key = `snapback.recentFiles.${workspaceRoot}`;
		const recent = await this.getRecentFiles(fileUri);
		const updated = [
			fileUri.fsPath,
			...recent.filter((f) => f !== fileUri.fsPath),
		].slice(0, 20);
		await this.workspaceState.update(key, updated);
	}

	/**
	 * Get recent branches for the workspace containing the given file
	 *
	 * @param fileUri - URI of a file in the workspace
	 * @returns Array of recent branch names
	 */
	async getRecentBranches(fileUri: vscode.Uri): Promise<string[]> {
		const workspaceRoot = this.getWorkspaceRootForFile(fileUri);
		const key = `snapback.recentBranches.${workspaceRoot}`;
		return this.workspaceState.get<string[]>(key, []);
	}

	/**
	 * Add a branch to recent branches for the workspace containing the given file
	 *
	 * @param fileUri - URI of a file in the workspace
	 * @param branch - Branch name to add
	 */
	async addRecentBranch(fileUri: vscode.Uri, branch: string): Promise<void> {
		const workspaceRoot = this.getWorkspaceRootForFile(fileUri);
		const key = `snapback.recentBranches.${workspaceRoot}`;
		const recent = await this.getRecentBranches(fileUri);
		const updated = [branch, ...recent.filter((b) => b !== branch)].slice(
			0,
			10,
		);
		await this.workspaceState.update(key, updated);
	}

	/**
	 * Get protection status for a file
	 *
	 * @param fileUri - URI of the file
	 * @returns Protection level ("watch" | "warn" | "block")
	 */
	async getProtectionStatus(
		fileUri: vscode.Uri,
	): Promise<"watch" | "warn" | "block"> {
		const workspaceRoot = this.getWorkspaceRootForFile(fileUri);
		const key = `snapback.protectionStatus.${workspaceRoot}.${fileUri.fsPath}`;
		return this.workspaceState.get<"watch" | "warn" | "block">(key, "watch");
	}

	/**
	 * Set protection status for a file
	 *
	 * @param fileUri - URI of the file
	 * @param level - Protection level to set
	 */
	async setProtectionStatus(
		fileUri: vscode.Uri,
		level: "watch" | "warn" | "block",
	): Promise<void> {
		const workspaceRoot = this.getWorkspaceRootForFile(fileUri);
		const key = `snapback.protectionStatus.${workspaceRoot}.${fileUri.fsPath}`;
		await this.workspaceState.update(key, level);
	}

	/**
	 * Dispose of the workspace manager
	 * Cleans up the workspace folder resolver
	 */
	dispose(): void {
		this.resolver.dispose();
	}
}
