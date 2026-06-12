/**
 * Regression test: Only ONE status bar item created during phase4a activation
 *
 * CONTEXT (SB-CONSOLIDATE-001):
 * There were 3 competing status bar systems, each calling
 * vscode.window.createStatusBarItem independently:
 *   1. StatusBarManager (1415 LOC, legacy FSM)  -  created item in constructor
 *   2. StatusFlagManager (flag-map)  -  creates item in SignalCoordinator
 *   3. DaemonStatusProvider  -  creates item (not in active activation path)
 *
 * The fix (Phase B):
 *   - StatusBarManager constructor now accepts an optional `existingItem` param.
 *   - phase4a-critical-ui.ts creates ONE item and passes it to StatusBarManager.
 *   - StatusBarManager skips createStatusBarItem when an item is provided.
 *
 * This test verifies that:
 *   (a) StatusBarManager does NOT call createStatusBarItem when given an existing item
 *   (b) StatusBarManager DOES call createStatusBarItem when no item is provided (legacy)
 *   (c) The phase4a activation pattern (create → pass) results in exactly 1 call
 *
 * @regression SB-CONSOLIDATE-001
 * @see apps/vscode/src/ui/StatusBarManager.ts
 * @see apps/vscode/src/activation/phase4a-critical-ui.ts
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// VS Code mock  -  minimal surface needed for StatusBarManager construction
// ---------------------------------------------------------------------------
vi.mock("vscode", () => {
	const mockItem = () => ({
		show: vi.fn(),
		dispose: vi.fn(),
		text: "",
		tooltip: "",
		command: undefined as string | undefined,
		backgroundColor: undefined,
	});

	return {
		window: {
			createStatusBarItem: vi.fn(mockItem),
			createOutputChannel: vi.fn(() => ({
				appendLine: vi.fn(),
				show: vi.fn(),
				dispose: vi.fn(),
				replace: vi.fn(),
				append: vi.fn(),
				clear: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
				debug: vi.fn(),
				trace: vi.fn(),
				logLevel: 2,
				onDidChangeLogLevel: { event: vi.fn(), fire: vi.fn() },
			})),
		},
		StatusBarAlignment: { Left: 1, Right: 2 },
		ThemeColor: class {
			constructor(public id: string) { /* intentionally empty */ }
		},
		MarkdownString: class {
			isTrusted = false;
			private _value = "";
			constructor(_value = "", _isTrusted = false) { /* intentionally empty */ }
			appendMarkdown(value: string) {
				this._value += value;
				return this;
			}
		},
	};
});

// ---------------------------------------------------------------------------
// Mocks for StatusBarManager's transitive imports
// ---------------------------------------------------------------------------
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
	Logger: {
		getInstance: vi.fn(),
	},
}));

vi.mock("../../../src/signage/constants", () => ({
	PULSE_LEVEL_SIGNAGE: {},
	SESSION_HEALTH_SIGNAGE: {
		healthy: { icon: "✅", label: "Healthy", description: "All good" },
		warning: { icon: "⚠️", label: "Warning", description: "Some issues" },
		caution: { icon: "🟡", label: "Caution", description: "Watch it" },
		critical: { icon: "❌", label: "Critical", description: "Act now" },
	},
	TEMPERATURE_LEVEL_SIGNAGE: {},
	TRAJECTORY_SIGNAGE: {
		stable: { icon: "→", label: "Stable", arrow: "→" },
		improving: { icon: "↗", label: "Improving", arrow: "↗" },
		degrading: { icon: "↘", label: "Degrading", arrow: "↘" },
		critical: { icon: "↓↓", label: "Critical", arrow: "↓↓" },
	},
}));

vi.mock("../../../src/services/workspace-data/types", () => ({
	PRESSURE_THRESHOLDS: { critical: 80, moderate: 50 },
}));

vi.mock("../../../src/utils/format", () => ({
	formatNumber: (n: number) => String(n),
	formatDuration: vi.fn(() => "0s"),
}));

