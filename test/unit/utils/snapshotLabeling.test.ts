/**
 * Tests for Snapshot Semantic Labeling
 *
 * Validates that snapshots receive human-friendly labels derived from
 * available metadata (trigger, branch, time, custom names).
 */

import { describe, expect, it } from "vitest";
import {
	getSnapshotDisplayLabel,
	getSnapshotLabel,
	getSnapshotShortLabel,
} from "../../../src/utils/snapshotLabeling.js";

describe("Snapshot Semantic Labeling", () => {
	describe("getSnapshotLabel", () => {
		it("should create label with custom name and timestamp", () => {
			// Arrange
			const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
			const snapshot = {
				id: "snap-123",
				timestamp: fiveMinutesAgo,
				name: "Auto-save before test refactor",
				files: ["src/test.ts", "src/auth.ts"],
			};

			// Act
			const label = getSnapshotLabel(snapshot);

			// Assert
			expect(label.primary).toContain("Auto-save");
			expect(label.primary).toContain("5 min ago");
			expect(label.detail).toContain("snap");
			expect(label.detail).toContain("2 files");
		});

		it("should handle snapshot with no custom name", () => {
			// Arrange
			const now = Date.now();
			const snapshot = {
				id: "snap-456",
				timestamp: now,
				name: undefined,
				files: ["file.ts"],
			};

			// Act
			const label = getSnapshotLabel(snapshot);

			// Assert
			expect(label.primary).toBeTruthy();
			expect(label.primary.length).toBeGreaterThan(0);
			expect(label.detail).toContain("snap");
			expect(label.detail).toContain("1 file");
		});

		it("should extract trigger from name", () => {
			// Arrange
			const snapshots = [
				{
					id: "snap-1",
					timestamp: Date.now(),
					name: "Auto-save: before refactoring",
					files: [],
				},
				{
					id: "snap-2",
					timestamp: Date.now(),
					name: "Risk detected - potential vulnerability",
					files: [],
				},
				{
					id: "snap-3",
					timestamp: Date.now(),
					name: "Manual snapshot creation",
					files: [],
				},
			];

			// Act & Assert
			snapshots.forEach((snap) => {
				const label = getSnapshotLabel(snap);
				expect(label.primary).toBeTruthy();
				// Trigger should be identified from name
				if (snap.name?.includes("Auto-save")) {
					expect(label.primary).toContain("Auto-save");
				}
				if (snap.name?.includes("Risk")) {
					expect(label.primary).toContain("Risk");
				}
			});
		});

		it("should format relative time correctly", () => {
			// Arrange
			const testCases = [
				{ label: "just now", ms: 30 * 1000 },
				{ label: "1 min ago", ms: 90 * 1000 },
				{ label: "5 min ago", ms: 5 * 60 * 1000 },
				{ label: "1 hour ago", ms: 60 * 60 * 1000 },
				{ label: "1 day ago", ms: 24 * 60 * 60 * 1000 },
			];

			testCases.forEach(({ label: expectedLabel, ms }) => {
				const snapshot = {
					id: "snap-test",
					timestamp: Date.now() - ms,
					name: "Test",
					files: [],
				};

				// Act
				const result = getSnapshotLabel(snapshot);

				// Assert
				expect(result.primary).toContain(
					expectedLabel.split(" ")[0].toLowerCase(),
				);
			});
		});

		it("should truncate long names", () => {
			// Arrange
			const longName =
				"This is a very long snapshot name that should be truncated to avoid excessive length in the UI";
			const snapshot = {
				id: "snap-long",
				timestamp: Date.now(),
				name: longName,
				files: ["file.ts"],
			};

			// Act
			const label = getSnapshotLabel(snapshot);

			// Assert
			expect(label.primary.length).toBeLessThanOrEqual(80);
			expect(label.primary).toContain("…"); // Truncation indicator
		});

		it("should handle single file label correctly", () => {
			// Arrange
			const snapshot = {
				id: "snap-single",
				timestamp: Date.now(),
				name: "Single file",
				files: ["only-one.ts"],
			};

			// Act
			const label = getSnapshotLabel(snapshot);

			// Assert
			expect(label.detail).toContain("1 file"); // Singular
		});

		it("should handle multiple files label correctly", () => {
			// Arrange
			const snapshot = {
				id: "snap-multi",
				timestamp: Date.now(),
				name: "Multiple files",
				files: Array(10).fill("file.ts"),
			};

			// Act
			const label = getSnapshotLabel(snapshot);

			// Assert
			expect(label.detail).toContain("10 files"); // Plural
		});
	});

	describe("getSnapshotDisplayLabel", () => {
		it("should combine primary and detail labels", () => {
			// Arrange
			const snapshot = {
				id: "snap-display",
				timestamp: Date.now() - 10 * 60 * 1000,
				name: "Test snapshot",
				files: ["file1.ts", "file2.ts"],
			};

			// Act
			const displayLabel = getSnapshotDisplayLabel(snapshot);

			// Assert
			expect(displayLabel).toContain("Test snapshot");
			expect(displayLabel).toContain("files");
			expect(displayLabel).toMatch(/\([^)]+\)/); // Contains parentheses
		});
	});

	describe("getSnapshotShortLabel", () => {
		it("should create compact label for tight UI spaces", () => {
			// Arrange
			const snapshot = {
				id: "snap-short",
				timestamp: Date.now() - 15 * 60 * 1000,
				name: "Short label test",
				files: Array(5).fill("file.ts"),
			};

			// Act
			const shortLabel = getSnapshotShortLabel(snapshot);

			// Assert
			expect(shortLabel.length).toBeLessThan(100);
			expect(shortLabel).toContain("min ago");
			expect(shortLabel).toContain("files");
		});
	});

	describe("Edge Cases", () => {
		it("should handle snapshot with empty files array", () => {
			// Arrange
			const snapshot = {
				id: "snap-empty",
				timestamp: Date.now(),
				name: "Empty snapshot",
				files: [],
			};

			// Act
			const label = getSnapshotLabel(snapshot);

			// Assert
			expect(label.detail).toContain("0 files");
		});

		it("should handle snapshot with missing timestamp", () => {
			// Arrange
			const snapshot = {
				id: "snap-notimestamp",
				timestamp: 0,
				name: "No timestamp",
				files: ["file.ts"],
			};

			// Act
			const label = getSnapshotLabel(snapshot);

			// Assert
			expect(label.primary).toBeTruthy();
			expect(label.detail).toContain("snap");
		});

		it("should handle snapshot with undefined name", () => {
			// Arrange
			const snapshot = {
				id: "snap-noname",
				timestamp: Date.now(),
				name: undefined,
				files: ["file.ts"],
			};

			// Act
			const label = getSnapshotLabel(snapshot);

			// Assert
			expect(label.primary).toBeTruthy();
			expect(label.short).toBeTruthy();
		});
	});
});
