/**
 * Activation Guard Tests  -  Issue #7
 *
 * Verifies that the module-level `_isActivating` / `_activationComplete` guard
 * inside `activate()` prevents double-activation when VS Code calls the
 * extension entry point more than once (e.g. window reload or extension-host
 * restart during development).
 *
 * These tests exercise the *guard state-machine* directly (mirroring the logic
 * in extension.ts) following the same pattern used in:
 *   - test/unit/extension.deduplication.test.ts
 *   - test/unit/activation/deferred-initialization.test.ts
 *
 * @see apps/vscode/src/extension.ts (_isActivating / _activationComplete)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Re-usable factory  -  builds a minimal activate() clone that obeys the guard
// pattern as implemented in extension.ts.
// ---------------------------------------------------------------------------
function buildGuardedActivate(phaseLog: string[]) {
	let _isActivating = false;
	let _activationComplete = false;

	const activate = async (): Promise<void> => {
		if (_isActivating) {
			phaseLog.push("blocked:activating");
			return;
		}
		if (_activationComplete) {
			phaseLog.push("blocked:complete");
			return;
		}
		_isActivating = true;

		try {
			phaseLog.push("phase-start");
			await Promise.resolve(); // simulate async work
			phaseLog.push("phase-end");
		} finally {
			_activationComplete = true;
			_isActivating = false;
		}
	};

	return activate;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Activation guard pattern (Issue #7)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("phase logic runs exactly once when activate() is called once", async () => {
		const log: string[] = [];
		const activate = buildGuardedActivate(log);

		await activate();

		expect(log).toEqual(["phase-start", "phase-end"]);
	});

	it("prevents concurrent double-activation (_isActivating guard)", async () => {
		const log: string[] = [];
		const activate = buildGuardedActivate(log);

		// Fire both calls before either has awaited
		const p1 = activate();
		const p2 = activate(); // _isActivating is already true at this point

		await Promise.all([p1, p2]);

		// Phase logic should run only once; second call is blocked
		expect(log.filter((e) => e === "phase-start")).toHaveLength(1);
		expect(log.filter((e) => e === "phase-end")).toHaveLength(1);
		expect(log).toContain("blocked:activating");
	});

	it("prevents re-activation after completion (_activationComplete guard)", async () => {
		const log: string[] = [];
		const activate = buildGuardedActivate(log);

		await activate();
		expect(log).toEqual(["phase-start", "phase-end"]);

		// Second call  -  activation is already complete
		await activate();

		expect(log).toEqual(["phase-start", "phase-end", "blocked:complete"]);
	});

	it("phase logic runs only once across two rapid successive calls", async () => {
		const log: string[] = [];
		const activate = buildGuardedActivate(log);

		// Simulate VS Code firing activate() twice in rapid succession (window reload)
		await Promise.all([activate(), activate()]);

		const phaseStartCount = log.filter((e) => e === "phase-start").length;
		expect(phaseStartCount).toBe(1);
	});

	it("finally block always runs (_isActivating / _activationComplete reset)", async () => {
		const log: string[] = [];
		let _isActivating = false;
		let _activationComplete = false;

		const activate = async (): Promise<void> => {
			if (_isActivating || _activationComplete) {
				log.push("blocked");
				return;
			}
			_isActivating = true;
			try {
				log.push("running");
				await Promise.resolve();
			} finally {
				_activationComplete = true;
				_isActivating = false;
				log.push("finally");
			}
		};

		await activate();

		// Verify the flags are in their terminal state
		expect(_isActivating).toBe(false);
		expect(_activationComplete).toBe(true);
		expect(log).toEqual(["running", "finally"]);
	});
});
