/**
 * WebviewActivityTab Tests
 *
 * Reference: Snapshot Display Specification
 * - Dashboard activity tab with session timeline
 * - AI detection summary card
 * - Snapshot counts by type
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
	ActivityTabMessages,
	createSnapshotSummary,
	createSessionTimelineData,
	createAIDetectionSummary,
	type SnapshotSummary,
	type SessionTimelineItem,
	type AIDetectionSummary,
} from "../../../../src/ui/snapshot-display/WebviewActivityTab";
import type { SnapshotManifestV2, OriginLabel, ReasonCode } from "../../../../src/storage/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockSnapshotV2(overrides: Partial<SnapshotManifestV2> = {}): SnapshotManifestV2 {
	return {
		schemaVersion: 2,
		id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		seq: 1,
		parentSeq: null,
		parentId: null,
		timestamp: Date.now(),
		name: "Test Snapshot",
		type: "POST",
		anchorFile: "/path/to/file.ts",
		files: {
			"/path/to/file.ts": { blobHash: "abc123", size: 1024 },
		},
		metadata: {
			origin: "INTERACTIVE" as OriginLabel,
			reasons: [] as ReasonCode[],
		},
		...overrides,
	};
}

// =============================================================================
// MESSAGE TYPES TESTS
// =============================================================================

describe("ActivityTabMessages", () => {
	describe("message type constants", () => {
		it("should have REFRESH message type", () => {
			expect(ActivityTabMessages.REFRESH).toBe("refresh");
		});

		it("should have SNAPSHOT_SELECTED message type", () => {
			expect(ActivityTabMessages.SNAPSHOT_SELECTED).toBe("snapshotSelected");
		});

		it("should have RESTORE_SNAPSHOT message type", () => {
			expect(ActivityTabMessages.RESTORE_SNAPSHOT).toBe("restoreSnapshot");
		});

		it("should have UPDATE_DATA message type", () => {
			expect(ActivityTabMessages.UPDATE_DATA).toBe("updateData");
		});
	});
});

// =============================================================================
// SNAPSHOT SUMMARY TESTS
// =============================================================================

describe("createSnapshotSummary", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-30T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should create summary from snapshot", () => {
		const snapshot = createMockSnapshotV2({
			id: "snap-123",
			anchorFile: "/path/to/api.ts",
			timestamp: Date.now() - 300000, // 5 minutes ago
			metadata: { origin: "INTERACTIVE", reasons: ["MANUAL_CHECKPOINT"] },
		});

		const summary = createSnapshotSummary(snapshot);

		expect(summary.id).toBe("snap-123");
		expect(summary.fileName).toBe("api.ts");
		expect(summary.icon).toBe("📸");
		expect(summary.relativeTime).toBe("5m ago");
		expect(summary.reason).toBe("Manual snapshot");
	});

	it("should show robot icon for AI snapshots", () => {
		const snapshot = createMockSnapshotV2({
			metadata: { origin: "AUTOMATED", reasons: ["AI_DETECTED"] },
		});

		const summary = createSnapshotSummary(snapshot);

		expect(summary.icon).toBe("🤖");
		expect(summary.reason).toBe("AI activity detected");
	});

	it("should show file count for multi-file snapshots", () => {
		const snapshot = createMockSnapshotV2({
			anchorFile: "/path/to/index.ts",
			files: {
				"/path/to/index.ts": { blobHash: "abc", size: 100 },
				"/path/to/api.ts": { blobHash: "def", size: 200 },
				"/path/to/types.ts": { blobHash: "ghi", size: 150 },
			},
		});

		const summary = createSnapshotSummary(snapshot);

		expect(summary.fileName).toBe("index.ts (+2)");
		expect(summary.fileCount).toBe(3);
	});
});

// =============================================================================
// SESSION TIMELINE TESTS
// =============================================================================

describe("createSessionTimelineData", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-30T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should create timeline from snapshots", () => {
		const snapshots = [
			createMockSnapshotV2({ id: "snap-1", timestamp: Date.now() - 60000 }),
			createMockSnapshotV2({ id: "snap-2", timestamp: Date.now() - 120000 }),
			createMockSnapshotV2({ id: "snap-3", timestamp: Date.now() - 180000 }),
		];

		const timeline = createSessionTimelineData(snapshots);

		expect(timeline).toHaveLength(3);
		expect(timeline[0].snapshotId).toBe("snap-1");
		expect(timeline[1].snapshotId).toBe("snap-2");
		expect(timeline[2].snapshotId).toBe("snap-3");
	});

	it("should include icon and time for each item", () => {
		const snapshots = [
			createMockSnapshotV2({
				id: "snap-1",
				timestamp: Date.now() - 300000,
				metadata: { origin: "AUTOMATED", reasons: ["AI_DETECTED"] },
			}),
		];

		const timeline = createSessionTimelineData(snapshots);

		expect(timeline[0].icon).toBe("🤖");
		expect(timeline[0].time).toBe("5m ago");
	});

	it("should return empty array for no snapshots", () => {
		const timeline = createSessionTimelineData([]);

		expect(timeline).toEqual([]);
	});
});

// =============================================================================
// AI DETECTION SUMMARY TESTS
// =============================================================================

describe("createAIDetectionSummary", () => {
	it("should count AI-detected snapshots", () => {
		const snapshots = [
			createMockSnapshotV2({ metadata: { origin: "AUTOMATED", reasons: ["AI_DETECTED"] } }),
			createMockSnapshotV2({ metadata: { origin: "AUTOMATED", reasons: ["AI_DETECTED"] } }),
			createMockSnapshotV2({ metadata: { origin: "INTERACTIVE", reasons: ["MANUAL_CHECKPOINT"] } }),
		];

		const summary = createAIDetectionSummary(snapshots);

		expect(summary.aiSnapshotCount).toBe(2);
		expect(summary.manualSnapshotCount).toBe(1);
		expect(summary.automatedSnapshotCount).toBe(0);
	});

	it("should count automated non-AI snapshots", () => {
		const snapshots = [
			createMockSnapshotV2({ metadata: { origin: "AUTOMATED", reasons: ["RISK_BURST_START"] } }),
			createMockSnapshotV2({ metadata: { origin: "AUTOMATED", reasons: ["CRITICAL_FILE"] } }),
		];

		const summary = createAIDetectionSummary(snapshots);

		expect(summary.aiSnapshotCount).toBe(0);
		expect(summary.automatedSnapshotCount).toBe(2);
	});

	it("should calculate percentages", () => {
		const snapshots = [
			createMockSnapshotV2({ metadata: { origin: "AUTOMATED", reasons: ["AI_DETECTED"] } }),
			createMockSnapshotV2({ metadata: { origin: "INTERACTIVE", reasons: ["MANUAL_CHECKPOINT"] } }),
		];

		const summary = createAIDetectionSummary(snapshots);

		expect(summary.aiPercentage).toBe(50);
		expect(summary.manualPercentage).toBe(50);
	});

	it("should handle zero snapshots", () => {
		const summary = createAIDetectionSummary([]);

		expect(summary.aiSnapshotCount).toBe(0);
		expect(summary.manualSnapshotCount).toBe(0);
		expect(summary.automatedSnapshotCount).toBe(0);
		expect(summary.totalCount).toBe(0);
	});

	it("should include total count", () => {
		const snapshots = Array.from({ length: 10 }, () => createMockSnapshotV2());

		const summary = createAIDetectionSummary(snapshots);

		expect(summary.totalCount).toBe(10);
	});
});
