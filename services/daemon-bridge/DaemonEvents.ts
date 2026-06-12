/**
 * Daemon Event Handling
 *
 * Centralizes all daemon event handling logic:
 * - Event emitters for daemon notifications
 * - Notification dispatch and parsing
 * - Server-initiated notification handling
 *
 * Extracted from DaemonBridge for better separation of concerns.
 *
 * @module daemon-bridge/DaemonEvents
 */

import * as vscode from "vscode";
import { logger } from "../../utils/logger";
import {
	type ComponentHealthDegradedEvent,
	ComponentHealthDegradedEventSchema,
	type ComponentHealthRecoveredEvent,
	ComponentHealthRecoveredEventSchema,
	type GuardChangedEvent,
	GuardChangedEventSchema,
	type LearningAddedEvent,
	LearningAddedEventSchema,
	type LearningPrunedEvent,
	LearningPrunedEventSchema,
	type MomentumScoreUpdatedEvent,
	MomentumScoreUpdatedEventSchema,
	type ProtectionChangedEvent,
	ProtectionChangedEventSchema,
	type RiskDetectedEvent,
	RiskDetectedEventSchema,
	type RiskUpdatedEvent,
	RiskUpdatedEventSchema,
	type SessionEndedEvent,
	SessionEndedEventSchema,
	type SessionStartedEvent,
	SessionStartedEventSchema,
	type SnapshotCreatedEvent,
	SnapshotCreatedEventSchema,
	type SyncCompletedEvent,
	SyncCompletedEventSchema,
	type ViolationReportedEvent,
	ViolationReportedEventSchema,
	type WorkspaceHealthEvent,
	WorkspaceHealthEventSchema,
} from "../daemon-ipc-schema";

// =============================================================================
// TYPES
// =============================================================================

/** All daemon event types emitted by DaemonEvents */
export interface DaemonEventMap {
	riskDetected: RiskDetectedEvent;
	snapshotCreated: SnapshotCreatedEvent;
	daemonShuttingDown: undefined;
	sessionStarted: SessionStartedEvent;
	sessionEnded: SessionEndedEvent;
	learningAdded: LearningAddedEvent;
	learningPruned: LearningPrunedEvent;
	protectionChanged: ProtectionChangedEvent;
	violationReported: ViolationReportedEvent;
	syncCompleted: SyncCompletedEvent;
	riskUpdated: RiskUpdatedEvent;
	daemonStarted: undefined;
	workspaceHealth: WorkspaceHealthEvent;
	guardChanged: GuardChangedEvent;
	componentHealthDegraded: ComponentHealthDegradedEvent;
	componentHealthRecovered: ComponentHealthRecoveredEvent;
	momentumScoreUpdated: MomentumScoreUpdatedEvent;
	healthChanged: HealthChangedEvent;
	mcpToolCalled: McpToolCalledEvent;
	mcpFileModified: McpFileModifiedEvent;
	daemonUpdatePending: DaemonUpdatePendingEvent;
	daemonHandoffComplete: DaemonHandoffCompleteEvent;
}

/** Event emitted when daemon health authority reports a state transition */
export interface HealthChangedEvent {
	previousState: string;
	currentState: string;
	reason: string;
	timestamp: number;
	report?: unknown;
}

/** Event emitted when an MCP tool is called in the active session */
export interface McpToolCalledEvent {
	toolName: string;
	sessionId: string;
	workspacePath: string;
	calledAt: number;
}

/** Event emitted when an MCP tool modifies a file */
export interface McpFileModifiedEvent {
	filePath: string;
	sessionId: string;
	workspacePath: string;
	modifiedAt: number;
}

/** Event emitted when daemon has a pending update and clients should queue non-idempotent commands */
export interface DaemonUpdatePendingEvent {
	newVersion: string;
	delayMs: number;
}

/** Event emitted when daemon handoff to new binary is complete and clients should reconnect */
export interface DaemonHandoffCompleteEvent {
	newSocketPath?: string;
}

/** Type-safe event names */
export type DaemonEventName = keyof DaemonEventMap;

// =============================================================================
// DAEMON EVENTS CLASS
// =============================================================================

const LOG_PREFIX = "[DaemonEvents]";

/**
 * Manages all daemon event emitters and notification handling.
 *
 * This class centralizes event handling that was previously scattered
 * throughout DaemonBridge. It provides:
 * - Type-safe event emitters for each daemon notification type
 * - Zod schema validation for incoming events
 * - Centralized notification dispatch
 */
export class DaemonEvents extends vscode.Disposable {
	// Event emitters - one for each daemon notification type
	private readonly _onRiskDetected = new vscode.EventEmitter<RiskDetectedEvent>();
	public readonly onRiskDetected = this._onRiskDetected.event;

	private readonly _onSnapshotCreated = new vscode.EventEmitter<SnapshotCreatedEvent>();
	public readonly onSnapshotCreated = this._onSnapshotCreated.event;

