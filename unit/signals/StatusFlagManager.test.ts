/**
 * StatusFlagManager Tests
 *
 * Tests for expiry-timer behaviour introduced to fix Issue #3:
 * - Degraded flag auto-clears after 30 s if no recovery event fires
 * - Clearing the flag manually before expiry cancels the timer
 * - Re-setting the flag restarts the timer from scratch
 * - Flags with no defaultExpiry (e.g. disconnected) never auto-clear
 *
 * @see apps/vscode/src/signals/StatusFlagManager.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusFlagManager } from "../../../src/signals/StatusFlagManager";
import type { SignalState } from "../../../src/signals/SignalState";

// ---------------------------------------------------------------------------
// VS Code API mock (minimal  -  only what StatusFlagManager touches)
// ---------------------------------------------------------------------------
vi.mock("vscode", () => ({
	window: {
		createStatusBarItem: vi.fn(() => ({
			show: vi.fn(),
			dispose: vi.fn(),
			text: "",
			tooltip: "",
			command: undefined,
			backgroundColor: undefined,
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
}));

// ---------------------------------------------------------------------------
// Minimal utilities mock
// ---------------------------------------------------------------------------
vi.mock("../../../src/utils/format", () => ({
	formatDuration: vi.fn(() => "0s"),
}));

// ---------------------------------------------------------------------------
// Helper: minimal SignalState stub
// ---------------------------------------------------------------------------
function makeSignalState(tier: "new" | "active" | "power" = "new"): SignalState {
	return {
		tier,
		recentEvents: { peek: vi.fn(() => undefined) },
		getTierDisplayText: vi.fn(() => tier),
		userInfo: undefined,
		sessionName: undefined,
		snapshotCountSession: 0,
		sessionDuration: 0,
		aiToolsDetected: [],
		learningCount: 0,
		fragileFileCount: 0,
		patternCount: 0,
		currentRiskLevel: "normal",
		riskReason: "",
		onChanged: vi.fn(() => ({ dispose: vi.fn() })),
	} as unknown as SignalState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("StatusFlagManager  -  expiry timers", () => {
	let manager: StatusFlagManager;

	beforeEach(() => {
		vi.useFakeTimers();
		manager = new StatusFlagManager(makeSignalState());
	});

	afterEach(() => {
		manager.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	// -----------------------------------------------------------------------
	// Issue #3: degraded flag
	// -----------------------------------------------------------------------
	describe("degraded flag (defaultExpiry: 30 000 ms)", () => {
		it("auto-clears after 30 s when no recovery event fires", () => {
			manager.setFlag("degraded");
			expect(manager.hasFlag("degraded")).toBe(true);

			// 1 ms before expiry  -  still active
			vi.advanceTimersByTime(29_999);
			expect(manager.hasFlag("degraded")).toBe(true);

			// Exactly at expiry  -  timer fires
			vi.advanceTimersByTime(1);
			expect(manager.hasFlag("degraded")).toBe(false);
		});

		it("cancels the timer when the flag is cleared manually before expiry", () => {
			manager.setFlag("degraded");
			expect(manager.hasFlag("degraded")).toBe(true);

			// Manual clear well before the 30 s mark
			manager.clearFlag("degraded");
			expect(manager.hasFlag("degraded")).toBe(false);

			// Advance past what the original timer would have been  -  no error, no re-appear
			vi.advanceTimersByTime(60_000);
			expect(manager.hasFlag("degraded")).toBe(false);
		});

		it("restarts the timer when the flag is set again after a manual clear", () => {
			// First round
			manager.setFlag("degraded");
			manager.clearFlag("degraded");

			// Second round  -  fresh 30 s window
			manager.setFlag("degraded");
			expect(manager.hasFlag("degraded")).toBe(true);

			vi.advanceTimersByTime(29_999);
			expect(manager.hasFlag("degraded")).toBe(true);

			vi.advanceTimersByTime(1);
			expect(manager.hasFlag("degraded")).toBe(false);
		});

		it("restarts the timer when setFlag is called again before the first timer fires", () => {
			manager.setFlag("degraded");

			// Advance halfway, then set again  -  timer resets
			vi.advanceTimersByTime(15_000);
			manager.setFlag("degraded");

			// 15 000 ms later (= 30 000 from second set)  -  should just have expired
			vi.advanceTimersByTime(29_999);
			expect(manager.hasFlag("degraded")).toBe(true);

			vi.advanceTimersByTime(1);
			expect(manager.hasFlag("degraded")).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Disconnected flag  -  no defaultExpiry, must NOT auto-clear
	// -----------------------------------------------------------------------
	describe("disconnected flag (no defaultExpiry)", () => {
		it("does NOT auto-clear the disconnected flag regardless of time elapsed", () => {
			manager.setFlag("disconnected");
			expect(manager.hasFlag("disconnected")).toBe(true);

			vi.advanceTimersByTime(120_000); // 2 minutes
			expect(manager.hasFlag("disconnected")).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// checkpoint flag  -  auto-clears via expiry timer (not just render sweep)
	// -----------------------------------------------------------------------
	describe("checkpoint flag (defaultExpiry: 3 000 ms)", () => {
		it("auto-clears after 3 s even with no subsequent activity", () => {
			manager.setFlag("checkpoint");
			expect(manager.hasFlag("checkpoint")).toBe(true);

			vi.advanceTimersByTime(2_999);
			expect(manager.hasFlag("checkpoint")).toBe(true);

			vi.advanceTimersByTime(1);
			expect(manager.hasFlag("checkpoint")).toBe(false);
		});

		it("resets the 3 s timer when setFlag is called again before expiry", () => {
			manager.setFlag("checkpoint");
			vi.advanceTimersByTime(1_500);
			manager.setFlag("checkpoint"); // re-trigger

			vi.advanceTimersByTime(2_999);
			expect(manager.hasFlag("checkpoint")).toBe(true);

			vi.advanceTimersByTime(1);
			expect(manager.hasFlag("checkpoint")).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// ai_session flag  -  timer extends on each call
	// -----------------------------------------------------------------------
	describe("ai_session flag (AI_SESSION_EXTENSION_MS: 5 000 ms)", () => {
		it("auto-clears after 5 s when no further AI events fire", () => {
			manager.setFlag("ai_session");
			expect(manager.hasFlag("ai_session")).toBe(true);

			vi.advanceTimersByTime(4_999);
			expect(manager.hasFlag("ai_session")).toBe(true);

			vi.advanceTimersByTime(1);
			expect(manager.hasFlag("ai_session")).toBe(false);
		});

		it("extends the 5 s window each time setFlag is called", () => {
			manager.setFlag("ai_session");
			vi.advanceTimersByTime(4_000);
			manager.setFlag("ai_session"); // extend

			vi.advanceTimersByTime(4_999);
			expect(manager.hasFlag("ai_session")).toBe(true);

			vi.advanceTimersByTime(1);
			expect(manager.hasFlag("ai_session")).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// dispose() must cancel all pending timers
	// -----------------------------------------------------------------------
	describe("dispose()", () => {
		it("cancels all pending expiry timers on dispose", () => {
			manager.setFlag("degraded");
			expect(manager.hasFlag("degraded")).toBe(true);

			// Dispose before the timer fires
			manager.dispose();

			// Create a new manager so afterEach dispose() doesn't double-dispose
			manager = new StatusFlagManager(makeSignalState());

			// Advancing time after the old manager is disposed should not throw
			expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
		});
	});
});
