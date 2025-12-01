import { vi } from "vitest";
import type { FileSystemStorage } from "../../src/storage/types.js";

/**
 * Create a mock FileSystemStorage for testing
 */
export function createMockStorage(): Partial<FileSystemStorage> {
	return {
		create: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
			meta: {},
		}),
		retrieve: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
			meta: {},
			files: {},
		}),
		list: vi.fn().mockResolvedValue([]),
		restore: vi.fn().mockResolvedValue({
			success: true,
			restoredFiles: [],
			conflicts: [],
		}),
	};
}
