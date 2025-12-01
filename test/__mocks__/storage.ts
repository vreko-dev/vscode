import { vi } from "vitest";

/**
 * Mock factory for VS Code storage service
 *
 * Provides test doubles for extension state management (globalState/workspaceState).
 * Used to verify state persistence operations without actual VS Code storage access.
 */
export const createMockStorage = () => ({
	/**
	 * Retrieves value from storage
	 * @returns Value for the given key (default: undefined)
	 */
	get: vi.fn().mockReturnValue(undefined),

	/**
	 * Updates storage with new value
	 * @returns Promise resolving when update completes
	 */
	update: vi.fn().mockResolvedValue(undefined),

	/**
	 * Returns all storage keys
	 * @returns Array of storage keys (default: empty array)
	 */
	keys: vi.fn().mockReturnValue([]),
});

/**
 * Creates snapshot storage mock
 * @returns Promise resolving to mock snapshot object
 */
export const create = vi
	.fn()
	.mockResolvedValue({ id: "test-snapshot-123", timestamp: Date.now() });
