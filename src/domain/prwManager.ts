/**
 * PRWManager - PRE/POST Checkpoint Coordinator
 *
 * Manages the PRE→POST checkpoint flow for burst-based AI editing detection.
 *
 * Responsibilities:
 * - Track active PRE state per file
 * - Coordinate with RateLimiter for budget checks
 * - Create PRE checkpoints on save (pointer-only, <15ms)
 * - Create POST checkpoints on burst end (with file content)
 * - Handle deduplication (one PRE per file per burst)
 *
 * Flow:
 * 1. SaveEvent → handleSave() → creates PRE if allowed
 * 2. BurstEnd (500ms inactivity) → onBurstEnd() → creates POST linked to PRE
 */

import * as vscode from "vscode";
import type { CreatePOSTOptions, CreatePREOptions } from "../storage/SnapshotStore";
import type { SnapshotManifestV2 } from "../storage/types";

/** State for an active PRE checkpoint */
export interface ActivePREState {
	/** Whether the PRE is still being created (reservation) */
	pending: boolean;
	/** The PRE checkpoint ID (null if pending) */
	preId: string | null;
	/** Sequence number from the PRE */
	preSeq: number | null;
	/** Timestamp when PRE was created */
	timestamp: number;
}

/** Minimal SnapshotStore interface needed by PRWManager */
export interface PRWSnapshotStore {
	createPRE(options: CreatePREOptions): Promise<SnapshotManifestV2>;
	createPOST(options: CreatePOSTOptions): Promise<SnapshotManifestV2>;
}

/** Minimal RateLimiter interface needed by PRWManager */
export interface PRWRateLimiter {
	canSnapshot(currentTime?: number): boolean;
	recordSnapshot(timestamp?: number): boolean;
}

/** Configuration for PRWManager */
export interface PRWManagerConfig {
	snapshotStore: PRWSnapshotStore;
	rateLimiter: PRWRateLimiter;
}

/**
 * PRWManager - Coordinates PRE/POST checkpoint lifecycle
 *
 * TODO(v2): Add stale activePRE cleanup mechanism. Currently, if VS Code crashes
 * between PRE creation and burst-end, the in-memory activePRE map is lost.
 * This is acceptable for v1/demo since VS Code crash is rare and extension
 * reload clears in-memory state anyway.
 */
export class PRWManager {
	private readonly snapshotStore: PRWSnapshotStore;
	private readonly rateLimiter: PRWRateLimiter;
	private readonly activePREs = new Map<string, ActivePREState>();

	constructor(config: PRWManagerConfig) {
		this.snapshotStore = config.snapshotStore;
		this.rateLimiter = config.rateLimiter;
	}

	/**
	 * Handle a save event for a file.
	 *
	 * Creates a PRE checkpoint if:
	 * - Rate limit allows (budget not exhausted)
	 * - No active PRE exists for this file (dedup)
	 *
	 * Uses synchronous reservation pattern to prevent race conditions:
	 * 1. Check rate limit
	 * 2. Check and set reservation synchronously (before any await)
	 * 3. Create PRE async
	 * 4. Update reservation with actual PRE ID
	 * 5. Rollback reservation on failure
	 *
	 * @param filePath - Absolute path to the saved file
	 * @param riskScore - Risk score from decision engine (0-1)
	 * @returns The created PRE checkpoint, or null if skipped
	 */
	async handleSave(filePath: string, riskScore: number): Promise<SnapshotManifestV2 | null> {
		// Check rate limit first (fast path)
		if (!this.rateLimiter.canSnapshot()) {
			return null;
		}

		// Check for existing active PRE (dedup)
		// This is the synchronous reservation check
		if (this.activePREs.has(filePath)) {
			return null;
		}

		// Reserve slot synchronously BEFORE any await
		// This prevents race conditions with concurrent saves
		const placeholder: ActivePREState = {
			pending: true,
			preId: null,
			preSeq: null,
			timestamp: Date.now(),
		};
		this.activePREs.set(filePath, placeholder);

		try {
			// Create PRE checkpoint (pointer-only, should be <15ms)
			const pre = await this.snapshotStore.createPRE({
				name: `PRE: ${this.getFileName(filePath)}`,
				anchorFile: filePath,
				parentSeq: null,
				parentId: null,
				type: "PRE",
				metadata: {
					riskScore,
				},
			});

			// Update reservation with actual PRE info
			this.activePREs.set(filePath, {
				pending: false,
				preId: pre.id,
				preSeq: pre.seq,
				timestamp: Date.now(),
			});

			return pre;
		} catch (error) {
			// Rollback reservation on failure
			this.activePREs.delete(filePath);
			throw error;
		}
	}

