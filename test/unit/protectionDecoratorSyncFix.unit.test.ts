import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry";
import { ProtectionDecorator } from "../../src/services/protectionDecorator";

// Mock the VS Code API
vi.mock("vscode", () => {
	return {
		default: {},
		Uri: {
			file: (path: string) => ({ fsPath: path }),
		},
		ThemeColor: class {
			constructor(public id: string) {}
		},
		EventEmitter: class {
			fire() {}
			event = () => {};
			dispose() {}
		},
	};
});

describe("ProtectionDecorator - Sync Cache Fix", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should build cache synchronously in constructor", () => {
		// Arrange
		const mockRegistry = {
			getFilesSync: vi.fn().mockReturnValue([
				{ path: "/test/file1.ts", label: "file1.ts" },
				{ path: "/test/file2.ts", label: "file2.ts" },
			]),
			onDidChangeProtectedFiles: vi.fn().mockImplementation((callback) => {
				// Simulate the event being fired
				setTimeout(callback, 0);
			}),
		} as unknown as ProtectedFileRegistry;

		// Act
		const _decorator = new ProtectionDecorator(mockRegistry);

		// Assert
		expect(mockRegistry.getFilesSync).toHaveBeenCalled();
	});

	it("should provide file decoration synchronously", () => {
		// Arrange
		const mockRegistry = {
			getFilesSync: vi.fn().mockReturnValue([
				{ path: "/test/file1.ts", label: "file1.ts" },
				{ path: "/test/file2.ts", label: "file2.ts" },
			]),
			onDidChangeProtectedFiles: vi.fn(),
		} as unknown as ProtectedFileRegistry;

		const decorator = new ProtectionDecorator(mockRegistry);
		const testUri = { fsPath: "/test/file1.ts" } as vscode.Uri;

		// Act
		const decoration = decorator.provideFileDecoration(testUri);

		// Assert
		expect(decoration).toBeDefined();
		expect(decoration?.badge).toBe("🧢");
		expect(decoration?.tooltip).toBe("Protected by SnapBack (Watched)");
	});

	it("should return undefined for non-protected files", () => {
		// Arrange
		const mockRegistry = {
			getFilesSync: vi
				.fn()
				.mockReturnValue([{ path: "/test/file1.ts", label: "file1.ts" }]),
			onDidChangeProtectedFiles: vi.fn(),
		} as unknown as ProtectedFileRegistry;

		const decorator = new ProtectionDecorator(mockRegistry);
		const testUri = { fsPath: "/test/unprotected.ts" } as vscode.Uri;

		// Act
		const decoration = decorator.provideFileDecoration(testUri);

		// Assert
		expect(decoration).toBeUndefined();
	});

	it("should update cache when protected files change", () => {
		// Arrange
		const mockCallback = vi.fn();
		const mockRegistry = {
			getFilesSync: vi.fn().mockReturnValue([]),
			onDidChangeProtectedFiles: vi.fn().mockImplementation((callback) => {
				mockCallback.mockImplementation(callback);
			}),
		} as unknown as ProtectedFileRegistry;

		const _decorator = new ProtectionDecorator(mockRegistry);

		// Act
		mockCallback(); // Simulate the event being fired

		// Assert
		// The cache should be cleared and rebuilt
		expect(mockRegistry.getFilesSync).toHaveBeenCalledTimes(2);
	});
});
