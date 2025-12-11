import type { PioneerGatekeeper } from "../pioneer/PioneerGatekeeper";
import type { ProtectionLevelCanonical } from "../signage/types";
import type { ConfigStore } from "../storage/ConfigStore";
import type { StorageManager } from "../storage/StorageManager";
import type { GraphManager } from "./graph/GraphManager";

/**
 * ClusterManager - Orchestrates cluster-based protection and snapshots
 *
 * PURPOSE:
 * - Coordinate cluster detection via GraphManager
 * - Manage cluster-wide snapshot creation
 * - Enforce protection level inheritance (Anchor→WARN→WATCH)
 * - Gate cluster features behind Pioneer tier
 *
 * CLUSTER MODEL (from spec):
 * ```
 * Anchor (BLOCK, depth=0)
 *   ├─ Direct Import (WARN, depth=1)
 *   │   └─ Transitive Import (WATCH, depth=2)
 *   └─ Direct Import (WARN, depth=1)
 *       └─ Transitive Import (WATCH, depth=2)
 * ```
 *
 * PROTECTION INHERITANCE:
 * - User sets protection level ONLY on anchor files
 * - Depth 1 dependencies automatically inherit WARN
 * - Depth 2 dependencies automatically inherit WATCH
 * - Depth 3+ excluded (max depth enforcement)
 * - External deps (node_modules) always excluded
 *
 * TESTING SCENARIOS (Red Phase):
 *
 * 1. CLUSTER DETECTION
 *    - ✅ getCluster(anchorFile) returns all related files
 *    - ✅ Returns files grouped by depth (0, 1, 2)
 *    - ✅ Excludes depth 3+ files
 *    - ✅ Excludes external dependencies
 *    - ❌ Handles missing anchor file
 *    - ❌ Handles anchor with no dependencies
 *
 * 2. PROTECTION INHERITANCE
 *    - ✅ Anchor at BLOCK → depth1 gets WARN
 *    - ✅ Anchor at BLOCK → depth2 gets WATCH
 *    - ✅ getProtectionStatus(file) returns inherited level
 *    - ✅ Returns {level, isInherited, anchorFile}
 *    - ❌ Updates inheritance when anchor level changes
 *
 * 3. CLUSTER SNAPSHOTS (Pioneer-gated)
 *    - ✅ Non-Pioneer → creates single-file snapshot
 *    - ✅ Pioneer → creates cluster snapshot (all files)
 *    - ✅ Atomic snapshot (all files or none)
 *    - ✅ Snapshot manifest includes cluster metadata
 *    - ❌ Handles snapshot failure mid-cluster
 *    - ❌ Rolls back on error
 *
 * 4. TIER GATING
 *    - ✅ Non-Pioneer calling createClusterSnapshot → error
 *    - ✅ Error includes upsell message
 *    - ✅ Pioneer tier check via PioneerGatekeeper
 *    - ❌ Degrades gracefully to single-file for free tier
 *
 * 5. CLUSTER QUERIES
 *    - ✅ getClusterFiles(anchor) returns all file paths
 *    - ✅ getClusterSize(anchor) returns file count
 *    - ✅ isInCluster(file, anchor) checks membership
 *    - ❌ Handles large clusters (>50 files)
 *
 * 6. EDGE CASES
 *    - ❌ Handles circular dependencies in cluster
 *    - ❌ Handles file deletion during snapshot
 *    - ❌ Handles permission errors on cluster files
 *    - ❌ Handles very large clusters (>100 files)
 *
 * TDD WORKFLOW:
 * 1. Write failing test for scenario
 * 2. Implement minimal code to pass
 * 3. Refactor with confidence
 * 4. Run gate: ./ai_dev_utils/scripts/tdd-gate.sh green
 */

export interface ClusterInfo {
	anchorFile: string;
	anchorLevel: ProtectionLevelCanonical;
	files: Map<
		string,
		{
			depth: 0 | 1 | 2;
			inheritedLevel: ProtectionLevelCanonical;
		}
	>;
	totalSize: number;
}

export interface ProtectionStatus {
	level: ProtectionLevelCanonical;
	isInherited: boolean;
	anchorFile?: string;
	depth?: 0 | 1 | 2;
}

export class ClusterManager {
	constructor(
		private readonly graphManager: GraphManager,
		private readonly configStore: ConfigStore,
		private readonly storageManager: StorageManager,
		private readonly gatekeeper: PioneerGatekeeper,
	) {}

	/**
	 * Get cluster information for an anchor file
	 *
	 * TEST: Anchor with deps → returns all files with depths
	 * TEST: Anchor with no deps → returns only anchor
	 * TEST: Non-existent anchor → throws error
	 * TEST: Depth 3+ files excluded
	 */
	async getCluster(anchorFile: string): Promise<ClusterInfo> {
		// Get anchor's protection level from ConfigStore
		const anchorProtection = await this.configStore.getProtection(anchorFile);
		if (!anchorProtection) {
			throw new Error(`File is not a cluster anchor: ${anchorFile}`);
		}

		// Get dependency tree from GraphManager
		const clusterTree = await this.graphManager.getCluster(anchorFile);

		// Build cluster info with inheritance
		const files = new Map<
			string,
			{
				depth: 0 | 1 | 2;
				inheritedLevel: ProtectionLevelCanonical;
			}
		>();

		// Depth 0: Anchor file (explicit protection)
		files.set(anchorFile, {
			depth: 0,
			inheritedLevel: anchorProtection.level,
		});

		// Depth 1: Direct imports (inherit WARN)
		for (const filePath of clusterTree.depth1) {
			files.set(filePath, {
				depth: 1,
				inheritedLevel: "warn",
			});
		}

		// Depth 2: Transitive imports (inherit WATCH)
		for (const filePath of clusterTree.depth2) {
			files.set(filePath, {
				depth: 2,
				inheritedLevel: "watch",
			});
		}

		return {
			anchorFile,
			anchorLevel: anchorProtection.level,
			files,
			totalSize: files.size,
		};
	}

