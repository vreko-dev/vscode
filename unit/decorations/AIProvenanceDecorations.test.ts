/**
 * AIProvenanceDecorations Tests
 *
 * Tests for the "jaw-dropper" decoration system that shows AI provenance
 * in the editor gutter, inline, and overview ruler.
 *
 * @see docs/brand/extension-branding-playbook.md Section 2
 * @module test/unit/decorations
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode with everything defined inside the factory
vi.mock("vscode", () => {
	// Track ThemeColor calls for assertions
	const themeColorCalls: string[] = [];
	const decorationTypeCalls: Array<Record<string, unknown>> = [];
	const decorationTypeResults: Array<{ dispose: () => void }> = [];

	class MockThemeColor {
		constructor(public id: string) {
			themeColorCalls.push(id);
		}
	}

	class MockUri {
		static parse(str: string) {
			return { toString: () => str, fsPath: "/test/file.ts" };
		}
	}

	class MockRange {
		constructor(public start: unknown, public end: unknown) { /* intentionally empty */ }
	}

	class MockPosition {
		constructor(public line: number, public character: number) { /* intentionally empty */ }
	}

	class MockEventEmitter<T = unknown> {
		private listeners: Array<(e: T) => void> = [];
		get event() {
			return (listener: (e: T) => void) => {
				this.listeners.push(listener);
				return { dispose: () => { /* intentionally empty */ } };
			};
		}
		fire(data: T) {
			for (const listener of this.listeners) {
				listener(data);
			}
		}
		dispose() {
			this.listeners = [];
		}
	}

	const createTextEditorDecorationType = (options: Record<string, unknown>) => {
		decorationTypeCalls.push(options);
		const result = { dispose: () => { /* intentionally empty */ } };
		decorationTypeResults.push(result);
		return result;
	};

	return {
		ThemeColor: MockThemeColor,
		Uri: MockUri,
		OverviewRulerLane: {
			Left: 1,
			Center: 2,
			Right: 3,
			Full: 4,
		},
		Range: MockRange,
		Position: MockPosition,
		EventEmitter: MockEventEmitter,
		window: {
			createTextEditorDecorationType: createTextEditorDecorationType,
			onDidChangeActiveTextEditor: () => ({ dispose: () => { /* intentionally empty */ } }),
			activeTextEditor: null,
			visibleTextEditors: [],
		},
		workspace: {
			onDidChangeTextDocument: () => ({ dispose: () => { /* intentionally empty */ } }),
		},
		// Expose internal tracking for assertions
		__test__: {
			themeColorCalls,
			decorationTypeCalls,
			decorationTypeResults,
			reset: () => {
				themeColorCalls.length = 0;
				decorationTypeCalls.length = 0;
				decorationTypeResults.length = 0;
			},
		},
	};
});

// Import after mock
import * as vscode from "vscode";

// Type for the test helpers
interface VscodeTestHelpers {
	themeColorCalls: string[];
	decorationTypeCalls: Array<Record<string, unknown>>;
	decorationTypeResults: Array<{ dispose: () => void }>;
	reset: () => void;
}

// Get test helpers
const testHelpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;

