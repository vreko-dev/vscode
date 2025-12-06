import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry";

describe("Reload Window Test", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should load protected files immediately after construction (simulating reload)", () => {
		// Arrange - Simulate files that were protected before reload
		const mockProtectedFiles = [
			{
				path: "/workspace/src/main.ts",
				label: "main.ts",
				lastProtectedAt: Date.now(),
			},
			{
				path: "/workspace/src/utils.ts",
				label: "utils.ts",
				lastProtectedAt: Date.now(),
			},
		];

		const mockState = {
			get: vi.fn().mockReturnValue(mockProtectedFiles),
			update: vi.fn(),
		};

		// Act - This simulates what happens when VS Code reloads and creates new instances
		const registry = new ProtectedFileRegistry(mockState as any);
		const decoratorFiles = registry.getFilesSync();

		// Assert - Files should be available immediately, no need to call list() first
		expect(decoratorFiles).toHaveLength(2);
		expect(decoratorFiles[0].path).toContain("main.ts");
		expect(decoratorFiles[1].path).toContain("utils.ts");

		// Verify the cache was loaded from storage during construction
		expect(mockState.get).toHaveBeenCalledWith("snapback:protected-files", []);
	});
});
