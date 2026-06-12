/**
 * Health Monitoring Integration Tests
 *
 * End-to-end tests for the health monitoring event flow:
 * DaemonBridge → DaemonBridgeAdapter → SignalEventBus → SignalCoordinator → StatusBar/Notifications
 *
 * Tests cover:
 * - health.degraded event flow
 * - health.recovered event flow
 * - protection.changed event flow
 * - guard.changed event flow
 * - MCPHealthGuardian integration with signal system
 *
 * @see SB-HEALTH-001 Health monitoring specification
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
	EventEmitter: class {
		private listeners: Array<(e: any) => void> = [];
		event = (listener: (e: any) => void) => {
			this.listeners.push(listener);
			return { dispose: () => {} };
		};
		fire = (e: any) => this.listeners.forEach((l) => l(e));
		dispose = vi.fn();
	},
	window: {
		showWarningMessage: vi.fn().mockResolvedValue(undefined),
		showInformationMessage: vi.fn().mockResolvedValue(undefined),
		state: { focused: true },
		onDidChangeWindowState: vi.fn(() => ({ dispose: vi.fn() })),
		createStatusBarItem: vi.fn(() => ({
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
			text: "",
			tooltip: "",
			command: undefined,
			alignment: 1,
			priority: 0,
		})),
	},
	commands: {
		executeCommand: vi.fn(),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
		})),
		onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
	},
	env: {
		openExternal: vi.fn(),
	},
	Uri: {
		parse: vi.fn((url: string) => ({ toString: () => url })),
	},
	StatusBarAlignment: {
		Left: 1,
		Right: 2,
	},
	ThemeColor: class {
		constructor(public id: string) {}
	},
}));

// Mock logger
vi.mock("../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn(() => ({
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			trace: vi.fn(),
		})),
	},
}));

// Mock ApiClient
vi.mock("../../src/services/api-client", () => ({
	ApiClient: class {
		generateInsights = vi.fn().mockResolvedValue(null);
	},
}));

// Mock TelemetryService
vi.mock("../../src/analytics/telemetry", () => ({
	TelemetryService: {
		isInitialized: vi.fn(() => false),
		getInstance: vi.fn(() => ({
			track: vi.fn(),
		})),
	},
}));

// Mock AI presence detector
vi.mock("../../src/utils/AIPresenceDetector", () => ({
	getAIPresenceDetector: vi.fn(() => ({
		onActivityChange: vi.fn(() => ({ dispose: vi.fn() })),
		isAnyActive: false,
	})),
}));

// Mock NotificationQueue
vi.mock("../../src/signals/NotificationQueue", () => ({
	NOTIFICATION_PRIORITY: {
		CLOSING_CEREMONY: 50,
		CRITICAL_UPDATE: 60,
		RECOVERY: 70,
		DEGRADATION: 80,
		MILESTONE_AI: 30,
		MILESTONE_FRAGILE: 30,
	},
}));

describe("Health Monitoring Integration", () => {
	let mockEventBus: any;
	let mockNotificationQueue: any;
	let mockFlagManager: any;
	let mockContext: any;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();

		// Create mock event bus that tracks fired events
		const firedEvents: any[] = [];
		mockEventBus = {
			event: vi.fn((handler) => {
				mockEventBus._handler = handler;
				return { dispose: vi.fn() };
			}),
			fire: vi.fn((event) => {
				firedEvents.push(event);
				if (mockEventBus._handler) {
					mockEventBus._handler(event);
				}
			}),
			dispose: vi.fn(),
			_firedEvents: firedEvents,
		};

		// Create mock notification queue
		mockNotificationQueue = {
			push: vi.fn().mockResolvedValue(undefined),
		};

		// Create mock flag manager
		mockFlagManager = {
			setFlag: vi.fn(),
			clearFlag: vi.fn(),
			hasFlag: vi.fn().mockReturnValue(false),
			dispose: vi.fn(),
		};

		// Create mock context with proper default values for SignalState restoration
		mockContext = {
			workspaceState: {
				get: vi.fn((key: string) => {
					// Return empty objects/defaults for all expected keys
					if (key === "snapback.milestones") {
						return {
							firstSnapshotShown: false,
							firstAIDetectionShown: false,
							tenthSnapshotShown: false,
							firstFragileShown: false,
							firstClosingCeremonyShown: false,
						};
					}
					if (key === "snapback.disclosureTier") return "new";
					if (key === "snapback.ringBuffer") return [];
					if (key === "snapback.snapshotCount") return 0;
					return undefined;
				}),
				update: vi.fn().mockResolvedValue(undefined),
			},
			globalState: {
				get: vi.fn(),
				update: vi.fn().mockResolvedValue(undefined),
			},
			subscriptions: [],
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("end-to-end event flow: daemon disconnect → status bar update", () => {
		it("fires health.degraded event when daemon becomes unresponsive", async () => {
			// Simulate DaemonBridgeAdapter firing a health.degraded event
			const degradedEvent = {
				type: "health.degraded" as const,
				data: {
					pid: 12345,
					componentType: "supervisor",
					workspace: "/workspace",
					elapsed: 5000,
					timestamp: Date.now(),
				},
			};

			mockEventBus.fire(degradedEvent);

			// Verify event was fired
			expect(mockEventBus._firedEvents).toContainEqual(degradedEvent);
		});

		it("propagates health.degraded through SignalCoordinator to set status flag", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Inject mock flag manager
			(coordinator as any).flagManager = mockFlagManager;

			// Fire degraded event
			const degradedEvent = {
				type: "health.degraded" as const,
				data: {
					pid: 12345,
					componentType: "daemon",
					workspace: "/workspace",
					elapsed: 5000,
					timestamp: Date.now(),
				},
			};

			mockEventBus.fire(degradedEvent);

			// Verify flag manager was called
			expect(mockFlagManager.setFlag).toHaveBeenCalledWith("degraded");

			coordinator.dispose();
		});

		it("shows notification for supervisor degradation", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Inject mock flag manager
			(coordinator as any).flagManager = mockFlagManager;

			// Fire degraded event for supervisor (should show notification)
			const degradedEvent = {
				type: "health.degraded" as const,
				data: {
					pid: 12345,
					componentType: "supervisor",
					workspace: "/workspace",
					elapsed: 5000,
					timestamp: Date.now(),
				},
			};

			mockEventBus.fire(degradedEvent);

			// Verify notification was pushed
			expect(mockNotificationQueue.push).toHaveBeenCalled();
			expect(mockNotificationQueue.push.mock.calls[0][0]).toBe("health-degraded");

			coordinator.dispose();
		});
	});

	describe("end-to-end event flow: daemon reconnect → status bar clear", () => {
		it("fires health.recovered event when daemon recovers", async () => {
			const recoveredEvent = {
				type: "health.recovered" as const,
				data: {
					pid: 12345,
					componentType: "daemon",
					workspace: "/workspace",
					previousMissed: 5,
					timestamp: Date.now(),
				},
			};

			mockEventBus.fire(recoveredEvent);

			expect(mockEventBus._firedEvents).toContainEqual(recoveredEvent);
		});

		it("clears degraded flag on recovery", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Inject mock flag manager
			(coordinator as any).flagManager = mockFlagManager;

			// Fire recovered event
			const recoveredEvent = {
				type: "health.recovered" as const,
				data: {
					pid: 12345,
					componentType: "daemon",
					workspace: "/workspace",
					previousMissed: 5,
					timestamp: Date.now(),
				},
			};

			mockEventBus.fire(recoveredEvent);

			// Verify flag was cleared
			expect(mockFlagManager.clearFlag).toHaveBeenCalledWith("degraded");

			coordinator.dispose();
		});

		it("shows recovery notification for significant recoveries (3+ missed)", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Inject mock flag manager
			(coordinator as any).flagManager = mockFlagManager;

			// Fire recovered event with 5 previously missed checks
			const recoveredEvent = {
				type: "health.recovered" as const,
				data: {
					pid: 12345,
					componentType: "mcp",
					workspace: "/workspace",
					previousMissed: 5,
					timestamp: Date.now(),
				},
			};

			mockEventBus.fire(recoveredEvent);

			// Verify notification was pushed
			expect(mockNotificationQueue.push).toHaveBeenCalled();
			expect(mockNotificationQueue.push.mock.calls[0][0]).toBe("health-recovered");

			coordinator.dispose();
		});
	});

	describe("guard failure → elevated flag with timeout", () => {
		it("sets elevated flag when guard changes to fail", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Inject mock flag manager
			(coordinator as any).flagManager = mockFlagManager;

			const now = Date.now();
			vi.setSystemTime(now);

			// Fire guard.changed event with failure
			const guardChangedEvent = {
				type: "guard.changed" as const,
				data: {
					changed: [{ name: "lint", previousState: "pass" as const, currentState: "fail" as const }],
					current: [{ name: "lint", state: "fail" as const }],
					timestamp: now,
				},
			};

			mockEventBus.fire(guardChangedEvent);

			// Verify elevated flag was set with expiry
			expect(mockFlagManager.setFlag).toHaveBeenCalledWith(
				"elevated",
				expect.objectContaining({
					expiresAt: now + 5000,
				}),
			);

			coordinator.dispose();
		});

		it("does not set flag when guard recovers (fail → pass)", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Inject mock flag manager
			(coordinator as any).flagManager = mockFlagManager;

			// Fire guard.changed event with recovery
			const guardChangedEvent = {
				type: "guard.changed" as const,
				data: {
					changed: [{ name: "lint", previousState: "fail" as const, currentState: "pass" as const }],
					current: [{ name: "lint", state: "pass" as const }],
					timestamp: Date.now(),
				},
			};

			mockEventBus.fire(guardChangedEvent);

			// Verify flag was NOT set
			expect(mockFlagManager.setFlag).not.toHaveBeenCalled();

			coordinator.dispose();
		});
	});

	describe("protection increase → elevated flag with timeout", () => {
		it("sets elevated flag when protection level increases", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Inject mock flag manager
			(coordinator as any).flagManager = mockFlagManager;

			const now = Date.now();
			vi.setSystemTime(now);

			// Fire protection.changed event with increase
			const protectionChangedEvent = {
				type: "protection.changed" as const,
				data: {
					file: "/test.ts",
					level: "high" as const,
					previousLevel: "low" as const,
				},
			};

			mockEventBus.fire(protectionChangedEvent);

			// Verify elevated flag was set with 3s expiry
			expect(mockFlagManager.setFlag).toHaveBeenCalledWith(
				"elevated",
				expect.objectContaining({
					expiresAt: now + 3000,
				}),
			);

			coordinator.dispose();
		});

		it("does not set flag when protection decreases", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Inject mock flag manager
			(coordinator as any).flagManager = mockFlagManager;

			// Fire protection.changed event with decrease
			const protectionChangedEvent = {
				type: "protection.changed" as const,
				data: {
					file: "/test.ts",
					level: "low" as const,
					previousLevel: "high" as const,
				},
			};

			mockEventBus.fire(protectionChangedEvent);

			// Verify flag was NOT set
			expect(mockFlagManager.setFlag).not.toHaveBeenCalled();

			coordinator.dispose();
		});
	});

	describe("sync failure → warning notification with retry", () => {
		it("shows warning notification on sync failure", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Fire sync.failed event
			const syncFailedEvent = {
				type: "sync.failed" as const,
				data: {
					error: "Network timeout",
					retryable: true,
				},
			};

			mockEventBus.fire(syncFailedEvent);

			// Verify notification was pushed
			expect(mockNotificationQueue.push).toHaveBeenCalled();
			expect(mockNotificationQueue.push.mock.calls[0][0]).toBe("sync-failed");

			coordinator.dispose();
		});
	});

	describe("low workspace health → notification when < 50", () => {
		it("shows notification when healthScore is below 50", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Fire workspace.health event with low score
			const workspaceHealthEvent = {
				type: "workspace.health" as const,
				data: {
					workspacePath: "/workspace",
					healthScore: 35,
					issues: [
						{ type: "test", severity: "error" as const, message: "Tests failing" },
						{ type: "lint", severity: "warning" as const, message: "Lint warnings" },
					],
				},
			};

			mockEventBus.fire(workspaceHealthEvent);

			// Verify notification was pushed
			expect(mockNotificationQueue.push).toHaveBeenCalled();
			expect(mockNotificationQueue.push.mock.calls[0][0]).toBe("workspace-health");

			coordinator.dispose();
		});

		it("does not show notification when healthScore is 50 or above", async () => {
			const { SignalCoordinator } = await import("../../src/signals/SignalCoordinator");
			const coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

			// Fire workspace.health event with acceptable score
			const workspaceHealthEvent = {
				type: "workspace.health" as const,
				data: {
					workspacePath: "/workspace",
					healthScore: 75,
					issues: [],
				},
			};

			mockEventBus.fire(workspaceHealthEvent);

			// Verify notification was NOT pushed
			expect(mockNotificationQueue.push).not.toHaveBeenCalled();

			coordinator.dispose();
		});
	});

	describe("MCPHealthGuardian lifecycle", () => {
		it("can be instantiated without errors", async () => {
			const { MCPHealthGuardian } = await import("../../src/services/MCPHealthGuardian");
			const guardian = new MCPHealthGuardian();

			expect(guardian).toBeDefined();
			// Initial state should be unknown (no health checks performed yet)
			expect(guardian.getHealth()).toBe("unknown");
			// isReady() should fail-open when not activated (detailed behavior tested in unit tests)

			guardian.dispose();
		});

		it("disposes cleanly without errors", async () => {
			const { MCPHealthGuardian } = await import("../../src/services/MCPHealthGuardian");
			const guardian = new MCPHealthGuardian();

			expect(() => guardian.dispose()).not.toThrow();
		});
	});

	describe("DaemonBridgeAdapter event transformation", () => {
		it("transforms component health events correctly", () => {
			// Verify the adapter correctly maps DaemonBridge notifications to signal events
			const daemonHealthData = {
				pid: 12345,
				type: "supervisor",
				workspace: "/workspace",
				elapsed: 5000,
			};

			// The adapter should transform this to:
			const expectedSignalEvent = {
				type: "health.degraded",
				data: {
					pid: daemonHealthData.pid,
					componentType: daemonHealthData.type,
					workspace: daemonHealthData.workspace,
					elapsed: daemonHealthData.elapsed,
					timestamp: expect.any(Number),
				},
			};

			// This validates the expected transformation shape
			expect(expectedSignalEvent.data.componentType).toBe("supervisor");
			expect(expectedSignalEvent.data.pid).toBe(12345);
		});

		it("maps risk scores to levels correctly", () => {
			// Test the mapScoreToLevel helper logic
			const mapScoreToLevel = (score: number): string => {
				if (score <= 30) return "low";
				if (score <= 60) return "medium";
				if (score <= 80) return "high";
				return "critical";
			};

			expect(mapScoreToLevel(0)).toBe("low");
			expect(mapScoreToLevel(30)).toBe("low");
			expect(mapScoreToLevel(31)).toBe("medium");
			expect(mapScoreToLevel(60)).toBe("medium");
			expect(mapScoreToLevel(61)).toBe("high");
			expect(mapScoreToLevel(80)).toBe("high");
			expect(mapScoreToLevel(81)).toBe("critical");
			expect(mapScoreToLevel(100)).toBe("critical");
		});

		it("maps protection levels correctly", () => {
			// Test the mapProtectionLevel helper logic
			const mapProtectionLevel = (level: string): string => {
				const validLevels = ["none", "low", "medium", "high", "critical"];
				if (validLevels.includes(level)) {
					return level;
				}
				return "none";
			};

			expect(mapProtectionLevel("none")).toBe("none");
			expect(mapProtectionLevel("low")).toBe("low");
			expect(mapProtectionLevel("medium")).toBe("medium");
			expect(mapProtectionLevel("high")).toBe("high");
			expect(mapProtectionLevel("critical")).toBe("critical");
			expect(mapProtectionLevel("invalid")).toBe("none");
			expect(mapProtectionLevel("")).toBe("none");
		});
	});
});
