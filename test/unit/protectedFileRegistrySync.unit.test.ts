import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry.js";

describe("ProtectedFileRegistry - Sync Methods", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should load files from storage on construction", () => {
		// Arrange
		const mockState = {
			get: vi.fn().mockReturnValue([
				{
					path: "file1.ts",
					label: "file1.ts",
					lastProtectedAt: Date.now(),
				},
				{
					path: "file2.ts",
					label: "file2.ts",
					lastProtectedAt: Date.now(),
				},
			]),
			update: vi.fn(),
		};

		// Act
		const registry = new ProtectedFileRegistry(mockState as any);
		const syncFiles = registry.getFilesSync();

		// Assert
		expect(mockState.get).toHaveBeenCalledWith("snapback:protected-files", []);
		expect(syncFiles).toHaveLength(2);
		expect(syncFiles[0].path).toContain("file1.ts");
		expect(syncFiles[1].path).toContain("file2.ts");
	});

	it("should update cache when files are added", async () => {
		// Arrange
		const mockState = {
			get: vi.fn().mockImplementation((key, defaultValue) => {
				if (key === "snapback:protected-files") {
					// After update, return the new file
					return [
						{
							path: "/test/newfile.ts",
							label: "newfile.ts",
							lastProtectedAt: Date.now(),
						},
					];
				}
				return defaultValue;
			}),
			update: vi.fn(),
		};

		const registry = new ProtectedFileRegistry(mockState as any);

		// Act - Add a file and check cache
		await registry.add("/test/newfile.ts");
		const syncFiles = registry.getFilesSync();

		// Assert
		expect(syncFiles).toHaveLength(1);
		expect(syncFiles[0].path).toContain("newfile.ts");
	});

	it("should provide access to cached files immediately after construction", () => {
		// This test verifies that the getFilesSync method returns data immediately
		// after construction, fixing the race condition issue
		const mockState = {
			get: vi.fn().mockReturnValue([
				{
					path: "file1.ts",
					label: "file1.ts",
					lastProtectedAt: Date.now(),
				},
				{
					path: "file2.ts",
					label: "file2.ts",
					lastProtectedAt: Date.now(),
				},
			]),
			update: vi.fn(),
		};

		// Act - Create registry and immediately get files
		const registry = new ProtectedFileRegistry(mockState as any);
		const syncFiles = registry.getFilesSync();

		// Assert - Should have files immediately, no need to call list() first
		expect(syncFiles).toHaveLength(2);
		expect(mockState.get).toHaveBeenCalledWith("snapback:protected-files", []);
	});
});
