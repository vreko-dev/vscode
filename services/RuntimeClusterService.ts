/**
 * RuntimeClusterService - Cluster detection via @vreko/core
 *
 * Provides session-level cluster detection using the Vreko core runtime.
 * Groups snapshots into logical development sessions based on temporal proximity.
 *
 * This replaces the disabled file-level ImportAnalyzer with session-level
 * clustering that better reflects user workflow patterns.
 *
 * @module services/RuntimeClusterService
 */

import type { SnapshotManifest } from "../storage/types";
import { logger } from "../utils/logger";
import { SessionClusterer, type SnapshotSession } from "./SessionClusterer";

/**
 * Cluster detection result
 */
export interface ClusterDetectionResult {
	/** Whether the file is part of an active session cluster */
	isInCluster: boolean;
	/** The anchor file of the cluster (most frequently modified) */
	anchorFile?: string;
	/** Session ID for the cluster */
	sessionId?: string;
	/** Number of snapshots in the session */
	snapshotCount?: number;
	/** Files involved in the session */
	relatedFiles?: string[];
}

/**
 * Service for detecting session clusters using @vreko/core algorithms
 *
 * Uses temporal clustering (DBSCAN) to group snapshots into logical
 * development sessions. This provides better UX than static import analysis
 * because it reflects actual user workflow patterns.
 */
export class RuntimeClusterService {
	private sessionClusterer: SessionClusterer;
	private cachedSessions: SnapshotSession[] | null = null;
	private cacheTimestamp = 0;
	private readonly CACHE_TTL_MS = 60000; // 1 minute TTL

	constructor() {
		// Use 30-minute gap for session boundaries (standard practice)
		this.sessionClusterer = new SessionClusterer({
			maxGapMinutes: 30,
			minSnapshotsPerSession: 2,
			includeNoise: false,
		});
	}

	/**
	 * Detect if a file is part of an active development session cluster
	 *
	 * @param filePath - Path to check
	 * @param recentSnapshots - Recent snapshots to analyze
	 * @returns Cluster detection result
	 */
	async detectFileInSessionCluster(
		filePath: string,
		recentSnapshots: SnapshotManifest[],
	): Promise<ClusterDetectionResult> {
		// Need at least 2 snapshots to form a cluster
		if (recentSnapshots.length < 2) {
			return { isInCluster: false };
		}

		try {
			// Get or compute session clusters
			const sessions = this.getCachedSessions(recentSnapshots);

			// Find which session contains this file
			for (const session of sessions) {
				const fileInSession = session.snapshots.some(
					(snap) => snap.anchorFile === filePath || filePath in (snap.files || {}),
				);

				if (fileInSession) {
					// Find anchor file (most frequently modified in session)
					const anchorFile = this.determineSessionAnchor(session);
					const relatedFiles = this.extractRelatedFiles(session);

					return {
						isInCluster: true,
						anchorFile,
						sessionId: session.id,
						snapshotCount: session.snapshots.length,
						relatedFiles,
					};
				}
			}

			return { isInCluster: false };
		} catch (error) {
			logger.error("Runtime cluster detection failed", error as Error, { filePath });
			return { isInCluster: false };
		}
	}

	/**
	 * Get the most recent active session
	 *
	 * @param recentSnapshots - Recent snapshots to analyze
	 * @returns Most recent session or null
	 */
	async getMostRecentSession(recentSnapshots: SnapshotManifest[]): Promise<SnapshotSession | null> {
		if (recentSnapshots.length < 1) {
			return null;
		}

		try {
			const sessions = this.getCachedSessions(recentSnapshots);
			return sessions.length > 0 ? sessions[0] : null;
		} catch (error) {
			logger.error("Failed to get recent session", error as Error);
			return null;
		}
	}

	/**
	 * Get all active sessions from recent snapshots
	 *
	 * @param recentSnapshots - Recent snapshots to analyze
	 * @returns Array of sessions (most recent first)
	 */
	async getActiveSessions(recentSnapshots: SnapshotManifest[]): Promise<SnapshotSession[]> {
		if (recentSnapshots.length < 1) {
			return [];
		}

		try {
			return this.getCachedSessions(recentSnapshots);
		} catch (error) {
			logger.error("Failed to get active sessions", error as Error);
			return [];
		}
	}

	/**
	 * Invalidate the session cache
	 * Call this when new snapshots are created
	 */
	invalidateCache(): void {
		this.cachedSessions = null;
		this.cacheTimestamp = 0;
		logger.debug("Runtime cluster cache invalidated");
	}

	/**
	 * Get cached sessions or compute new ones
	 */
	private getCachedSessions(snapshots: SnapshotManifest[]): SnapshotSession[] {
		const now = Date.now();

		// Return cached if valid
		if (this.cachedSessions && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
			return this.cachedSessions;
		}

		// Compute new sessions
		const sessions = this.sessionClusterer.clusterSnapshots(snapshots);
		this.cachedSessions = sessions;
		this.cacheTimestamp = now;

		logger.debug("Session clusters computed", {
			sessionCount: sessions.length,
			snapshotCount: snapshots.length,
		});

		return sessions;
	}

	/**
	 * Determine the anchor file for a session
	 * (the file with most snapshots in the session)
	 */
	private determineSessionAnchor(session: SnapshotSession): string {
		const fileCounts = new Map<string, number>();

		for (const snapshot of session.snapshots) {
			// Count anchor file
			const anchorCount = fileCounts.get(snapshot.anchorFile) || 0;
			fileCounts.set(snapshot.anchorFile, anchorCount + 1);

			// Count all files in snapshot
			for (const filePath of Object.keys(snapshot.files || {})) {
				const count = fileCounts.get(filePath) || 0;
				fileCounts.set(filePath, count + 1);
			}
		}

		// Find file with highest count
		let anchorFile = session.snapshots[0]?.anchorFile || "";
		let maxCount = 0;

		for (const [filePath, count] of fileCounts.entries()) {
			if (count > maxCount) {
				maxCount = count;
				anchorFile = filePath;
			}
		}

		return anchorFile;
	}

	/**
	 * Extract all related files from a session
	 */
	private extractRelatedFiles(session: SnapshotSession): string[] {
		const files = new Set<string>();

		for (const snapshot of session.snapshots) {
			files.add(snapshot.anchorFile);
			for (const filePath of Object.keys(snapshot.files || {})) {
				files.add(filePath);
			}
		}

		return Array.from(files);
	}
}

/**
 * Create a RuntimeClusterService instance
 */
export function createRuntimeClusterService(): RuntimeClusterService {
	return new RuntimeClusterService();
}
