/**
 * FileSystemWatcher Daemon Notification Tests
 *
 * SB-284: Tests for the wiring fix that ensures external file changes
 * (e.g., from Claude Code Edit tool) notify the daemon for session tracking.
 *
 * This was a critical gap - FileSystemWatcher detected changes but only logged them,
 * never notifying the daemon. This caused session tracking to miss files modified
 * by external tools.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode module
const mockOnDidDelete = vi.fn();
const mockOnDidCreate = vi.fn();
const mockOnDidChange = vi.fn();
const mockDispose = vi.fn();

vi.mock("vscode", () => ({
	workspace: {
		createFileSystemWatcher: vi.fn(() => ({
			onDidDelete: mockOnDidDelete,
			onDidCreate: mockOnDidCreate,
			onDidChange: mockOnDidChange,
			dispose: mockDispose,
		})),
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
	Uri: {
		file: (path: string) => ({ fsPath: path }),
	},
}));

// Mock IntelligenceService - the key function we're testing gets called
const mockRecordFileModification = vi.fn(() => Promise.resolve());
vi.mock("../../../src/services/IntelligenceService", () => ({
	recordFileModification: mockRecordFileModification,
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock ProtectedFileRegistry
const mockRegistry = {
	isProtected: vi.fn(() => true),
	remove: vi.fn(),
};

describe("FileSystemWatcher Daemon Notification (SB-284)", () => {
	let FileSystemWatcher: typeof import("../../../src/protection/FileSystemWatcher").FileSystemWatcher;
	let deleteHandler: (uri: { fsPath: string }) => void;
	let createHandler: (uri: { fsPath: string }) => void;
	let changeHandler: (uri: { fsPath: string }) => void;

	beforeEach(async () => {
		vi.clearAllMocks();

		// Capture the event handlers when FileSystemWatcher registers them
		mockOnDidDelete.mockImplementation((handler) => {
			deleteHandler = handler;
			return { dispose: vi.fn() };
		});
		mockOnDidCreate.mockImplementation((handler) => {
			createHandler = handler;
			return { dispose: vi.fn() };
		});
		mockOnDidChange.mockImplementation((handler) => {
			changeHandler = handler;
			return { dispose: vi.fn() };
		});

		// Import fresh module
		const module = await import("../../../src/protection/FileSystemWatcher");
		FileSystemWatcher = module.FileSystemWatcher;

		// Create instance to register handlers
		new FileSystemWatcher(mockRegistry as any);
	});

	afterEach(() => {
		vi.resetModules();
	});

	describe("onDidChange - External File Modifications", () => {
		it("should notify daemon when source file changes externally", async () => {
			const testUri = { fsPath: "/test/workspace/src/component.ts" };

			changeHandler(testUri);

			expect(mockRecordFileModification).toHaveBeenCalledWith(
				"/test/workspace/src/component.ts",
				"update",
			);
		});

		it("should notify daemon even for non-protected files", async () => {
			mockRegistry.isProtected.mockReturnValueOnce(false);
			const testUri = { fsPath: "/test/workspace/src/utils.ts" };

			changeHandler(testUri);

			// Should still call recordFileModification for session tracking
			expect(mockRecordFileModification).toHaveBeenCalledWith(
				"/test/workspace/src/utils.ts",
				"update",
			);
		});

		it("should NOT notify daemon for ignored paths", async () => {
			// Paths matching ignore patterns: /.git/, /node_modules/, /.vreko/,
			// /dist/, /build/, /.vscode/, *.log, *.lock
			const ignoredPaths = [
				"/test/workspace/.git/objects/abc",
				"/test/workspace/node_modules/lodash/index.js",
				"/test/workspace/.vreko/session.json",
				"/test/workspace/dist/bundle.js",
				"/test/workspace/build/output.js",
				"/test/workspace/.vscode/settings.json",
				"/test/workspace/debug.log",         // ends with .log
				"/test/workspace/yarn.lock",          // ends with .lock
			];

			for (const path of ignoredPaths) {
				changeHandler({ fsPath: path });
			}

			expect(mockRecordFileModification).not.toHaveBeenCalled();
		});
	});

	describe("onDidCreate - New File Detection", () => {
		it("should notify daemon when new file is created", async () => {
			const testUri = { fsPath: "/test/workspace/src/newFile.ts" };

			createHandler(testUri);

			expect(mockRecordFileModification).toHaveBeenCalledWith(
				"/test/workspace/src/newFile.ts",
				"create",
			);
		});
	});

	describe("onDidDelete - File Deletion Tracking", () => {
		it("should notify daemon when file is deleted", async () => {
			const testUri = { fsPath: "/test/workspace/src/oldFile.ts" };

			deleteHandler(testUri);

			expect(mockRecordFileModification).toHaveBeenCalledWith(
				"/test/workspace/src/oldFile.ts",
				"delete",
			);
		});

		it("should also update registry for protected files", async () => {
			mockRegistry.isProtected.mockReturnValueOnce(true);
			const testUri = { fsPath: "/test/workspace/src/protected.ts" };

			deleteHandler(testUri);

			expect(mockRegistry.remove).toHaveBeenCalledWith("/test/workspace/src/protected.ts");
			expect(mockRecordFileModification).toHaveBeenCalledWith(
				"/test/workspace/src/protected.ts",
				"delete",
			);
		});
	});

	describe("Integration with Claude Code Edit Tool", () => {
		it("should track rapid sequential file changes (AI burst pattern)", async () => {
			const files = [
				"/test/workspace/src/auth.ts",
				"/test/workspace/src/config.ts",
				"/test/workspace/src/utils.ts",
			];

			// Simulate rapid changes from Claude Code Edit tool
			for (const file of files) {
				changeHandler({ fsPath: file });
			}

			expect(mockRecordFileModification).toHaveBeenCalledTimes(3);
			expect(mockRecordFileModification).toHaveBeenNthCalledWith(1, files[0], "update");
			expect(mockRecordFileModification).toHaveBeenNthCalledWith(2, files[1], "update");
			expect(mockRecordFileModification).toHaveBeenNthCalledWith(3, files[2], "update");
		});
	});
});
