/**
 * SignalCoordinator Handler Tests
 *
 * Tests for health monitoring event handlers in SignalCoordinator.
 * Covers status bar flag management, notifications, and state tracking.
 *
 * @see SB-HEALTH-001 Health monitoring specification
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignalCoordinator } from "../../../src/signals/SignalCoordinator";
import type { VrekoSignalEvent } from "../../../src/signals/types";

// Mock vscode
vi.mock("vscode", () => ({
	EventEmitter: class {
		private listeners: Array<(e: any) => void> = [];
		event = (listener: (e: any) => void) => {
			this.listeners.push(listener);
			return { dispose: () => { /* intentionally empty */ } };
		};
		fire = (e: any) => this.listeners.forEach((l) => l(e));
		dispose = vi.fn();
	},
	window: {
		showWarningMessage: vi.fn().mockResolvedValue(undefined),
		showInformationMessage: vi.fn().mockResolvedValue(undefined),
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
		constructor(public id: string) { /* intentionally empty */ }
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

// Mock ApiClient
vi.mock("../../../src/services/api-client", () => ({
	ApiClient: class {
		generateInsights = vi.fn().mockResolvedValue(null);
	},
}));

// Mock NotificationQueue
vi.mock("../../../src/signals/NotificationQueue", () => ({
	NOTIFICATION_PRIORITY: {
		CLOSING_CEREMONY: 50,
		CRITICAL_UPDATE: 60,
		RECOVERY: 70,
		DEGRADATION: 80,
		MILESTONE_AI: 30,
		MILESTONE_FRAGILE: 30,
	},
}));

describe("SignalCoordinator Health Handlers", () => {
	let coordinator: SignalCoordinator;
	let mockEventBus: any;
	let mockNotificationQueue: any;
	let mockContext: any;
	let flagManagerSetFlag: ReturnType<typeof vi.fn>;
	let flagManagerClearFlag: ReturnType<typeof vi.fn>;

	// Capture event handler
	let eventHandler: ((event: VrekoSignalEvent) => void) | null = null;

	beforeEach(async () => {
		vi.useFakeTimers();

		// Reset handler
		eventHandler = null;

		// Mock event bus
		mockEventBus = {
			event: vi.fn((handler) => {
				eventHandler = handler;
				return { dispose: vi.fn() };
			}),
			fire: vi.fn(),
			dispose: vi.fn(),
		};

		// Mock notification queue
		mockNotificationQueue = {
			push: vi.fn().mockResolvedValue(undefined),
		};

		// Mock context with proper default values for SignalState restoration
		mockContext = {
			workspaceState: {
				get: vi.fn((key: string) => {
					// Return empty objects/defaults for all expected keys
					if (key === "vreko.milestones") {
						return {
							firstSnapshotShown: false,
							firstAIDetectionShown: false,
							tenthSnapshotShown: false,
							firstFragileShown: false,
							firstClosingCeremonyShown: false,
						};
					}
					if (key === "vreko.disclosureTier") return "new";
					if (key === "vreko.ringBuffer") return [];
					if (key === "vreko.snapshotCount") return 0;
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

		// Track flag manager calls
		flagManagerSetFlag = vi.fn();
		flagManagerClearFlag = vi.fn();

		// Dynamically import and create coordinator
		// We need to create it in a way that allows us to test handlers
		const { SignalCoordinator } = await import("../../../src/signals/SignalCoordinator");
		coordinator = new SignalCoordinator(mockContext, mockEventBus, mockNotificationQueue);

		// Spy on flag manager methods
		(coordinator as any).flagManager.setFlag = flagManagerSetFlag;
		(coordinator as any).flagManager.clearFlag = flagManagerClearFlag;
	});

	afterEach(() => {
		coordinator?.dispose();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	const fireEvent = (event: VrekoSignalEvent) => {
		if (eventHandler) {
			eventHandler(event);
		}
	};

	describe("health.degraded handler", () => {
		it("sets degraded flag on status bar", () => {
			fireEvent({
				type: "health.degraded",
				data: {
					pid: 123,
					componentType: "daemon",
					workspace: "/ws",
					elapsed: 5000,
					timestamp: Date.now(),
				},
			});

			expect(flagManagerSetFlag).toHaveBeenCalledWith("degraded");
		});

		it("shows notification for supervisor component type", async () => {
			fireEvent({
				type: "health.degraded",
				data: {
					pid: 123,
					componentType: "supervisor",
					workspace: "/ws",
					elapsed: 5000,
					timestamp: Date.now(),
				},
			});

			expect(mockNotificationQueue.push).toHaveBeenCalled();
			const pushCall = mockNotificationQueue.push.mock.calls[0];
			expect(pushCall[0]).toBe("health-degraded");
		});

		it("does not show notification for daemon component type", () => {
			fireEvent({
				type: "health.degraded",
				data: {
					pid: 123,
					componentType: "daemon",
					workspace: "/ws",
					elapsed: 5000,
					timestamp: Date.now(),
				},
			});

			// Should not push notification for daemon type
			expect(mockNotificationQueue.push).not.toHaveBeenCalled();
		});
	});

	describe("health.recovered handler", () => {
		it("clears degraded flag", () => {
			fireEvent({
				type: "health.recovered",
				data: {
					pid: 123,
					componentType: "daemon",
					workspace: "/ws",
					previousMissed: 3,
					timestamp: Date.now(),
				},
			});

			expect(flagManagerClearFlag).toHaveBeenCalledWith("degraded");
		});

		it("shows recovery notification for significant recoveries (3+ missed)", () => {
			fireEvent({
				type: "health.recovered",
				data: {
					pid: 123,
					componentType: "mcp",
					workspace: "/ws",
					previousMissed: 5,
					timestamp: Date.now(),
				},
			});

			expect(mockNotificationQueue.push).toHaveBeenCalled();
			const pushCall = mockNotificationQueue.push.mock.calls[0];
			expect(pushCall[0]).toBe("health-recovered");
		});

		it("does not show notification for minor recoveries (< 3 missed)", () => {
			fireEvent({
				type: "health.recovered",
				data: {
					pid: 123,
					componentType: "daemon",
					workspace: "/ws",
					previousMissed: 2,
					timestamp: Date.now(),
				},
			});

			expect(mockNotificationQueue.push).not.toHaveBeenCalled();
		});
	});

	describe("protection.changed handler", () => {
		it("sets elevated flag when protection increases", () => {
			fireEvent({
				type: "protection.changed",
				data: {
					file: "/test.ts",
					level: "high",
					previousLevel: "low",
				},
			});

			expect(flagManagerSetFlag).toHaveBeenCalledWith(
				"elevated",
				expect.objectContaining({
					expiresAt: expect.any(Number),
				}),
			);
		});

		it("does not set flag when protection decreases", () => {
			fireEvent({
				type: "protection.changed",
				data: {
					file: "/test.ts",
					level: "low",
					previousLevel: "high",
				},
			});

			expect(flagManagerSetFlag).not.toHaveBeenCalled();
		});

		it("does not set flag when protection stays same", () => {
			fireEvent({
				type: "protection.changed",
				data: {
					file: "/test.ts",
					level: "medium",
					previousLevel: "medium",
				},
			});

			expect(flagManagerSetFlag).not.toHaveBeenCalled();
		});

		it("sets elevated flag with 3s expiry", () => {
			const now = Date.now();
			vi.setSystemTime(now);

			fireEvent({
				type: "protection.changed",
				data: {
					file: "/test.ts",
					level: "critical",
					previousLevel: "none",
				},
			});

			expect(flagManagerSetFlag).toHaveBeenCalledWith(
				"elevated",
				expect.objectContaining({
					expiresAt: now + 3000,
				}),
			);
		});
	});

	describe("violation.reported handler", () => {
		it("tracks violation without showing notification", () => {
			fireEvent({
				type: "violation.reported",
				data: {
					violationType: "silent-catch",
					file: "/test.ts",
					message: "Error swallowed",
				},
			});

			// Should NOT push notification (tracking only)
			expect(mockNotificationQueue.push).not.toHaveBeenCalled();
		});
	});

	describe("sync.completed handler", () => {
		it("updates state without notification", () => {
			fireEvent({
				type: "sync.completed",
				data: {
					success: true,
				},
			});

			// Silent update - no notification
			expect(mockNotificationQueue.push).not.toHaveBeenCalled();
		});
	});

	describe("sync.failed handler", () => {
		it("shows warning notification with retry button", () => {
			fireEvent({
				type: "sync.failed",
				data: {
					error: "Network timeout",
					retryable: true,
				},
			});

			expect(mockNotificationQueue.push).toHaveBeenCalled();
			const pushCall = mockNotificationQueue.push.mock.calls[0];
			expect(pushCall[0]).toBe("sync-failed");
		});

		it("handles non-retryable errors", () => {
			fireEvent({
				type: "sync.failed",
				data: {
					error: "Auth failed",
					retryable: false,
				},
			});

			expect(mockNotificationQueue.push).toHaveBeenCalled();
		});
	});

	describe("workspace.health handler", () => {
		it("notifies when healthScore < 50", () => {
			fireEvent({
				type: "workspace.health",
				data: {
					workspacePath: "/ws",
					healthScore: 40,
					issues: [{ type: "test", severity: "error", message: "Tests failing" }],
				},
			});

			expect(mockNotificationQueue.push).toHaveBeenCalled();
			const pushCall = mockNotificationQueue.push.mock.calls[0];
			expect(pushCall[0]).toBe("workspace-health");
		});

		it("silent update when healthScore >= 50", () => {
			fireEvent({
				type: "workspace.health",
				data: {
					workspacePath: "/ws",
					healthScore: 75,
					issues: [],
				},
			});

			expect(mockNotificationQueue.push).not.toHaveBeenCalled();
		});

		it("counts errors and warnings correctly in notification", () => {
			fireEvent({
				type: "workspace.health",
				data: {
					workspacePath: "/ws",
					healthScore: 30,
					issues: [
						{ type: "test", severity: "error", message: "Error 1" },
						{ type: "test", severity: "error", message: "Error 2" },
						{ type: "lint", severity: "warning", message: "Warning 1" },
					],
				},
			});

			expect(mockNotificationQueue.push).toHaveBeenCalled();
		});
	});

	describe("guard.changed handler", () => {
		it("sets elevated flag when guards fail", () => {
			fireEvent({
				type: "guard.changed",
				data: {
					changed: [{ name: "lint", previousState: "pass", currentState: "fail" }],
					current: [{ name: "lint", state: "fail" }],
					timestamp: Date.now(),
				},
			});

			expect(flagManagerSetFlag).toHaveBeenCalledWith(
				"elevated",
				expect.objectContaining({
					expiresAt: expect.any(Number),
				}),
			);
		});

		it("sets elevated flag with 5s expiry", () => {
			const now = Date.now();
			vi.setSystemTime(now);

			fireEvent({
				type: "guard.changed",
				data: {
					changed: [{ name: "test", previousState: "pass", currentState: "fail" }],
					current: [{ name: "test", state: "fail" }],
					timestamp: now,
				},
			});

			expect(flagManagerSetFlag).toHaveBeenCalledWith(
				"elevated",
				expect.objectContaining({
					expiresAt: now + 5000,
				}),
			);
		});

		it("does not set flag when guards recover (fail → pass)", () => {
			fireEvent({
				type: "guard.changed",
				data: {
					changed: [{ name: "lint", previousState: "fail", currentState: "pass" }],
					current: [{ name: "lint", state: "pass" }],
					timestamp: Date.now(),
				},
			});

			expect(flagManagerSetFlag).not.toHaveBeenCalled();
		});

		it("does not set flag when guards go from pass to warn", () => {
			fireEvent({
				type: "guard.changed",
				data: {
					changed: [{ name: "lint", previousState: "pass", currentState: "warn" }],
					current: [{ name: "lint", state: "warn" }],
					timestamp: Date.now(),
				},
			});

			expect(flagManagerSetFlag).not.toHaveBeenCalled();
		});

		it("handles multiple guard changes", () => {
			fireEvent({
				type: "guard.changed",
				data: {
					changed: [
						{ name: "lint", previousState: "pass", currentState: "fail" },
						{ name: "test", previousState: "pass", currentState: "fail" },
					],
					current: [
						{ name: "lint", state: "fail" },
						{ name: "test", state: "fail" },
					],
					timestamp: Date.now(),
				},
			});

			// Should only set flag once even with multiple failures
			expect(flagManagerSetFlag).toHaveBeenCalledTimes(1);
		});
	});

	describe("existing handlers still work", () => {
		it("handles snapshot.created", () => {
			fireEvent({
				type: "snapshot.created",
				data: {
					id: "snap-1",
					name: "file.ts",
					fileCount: 1,
					aiAttributed: true,
				},
			});

			expect(flagManagerSetFlag).toHaveBeenCalledWith("checkpoint");
		});

		it("handles daemon.started", () => {
			fireEvent({
				type: "daemon.started",
				data: {},
			});

			expect(flagManagerClearFlag).toHaveBeenCalledWith("disconnected");
			expect(flagManagerClearFlag).toHaveBeenCalledWith("degraded");
		});

		it("handles daemon.shutdown", () => {
			fireEvent({
				type: "daemon.shutdown",
				data: {},
			});

			expect(flagManagerSetFlag).toHaveBeenCalledWith("disconnected");
		});
	});
});
