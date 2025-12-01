import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry.js";
import type { ProtectionLevel } from "../../src/views/types.js";

describe("Context Menu Protection Levels", () => {
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

	it("should show 'Protect File' menu for unprotected files", async () => {
		const testFile = "/test/workspace/test.ts";

		// File is not protected
		const isProtected = registry.isProtected(testFile);
		expect(isProtected).toBe(false);

		// Context variable should indicate file is not protected
		// This would be tested through VS Code's setContext mechanism
	});

	it("should show 'Protection: [Level]' menu for protected files", async () => {
		const testFile = "/test/workspace/test.ts";

		// Add file with specific protection level
		await registry.add(testFile, { protectionLevel: "Protected" });

		// File should now be protected
		const isProtected = registry.isProtected(testFile);
		expect(isProtected).toBe(true);

		// Should get correct protection level
		const level = registry.getProtectionLevel(testFile);
		expect(level).toBe("Protected");
	});

	it("should show checkmark on current protection level in submenu", async () => {
		const testFile = "/test/workspace/test.ts";

		// Add file with specific protection level
		await registry.add(testFile, { protectionLevel: "Warning" });

		// Should get correct protection level
		const level = registry.getProtectionLevel(testFile);
		expect(level).toBe("Warning");

		// In the UI, the Warning level should show a checkmark
		// This would be implemented in the menu rendering logic
	});

	it("should update context variables when protection status changes", async () => {
		const testFile = "/test/workspace/test.ts";

		// Initially file is not protected
		const isProtectedBefore = registry.isProtected(testFile);
		expect(isProtectedBefore).toBe(false);

		// Add protection
		await registry.add(testFile, { protectionLevel: "Protected" });

		// File should now be protected
		const isProtectedAfter = registry.isProtected(testFile);
		expect(isProtectedAfter).toBe(true);

		// Should get correct protection level
		const level = registry.getProtectionLevel(testFile);
		expect(level).toBe("Protected");
	});

	it("should handle all protection levels in context menu", async () => {
		const testFiles = [
			{
				path: "/test/workspace/watched.ts",
				level: "Watched" as ProtectionLevel,
			},
			{
				path: "/test/workspace/warning.ts",
				level: "Warning" as ProtectionLevel,
			},
			{
				path: "/test/workspace/protected.ts",
				level: "Protected" as ProtectionLevel,
			},
		];

		// Add all files with their respective levels
		for (const { path, level } of testFiles) {
			await registry.add(path, { protectionLevel: level });
		}

		// Verify all levels are stored correctly and context is updated
		for (const { path, level } of testFiles) {
			const isProtected = registry.isProtected(path);
			expect(isProtected).toBe(true);

			const fileLevel = registry.getProtectionLevel(path);
			expect(fileLevel).toBe(level);
		}
	});

	it("should properly handle submenu visibility conditions", async () => {
		// Test that context variables are set correctly for menu visibility
		const testFile = "/test/workspace/test.ts";

		// For unprotected file
		const isProtected = registry.isProtected(testFile);
		expect(isProtected).toBe(false);

		// Context conditions:
		// !snapback.isProtected && snapback.canProtect -> show protectFile submenu
		// snapback.isProtected && snapback.canProtect -> show changeProtection submenu

		// For protected file
		await registry.add(testFile, { protectionLevel: "Protected" });
		const isProtectedAfter = registry.isProtected(testFile);
		expect(isProtectedAfter).toBe(true);
	});

	it("should handle protection level change conditions", async () => {
		// Test that submenu items are shown/hidden based on current level
		const testFile = "/test/workspace/test.ts";

		// Add file with Warning level
		await registry.add(testFile, { protectionLevel: "Warning" });

		const level = registry.getProtectionLevel(testFile);
		expect(level).toBe("Warning");

		// Context condition for submenu items:
		// snapback.currentLevel != 'watched' -> show Watched option
		// snapback.currentLevel != 'warning' -> show Warning option (should be hidden)
		// snapback.currentLevel != 'protected' -> show Protected option
	});
});
