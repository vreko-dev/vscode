import { describe, expect, it, vi } from "vitest";

describe("Extension Activation Edge Cases", () => {
	// Simple tests that don't require complex VS Code API mocking

	describe("Storage Reuse After Close", () => {
		it("should allow SqliteStorageAdapter to be reused after close", async () => {
			// This test verifies the fix for the SqliteStorageAdapter reuse issue
			// by directly testing the adapter's behavior

			const { isBetterSqlite3Available } = await import(
				"../../../src/storage/SqliteCheckpointStorage"
			);
			if (!isBetterSqlite3Available()) {
				vi.skip();
			}

			const { SqliteStorageAdapter } = await import(
				"../../../src/storage/SqliteStorageAdapter"
			);
			const fs = await import("node:fs/promises");
			const path = await import("node:path");
			const { rimraf } = await import("rimraf");

			const testDir = path.join(__dirname, ".test-edge-cases");
			await fs.mkdir(testDir, { recursive: true });

			try {
				const adapter = new SqliteStorageAdapter(testDir);

				// Initialize and use the adapter
				await adapter.initialize();

				// Create a checkpoint
				const _checkpoint1 = await adapter.create({
					trigger: "test1",
					risk: 0,
					content: "test content 1",
					files: ["test1.txt"],
					fileContents: { "test1.txt": "test content 1" },
				});

				// Close the adapter
				await adapter.close();

				// Verify the initialized flag is reset
				expect(adapter.initialized).toBe(false);

				// Now reuse the adapter - it should work because initialized flag is reset
				const checkpoint2 = await adapter.create({
					trigger: "test2",
					risk: 0,
					content: "test content 2",
					files: ["test2.txt"],
					fileContents: { "test2.txt": "test content 2" },
				});

				expect(checkpoint2).toBeDefined();
				expect(checkpoint2.id).toBeTruthy();

				// Clean up
				await adapter.close();
			} finally {
				await rimraf(testDir);
			}
		});
	});

	describe("PerformanceMonitor Config Validation", () => {
		it("should clamp negative maxTimings and maxMetrics to 0", async () => {
			// This test verifies the fix for PerformanceMonitor config validation
			const { PerformanceMonitor } = await import(
				"../../../src/performance/PerformanceMonitor"
			);

			const monitor = new PerformanceMonitor();

			// Set negative values
			monitor.setConfig({ maxTimings: -1, maxMetrics: -5 });

			const config = monitor.getConfig();
			expect(config.maxTimings).toBe(0); // Should be clamped to 0
			expect(config.maxMetrics).toBe(0); // Should be clamped to 0
		});
	});

	describe("Deactivation Safety", () => {
		it("should handle repeated deactivation calls without errors", async () => {
			// This test verifies that deactivation can be called multiple times safely
			// Mock the logger to avoid initialization issues
			const loggerModule = await import("../../../src/utils/logger");
			vi.spyOn(loggerModule, "logger", "get").mockReturnValue({
				info: vi.fn(),
				error: vi.fn(),
				debug: vi.fn(),
			} as any);

			const extensionModule = await import("../../../src/extension");

			// Call deactivate multiple times - should not throw
			expect(() => extensionModule.deactivate()).not.toThrow();
			expect(() => extensionModule.deactivate()).not.toThrow();
			expect(() => extensionModule.deactivate()).not.toThrow();
		});
	});
});