	private readonly _onDaemonShuttingDown = new vscode.EventEmitter<void>();
	public readonly onDaemonShuttingDown = this._onDaemonShuttingDown.event;

	private readonly _onSessionStarted = new vscode.EventEmitter<SessionStartedEvent>();
	public readonly onSessionStarted = this._onSessionStarted.event;

	private readonly _onSessionEnded = new vscode.EventEmitter<SessionEndedEvent>();
	public readonly onSessionEnded = this._onSessionEnded.event;

	private readonly _onLearningAdded = new vscode.EventEmitter<LearningAddedEvent>();
	public readonly onLearningAdded = this._onLearningAdded.event;

	private readonly _onLearningPruned = new vscode.EventEmitter<LearningPrunedEvent>();
	public readonly onLearningPruned = this._onLearningPruned.event;

	private readonly _onProtectionChanged = new vscode.EventEmitter<ProtectionChangedEvent>();
	public readonly onProtectionChanged = this._onProtectionChanged.event;

	private readonly _onViolationReported = new vscode.EventEmitter<ViolationReportedEvent>();
	public readonly onViolationReported = this._onViolationReported.event;

	private readonly _onSyncCompleted = new vscode.EventEmitter<SyncCompletedEvent>();
	public readonly onSyncCompleted = this._onSyncCompleted.event;

	private readonly _onRiskUpdated = new vscode.EventEmitter<RiskUpdatedEvent>();
	public readonly onRiskUpdated = this._onRiskUpdated.event;

	private readonly _onDaemonStarted = new vscode.EventEmitter<void>();
	public readonly onDaemonStarted = this._onDaemonStarted.event;

	private readonly _onWorkspaceHealth = new vscode.EventEmitter<WorkspaceHealthEvent>();
	public readonly onWorkspaceHealth = this._onWorkspaceHealth.event;

	private readonly _onGuardChanged = new vscode.EventEmitter<GuardChangedEvent>();
	public readonly onGuardChanged = this._onGuardChanged.event;

	private readonly _onComponentHealthDegraded = new vscode.EventEmitter<ComponentHealthDegradedEvent>();
	public readonly onComponentHealthDegraded = this._onComponentHealthDegraded.event;

	private readonly _onComponentHealthRecovered = new vscode.EventEmitter<ComponentHealthRecoveredEvent>();
	public readonly onComponentHealthRecovered = this._onComponentHealthRecovered.event;

	private readonly _onHealthChanged = new vscode.EventEmitter<HealthChangedEvent>();
	public readonly onHealthChanged = this._onHealthChanged.event;

	private readonly _onMcpToolCalled = new vscode.EventEmitter<McpToolCalledEvent>();
	public readonly onMcpToolCalled = this._onMcpToolCalled.event;

	private readonly _onMcpFileModified = new vscode.EventEmitter<McpFileModifiedEvent>();
	public readonly onMcpFileModified = this._onMcpFileModified.event;

	private readonly _onMomentumScoreUpdated = new vscode.EventEmitter<MomentumScoreUpdatedEvent>();
	public readonly onMomentumScoreUpdated = this._onMomentumScoreUpdated.event;

	private readonly _onDaemonUpdatePending = new vscode.EventEmitter<DaemonUpdatePendingEvent>();
	public readonly onDaemonUpdatePending = this._onDaemonUpdatePending.event;

	private readonly _onDaemonHandoffComplete = new vscode.EventEmitter<DaemonHandoffCompleteEvent>();
	public readonly onDaemonHandoffComplete = this._onDaemonHandoffComplete.event;

	constructor() {
		super(() => this.dispose());
	}

	// =========================================================================
	// NOTIFICATION HANDLING
	// =========================================================================

