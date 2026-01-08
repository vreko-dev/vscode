/**
 * GitBranchWatcher - Monitors git branch changes for PhaseDetector integration
 *
 * Detects branch switches and notifies the vitals system to update phase-aware
 * thresholds. This enables dynamic snapshot intervals based on development phase.
 *
 * 2026 Best Practice: Real-time context awareness for developer workflows
 *
 * @packageDocumentation
 */

import type * as vscode from "vscode";
import { getGit, isGitAvailable } from "../utils/git-lazy";
import { logger } from "../utils/logger";

/**
 * Branch change event
 */
export interface BranchChangeEvent {
	/** Previous branch name */
	previousBranch: string;
	/** New branch name */
	currentBranch: string;
	/** Timestamp of the change */
	timestamp: number;
}

/**
 * Listener for branch changes
 */
export type BranchChangeListener = (event: BranchChangeEvent) => void;

/**
 * GitBranchWatcher - Polls for branch changes and notifies listeners
 *
 * Uses a polling strategy since VS Code's git extension doesn't expose
 * reliable branch change events. Polling interval is configurable.
 *
 * @example
 * ```typescript
 * const watcher = new GitBranchWatcher(workspaceRoot);
 * watcher.onBranchChange((event) => {
 *   vitals.setCurrentBranch(event.currentBranch);
 * });
 * await watcher.start();
 * ```
 */
export class GitBranchWatcher implements vscode.Disposable {
	private currentBranch: string | null = null;
	private pollInterval: NodeJS.Timeout | null = null;
	private listeners: BranchChangeListener[] = [];
	private isRunning = false;
	private readonly pollIntervalMs: number;
	private readonly workspaceRoot: string;

	/**
	 * Create a new GitBranchWatcher
	 * @param workspaceRoot - Root directory of the workspace
	 * @param pollIntervalMs - Polling interval in milliseconds (default: 5000)
	 */
	constructor(workspaceRoot: string, pollIntervalMs = 5000) {
		this.workspaceRoot = workspaceRoot;
		this.pollIntervalMs = pollIntervalMs;
	}

	/**
	 * Register a listener for branch changes
	 * @param listener - Callback function for branch changes
	 * @returns Disposable to unregister the listener
	 */
	onBranchChange(listener: BranchChangeListener): vscode.Disposable {
		this.listeners.push(listener);
		return {
			dispose: () => {
				const index = this.listeners.indexOf(listener);
				if (index >= 0) {
					this.listeners.splice(index, 1);
				}
			},
		};
	}

	/**
	 * Start watching for branch changes
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			logger.warn("GitBranchWatcher already running");
			return;
		}

		// Check if git is available
		const gitAvailable = await isGitAvailable();
		if (!gitAvailable) {
			logger.warn("Git not available, GitBranchWatcher disabled");
			return;
		}

		// Get initial branch
		try {
			this.currentBranch = await this.getCurrentBranch();
			logger.info("GitBranchWatcher started", {
				currentBranch: this.currentBranch,
				pollIntervalMs: this.pollIntervalMs,
			});
		} catch (error) {
			logger.warn("Failed to get initial branch", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		this.isRunning = true;

		// Start polling
		this.pollInterval = setInterval(() => {
			void this.checkForBranchChange();
		}, this.pollIntervalMs);
	}

	/**
	 * Stop watching for branch changes
	 */
	stop(): void {
		if (!this.isRunning) {
			return;
		}

		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}

		this.isRunning = false;
		logger.info("GitBranchWatcher stopped");
	}

	/**
	 * Get the current branch name
	 */
	async getCurrentBranch(): Promise<string> {
		try {
			const git = await getGit();
			const status = await git.cwd(this.workspaceRoot).status();
			return status.current || "main";
		} catch (error) {
			logger.warn("Failed to get current branch", {
				error: error instanceof Error ? error.message : String(error),
			});
			return "main";
		}
	}

	/**
	 * Get the cached current branch (synchronous)
	 */
	getCachedBranch(): string {
		return this.currentBranch || "main";
	}

	/**
	 * Check for branch changes and notify listeners
	 */
	private async checkForBranchChange(): Promise<void> {
		try {
			const newBranch = await this.getCurrentBranch();

			if (this.currentBranch && newBranch !== this.currentBranch) {
				const event: BranchChangeEvent = {
					previousBranch: this.currentBranch,
					currentBranch: newBranch,
					timestamp: Date.now(),
				};

				logger.info("Branch change detected", {
					from: this.currentBranch,
					to: newBranch,
				});

				// Notify all listeners
				for (const listener of this.listeners) {
					try {
						listener(event);
					} catch (error) {
						logger.warn("Branch change listener error", {
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}
			}

			this.currentBranch = newBranch;
		} catch (error) {
			// Silently ignore polling errors to avoid log spam
		}
	}

	/**
	 * Dispose the watcher
	 */
	dispose(): void {
		this.stop();
		this.listeners = [];
	}
}

/**
 * Factory function to create and start a GitBranchWatcher
 * @param workspaceRoot - Root directory of the workspace
 * @returns Started GitBranchWatcher instance
 */
export async function createGitBranchWatcher(workspaceRoot: string): Promise<GitBranchWatcher> {
	const watcher = new GitBranchWatcher(workspaceRoot);
	await watcher.start();
	return watcher;
}
