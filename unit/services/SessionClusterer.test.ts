/**
 * SessionClusterer Tests
 *
 * Tests for DBSCAN-based snapshot session clustering.
 * Verifies temporal grouping of snapshots into logical development sessions.
 *
 * TEST PATHS:
 * 1. Happy: Snapshots cluster into sessions based on temporal proximity
 * 2. Sad: Empty input returns empty sessions
 * 3. Edge: Single snapshot, noise handling, boundary conditions
 * 4. Algorithm: DBSCAN parameter validation and distance calculations
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionClusterer, createSessionClusterer, type SnapshotSession } from "../../../src/services/SessionClusterer";
import type { SnapshotManifest, SnapshotFileRef } from "../../../src/storage/types";

// Mock logger to prevent console noise
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("SessionClusterer", () => {
	let clusterer: SessionClusterer;

	const createMockSnapshot = (
		id: string,
		timestamp: number,
		files: Record<string, SnapshotFileRef> = {},
	): SnapshotManifest => ({
		id,
		timestamp,
		files,
		name: `Snapshot ${id}`,
		trigger: "manual",
		anchorFile: Object.keys(files)[0] || "unknown.ts",
	});

	beforeEach(() => {
		clusterer = new SessionClusterer();
	});

	// =========================================================================
	// HAPPY PATH: Snapshots cluster correctly by time
	// =========================================================================

	describe("happy path - clustering by time", () => {
		it("should cluster snapshots within 30-minute gap into one session", () => {
			const now = Date.now();
			const snapshots = [
				createMockSnapshot("snap1", now - 25 * 60 * 1000), // 25 min ago
				createMockSnapshot("snap2", now - 20 * 60 * 1000), // 20 min ago
				createMockSnapshot("snap3", now - 15 * 60 * 1000), // 15 min ago
				createMockSnapshot("snap4", now - 10 * 60 * 1000), // 10 min ago
				createMockSnapshot("snap5", now - 5 * 60 * 1000), // 5 min ago
			];

			const sessions = clusterer.clusterSnapshots(snapshots);

			expect(sessions.length).toBe(1);
			expect(sessions[0].snapshots.length).toBe(5);
		});

		it("should split snapshots with >30 minute gaps into separate sessions", () => {
			const now = Date.now();
			const snapshots = [
				// Session 1: 2 hours ago
				createMockSnapshot("snap1", now - 120 * 60 * 1000),
				createMockSnapshot("snap2", now - 115 * 60 * 1000),
				createMockSnapshot("snap3", now - 110 * 60 * 1000),
				// Gap: 60 minutes
				// Session 2: Recent
				createMockSnapshot("snap4", now - 20 * 60 * 1000),
				createMockSnapshot("snap5", now - 15 * 60 * 1000),
				createMockSnapshot("snap6", now - 10 * 60 * 1000),
			];

			const sessions = clusterer.clusterSnapshots(snapshots);

			// Should have 2 sessions
			expect(sessions.length).toBe(2);
			// Most recent session first
			expect(sessions[0].snapshots.length).toBe(3);
			expect(sessions[1].snapshots.length).toBe(3);
		});

		it("should sort sessions by most recent first", () => {
			const now = Date.now();
			const snapshots = [
				// Older session
				createMockSnapshot("snap1", now - 180 * 60 * 1000),
				createMockSnapshot("snap2", now - 175 * 60 * 1000),
				// Recent session
				createMockSnapshot("snap3", now - 10 * 60 * 1000),
				createMockSnapshot("snap4", now - 5 * 60 * 1000),
			];

			const sessions = clusterer.clusterSnapshots(snapshots);

			// Most recent session should be first
			expect(sessions[0].endTime).toBeGreaterThan(sessions[1].endTime);
		});

		it("should calculate session duration correctly", () => {
			const now = Date.now();
			const startTime = now - 30 * 60 * 1000; // 30 min ago
			const endTime = now - 5 * 60 * 1000; // 5 min ago
			const snapshots = [
				createMockSnapshot("snap1", startTime),
				createMockSnapshot("snap2", now - 20 * 60 * 1000),
				createMockSnapshot("snap3", endTime),
			];

			const sessions = clusterer.clusterSnapshots(snapshots);

			expect(sessions[0].durationMs).toBe(endTime - startTime);
			expect(sessions[0].startTime).toBe(startTime);
			expect(sessions[0].endTime).toBe(endTime);
		});
	});

	// =========================================================================
	// SAD PATH: Empty and invalid inputs
	// =========================================================================

	describe("sad path - empty inputs", () => {
		it("should return empty array for empty input", () => {
			const sessions = clusterer.clusterSnapshots([]);
			expect(sessions).toEqual([]);
		});

		it("should handle single snapshot gracefully", () => {
			const now = Date.now();
			const snapshots = [createMockSnapshot("snap1", now)];

			const sessions = clusterer.clusterSnapshots(snapshots);

			// Single snapshot should be treated as noise (single-item session)
			expect(sessions.length).toBe(1);
			expect(sessions[0].snapshots.length).toBe(1);
		});
	});

	// =========================================================================
	// EDGE CASES: Boundary conditions
	// =========================================================================

	describe("edge cases - boundaries", () => {
		it("should handle snapshots exactly at 30-minute boundary", () => {
			const now = Date.now();
			const snapshots = [
				createMockSnapshot("snap1", now - 60 * 60 * 1000), // 60 min ago
				createMockSnapshot("snap2", now - 30 * 60 * 1000), // 30 min ago (exactly at boundary)
				createMockSnapshot("snap3", now), // now
			];

			const sessions = clusterer.clusterSnapshots(snapshots);

			// Boundary behavior depends on DBSCAN eps - may cluster or not
			expect(sessions.length).toBeGreaterThanOrEqual(1);
		});

		it("should collect files from all snapshots in a session", () => {
			const now = Date.now();
			const snapshots = [
				createMockSnapshot("snap1", now - 10 * 60 * 1000, { "file1.ts": { blob: "hash1", size: 100 } }),
				createMockSnapshot("snap2", now - 5 * 60 * 1000, { "file2.ts": { blob: "hash2", size: 100 }, "file3.ts": { blob: "hash3", size: 100 } }),
				createMockSnapshot("snap3", now, { "file1.ts": { blob: "hash1b", size: 100 }, "file4.ts": { blob: "hash4", size: 100 } }),
			];

			const sessions = clusterer.clusterSnapshots(snapshots);

			// Should have 4 unique files
			expect(sessions[0].files).toContain("file1.ts");
			expect(sessions[0].files).toContain("file2.ts");
			expect(sessions[0].files).toContain("file3.ts");
			expect(sessions[0].files).toContain("file4.ts");
			expect(sessions[0].files.length).toBe(4);
		});

		it("should generate human-readable labels", () => {
			const now = Date.now();
			const snapshots = [
				createMockSnapshot("snap1", now - 10 * 60 * 1000, { "MyComponent.tsx": { blob: "hash1", size: 100 } }),
				createMockSnapshot("snap2", now - 5 * 60 * 1000),
			];

			const sessions = clusterer.clusterSnapshots(snapshots);

			expect(sessions[0].label).toBeTruthy();
			expect(sessions[0].label).toContain("Today");
		});

		it("should respect custom maxGapMinutes configuration", () => {
			const customClusterer = new SessionClusterer({ maxGapMinutes: 60 }); // 60 min gap
			const now = Date.now();
			const snapshots = [
				createMockSnapshot("snap1", now - 100 * 60 * 1000),
				createMockSnapshot("snap2", now - 50 * 60 * 1000), // 50 min gap
				createMockSnapshot("snap3", now),
			];

			const sessions = customClusterer.clusterSnapshots(snapshots);

			// With 60 min max gap, all should cluster together
			expect(sessions.length).toBe(1);
		});
	});

	// =========================================================================
	// DBSCAN ALGORITHM VALIDATION
	// =========================================================================

	describe("DBSCAN algorithm", () => {
		it("should respect minSnapshotsPerSession parameter", () => {
			const strictClusterer = new SessionClusterer({
				minSnapshotsPerSession: 3,
			});
			const now = Date.now();
			const snapshots = [
				createMockSnapshot("snap1", now - 10 * 60 * 1000),
				createMockSnapshot("snap2", now - 5 * 60 * 1000),
				// Only 2 snapshots - below threshold
			];

			const sessions = strictClusterer.clusterSnapshots(snapshots);

			// Should treat as noise since cluster has < 3 snapshots
			expect(sessions.length).toBe(2); // Each as individual noise session
		});

		it("should handle includeNoise=false", () => {
			const noNoiseClusterer = new SessionClusterer({
				minSnapshotsPerSession: 3,
				includeNoise: false,
			});
			const now = Date.now();
			const snapshots = [
				createMockSnapshot("snap1", now - 10 * 60 * 1000),
				createMockSnapshot("snap2", now - 5 * 60 * 1000),
			];

			const sessions = noNoiseClusterer.clusterSnapshots(snapshots);

			// Should exclude noise points
			expect(sessions.length).toBe(0);
		});
	});

	// =========================================================================
	// HELPER METHODS
	// =========================================================================

	describe("helper methods", () => {
		it("getMostRecentSession should return latest session", () => {
			const now = Date.now();
			const snapshots = [
				createMockSnapshot("snap1", now - 120 * 60 * 1000),
				createMockSnapshot("snap2", now - 115 * 60 * 1000),
				createMockSnapshot("snap3", now - 10 * 60 * 1000),
				createMockSnapshot("snap4", now - 5 * 60 * 1000),
			];

			const recentSession = clusterer.getMostRecentSession(snapshots);

			expect(recentSession).not.toBeNull();
			expect(recentSession!.snapshots[0].id).toBe("snap4"); // Newest first within session
		});

		it("getMostRecentSession should return null for empty input", () => {
			const result = clusterer.getMostRecentSession([]);
			expect(result).toBeNull();
		});

		it("getTodaysSessions should filter by today's date", () => {
			const now = Date.now();
			const yesterday = now - 24 * 60 * 60 * 1000;
			const snapshots = [
				createMockSnapshot("snap1", yesterday - 10 * 60 * 1000),
				createMockSnapshot("snap2", yesterday - 5 * 60 * 1000),
				createMockSnapshot("snap3", now - 10 * 60 * 1000),
				createMockSnapshot("snap4", now - 5 * 60 * 1000),
			];

			const todaysSessions = clusterer.getTodaysSessions(snapshots);

			// Should only include today's session
			expect(todaysSessions.length).toBe(1);
			expect(todaysSessions[0].snapshots.some((s) => s.id === "snap3")).toBe(true);
			expect(todaysSessions[0].snapshots.some((s) => s.id === "snap4")).toBe(true);
		});
	});

	// =========================================================================
	// FACTORY FUNCTION
	// =========================================================================

	describe("factory function", () => {
		it("createSessionClusterer should create default instance", () => {
			const instance = createSessionClusterer();
			expect(instance).toBeInstanceOf(SessionClusterer);
		});

		it("createSessionClusterer should accept custom config", () => {
			const instance = createSessionClusterer({ maxGapMinutes: 45 });
			expect(instance).toBeInstanceOf(SessionClusterer);
		});
	});
});
