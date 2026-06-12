/**
 * DaemonBridgeAdapter - Connects DaemonBridge to SignalEventBus
 *
 * Adapts DaemonBridge's notification format to SignalEventBus typed events.
 * This is the wiring layer between daemon IPC and the signal system.
 *
 * @module signals/DaemonBridgeAdapter
 */

import type * as vscode from "vscode";
import type { DaemonBridge } from "../services/DaemonBridge";
import type { RiskUpdatedEvent } from "../services/daemon-ipc-schema";
import { logger } from "../utils/logger";
import { getSignalEventBus, type SignalEventBus } from "./SignalEventBus";
import type { VrekoSignalEvent } from "./types";

/**
 * Adapter that wires DaemonBridge events to SignalEventBus
 */
export class DaemonBridgeAdapter implements vscode.Disposable {
	private daemonBridge: DaemonBridge;
	private eventBus: SignalEventBus;
	private disposables: vscode.Disposable[] = [];
	private lastRiskLevel = "normal";

	/**
	 * Create a new adapter
	 */
	constructor(daemonBridge: DaemonBridge, eventBus: SignalEventBus) {
		this.daemonBridge = daemonBridge;
		this.eventBus = eventBus;

		this.wireEvents();
	}

	/**
	 * Wire DaemonBridge events to SignalEventBus
	 */
	private wireEvents(): void {
		// snapshot.created
		this.disposables.push(
			this.daemonBridge.onSnapshotCreated((data) => {
				const event: VrekoSignalEvent = {
					type: "snapshot.created",
					data: {
						id: data.snapshotId,
						name: data.filePath.split("/").pop() ?? "snapshot",
						aiAttributed: data.trigger === "ai-detection",
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// session.started
		this.disposables.push(
			this.daemonBridge.onSessionStarted((data) => {
				const event: VrekoSignalEvent = {
					type: "session.started",
					data: {
						taskId: data.taskId,
						sessionName: data.task,
						// Graceful degradation: daemon may not provide these yet
						learningCount: undefined,
						fragileCount: undefined,
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// session.ended
		this.disposables.push(
			this.daemonBridge.onSessionEnded((data) => {
				const event: VrekoSignalEvent = {
					type: "session.ended",
					data: {
						taskId: data.sessionId,
						// sessionName and duration are read from SignalState by the coordinator
						// before onSessionEnded() resets them  -  do not hardcode here
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// learning.added
		this.disposables.push(
			this.daemonBridge.onLearningAdded((data) => {
				const event: VrekoSignalEvent = {
					type: "learning.added",
					data: {
						id: data.id,
						type: data.type,
						content: data.trigger,
						tier: undefined,
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// learning.pruned
		this.disposables.push(
			this.daemonBridge.onLearningPruned((_data) => {
				const event: VrekoSignalEvent = {
					type: "learning.pruned",
					data: { id: String(Date.now()) },
				};
				this.eventBus.fire(event);
			}),
		);

		// FM-3: onRiskDetected (legacy) removed  -  onRiskUpdated supersedes it and fires
		// the same risk.updated signal with richer data (filePath, score, trigger, action).
		// Keeping both caused handleRiskUpdated() to run twice per event.

		// daemon.shutdown
		this.disposables.push(
			this.daemonBridge.onDaemonShuttingDown(() => {
				const event: VrekoSignalEvent = {
					type: "daemon.shutdown",
					data: {},
				};
				this.eventBus.fire(event);
			}),
		);

		// daemon.started (via state change)
		this.disposables.push(
			this.daemonBridge.onStateChange((event) => {
				if (event.state === "connected" && event.previousState !== "connected") {
					const signalEvent: VrekoSignalEvent = {
						type: "daemon.started",
						data: {},
					};
					this.eventBus.fire(signalEvent);
					return;
				}

				// FM-6: cli_missing  -  CLI not installed or spawn circuit-breaker tripped.
				// DaemonBridge transitions here silently with no VrekoSignalEvent,
				// leaving users with no notification. Wire it to daemon.shutdown so
				// SignalCoordinator can show the actionable daemonCrash notification.
				if (event.state === "cli_missing") {
					this.eventBus.fire({
						type: "daemon.shutdown",
						data: { reason: "cli_missing" },
					});
					return;
				}

				// FM-6: reconnecting → disconnected after exhausted spawn attempts.
				// ConnectionManager sets exhausted=true when daemonSpawnAttempts >= max.
				if (
					event.state === "disconnected" &&
					event.previousState === "reconnecting" &&
					this.daemonBridge.getDaemonSpawnStatus().exhausted
				) {
					this.eventBus.fire({
						type: "daemon.shutdown",
						data: { reason: "exhausted" },
					});
				}
			}),
		);

		// =================================================================
		// Health Monitoring Events (SB-HEALTH-001)
		// =================================================================

		// health.degraded - Component health degradation
		this.disposables.push(
			this.daemonBridge.onComponentHealthDegraded((data) => {
				const event: VrekoSignalEvent = {
					type: "health.degraded",
					data: {
						pid: data.pid,
						componentType: data.type,
						workspace: data.workspace,
						elapsed: data.elapsed,
						timestamp: Date.now(),
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// health.recovered - Component health recovery
		this.disposables.push(
			this.daemonBridge.onComponentHealthRecovered((data) => {
				const event: VrekoSignalEvent = {
					type: "health.recovered",
					data: {
						pid: data.pid,
						componentType: data.type,
						workspace: data.workspace,
						previousMissed: data.previousMissed,
						timestamp: Date.now(),
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// protection.changed - File protection level changes
		this.disposables.push(
			this.daemonBridge.onProtectionChanged((data) => {
				const event: VrekoSignalEvent = {
					type: "protection.changed",
					data: {
						file: data.file,
						level: this.mapProtectionLevel(data.level),
						previousLevel: this.mapProtectionLevel(data.previousLevel ?? "none"),
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// violation.reported - Pattern violations for learning
		this.disposables.push(
			this.daemonBridge.onViolationReported((data) => {
				const event: VrekoSignalEvent = {
					type: "violation.reported",
					data: {
						violationType: data.type,
						file: data.file,
						message: data.message,
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// sync.completed / sync.failed - Sync status
		this.disposables.push(
			this.daemonBridge.onSyncCompleted((data) => {
				if (data.success) {
					const event: VrekoSignalEvent = {
						type: "sync.completed",
						data: {
							success: true,
						},
					};
					this.eventBus.fire(event);
				} else {
					const event: VrekoSignalEvent = {
						type: "sync.failed",
						data: {
							error: data.error ?? "Unknown sync error",
							retryable: true,
						},
					};
					this.eventBus.fire(event);
				}
			}),
		);

		// workspace.health - Workspace health status
		this.disposables.push(
			this.daemonBridge.onWorkspaceHealth((data) => {
				// Map daemon schema (string[]) to signal schema (object array)
				const event: VrekoSignalEvent = {
					type: "workspace.health",
					data: {
						workspacePath: data.workspacePath,
						healthScore: data.healthScore,
						issues: data.issues.map((msg) => ({
							type: "health",
							severity: "warning" as const,
							message: msg,
						})),
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// guard.changed - Health guard state changes
		this.disposables.push(
			this.daemonBridge.onGuardChanged((data) => {
				// Map daemon schema (guard/status) to signal schema (name/currentState)
				const event: VrekoSignalEvent = {
					type: "guard.changed",
					data: {
						changed: data.changed.map((g) => ({
							name: g.guard,
							previousState: "pass" as const, // Daemon doesn't send previous state
							currentState: g.status,
						})),
						current: data.current.map((g) => ({
							name: g.guard,
							state: g.status,
						})),
						timestamp: data.timestamp,
					},
				};
				this.eventBus.fire(event);
			}),
		);

		// risk.updated - Enhanced risk update (supersedes risk.detected)
		this.disposables.push(
			this.daemonBridge.onRiskUpdated((data: RiskUpdatedEvent) => {
				// Map daemon schema (filePath/score/trigger/action) to signal schema
				const newLevel = this.mapScoreToLevel(data.score);
				const event: VrekoSignalEvent = {
					type: "risk.updated",
					data: {
						previousLevel: this.lastRiskLevel,
						newLevel,
						reason: data.trigger,
						affectedFiles: data.filePath ? [data.filePath] : [],
					},
				};
				this.lastRiskLevel = newLevel;
				this.eventBus.fire(event);
			}),
		);

		// momentum.score-updated → momentum.score-updated
		this.disposables.push(
			this.daemonBridge.onMomentumScoreUpdated((data) => {
				this.eventBus.fire({
					type: "momentum.score-updated",
					data: { score: data.score, milestone: data.milestone },
				});
			}),
		);

		logger.info("DaemonBridgeAdapter wired events to SignalEventBus");
	}

	/**
	 * Map a numeric risk score to a risk level string.
	 */
	private mapScoreToLevel(score: number): "low" | "medium" | "high" | "critical" {
		if (score <= 30) {
			return "low";
		}
		if (score <= 60) {
			return "medium";
		}
		if (score <= 80) {
			return "high";
		}
		return "critical";
	}

	/**
	 * Map protection level string to typed protection level
	 */
	private mapProtectionLevel(level: string): "none" | "low" | "medium" | "high" | "critical" {
		const validLevels = ["none", "low", "medium", "high", "critical"] as const;
		if (validLevels.includes(level as (typeof validLevels)[number])) {
			return level as (typeof validLevels)[number];
		}
		return "none";
	}

	/**
	 * Dispose all subscriptions
	 */
	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}
}

/**
 * Create and register the adapter
 */
export function createDaemonBridgeAdapter(daemonBridge: DaemonBridge, eventBus?: SignalEventBus): DaemonBridgeAdapter {
	const bus = eventBus ?? getSignalEventBus();
	return new DaemonBridgeAdapter(daemonBridge, bus);
}
