import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileSystemWatcher } from "../../src/protection/FileSystemWatcher";

// Store event handlers
const eventHandlers = {
	onDelete: [] as Function[],
	onCreate: [] as Function[],
	onChange: [] as Function[],
};

// vscode mock provided by setup.ts
// Mock ProtectedFileRegistry
const mockRegistry = {
	isProtected: vi.fn(),
	remove: vi.fn(),
};

describe("File System Watcher", () => {
	let _fileWatcher: FileSystemWatcher;

	beforeEach(() => {
		// Clear event handlers
		eventHandlers.onDelete = [];
		eventHandlers.onCreate = [];
		eventHandlers.onChange = [];

		// Reset mocks
		vi.clearAllMocks();

		_fileWatcher = new FileSystemWatcher(mockRegistry as any);
	});

	it("removes deleted protected file from registry", () => {
		// Given: File is protected
		vi.mocked(mockRegistry.isProtected).mockReturnValue(true);

		// When: File deleted from disk
		expect(eventHandlers.onDelete.length).toBeGreaterThan(0);
		const deleteHandler = eventHandlers.onDelete[0];
		deleteHandler({ fsPath: "/test/file.ts" });

		// Then: registry.isProtected() returns false
		expect(mockRegistry.remove).toHaveBeenCalledWith("/test/file.ts");

		// Verification: File removed
	});

	it("does not crash on unprotected file deletion", () => {
		// Given: File not protected
		vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

		// When: File deleted
		expect(eventHandlers.onDelete.length).toBeGreaterThan(0);
		const deleteHandler = eventHandlers.onDelete[0];
		deleteHandler({ fsPath: "/test/file.ts" });

		// Then: No error
		expect(mockRegistry.remove).not.toHaveBeenCalled();

		// Verification: Graceful handling
	});

	it("handles file rename", () => {
		// Given: Protected file renamed
		vi.mocked(mockRegistry.isProtected).mockReturnValue(true);

		// When: Rename occurs (file deletion part of rename)
		expect(eventHandlers.onDelete.length).toBeGreaterThan(0);
		const deleteHandler = eventHandlers.onDelete[0];
		deleteHandler({ fsPath: "/test/old-file.ts" });

		// Then: Old path removed from registry
		expect(mockRegistry.remove).toHaveBeenCalledWith("/test/old-file.ts");

		// Verification: Registry updated
	});
});
