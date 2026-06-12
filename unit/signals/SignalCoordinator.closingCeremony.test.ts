/**
 * SignalCoordinator Closing Ceremony Tests
 *
 * Verifies that showClosingCeremony() uses real daemon data
 * (coherenceScore, concurrentSessions, fragileFilesInSession, topLearnings)
 * when getClosingCeremony() succeeds, and falls back to local stubs otherwise.
 *
 * @see apps/vscode/src/signals/SignalCoordinator.ts  -  showClosingCeremony()
 * @see docs/plans/UX-surface/extension_surface.md  -  Phase 2 Feature Notifications
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VrekoSignalEvent } from "../../../src/signals/types";

// ---------------------------------------------------------------------------
// VS Code mock
// ---------------------------------------------------------------------------
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
	MarkdownString: class {
		value = "";
		isTrusted = false;
		appendMarkdown = vi.fn().mockReturnThis();
		appendText = vi.fn().mockReturnThis();
		constructor(_value = "", _supportThemeIcons = false) { /* intentionally empty */ }
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
			backgroundColor: undefined,
		})),
	},
	commands: { executeCommand: vi.fn() },
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
	},
	env: { openExternal: vi.fn() },
	Uri: { parse: vi.fn((url: string) => ({ toString: () => url })) },
	StatusBarAlignment: { Left: 1, Right: 2 },
	ThemeColor: class {
		constructor(public id: string) { /* intentionally empty */ }
	},
}));

vi.mock("../../../src/utils/logger", () => ({
	logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../src/services/api-client", () => ({
	ApiClient: class {
		generateInsights = vi.fn().mockResolvedValue(null);
	},
}));

vi.mock("../../../src/signals/NotificationQueue", () => ({
	NOTIFICATION_PRIORITY: {
		CLOSING_CEREMONY: 50,
		CRITICAL_UPDATE: 60,
		RECOVERY: 70,
		DEGRADATION: 80,
		MILESTONE_AI: 30,
		MILESTONE_FRAGILE: 30,
		LARGE_RISK: 40,
		PIONEER_TIER: 45,
	},
}));