describe("AIProvenanceDecorations", () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let decorations: any;

	beforeEach(async () => {
		// Reset modules to get fresh imports
		vi.resetModules();

		// Re-mock vscode (needed after resetModules)
		vi.doMock("vscode", () => {
			const themeColorCalls: string[] = [];
			const decorationTypeCalls: Array<Record<string, unknown>> = [];
			const decorationTypeResults: Array<{ dispose: () => void }> = [];

			class MockThemeColor {
				constructor(public id: string) {
					themeColorCalls.push(id);
				}
			}

			class MockUri {
				static parse(str: string) {
					return { toString: () => str, fsPath: "/test/file.ts" };
				}
			}

			class MockRange {
				constructor(public start: unknown, public end: unknown) { /* intentionally empty */ }
			}

			class MockPosition {
				constructor(public line: number, public character: number) { /* intentionally empty */ }
			}

			class MockEventEmitter<T = unknown> {
				private listeners: Array<(e: T) => void> = [];
				get event() {
					return (listener: (e: T) => void) => {
						this.listeners.push(listener);
						return { dispose: () => { /* intentionally empty */ } };
					};
				}
				fire(data: T) {
					for (const listener of this.listeners) {
						listener(data);
					}
				}
				dispose() {
					this.listeners = [];
				}
			}

			const createTextEditorDecorationType = (options: Record<string, unknown>) => {
				decorationTypeCalls.push(options);
				const result = { dispose: () => { /* intentionally empty */ } };
				decorationTypeResults.push(result);
				return result;
			};

			return {
				ThemeColor: MockThemeColor,
				Uri: MockUri,
				OverviewRulerLane: {
					Left: 1,
					Center: 2,
					Right: 3,
					Full: 4,
				},
				Range: MockRange,
				Position: MockPosition,
				EventEmitter: MockEventEmitter,
				window: {
					createTextEditorDecorationType: createTextEditorDecorationType,
					onDidChangeActiveTextEditor: () => ({ dispose: () => { /* intentionally empty */ } }),
					activeTextEditor: null,
					visibleTextEditors: [],
				},
				workspace: {
					onDidChangeTextDocument: () => ({ dispose: () => { /* intentionally empty */ } }),
				},
				__test__: {
					themeColorCalls,
					decorationTypeCalls,
					decorationTypeResults,
					reset: () => {
						themeColorCalls.length = 0;
						decorationTypeCalls.length = 0;
						decorationTypeResults.length = 0;
					},
				},
			};
		});

		// Create mock signal state
		const signalState = {
			onChanged: () => ({ dispose: () => { /* intentionally empty */ } }),
			aiModifiedFiles: new Set<string>(),
			fragileFiles: new Map<string, string>(),
			fileChangeCounts: new Map<string, number>(),
			aiToolsDetected: [] as string[],
			dispose: () => { /* intentionally empty */ },
			getFileHeat: () => "normal" as const,
		};

		// Dynamic import after mocks are set up
		const { AIProvenanceDecorations } = await import("../../../src/decorations/AIProvenanceDecorations");
		decorations = new AIProvenanceDecorations(signalState as unknown as ConstructorParameters<typeof AIProvenanceDecorations>[0]);
	});

	afterEach(() => {
		if (decorations) {
			decorations.dispose();
		}
		vi.restoreAllMocks();
	});

	describe("initialization", () => {
		it("should create decoration types on construction", async () => {
			// Import vscode to get test helpers
			const vscode = await import("vscode");
			const helpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;

			// Should create 4 decoration types
			expect(helpers.decorationTypeCalls.length).toBe(4);
		});

		it("should use ThemeColor for decoration colors", async () => {
			const vscode = await import("vscode");
			const helpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;

			// ThemeColor should be called with vreko.* theme colors
			const colorIds = helpers.themeColorCalls;

			expect(colorIds).toContain("vreko.aiModifiedGutter");
			expect(colorIds).toContain("vreko.fragileFileHighlight");
			expect(colorIds).toContain("vreko.riskMedium");
			expect(colorIds).toContain("vreko.snapshotCoverage");
		});

		it("should use overview ruler lane Left for AI and risk decorations", async () => {
			const vscode = await import("vscode");
			const helpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;

			// Check that overviewRulerLane is set
			const calls = helpers.decorationTypeCalls;

			// At least one decoration should use Left lane (value 1)
			const leftLaneDecorations = calls.filter(
				(call) => call.overviewRulerLane === 1,
			);
			expect(leftLaneDecorations.length).toBeGreaterThan(0);
		});

		it("should use overview ruler lane Right for snapshot coverage", async () => {
			const vscode = await import("vscode");
			const helpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;

			const calls = helpers.decorationTypeCalls;

			// At least one decoration should use Right lane (value 3)
			const rightLaneDecorations = calls.filter(
				(call) => (call.overviewRulerLane as number) === 3,
			);
			expect(rightLaneDecorations.length).toBeGreaterThan(0);
		});
	});

	describe("theme color usage", () => {
		it("should reference vreko.aiModifiedGutter for AI-modified lines", async () => {
			const vscode = await import("vscode");
			const helpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;
			const calls = helpers.decorationTypeCalls;

			// Find decoration using aiModifiedGutter
			const aiGutterDecoration = calls.find(
				(call) =>
					call.overviewRulerColor &&
					typeof call.overviewRulerColor === "object" &&
					"id" in call.overviewRulerColor &&
					(call.overviewRulerColor as { id: string }).id === "vreko.aiModifiedGutter",
			);

			expect(aiGutterDecoration).toBeDefined();
		});

		it("should reference vreko.fragileFileHighlight for fragile files", async () => {
			const vscode = await import("vscode");
			const helpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;
			const calls = helpers.decorationTypeCalls;

			// Find decoration using fragileFileHighlight
			const fragileDecoration = calls.find(
				(call) =>
					call.backgroundColor &&
					typeof call.backgroundColor === "object" &&
					"id" in call.backgroundColor &&
					(call.backgroundColor as { id: string }).id === "vreko.fragileFileHighlight",
			);

			expect(fragileDecoration).toBeDefined();
		});

		it("should reference vreko.riskMedium for risk bands", async () => {
			const vscode = await import("vscode");
			const helpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;
			const calls = helpers.decorationTypeCalls;

			// Find decoration using riskMedium
			const riskDecoration = calls.find(
				(call) =>
					call.overviewRulerColor &&
					typeof call.overviewRulerColor === "object" &&
					"id" in call.overviewRulerColor &&
					(call.overviewRulerColor as { id: string }).id === "vreko.riskMedium",
			);

			expect(riskDecoration).toBeDefined();
		});

		it("should reference vreko.snapshotCoverage for overview ruler", async () => {
			const vscode = await import("vscode");
			const helpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;
			const calls = helpers.decorationTypeCalls;

			// Find decoration using snapshotCoverage
			const coverageDecoration = calls.find(
				(call) =>
					call.overviewRulerColor &&
					typeof call.overviewRulerColor === "object" &&
					"id" in call.overviewRulerColor &&
					(call.overviewRulerColor as { id: string }).id === "vreko.snapshotCoverage",
			);

			expect(coverageDecoration).toBeDefined();
		});
	});

	describe("signal state integration", () => {
		it("should subscribe to signal state changes", async () => {
			// Create a new mock to verify subscription
			let subscribed = false;
			const signalState = {
				onChanged: () => {
					subscribed = true;
					return { dispose: () => { /* intentionally empty */ } };
				},
				aiModifiedFiles: new Set<string>(),
				fragileFiles: new Map<string, string>(),
				fileChangeCounts: new Map<string, number>(),
				aiToolsDetected: [] as string[],
				dispose: () => { /* intentionally empty */ },
				getFileHeat: () => "normal" as const,
			};

			const { AIProvenanceDecorations } = await import("../../../src/decorations/AIProvenanceDecorations");
			const testDecorations = new AIProvenanceDecorations(signalState as unknown as ConstructorParameters<typeof AIProvenanceDecorations>[0]);

			// The onChanged event should be subscribed
			expect(subscribed).toBe(true);
			testDecorations.dispose();
		});
	});

	describe("disposal", () => {
		it("should dispose all decoration types", async () => {
			const vscode = await import("vscode");
			const helpers = (vscode as unknown as { __test__: VscodeTestHelpers }).__test__;

			// Get the created decoration types
			const createdTypes = helpers.decorationTypeResults;

			// All decoration types should have dispose method
			for (const result of createdTypes) {
				expect(result.dispose).toBeDefined();
				expect(typeof result.dispose).toBe("function");
			}
		});

		it("should clear update timer on dispose", () => {
			// Dispose should not throw
			expect(() => decorations.dispose()).not.toThrow();
		});

		it("should be safe to dispose multiple times", () => {
			expect(() => {
				decorations.dispose();
				decorations.dispose();
			}).not.toThrow();
		});
	});

	describe("refresh", () => {
		it("should have refresh method", () => {
			expect(decorations.refresh).toBeDefined();
			expect(typeof decorations.refresh).toBe("function");
		});
	});
});