vi.mock("../../../src/ui/ux-types", () => ({
	ACTIVITY_SEQUENCES: {},
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SB-CONSOLIDATE-001: Only one status bar item created in phase4a path", () => {
	let createStatusBarItemSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		// Get the spy reference AFTER mocks are registered
		const vscode = await import("vscode");
		createStatusBarItemSpy = vscode.window.createStatusBarItem as ReturnType<typeof vi.fn>;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ---------------------------------------------------------------------------
	// (a) StatusBarManager REUSES the provided item  -  does NOT call createStatusBarItem
	// ---------------------------------------------------------------------------
	describe("when existingItem is provided", () => {
		it("does NOT call vscode.window.createStatusBarItem", async () => {
			const { StatusBarManager } = await import("../../../src/ui/StatusBarManager");
			const vscode = await import("vscode");

			// Simulate: phase4a creates the item once
			const preCreatedItem = vscode.window.createStatusBarItem("vreko.primary", 1, 999);
			const callsBefore = createStatusBarItemSpy.mock.calls.length; // 1 (the explicit call above)

			// StatusBarManager constructor must NOT add another call
			const manager = new StatusBarManager(preCreatedItem);

			expect(createStatusBarItemSpy.mock.calls.length).toBe(callsBefore);
			expect(manager).toBeDefined();

			manager.dispose();
		});

		it("uses the item's text/command/show API", async () => {
			const { StatusBarManager } = await import("../../../src/ui/StatusBarManager");
			const vscode = await import("vscode");

			const preCreatedItem = vscode.window.createStatusBarItem("vreko.primary", 1, 999);

			const manager = new StatusBarManager(preCreatedItem);

			// Constructor wires command and calls show()
			expect(preCreatedItem.command).toBe("vreko.showQuickPicker");
			expect((preCreatedItem as any).show).toHaveBeenCalled();

			manager.dispose();
		});
	});

	// ---------------------------------------------------------------------------
	// (b) StatusBarManager DOES call createStatusBarItem when no item is provided
	//     (legacy fallback  -  existing call sites continue to work)
	// ---------------------------------------------------------------------------
	describe("when no existingItem is provided (legacy path)", () => {
		it("calls vscode.window.createStatusBarItem exactly once", async () => {
			const { StatusBarManager } = await import("../../../src/ui/StatusBarManager");

			const callsBefore = createStatusBarItemSpy.mock.calls.length;
			const manager = new StatusBarManager();
			const callsAfter = createStatusBarItemSpy.mock.calls.length;

			expect(callsAfter - callsBefore).toBe(1);

			manager.dispose();
		});
	});

	// ---------------------------------------------------------------------------
	// (c) The phase4a pattern: create item ONCE, pass to StatusBarManager → 1 total
	// ---------------------------------------------------------------------------
	describe("phase4a activation pattern (the real fix)", () => {
		it("results in exactly ONE createStatusBarItem call for the status bar", async () => {
			const { StatusBarManager } = await import("../../../src/ui/StatusBarManager");
			const vscode = await import("vscode");

			const callsBefore = createStatusBarItemSpy.mock.calls.length;

			// === This is the exact pattern in phase4a-critical-ui.ts ===
			const primaryStatusBarItem = vscode.window.createStatusBarItem("vreko.primary", 1, 999);
			primaryStatusBarItem.show();

			// StatusBarManager receives the item  -  no second createStatusBarItem call
			const manager = new StatusBarManager(primaryStatusBarItem);
			// === End of pattern ===

			const callsAfter = createStatusBarItemSpy.mock.calls.length;
			const totalNewCalls = callsAfter - callsBefore;

			// CRITICAL REGRESSION GATE: exactly ONE call (the explicit one in phase4a)
			expect(totalNewCalls).toBe(1);
			expect(manager).toBeDefined();

			manager.dispose();
		});

		it("createStatusBarManager factory passes existingItem through correctly", async () => {
			const { createStatusBarManager } = await import("../../../src/ui/StatusBarManager");
			const vscode = await import("vscode");

			const callsBefore = createStatusBarItemSpy.mock.calls.length;

			const item = vscode.window.createStatusBarItem("vreko.primary", 1, 999);
			const manager = createStatusBarManager(item);

			const totalNewCalls = createStatusBarItemSpy.mock.calls.length - callsBefore;

			// 1 call for creating the item, 0 from createStatusBarManager
			expect(totalNewCalls).toBe(1);
			expect(manager).toBeDefined();

			manager.dispose();
		});
	});

	// ---------------------------------------------------------------------------
	// (d) Dispose: StatusBarManager.dispose() should NOT double-dispose the item
	//     when the item was provided externally
	// ---------------------------------------------------------------------------
	describe("dispose safety", () => {
		it("calls dispose() on the status bar item", async () => {
			const { StatusBarManager } = await import("../../../src/ui/StatusBarManager");
			const vscode = await import("vscode");

			const item = vscode.window.createStatusBarItem("vreko.primary", 1, 999);
			const manager = new StatusBarManager(item);

			manager.dispose();

			// The item's dispose should have been called
			expect((item as any).dispose).toHaveBeenCalledTimes(1);
		});
	});
});
