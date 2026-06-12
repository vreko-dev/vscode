/**
 * Signal Types Tests
 *
 * Tests for VrekoSignalEvent type narrowing and interface validation.
 * Ensures TypeScript discriminated unions work correctly at runtime.
 *
 * @see SB-HEALTH-001 Health monitoring event types
 */

import { describe, expect, it } from "vitest";
import type {
	GuardChangedEventData,
	HealthDegradedEventData,
	HealthRecoveredEventData,
	ProtectionChangedEventData,
	VrekoSignalEvent,
	SyncCompletedEventData,
	SyncFailedEventData,
	ViolationReportedEventData,
	WorkspaceHealthEventData,
} from "../../../src/signals/types";

describe("VrekoSignalEvent type narrowing", () => {
	describe("health.degraded event", () => {
		it("narrows correctly with all required fields", () => {
			const event: VrekoSignalEvent = {
				type: "health.degraded",
				data: {
					pid: 12345,
					componentType: "daemon",
					workspace: "/path/to/workspace",
					elapsed: 5000,
					timestamp: Date.now(),
				},
			};

			if (event.type === "health.degraded") {
				expect(event.data.pid).toBe(12345);
				expect(event.data.componentType).toBe("daemon");
				expect(event.data.workspace).toBe("/path/to/workspace");
				expect(event.data.elapsed).toBe(5000);
				expect(typeof event.data.timestamp).toBe("number");
			} else {
				throw new Error("Type narrowing failed");
			}
		});

		it("accepts supervisor component type", () => {
			const data: HealthDegradedEventData = {
				pid: 1,
				componentType: "supervisor",
				workspace: "/ws",
				elapsed: 100,
				timestamp: Date.now(),
			};
			expect(data.componentType).toBe("supervisor");
		});

		it("accepts mcp component type", () => {
			const data: HealthDegradedEventData = {
				pid: 1,
				componentType: "mcp",
				workspace: "/ws",
				elapsed: 100,
				timestamp: Date.now(),
			};
			expect(data.componentType).toBe("mcp");
		});
	});

	describe("health.recovered event", () => {
		it("narrows correctly with all required fields", () => {
			const event: VrekoSignalEvent = {
				type: "health.recovered",
				data: {
					pid: 12345,
					componentType: "daemon",
					workspace: "/path/to/workspace",
					previousMissed: 3,
					timestamp: Date.now(),
				},
			};

			if (event.type === "health.recovered") {
				expect(event.data.pid).toBe(12345);
				expect(event.data.componentType).toBe("daemon");
				expect(event.data.previousMissed).toBe(3);
			} else {
				throw new Error("Type narrowing failed");
			}
		});

		it("tracks previousMissed count accurately", () => {
			const data: HealthRecoveredEventData = {
				pid: 1,
				componentType: "mcp",
				workspace: "/ws",
				previousMissed: 5,
				timestamp: Date.now(),
			};
			expect(data.previousMissed).toBe(5);
		});
	});

	describe("protection.changed event", () => {
		it("narrows correctly with protection levels", () => {
			const event: VrekoSignalEvent = {
				type: "protection.changed",
				data: {
					file: "/path/to/file.ts",
					level: "high",
					previousLevel: "low",
				},
			};

			if (event.type === "protection.changed") {
				expect(event.data.file).toBe("/path/to/file.ts");
				expect(event.data.level).toBe("high");
				expect(event.data.previousLevel).toBe("low");
			} else {
				throw new Error("Type narrowing failed");
			}
		});

		it("accepts all protection levels", () => {
			const levels: Array<ProtectionChangedEventData["level"]> = ["none", "low", "medium", "high", "critical"];
			for (const level of levels) {
				const data: ProtectionChangedEventData = {
					file: "/test",
					level,
					previousLevel: "none",
				};
				expect(data.level).toBe(level);
			}
		});
	});

	describe("violation.reported event", () => {
		it("narrows correctly with violation data", () => {
			const event: VrekoSignalEvent = {
				type: "violation.reported",
				data: {
					violationType: "silent-catch",
					file: "/path/to/file.ts",
					message: "Catch block swallows error without logging",
				},
			};

			if (event.type === "violation.reported") {
				expect(event.data.violationType).toBe("silent-catch");
				expect(event.data.file).toBe("/path/to/file.ts");
				expect(event.data.message).toContain("swallows");
			} else {
				throw new Error("Type narrowing failed");
			}
		});

		it("accepts various violation types", () => {
			const types = ["silent-catch", "missing-await", "circular-import"];
			for (const violationType of types) {
				const data: ViolationReportedEventData = {
					violationType,
					file: "/test",
					message: "test",
				};
				expect(data.violationType).toBe(violationType);
			}
		});
	});

	describe("sync.completed event", () => {
		it("narrows correctly with success status", () => {
			const event: VrekoSignalEvent = {
				type: "sync.completed",
				data: {
					success: true,
					details: "Synced 5 files",
				},
			};

			if (event.type === "sync.completed") {
				expect(event.data.success).toBe(true);
				expect(event.data.details).toBe("Synced 5 files");
			} else {
				throw new Error("Type narrowing failed");
			}
		});

		it("allows optional details field", () => {
			const data: SyncCompletedEventData = {
				success: true,
			};
			expect(data.details).toBeUndefined();
		});
	});

	describe("sync.failed event", () => {
		it("narrows correctly with error data", () => {
			const event: VrekoSignalEvent = {
				type: "sync.failed",
				data: {
					error: "Network timeout",
					retryable: true,
				},
			};

			if (event.type === "sync.failed") {
				expect(event.data.error).toBe("Network timeout");
				expect(event.data.retryable).toBe(true);
			} else {
				throw new Error("Type narrowing failed");
			}
		});

		it("handles non-retryable errors", () => {
			const data: SyncFailedEventData = {
				error: "Authentication failed",
				retryable: false,
			};
			expect(data.retryable).toBe(false);
		});
	});

	describe("workspace.health event", () => {
		it("narrows correctly with health score and issues", () => {
			const event: VrekoSignalEvent = {
				type: "workspace.health",
				data: {
					workspacePath: "/path/to/workspace",
					healthScore: 75,
					issues: [
						{ type: "lint", severity: "warning", message: "3 lint warnings" },
						{ type: "test", severity: "error", message: "2 tests failing" },
					],
				},
			};

			if (event.type === "workspace.health") {
				expect(event.data.workspacePath).toBe("/path/to/workspace");
				expect(event.data.healthScore).toBe(75);
				expect(event.data.issues).toHaveLength(2);
				expect(event.data.issues[0].severity).toBe("warning");
				expect(event.data.issues[1].severity).toBe("error");
			} else {
				throw new Error("Type narrowing failed");
			}
		});

		it("handles empty issues array", () => {
			const data: WorkspaceHealthEventData = {
				workspacePath: "/ws",
				healthScore: 100,
				issues: [],
			};
			expect(data.issues).toHaveLength(0);
			expect(data.healthScore).toBe(100);
		});

		it("accepts all severity levels", () => {
			const severities: Array<WorkspaceHealthEventData["issues"][0]["severity"]> = ["info", "warning", "error"];
			for (const severity of severities) {
				const data: WorkspaceHealthEventData = {
					workspacePath: "/ws",
					healthScore: 50,
					issues: [{ type: "test", severity, message: "test" }],
				};
				expect(data.issues[0].severity).toBe(severity);
			}
		});
	});

	describe("guard.changed event", () => {
		it("narrows correctly with guard state changes", () => {
			const event: VrekoSignalEvent = {
				type: "guard.changed",
				data: {
					changed: [
						{ name: "lint-guard", previousState: "pass", currentState: "fail" },
						{ name: "test-guard", previousState: "warn", currentState: "pass" },
					],
					current: [
						{ name: "lint-guard", state: "fail" },
						{ name: "test-guard", state: "pass" },
						{ name: "build-guard", state: "pass" },
					],
					timestamp: Date.now(),
				},
			};

			if (event.type === "guard.changed") {
				expect(event.data.changed).toHaveLength(2);
				expect(event.data.changed[0].name).toBe("lint-guard");
				expect(event.data.changed[0].currentState).toBe("fail");
				expect(event.data.current).toHaveLength(3);
			} else {
				throw new Error("Type narrowing failed");
			}
		});

		it("accepts all guard states", () => {
			const states: Array<GuardChangedEventData["changed"][0]["currentState"]> = ["pass", "warn", "fail"];
			for (const state of states) {
				const data: GuardChangedEventData = {
					changed: [{ name: "test", previousState: "pass", currentState: state }],
					current: [{ name: "test", state }],
					timestamp: Date.now(),
				};
				expect(data.changed[0].currentState).toBe(state);
			}
		});

		it("handles empty changed array", () => {
			const data: GuardChangedEventData = {
				changed: [],
				current: [{ name: "guard", state: "pass" }],
				timestamp: Date.now(),
			};
			expect(data.changed).toHaveLength(0);
		});
	});

	describe("existing event types still work", () => {
		it("snapshot.created narrows correctly", () => {
			const event: VrekoSignalEvent = {
				type: "snapshot.created",
				data: {
					id: "snap-123",
					name: "file.ts",
					fileCount: 1,
					aiAttributed: true,
				},
			};

			if (event.type === "snapshot.created") {
				expect(event.data.id).toBe("snap-123");
				expect(event.data.aiAttributed).toBe(true);
			}
		});

		it("daemon.started narrows correctly", () => {
			const event: VrekoSignalEvent = {
				type: "daemon.started",
				data: {},
			};

			expect(event.type).toBe("daemon.started");
		});

		it("risk.updated narrows correctly", () => {
			const event: VrekoSignalEvent = {
				type: "risk.updated",
				data: {
					previousLevel: "low",
					newLevel: "high",
					reason: "Many changes detected",
					affectedFiles: ["/a.ts", "/b.ts"],
				},
			};

			if (event.type === "risk.updated") {
				expect(event.data.newLevel).toBe("high");
			}
		});
	});
});
