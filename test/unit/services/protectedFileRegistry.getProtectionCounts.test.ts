import { beforeEach, describe, expect, it } from "vitest";
import { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";

/**
 * Test suite for ProtectedFileRegistry.getProtectionCounts()
 *
 * This validates the new method added to support SnapBackTreeProvider's
 * IConfigManager interface requirement for displaying protection breakdowns.
 */
describe("ProtectedFileRegistry.getProtectionCounts()", () => {
	let registry: ProtectedFileRegistry;
	let mockState: any;

	beforeEach(() => {
		// Create a mock Memento (VSCode state storage)
		mockState = {
			get: () => [],
			update: async () => {},
		};
		registry = new ProtectedFileRegistry(mockState);
	});

	it("should return zero counts when no files are protected", async () => {
		const counts = await registry.getProtectionCounts();

		expect(counts).toEqual({
			block: 0,
			warn: 0,
			watch: 0,
		});
	});

	it("should count Protected level files as block", async () => {
		// Mock state with one Protected file
		mockState.get = () => [
			{
				path: "test.ts",
				label: "test.ts",
				lastProtectedAt: Date.now(),
				protectionLevel: "Protected",
			},
		];

		const counts = await registry.getProtectionCounts();

		expect(counts.block).toBe(1);
		expect(counts.warn).toBe(0);
		expect(counts.watch).toBe(0);
	});

	it("should count Warning level files as warn", async () => {
		mockState.get = () => [
			{
				path: "test.ts",
				label: "test.ts",
				lastProtectedAt: Date.now(),
				protectionLevel: "Warning",
			},
		];

		const counts = await registry.getProtectionCounts();

		expect(counts.block).toBe(0);
		expect(counts.warn).toBe(1);
		expect(counts.watch).toBe(0);
	});

	it("should count Watched level files as watch", async () => {
		mockState.get = () => [
			{
				path: "test.ts",
				label: "test.ts",
				lastProtectedAt: Date.now(),
				protectionLevel: "Watched",
			},
		];

		const counts = await registry.getProtectionCounts();

		expect(counts.block).toBe(0);
		expect(counts.warn).toBe(0);
		expect(counts.watch).toBe(1);
	});

	it("should default to watch for files without protection level", async () => {
		mockState.get = () => [
			{
				path: "test.ts",
				label: "test.ts",
				lastProtectedAt: Date.now(),
				// No protectionLevel specified
			},
		];

		const counts = await registry.getProtectionCounts();

		expect(counts.block).toBe(0);
		expect(counts.warn).toBe(0);
		expect(counts.watch).toBe(1);
	});

	it("should correctly count multiple files of different levels", async () => {
		mockState.get = () => [
			{
				path: "critical.ts",
				label: "critical.ts",
				lastProtectedAt: Date.now(),
				protectionLevel: "Protected",
			},
			{
				path: "important.ts",
				label: "important.ts",
				lastProtectedAt: Date.now(),
				protectionLevel: "Protected",
			},
			{
				path: "config.json",
				label: "config.json",
				lastProtectedAt: Date.now(),
				protectionLevel: "Warning",
			},
			{
				path: "data.ts",
				label: "data.ts",
				lastProtectedAt: Date.now(),
				protectionLevel: "Watched",
			},
			{
				path: "utils.ts",
				label: "utils.ts",
				lastProtectedAt: Date.now(),
				protectionLevel: "Watched",
			},
		];

		const counts = await registry.getProtectionCounts();

		expect(counts).toEqual({
			block: 2, // 2 Protected files
			warn: 1, // 1 Warning file
			watch: 2, // 2 Watched files
		});
	});

	it("should handle large number of files efficiently", async () => {
		// Create 1000 mock files
		const mockFiles = Array.from({ length: 1000 }, (_, i) => ({
			path: `file${i}.ts`,
			label: `file${i}.ts`,
			lastProtectedAt: Date.now(),
			protectionLevel:
				i % 3 === 0 ? "Protected" : i % 3 === 1 ? "Warning" : "Watched",
		}));

		mockState.get = () => mockFiles;

		const startTime = Date.now();
		const counts = await registry.getProtectionCounts();
		const duration = Date.now() - startTime;

		// Should complete in under 100ms
		expect(duration).toBeLessThan(100);

		// Verify counts
		expect(counts.block).toBeGreaterThan(0);
		expect(counts.warn).toBeGreaterThan(0);
		expect(counts.watch).toBeGreaterThan(0);

		// Total should equal 1000
		expect(counts.block + counts.warn + counts.watch).toBe(1000);
	});
});