// Capture what ClosingCeremonyUI receives
let capturedCeremonyData: any = null;
vi.mock("../../../src/ui/ClosingCeremonyUI", () => ({
	showClosingCeremony: vi.fn(async (data: any) => {
		capturedCeremonyData = data;
	}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DAEMON_CEREMONY = {
	sessionId: "daemon-session-1",
	workspacePath: "/workspace",
	duration: 3_600_000,
	learningsCaptured: 7,
	fragileFilesInSession: [{ path: "/workspace/auth.ts", riskScore: 92 }],
	tokensSaved: 45_000,
	tokensSavedIsEstimate: false,
	coherenceScore: "high" as const,
	coherenceRationale: "Focused changes to authentication module",
	checkpointsCreated: 12,
	healthDelta: 5,
	concurrentSessions: [{ clientType: "claude", overlapFiles: 3, conflictResolved: true }],
	topLearnings: [{ content: "Auth pattern", captureMethod: "auto", confidence: 0.9 }],
};

function makeMockContext() {
	return {
		workspaceState: {
			get: vi.fn((key: string) => {
				if (key === "vreko.milestones") return {};
				if (key === "workspaceRoot") return "/workspace";
				if (key === "vreko.disclosureTier") return "new";
				if (key === "vreko.ringBuffer") return [];
				if (key === "vreko.snapshotCount") return 0;
				return undefined;
			}),
			update: vi.fn().mockResolvedValue(undefined),
		},
		globalState: { get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
		subscriptions: [],
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("SignalCoordinator.showClosingCeremony", () => {
	let eventHandler: ((event: VrekoSignalEvent) => void) | null = null;
	let mockNotificationQueue: any;
	let mockDaemonBridge: any;

	beforeEach(async () => {
		vi.useFakeTimers();
		capturedCeremonyData = null;
		eventHandler = null;

		mockNotificationQueue = { push: vi.fn().mockResolvedValue(undefined), clearPending: vi.fn() };

		mockDaemonBridge = {
			getClosingCeremony: vi.fn().mockResolvedValue(DAEMON_CEREMONY),
			getDaemonSpawnStatus: vi.fn().mockReturnValue({ exhausted: false }),
		};

		const mockEventBus = {
			event: vi.fn((handler) => {
				eventHandler = handler;
				return { dispose: vi.fn() };
			}),
			fire: vi.fn(),
			dispose: vi.fn(),
		};

		const { SignalCoordinator } = await import("../../../src/signals/SignalCoordinator");
		const coordinator = new SignalCoordinator(makeMockContext(), mockEventBus, mockNotificationQueue);
		// Inject daemon bridge
		(coordinator as any).daemonBridge = mockDaemonBridge;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	const fireSessionEnded = () => {
		eventHandler?.({
			type: "session.ended",
			data: { taskId: "daemon-session-1" },
		} as VrekoSignalEvent);
	};

	// -------------------------------------------------------------------------
	// 1. Daemon data wins when available
	// -------------------------------------------------------------------------
	describe("when daemon returns ceremony data", () => {
		it("uses real coherenceScore from daemon (not stub 'medium')", async () => {
			fireSessionEnded();
			// Allow the async showClosingCeremony to complete
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData).not.toBeNull();
			expect(capturedCeremonyData.coherenceScore).toBe("high");
		});

		it("surfaces concurrentSessions from daemon (not stub null)", async () => {
			fireSessionEnded();
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData.concurrentSessions).toEqual([
				{ clientType: "claude", overlapFiles: 3, conflictResolved: true },
			]);
		});

		it("surfaces fragileFilesInSession from daemon (not stub [])", async () => {
			fireSessionEnded();
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData.fragileFilesInSession).toHaveLength(1);
			expect(capturedCeremonyData.fragileFilesInSession[0].path).toBe("/workspace/auth.ts");
		});

		it("surfaces topLearnings from daemon (not stub [])", async () => {
			fireSessionEnded();
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData.topLearnings).toHaveLength(1);
			expect(capturedCeremonyData.topLearnings[0].content).toBe("Auth pattern");
		});

		it("attaches insightsPromise to daemon data", async () => {
			fireSessionEnded();
			await vi.runAllTimersAsync();

			// insightsPromise is always added on top of daemon data
			expect(capturedCeremonyData.insightsPromise).toBeInstanceOf(Promise);
		});
	});

	// -------------------------------------------------------------------------
	// 2. Fallback when daemon returns null
	// -------------------------------------------------------------------------
	describe("when daemon returns null", () => {
		beforeEach(() => {
			mockDaemonBridge.getClosingCeremony.mockResolvedValue(null);
		});

		it("falls back to stub coherenceScore 'medium'", async () => {
			fireSessionEnded();
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData.coherenceScore).toBe("medium");
		});

		it("falls back to stub concurrentSessions null", async () => {
			fireSessionEnded();
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData.concurrentSessions).toBeNull();
		});

		it("falls back to empty fragileFilesInSession", async () => {
			fireSessionEnded();
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData.fragileFilesInSession).toEqual([]);
		});
	});

	// -------------------------------------------------------------------------
	// 3. Fallback when daemon RPC throws
	// -------------------------------------------------------------------------
	describe("when daemon RPC throws", () => {
		it("falls back gracefully without throwing", async () => {
			mockDaemonBridge.getClosingCeremony.mockRejectedValue(new Error("socket closed"));

			fireSessionEnded();
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData).not.toBeNull();
			expect(capturedCeremonyData.coherenceScore).toBe("medium"); // local fallback
		});
	});

	// -------------------------------------------------------------------------
	// 4. Fallback when no daemon bridge (offline)
	// -------------------------------------------------------------------------
	describe("when no daemon bridge", () => {
		it("falls back to local stubs without calling getClosingCeremony", async () => {
			// Remove the injected bridge
			const { SignalCoordinator } = await import("../../../src/signals/SignalCoordinator");
			const mockEventBus2 = {
				event: vi.fn((h) => {
					eventHandler = h;
					return { dispose: vi.fn() };
				}),
				fire: vi.fn(),
				dispose: vi.fn(),
			};
			const _ = new SignalCoordinator(makeMockContext(), mockEventBus2, mockNotificationQueue);
			// No daemonBridge injected → remains undefined

			fireSessionEnded();
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData).not.toBeNull();
			expect(capturedCeremonyData.coherenceScore).toBe("medium");
			expect(capturedCeremonyData.concurrentSessions).toBeNull();
		});
	});

	// -------------------------------------------------------------------------
	// 5. Timeout  -  daemon hangs past 3s
	// -------------------------------------------------------------------------
	describe("when daemon times out", () => {
		it("falls back to local stubs after 3s timeout", async () => {
			// Daemon never resolves
			mockDaemonBridge.getClosingCeremony.mockImplementation(
				() => new Promise(() => { /* intentionally empty */ }),
			);

			fireSessionEnded();

			// runAllTimersAsync advances all timers (including the 3s timeout)
			// and flushes all resulting promise chains
			await vi.runAllTimersAsync();

			expect(capturedCeremonyData).not.toBeNull();
			expect(capturedCeremonyData.coherenceScore).toBe("medium");
		});
	});
});
