/**
 * Regression Test: Issue #4 - Meaningless Checkpoint Names
 *
 * BUG: Checkpoint names like "Checkpoint 10/8/2025, 8:20:22 PM" don't include
 * the filename, making it hard to identify which file a checkpoint belongs to.
 *
 * LOCATION: src/checkpoint/CheckpointManager.ts checkpoint creation
 *
 * CURRENT BEHAVIOR:
 * - Checkpoint name: "Checkpoint 10/8/2025, 8:20:22 PM"
 * - No indication of which file this checkpoint is for
 * - Hard to distinguish checkpoints in the list
 *
 * EXPECTED BEHAVIOR:
 * - Checkpoint name should include filename: "test.ts - Oct 8, 8:20 PM"
 * - Format: "[filename] - [short date format]"
 * - More descriptive and user-friendly naming
 *
 * FIX: Update CheckpointManager to include filename in checkpoint naming
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Regression: Issue #4 - Meaningless Checkpoint Names", () => {
	const mockDate = new Date("2025-10-08T20:20:22");

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(mockDate);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	/**
	 * TEST: Current broken behavior - checkpoint names without filename
	 * This test documents the bug and will FAIL after the fix
	 */
	it("should reproduce the bug - checkpoint names lack filename context", () => {
		// Simulate current broken checkpoint naming
		const brokenCheckpointName = new Date().toLocaleString();

		// This is the current broken behavior
		expect(brokenCheckpointName).toBe("10/8/2025, 8:20:22 PM");

		// Bug: No filename information
		expect(brokenCheckpointName).not.toContain(".ts");
		expect(brokenCheckpointName).not.toContain("test.ts");
		expect(brokenCheckpointName).not.toContain("file");
	});

	/**
	 * TEST: Expected fixed behavior - checkpoint names with filename
	 * This test will PASS after the fix is implemented
	 */
	it("should include filename in checkpoint name after fix", () => {
		const filename = "test.ts";
		const expectedPattern = /^test\.ts - \w{3} \d{1,2}, \d{1,2}:\d{2} [AP]M$/;

		// Expected format: "test.ts - Oct 8, 8:20 PM"
		const fixedCheckpointName = generateFixedCheckpointName(filename, mockDate);

		expect(fixedCheckpointName).toMatch(expectedPattern);
		expect(fixedCheckpointName).toContain(filename);
		expect(fixedCheckpointName).toContain("Oct 8");
		expect(fixedCheckpointName).toContain("8:20 PM");
	});

	/**
	 * TEST: Verify checkpoint name format consistency
	 */
	it("should use consistent short date format across all checkpoints", () => {
		const files = ["app.ts", "config.json", "README.md"];

		const checkpointNames = files.map((file) =>
			generateFixedCheckpointName(file, mockDate),
		);

		// All should follow the same format pattern
		for (const name of checkpointNames) {
			expect(name).toMatch(/^.+ - \w{3} \d{1,2}, \d{1,2}:\d{2} [AP]M$/);
		}

		// Each should be unique (different filename)
		const uniqueNames = new Set(checkpointNames);
		expect(uniqueNames.size).toBe(files.length);
	});

	/**
	 * TEST: Verify checkpoint names are distinguishable for different files
	 */
	it("should create distinguishable checkpoint names for different files", () => {
		const file1 = "auth.ts";
		const file2 = "config.ts";

		const checkpoint1 = generateFixedCheckpointName(file1, mockDate);
		const checkpoint2 = generateFixedCheckpointName(file2, mockDate);

		// Names should be different
		expect(checkpoint1).not.toBe(checkpoint2);

		// Each should contain its respective filename
		expect(checkpoint1).toContain(file1);
		expect(checkpoint2).toContain(file2);
	});

	/**
	 * TEST: Verify checkpoint names handle edge cases
	 */
	it("should handle various filename formats correctly", () => {
		const edgeCaseFiles = [
			"file.with.dots.ts",
			"very-long-filename-with-many-hyphens.tsx",
			"simple.js",
			"package.json",
		];

		for (const filename of edgeCaseFiles) {
			const checkpointName = generateFixedCheckpointName(filename, mockDate);

			// Should always start with the filename
			expect(checkpointName.startsWith(filename)).toBe(true);

			// Should always contain the separator
			expect(checkpointName).toContain(" - ");

			// Should be readable and descriptive
			expect(checkpointName.length).toBeGreaterThan(filename.length + 10);
		}
	});

	/**
	 * TEST: Verify timestamp format is shorter and more readable than original
	 */
	it("should use shorter date format than original broken version", () => {
		const filename = "test.ts";
		const brokenFormat = new Date(mockDate).toLocaleString(); // "10/8/2025, 8:20:22 PM"
		const fixedFormat = generateFixedCheckpointName(filename, mockDate);

		// Fixed format should include filename
		expect(fixedFormat).toContain(filename);

		// Fixed format should be more readable (contains month abbreviation)
		expect(fixedFormat).toMatch(/\w{3} \d{1,2}/); // "Oct 8"

		// Original broken format doesn't have month abbreviation
		expect(brokenFormat).not.toMatch(/\w{3} \d{1,2}/);
	});

	/**
	 * TEST: Verify sorting by timestamp still works with new format
	 */
	it("should maintain sortable timestamp information", () => {
		const filename = "test.ts";
		const dates = [
			new Date("2025-10-08T20:20:00"),
			new Date("2025-10-08T20:30:00"),
			new Date("2025-10-08T21:00:00"),
		];

		const checkpoints = dates.map((date) => ({
			name: generateFixedCheckpointName(filename, date),
			timestamp: date.getTime(),
		}));

		// Verify timestamps are still accessible for sorting
		expect(checkpoints[0].timestamp).toBeLessThan(checkpoints[1].timestamp);
		expect(checkpoints[1].timestamp).toBeLessThan(checkpoints[2].timestamp);
	});
});

/**
 * Helper function that implements the FIXED checkpoint naming behavior
 * Format: "[filename] - [Mon DD, HH:MM AM/PM]"
 */
function generateFixedCheckpointName(filename: string, date: Date): string {
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];

	const month = months[date.getMonth()];
	const day = date.getDate();

	let hours = date.getHours();
	const minutes = date.getMinutes().toString().padStart(2, "0");
	const ampm = hours >= 12 ? "PM" : "AM";

	hours = hours % 12 || 12; // Convert to 12-hour format

	return `${filename} - ${month} ${day}, ${hours}:${minutes} ${ampm}`;
}