	/**
	 * Handle incoming daemon notification
	 *
	 * Dispatches notifications to appropriate event emitters.
	 * Validates structured events with Zod schemas before firing.
	 */
	handleNotification(method: string, params: Record<string, unknown>): void {
		// Dispatch $/-prefixed server-initiated notifications by method name
		if (method.startsWith("$/")) {
			this.handleServerNotification(method, params);
			return;
		}

		const type = params.type as string;
		const data = params.data as Record<string, unknown>;

		switch (type) {
			case "risk.detected": {
				const parsed = RiskDetectedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed risk.detected notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onRiskDetected.fire(parsed.data);
				break;
			}

			case "snapshot.created": {
				const parsed = SnapshotCreatedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed snapshot.created notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onSnapshotCreated.fire(parsed.data);
				break;
			}

			case "daemon.shutdown":
				this._onDaemonShuttingDown.fire();
				break;

			case "session.started": {
				const parsed = SessionStartedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed session.started notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onSessionStarted.fire(parsed.data);
				break;
			}

			case "session.ended": {
				const parsed = SessionEndedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed session.ended notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onSessionEnded.fire(parsed.data);
				break;
			}

			case "learning.added": {
				const parsed = LearningAddedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed learning.added notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onLearningAdded.fire(parsed.data);
				break;
			}

			case "learning.pruned": {
				const parsed = LearningPrunedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed learning.pruned notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onLearningPruned.fire(parsed.data);
				break;
			}

			case "protection.changed": {
				const parsed = ProtectionChangedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed protection.changed notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onProtectionChanged.fire(parsed.data);
				break;
			}

			case "violation.reported": {
				const parsed = ViolationReportedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed violation.reported notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onViolationReported.fire(parsed.data);
				break;
			}

			case "sync.completed": {
				const parsed = SyncCompletedEventSchema.safeParse({ success: true });
				if (parsed.success) {
					this._onSyncCompleted.fire(parsed.data);
				}
				break;
			}

			case "sync.failed": {
				const parsed = SyncCompletedEventSchema.safeParse({
					success: false,
					error: data.error as string | undefined,
				});
				if (parsed.success) {
					this._onSyncCompleted.fire(parsed.data);
				}
				break;
			}

			case "risk.updated": {
				const parsed = RiskUpdatedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed risk.updated notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onRiskUpdated.fire(parsed.data);
				break;
			}

			case "daemon.started":
				this._onDaemonStarted.fire();
				break;

			case "momentum.score-updated": {
				const parsed = MomentumScoreUpdatedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed momentum.score-updated notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onMomentumScoreUpdated.fire(parsed.data);
				break;
			}

			case "workspace.health": {
				const parsed = WorkspaceHealthEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed workspace.health notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onWorkspaceHealth.fire(parsed.data);
				break;
			}

			case "health.guard.changed": {
				const parsed = GuardChangedEventSchema.safeParse(data);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed health.guard.changed notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onGuardChanged.fire(parsed.data);
				break;
			}

			case "mcp.tool-called":
				this._onMcpToolCalled.fire(data as unknown as McpToolCalledEvent);
				break;

			case "mcp.file-modified":
				this._onMcpFileModified.fire(data as unknown as McpFileModifiedEvent);
				break;

			case "daemon.update_pending":
				// Payload fields are inline in params (no data wrapper)  -  see handoff.ts broadcast call
				this._onDaemonUpdatePending.fire({
					newVersion: (params.newVersion as string) ?? "",
					delayMs: (params.delayMs as number) ?? 30000,
				});
				break;

			case "daemon.handoff_complete":
				this._onDaemonHandoffComplete.fire({
					newSocketPath: params.newSocketPath as string | undefined,
				});
				break;

			default:
				logger.debug(`${LOG_PREFIX} Unknown daemon notification`, { type });
		}
	}

	/**
	 * Handle server-initiated notifications ($/prefix)
	 *
	 * These are notifications initiated by the daemon without client request.
	 */
	private handleServerNotification(method: string, params: Record<string, unknown>): void {
		switch (method) {
			case "$/health-degraded": {
				const parsed = ComponentHealthDegradedEventSchema.safeParse(params);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed $/health-degraded notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onComponentHealthDegraded.fire(parsed.data);
				break;
			}

			case "$/health-changed": {
				this._onHealthChanged.fire(params as unknown as HealthChangedEvent);
				break;
			}

			case "$/health-recovered": {
				const parsed = ComponentHealthRecoveredEventSchema.safeParse(params);
				if (!parsed.success) {
					logger.warn(`${LOG_PREFIX} Malformed $/health-recovered notification  -  dropping`, {
						error: parsed.error.format(),
					});
					break;
				}
				this._onComponentHealthRecovered.fire(parsed.data);
				break;
			}

			default:
				logger.debug(`${LOG_PREFIX} Unknown server notification`, { method });
		}
	}

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	/**
	 * Dispose all event emitters
	 */
	dispose(): void {
		this._onRiskDetected.dispose();
		this._onSnapshotCreated.dispose();
		this._onDaemonShuttingDown.dispose();
		this._onSessionStarted.dispose();
		this._onSessionEnded.dispose();
		this._onLearningAdded.dispose();
		this._onProtectionChanged.dispose();
		this._onViolationReported.dispose();
		this._onSyncCompleted.dispose();
		this._onRiskUpdated.dispose();
		this._onDaemonStarted.dispose();
		this._onWorkspaceHealth.dispose();
		this._onGuardChanged.dispose();
		this._onComponentHealthDegraded.dispose();
		this._onComponentHealthRecovered.dispose();
		this._onMomentumScoreUpdated.dispose();
		this._onHealthChanged.dispose();
		this._onMcpToolCalled.dispose();
		this._onMcpFileModified.dispose();
		this._onDaemonUpdatePending.dispose();
		this._onDaemonHandoffComplete.dispose();
	}
}
