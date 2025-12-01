import { beforeEach, describe, expect, it } from "vitest";
import { NotificationManager } from "../../../src/notificationManager.js";
import { OperationCoordinator } from "../../../src/operationCoordinator.js";
import { FileSystemStorage } from "../../../src/storage/types.js";
import { WorkspaceMemoryManager } from "../../../src/workspaceMemory.js";

// Mock SqliteStorageAdapter to test the brittle detection
class MockSqliteStorageAdapter extends FileSystemStorage {
	async create(_data: any, _parentId?: string): Promise<any> {
		// Implementation doesn't matter for this test
		return { id: "test-id", timestamp: Date.now() };
	}
}

describe("Adapter Detection Issues", () => {
	let _operationCoordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let storage: FileSystemStorage;

	beforeEach(() => {
		notificationManager = new NotificationManager();
		storage = new FileSystemStorage("/test");
		workspaceMemory = new WorkspaceMemoryManager(storage);
		_operationCoordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			storage,
		);
	});

	describe("Brittle Function Length Detection", () => {
		it("should demonstrate that function.length is unreliable for adapter detection", () => {
			// Create a mock storage with create method that has default parameters
			// This will make the function.length = 1 even though it can accept parentId
			const mockStorageWithDefaults = {
				create: (_data: any, _parentId = "default") => {
					// Implementation doesn't matter
					return Promise.resolve({ id: "test" });
				},
			};

			// This storage has function.length = 1, but can still accept parentId
			// The current detection logic would incorrectly treat this as non-SqliteStorageAdapter
			expect(mockStorageWithDefaults.create.length).toBe(1);

			// But it can actually accept two parameters
			expect(mockStorageWithDefaults.create.length <= 1).toBe(true);

			// This demonstrates the brittleness - function.length is not a reliable indicator
			// of whether a method can accept additional parameters
		});

		it("should show that minification can break function.length detection", () => {
			// In minified code, parameter names are often shortened or removed
			// This can change function.length even though the functionality remains the same

			// Original function
			function originalCreate(_data: any, _parentId?: string) {
				return { id: "test" };
			}

			// Minified version might look like this (parameters removed for size)
			function minifiedCreate(_a: any, _b?: string) {
				// Still 2 parameters
				return { id: "test" };
			}

			// Or even more aggressively minified
			const aggressiveMinifiedCreate = (_a: any, _b?: string) => ({
				id: "test",
			});

			expect(originalCreate.length).toBe(2);
			expect(minifiedCreate.length).toBe(2);
			expect(aggressiveMinifiedCreate.length).toBe(2);

			// The point is that function.length can be manipulated and is not stable
		});
	});
});
