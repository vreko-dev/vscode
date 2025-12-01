import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry.js";
import type { ProtectionLevel } from "../../src/views/types.js";

describe("Protection Levels", () => {
	let registry: ProtectedFileRegistry;
	let mockStorage: Map<string, any>;

	beforeEach(() => {
		mockStorage = new Map();
		const mockState = {
			get: vi.fn().mockImplementation((key, defaultValue) => {
				return mockStorage.get(key) ?? defaultValue;
			}),
			update: vi.fn().mockImplementation((key, value) => {
				mockStorage.set(key, value);
				return Promise.resolve();
			}),
		};

		registry = new ProtectedFileRegistry(mockState as any);
	});

	it("should add file with default protection level (watch)", async () => {
		const testFile = "/test/workspace/test.ts";

		await registry.add(testFile);

		const files = await registry.list();
		expect(files).toHaveLength(1);
		expect(files[0].protectionLevel).toBe("watch");
	});

	it("should add file with specified protection level", async () => {
		const testFile = "/test/workspace/test.ts";

		await registry.add(testFile, { protectionLevel: "block" });

		const files = await registry.list();
		expect(files).toHaveLength(1);
		expect(files[0].protectionLevel).toBe("block");
	});

	it("should update protection level for existing file", async () => {
		const testFile = "/test/workspace/test.ts";

		// First add with default level
		await registry.add(testFile);

		// Then update to different level
		await registry.updateProtectionLevel(testFile, "warn");

		const files = await registry.list();
		expect(files).toHaveLength(1);
		expect(files[0].protectionLevel).toBe("warn");
	});

	it("should throw error when updating protection level for non-protected file", async () => {
		const testFile = "/test/workspace/non-protected.ts";

		await expect(
			registry.updateProtectionLevel(testFile, "block"),
		).rejects.toThrow("File not protected");
	});

	it("should provide correct metadata for each protection level", async () => {
		const { PROTECTION_LEVELS } = await import("../../src/views/types");

		// Test watch level
		const watchMetadata = PROTECTION_LEVELS.watch;
		expect(watchMetadata.level).toBe("watch");
		expect(watchMetadata.icon).toBe("🧢");
		expect(watchMetadata.label).toBe("Watch");
		expect(watchMetadata.description).toBe("Silent auto-checkpoint on save");

		// Test warn level
		const warnMetadata = PROTECTION_LEVELS.warn;
		expect(warnMetadata.level).toBe("warn");
		expect(warnMetadata.icon).toBe("👷");
		expect(warnMetadata.label).toBe("Warn");
		expect(warnMetadata.description).toBe("Notify before save with options");

		// Test block level
		const blockMetadata = PROTECTION_LEVELS.block;
		expect(blockMetadata.level).toBe("block");
		expect(blockMetadata.icon).toBe("⛑️");
		expect(blockMetadata.label).toBe("Block");
		expect(blockMetadata.description).toBe(
			"Require checkpoint or explicit override",
		);
	});

	it("should default to watch level when not specified", async () => {
		const testFile = "/test/workspace/default.ts";

		// Add file without specifying protection level
		await registry.add(testFile);

		// Should default to watch level
		const files = await registry.list();
		expect(files[0].protectionLevel).toBe("watch");
	});

	it("should handle all protection levels in registry operations", async () => {
		const testFiles = [
			{
				path: "/test/workspace/watch.ts",
				level: "watch" as ProtectionLevel,
			},
			{
				path: "/test/workspace/warn.ts",
				level: "warn" as ProtectionLevel,
			},
			{
				path: "/test/workspace/block.ts",
				level: "block" as ProtectionLevel,
			},
		];

		// Add all files with their respective levels
		for (const { path, level } of testFiles) {
			await registry.add(path, { protectionLevel: level });
		}

		// Verify all levels are stored correctly
		const files = await registry.list();
		expect(files).toHaveLength(3);

		for (const { path, level } of testFiles) {
			const file = files.find((f) => f.path === path);
			expect(file).toBeDefined();
			expect(file?.protectionLevel).toBe(level);
		}
	});

	it("should get protection level for a file", async () => {
		const testFile = "/test/workspace/test.ts";

		// Add file with specific protection level
		await registry.add(testFile, { protectionLevel: "block" });

		// Get protection level
		const level = registry.getProtectionLevel(testFile);
		expect(level).toBe("block");
	});

	it("should return undefined for protection level of non-protected file", async () => {
		const testFile = "/test/workspace/non-protected.ts";

		// Get protection level for non-protected file
		const level = registry.getProtectionLevel(testFile);
		expect(level).toBeUndefined();
	});
});
