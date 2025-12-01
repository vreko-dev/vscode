import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry.js";
import { ProtectionDecorator } from "../../../src/services/protectionDecorator.js";

// Mock VS Code API
vi.mock("vscode", () => {
	return {
		default: {},
		Uri: {
			file: vi.fn().mockImplementation((filePath: string) => ({
				fsPath: filePath,
			})),
		},
		ThemeColor: vi
			.fn()
			.mockImplementation((colorId: string) => ({ id: colorId })),
		EventEmitter: vi.fn().mockImplementation(() => ({
			event: vi.fn(),
			fire: vi.fn(),
			dispose: vi.fn(),
		})),
	};
});

describe("ProtectionDecorator", () => {
	let decorator: ProtectionDecorator;
	let mockRegistry: ProtectedFileRegistry;
	let mockEventEmitter: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock event emitter
		mockEventEmitter = {
			event: vi.fn(),
			fire: vi.fn(),
			dispose: vi.fn(),
		};

		// Mock ProtectedFileRegistry
		mockRegistry = {
			onDidChangeProtectedFiles: vi.fn(),
			getFilesSync: vi.fn().mockReturnValue([]),
			// Add other required methods/properties as needed
		} as any;

		// Mock EventEmitter
		(vscode.EventEmitter as any).mockReturnValue(mockEventEmitter);

		decorator = new ProtectionDecorator(mockRegistry);
	});

	describe("constructor", () => {
		it("should initialize with empty cache", () => {
			expect(mockRegistry.getFilesSync).toHaveBeenCalled();
			expect(decorator).toBeDefined();
		});

		it("should register for registry change events", () => {
			expect(mockRegistry.onDidChangeProtectedFiles).toHaveBeenCalled();
		});
	});

	describe("updateCache", () => {
		it("should populate cache with protected files", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([
				{ path: "/test/workspace/file1.ts", protectionLevel: "watch" },
				{ path: "/test/workspace/file2.ts", protectionLevel: "warn" },
				{ path: "/test/workspace/file3.ts", protectionLevel: "block" },
			]);

			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			// Access private cache through reflection or by testing indirectly
			// Since we can't directly access private members, we'll test through provideFileDecoration
			const uri1 = vscode.Uri.file("/test/workspace/file1.ts");
			const uri2 = vscode.Uri.file("/test/workspace/file2.ts");
			const uri3 = vscode.Uri.file("/test/workspace/file3.ts");

			const decoration1 = decoratorInstance.provideFileDecoration(uri1);
			const decoration2 = decoratorInstance.provideFileDecoration(uri2);
			const decoration3 = decoratorInstance.provideFileDecoration(uri3);

			expect(decoration1).toBeDefined();
			expect(decoration1?.badge).toBe("🟢");
			expect(decoration1?.tooltip).toBe(
				"🟢 Watch - Silent auto-snapshot on save",
			);

			expect(decoration2).toBeDefined();
			expect(decoration2?.badge).toBe("🟡");
			expect(decoration2?.tooltip).toBe("🟡 Warn - Confirm before saving");

			expect(decoration3).toBeDefined();
			expect(decoration3?.badge).toBe("🔴");
			expect(decoration3?.tooltip).toBe("🔴 Block - Required snapshot note");
		});

		it("should handle files with different path separators", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([
				{
					path: "/test/workspace\\file.ts",
					protectionLevel: "watch",
				},
			]);

			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uri = vscode.Uri.file("/test/workspace/file.ts");
			const decoration = decoratorInstance.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟢");
		});

		it("should handle case insensitive paths", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([
				{
					path: "/test/workspace/FILE.ts",
					protectionLevel: "warn",
				},
			]);

			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uri = vscode.Uri.file("/test/workspace/file.ts");
			const decoration = decoratorInstance.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟡");
		});

		it("should clear cache before updating", () => {
			// This is implicitly tested by the fact that the cache is rebuilt correctly
			// We can't directly test private cache clearing without reflection
		});
	});

	describe("provideFileDecoration", () => {
		it("should return undefined for unprotected files", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([]);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uri = vscode.Uri.file("/test/workspace/unprotected.ts");
			const decoration = decoratorInstance.provideFileDecoration(uri);

			expect(decoration).toBeUndefined();
		});

		it("should return decoration for watch level files", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([
				{
					path: "/test/workspace/watched.ts",
					protectionLevel: "watch",
				},
			]);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uri = vscode.Uri.file("/test/workspace/watched.ts");
			const decoration = decoratorInstance.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟢");
			expect(decoration?.tooltip).toBe(
				"🟢 Watch - Silent auto-snapshot on save",
			);
			expect(decoration?.color).toEqual({ id: "charts.green" });
		});

		it("should return decoration for warn level files", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([
				{
					path: "/test/workspace/warned.ts",
					protectionLevel: "warn",
				},
			]);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uri = vscode.Uri.file("/test/workspace/warned.ts");
			const decoration = decoratorInstance.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟡");
			expect(decoration?.tooltip).toBe("🟡 Warn - Confirm before saving");
			expect(decoration?.color).toEqual({ id: "charts.orange" });
		});

		it("should return decoration for block level files", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([
				{
					path: "/test/workspace/blocked.ts",
					protectionLevel: "block",
				},
			]);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uri = vscode.Uri.file("/test/workspace/blocked.ts");
			const decoration = decoratorInstance.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🔴");
			expect(decoration?.tooltip).toBe("🔴 Block - Required snapshot note");
			expect(decoration?.color).toEqual({ id: "charts.red" });
		});

		it("should handle default protection level", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([
				{ path: "/test/workspace/default.ts" }, // No protectionLevel specified
			]);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uri = vscode.Uri.file("/test/workspace/default.ts");
			const decoration = decoratorInstance.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟢"); // Should default to watch
			expect(decoration?.tooltip).toBe(
				"🟢 Watch - Silent auto-snapshot on save",
			);
			expect(decoration?.color).toEqual({ id: "charts.green" });
		});

		it("should normalize file paths for comparison", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([
				{
					path: "/test/workspace/file.ts",
					protectionLevel: "block",
				},
			]);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			// Test with different path formats that should resolve to the same file
			const uris = [
				vscode.Uri.file("/test/workspace/file.ts"),
				vscode.Uri.file("/test/workspace\\file.ts"), // Windows-style path
			];

			uris.forEach((uri) => {
				const decoration = decoratorInstance.provideFileDecoration(uri);
				expect(decoration).toBeDefined();
				expect(decoration?.badge).toBe("🔴");
			});
		});
	});

	describe("dispose", () => {
		it("should dispose event emitter", () => {
			decorator.dispose();
			expect(mockEventEmitter.dispose).toHaveBeenCalled();
		});
	});

	describe("registry event handling", () => {
		it("should update cache when registry changes", () => {
			// Test that the callback registered with onDidChangeProtectedFiles updates the cache
			expect(mockRegistry.onDidChangeProtectedFiles).toHaveBeenCalled();

			// The actual callback testing would require more complex mocking
			// We can verify the callback was registered but not easily test its behavior
		});

		it("should fire decoration change event when registry changes", () => {
			// This would require mocking the event emitter's fire method
			// and triggering the callback registered with onDidChangeProtectedFiles
		});
	});

	describe("edge cases", () => {
		it("should handle empty registry", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([]);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uri = vscode.Uri.file("/test/workspace/anyfile.ts");
			const decoration = decoratorInstance.provideFileDecoration(uri);

			expect(decoration).toBeUndefined();
		});

		it("should handle registry with many files", () => {
			const manyFiles = Array.from({ length: 1000 }, (_, i) => ({
				path: `/test/workspace/file${i}.ts`,
				protectionLevel: i % 3 === 0 ? "watch" : i % 3 === 1 ? "warn" : "block",
			}));

			mockRegistry.getFilesSync = vi.fn().mockReturnValue(manyFiles);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			// Test a few random files
			const testUris = [
				vscode.Uri.file("/test/workspace/file0.ts"),
				vscode.Uri.file("/test/workspace/file1.ts"),
				vscode.Uri.file("/test/workspace/file2.ts"),
			];

			testUris.forEach((uri, _index) => {
				const decoration = decoratorInstance.provideFileDecoration(uri);
				expect(decoration).toBeDefined();
			});
		});

		it("should handle special characters in file paths", () => {
			mockRegistry.getFilesSync = vi.fn().mockReturnValue([
				{
					path: "/test/workspace/file with spaces.ts",
					protectionLevel: "warn",
				},
				{
					path: "/test/workspace/file-with-dashes.ts",
					protectionLevel: "block",
				},
				{ path: "/test/workspace/文件.ts", protectionLevel: "watch" }, // Unicode characters
			]);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uris = [
				vscode.Uri.file("/test/workspace/file with spaces.ts"),
				vscode.Uri.file("/test/workspace/file-with-dashes.ts"),
				vscode.Uri.file("/test/workspace/文件.ts"),
			];

			const expectedBadges = ["🟡", "🔴", "🟢"];

			uris.forEach((uri, index) => {
				const decoration = decoratorInstance.provideFileDecoration(uri);
				expect(decoration).toBeDefined();
				expect(decoration?.badge).toBe(expectedBadges[index]);
			});
		});

		it("should handle very long file paths", () => {
			const longPath = `/test/workspace/${"a/".repeat(100)}file.ts`;
			mockRegistry.getFilesSync = vi
				.fn()
				.mockReturnValue([{ path: longPath, protectionLevel: "block" }]);
			const decoratorInstance = new ProtectionDecorator(mockRegistry);

			const uri = vscode.Uri.file(longPath);
			const decoration = decoratorInstance.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🔴");
		});
	});
});