	/**
	 * Handle burst end for a file.
	 *
	 * Creates a POST checkpoint linked to the active PRE if one exists.
	 * Reads file content from disk (already saved by VS Code).
	 *
	 * @param filePath - Absolute path to the file
	 * @returns The created POST checkpoint, or null if no active PRE
	 */
	async onBurstEnd(filePath: string): Promise<SnapshotManifestV2 | null> {
		const activePRE = this.activePREs.get(filePath);

		// No active PRE or still pending
		if (!activePRE || activePRE.pending || !activePRE.preId) {
			return null;
		}

		try {
			// Read file content from disk
			const content = await this.readFileContent(filePath);

			// Create POST checkpoint with file content
			const files = new Map<string, string>();
			files.set(filePath, content);

			const post = await this.snapshotStore.createPOST({
				name: `POST: ${this.getFileName(filePath)}`,
				anchorFile: filePath,
				parentSeq: activePRE.preSeq,
				parentId: activePRE.preId,
				files,
			});

			// Clear active PRE state
			this.activePREs.delete(filePath);

			// Record snapshot for rate limiting (POST counts toward quota)
			this.rateLimiter.recordSnapshot();

			return post;
		} catch (error) {
			// Always clear activePRE on failure - no retry mechanism exists
			// Orphan PRE is better than stuck state blocking future snapshots
			this.activePREs.delete(filePath);

			// Check if file was deleted (ENOENT/FileNotFound)
			const isFileNotFound =
				error instanceof Error &&
				((error as Error & { code?: string }).code === "FileNotFound" || error.message.includes("ENOENT"));

			if (isFileNotFound) {
				console.debug("[PRWManager] File deleted before burst end, orphaning PRE", {
					filePath,
					preId: activePRE.preId,
				});
			} else {
				console.error("[PRWManager] POST creation failed, orphaning PRE", {
					filePath,
					preId: activePRE.preId,
					error,
				});
			}
			throw error;
		}
	}

	/**
	 * Check if an active PRE exists for a file
	 */
	hasActivePRE(filePath: string): boolean {
		return this.activePREs.has(filePath);
	}

	/**
	 * Get active PRE state for a file
	 */
	getActivePRE(filePath: string): ActivePREState | undefined {
		return this.activePREs.get(filePath);
	}

	/**
	 * Get count of active PREs
	 */
	getActiveCount(): number {
		return this.activePREs.size;
	}

	/**
	 * Dispose the manager.
	 *
	 * Logs warning if disposing with active PREs (they become orphans).
	 * Per spec: orphan PREs are detected at startup for visibility.
	 */
	dispose(): void {
		if (this.activePREs.size > 0) {
			const orphanFiles = Array.from(this.activePREs.keys());
			console.warn(`[PRWManager] Disposing with ${this.activePREs.size} orphan PRE(s)`, orphanFiles);
		}
		this.activePREs.clear();
	}

	/**
	 * Read file content from disk
	 */
	private async readFileContent(filePath: string): Promise<string> {
		const uri = vscode.Uri.file(filePath);
		const content = await vscode.workspace.fs.readFile(uri);
		return Buffer.from(content).toString("utf-8");
	}

	/**
	 * Extract file name from path
	 */
	private getFileName(filePath: string): string {
		const parts = filePath.split(/[/\\]/);
		return parts[parts.length - 1] || filePath;
	}
}

/**
 * Factory function to create a PRWManager
 */
export function createPRWManager(config: PRWManagerConfig): PRWManager {
	return new PRWManager(config);
}
