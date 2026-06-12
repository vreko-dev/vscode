/**
 * SessionClusterer - Groups snapshots into logical sessions using DBSCAN
 *
 * Converts snapshots into temporal points and clusters them to identify
 * logical development sessions. Used by SnapshotQuickPick for "Restore last session".
 *
 * @packageDocumentation
 */

import type { SnapshotManifest } from "../storage/types";
import { logger } from "../utils/logger";

// ============================================================================
// DBSCAN Implementation (inlined from @vreko/core/clustering)
// ============================================================================

/**
 * Represents a point in n-dimensional space for clustering
 */
interface Point {
	/** Unique identifier for the point */
	id: string;
	/** Coordinates in n-dimensional space */
	coordinates: number[];
}

/**
 * Result of the DBSCAN clustering algorithm
 */
interface ClusterResult {
	/** Array of clusters, each cluster is an array of points */
	clusters: Point[][];
	/** Points classified as noise (not belonging to any cluster) */
	noise: Point[];
	/** Map of point ID to cluster label (-1 for noise) */
	labels: Record<string, number>;
}

/** Marker for unvisited points */
const UNVISITED = -2;
/** Marker for noise points */
const NOISE = -1;

/**
 * DBSCAN - Density-Based Spatial Clustering of Applications with Noise
 *
 * Groups points by density, identifying clusters and noise.
 * Used for temporal clustering of snapshots into development sessions.
 */
class DBSCAN {
	private readonly eps: number;
	private readonly minPts: number;

	constructor(config: { eps?: number; minPts?: number } = {}) {
		this.eps = config.eps ?? 0.5;
		this.minPts = config.minPts ?? 5;

		if (this.eps <= 0) {
			throw new Error("eps must be positive");
		}
		if (this.minPts < 1) {
			throw new Error("minPts must be at least 1");
		}
	}

	cluster(points: Point[]): ClusterResult {
		if (points.length === 0) {
			return { clusters: [], noise: [], labels: {} };
		}

		const labels: Record<string, number> = {};
		for (const point of points) {
			labels[point.id] = UNVISITED;
		}

		const clusters: Point[][] = [];
		let clusterIndex = 0;

		for (const point of points) {
			if (labels[point.id] !== UNVISITED) {
				continue;
			}

			const neighbors = this.regionQuery(points, point);

			if (neighbors.length < this.minPts) {
				labels[point.id] = NOISE;
			} else {
				const cluster = this.expandCluster(points, point, neighbors, labels, clusterIndex);
				clusters.push(cluster);
				clusterIndex++;
			}
		}

		const noise: Point[] = points.filter((p) => labels[p.id] === NOISE);

		return { clusters, noise, labels };
	}

	private expandCluster(
		points: Point[],
		corePoint: Point,
		neighbors: Point[],
		labels: Record<string, number>,
		clusterIndex: number,
	): Point[] {
		const cluster: Point[] = [corePoint];
		labels[corePoint.id] = clusterIndex;

		const queue = [...neighbors];
		const processed = new Set<string>([corePoint.id]);

		while (queue.length > 0) {
			const currentPoint = queue.shift();
			if (!currentPoint || processed.has(currentPoint.id)) {
				continue;
			}
			processed.add(currentPoint.id);

			const previousLabel = labels[currentPoint.id];

			if (previousLabel === NOISE) {
				labels[currentPoint.id] = clusterIndex;
				cluster.push(currentPoint);
				continue;
			}

			if (previousLabel === UNVISITED) {
				labels[currentPoint.id] = clusterIndex;
				cluster.push(currentPoint);

				const currentNeighbors = this.regionQuery(points, currentPoint);
				if (currentNeighbors.length >= this.minPts) {
					for (const neighbor of currentNeighbors) {
						if (!processed.has(neighbor.id)) {
							queue.push(neighbor);
						}
					}
				}
			}
		}

		return cluster;
	}

	private regionQuery(points: Point[], centerPoint: Point): Point[] {
		return points.filter((point) => this.euclideanDistance(centerPoint, point) <= this.eps);
	}

	private euclideanDistance(a: Point, b: Point): number {
		let sum = 0;
		for (let i = 0; i < a.coordinates.length; i++) {
			const diff = a.coordinates[i] - b.coordinates[i];
			sum += diff * diff;
		}
		return Math.sqrt(sum);
	}
}

// ============================================================================
// SessionClusterer Implementation
// ============================================================================

/**
 * A clustered session containing related snapshots
 */
