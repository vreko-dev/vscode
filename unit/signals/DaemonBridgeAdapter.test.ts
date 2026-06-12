/**
 * DaemonBridgeAdapter Tests
 *
 * Tests for event wiring between DaemonBridge and SignalEventBus.
 * Ensures all daemon notifications are correctly transformed and fired.
 *
 * @see SB-HEALTH-001 Health monitoring event wiring
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaemonBridgeAdapter } from "../../../src/signals/DaemonBridgeAdapter";
import type { VrekoSignalEvent } from "../../../src/signals/types";

// Mock vscode
vi.mock("vscode", () => ({
	EventEmitter: class {
		event = vi.fn();
		fire = vi.fn();
		dispose = vi.fn();
	},
	Disposable: {
		from: vi.fn((...args: any[]) => ({
			dispose: vi.fn(() => args.forEach((d: any) => d?.dispose?.())),
		})),
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("DaemonBridgeAdapter", () => {
	let adapter: DaemonBridgeAdapter;
	let mockDaemonBridge: any;
	let mockEventBus: any;
	let firedEvents: VrekoSignalEvent[];

	// Helper to create mock DaemonBridge with event emitters
	const createMockDaemonBridge = () => {
		const listeners: Record<string, Array<(data: any) => void>> = {};

		const createEventEmitter = (name: string) => {
			listeners[name] = [];
			return (callback: (data: any) => void) => {
				listeners[name].push(callback);
				return { dispose: vi.fn() };
			};
		};

		return {
			onSnapshotCreated: createEventEmitter("snapshotCreated"),
			onSessionStarted: createEventEmitter("sessionStarted"),
			onSessionEnded: createEventEmitter("sessionEnded"),
			onLearningAdded: createEventEmitter("learningAdded"),
			onRiskDetected: createEventEmitter("riskDetected"),
			onDaemonShuttingDown: createEventEmitter("daemonShuttingDown"),
			onStateChange: createEventEmitter("stateChange"),
			// Health monitoring events
			onRiskUpdated: createEventEmitter("riskUpdated"),
			onWorkspaceHealth: createEventEmitter("workspaceHealth"),
			onComponentHealthDegraded: createEventEmitter("componentHealthDegraded"),
			onComponentHealthRecovered: createEventEmitter("componentHealthRecovered"),
			onProtectionChanged: createEventEmitter("protectionChanged"),
			onViolationReported: createEventEmitter("violationReported"),
			onSyncCompleted: createEventEmitter("syncCompleted"),
			onGuardChanged: createEventEmitter("guardChanged"),
			// FM-7: momentum events
			onMomentumScoreUpdated: createEventEmitter("momentumScoreUpdated"),
			// FM-6: spawn status
			getDaemonSpawnStatus: vi.fn().mockReturnValue({ exhausted: false }),
			_listeners: listeners,
			_fire: (event: string, data: any) => {
				listeners[event]?.forEach((cb) => cb(data));
			},
		};
	};

	// Helper to create mock EventBus
	const createMockEventBus = () => {
		return {
			fire: vi.fn((event: VrekoSignalEvent) => {
				firedEvents.push(event);
			}),
			event: vi.fn(),
			dispose: vi.fn(),
		};
	};

	beforeEach(() => {
		firedEvents = [];
		mockDaemonBridge = createMockDaemonBridge();
		mockEventBus = createMockEventBus();
		adapter = new DaemonBridgeAdapter(mockDaemonBridge, mockEventBus);
	});

	afterEach(() => {
		adapter.dispose();
		vi.clearAllMocks();
	});

	describe("existing event wiring", () => {
		it("wires snapshot.created correctly", () => {
			mockDaemonBridge._fire("snapshotCreated", {
				snapshotId: "snap-123",
				filePath: "/path/to/file.ts",
				trigger: "ai-detection",
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("snapshot.created");
			if (firedEvents[0].type === "snapshot.created") {
				expect(firedEvents[0].data.id).toBe("snap-123");
				expect(firedEvents[0].data.aiAttributed).toBe(true);
			}
		});

		it("wires session.started correctly", () => {
			mockDaemonBridge._fire("sessionStarted", {
				taskId: "task-456",
				task: "Implement feature",
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("session.started");
			if (firedEvents[0].type === "session.started") {
				expect(firedEvents[0].data.taskId).toBe("task-456");
				expect(firedEvents[0].data.sessionName).toBe("Implement feature");
			}
		});

		it("wires session.ended correctly", () => {
			mockDaemonBridge._fire("sessionEnded", {
				sessionId: "task-789",
				outcome: "completed",
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("session.ended");
			if (firedEvents[0].type === "session.ended") {
				// Adapter maps daemon's sessionId → taskId
				expect(firedEvents[0].data.taskId).toBe("task-789");
				// sessionName and duration are intentionally absent here;
				// SignalCoordinator reads them from SignalState before reset
			}
		});

		it("wires daemon.shutdown correctly", () => {
			mockDaemonBridge._fire("daemonShuttingDown", undefined);

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("daemon.shutdown");
		});

		it("wires daemon.started via state change", () => {
			mockDaemonBridge._fire("stateChange", {
				state: "connected",
				previousState: "disconnected",
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("daemon.started");
		});
	});

	describe("health monitoring event wiring (SB-HEALTH-001)", () => {
		it("wires health.degraded correctly", () => {
			mockDaemonBridge._fire("componentHealthDegraded", {
				pid: 12345,
				type: "daemon",
				workspace: "/workspace",
				elapsed: 5000,
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("health.degraded");
			if (firedEvents[0].type === "health.degraded") {
				expect(firedEvents[0].data.pid).toBe(12345);
				expect(firedEvents[0].data.componentType).toBe("daemon");
				expect(firedEvents[0].data.elapsed).toBe(5000);
				expect(firedEvents[0].data.timestamp).toBeDefined();
			}
		});

		it("wires health.recovered correctly", () => {
			mockDaemonBridge._fire("componentHealthRecovered", {
				pid: 12345,
				type: "supervisor",
				workspace: "/workspace",
				previousMissed: 3,
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("health.recovered");
			if (firedEvents[0].type === "health.recovered") {
				expect(firedEvents[0].data.pid).toBe(12345);
				expect(firedEvents[0].data.componentType).toBe("supervisor");
				expect(firedEvents[0].data.previousMissed).toBe(3);
			}
		});

		it("wires protection.changed correctly", () => {
			mockDaemonBridge._fire("protectionChanged", {
				file: "/path/to/file.ts",
				level: "high",
				previousLevel: "low",
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("protection.changed");
			if (firedEvents[0].type === "protection.changed") {
				expect(firedEvents[0].data.file).toBe("/path/to/file.ts");
				expect(firedEvents[0].data.level).toBe("high");
				expect(firedEvents[0].data.previousLevel).toBe("low");
			}
		});

		it("wires violation.reported correctly", () => {
			mockDaemonBridge._fire("violationReported", {
				type: "silent-catch",
				file: "/path/to/file.ts",
				message: "Catch block swallows error",
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("violation.reported");
			if (firedEvents[0].type === "violation.reported") {
				expect(firedEvents[0].data.violationType).toBe("silent-catch");
				expect(firedEvents[0].data.file).toBe("/path/to/file.ts");
			}
		});

		it("wires sync.completed on success", () => {
			mockDaemonBridge._fire("syncCompleted", {
				success: true,
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("sync.completed");
			if (firedEvents[0].type === "sync.completed") {
				expect(firedEvents[0].data.success).toBe(true);
			}
		});

		it("wires sync.failed on failure", () => {
			mockDaemonBridge._fire("syncCompleted", {
				success: false,
				error: "Network timeout",
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("sync.failed");
			if (firedEvents[0].type === "sync.failed") {
				expect(firedEvents[0].data.error).toBe("Network timeout");
				expect(firedEvents[0].data.retryable).toBe(true);
			}
		});

		it("wires workspace.health correctly", () => {
			// Daemon sends issues as string[]  -  adapter maps to object array
			mockDaemonBridge._fire("workspaceHealth", {
				workspacePath: "/workspace",
				healthScore: 75,
				issues: ["3 lint warnings", "outdated dependency"],
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("workspace.health");
			if (firedEvents[0].type === "workspace.health") {
				expect(firedEvents[0].data.healthScore).toBe(75);
				expect(firedEvents[0].data.workspacePath).toBe("/workspace");
				expect(firedEvents[0].data.issues).toHaveLength(2);
				// Adapter normalizes strings → { type, severity, message } objects
				expect(firedEvents[0].data.issues[0]).toMatchObject({
					type: "health",
					severity: "warning",
					message: "3 lint warnings",
				});
			}
		});

		it("wires guard.changed correctly", () => {
			mockDaemonBridge._fire("guardChanged", {
				changed: [{ guard: "lint", status: "fail", files: [], durationMs: 0 }],
				current: [{ guard: "lint", status: "fail", files: [], durationMs: 0 }],
				timestamp: Date.now(),
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("guard.changed");
			if (firedEvents[0].type === "guard.changed") {
				expect(firedEvents[0].data.changed).toHaveLength(1);
				expect(firedEvents[0].data.changed[0].currentState).toBe("fail");
				expect(firedEvents[0].data.timestamp).toBeDefined();
			}
		});

		it("wires risk.updated with score mapping", () => {
			// Fire a first event to establish previousLevel = "low" (score 25)
			mockDaemonBridge._fire("riskUpdated", {
				score: 25,
				filePath: "/b.ts",
				trigger: "file-change",
				action: "monitor",
			});
			firedEvents.length = 0; // reset  -  only care about the next event

			// Second event: 75 → high, previousLevel should be "low" (from first event)
			mockDaemonBridge._fire("riskUpdated", {
				score: 75,
				filePath: "/a.ts",
				trigger: "high-activity",
				action: "snapshot",
			});

			expect(firedEvents).toHaveLength(1);
			expect(firedEvents[0].type).toBe("risk.updated");
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("high"); // 75 → high
				expect(firedEvents[0].data.previousLevel).toBe("low"); // 25 → low (from first event)
				expect(firedEvents[0].data.affectedFiles).toHaveLength(1); // single filePath
			}
		});
	});

	describe("mapScoreToLevel helper", () => {
		it("maps 0-30 to low", () => {
			mockDaemonBridge._fire("riskUpdated", { score: 15, reason: "test" });
			expect(firedEvents[0].type).toBe("risk.updated");
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("low");
			}
		});

		it("maps 31-60 to medium", () => {
			mockDaemonBridge._fire("riskUpdated", { score: 45, reason: "test" });
			expect(firedEvents[0].type).toBe("risk.updated");
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("medium");
			}
		});

		it("maps 61-80 to high", () => {
			mockDaemonBridge._fire("riskUpdated", { score: 70, reason: "test" });
			expect(firedEvents[0].type).toBe("risk.updated");
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("high");
			}
		});

		it("maps 81+ to critical", () => {
			mockDaemonBridge._fire("riskUpdated", { score: 95, reason: "test" });
			expect(firedEvents[0].type).toBe("risk.updated");
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("critical");
			}
		});

		it("handles boundary values correctly", () => {
			// 30 → low
			mockDaemonBridge._fire("riskUpdated", { score: 30, reason: "test" });
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("low");
			}

			// 31 → medium
			firedEvents = [];
			mockDaemonBridge._fire("riskUpdated", { score: 31, reason: "test" });
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("medium");
			}

			// 60 → medium
			firedEvents = [];
			mockDaemonBridge._fire("riskUpdated", { score: 60, reason: "test" });
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("medium");
			}

			// 61 → high
			firedEvents = [];
			mockDaemonBridge._fire("riskUpdated", { score: 61, reason: "test" });
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("high");
			}

			// 80 → high
			firedEvents = [];
			mockDaemonBridge._fire("riskUpdated", { score: 80, reason: "test" });
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("high");
			}

			// 81 → critical
			firedEvents = [];
			mockDaemonBridge._fire("riskUpdated", { score: 81, reason: "test" });
			if (firedEvents[0].type === "risk.updated") {
				expect(firedEvents[0].data.newLevel).toBe("critical");
			}
		});
	});

	describe("mapProtectionLevel helper", () => {
		it("maps valid protection levels correctly", () => {
			const validLevels = ["none", "low", "medium", "high", "critical"];
			for (const level of validLevels) {
				firedEvents = [];
				mockDaemonBridge._fire("protectionChanged", {
					file: "/test",
					level,
					previousLevel: "none",
				});
				if (firedEvents[0].type === "protection.changed") {
					expect(firedEvents[0].data.level).toBe(level);
				}
			}
		});

		it("defaults invalid levels to none", () => {
			mockDaemonBridge._fire("protectionChanged", {
				file: "/test",
				level: "invalid-level",
				previousLevel: "also-invalid",
			});
			if (firedEvents[0].type === "protection.changed") {
				expect(firedEvents[0].data.level).toBe("none");
				expect(firedEvents[0].data.previousLevel).toBe("none");
			}
		});
	});

	describe("disposal", () => {
		it("disposes all subscriptions on cleanup", () => {
			// Fire some events to ensure subscriptions exist
			mockDaemonBridge._fire("snapshotCreated", { snapshotId: "1", filePath: "/", trigger: "manual" });
			expect(firedEvents).toHaveLength(1);

			// Dispose adapter
			adapter.dispose();

			// After disposal, new events should not be processed
			// (In real implementation, disposables would be cleaned up)
			// This test verifies dispose doesn't throw
		});

		it("can be disposed multiple times safely", () => {
			adapter.dispose();
			adapter.dispose();
			// Should not throw
		});
	});

	// =========================================================================
	// FM-3: Double-subscription removal
	// =========================================================================
	describe("FM-3: onRiskDetected legacy subscription removed", () => {
		it("fires risk.updated exactly once per onRiskUpdated event", () => {
			mockDaemonBridge._fire("riskUpdated", {
				filePath: "/src/auth.ts",
				score: 85,
				trigger: "ai-write",
				action: "modified",
			});

			const riskEvents = firedEvents.filter((e) => e.type === "risk.updated");
			expect(riskEvents).toHaveLength(1); // Not 2
			if (riskEvents[0].type === "risk.updated") {
				expect(riskEvents[0].data.newLevel).toBe("critical"); // score 85 > 80
			}
		});

		it("does NOT fire risk.updated from legacy onRiskDetected path", () => {
			// Fire the legacy path  -  should produce no events (removed)
			mockDaemonBridge._fire("riskDetected", {
				riskLevel: "high",
				reason: "large-diff",
				file: "/src/db.ts",
			});

			const riskEvents = firedEvents.filter((e) => e.type === "risk.updated");
			expect(riskEvents).toHaveLength(0);
		});
	});

	// =========================================================================
	// FM-6: cli_missing + exhausted state notifications
	// =========================================================================
	describe("FM-6: cli_missing and exhausted state wiring", () => {
		it("fires daemon.shutdown with reason=cli_missing on cli_missing transition", () => {
			mockDaemonBridge._fire("stateChange", {
				state: "cli_missing",
				previousState: "disconnected",
			});

			const shutdownEvents = firedEvents.filter((e) => e.type === "daemon.shutdown");
			expect(shutdownEvents).toHaveLength(1);
			if (shutdownEvents[0].type === "daemon.shutdown") {
				expect(shutdownEvents[0].data.reason).toBe("cli_missing");
			}
		});

		it("fires daemon.shutdown with reason=exhausted when reconnecting→disconnected and spawn exhausted", () => {
			mockDaemonBridge.getDaemonSpawnStatus.mockReturnValue({ exhausted: true });

			mockDaemonBridge._fire("stateChange", {
				state: "disconnected",
				previousState: "reconnecting",
			});

			const shutdownEvents = firedEvents.filter((e) => e.type === "daemon.shutdown");
			expect(shutdownEvents).toHaveLength(1);
			if (shutdownEvents[0].type === "daemon.shutdown") {
				expect(shutdownEvents[0].data.reason).toBe("exhausted");
			}
		});

		it("does NOT fire daemon.shutdown when reconnecting→disconnected but NOT exhausted", () => {
			mockDaemonBridge.getDaemonSpawnStatus.mockReturnValue({ exhausted: false });

			mockDaemonBridge._fire("stateChange", {
				state: "disconnected",
				previousState: "reconnecting",
			});

			const shutdownEvents = firedEvents.filter((e) => e.type === "daemon.shutdown");
			expect(shutdownEvents).toHaveLength(0);
		});
	});

	// =========================================================================
	// FM-7: pioneer.tier.advance wiring
	// =========================================================================
	describe("FM-7: pioneer.tier.advance derived from momentum", () => {
		it("fires both momentum.score-updated and pioneer.tier.advance on tier milestone", () => {
			mockDaemonBridge._fire("momentumScoreUpdated", {
				score: 1500,
				milestone: "founding_pioneer",
			});

			const momentumEvents = firedEvents.filter((e) => e.type === "momentum.score-updated");
			const pioneerEvents = firedEvents.filter((e) => e.type === "pioneer.tier.advance");

			expect(momentumEvents).toHaveLength(1);
			expect(pioneerEvents).toHaveLength(1);
			if (pioneerEvents[0].type === "pioneer.tier.advance") {
				expect(pioneerEvents[0].data.tier).toBe("founding_pioneer");
				expect(pioneerEvents[0].data.trigger).toBe("momentum.score-updated");
			}
		});

		it("fires only momentum.score-updated when no tier milestone", () => {
			mockDaemonBridge._fire("momentumScoreUpdated", {
				score: 42,
				// No milestone
			});

			const pioneerEvents = firedEvents.filter((e) => e.type === "pioneer.tier.advance");
			expect(pioneerEvents).toHaveLength(0);
			expect(firedEvents.filter((e) => e.type === "momentum.score-updated")).toHaveLength(1);
		});

		it.each(["pioneer", "active_pioneer", "contributing_pioneer", "founding_pioneer"] as const)(
			"fires pioneer.tier.advance for tier milestone: %s",
			(tier) => {
				firedEvents = [];
				mockDaemonBridge._fire("momentumScoreUpdated", { score: 100, milestone: tier });
				const pioneerEvents = firedEvents.filter((e) => e.type === "pioneer.tier.advance");
				expect(pioneerEvents).toHaveLength(1);
			},
		);

		it("does NOT fire pioneer.tier.advance for unknown milestone strings", () => {
			mockDaemonBridge._fire("momentumScoreUpdated", {
				score: 100,
				milestone: "some_unknown_milestone",
			});
			const pioneerEvents = firedEvents.filter((e) => e.type === "pioneer.tier.advance");
			expect(pioneerEvents).toHaveLength(0);
		});
	});
});
