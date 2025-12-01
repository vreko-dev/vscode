import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { FileHealthDecorationProvider } from "../../../src/decorations/FileHealthDecorationProvider.js";
import type { FileHealthLevel } from "../../../src/decorations/types.js";

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
		propagate: false,
	})),
	ThemeColor: vi.fn().mockImplementation((color) => ({ id: color })),
	EventEmitter: vi.fn().mockImplementation(() => {
		const listeners: Array<
			(data?: vscode.Uri | vscode.Uri[] | undefined) => void
		> = [];
		return {
			event: (fn: (data?: vscode.Uri | vscode.Uri[] | undefined) => void) => {
				listeners.push(fn);
				return {
					dispose: () => {
						/* noop */
					},
				};
			},
			fire: vi
				.fn()
				.mockImplementation((data?: vscode.Uri | vscode.Uri[] | undefined) => {
					listeners.forEach((fn) => {
						fn(data);
					});
				}),
			dispose: vi.fn(),
		};
	}),
}));

describe("FileHealthDecorationProvider", () => {
	let provider: FileHealthDecorationProvider;
	let mockUri: vscode.Uri;

	beforeEach(() => {
		provider = new FileHealthDecorationProvider();
		mockUri = vscode.Uri.file("/test/file.ts");
	});

	describe("construction", () => {
		it("should create instance successfully", () => {
			expect(provider).toBeDefined();
			expect(provider.onDidChangeFileDecorations).toBeDefined();
		});

		it("should implement FileDecorationProvider interface", () => {
			expect(typeof provider.provideFileDecoration).toBe("function");
			expect(typeof provider.onDidChangeFileDecorations).toBe("function");
		});
	});

	describe("provideFileDecoration", () => {
		it("should return undefined for untracked files", () => {
			const decoration = provider.provideFileDecoration(
				mockUri,
				new AbortController().signal,
			);
			expect(decoration).toBeUndefined();
		});

		it("should provide protected decoration after update", () => {
			provider.updateFileHealth(mockUri, "protected", "watch");

			const decoration = provider.provideFileDecoration(
				mockUri,
				new AbortController().signal,
			);
			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🛡");
			// Since we're mocking ThemeColor, we check the id property
			expect(decoration?.color.id).toBe("charts.green");
			expect(decoration?.tooltip).toContain("Protected by SnapBack");
		});

		it("should provide warning decoration", () => {
			provider.updateFileHealth(mockUri, "warning", "warn");

			const decoration = provider.provideFileDecoration(
				mockUri,
				new AbortController().signal,
			);
			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("⚠️");
			expect(decoration?.color.id).toBe("charts.yellow");
			expect(decoration?.tooltip).toContain("Warning detected");
		});

		it("should provide risk decoration", () => {
			provider.updateFileHealth(mockUri, "risk", "block");

			const decoration = provider.provideFileDecoration(
				mockUri,
				new AbortController().signal,
			);
			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🚨");
			expect(decoration?.color.id).toBe("charts.red");
			expect(decoration?.tooltip).toContain("Risk detected");
		});

		it("should include protection level in tooltip when provided", () => {
			provider.updateFileHealth(mockUri, "protected", "watch");

			const decoration = provider.provideFileDecoration(
				mockUri,
				new AbortController().signal,
			);
			expect(decoration?.tooltip).toContain("(watch)");
		});

		it("should work without protection level", () => {
			provider.updateFileHealth(mockUri, "protected");

			const decoration = provider.provideFileDecoration(
				mockUri,
				new AbortController().signal,
			);
			expect(decoration?.tooltip).not.toContain("(");
		});

		it("should not propagate to parent folders", () => {
			provider.updateFileHealth(mockUri, "protected", "watch");

			const decoration = provider.provideFileDecoration(
				mockUri,
				new AbortController().signal,
			);
			expect(decoration?.propagate).toBe(false);
		});
	});

	describe("updateFileHealth", () => {
		it("should update file health status", () => {
			provider.updateFileHealth(mockUri, "protected", "watch");

			const status = provider.getFileHealth(mockUri);
			expect(status).toBeDefined();
			expect(status?.level).toBe("protected");
			expect(status?.protectionLevel).toBe("watch");
		});

		it("should fire onDidChangeFileDecorations event", () => {
			const spy = vi.fn();
			// Subscribe to the event like a real VS Code extension would
			const disposable = provider.onDidChangeFileDecorations(spy);

			provider.updateFileHealth(mockUri, "protected", "watch");

			expect(spy).toHaveBeenCalledWith(mockUri);
			disposable.dispose();
		});

		it("should update lastUpdated timestamp", () => {
			const before = Date.now();
			provider.updateFileHealth(mockUri, "protected", "watch");
			const after = Date.now();

			const status = provider.getFileHealth(mockUri);
			expect(status?.lastUpdated.getTime()).toBeGreaterThanOrEqual(before);
			expect(status?.lastUpdated.getTime()).toBeLessThanOrEqual(after);
		});

		it("should overwrite previous status for same file", () => {
			provider.updateFileHealth(mockUri, "protected", "watch");
			provider.updateFileHealth(mockUri, "warning", "warn");

			const status = provider.getFileHealth(mockUri);
			expect(status?.level).toBe("warning");
			expect(status?.protectionLevel).toBe("warn");
		});

		it("should handle multiple files", () => {
			const uri1 = vscode.Uri.file("/test/file1.ts");
			const uri2 = vscode.Uri.file("/test/file2.ts");

			provider.updateFileHealth(uri1, "protected", "watch");
			provider.updateFileHealth(uri2, "warning", "warn");

			const status1 = provider.getFileHealth(uri1);
			const status2 = provider.getFileHealth(uri2);

			expect(status1?.level).toBe("protected");
			expect(status2?.level).toBe("warning");
		});
	});

	describe("clearFileHealth", () => {
		it("should remove decoration for specific file", () => {
			provider.updateFileHealth(mockUri, "protected", "watch");
			expect(provider.getFileHealth(mockUri)).toBeDefined();

			provider.clearFileHealth(mockUri);
			expect(provider.getFileHealth(mockUri)).toBeUndefined();
		});

		it("should fire onDidChangeFileDecorations event", () => {
			const spy = vi.fn();
			// Subscribe to the event like a real VS Code extension would
			const disposable = provider.onDidChangeFileDecorations(spy);
			provider.updateFileHealth(mockUri, "protected", "watch");

			provider.clearFileHealth(mockUri);

			expect(spy).toHaveBeenCalledWith(mockUri);
			disposable.dispose();
		});

		it("should not affect other files", () => {
			const uri1 = vscode.Uri.file("/test/file1.ts");
			const uri2 = vscode.Uri.file("/test/file2.ts");

			provider.updateFileHealth(uri1, "protected", "watch");
			provider.updateFileHealth(uri2, "warning", "warn");

			provider.clearFileHealth(uri1);

			expect(provider.getFileHealth(uri1)).toBeUndefined();
			expect(provider.getFileHealth(uri2)).toBeDefined();
		});
	});

	describe("clearAll", () => {
		it("should remove all decorations", () => {
			const uri1 = vscode.Uri.file("/test/file1.ts");
			const uri2 = vscode.Uri.file("/test/file2.ts");

			provider.updateFileHealth(uri1, "protected", "watch");
			provider.updateFileHealth(uri2, "warning", "warn");

			provider.clearAll();

			expect(provider.getFileHealth(uri1)).toBeUndefined();
			expect(provider.getFileHealth(uri2)).toBeUndefined();
		});

		it("should fire onDidChangeFileDecorations with undefined", () => {
			const spy = vi.fn();
			// Subscribe to the event like a real VS Code extension would
			const disposable = provider.onDidChangeFileDecorations(spy);
			provider.updateFileHealth(mockUri, "protected", "watch");

			provider.clearAll();

			expect(spy).toHaveBeenCalledWith(undefined);
			disposable.dispose();
		});
	});

	describe("getFileHealth", () => {
		it("should return status for tracked file", () => {
			provider.updateFileHealth(mockUri, "protected", "watch");

			const status = provider.getFileHealth(mockUri);
			expect(status).toBeDefined();
			expect(status?.uri).toBe(mockUri.toString());
			expect(status?.level).toBe("protected");
			expect(status?.protectionLevel).toBe("watch");
		});

		it("should return undefined for untracked file", () => {
			const status = provider.getFileHealth(mockUri);
			expect(status).toBeUndefined();
		});
	});

	describe("dispose", () => {
		it("should clean up resources", () => {
			provider.updateFileHealth(mockUri, "protected", "watch");
			expect(provider.getFileHealth(mockUri)).toBeDefined();

			provider.dispose();

			expect(provider.getFileHealth(mockUri)).toBeUndefined();
		});

		it("should dispose event emitter", () => {
			// We can't easily test this without accessing private properties
			// Just verify that dispose doesn't throw an error
			expect(() => provider.dispose()).not.toThrow();
		});
	});

	describe("performance", () => {
		it("should handle 100 files efficiently", () => {
			const start = performance.now();

			for (let i = 0; i < 100; i++) {
				const uri = vscode.Uri.file(`/test/file${i}.ts`);
				provider.updateFileHealth(uri, "protected" as FileHealthLevel, "watch");
			}

			const end = performance.now();
			const duration = end - start;

			// Should complete within 50ms
			expect(duration).toBeLessThan(50);
		});

		it("should provide decoration quickly", () => {
			provider.updateFileHealth(mockUri, "protected", "watch");

			const start = performance.now();
			const decoration = provider.provideFileDecoration(
				mockUri,
				new AbortController().signal,
			);
			const end = performance.now();

			expect(decoration).toBeDefined();
			// Should complete within 10ms
			expect(end - start).toBeLessThan(10);
		});
	});
});