export interface SnapshotSession {
	/** Session identifier (cluster index or "session-{timestamp}") */
	id: string;
	/** Snapshots in this session, sorted by timestamp (newest first) */
	snapshots: SnapshotManifest[];
	/** Session start time (earliest snapshot) */
	startTime: number;
	/** Session end time (latest snapshot) */
	endTime: number;
	/** Duration in milliseconds */
	durationMs: number;
	/** Human-readable session label */
	label: string;
	/** Files modified in this session */
	files: string[];
}

/**
 * Configuration for session clustering
 */
export interface SessionClustererConfig {
	/**
	 * Maximum time gap (in minutes) between snapshots in the same session.
	 * Default: 30 minutes
	 */
	maxGapMinutes: number;

	/**
	 * Minimum snapshots required to form a session.
	 * Default: 2
	 */
	minSnapshotsPerSession: number;

	/**
	 * Whether to include noise (unclustered snapshots) as individual sessions.
	 * Default: true
	 */
	includeNoise: boolean;
}

const DEFAULT_CONFIG: SessionClustererConfig = {
	maxGapMinutes: 30,
	minSnapshotsPerSession: 2,
	includeNoise: true,
};

/**
 * SessionClusterer - Clusters snapshots into logical development sessions
 *
 * Uses DBSCAN algorithm with time-based distance to identify session boundaries.
 * Sessions are groups of snapshots taken within close temporal proximity.
 *
 * @example
 * ```typescript
 * const clusterer = new SessionClusterer();
 * const sessions = clusterer.clusterSnapshots(snapshots);
 *
 * // Get the most recent session
 * const latestSession = sessions[0];
 * // output:(`Latest session: ${latestSession.label}`);
 * // output:(`Contains ${latestSession.snapshots.length} snapshots`);
 * ```
 */
export class SessionClusterer {
	private readonly config: SessionClustererConfig;
	private readonly dbscan: DBSCAN;

	constructor(config: Partial<SessionClustererConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Configure DBSCAN with time-based eps (converted to normalized units)
		// eps is the max gap in minutes, normalized to 0-1 scale for a day
		const epsMinutes = this.config.maxGapMinutes;
		const epsNormalized = epsMinutes / (24 * 60); // Normalize to day scale

		this.dbscan = new DBSCAN({
			eps: epsNormalized,
			minPts: this.config.minSnapshotsPerSession,
		});

		logger.debug("SessionClusterer initialized", {
			maxGapMinutes: this.config.maxGapMinutes,
			minSnapshots: this.config.minSnapshotsPerSession,
			epsNormalized,
		});
	}

	/**
	 * Cluster snapshots into logical sessions
	 *
	 * @param snapshots - Array of snapshot manifests to cluster
	 * @returns Array of sessions, sorted by most recent first
	 */
	clusterSnapshots(snapshots: SnapshotManifest[]): SnapshotSession[] {
		if (snapshots.length === 0) {
			return [];
		}

		// Sort snapshots by timestamp (oldest first for clustering)
		const sortedSnapshots = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);

		// Convert snapshots to points for DBSCAN
		const points = this.snapshotsToPoints(sortedSnapshots);

		// Run DBSCAN clustering
		const clusterResult = this.dbscan.cluster(points);

		// Convert clusters back to sessions
		const sessions = this.clustersToSessions(clusterResult, sortedSnapshots);

		// Sort sessions by most recent first
		sessions.sort((a, b) => b.endTime - a.endTime);

		logger.debug("Session clustering complete", {
			inputSnapshots: snapshots.length,
			sessions: sessions.length,
			clusteredSnapshots: sessions.reduce((sum, s) => sum + s.snapshots.length, 0),
		});

