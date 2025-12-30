/**
 * SnapshotBridge - Unified read access to both storage sources
 *
 * Merges snapshots from:
 * - Extension storage (SQLite via StorageManager)
 * - MCP storage (JSON files via MCPStorageReader)
 *
 * This is a READ-ONLY bridge. It does NOT modify where either system writes.
 */

import type { MCPStorageReader } from "./MCPStorageReader";
import type { UnifiedSnapshot } from "./UnifiedSnapshot";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Adapter interface for extension storage.
 * Matches the subset of methods we need from StorageManager/OperationCoordinator.
 */
export interface ExtensionStorageAdapter {
	listSnapshots(): Promise<UnifiedSnapshot[]>;
}

/**
 * Counts by snapshot source
 */
export interface SourceCounts {
	extension: number;
	mcp: number;
	total: number;
}

// =============================================================================
// BRIDGE IMPLEMENTATION
// =============================================================================

/**
 * Bridge that provides unified read access to snapshots from both sources.
 *
 * Key behaviors:
 * - Merges snapshots from extension and MCP storage
 * - Deduplicates by ID (extension takes priority)
 * - Sorts by timestamp descending (newest first)
 * - Gracefully handles failures from either source
 *
 * Usage:
 * ```typescript
 * const bridge = new SnapshotBridge(extensionAdapter, mcpReader);
 * const allSnapshots = await bridge.listAll();
 * const todayCount = await bridge.getTodayCount();
 * ```
 */
export class SnapshotBridge {
	constructor(
		private readonly extensionStorage: ExtensionStorageAdapter,
		private readonly mcpReader: MCPStorageReader,
	) {}

	/**
	 * List all snapshots from both sources, merged and sorted.
	 */
	async listAll(): Promise<UnifiedSnapshot[]> {
		const [extensionSnapshots, mcpSnapshots] = await Promise.all([
			this.safeList(() => this.extensionStorage.listSnapshots()),
			this.safeList(() => this.mcpReader.list()),
		]);

		const merged = this.mergeAndDedupe(extensionSnapshots, mcpSnapshots);

		// Sort by timestamp descending (newest first)
		return merged.sort((a, b) => b.timestamp - a.timestamp);
	}

	/**
	 * Get a specific snapshot by ID.
	 */
	async getById(id: string): Promise<UnifiedSnapshot | null> {
		const all = await this.listAll();
		return all.find((s) => s.id === id) ?? null;
	}

	/**
	 * Get count of snapshots created today.
	 */
	async getTodayCount(): Promise<number> {
		const all = await this.listAll();
		const startOfToday = this.getStartOfToday();

		return all.filter((s) => s.timestamp >= startOfToday).length;
	}

	/**
	 * Get snapshots for a specific time range.
	 */
	async listByTimeRange(startMs: number, endMs: number): Promise<UnifiedSnapshot[]> {
		const all = await this.listAll();
		return all.filter((s) => s.timestamp >= startMs && s.timestamp <= endMs);
	}

	/**
	 * Get counts by source.
	 */
	async getSourceCounts(): Promise<SourceCounts> {
		const all = await this.listAll();

		const extension = all.filter((s) => s.source === "extension").length;
		const mcp = all.filter((s) => s.source === "mcp").length;

		return {
			extension,
			mcp,
			total: extension + mcp,
		};
	}

	/**
	 * Check if any snapshots exist from either source.
	 */
	async hasAnySnapshots(): Promise<boolean> {
		const all = await this.listAll();
		return all.length > 0;
	}

	/**
	 * Merge snapshots from both sources, deduping by ID.
	 * Extension source takes priority when IDs match.
	 */
	private mergeAndDedupe(extensionSnapshots: UnifiedSnapshot[], mcpSnapshots: UnifiedSnapshot[]): UnifiedSnapshot[] {
		const byId = new Map<string, UnifiedSnapshot>();

		// Add extension snapshots first (they take priority)
		for (const snapshot of extensionSnapshots) {
			byId.set(snapshot.id, snapshot);
		}

		// Add MCP snapshots only if ID doesn't exist
		for (const snapshot of mcpSnapshots) {
			if (!byId.has(snapshot.id)) {
				byId.set(snapshot.id, snapshot);
			}
		}

		return Array.from(byId.values());
	}

	/**
	 * Safely execute a list operation, returning empty array on error.
	 */
	private async safeList(fn: () => Promise<UnifiedSnapshot[]>): Promise<UnifiedSnapshot[]> {
		try {
			return await fn();
		} catch {
			// In production, we'd want to log this error
			return [];
		}
	}

	/**
	 * Get start of today in milliseconds.
	 */
	private getStartOfToday(): number {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	}
}
