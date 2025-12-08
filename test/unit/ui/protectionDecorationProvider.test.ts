import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProtectionDecorationProvider } from "@vscode/ui/ProtectionDecorationProvider";

// Mock VS Code APIs
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		showQuickPick: vi.fn(),
		withProgress: vi
			.fn()
			.mockImplementation((_options, task) => task({ report: vi.fn() })),
		createStatusBarItem: vi.fn().mockReturnValue({
			text: "",
			tooltip: "",
			command: "",
			show: vi.fn(),
			dispose: vi.fn(),
		}),
	},
	commands: {
		registerCommand: vi.fn(),
		executeCommand: vi.fn(),
	},
	Uri: {
		file: vi.fn().mockImplementation((path) => ({
			fsPath: path,
			toString: () => `file://${path}`,
		})),
	},
	FileDecoration: vi.fn().mockImplementation((badge, tooltip, color) => ({
		badge,
		tooltip,
		color,
	})),
	ThemeColor: vi.fn().mockImplementation((color) => ({ id: color })),
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
}));

describe("ProtectionDecorationProvider", () => {
	let provider: ProtectionDecorationProvider;
	let mockRegistry: any;
	let mockOnProtectionChanged: any;

	beforeEach(() => {
		// Create mock registry with isProtected and getProtectionLevel methods
		mockOnProtectionChanged = {
			dispose: vi.fn(),
		};

		mockRegistry = {
			isProtected: vi.fn().mockReturnValue(false),
			getProtectionLevel: vi.fn().mockReturnValue("watch"),
			onProtectionChanged: vi.fn().mockImplementation((callback) => {
				mockOnProtectionChanged.callback = callback;
				return mockOnProtectionChanged;
			}),
		};

		provider = new ProtectionDecorationProvider(mockRegistry as any);
	});

	afterEach(() => {
		vi.clearAllMocks();
		if (provider) {
			provider.dispose();
		}
	});

	describe("constructor", () => {
		it("should register for protection change events", () => {
			expect(mockRegistry.onProtectionChanged).toHaveBeenCalled();
		});

		it("should set up event emitter for decoration changes", () => {
			expect(provider.onDidChangeFileDecorations).toBeDefined();
		});
	});

	describe("provideFileDecoration", () => {
		it("should return undefined for non-protected files", () => {
			mockRegistry.isProtected.mockReturnValue(false);

			const uri = vscode.Uri.file("/test/file.ts");
			const decoration = provider.provideFileDecoration(uri);

			expect(decoration).toBeUndefined();
		});

		it("should return decoration for protected files with watch level", () => {
			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("watch");

			const uri = vscode.Uri.file("/test/protected.ts");
			const decoration = provider.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟢");
			expect(decoration?.tooltip).toBe("Protected by SnapBack (Watch)");
			expect(decoration?.color).toEqual({ id: "charts.green" });
		});

		it("should return decoration for protected files with warn level", () => {
			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("warn");

			const uri = vscode.Uri.file("/test/warned.ts");
			const decoration = provider.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟡");
			expect(decoration?.tooltip).toBe("Protected by SnapBack (Warn)");
			expect(decoration?.color).toEqual({ id: "charts.orange" });
		});

		it("should return decoration for protected files with block level", () => {
			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue("block");

			const uri = vscode.Uri.file("/test/blocked.ts");
			const decoration = provider.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🔴");
			expect(decoration?.tooltip).toBe("Protected by SnapBack (Block)");
			expect(decoration?.color).toEqual({ id: "charts.red" });
		});

		it("should default to watch level when protection level is not set", () => {
			mockRegistry.isProtected.mockReturnValue(true);
			mockRegistry.getProtectionLevel.mockReturnValue(undefined);

			const uri = vscode.Uri.file("/test/default.ts");
			const decoration = provider.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟢");
			expect(decoration?.tooltip).toBe("Protected by SnapBack (Watch)");
		});

		it("should handle files with special characters in path", () => {
			mockRegistry.isProtected.mockReturnValue(true);

			const uri = vscode.Uri.file("/test/file with spaces & special@chars.ts");
			const decoration = provider.provideFileDecoration(uri);

			expect(decoration).toBeDefined();
		});
	});

	describe("debounceDecorationUpdate", () => {
		it("should debounce multiple decoration updates", async () => {
			const mockEmitter = {
				fire: vi.fn(),
				dispose: vi.fn(),
			};

			// @ts-expect-error - accessing private property for testing
			provider._onDidChangeFileDecorations = mockEmitter;

			const uri1 = vscode.Uri.file("/test/file1.ts");
			const uri2 = vscode.Uri.file("/test/file2.ts");

			// @ts-expect-error - accessing private method for testing
			provider.debounceDecorationUpdate([uri1]);
			// @ts-expect-error - accessing private method for testing
			provider.debounceDecorationUpdate([uri2]);

			// Wait for debounce timer
			await new Promise((resolve) => setTimeout(resolve, 250));

			expect(mockEmitter.fire).toHaveBeenCalledWith([uri1, uri2]);
		});

		it("should handle rapid successive updates", async () => {
			const mockEmitter = {
				fire: vi.fn(),
				dispose: vi.fn(),
			};

			// @ts-expect-error - accessing private property for testing
			provider._onDidChangeFileDecorations = mockEmitter;

			const uris = Array.from({ length: 10 }, (_, i) =>
				vscode.Uri.file(`/test/file${i}.ts`),
			);

			// Rapid fire updates
			uris.forEach((uri) => {
				// @ts-expect-error - accessing private method for testing
				provider.debounceDecorationUpdate([uri]);
			});

			// Wait for debounce timer
			await new Promise((resolve) => setTimeout(resolve, 250));

			expect(mockEmitter.fire).toHaveBeenCalledWith(uris);
		});
	});

	describe("onProtectionChanged event handling", () => {
		it("should register callback and handle events", () => {
			expect(mockRegistry.onProtectionChanged).toHaveBeenCalled();
			expect(typeof mockOnProtectionChanged.callback).toBe("function");
		});

		it("should trigger decoration updates when protection changes", async () => {
			const mockEmitter = {
				fire: vi.fn(),
				dispose: vi.fn(),
			};

			// @ts-expect-error - accessing private property for testing
			provider._onDidChangeFileDecorations = mockEmitter;

			const uri = vscode.Uri.file("/test/changed.ts");
			mockOnProtectionChanged.callback([uri]);

			// Wait for debounce timer
			await new Promise((resolve) => setTimeout(resolve, 250));

			expect(mockEmitter.fire).toHaveBeenCalledWith([uri]);
		});
	});

	describe("dispose", () => {
		it("should clear debounce timer and dispose event emitter", () => {
			// Set up a pending debounce timer
			const mockEmitter = {
				fire: vi.fn(),
				dispose: vi.fn(),
			};

			// @ts-expect-error - accessing private property for testing
			provider._onDidChangeFileDecorations = mockEmitter;

			const uri = vscode.Uri.file("/test/file.ts");
			// @ts-expect-error - accessing private method for testing
			provider.debounceDecorationUpdate([uri]);

			// Verify timer is set
			// @ts-expect-error - accessing private property for testing
			expect(provider.debounceTimer).toBeDefined();

			// Dispose
			provider.dispose();

			// @ts-expect-error - accessing private property for testing
			expect(provider.debounceTimer).toBeUndefined();
			expect(mockEmitter.dispose).toHaveBeenCalled();
		});

		it("should handle dispose when no timer is active", () => {
			const mockEmitter = {
				fire: vi.fn(),
				dispose: vi.fn(),
			};

			// @ts-expect-error - accessing private property for testing
			provider._onDidChangeFileDecorations = mockEmitter;

			// @ts-expect-error - accessing private property for testing
			provider.debounceTimer = undefined;

			expect(() => provider.dispose()).not.toThrow();
			expect(mockEmitter.dispose).toHaveBeenCalled();
		});
	});

	describe("edge cases", () => {
		it("should handle empty URI array in debounce update", async () => {
			const mockEmitter = {
				fire: vi.fn(),
				dispose: vi.fn(),
			};

			// @ts-expect-error - accessing private property for testing
			provider._onDidChangeFileDecorations = mockEmitter;

			// @ts-expect-error - accessing private method for testing
			provider.debounceDecorationUpdate([]);

			// Wait for debounce timer
			await new Promise((resolve) => setTimeout(resolve, 250));

			// Should not fire for empty array
			expect(mockEmitter.fire).not.toHaveBeenCalled();
		});

		it("should handle multiple dispose calls", () => {
			const mockEmitter = {
				fire: vi.fn(),
				dispose: vi.fn(),
			};

			// @ts-expect-error - accessing private property for testing
			provider._onDidChangeFileDecorations = mockEmitter;

			expect(() => {
				provider.dispose();
				provider.dispose();
			}).not.toThrow();

			expect(mockEmitter.dispose).toHaveBeenCalledTimes(1);
		});

		it("should handle registry errors gracefully", () => {
			mockRegistry.isProtected.mockImplementation(() => {
				throw new Error("Registry error");
			});

			const uri = vscode.Uri.file("/test/error.ts");

			expect(() => provider.provideFileDecoration(uri)).not.toThrow();
			const decoration = provider.provideFileDecoration(uri);
			expect(decoration).toBeUndefined();
		});
	});
});
