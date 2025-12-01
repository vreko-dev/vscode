import type { FileSystemStorage } from "./storage/types";
import { logger } from "./utils/logger.js";

export interface WorkspaceContext {
	lastActiveFile: string | null;
	recentFiles: string[];
	activeBranch: string | null;
	lastSnapshot: string | null;
	protectionStatus: "protected" | "atRisk" | "unprotected" | "analyzing";
	recentActions: { action: string; timestamp: number }[];
}

export class WorkspaceMemoryManager {
	private context: WorkspaceContext;

	constructor(_storage: FileSystemStorage) {
		this.context = {
			lastActiveFile: null,
			recentFiles: [],
			activeBranch: null,
			lastSnapshot: null,
			protectionStatus: "unprotected",
			recentActions: [],
		};

		// Initialize with some default values
		this.initialize();
	}

	/**
	 * Initialize workspace memory with default values
	 */
	private async initialize(): Promise<void> {
		// In a real implementation, we would load this from storage
		this.context.protectionStatus = "protected";
		this.context.recentActions = [];
	}

	/**
	 * Update the last active file
	 */
	updateLastActiveFile(filePath: string): void {
		this.context.lastActiveFile = filePath;

		// Add to recent files, keeping only the last 10
		this.context.recentFiles = [
			filePath,
			...this.context.recentFiles.filter((f) => f !== filePath),
		].slice(0, 10);

		this.addAction("file_opened");
	}

	/**
	 * Update the active branch
	 */
	updateActiveBranch(branch: string): void {
		this.context.activeBranch = branch;
		this.addAction("branch_changed");
	}

	/**
	 * Update the last snapshot
	 */
	updateLastSnapshot(snapshotId: string): void {
		this.context.lastSnapshot = snapshotId;
		this.addAction("snapshot_created");
	}

	/**
	 * Update protection status
	 */
	updateProtectionStatus(
		status: "protected" | "atRisk" | "unprotected" | "analyzing",
	): void {
		this.context.protectionStatus = status;
		this.addAction("status_changed");
	}

	/**
	 * Add an action to the recent actions list
	 */
	private addAction(action: string): void {
		this.context.recentActions.unshift({
			action,
			timestamp: Date.now(),
		});

		// Keep only the last 50 actions
		if (this.context.recentActions.length > 50) {
			this.context.recentActions = this.context.recentActions.slice(0, 50);
		}
	}

	/**
	 * Get the current workspace context
	 */
	getContext(): WorkspaceContext {
		return { ...this.context };
	}

	/**
	 * Get the last snapshot ID
	 */
	getLastSnapshotId(): string | null {
		return this.context.lastSnapshot;
	}

	/**
	 * Save the current context to storage
	 */
	async saveContext(): Promise<void> {
		// In a real implementation, we would save this to persistent storage
		logger.info("Saving workspace context:", this.context);
	}

	/**
	 * Load context from storage
	 */
	async loadContext(): Promise<void> {
		// In a real implementation, we would load this from persistent storage
		logger.info("Loading workspace context");
	}
}
