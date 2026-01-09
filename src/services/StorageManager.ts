import * as vscode from "vscode";
import type { SessionManifest } from "../snapshot/sessionTypes";
import { logger } from "../utils/logger";

/**
 * SessionManifestStore - Workspace-scoped session manifest storage.
 *
 * NOTE: This is DISTINCT from storage/StorageManager.ts which:
 * - Implements IStorageManager (full snapshot/session storage)
 * - Uses VS Code's global storage (persistent across workspaces)
 * - Handles blobs, cooldowns, audit logs, etc.
 *
 * THIS class:
 * - Only handles session manifests in workspace's .snapback/sessions.json
 * - Workspace-scoped (each workspace has its own sessions.json)
 * - Used by SessionsTreeProvider for the Sessions view
 *
 * CONSOLIDATION NOTE (2026-01-08):
 * Consider merging this into storage/StorageManager.ts in future refactor.
 * The naming collision (both called StorageManager) causes confusion.
 * For now, phase4-providers.ts imports this as ServiceStorageManager.
 *
 * @see storage/StorageManager.ts - Full storage orchestrator
 */
export class StorageManager {
	private sessionsFile: vscode.Uri;

	constructor(workspaceRoot: string) {
		this.sessionsFile = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), ".snapback", "sessions.json");
	}

	async listSessionManifests(): Promise<SessionManifest[]> {
		try {
			const content = await vscode.workspace.fs.readFile(this.sessionsFile);
			const json = JSON.parse(content.toString());
			return Array.isArray(json) ? json : [];
		} catch (error) {
			// If file doesn't exist or is invalid, return empty array
			if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
				return [];
			}
			logger.error("Failed to load sessions list:", error as Error);
			return [];
		}
	}

	async storeSessionManifest(session: SessionManifest): Promise<void> {
		try {
			const sessions = await this.listSessionManifests();
			sessions.push(session);

			// Keep only last 50 sessions to avoid infinite growth
			const trimmedSessions = sessions.sort((a, b) => b.startedAt - a.startedAt).slice(0, 50);

			await vscode.workspace.fs.writeFile(
				this.sessionsFile,
				Buffer.from(JSON.stringify(trimmedSessions, null, 2), "utf-8"),
			);
		} catch (error) {
			logger.error("Failed to store session manifest:", error as Error);
		}
	}
}
