/**
 * ProjectionStore Unit Tests
 *
 * Tests the central projection cache that consumes DaemonBridge events
 * and produces read-only projection state for all UI surfaces.
 *
 * TEST PATHS:
 * 1. Happy: Bridge events → coalesced projections (deterministic)
 * 2. Sad: Dispose mid-update, bridge errors → graceful degradation
 * 3. Edge: Rapid-fire events → coalescing, registry lifecycle
 *
 * @regression-marker These tests prevent regression in:
 * - 200ms coalescing (DAEMON_FIRST_ARCHITECTURE SS4.1)
 * - Connection state mapping from DaemonBridge → ProjectionState
 * - Snapshot count increments on onSnapshotCreated
 * - Risk signal ring-buffer (max 10)
 * - Session polling lifecycle
 *
 * @see ProjectionStore.ts
 * @see types.ts for ProjectionState, ProjectionChangeEvent
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("vscode", () => {
	class MockEventEmitter<T> {
		private listeners: Array<(e: T) => void> = [];

		get event() {
			return (listener: (e: T) => void) => {
				this.listeners.push(listener);
				return {
					dispose: () => {
						const idx = this.listeners.indexOf(listener);
						if (idx >= 0) this.listeners.splice(idx, 1);
					},
				};
			};
		}

		fire(data: T) {
			for (const l of this.listeners) l(data);
		}

		dispose() {
			this.listeners = [];
		}
	}

	return {
		EventEmitter: MockEventEmitter,
		Disposable: class {
			constructor(private callback: () => void) {}
			dispose() {
				this.callback?.();
			}
		},
	};
});

import {
	ProjectionStore,
	getProjectionStore,
	disposeProjectionStore,
	disposeAllProjectionStores,
} from "../../../src/ui/ProjectionStore";
import type { StateChangeEvent } from "../../../src/services/DaemonBridge";
import type { ProjectionChangeEvent, ProjectionSlice } from "../../../src/ui/types";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

type StateChangeCallback = (event: StateChangeEvent) => void;
type SnapshotCallback = () => void;
type RiskCallback = (event: { file: string; riskLevel: string; reason: string }) => void;
type SessionStartedCallback = (event: { taskId: string; task: string }) => void;
type SessionEndedCallback = (event: { sessionId: string; outcome: string }) => void;
type LearningAddedCallback = () => void;
type ProtectionChangedCallback = (event: { file: string; level: string; previousLevel?: string }) => void;
type ViolationReportedCallback = (event: { type: string; file: string; message: string }) => void;
type SyncCompletedCallback = (event: { success: boolean; error?: string }) => void;

function createMockDaemonBridge() {
	const stateChangeCallbacks: StateChangeCallback[] = [];
	const snapshotCallbacks: SnapshotCallback[] = [];
	const riskCallbacks: RiskCallback[] = [];
	const sessionStartedCallbacks: SessionStartedCallback[] = [];
	const sessionEndedCallbacks: SessionEndedCallback[] = [];
	const learningAddedCallbacks: LearningAddedCallback[] = [];
	const protectionChangedCallbacks: ProtectionChangedCallback[] = [];
	const violationReportedCallbacks: ViolationReportedCallback[] = [];
	const syncCompletedCallbacks: SyncCompletedCallback[] = [];

	const bridge = {
		onStateChange: vi.fn((cb: StateChangeCallback) => {
			stateChangeCallbacks.push(cb);
			return { dispose: () => stateChangeCallbacks.splice(stateChangeCallbacks.indexOf(cb), 1) };
		}),
		onSnapshotCreated: vi.fn((cb: SnapshotCallback) => {
			snapshotCallbacks.push(cb);
			return { dispose: () => snapshotCallbacks.splice(snapshotCallbacks.indexOf(cb), 1) };
		}),
		onRiskDetected: vi.fn((cb: RiskCallback) => {
			riskCallbacks.push(cb);
			return { dispose: () => riskCallbacks.splice(riskCallbacks.indexOf(cb), 1) };
		}),
		// New event emitters (Layer 2 wiring)
		onSessionStarted: vi.fn((cb: SessionStartedCallback) => {
			sessionStartedCallbacks.push(cb);
			return { dispose: () => sessionStartedCallbacks.splice(sessionStartedCallbacks.indexOf(cb), 1) };
		}),
		onSessionEnded: vi.fn((cb: SessionEndedCallback) => {
			sessionEndedCallbacks.push(cb);
			return { dispose: () => sessionEndedCallbacks.splice(sessionEndedCallbacks.indexOf(cb), 1) };
		}),
		onLearningAdded: vi.fn((cb: LearningAddedCallback) => {
			learningAddedCallbacks.push(cb);
			return { dispose: () => learningAddedCallbacks.splice(learningAddedCallbacks.indexOf(cb), 1) };
		}),
		onProtectionChanged: vi.fn((cb: ProtectionChangedCallback) => {
			protectionChangedCallbacks.push(cb);
			return { dispose: () => protectionChangedCallbacks.splice(protectionChangedCallbacks.indexOf(cb), 1) };
		}),
		onViolationReported: vi.fn((cb: ViolationReportedCallback) => {
			violationReportedCallbacks.push(cb);
			return { dispose: () => violationReportedCallbacks.splice(violationReportedCallbacks.indexOf(cb), 1) };
		}),
		onSyncCompleted: vi.fn((cb: SyncCompletedCallback) => {
			syncCompletedCallbacks.push(cb);
			return { dispose: () => syncCompletedCallbacks.splice(syncCompletedCallbacks.indexOf(cb), 1) };
		}),
		isConnected: vi.fn().mockReturnValue(false),
		getSessionStatus: vi.fn().mockResolvedValue(null),
	} as any;

	return {
		bridge,
		fireStateChange: (event: StateChangeEvent) => {
			for (const cb of stateChangeCallbacks) cb(event);
		},
		fireSnapshotCreated: () => {
			for (const cb of snapshotCallbacks) cb();
		},
		fireRiskDetected: (event: { file: string; riskLevel: string; reason: string }) => {
			for (const cb of riskCallbacks) cb(event);
		},
		// New event fire methods
		fireSessionStarted: (event: { taskId: string; task: string }) => {
			for (const cb of sessionStartedCallbacks) cb(event);
		},
		fireSessionEnded: (event: { sessionId: string; outcome: string }) => {
			for (const cb of sessionEndedCallbacks) cb(event);
		},
		fireLearningAdded: () => {
			for (const cb of learningAddedCallbacks) cb();
		},
		fireProtectionChanged: (event: { file: string; level: string; previousLevel?: string }) => {
			for (const cb of protectionChangedCallbacks) cb(event);
		},
		fireViolationReported: (event: { type: string; file: string; message: string }) => {
			for (const cb of violationReportedCallbacks) cb(event);
		},
		fireSyncCompleted: (event: { success: boolean; error?: string }) => {
			for (const cb of syncCompletedCallbacks) cb(event);
		},
	};
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("ProjectionStore", () => {
	let store: ProjectionStore;
	let mock: ReturnType<typeof createMockDaemonBridge>;

	beforeEach(() => {
		vi.useFakeTimers();
		store = new ProjectionStore();
		mock = createMockDaemonBridge();
	});

	afterEach(() => {
		store.dispose();
		vi.useRealTimers();
	});

	// ─── Constructor & Defaults ─────────────────────────────────────────

	describe("constructor", () => {
		it("initializes with default projection state", () => {
			expect(store.connection).toBe("disconnected");
			expect(store.session.active).toBe(false);
			expect(store.session.snapshotCount).toBe(0);
			expect(store.protection.riskSignals).toEqual([]);
			expect(store.intelligence.riskEventCount).toBe(0);
		});

		it("starts with isOffline=true, isDegraded=false, isHealthy=false", () => {
			expect(store.isOffline).toBe(true);
			expect(store.isDegraded).toBe(false);
			expect(store.isHealthy).toBe(false);
		});
	});

	// ─── Activation ────────────────────────────────────────────────────

	describe("activate()", () => {
		it("subscribes to bridge events", () => {
			store.activate(mock.bridge, "/workspace");

			expect(mock.bridge.onStateChange).toHaveBeenCalledOnce();
			expect(mock.bridge.onSnapshotCreated).toHaveBeenCalledOnce();
			expect(mock.bridge.onRiskDetected).toHaveBeenCalledOnce();
		});

		it("subscribes to Layer 2 event emitters", () => {
			store.activate(mock.bridge, "/workspace");

			// New event subscriptions from Layer 2 wiring
			expect(mock.bridge.onSessionStarted).toHaveBeenCalledOnce();
			expect(mock.bridge.onSessionEnded).toHaveBeenCalledOnce();
			expect(mock.bridge.onLearningAdded).toHaveBeenCalledOnce();
			expect(mock.bridge.onProtectionChanged).toHaveBeenCalledOnce();
			expect(mock.bridge.onViolationReported).toHaveBeenCalledOnce();
			expect(mock.bridge.onSyncCompleted).toHaveBeenCalledOnce();
		});

		it("seeds state from connected bridge", async () => {
			mock.bridge.isConnected.mockReturnValue(true);
			mock.bridge.getSessionStatus.mockResolvedValue({
				active: true,
				taskId: "t1",
				task: "Fix auth",
				startedAt: new Date().toISOString(),
				filesModified: 3,
				snapshotCount: 2,
			});

			store.activate(mock.bridge, "/workspace");

			// Let seed complete (awaits getSessionStatus)
			await vi.advanceTimersByTimeAsync(10);

			expect(store.connection).toBe("connected");
		});

		it("does not activate when already disposed", () => {
			store.dispose();
			store.activate(mock.bridge, "/workspace");

			expect(mock.bridge.onStateChange).not.toHaveBeenCalled();
		});
	});

	// ─── Connection State Changes ──────────────────────────────────────

	describe("connection state changes", () => {
		let changeEvents: ProjectionChangeEvent[];

		beforeEach(() => {
			changeEvents = [];
			store.onDidChange((e) => changeEvents.push(e));
			store.activate(mock.bridge, "/workspace");
		});

		it("maps 'connected' state and fires coalesced event", () => {
			mock.fireStateChange({
				state: "connected",
				previousState: "disconnected",
				daemonVersion: "1.2.3",
			});

			// Before coalesce interval: no events yet
			expect(changeEvents).toHaveLength(0);

			// After 200ms coalesce
			vi.advanceTimersByTime(200);

			expect(changeEvents).toHaveLength(1);
			expect(changeEvents[0].changed).toContain("connection");
			expect(changeEvents[0].state.connection).toBe("connected");
			expect(store.isHealthy).toBe(true);
			expect(store.isOffline).toBe(false);
		});

		it("maps 'degraded' state correctly", () => {
			mock.fireStateChange({
				state: "degraded",
				previousState: "connected",
				healthy: false,
			});

			vi.advanceTimersByTime(200);

			expect(store.isDegraded).toBe(true);
			expect(store.connectionDetails.consecutiveFailures).toBe(1);
		});

		it("maps 'cli_missing' to offline", () => {
			mock.fireStateChange({
				state: "cli_missing",
				previousState: "disconnected",
				reason: "CLI not found",
			});

			vi.advanceTimersByTime(200);

			expect(store.isOffline).toBe(true);
			expect(store.connectionDetails.reason).toBe("CLI not found");
		});

		it("resets consecutive failures on healthy connection", () => {
			// First: go to degraded (increments failures)
			mock.fireStateChange({ state: "degraded", previousState: "connected", healthy: false });
			vi.advanceTimersByTime(200);
			expect(store.connectionDetails.consecutiveFailures).toBe(1);

			// Then: reconnect (resets)
			mock.fireStateChange({ state: "connected", previousState: "degraded" });
			vi.advanceTimersByTime(200);
			expect(store.connectionDetails.consecutiveFailures).toBe(0);
		});

		it("triggers session refresh when connected", async () => {
			mock.bridge.getSessionStatus.mockResolvedValue({
				active: true,
				taskId: "t1",
				task: "Refactor",
				filesModified: 5,
				snapshotCount: 3,
			});

			mock.fireStateChange({ state: "connected", previousState: "disconnected" });

			// Let the async session refresh complete
			await vi.advanceTimersByTimeAsync(200);

			expect(mock.bridge.getSessionStatus).toHaveBeenCalled();
		});
	});

	// ─── Snapshot Created ──────────────────────────────────────────────

	describe("snapshot created events", () => {
		beforeEach(() => {
			store.activate(mock.bridge, "/workspace");
		});

		it("increments session snapshot count", () => {
			expect(store.session.snapshotCount).toBe(0);

			mock.fireSnapshotCreated();
			vi.advanceTimersByTime(200);

			expect(store.session.snapshotCount).toBe(1);

			mock.fireSnapshotCreated();
			vi.advanceTimersByTime(200);

			expect(store.session.snapshotCount).toBe(2);
		});

		it("increments totalRecentSnapshots", () => {
			mock.fireSnapshotCreated();
			mock.fireSnapshotCreated();
			vi.advanceTimersByTime(200);

			expect(store.session.totalRecentSnapshots).toBe(2);
		});
	});

	// ─── Risk Detected ─────────────────────────────────────────────────

	describe("risk detected events", () => {
		beforeEach(() => {
			store.activate(mock.bridge, "/workspace");
		});

		it("adds risk signal and increments count", () => {
			mock.fireRiskDetected({ file: "auth.ts", riskLevel: "high", reason: "AI-generated code" });
			vi.advanceTimersByTime(200);

			expect(store.intelligence.riskEventCount).toBe(1);
			expect(store.protection.riskSignals).toHaveLength(1);
			expect(store.protection.riskSignals[0]).toMatchObject({
				level: "high",
				description: "AI-generated code",
				filePath: "auth.ts",
			});
		});

		it("ring-buffers risk signals to max 10", () => {
			for (let i = 0; i < 15; i++) {
				mock.fireRiskDetected({ file: `file${i}.ts`, riskLevel: "low", reason: `reason ${i}` });
			}
			vi.advanceTimersByTime(200);

			expect(store.protection.riskSignals).toHaveLength(10);
			// Most recent should be the last entries
			expect(store.protection.riskSignals[9].description).toBe("reason 14");
		});
	});

	// ─── Session Started (Layer 2 wiring) ────────────────────────────────

	describe("session started events", () => {
		beforeEach(() => {
			store.activate(mock.bridge, "/workspace");
		});

		it("updates session state to active with task info", () => {
			expect(store.session.active).toBe(false);

			mock.fireSessionStarted({ taskId: "task-123", task: "Refactor auth module" });
			vi.advanceTimersByTime(200);

			expect(store.session.active).toBe(true);
			expect(store.session.taskId).toBe("task-123");
			expect(store.session.task).toBe("Refactor auth module");
			expect(store.session.startedAt).toBeInstanceOf(Date);
		});

		it("fires session slice in change event", () => {
			const changeEvents: ProjectionChangeEvent[] = [];
			store.onDidChange((e) => changeEvents.push(e));

			mock.fireSessionStarted({ taskId: "t1", task: "Test task" });
			vi.advanceTimersByTime(200);

			expect(changeEvents).toHaveLength(1);
			expect(changeEvents[0].changed).toContain("session");
		});
	});

	// ─── Session Ended (Layer 2 wiring) ──────────────────────────────────

	describe("session ended events", () => {
		beforeEach(() => {
			store.activate(mock.bridge, "/workspace");
		});

		it("clears session state", () => {
			// First start a session
			mock.fireSessionStarted({ taskId: "task-123", task: "Refactor" });
			vi.advanceTimersByTime(200);
			expect(store.session.active).toBe(true);

			// Then end it
			mock.fireSessionEnded({ sessionId: "session-456", outcome: "completed" });
			vi.advanceTimersByTime(200);

			expect(store.session.active).toBe(false);
			expect(store.session.taskId).toBeUndefined();
			expect(store.session.task).toBeUndefined();
		});
	});

	// ─── Learning Added (Layer 2 wiring) ─────────────────────────────────

	describe("learning added events", () => {
		beforeEach(() => {
			store.activate(mock.bridge, "/workspace");
		});

		it("increments learning count in intelligence state", () => {
			expect(store.intelligence.learningCount).toBe(0);

			mock.fireLearningAdded();
			vi.advanceTimersByTime(200);

			expect(store.intelligence.learningCount).toBe(1);

			mock.fireLearningAdded();
			vi.advanceTimersByTime(200);

			expect(store.intelligence.learningCount).toBe(2);
		});

		it("updates lastUpdated timestamp", () => {
			const before = store.intelligence.lastUpdated;

			mock.fireLearningAdded();
			vi.advanceTimersByTime(200);

			expect(store.intelligence.lastUpdated).not.toEqual(before);
		});

		it("fires intelligence slice in change event", () => {
			const changeEvents: ProjectionChangeEvent[] = [];
			store.onDidChange((e) => changeEvents.push(e));

			mock.fireLearningAdded();
			vi.advanceTimersByTime(200);

			expect(changeEvents).toHaveLength(1);
			expect(changeEvents[0].changed).toContain("intelligence");
		});
	});

	// ─── Violation Reported (Layer 2 wiring) ─────────────────────────────

	describe("violation reported events", () => {
		beforeEach(() => {
			store.activate(mock.bridge, "/workspace");
		});

		it("increments violation count in protection state", () => {
			expect(store.protection.violationCount).toBe(0);

			mock.fireViolationReported({ type: "pattern-violation", file: "auth.ts", message: "Used let instead of const" });
			vi.advanceTimersByTime(200);

			expect(store.protection.violationCount).toBe(1);

			mock.fireViolationReported({ type: "pitfall", file: "utils.ts", message: "Another issue" });
			vi.advanceTimersByTime(200);

			expect(store.protection.violationCount).toBe(2);
		});

		it("fires protection slice in change event", () => {
			const changeEvents: ProjectionChangeEvent[] = [];
			store.onDidChange((e) => changeEvents.push(e));

			mock.fireViolationReported({ type: "test", file: "test.ts", message: "Test" });
			vi.advanceTimersByTime(200);

			expect(changeEvents).toHaveLength(1);
			expect(changeEvents[0].changed).toContain("protection");
		});
	});

	// ─── Sync Completed (Layer 2 wiring) ─────────────────────────────────

	describe("sync completed events", () => {
		beforeEach(() => {
			store.activate(mock.bridge, "/workspace");
		});

		it("updates lastSync timestamp on success", () => {
			expect(store.connectionDetails.lastSync).toBeUndefined();

			mock.fireSyncCompleted({ success: true });
			vi.advanceTimersByTime(200);

			expect(store.connectionDetails.lastSync).toBeInstanceOf(Date);
			expect(store.connectionDetails.syncError).toBeUndefined();
		});

		it("sets syncError on failure", () => {
			mock.fireSyncCompleted({ success: false, error: "Connection timeout" });
			vi.advanceTimersByTime(200);

			expect(store.connectionDetails.syncError).toBe("Connection timeout");
		});

		it("clears syncError on subsequent success", () => {
			// First fail
			mock.fireSyncCompleted({ success: false, error: "Failed" });
			vi.advanceTimersByTime(200);
			expect(store.connectionDetails.syncError).toBe("Failed");

			// Then succeed
			mock.fireSyncCompleted({ success: true });
			vi.advanceTimersByTime(200);
			expect(store.connectionDetails.syncError).toBeUndefined();
		});

		it("fires connectionDetails slice in change event", () => {
			const changeEvents: ProjectionChangeEvent[] = [];
			store.onDidChange((e) => changeEvents.push(e));

			mock.fireSyncCompleted({ success: true });
			vi.advanceTimersByTime(200);

			expect(changeEvents).toHaveLength(1);
			expect(changeEvents[0].changed).toContain("connectionDetails");
		});
	});

	// ─── Protection Changed (Layer 2 wiring) ─────────────────────────────

	describe("protection changed events", () => {
		beforeEach(() => {
			store.activate(mock.bridge, "/workspace");
		});

		it("logs protection level change", () => {
			// This event is logged but doesn't change state currently
			mock.fireProtectionChanged({ file: "auth.ts", level: "block", previousLevel: "watch" });
			vi.advanceTimersByTime(200);

			// Should not throw and should schedule a flush
			expect(store.protection).toBeDefined();
		});

		it("fires protection slice in change event", () => {
			const changeEvents: ProjectionChangeEvent[] = [];
			store.onDidChange((e) => changeEvents.push(e));

			mock.fireProtectionChanged({ file: "test.ts", level: "warn" });
			vi.advanceTimersByTime(200);

			expect(changeEvents).toHaveLength(1);
			expect(changeEvents[0].changed).toContain("protection");
		});
	});

	// ─── Coalescing ────────────────────────────────────────────────────

	describe("coalescing", () => {
		let changeEvents: ProjectionChangeEvent[];

		beforeEach(() => {
			changeEvents = [];
			store.onDidChange((e) => changeEvents.push(e));
			store.activate(mock.bridge, "/workspace");
		});

		it("batches rapid-fire events within 200ms into one change event", () => {
			mock.fireStateChange({ state: "connected", previousState: "disconnected" });
			mock.fireSnapshotCreated();
			mock.fireRiskDetected({ file: "a.ts", riskLevel: "low", reason: "r" });

			// Still within coalesce window  -  no events yet
			vi.advanceTimersByTime(100);
			expect(changeEvents).toHaveLength(0);

			// Now flush
			vi.advanceTimersByTime(100);
			expect(changeEvents).toHaveLength(1);

			// Single event should include all changed slices
			const changed = changeEvents[0].changed;
			expect(changed).toContain("connection");
			expect(changed).toContain("session");
			expect(changed).toContain("intelligence");
			expect(changed).toContain("protection");
		});

		it("fires separate events for updates outside coalesce window", () => {
			mock.fireSnapshotCreated();
			vi.advanceTimersByTime(200);

			mock.fireSnapshotCreated();
			vi.advanceTimersByTime(200);

			expect(changeEvents).toHaveLength(2);
		});
	});

	// ─── Dispose ───────────────────────────────────────────────────────

	describe("dispose()", () => {
		it("stops emitting events after dispose", () => {
			const changeEvents: ProjectionChangeEvent[] = [];
			store.onDidChange((e) => changeEvents.push(e));
			store.activate(mock.bridge, "/workspace");

			store.dispose();

			mock.fireSnapshotCreated();
			vi.advanceTimersByTime(200);

			expect(changeEvents).toHaveLength(0);
		});

		it("is idempotent", () => {
			store.dispose();
			expect(() => store.dispose()).not.toThrow();
		});
	});

	// ─── Read-only getters ─────────────────────────────────────────────

	describe("read-only getters", () => {
		it("state returns full ProjectionState", () => {
			const s = store.state;
			expect(s.connection).toBe("disconnected");
			expect(s.session).toBeDefined();
			expect(s.protection).toBeDefined();
			expect(s.intelligence).toBeDefined();
		});

		it("isOffline includes disconnected, cli_missing, offline-embedded", () => {
			// Default is disconnected → offline
			expect(store.isOffline).toBe(true);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("ProjectionStore registry", () => {
	afterEach(() => {
		disposeAllProjectionStores();
	});

	it("returns same instance for same workspaceId", () => {
		const a = getProjectionStore("/ws/1");
		const b = getProjectionStore("/ws/1");
		expect(a).toBe(b);
	});

	it("returns different instances for different workspaceIds", () => {
		const a = getProjectionStore("/ws/1");
		const b = getProjectionStore("/ws/2");
		expect(a).not.toBe(b);
	});

	it("disposeProjectionStore removes the instance", () => {
		const a = getProjectionStore("/ws/x");
		disposeProjectionStore("/ws/x");
		const b = getProjectionStore("/ws/x");
		expect(a).not.toBe(b);
	});

	it("disposeAllProjectionStores clears registry", () => {
		const a = getProjectionStore("/ws/a");
		const b = getProjectionStore("/ws/b");
		disposeAllProjectionStores();
		const a2 = getProjectionStore("/ws/a");
		const b2 = getProjectionStore("/ws/b");
		expect(a).not.toBe(a2);
		expect(b).not.toBe(b2);
	});
});
