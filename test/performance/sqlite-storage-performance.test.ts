import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rimraf } from "rimraf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PerformanceMonitor } from "../../src/performance/PerformanceMonitor.js";
import { setPerformanceMonitor } from "../../src/performance/timingDecorators.js";
import { SqliteSnapshotStorage } from "../../src/storage/SqliteSnapshotStorage.js";

describe("SqliteSnapshotStorage Performance Monitoring Integration", () => {
	let storage: SqliteSnapshotStorage;
	let monitor: PerformanceMonitor;
	const testDir = path.join(__dirname, ".test-snapback-perf");

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
		storage = new SqliteSnapshotStorage(testDir);

		// Set up performance monitoring
		monitor = new PerformanceMonitor({ outputFormat: "silent" });
		setPerformanceMonitor(monitor);
	});

	afterEach(async () => {
		await storage.close();
		await rimraf(testDir);
	});

	describe("Method Timing", () => {
		it("should track initialize method performance", async () => {
			await storage.initialize();

			const timings = monitor.getTimings();
			// Filter for both class-level and method-level timings
			const initTimings = timings.filter(
				(t: { operationName: string }) =>
					t.operationName === "SqliteSnapshotStorage.initialize" ||
					t.operationName === "SqliteSnapshotStorage.initialize",
			);
			expect(initTimings.length).toBeGreaterThanOrEqual(1);
			expect(initTimings[0].duration).toBeGreaterThan(0);
		});

		it("should track createSnapshot method performance", async () => {
			await storage.initialize();

			const files = new Map([
				["src/file1.ts", "const a = 1;\nconst b = 2;\n"],
				["src/file2.ts", "export function test() { return true; }\n"],
			]);

			await storage.createSnapshot("test_snapshot", files, {});

			const timings = monitor.getTimings();
			const createTimings = timings.filter(
				(t: { operationName: string }) =>
					t.operationName === "SqliteSnapshotStorage.createSnapshot",
			);
			expect(createTimings.length).toBeGreaterThanOrEqual(1);
			expect(createTimings[0].duration).toBeGreaterThan(0);
		});

		it("should track getSnapshot method performance", async () => {
			await storage.initialize();

			const files = new Map([["src/file1.ts", "const a = 1;\nconst b = 2;\n"]]);

			const snapshot = await storage.createSnapshot("test_snapshot", files);
			await storage.getSnapshot(snapshot.id);

			const timings = monitor.getTimings();
			const getTimings = timings.filter(
				(t: { operationName: string }) =>
					t.operationName === "SqliteSnapshotStorage.getSnapshot",
			);
			expect(getTimings.length).toBeGreaterThanOrEqual(1);
			expect(getTimings[0].duration).toBeGreaterThan(0);
		});

		it("should track listSnapshots method performance", async () => {
			await storage.initialize();

			const files = new Map([["src/file1.ts", "const a = 1;\nconst b = 2;\n"]]);

			await storage.createSnapshot("test_snapshot", files, {});
			await storage.listSnapshots();

			const timings = monitor.getTimings();
			const listTimings = timings.filter(
				(t: { operationName: string }) =>
					t.operationName === "SqliteSnapshotStorage.listSnapshots",
			);
			expect(listTimings.length).toBeGreaterThanOrEqual(1);
			expect(listTimings[0].duration).toBeGreaterThan(0);
		});
	});

	describe("Performance Metrics", () => {
		it("should track database operation metrics", async () => {
			await storage.initialize();

			// Create multiple snapshots to generate metrics
			const files1 = new Map([
				["src/file1.ts", "const a = 1;\nconst b = 2;\n"],
			]);

			const files2 = new Map([
				["src/file1.ts", "const a = 1;\nconst b = 3;\n"], // Modified
			]);

			const snap1 = await storage.createSnapshot("snapshot_1", files1, {});
			const snap2 = await storage.createSnapshot(
				"snapshot_2",
				files2,
				{},
				snap1.id,
			);

			// Get snapshots
			await storage.getSnapshot(snap1.id);
			await storage.getSnapshot(snap2.id);

			// List snapshots
			await storage.listSnapshots();

			const timings = monitor.getTimings();
			expect(timings.length).toBeGreaterThan(0);

			// Verify all major operations were tracked
			const operationNames = timings.map(
				(t: { operationName: string }) => t.operationName,
			);
			expect(operationNames).toContain("SqliteSnapshotStorage.initialize");
			expect(operationNames).toContain("SqliteSnapshotStorage.createSnapshot");
			expect(operationNames).toContain("SqliteSnapshotStorage.getSnapshot");
			expect(operationNames).toContain("SqliteSnapshotStorage.listSnapshots");

			// Verify timing durations are reasonable
			for (const timing of timings) {
				expect(timing.duration).toBeGreaterThan(0);
				expect(timing.duration).toBeLessThan(10000); // Should be less than 10 seconds
			}
		});

		it("should track memory usage during operations", async () => {
			await storage.initialize();

			const files = new Map([
				["src/large-file.ts", "x".repeat(10000)], // Large file content
			]);

			await storage.createSnapshot("large_snapshot", files, {});

			const timings = monitor.getTimings();
			const createTiming = timings.find(
				(t: { operationName: string }) =>
					t.operationName === "SqliteSnapshotStorage.createSnapshot",
			);

			expect(createTiming).toBeDefined();
			expect(createTiming?.memoryUsage).toBeDefined();
			expect(createTiming?.memoryUsage?.start).toBeDefined();
			expect(createTiming?.memoryUsage?.end).toBeDefined();
			expect(createTiming?.memoryUsage?.diff).toBeDefined();
		});
	});

	describe("Sampling Configuration", () => {
		it("should respect sampling rate configuration", async () => {
			// Create monitor with 0% sampling rate
			const lowSamplingMonitor = new PerformanceMonitor({
				samplingRate: 0.0,
				outputFormat: "silent",
			});
			setPerformanceMonitor(lowSamplingMonitor);

			await storage.initialize();

			const files = new Map([["src/file1.ts", "const a = 1;\nconst b = 2;\n"]]);

			await storage.createSnapshot("test_snapshot", files, {});

			// Should have no timings due to 0% sampling
			const timings = lowSamplingMonitor.getTimings();
			expect(timings).toHaveLength(0);
		});

		it("should track all operations with 100% sampling rate", async () => {
			// Create monitor with 100% sampling rate
			const fullSamplingMonitor = new PerformanceMonitor({
				samplingRate: 1.0,
				outputFormat: "silent",
			});
			setPerformanceMonitor(fullSamplingMonitor);

			await storage.initialize();

			const files = new Map([["src/file1.ts", "const a = 1;\nconst b = 2;\n"]]);

			const snapshot = await storage.createSnapshot("test_snapshot", files, {});
			await storage.getSnapshot(snapshot.id);
			await storage.listSnapshots();

			// Should track all operations
			const timings = fullSamplingMonitor.getTimings();
			expect(timings.length).toBeGreaterThan(0);

			const operationNames = timings.map(
				(t: { operationName: string }) => t.operationName,
			);
			expect(operationNames).toContain("SqliteSnapshotStorage.initialize");
			expect(operationNames).toContain("SqliteSnapshotStorage.createSnapshot");
			expect(operationNames).toContain("SqliteSnapshotStorage.getSnapshot");
			expect(operationNames).toContain("SqliteSnapshotStorage.listSnapshots");
		});
	});

	describe("Disabled Monitoring", () => {
		it("should not track operations when monitoring is disabled", async () => {
			// Create disabled monitor
			const disabledMonitor = new PerformanceMonitor({
				enabled: false,
				outputFormat: "silent",
			});
			setPerformanceMonitor(disabledMonitor);

			await storage.initialize();

			const files = new Map([["src/file1.ts", "const a = 1;\nconst b = 2;\n"]]);

			await storage.createSnapshot("test_snapshot", files, {});

			// Should have no timings due to disabled monitoring
			const timings = disabledMonitor.getTimings();
			expect(timings).toHaveLength(0);
		});
	});
});