	/**
	 * Get protection status for a file (including inherited)
	 *
	 * TEST: Anchor file → returns explicit level
	 * TEST: Depth 1 file → returns WARN + anchor info
	 * TEST: Depth 2 file → returns WATCH + anchor info
	 * TEST: Unprotected file → returns null
	 */
	async getProtectionStatus(filePath: string): Promise<ProtectionStatus | null> {
		// Check if file is explicitly protected (anchor)
		const explicitProtection = await this.configStore.getProtection(filePath);
		if (explicitProtection?.isAnchor) {
			return {
				level: explicitProtection.level,
				isInherited: false,
			};
		}

		// Check if file is part of any cluster (inherited protection)
		const anchors = await this.configStore.getAnchors();
		for (const anchorFile of anchors) {
			const cluster = await this.getCluster(anchorFile);
			const fileInfo = cluster.files.get(filePath);
			if (fileInfo) {
				return {
					level: fileInfo.inheritedLevel,
					isInherited: true,
					anchorFile,
					depth: fileInfo.depth,
				};
			}
		}

		return null;
	}

	/**
	 * Create cluster-wide snapshot (Pioneer-gated)
	 *
	 * TEST: Pioneer user → creates snapshot for all cluster files
	 * TEST: Non-Pioneer → throws with upsell message
	 * TEST: Snapshot includes cluster metadata
	 * TEST: Atomic operation (all files or none)
	 */
	async createClusterSnapshot(
		anchorFile: string,
		trigger: "auto" | "manual" | "ai-detected" | "pre-save",
	): Promise<string | null> {
		// Gate cluster snapshots to Pioneers
		if (!this.gatekeeper.canUseFeature("clusters")) {
			const upsellMessage = this.gatekeeper.getUpsellMessage("clusters");
			throw new Error(`Cluster snapshots require Pioneer tier. ${upsellMessage}`);
		}

		// Get cluster files
		const cluster = await this.getCluster(anchorFile);

		// Read all file contents
		const fileContents = new Map<string, string>();
		for (const filePath of cluster.files.keys()) {
			// TODO: Read file content from disk
			// For now, stub with empty content
			fileContents.set(filePath, "");
		}

		// Create cluster snapshot via StorageManager
		const snapshot = await this.storageManager.createSnapshot(fileContents, {
			name: `Cluster snapshot: ${anchorFile}`,
			trigger,
			anchorFile,
		});

		return snapshot?.id || null;
	}

	/**
	 * Create single-file snapshot (fallback for non-Pioneers)
	 *
	 * TEST: Creates snapshot for one file only
	 * TEST: Does not require Pioneer tier
	 * TEST: Snapshot metadata indicates single-file
	 */
	async createSingleFileSnapshot(
		filePath: string,
		content: string,
		trigger: "auto" | "manual" | "ai-detected" | "pre-save",
	): Promise<string | null> {
		const fileContents = new Map<string, string>();
		fileContents.set(filePath, content);

		const snapshot = await this.storageManager.createSnapshot(fileContents, {
			name: `Single file snapshot: ${filePath}`,
			trigger,
			anchorFile: filePath,
		});

		return snapshot?.id || null;
	}

	/**
	 * Get all files in a cluster (flat list)
	 *
	 * TEST: Returns all file paths in cluster
	 * TEST: Order: anchor first, then depth1, then depth2
	 * TEST: No duplicates
	 */
	async getClusterFiles(anchorFile: string): Promise<string[]> {
		const cluster = await this.getCluster(anchorFile);
		return Array.from(cluster.files.keys());
	}

	/**
	 * Get cluster size (file count)
	 *
	 * TEST: Returns correct count
	 * TEST: Includes anchor in count
	 */
	async getClusterSize(anchorFile: string): Promise<number> {
		const cluster = await this.getCluster(anchorFile);
		return cluster.totalSize;
	}

	/**
	 * Check if a file is part of a specific cluster
	 *
	 * TEST: File in cluster → returns true
	 * TEST: File not in cluster → returns false
	 * TEST: Anchor file → returns true
	 */
	async isInCluster(filePath: string, anchorFile: string): Promise<boolean> {
		const cluster = await this.getCluster(anchorFile);
		return cluster.files.has(filePath);
	}

	/**
	 * Find which cluster(s) a file belongs to
	 *
	 * TEST: File in one cluster → returns [anchor]
	 * TEST: File in multiple clusters → returns all anchors
	 * TEST: File in no clusters → returns []
	 */
	async findClustersForFile(filePath: string): Promise<string[]> {
		const anchors = await this.configStore.getAnchors();
		const result: string[] = [];

		for (const anchorFile of anchors) {
			if (await this.isInCluster(filePath, anchorFile)) {
				result.push(anchorFile);
			}
		}

		return result;
	}

	/**
	 * Update cluster when anchor protection level changes
	 *
	 * TEST: Anchor level change → recalculates inheritance
	 * TEST: Emits cluster update event
	 * TEST: Cached cluster info invalidated
	 */
	async updateClusterProtection(anchorFile: string, newLevel: ProtectionLevelCanonical): Promise<void> {
		// Update anchor in ConfigStore
		await this.configStore.setProtection(anchorFile, newLevel, true);

		// Invalidate graph cache for anchor
		this.graphManager.invalidate(anchorFile);

		// TODO: Emit cluster update event for UI refresh
	}
}
