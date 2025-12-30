/**
 * Storage Bridge Module
 *
 * Provides unified read access to snapshots from both storage systems:
 * - Extension storage (SQLite with V2 manifests)
 * - MCP storage (JSON files in .snapback/)
 *
 * This is a READ-ONLY bridge. It does NOT modify where either system writes.
 */

export { type MCPSnapshotManifest, MCPStorageReader } from "./MCPStorageReader";
export { type ExtensionStorageAdapter, SnapshotBridge, type SourceCounts } from "./SnapshotBridge";
export {
	fromExtensionManifest,
	fromMCPManifest,
	type UnifiedSnapshot,
	type UnifiedSnapshotFile,
} from "./UnifiedSnapshot";
