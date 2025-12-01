import * as vscode from "vscode";
import { logger } from "../utils/logger.js";
import { DECORATION_CONFIG } from "./constants.js";
import type { FileHealthLevel, FileHealthStatus } from "./types.js";

/**
 * Main provider class implementing vscode.FileDecorationProvider
 * Provides visual indicators for file protection and risk status.
 */
export class FileHealthDecorationProvider
	implements vscode.FileDecorationProvider
{
	// Event emitter for VS Code to listen to decoration changes
	private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<
		vscode.Uri | vscode.Uri[] | undefined
	>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

	// In-memory cache: Map<fsPath, FileHealthStatus> - Using Map for true LRU behavior
	private healthCache = new Map<string, FileHealthStatus>();

	// Maximum cache size to prevent unbounded growth
	private readonly MAX_CACHE_SIZE = 5000;

	// For event batching to prevent UI freezes during bulk operations
	private pendingUpdates = new Set<string>();
	private debounceTimer: NodeJS.Timeout | null = null;
	private readonly DEBOUNCE_DELAY = 50; // 50ms debounce

	/**
	 * Provide decoration to VS Code when it needs to render a file
	 */
	provideFileDecoration(
		uri: vscode.Uri,
		_token: vscode.CancellationToken,
	): vscode.FileDecoration | undefined {
		// 1. Get status from cache (access updates LRU order)
		const healthStatus = this.healthCache.get(uri.fsPath);

		// Move accessed item to the end (most recently used)
		if (healthStatus) {
			this.healthCache.delete(uri.fsPath);
			this.healthCache.set(uri.fsPath, healthStatus);
		}

		// 2. If no status, return undefined (no decoration)
		if (!healthStatus) {
			return undefined;
		}

		// 3. Get badge/color/tooltip from DECORATION_CONFIG
		const config = DECORATION_CONFIG[healthStatus.level];

		// 4. Build tooltip with protection level
		const tooltip = healthStatus.protectionLevel
			? `${config.tooltip} (${healthStatus.protectionLevel})`
			: config.tooltip;

		// 5. Return FileDecoration with propagate: false
		const decoration = new vscode.FileDecoration(
			config.badge,
			tooltip,
			config.color,
		);
		decoration.propagate = false;
		return decoration;
	}

	/**
	 * Called by SaveHandler after risk analysis
	 */
	updateFileHealth(
		uri: vscode.Uri,
		level: FileHealthLevel,
		protectionLevel?: "watch" | "warn" | "block",
	): void {
		// 1. Create FileHealthStatus object with current timestamp
		const healthStatus: FileHealthStatus = {
			uri: uri.fsPath, // Use fsPath for consistency with cache key
			level,
			protectionLevel,
			lastUpdated: new Date(),
		};

		// 2. Store in healthCache (Map.set) - this automatically places it at the end (most recently used)
		this.healthCache.set(uri.fsPath, healthStatus);

		// 3. Add to pending updates for batching
		this.pendingUpdates.add(uri.fsPath);

		// 4. Implement cache eviction policy (true LRU)
		if (this.healthCache.size > this.MAX_CACHE_SIZE) {
			// Remove least recently used entries (approximately 10% of cache size)
			const entriesToDelete = Math.floor(this.MAX_CACHE_SIZE * 0.1);
			let deletedCount = 0;

			// Iterate through the map and delete the first N entries (least recently used)
			// Since Map maintains insertion order, and we move accessed items to the end,
			// the first entries are the least recently used
			for (const key of this.healthCache.keys()) {
				if (deletedCount >= entriesToDelete) {
					break;
				}
				this.healthCache.delete(key);
				deletedCount++;
			}
		}

		// 5. Debounce event firing
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.fireBatchedEvents();
		}, this.DEBOUNCE_DELAY);

		logger.debug("File health updated", {
			filePath: uri.fsPath,
			level,
			protectionLevel,
		});
	}

	/**
	 * Fire batched events for all pending updates
	 */
	private fireBatchedEvents(): void {
		if (this.pendingUpdates.size === 0) {
			return;
		}

		// Convert pending updates to URIs
		const uris = Array.from(this.pendingUpdates).map((fsPath) =>
			vscode.Uri.file(fsPath),
		);

		// Fire single event with all URIs
		if (uris.length === 1) {
			this._onDidChangeFileDecorations.fire(uris[0]);
		} else {
			this._onDidChangeFileDecorations.fire(uris);
		}

		// Clear pending updates
		this.pendingUpdates.clear();
	}

	/**
	 * Clear decoration for one file
	 */
	clearFileHealth(uri: vscode.Uri): void {
		// 1. healthCache.delete(uri.fsPath)
		this.healthCache.delete(uri.fsPath);

		// 2. Add to pending updates for batching instead of firing immediately
		this.pendingUpdates.add(uri.fsPath);

		// 3. Debounce event firing
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.fireBatchedEvents();
		}, this.DEBOUNCE_DELAY);

		logger.debug("File health cleared", { filePath: uri.fsPath });
	}

	/**
	 * Clear all decorations (demo reset)
	 */
	clearAll(): void {
		// 1. healthCache.clear()
		this.healthCache.clear();

		// 2. Clear pending updates
		this.pendingUpdates.clear();

		// 3. Clear debounce timer if active
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		// 4. Fire event with undefined (tells VS Code to refresh all)
		this._onDidChangeFileDecorations.fire(undefined);

		logger.debug("All file health decorations cleared");
	}

	/**
	 * Get current status (used by commands)
	 */
	getFileHealth(uri: vscode.Uri): FileHealthStatus | undefined {
		// Accessing item updates LRU order
		const healthStatus = this.healthCache.get(uri.fsPath);

		// Move accessed item to the end (most recently used)
		if (healthStatus) {
			this.healthCache.delete(uri.fsPath);
			this.healthCache.set(uri.fsPath, healthStatus);
		}

		return healthStatus;
	}

	/**
	 * Cleanup
	 */
	dispose(): void {
		this._onDidChangeFileDecorations.dispose();
		this.healthCache.clear();

		// Clear pending updates and timer
		this.pendingUpdates.clear();
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		logger.debug("FileHealthDecorationProvider disposed");
	}
}
