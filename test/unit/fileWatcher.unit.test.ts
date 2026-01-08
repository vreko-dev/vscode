import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileSystemWatcher } from "../../src/protection/FileSystemWatcher";
import { logger } from "../../src/utils/logger";
import * as vscode from "vscode";

// Mock logger to verify logging behavior
vi.mock("../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock ProtectedFileRegistry
const mockRegistry = {
	isProtected: vi.fn(),
	remove: vi.fn(),
};

describe("File System Watcher", () => {
	let _fileWatcher: FileSystemWatcher;
	let mockWatcherCallbacks: {
		onDelete: ((uri: { fsPath: string }) => void) | null;
		onCreate: ((uri: { fsPath: string }) => void) | null;
		onChange: ((uri: { fsPath: string }) => void) | null;
	};

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();
		vi.mocked(logger.info).mockClear();

		// Capture event handler callbacks
		mockWatcherCallbacks = {
			onDelete: null,
			onCreate: null,
			onChange: null,
		};

		// Mock createFileSystemWatcher to capture callbacks
		vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue({
			onDidDelete: vi.fn((callback) => {
				mockWatcherCallbacks.onDelete = callback;
				return { dispose: vi.fn() };
			}),
			onDidCreate: vi.fn((callback) => {
				mockWatcherCallbacks.onCreate = callback;
				return { dispose: vi.fn() };
			}),
			onDidChange: vi.fn((callback) => {
				mockWatcherCallbacks.onChange = callback;
				return { dispose: vi.fn() };
			}),
			dispose: vi.fn(),
		} as any);

		_fileWatcher = new FileSystemWatcher(mockRegistry as any);
	});

	it("removes deleted protected file from registry", () => {
		// Given: File is protected
		vi.mocked(mockRegistry.isProtected).mockReturnValue(true);

		// When: File deleted from disk
		expect(mockWatcherCallbacks.onDelete).not.toBeNull();
		mockWatcherCallbacks.onDelete?.({ fsPath: "/test/file.ts" });

		// Then: File removed from registry
		expect(mockRegistry.remove).toHaveBeenCalledWith("/test/file.ts");
	});

	it("does not crash on unprotected file deletion", () => {
		// Given: File not protected
		vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

		// When: File deleted
		expect(mockWatcherCallbacks.onDelete).not.toBeNull();
		mockWatcherCallbacks.onDelete?.({ fsPath: "/test/file.ts" });

		// Then: No error, registry not called
		expect(mockRegistry.remove).not.toHaveBeenCalled();
	});

	it("handles file rename", () => {
		// Given: Protected file renamed
		vi.mocked(mockRegistry.isProtected).mockReturnValue(true);

		// When: Rename occurs (file deletion part of rename)
		expect(mockWatcherCallbacks.onDelete).not.toBeNull();
		mockWatcherCallbacks.onDelete?.({ fsPath: "/test/old-file.ts" });

		// Then: Old path removed from registry
		expect(mockRegistry.remove).toHaveBeenCalledWith("/test/old-file.ts");
	});

	// REGRESSION TEST: Prevent logging noise from internal files
	describe("Internal File Filtering (Regression Prevention)", () => {
		it("should NOT log changes to .git files", () => {
			// Given: .git file changed
			vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

			// When: .git/FETCH_HEAD is modified
			expect(mockWatcherCallbacks.onChange).not.toBeNull();
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/.git/FETCH_HEAD" });
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/.git/config" });
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/.git/index" });

			// Then: No logging occurred
			expect(logger.info).not.toHaveBeenCalled();
			expect(mockRegistry.isProtected).not.toHaveBeenCalled();
		});

		it("should NOT log changes to .snapback internal files", () => {
			// Given: .snapback internal file changed
			vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

			// When: .snapback/ctx/context.json is modified
			expect(mockWatcherCallbacks.onChange).not.toBeNull();
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/.snapback/ctx/context.json" });
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/.snapback/snapshots/snap_123.json" });

			// Then: No logging occurred
			expect(logger.info).not.toHaveBeenCalled();
			expect(mockRegistry.isProtected).not.toHaveBeenCalled();
		});

		it("should NOT log changes to node_modules", () => {
			// Given: node_modules file changed
			vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

			// When: node_modules file is modified
			expect(mockWatcherCallbacks.onChange).not.toBeNull();
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/node_modules/package/index.js" });

			// Then: No logging occurred
			expect(logger.info).not.toHaveBeenCalled();
		});

		it("should NOT log changes to dist/build directories", () => {
			// Given: build output file changed
			vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

			// When: dist/build files are modified
			expect(mockWatcherCallbacks.onChange).not.toBeNull();
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/dist/bundle.js" });
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/build/output.js" });

			// Then: No logging occurred
			expect(logger.info).not.toHaveBeenCalled();
		});

		it("should NOT log changes to .vscode directory", () => {
			// Given: .vscode config changed
			vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

			// When: .vscode settings are modified
			expect(mockWatcherCallbacks.onChange).not.toBeNull();
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/.vscode/settings.json" });

			// Then: No logging occurred
			expect(logger.info).not.toHaveBeenCalled();
		});

		it("should NOT log changes to .log files", () => {
			// Given: log file changed
			vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

			// When: log files are modified
			expect(mockWatcherCallbacks.onChange).not.toBeNull();
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/debug.log" });
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/logs/app.log" });

			// Then: No logging occurred
			expect(logger.info).not.toHaveBeenCalled();
		});

		it("should NOT log changes to .lock files", () => {
			// Given: lock file changed
			vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

			// When: lock files are modified
			expect(mockWatcherCallbacks.onChange).not.toBeNull();
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/package-lock.json" });
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/yarn.lock" });

			// Then: No logging occurred
			expect(logger.info).not.toHaveBeenCalled();
		});

		it("SHOULD log changes to protected user files", () => {
			// Given: User source file is protected
			vi.mocked(mockRegistry.isProtected).mockReturnValue(true);

			// When: User file is modified
			expect(mockWatcherCallbacks.onChange).not.toBeNull();
			mockWatcherCallbacks.onChange?.({ fsPath: "/project/src/index.ts" });

			// Then: Logging occurred
			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining("Protected file changed"),
			);
			expect(mockRegistry.isProtected).toHaveBeenCalledWith("/project/src/index.ts");
		});

		it("should NOT log creation of .git files", () => {
			// Given: .git file created
			vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

			// When: .git/config is created
			expect(mockWatcherCallbacks.onCreate).not.toBeNull();
			mockWatcherCallbacks.onCreate?.({ fsPath: "/project/.git/config" });

			// Then: No logging occurred
			expect(logger.info).not.toHaveBeenCalled();
		});

		it("should handle deletion of internal files silently", () => {
			// Given: .snapback file deleted
			vi.mocked(mockRegistry.isProtected).mockReturnValue(false);

			// When: .snapback file is deleted
			expect(mockWatcherCallbacks.onDelete).not.toBeNull();
			mockWatcherCallbacks.onDelete?.({ fsPath: "/project/.snapback/temp/file.json" });

			// Then: No logging or registry operations
			expect(logger.info).not.toHaveBeenCalled();
			expect(mockRegistry.remove).not.toHaveBeenCalled();
		});
	});
});
