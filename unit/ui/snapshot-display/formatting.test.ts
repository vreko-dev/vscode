/**
 * Snapshot Display Formatting Utilities Tests
 *
 * TDD: RED phase - Writing tests first
 *
 * Reference: Snapshot Display Specification
 * - Origin icons: 🤖 AI, ⚡ Auto, 📸 Manual, ⏪ Pre-restore
 * - Human-readable reason labels
 * - Relative time formatting
 * - Anchor file display with count
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	getOriginIcon,
	formatReason,
	formatRelativeTime,
	formatAbsoluteTime,
	formatAnchorFile,
	formatBytes,
	ORIGIN_ICONS,
	REASON_LABELS,
} from "../../../../src/ui/snapshot-display/formatting";
import type { SnapshotManifestV2, ReasonCode, OriginLabel } from "../../../../src/storage/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockSnapshot(overrides: Partial<SnapshotManifestV2> = {}): SnapshotManifestV2 {
	return {
		schemaVersion: 2,
		id: "snap-123",
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
			reasons: [],
		},
		...overrides,
	};
}

// =============================================================================
// ORIGIN ICON TESTS
// =============================================================================

describe("getOriginIcon", () => {
	describe("PRE_ROLLBACK type detection", () => {
		it("should return ⏪ for PRE_ROLLBACK type", () => {
			const snapshot = createMockSnapshot({ type: "PRE_ROLLBACK" });
			expect(getOriginIcon(snapshot)).toBe("⏪");
		});

		it("should prioritize type over metadata for PRE_ROLLBACK", () => {
			const snapshot = createMockSnapshot({
				type: "PRE_ROLLBACK",
				metadata: {
					origin: "AUTOMATED",
					reasons: ["AI_DETECTED"],
				},
			});
			// PRE_ROLLBACK type should always show ⏪ regardless of metadata
			expect(getOriginIcon(snapshot)).toBe("⏪");
		});
	});

	describe("AI_DETECTED reason detection", () => {
		it("should return 🤖 when reasons include AI_DETECTED", () => {
			const snapshot = createMockSnapshot({
				metadata: {
					origin: "AUTOMATED",
					reasons: ["AI_DETECTED"],
				},
			});
			expect(getOriginIcon(snapshot)).toBe("🤖");
		});

		it("should return 🤖 when AI_DETECTED is among multiple reasons", () => {
			const snapshot = createMockSnapshot({
				metadata: {
					origin: "AUTOMATED",
					reasons: ["RISK_BURST_START", "AI_DETECTED", "RISK_MULTI_FILE"],
				},
			});
			expect(getOriginIcon(snapshot)).toBe("🤖");
		});
	});

	describe("AUTOMATED origin detection", () => {
		it("should return ⚡ for AUTOMATED origin without AI", () => {
			const snapshot = createMockSnapshot({
				metadata: {
					origin: "AUTOMATED",
					reasons: ["RISK_BURST_START"],
				},
			});
			expect(getOriginIcon(snapshot)).toBe("⚡");
		});

		it("should return ⚡ for burst activity snapshots", () => {
			const snapshot = createMockSnapshot({
				metadata: {
					origin: "AUTOMATED",
					reasons: ["RISK_BURST_START", "RISK_MULTI_FILE"],
				},
			});
			expect(getOriginIcon(snapshot)).toBe("⚡");
		});

		it("should return ⚡ for session-end snapshots", () => {
			const snapshot = createMockSnapshot({
				metadata: {
					origin: "AUTOMATED",
					reasons: [],
				},
			});
			expect(getOriginIcon(snapshot)).toBe("⚡");
		});
	});

	describe("INTERACTIVE origin detection", () => {
		it("should return 📸 for INTERACTIVE origin", () => {
			const snapshot = createMockSnapshot({
				metadata: {
					origin: "INTERACTIVE",
					reasons: ["MANUAL_CHECKPOINT"],
				},
			});
			expect(getOriginIcon(snapshot)).toBe("📸");
		});

		it("should return 📸 for manual saves", () => {
			const snapshot = createMockSnapshot({
				metadata: {
					origin: "INTERACTIVE",
					reasons: ["MANUAL_SAVE"],
				},
			});
			expect(getOriginIcon(snapshot)).toBe("📸");
		});
	});

	describe("fallback behavior", () => {
		it("should return 📸 when metadata is undefined", () => {
			const snapshot = createMockSnapshot({ metadata: undefined });
			expect(getOriginIcon(snapshot)).toBe("📸");
		});

		it("should return 📸 when origin is undefined", () => {
			const snapshot = createMockSnapshot({
				metadata: {
					reasons: [],
				} as any,
			});
			expect(getOriginIcon(snapshot)).toBe("📸");
		});

		it("should return 📸 for unknown origin values", () => {
			const snapshot = createMockSnapshot({
				metadata: {
					origin: "UNKNOWN" as any,
					reasons: [],
				},
			});
			expect(getOriginIcon(snapshot)).toBe("📸");
		});
	});
});

// =============================================================================
// REASON LABEL TESTS
// =============================================================================

describe("formatReason", () => {
	it("should return 'Manual checkpoint' for MANUAL_CHECKPOINT", () => {
		expect(formatReason(["MANUAL_CHECKPOINT"])).toBe("Manual checkpoint");
	});

	it("should return 'AI activity detected' for AI_DETECTED", () => {
		expect(formatReason(["AI_DETECTED"])).toBe("AI activity detected");
	});

	it("should return 'Rapid changes detected' for RISK_BURST_START", () => {
		expect(formatReason(["RISK_BURST_START"])).toBe("Rapid changes detected");
	});

	it("should return 'Critical file changed' for CRITICAL_FILE", () => {
		expect(formatReason(["CRITICAL_FILE"])).toBe("Critical file changed");
	});

	it("should return 'Before restore' for PRE_ROLLBACK", () => {
		expect(formatReason(["PRE_ROLLBACK"])).toBe("Before restore");
	});

	it("should return 'Large deletion detected' for RISK_LARGE_DELETE", () => {
		expect(formatReason(["RISK_LARGE_DELETE"])).toBe("Large deletion detected");
	});

	it("should return 'Multiple files changed' for RISK_MULTI_FILE", () => {
		expect(formatReason(["RISK_MULTI_FILE"])).toBe("Multiple files changed");
	});

	it("should use first reason when multiple are provided", () => {
		expect(formatReason(["AI_DETECTED", "RISK_BURST_START", "RISK_MULTI_FILE"])).toBe("AI activity detected");
	});

	it("should return 'Snapshot' for empty reasons array", () => {
		expect(formatReason([])).toBe("Snapshot");
	});

	it("should return 'Snapshot' for undefined reasons", () => {
		expect(formatReason(undefined)).toBe("Snapshot");
	});

	it("should return 'Snapshot' for unknown reason codes", () => {
		expect(formatReason(["UNKNOWN_REASON" as ReasonCode])).toBe("Snapshot");
	});
});

// =============================================================================
// TIME FORMATTING TESTS
// =============================================================================

describe("formatRelativeTime", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-30T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should return 'Just now' for timestamps less than 1 minute ago", () => {
		const now = Date.now();
		expect(formatRelativeTime(now)).toBe("Just now");
		expect(formatRelativeTime(now - 30000)).toBe("Just now"); // 30 seconds
		expect(formatRelativeTime(now - 59999)).toBe("Just now"); // Just under 1 minute
	});

	it("should return 'Xm ago' for timestamps less than 1 hour ago", () => {
		const now = Date.now();
		expect(formatRelativeTime(now - 60000)).toBe("1m ago"); // 1 minute
		expect(formatRelativeTime(now - 300000)).toBe("5m ago"); // 5 minutes
		expect(formatRelativeTime(now - 1800000)).toBe("30m ago"); // 30 minutes
		expect(formatRelativeTime(now - 3540000)).toBe("59m ago"); // 59 minutes
	});

	it("should return 'Xh ago' for timestamps less than 24 hours ago", () => {
		const now = Date.now();
		expect(formatRelativeTime(now - 3600000)).toBe("1h ago"); // 1 hour
		expect(formatRelativeTime(now - 7200000)).toBe("2h ago"); // 2 hours
		expect(formatRelativeTime(now - 43200000)).toBe("12h ago"); // 12 hours
		expect(formatRelativeTime(now - 82800000)).toBe("23h ago"); // 23 hours
	});

	it("should return 'Yesterday' for timestamps 1 day ago", () => {
		const now = Date.now();
		expect(formatRelativeTime(now - 86400000)).toBe("Yesterday"); // 24 hours
		expect(formatRelativeTime(now - 100000000)).toBe("Yesterday"); // ~27 hours
	});

	it("should return 'Xd ago' for timestamps less than 7 days ago", () => {
		const now = Date.now();
		expect(formatRelativeTime(now - 172800000)).toBe("2d ago"); // 2 days
		expect(formatRelativeTime(now - 432000000)).toBe("5d ago"); // 5 days
		expect(formatRelativeTime(now - 518400000)).toBe("6d ago"); // 6 days
	});

	it("should return formatted date for timestamps 7+ days ago", () => {
		const now = Date.now();
		const sevenDaysAgo = now - 604800000; // 7 days
		const result = formatRelativeTime(sevenDaysAgo);
		// Should be a date string, not "Xd ago"
		expect(result).not.toContain("d ago");
		expect(result).not.toContain("Just now");
	});
});

describe("formatAbsoluteTime", () => {
	it("should return formatted time string", () => {
		const timestamp = new Date("2025-12-30T14:30:00.000Z").getTime();
		const result = formatAbsoluteTime(timestamp);
		// Should contain hour and minutes
		expect(result).toMatch(/\d{1,2}:\d{2}/);
	});

	it("should use 12-hour format without seconds", () => {
		const timestamp = new Date("2025-12-30T14:30:45.000Z").getTime();
		const result = formatAbsoluteTime(timestamp);
		// Should not contain seconds
		expect(result).not.toMatch(/:\d{2}:\d{2}/);
	});
});

// =============================================================================
// FILE DISPLAY TESTS
// =============================================================================

describe("formatAnchorFile", () => {
	it("should return basename for single file snapshot", () => {
		const snapshot = createMockSnapshot({
			anchorFile: "/path/to/api.ts",
			files: {
				"/path/to/api.ts": { blobHash: "abc", size: 100 },
			},
		});
		expect(formatAnchorFile(snapshot)).toBe("api.ts");
	});

	it("should return 'basename (+N)' for multi-file snapshot", () => {
		const snapshot = createMockSnapshot({
			anchorFile: "/path/to/index.ts",
			files: {
				"/path/to/index.ts": { blobHash: "abc", size: 100 },
				"/path/to/api.ts": { blobHash: "def", size: 200 },
				"/path/to/types.ts": { blobHash: "ghi", size: 150 },
			},
		});
		expect(formatAnchorFile(snapshot)).toBe("index.ts (+2)");
	});

	it("should handle Windows paths", () => {
		const snapshot = createMockSnapshot({
			anchorFile: "C:\\Users\\dev\\project\\src\\component.tsx",
			files: {
				"C:\\Users\\dev\\project\\src\\component.tsx": { blobHash: "abc", size: 100 },
			},
		});
		expect(formatAnchorFile(snapshot)).toBe("component.tsx");
	});

	it("should return 'Multiple files' when anchorFile is missing", () => {
		const snapshot = createMockSnapshot({
			anchorFile: "",
			files: {
				"/path/to/a.ts": { blobHash: "abc", size: 100 },
				"/path/to/b.ts": { blobHash: "def", size: 100 },
			},
		});
		expect(formatAnchorFile(snapshot)).toBe("Multiple files");
	});

	it("should return basename for files without path", () => {
		const snapshot = createMockSnapshot({
			anchorFile: "standalone.ts",
			files: {
				"standalone.ts": { blobHash: "abc", size: 100 },
			},
		});
		expect(formatAnchorFile(snapshot)).toBe("standalone.ts");
	});
});

// =============================================================================
// BYTE FORMATTING TESTS
// =============================================================================

describe("formatBytes", () => {
	it("should format bytes", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(1023)).toBe("1023 B");
	});

	it("should format kilobytes", () => {
		expect(formatBytes(1024)).toBe("1.0 KB");
		expect(formatBytes(1536)).toBe("1.5 KB");
		expect(formatBytes(10240)).toBe("10.0 KB");
	});

	it("should format megabytes", () => {
		expect(formatBytes(1048576)).toBe("1.0 MB");
		expect(formatBytes(1572864)).toBe("1.5 MB");
		expect(formatBytes(10485760)).toBe("10.0 MB");
	});

	it("should format gigabytes", () => {
		expect(formatBytes(1073741824)).toBe("1.0 GB");
		expect(formatBytes(1610612736)).toBe("1.5 GB");
	});
});

// =============================================================================
// CONSTANT EXPORTS TESTS
// =============================================================================

describe("ORIGIN_ICONS constant", () => {
	it("should export all required icons", () => {
		expect(ORIGIN_ICONS.AI_DETECTED).toBe("🤖");
		expect(ORIGIN_ICONS.AUTOMATED).toBe("⚡");
		expect(ORIGIN_ICONS.INTERACTIVE).toBe("📸");
		expect(ORIGIN_ICONS.PRE_RESTORE).toBe("⏪");
	});
});

describe("REASON_LABELS constant", () => {
	it("should export all required labels", () => {
		expect(REASON_LABELS.MANUAL_CHECKPOINT).toBe("Manual checkpoint");
		expect(REASON_LABELS.AI_DETECTED).toBe("AI activity detected");
		expect(REASON_LABELS.RISK_BURST_START).toBe("Rapid changes detected");
		expect(REASON_LABELS.CRITICAL_FILE).toBe("Critical file changed");
		expect(REASON_LABELS.PRE_ROLLBACK).toBe("Before restore");
	});
});