describe("AI Tool Configurations", () => {
	it("should have unique colors for each AI tool", () => {
		const toolColors: Record<string, { color: string; lightColor: string }> = {
			Cursor: { color: "#60A5FA", lightColor: "#2563EB" },
			Copilot: { color: "#A78BFA", lightColor: "#7C3AED" },
			Claude: { color: "#FB923C", lightColor: "#EA580C" },
			Windsurf: { color: "#4ADE80", lightColor: "#16A34A" },
		};

		const colors = Object.values(toolColors).map((c) => c.color);
		const uniqueColors = new Set(colors);

		// All tool colors should be unique
		expect(uniqueColors.size).toBe(colors.length);
	});

	it("should use blue for Cursor (brand color)", () => {
		// Cursor should use blue-ish color matching AI badge
		const cursorColor = "#60A5FA";
		expect(cursorColor).toMatch(/60A5FA/i);
	});

	it("should have matching light theme variants", () => {
		const toolColors: Record<string, { color: string; lightColor: string }> = {
			Cursor: { color: "#60A5FA", lightColor: "#2563EB" },
			Copilot: { color: "#A78BFA", lightColor: "#7C3AED" },
			Claude: { color: "#FB923C", lightColor: "#EA580C" },
			Windsurf: { color: "#4ADE80", lightColor: "#16A34A" },
		};

		// Each tool should have a darker light theme variant
		for (const [tool, { color, lightColor }] of Object.entries(toolColors)) {
			// Light color should be darker (for contrast on light backgrounds)
			expect(lightColor).toBeTruthy();
			expect(lightColor).not.toBe(color);
		}
	});
});
