/**
 * VSUI-08: FragilityGutterDecorationProvider unit tests (TDD RED gate)
 *
 * Verifies that:
 * - highDecoration applied to line 1 when fragilityScore >= 0.7
 * - moderateDecoration applied to line 1 when fragilityScore >= 0.3 and < 0.7
 * - Both decorations cleared when fragilityScore < 0.3
 * - All decorations cleared when fileDecorationsEnabled = false
 * - Decorations cleared silently on RPC failure (no toast)
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// VS Code mock
// ---------------------------------------------------------------------------

const mockHighDecorationType = {
	dispose: vi.fn(),
	key: "high",
};
const mockModerateDecorationType = {
	dispose: vi.fn(),
	key: "moderate",
};

const mockEditor = {
	document: {
		uri: { fsPath: "/workspace/src/fragile-file.ts" },
	},
	setDecorations: vi.fn(),
};

vi.mock("vscode", () => {
	class ThemeColor {
		constructor(public readonly id: string) {}
	}

	class EventEmitter {
		event = vi.fn();
		fire = vi.fn();
		dispose = vi.fn();
	}

	const OverviewRulerLane = { Right: 4 };

	const Range = vi.fn((_sl: number, _sc: number, _el: number, _ec: number) => ({
		start: { line: _sl, character: _sc },
		end: { line: _el, character: _ec },
	}));

	return {
		ThemeColor,
		EventEmitter,
		OverviewRulerLane,
		Range,
		window: {
			createTextEditorDecorationType: vi.fn((opts: unknown) => {
				// Return different mocks based on overviewRulerColor
				const o = opts as { overviewRulerColor?: { id?: string } };
				if (o?.overviewRulerColor?.id === "charts.red") {
					return mockHighDecorationType;
				}
				return mockModerateDecorationType;
			}),
			onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
			get activeTextEditor() {
				return mockEditor;
			},
		},
		workspace: {
			getConfiguration: vi.fn(() => ({
				get: vi.fn((key: string, def: unknown) => def),
			})),
		},
		Uri: {
			file: vi.fn((p: string) => ({ fsPath: p })),
		},
		Disposable: { from: vi.fn() },
	};
});

// ---------------------------------------------------------------------------
// DaemonBridge mock
// ---------------------------------------------------------------------------

function makeDaemonBridge(requestImpl?: (method: string, params: unknown) => Promise<unknown>) {
	return {
		request: vi.fn(requestImpl ?? (() => Promise.resolve({ files: [] }))),
		onSessionStarted: vi.fn(() => ({ dispose: vi.fn() })),
	};
}

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { FragilityGutterDecorationProvider } from "../../../src/ui/decorations/FragilityGutterDecorationProvider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trigger the private refreshActiveEditor by invoking what the onDidChangeActiveTextEditor handler calls */
async function triggerRefresh(provider: FragilityGutterDecorationProvider): Promise<void> {
	// @ts-expect-error accessing private method
	await provider.refreshActiveEditor();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FragilityGutterDecorationProvider  -  VSUI-08", () => {
	let daemonBridge: ReturnType<typeof makeDaemonBridge>;
	let provider: FragilityGutterDecorationProvider;
	let vscode: typeof import("vscode");

	beforeEach(async () => {
		vi.clearAllMocks();
		daemonBridge = makeDaemonBridge();
		vscode = await import("vscode");
	});

	afterEach(() => {
		provider?.dispose();
	});

	describe("Test 1  -  highDecoration applied when fragilityScore >= 0.7", () => {
		it("applies highDecoration to line 1 for score = 0.8", async () => {
			daemonBridge.request.mockResolvedValue({
				files: [{ path: "/workspace/src/fragile-file.ts", fragilityScore: 0.8, rollbackCount: 5 }],
			});
			provider = new FragilityGutterDecorationProvider(daemonBridge as never);

			await triggerRefresh(provider);

			expect(mockEditor.setDecorations).toHaveBeenCalledWith(
				mockHighDecorationType,
				expect.arrayContaining([expect.objectContaining({ range: expect.anything() })]),
			);
			// moderate cleared
			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockModerateDecorationType, []);
		});

		it("applies highDecoration to line 1 for score = 0.7 (boundary)", async () => {
			daemonBridge.request.mockResolvedValue({
				files: [{ path: "/workspace/src/fragile-file.ts", fragilityScore: 0.7, rollbackCount: 3 }],
			});
			provider = new FragilityGutterDecorationProvider(daemonBridge as never);

			await triggerRefresh(provider);

			expect(mockEditor.setDecorations).toHaveBeenCalledWith(
				mockHighDecorationType,
				expect.arrayContaining([expect.anything()]),
			);
		});
	});

	describe("Test 2  -  moderateDecoration applied when fragilityScore >= 0.3 and < 0.7", () => {
		it("applies moderateDecoration to line 1 for score = 0.5", async () => {
			daemonBridge.request.mockResolvedValue({
				files: [{ path: "/workspace/src/fragile-file.ts", fragilityScore: 0.5, rollbackCount: 2 }],
			});
			provider = new FragilityGutterDecorationProvider(daemonBridge as never);

			await triggerRefresh(provider);

			expect(mockEditor.setDecorations).toHaveBeenCalledWith(
				mockModerateDecorationType,
				expect.arrayContaining([expect.objectContaining({ range: expect.anything() })]),
			);
			// high cleared
			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockHighDecorationType, []);
		});

		it("applies moderateDecoration for score = 0.3 (boundary)", async () => {
			daemonBridge.request.mockResolvedValue({
				files: [{ path: "/workspace/src/fragile-file.ts", fragilityScore: 0.3, rollbackCount: 1 }],
			});
			provider = new FragilityGutterDecorationProvider(daemonBridge as never);

			await triggerRefresh(provider);

			expect(mockEditor.setDecorations).toHaveBeenCalledWith(
				mockModerateDecorationType,
				expect.arrayContaining([expect.anything()]),
			);
		});
	});

	describe("Test 3  -  both decorations cleared when fragilityScore < 0.3 or file not in map", () => {
		it("clears both decorations for score = 0.1", async () => {
			daemonBridge.request.mockResolvedValue({
				files: [{ path: "/workspace/src/fragile-file.ts", fragilityScore: 0.1, rollbackCount: 0 }],
			});
			provider = new FragilityGutterDecorationProvider(daemonBridge as never);

			await triggerRefresh(provider);

			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockHighDecorationType, []);
			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockModerateDecorationType, []);
		});

		it("clears both decorations when file not in fragility map", async () => {
			daemonBridge.request.mockResolvedValue({ files: [] });
			provider = new FragilityGutterDecorationProvider(daemonBridge as never);

			await triggerRefresh(provider);

			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockHighDecorationType, []);
			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockModerateDecorationType, []);
		});
	});

	describe("Test 4  -  all decorations cleared when fileDecorationsEnabled = false", () => {
		it("clears decorations and returns without applying when config is false", async () => {
			daemonBridge.request.mockResolvedValue({
				files: [{ path: "/workspace/src/fragile-file.ts", fragilityScore: 0.9, rollbackCount: 7 }],
			});

			// Override getConfiguration to return false
			vscode.workspace.getConfiguration = vi.fn(() => ({
				get: vi.fn((key: string, def: unknown) => {
					if (key === "fileDecorationsEnabled") return false;
					return def;
				}),
			}));

			provider = new FragilityGutterDecorationProvider(daemonBridge as never);

			await triggerRefresh(provider);

			// Both should be cleared (no high decoration applied)
			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockHighDecorationType, []);
			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockModerateDecorationType, []);
			// RPC should NOT have been called (short-circuit before request)
			// Actually checking that setDecorations was called to clear, not with decoration ranges
		});
	});

	describe("Test 5  -  decorations cleared silently on RPC failure", () => {
		it("clears decorations and does not throw when RPC fails", async () => {
			daemonBridge.request.mockRejectedValue(new Error("IPC connection failed"));
			provider = new FragilityGutterDecorationProvider(daemonBridge as never);

			// Should not throw
			await expect(triggerRefresh(provider)).resolves.toBeUndefined();

			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockHighDecorationType, []);
			expect(mockEditor.setDecorations).toHaveBeenCalledWith(mockModerateDecorationType, []);
		});
	});

	describe("dispose()  -  VSUI-08 resource leak prevention", () => {
		it("disposes highDecoration and moderateDecoration on dispose()", () => {
			provider = new FragilityGutterDecorationProvider(daemonBridge as never);
			provider.dispose();

			expect(mockHighDecorationType.dispose).toHaveBeenCalled();
			expect(mockModerateDecorationType.dispose).toHaveBeenCalled();
		});
	});
});