		return sessions;
	}

	/**
	 * Get the most recent session
	 */
	getMostRecentSession(snapshots: SnapshotManifest[]): SnapshotSession | null {
		const sessions = this.clusterSnapshots(snapshots);
		return sessions.length > 0 ? sessions[0] : null;
	}

	/**
	 * Get sessions that occurred today
	 */
	getTodaysSessions(snapshots: SnapshotManifest[]): SnapshotSession[] {
		const sessions = this.clusterSnapshots(snapshots);
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const todayStartMs = todayStart.getTime();

		return sessions.filter((session) => session.endTime >= todayStartMs);
	}

	/**
	 * Convert snapshots to DBSCAN points
	 * Uses normalized timestamp as the only coordinate for 1D clustering
	 */
	private snapshotsToPoints(snapshots: SnapshotManifest[]): Point[] {
		if (snapshots.length === 0) {
			return [];
		}

		// Get time range for normalization
		const minTime = snapshots[0].timestamp;
		const maxTime = snapshots[snapshots.length - 1].timestamp;
		const timeRange = maxTime - minTime || 1; // Avoid division by zero

		return snapshots.map((snapshot) => ({
			id: snapshot.id,
			// Normalize timestamp to 0-1 range based on time span
			coordinates: [(snapshot.timestamp - minTime) / timeRange],
		}));
	}

	/**
	 * Convert DBSCAN clusters back to snapshot sessions
	 */
	private clustersToSessions(result: ClusterResult, snapshots: SnapshotManifest[]): SnapshotSession[] {
		const sessions: SnapshotSession[] = [];
		const snapshotMap = new Map(snapshots.map((s) => [s.id, s]));

		// Process each cluster
		for (let i = 0; i < result.clusters.length; i++) {
			const cluster = result.clusters[i];
			const clusterSnapshots = cluster
				.map((point: Point) => snapshotMap.get(point.id))
				.filter((s: SnapshotManifest | undefined): s is SnapshotManifest => s !== undefined)
				.sort((a: SnapshotManifest, b: SnapshotManifest) => b.timestamp - a.timestamp); // Newest first

			if (clusterSnapshots.length > 0) {
				sessions.push(this.createSession(clusterSnapshots, i));
			}
		}

		// Handle noise points (unclustered snapshots)
		if (this.config.includeNoise && result.noise.length > 0) {
			for (const point of result.noise) {
				const snapshot = snapshotMap.get(point.id);
				if (snapshot) {
					// Create a single-snapshot session for noise
					sessions.push(this.createSession([snapshot], -1, true));
				}
			}
		}

		return sessions;
	}

	/**
	 * Create a session object from a group of snapshots
	 */
	private createSession(snapshots: SnapshotManifest[], clusterIndex: number, isNoise = false): SnapshotSession {
		const startTime = Math.min(...snapshots.map((s) => s.timestamp));
		const endTime = Math.max(...snapshots.map((s) => s.timestamp));
		const durationMs = endTime - startTime;

		// Collect all unique files from the session
		const files = new Set<string>();
		for (const snapshot of snapshots) {
			if (snapshot.files) {
				for (const file of Object.keys(snapshot.files)) {
					files.add(file);
				}
			}
		}

		// Generate human-readable label
		const label = this.generateSessionLabel(snapshots, startTime, isNoise);

		return {
			id: isNoise ? `snapshot-${snapshots[0].id}` : `session-${clusterIndex}-${startTime}`,
			snapshots,
			startTime,
			endTime,
			durationMs,
			label,
			files: Array.from(files),
		};
	}

	/**
	 * Generate a human-readable session label
	 */
	private generateSessionLabel(snapshots: SnapshotManifest[], startTime: number, isNoise: boolean): string {
		const date = new Date(startTime);
		const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
		const dateStr = this.formatRelativeDate(date);

		if (isNoise) {
			// Single snapshot
			const primaryFile = this.getPrimaryFile(snapshots[0]);
			return `${primaryFile} • ${dateStr} ${timeStr}`;
		}

		// Multi-snapshot session
		const snapshotCount = snapshots.length;
		const primaryFile = this.getPrimaryFile(snapshots[0]);

		if (snapshotCount === 1) {
			return `${primaryFile} • ${dateStr} ${timeStr}`;
		}

		return `${snapshotCount} snapshots • ${primaryFile} • ${dateStr} ${timeStr}`;
	}

	/**
	 * Format date relative to today
	 */
	private formatRelativeDate(date: Date): string {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
		const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

		if (dateOnly.getTime() === today.getTime()) {
			return "Today";
		}
		if (dateOnly.getTime() === yesterday.getTime()) {
			return "Yesterday";
		}

		return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	}

	/**
	 * Get the primary (anchor) file from a snapshot
	 */
	private getPrimaryFile(snapshot: SnapshotManifest): string {
		// Check for anchor file in metadata
		const snapshotWithAnchor = snapshot as SnapshotManifest & { anchorFile?: string };
		if (snapshotWithAnchor.anchorFile) {
			return this.formatFileName(snapshotWithAnchor.anchorFile);
		}

		// Fall back to first file in snapshot
		const files = Object.keys(snapshot.files || {});
		if (files.length > 0) {
			return this.formatFileName(files[0]);
		}

		return "Unknown";
	}

	/**
	 * Format file path to just the filename
	 */
	private formatFileName(filePath: string): string {
		const parts = filePath.split(/[\\/]/);
		return parts[parts.length - 1] || filePath;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<SessionClustererConfig>): void {
		Object.assign(this.config, config);
	}
}

/**
 * Create a default SessionClusterer instance
 */
export function createSessionClusterer(config?: Partial<SessionClustererConfig>): SessionClusterer {
	return new SessionClusterer(config);
}
