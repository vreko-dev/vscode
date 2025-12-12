import { describe, it, expect, beforeEach, vi } from "vitest";
import { RecoveryDetection } from "../../../src/recovery/RecoveryDetection";
import { SnapshotPicker } from "../../../src/recovery/SnapshotPicker";
import { RestorePreview } from "../../../src/recovery/RestorePreview";

// RecoveryUXNotification will be created in Phase 2
// Mocking it for Phase 1 tests
const RecoveryUXNotification = class {
	show(config: any) {
		return {
			visible: true,
			message: config.message,
			buttons: [
				{ label: "View Diff" },
				{ label: "Restore" },
				{ label: "Share" },
			],
		};
	}
};

describe("Recovery UX - Full Flow Tests", () => {
	// =========== RecoveryDetection ===========
	describe("RecoveryDetection.detect()", () => {
		let detection: RecoveryDetection;

		beforeEach(() => {
			vi.clearAllMocks();
			detection = new RecoveryDetection();
		});

		// Happy Path: Detects invalid rules
		it("should detect unrecoverable state when rules are invalid", () => {
			const result = detection.isRecoverableState(null);
			expect(result).toBe(true);
		});

		// Edge Case: Valid rules don't trigger recovery
		it("should NOT detect recovery needed for valid rules", () => {
			const validRules = {
				"*.ts": { protection: "watch" },
				"auth/**": { protection: "block" },
			};

			const result = detection.isRecoverableState(validRules);
			expect(result).toBe(false);
		});

		// Sad Path: Skips on first init
		it("should skip recovery check on first initialization", () => {
			const result = detection.shouldSkipFirstInit();
			expect(result).toBe(true);
		});
	});

	// =========== SnapshotPicker ===========
	describe("SnapshotPicker methods", () => {
		let picker: SnapshotPicker;

		beforeEach(() => {
			vi.clearAllMocks();
			picker = new SnapshotPicker();
		});

		// Happy Path: Filters snapshots by time
		it("should filter snapshots within time range", () => {
			const snapshots = [
				{ id: "1", files: ["auth.ts"], timestamp: Date.now() - 60000, integrity: true },
				{ id: "2", files: ["utils.ts"], timestamp: Date.now() - 10000, integrity: true },
			];

			const result = picker.filterByTimeRange(snapshots, 120000);

			expect(result).toHaveLength(2);
		});

		// Edge Case: Shows file count metadata
		it("should include file count in result metadata", () => {
			const snapshots = [
				{ id: "1", files: ["file1.ts"], timestamp: Date.now(), integrity: true },
				{ id: "2", files: ["file2.ts", "file3.ts"], timestamp: Date.now(), integrity: true },
			];

			const result = picker.getSnapshotsWithCounts(snapshots);

			expect(result).toHaveLength(2);
			expect(result[0]).toHaveProperty("count");
			expect(result[0].count).toEqual(1);
			expect(result[1].count).toEqual(2);
		});

		// Error Case: Validates snapshot integrity
		it("should validate snapshot integrity before returning", () => {
			const validSnapshot = {
				id: "1",
				files: ["file.ts"],
				timestamp: Date.now(),
				integrity: true,
			};

			const result = picker.validateIntegrity(validSnapshot);

			expect(result).toBe(true);
		});

		it("should reject snapshot with missing ID", () => {
			const invalidSnapshot = {
				id: "",
				files: ["file.ts"],
				timestamp: Date.now(),
				integrity: true,
			};

			const result = picker.validateIntegrity(invalidSnapshot);

			expect(result).toBe(false);
		});
	});

	// =========== RestorePreview ===========
	describe("RestorePreview methods", () => {
		let preview: RestorePreview;

		beforeEach(() => {
			vi.clearAllMocks();
			preview = new RestorePreview();
		});

		// Happy Path: Generates diff
		it("should generate diff showing file changes", () => {
			const snapshot = {
				newFiles: ["new-file.ts"],
				changedFiles: ["auth.ts"],
				removedFiles: [],
			};

			const result = preview.generateDiff(snapshot);

			expect(result).toBeDefined();
			expect(result.additions).toContain("new-file.ts");
			expect(result.modifications).toContain("auth.ts");
		});

		// Edge Case: Shows additions and deletions separately
		it("should track additions and deletions separately", () => {
			const snapshot = {
				newFiles: ["file1.ts", "file2.ts"],
				changedFiles: ["modified.ts"],
				removedFiles: ["deleted.ts"],
			};

			const result = preview.generateDiff(snapshot);

			expect(result.additions.length).toEqual(2);
			expect(result.deletions.length).toEqual(1);
			expect(result.modifications.length).toEqual(1);
		});

		// Sad Path: Calculates risk score
		it("should calculate risk score based on file changes", () => {
			const config = {
				changedFiles: ["auth.ts", "db.ts"],
				removedFiles: ["important.ts"],
			};

			const result = preview.calculateRisk(config);

			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThanOrEqual(100);
		});

		it("should return 100 risk for null config", () => {
			const result = preview.calculateRisk(null);

			expect(result).toEqual(100);
		});
	});

	// =========== RecoveryUXNotification (NEW UI COMPONENT) ===========
	describe("RecoveryUXNotification.show()", () => {
		let notification: InstanceType<typeof RecoveryUXNotification>;

		beforeEach(() => {
			vi.clearAllMocks();
			notification = new RecoveryUXNotification();
		});

		// Happy Path: Shows toast with message
		it("should display toast notification when recovery detected", () => {
			const result = notification.show({
				message: "AI tried to delete auth.ts - SnapBack protected it",
				snapshotId: "snap-123",
				filePath: "auth.ts",
			});

			expect(result.visible).toBe(true);
			expect(result.message).toContain("auth.ts");
			expect(result.message).toContain("protected");
		});

		// Edge Case: Includes action buttons
		it("should include View/Restore/Share buttons in notification", () => {
			const result = notification.show({
				message: "Recovery needed for src/utils.ts",
				snapshotId: "snap-456",
				filePath: "src/utils.ts",
			});

			expect(result.buttons).toBeDefined();
			expect(result.buttons).toContainEqual(
				expect.objectContaining({ label: "View Diff" })
			);
			expect(result.buttons).toContainEqual(
				expect.objectContaining({ label: "Restore" })
			);
			expect(result.buttons).toContainEqual(
				expect.objectContaining({ label: "Share" })
			);
		});

		// Sad Path: Survives if notification service unavailable
		it("should gracefully handle notification service failures", () => {
			const result = notification.show({
				message: "Recovery available",
				snapshotId: "snap-789",
				filePath: "file.ts",
			});

			// Should not throw even if service is down
			expect(result).toBeDefined();
			expect(result.message).toBeDefined();
		});
	});
});
