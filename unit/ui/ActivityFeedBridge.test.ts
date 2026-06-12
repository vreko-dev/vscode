/**
 * ActivityFeedBridge Unit Tests
 *
 * Tests the bridge that translates ProjectionStore change events into
 * ActivityEvent items for the webview activity feed.
 *
 * TEST PATHS:
 * 1. Happy: Projection changes → activity events (snapshot, session, risk, connection)
 * 2. Sad: No push callback → events still stored internally
 * 3. Edge: Deduplication, max capacity, connection transitions
 *
 * @regression-marker These tests prevent regression in:
 * - Event translation per slice (session, protection, intelligence, connection)
 * - Deduplication (2s minimum interval per event type)
 * - Max capacity ring-buffer (200 events)
 * - Connection degradation/recovery messages (save-path contract)
 * - Privacy: file paths truncated to basename
 *
 * @see ActivityFeedBridge.ts
 * @see vreko_surface.md "Webview Visibility Policy"
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
	};
});

import { ActivityFeedBridge } from "../../../src/ui/ActivityFeedBridge";
import type { ActivityEvent } from "../../../src/services/workspace-data/types";
import type { ProjectionChangeEvent, ProjectionState } from "../../../src/ui/types";
import { createDefaultProjectionState } from "../../../src/ui/types";

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

type ChangeCallback = (event: ProjectionChangeEvent) => void;

function createMockProjectionStore() {
	const callbacks: ChangeCallback[] = [];
	let currentState = createDefaultProjectionState();

	const store = {
		get state() {
			return currentState;
		},
		onDidChange: vi.fn((cb: ChangeCallback) => {
			callbacks.push(cb);
			return { dispose: () => callbacks.splice(callbacks.indexOf(cb), 1) };
		}),
	} as any;

	return {
		store,
		fireChange: (changed: (keyof ProjectionState)[], stateOverrides: Partial<ProjectionState> = {}) => {
			currentState = { ...currentState, ...stateOverrides };
			const event: ProjectionChangeEvent = { changed, state: currentState };
			for (const cb of callbacks) cb(event);
		},
		setState: (overrides: Partial<ProjectionState>) => {
			currentState = { ...currentState, ...overrides };
		},
	};
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("ActivityFeedBridge", () => {
	let bridge: ActivityFeedBridge;
	let mockStore: ReturnType<typeof createMockProjectionStore>;
	let pushedEvents: ActivityEvent[];

	beforeEach(() => {
		vi.useFakeTimers();
		mockStore = createMockProjectionStore();
		bridge = new ActivityFeedBridge(mockStore.store);
		pushedEvents = [];
		bridge.wireTo((event: ActivityEvent) => pushedEvents.push(event));
	});

	afterEach(() => {
		bridge.dispose();
		vi.useRealTimers();
	});

	// ─── Session Events ────────────────────────────────────────────────

	describe("session events", () => {
		it("emits snapshot event when snapshot count increases", () => {
			// Set previous state to active session with 0 snapshots
			mockStore.setState({
				session: {
					active: true,
					filesModified: 2,
					snapshotCount: 0,
					totalRecentSnapshots: 0,
					durationSeconds: 30,
					task: "Fix auth",
				},
			});
			// Fire once so bridge records previous state
			mockStore.fireChange(["session"], {
				session: {
					active: true,
					filesModified: 2,
					snapshotCount: 0,
					totalRecentSnapshots: 0,
					durationSeconds: 30,
					task: "Fix auth",
				},
			});
			pushedEvents = [];
			vi.advanceTimersByTime(2100);

			// Now increment snapshot count
			mockStore.fireChange(["session"], {
				session: {
					active: true,
					filesModified: 3,
					snapshotCount: 1,
					totalRecentSnapshots: 1,
					durationSeconds: 60,
					task: "Fix auth",
				},
			});

			expect(pushedEvents).toHaveLength(1);
			expect(pushedEvents[0].type).toBe("daemon-snapshot");
			expect(pushedEvents[0].details).toContain("Snapshot #1");
		});

		it("emits session-start when session becomes active", () => {
			mockStore.fireChange(["session"], {
				session: {
					active: true,
					filesModified: 0,
					snapshotCount: 0,
					totalRecentSnapshots: 0,
					durationSeconds: 0,
					task: "Refactor DB",
				},
			});

			const sessionEvent = pushedEvents.find((e) => e.type === "daemon-session");
			expect(sessionEvent).toBeDefined();
			expect(sessionEvent!.details).toBe("Session started");
			expect(sessionEvent!.icon).toBe("▶️");
		});

		it("emits session-end when session deactivates", () => {
			// First, make session active
			mockStore.setState({
				session: {
					active: true,
					filesModified: 5,
					snapshotCount: 3,
					totalRecentSnapshots: 3,
					durationSeconds: 300,
					task: "Refactor DB",
				},
			});

			// Fire initial change so bridge tracks previous state
			mockStore.fireChange(["session"], {
				session: {
					active: true,
					filesModified: 5,
					snapshotCount: 3,
					totalRecentSnapshots: 3,
					durationSeconds: 300,
					task: "Refactor DB",
				},
			});
			pushedEvents = [];

			// Advance past dedup window
			vi.advanceTimersByTime(2100);

			// Now end session
			mockStore.fireChange(["session"], {
				session: {
					active: false,
					filesModified: 0,
					snapshotCount: 0,
					totalRecentSnapshots: 3,
					durationSeconds: 0,
				},
			});

			const endEvent = pushedEvents.find((e) => e.details?.includes("Session ended"));
			expect(endEvent).toBeDefined();
			expect(endEvent!.icon).toBe("⏹️");
		});
	});

	// ─── Protection / Risk Events ──────────────────────────────────────

	describe("protection events", () => {
		it("emits risk event for high-severity signal", () => {
			mockStore.fireChange(["protection"], {
				protection: {
					currentLevel: "warn",
					protectedFileCount: 10,
					levelCounts: { watch: 5, warn: 3, block: 2 },
					riskSignals: [
						{ level: "high", description: "AI-generated code detected", filePath: "/src/auth/login.ts" },
					],
				},
			});

			expect(pushedEvents).toHaveLength(1);
			expect(pushedEvents[0].type).toBe("daemon-risk");
			// Privacy: file path truncated to basename
			expect(pushedEvents[0].file).toBe("login.ts");
			expect(pushedEvents[0].icon).toBe("⚠️");
		});

		it("uses shield icon for low-severity risk", () => {
			mockStore.fireChange(["protection"], {
				protection: {
					currentLevel: "watch",
					protectedFileCount: 1,
					levelCounts: { watch: 1, warn: 0, block: 0 },
					riskSignals: [
						{ level: "low", description: "Minor change" },
					],
				},
			});

			expect(pushedEvents[0].icon).toBe("🛡️");
		});
	});

	// ─── Connection / Degradation Events ───────────────────────────────

	describe("connection events (save-path contract)", () => {
		it("emits degradation event on connected → degraded", () => {
			// Set previous state to connected
			mockStore.setState({ connection: "connected" });
			mockStore.fireChange(["connection"], { connection: "connected" });
			pushedEvents = [];

			vi.advanceTimersByTime(2100);

			// Now degrade
			mockStore.fireChange(["connection"], { connection: "degraded" });

			const event = pushedEvents.find((e) => e.details?.includes("degraded"));
			expect(event).toBeDefined();
			expect(event!.details).toContain("Saves not blocked");
			expect(event!.icon).toBe("⚠️");
		});

		it("emits offline event on connected → disconnected", () => {
			mockStore.setState({ connection: "connected" });
			mockStore.fireChange(["connection"], { connection: "connected" });
			pushedEvents = [];

			vi.advanceTimersByTime(2100);

			mockStore.fireChange(["connection"], { connection: "disconnected" });

			const event = pushedEvents.find((e) => e.details?.includes("Daemon offline"));
			expect(event).toBeDefined();
			expect(event!.details).toContain("local protection continues");
		});

		it("emits CLI-missing event on connected → cli_missing", () => {
			mockStore.setState({ connection: "connected" });
			mockStore.fireChange(["connection"], { connection: "connected" });
			pushedEvents = [];

			vi.advanceTimersByTime(2100);

			mockStore.fireChange(["connection"], { connection: "cli_missing" });

			const event = pushedEvents.find((e) => e.details?.includes("CLI not found"));
			expect(event).toBeDefined();
		});

		it("emits recovery event on degraded → connected", () => {
			mockStore.setState({ connection: "degraded" });
			mockStore.fireChange(["connection"], { connection: "degraded" });
			pushedEvents = [];

			vi.advanceTimersByTime(2100);

			mockStore.fireChange(["connection"], { connection: "connected" });

			const event = pushedEvents.find((e) => e.details?.includes("full protection active"));
			expect(event).toBeDefined();
			expect(event!.icon).toBe("✅");
		});

		it("does not emit for same-state transitions", () => {
			mockStore.setState({ connection: "connected" });
			mockStore.fireChange(["connection"], { connection: "connected" });
			pushedEvents = [];

			vi.advanceTimersByTime(2100);

			// Same state again
			mockStore.fireChange(["connection"], { connection: "connected" });

			// No connection events expected (same state = no-op)
			const connectionEvents = pushedEvents.filter((e) => e.type === "daemon-protection");
			expect(connectionEvents).toHaveLength(0);
		});
	});

	// ─── Intelligence Events ───────────────────────────────────────────

	describe("intelligence events", () => {
		it("emits AI activity event when AI tool detected", () => {
			mockStore.fireChange(["intelligence"], {
				intelligence: {
					fragileFiles: [],
					riskEventCount: 0,
					aiActivityCount: 1,
					lastDetectedAITool: "copilot",
				},
			});

			expect(pushedEvents).toHaveLength(1);
			expect(pushedEvents[0].type).toBe("daemon-protection");
			expect(pushedEvents[0].details).toContain("AI activity detected");
			expect(pushedEvents[0].icon).toBe("🤖");
		});

		it("does not emit when aiActivityCount is 0", () => {
			mockStore.fireChange(["intelligence"], {
				intelligence: {
					fragileFiles: [],
					riskEventCount: 1,
					aiActivityCount: 0,
				},
			});

			// No AI events (riskEventCount is tracked via protection slice, not intelligence)
			expect(pushedEvents).toHaveLength(0);
		});
	});

	// ─── Deduplication ─────────────────────────────────────────────────

	describe("deduplication", () => {
		it("suppresses same event type within 2s window", () => {
			mockStore.fireChange(["protection"], {
				protection: {
					currentLevel: "warn",
					protectedFileCount: 1,
					levelCounts: { watch: 0, warn: 1, block: 0 },
					riskSignals: [{ level: "high", description: "risk 1" }],
				},
			});

			expect(pushedEvents).toHaveLength(1);

			// Fire again within 2s  -  should be suppressed
			mockStore.fireChange(["protection"], {
				protection: {
					currentLevel: "warn",
					protectedFileCount: 1,
					levelCounts: { watch: 0, warn: 1, block: 0 },
					riskSignals: [{ level: "high", description: "risk 2" }],
				},
			});

			expect(pushedEvents).toHaveLength(1); // Still 1

			// After 2s, new events allowed
			vi.advanceTimersByTime(2100);
			mockStore.fireChange(["protection"], {
				protection: {
					currentLevel: "warn",
					protectedFileCount: 1,
					levelCounts: { watch: 0, warn: 1, block: 0 },
					riskSignals: [{ level: "high", description: "risk 3" }],
				},
			});

			expect(pushedEvents).toHaveLength(2);
		});

		it("allows different event types concurrently", () => {
			mockStore.fireChange(["session"], {
				session: {
					active: true,
					filesModified: 0,
					snapshotCount: 1,
					totalRecentSnapshots: 1,
					durationSeconds: 0,
					task: "Fix",
				},
			});

			mockStore.fireChange(["protection"], {
				protection: {
					currentLevel: "warn",
					protectedFileCount: 1,
					levelCounts: { watch: 0, warn: 1, block: 0 },
					riskSignals: [{ level: "low", description: "risk" }],
				},
			});

			// Should have both: daemon-snapshot + daemon-session + daemon-risk
			expect(pushedEvents.length).toBeGreaterThanOrEqual(2);
		});
	});

	// ─── Max Capacity ──────────────────────────────────────────────────

	describe("max capacity", () => {
		it("trims events beyond MAX_DAEMON_EVENTS (200)", () => {
			// Generate 210 events with unique types to avoid dedup
			for (let i = 0; i < 210; i++) {
				vi.advanceTimersByTime(2100); // Past dedup window
				mockStore.fireChange(["session"], {
					session: {
						active: true,
						filesModified: 0,
						snapshotCount: i + 1,
						totalRecentSnapshots: i + 1,
						durationSeconds: 0,
						task: `task-${i}`,
					},
				});
			}

			expect(bridge.events.length).toBeLessThanOrEqual(200);
		});
	});

	// ─── Wire & Internal Storage ───────────────────────────────────────

	describe("wireTo and internal storage", () => {
		it("stores events even without push callback", () => {
			const unwiredBridge = new ActivityFeedBridge(mockStore.store);

			mockStore.fireChange(["session"], {
				session: {
					active: true,
					filesModified: 0,
					snapshotCount: 1,
					totalRecentSnapshots: 1,
					durationSeconds: 0,
					task: "Test",
				},
			});

			expect(unwiredBridge.events.length).toBeGreaterThan(0);
			unwiredBridge.dispose();
		});

		it("fires onDaemonActivity event", () => {
			const firedEvents: ActivityEvent[] = [];
			bridge.onDaemonActivity((e) => firedEvents.push(e));

			mockStore.fireChange(["session"], {
				session: {
					active: true,
					filesModified: 0,
					snapshotCount: 1,
					totalRecentSnapshots: 1,
					durationSeconds: 0,
					task: "Test",
				},
			});

			expect(firedEvents.length).toBeGreaterThan(0);
		});
	});

	// ─── Dispose ───────────────────────────────────────────────────────

	describe("dispose()", () => {
		it("clears events on dispose", () => {
			mockStore.fireChange(["session"], {
				session: {
					active: true,
					filesModified: 0,
					snapshotCount: 1,
					totalRecentSnapshots: 1,
					durationSeconds: 0,
				},
			});

			expect(bridge.events.length).toBeGreaterThan(0);

			bridge.dispose();
			expect(bridge.events).toHaveLength(0);
		});
	});
});
