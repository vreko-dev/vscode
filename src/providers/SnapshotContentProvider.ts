import * as path from "node:path";
import * as vscode from "vscode";
import type { IStorageManager } from "../storage/types";
import { logger } from "../utils/logger";

/**
 * Cache entry for snapshot content
 */
interface CacheEntry {
	content: string;
	timestamp: number;
}

/**
 * SnapshotContentProvider - TextDocumentContentProvider for snapback:// URIs
 *
 * Provides snapshot content to VSCode's diff engine via custom URI scheme.
 * Implements LRU caching with TTL for performance optimization.
 *
 * Architecture:
 * - URI scheme: snapback://<snapshotId>/<encodedFilePath>
 * - LRU cache: 100 entries maximum
 * - TTL: 5 minutes (300,000ms)
 * - Performance: <10ms cached retrieval, <50ms uncached
 *
 * @example
 * ```typescript
 * const provider = new SnapshotContentProvider(storageManager);
 * context.subscriptions.push(
 *   vscode.workspace.registerTextDocumentContentProvider('snapback', provider)
 * );
 *
 * // VSCode will call provider.provideTextDocumentContent() when:
 * // - User views diff with snapback:// URI
 * // - QuickDiff gutter requests original resource
 * const uri = vscode.Uri.parse('snapback://snap-123/src%2Fauth.ts');
 * const content = await provider.provideTextDocumentContent(uri);
 * ```
 *
 * @see {@link https://code.visualstudio.com/api/extension-guides/virtual-documents}
 */
export class SnapshotContentProvider implements vscode.TextDocumentContentProvider {
	private contentCache: Map<string, CacheEntry> = new Map();
	private readonly CACHE_MAX_SIZE = 100;
	private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChange.event;

	constructor(private storageManager: IStorageManager) {}

	/**
	 * Provide text document content for a snapback:// URI
	 *
	 * Called by VSCode when displaying snapshot content in diff views.
	 * Implements caching for performance and graceful error handling.
	 *
	 * @param uri - snapback://<snapshotId>/<encodedFilePath>
	 * @returns File content from snapshot or empty string on error
	 */
	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		try {
			// Parse URI to extract snapshot ID and file path
			const { snapshotId, filePath } = this.parseSnapshotUri(uri);

			// Create cache key
			const cacheKey = `${snapshotId}:${filePath}`;

			// Check cache (with TTL validation)
			const cached = this.getCachedContent(cacheKey);
			if (cached !== null) {
				return cached;
			}

			// Cache miss - read from StorageManager
			const snapshot = await this.storageManager.getSnapshot(snapshotId);

			if (!snapshot) {
				logger.warn("Snapshot not found for content provider", {
					snapshotId,
					filePath,
				});
				return "";
			}

			// Find file content in snapshot with smart path matching
			// Handles relative vs absolute path mismatches
			let content = snapshot.contents?.[filePath];

			if (content === undefined) {
				// Try to find by matching key (handles relative/absolute path differences)
				const matchingKey = Object.keys(snapshot.contents || {}).find(
					(key) =>
						key === filePath ||
						path.basename(key) === path.basename(filePath) ||
						key.endsWith(filePath) ||
						filePath.endsWith(key),
				);

				if (matchingKey) {
					content = snapshot.contents[matchingKey];
					logger.debug("Found content via path matching", {
						requestedPath: filePath,
						matchedKey: matchingKey,
					});
				}
			}

			if (content === undefined) {
				logger.warn("File not found in snapshot", {
					snapshotId,
					filePath,
					availableKeys: Object.keys(snapshot.contents || {}).slice(0, 5),
				});
				return "";
			}

			// Update cache
			this.updateCache(cacheKey, content);

			return content;
		} catch (error) {
			logger.error("Failed to provide snapshot content", error instanceof Error ? error : undefined, {
				uri: uri ? uri.toString() : "unknown",
			});
			return ""; // Graceful degradation - never throw
		}
	}

	/**
	 * Parse snapback:// URI into snapshot ID and file path
	 *
	 * URI format: snapback://<snapshotId>/<encodedFilePath>
	 * Example: snapback://snap-123/src%2Fauth.ts
	 *
	 * @param uri - URI to parse
	 * @returns Parsed snapshot ID and decoded file path
	 * @throws Error if URI is malformed
	 */
	private parseSnapshotUri(uri: vscode.Uri): {
		snapshotId: string;
		filePath: string;
	} {
		// authority contains snapshot ID
		const snapshotId = uri.authority;
		if (!snapshotId) {
			throw new Error("Malformed snapback URI: missing snapshot ID");
		}

		// path contains encoded file path (with leading /)
		const encodedPath = uri.path;
		if (!encodedPath || encodedPath === "/") {
			throw new Error("Malformed snapback URI: missing file path");
		}

		// Remove leading slash and decode
		const filePath = decodeURIComponent(encodedPath.substring(1));

		return { snapshotId, filePath };
	}

	/**
	 * Get content from cache if valid (not expired)
	 *
	 * @param key - Cache key
	 * @returns Cached content or null if miss/expired
	 */
	private getCachedContent(key: string): string | null {
		const entry = this.contentCache.get(key);
		if (!entry) {
			return null;
		}

		// Check TTL
		const age = Date.now() - entry.timestamp;
		if (age > this.CACHE_TTL_MS) {
			// Expired - remove and return null
			this.contentCache.delete(key);
			return null;
		}

		return entry.content;
	}

	/**
	 * Update cache with LRU eviction
	 *
	 * When cache is full, evicts the oldest entry (by timestamp).
	 * Uses timestamp-based LRU approximation for O(n) eviction.
	 *
	 * @param key - Cache key
	 * @param content - Content to cache
	 */
	private updateCache(key: string, content: string): void {
		// LRU eviction if cache is full
		if (this.contentCache.size >= this.CACHE_MAX_SIZE) {
			// Find oldest entry (simple LRU approximation)
			let oldestKey: string | null = null;
			let oldestTimestamp = Number.POSITIVE_INFINITY;

			for (const [k, entry] of this.contentCache.entries()) {
				if (entry.timestamp < oldestTimestamp) {
					oldestTimestamp = entry.timestamp;
					oldestKey = k;
				}
			}

			if (oldestKey) {
				this.contentCache.delete(oldestKey);
			}
		}

		// Add new entry
		this.contentCache.set(key, {
			content,
			timestamp: Date.now(),
		});
	}

	/**
	 * Invalidate all cached content for a specific snapshot
	 *
	 * Called when snapshot is updated/deleted to ensure stale content
	 * is not served.
	 *
	 * @param snapshotId - Snapshot ID to invalidate
	 */
	public invalidateSnapshot(snapshotId: string): void {
		// Remove all cache entries for this snapshot
		const prefix = `${snapshotId}:`;
		for (const key of this.contentCache.keys()) {
			if (key.startsWith(prefix)) {
				this.contentCache.delete(key);
			}
		}

		logger.debug("Invalidated snapshot cache", { snapshotId });
	}

	/**
	 * Dispose provider and clean up resources
	 */
	dispose(): void {
		this._onDidChange.dispose();
		this.contentCache.clear();
	}
}
