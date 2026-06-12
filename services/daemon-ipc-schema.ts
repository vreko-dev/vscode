/**
 * @fileoverview Typed IPC contract for DaemonBridge communication
 *
 * This module provides Zod schemas for validating all JSON-RPC messages
 * between the VS Code extension and the Vreko daemon. Ensures type
 * safety at runtime boundaries.
 *
 * Base JSON-RPC schemas are imported from @vreko/contracts to avoid duplication.
 *
 * @see DaemonBridge.ts for the transport layer
 */

import {
	type JsonRpcError as BaseJsonRpcError,
	JsonRpcErrorSchema as BaseJsonRpcErrorSchema,
	type JsonRpcNotification as BaseJsonRpcNotification,
	JsonRpcNotificationSchema as BaseJsonRpcNotificationSchema,
	type JsonRpcRequest as BaseJsonRpcRequest,
	JsonRpcRequestSchema as BaseJsonRpcRequestSchema,
	type JsonRpcResponse as BaseJsonRpcResponse,
	JsonRpcResponseSchema as BaseJsonRpcResponseSchema,
} from "@vreko/contracts/local-service";
import { z } from "zod";

// Re-export base schemas for convenience
export const JsonRpcRequestSchema = BaseJsonRpcRequestSchema;
export type JsonRpcRequest = BaseJsonRpcRequest;
export const JsonRpcErrorSchema = BaseJsonRpcErrorSchema;
export type JsonRpcError = BaseJsonRpcError;
export const JsonRpcResponseSchema = BaseJsonRpcResponseSchema;
export type JsonRpcResponse = BaseJsonRpcResponse;
export const JsonRpcNotificationSchema = BaseJsonRpcNotificationSchema;
export type JsonRpcNotification = BaseJsonRpcNotification;

// =============================================================================
// DAEMON EVENT SCHEMAS
// =============================================================================

/**
 * Risk levels for file change events
 */
export const RiskLevelSchema = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/**
 * File change types
 */
export const ChangeTypeSchema = z.enum(["add", "change", "unlink"]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

/**
 * Snapshot trigger sources
 */
export const SnapshotTriggerSchema = z.enum(["manual", "auto", "mcp", "ai-detection"]);
export type SnapshotTrigger = z.infer<typeof SnapshotTriggerSchema>;

/**
 * Snapshot source origin
 */
export const SnapshotSourceSchema = z.enum(["extension", "mcp", "cli"]);
export type SnapshotSource = z.infer<typeof SnapshotSourceSchema>;

/**
 * Risk detection event payload
 */
export const RiskDetectedEventSchema = z.object({
	file: z.string(),
	changeType: ChangeTypeSchema,
	riskLevel: RiskLevelSchema,
	reason: z.string(),
	suggestion: z.string().optional(),
});
export type RiskDetectedEvent = z.infer<typeof RiskDetectedEventSchema>;

/**
 * Snapshot created event payload
 */
export const SnapshotCreatedEventSchema = z.object({
	snapshotId: z.string(),
	filePath: z.string(),
	trigger: SnapshotTriggerSchema,
	source: SnapshotSourceSchema,
	workspaceId: z.string().optional(),
});
export type SnapshotCreatedEvent = z.infer<typeof SnapshotCreatedEventSchema>;

// =============================================================================
// DAEMON EVENT PAYLOAD SCHEMAS (SB-HEALTH-001)
// =============================================================================

/**
 * Guard status type
 */
export const GuardStatusSchema = z.enum(["pass", "warn", "fail"]);
export type GuardStatus = z.infer<typeof GuardStatusSchema>;

/**
 * Guard file detail for failed checks
 */
export const GuardFileDetailSchema = z.object({
	path: z.string(),
	line: z.number().optional(),
	message: z.string(),
});
export type GuardFileDetail = z.infer<typeof GuardFileDetailSchema>;

/**
 * Individual guard state
 */
export const GuardStateSchema = z.object({
	guard: z.string(),
	status: GuardStatusSchema,
	files: z.array(GuardFileDetailSchema),
	durationMs: z.number(),
});
export type GuardState = z.infer<typeof GuardStateSchema>;

/**
 * Guard status changed event payload
 */
export const GuardChangedEventSchema = z.object({
	changed: z.array(GuardStateSchema),
	current: z.array(GuardStateSchema),
	timestamp: z.number(),
});
export type GuardChangedEvent = z.infer<typeof GuardChangedEventSchema>;

/**
 * Risk updated event payload (enhanced risk detection)
 */
export const RiskUpdatedEventSchema = z.object({
	filePath: z.string(),
	score: z.number(),
	trigger: z.string(),
	action: z.string(),
});
export type RiskUpdatedEvent = z.infer<typeof RiskUpdatedEventSchema>;

/**
 * Component health degraded event payload
 */
export const ComponentHealthDegradedEventSchema = z.object({
	pid: z.number(),
	type: z.string(),
	workspace: z.string(),
	elapsed: z.number(),
	timestamp: z.number(),
});
export type ComponentHealthDegradedEvent = z.infer<typeof ComponentHealthDegradedEventSchema>;

/**
 * Component health recovered event payload
 */
export const ComponentHealthRecoveredEventSchema = z.object({
	pid: z.number(),
	type: z.string(),
	workspace: z.string(),
	previousMissed: z.number(),
	timestamp: z.number(),
});
export type ComponentHealthRecoveredEvent = z.infer<typeof ComponentHealthRecoveredEventSchema>;

/**
 * Workspace health event payload
 */
export const WorkspaceHealthEventSchema = z.object({
	workspacePath: z.string(),
	healthScore: z.number(),
	issues: z.array(z.string()),
});
export type WorkspaceHealthEvent = z.infer<typeof WorkspaceHealthEventSchema>;

/**
 * Learning added event payload
 */
export const LearningAddedEventSchema = z.object({
	id: z.string(),
	type: z.string(),
	trigger: z.string(),
});
export type LearningAddedEvent = z.infer<typeof LearningAddedEventSchema>;

/**
 * Learning pruned event payload  -  fired when learnings are garbage-collected
 */
export const LearningPrunedEventSchema = z.object({
	pruned: z.number(),
	remaining: z.number(),
	categories: z.record(z.string(), z.number()).optional(),
});
export type LearningPrunedEvent = z.infer<typeof LearningPrunedEventSchema>;

/**
 * Protection changed event payload
 */
export const ProtectionChangedEventSchema = z.object({
	file: z.string(),
	level: z.string(),
	previousLevel: z.string().optional(),
});
export type ProtectionChangedEvent = z.infer<typeof ProtectionChangedEventSchema>;

/**
 * Violation reported event payload
 */
export const ViolationReportedEventSchema = z.object({
	type: z.string(),
	file: z.string(),
	message: z.string(),
});
export type ViolationReportedEvent = z.infer<typeof ViolationReportedEventSchema>;

/**
 * Sync completed event payload
 */
export const SyncCompletedEventSchema = z.object({
	success: z.boolean(),
	error: z.string().optional(),
});
export type SyncCompletedEvent = z.infer<typeof SyncCompletedEventSchema>;

/**
 * Session started event payload
 */
export const SessionStartedEventSchema = z.object({
	taskId: z.string(),
	task: z.string(),
});
export type SessionStartedEvent = z.infer<typeof SessionStartedEventSchema>;

/**
 * Session ended event payload
 */
export const SessionEndedEventSchema = z.object({
	sessionId: z.string(),
	outcome: z.string(),
});
export type SessionEndedEvent = z.infer<typeof SessionEndedEventSchema>;

/**
 * Momentum score updated event payload
 *
 * Fired by the daemon when the momentum score changes.
 * The optional `milestone` field is a string label when the score
 * crosses a significant threshold.
 */
export const MomentumScoreUpdatedEventSchema = z.object({
	score: z.number(),
	/** Tier name if this update crossed a tier threshold, otherwise undefined */
	milestone: z.string().optional(),
});
export type MomentumScoreUpdatedEvent = z.infer<typeof MomentumScoreUpdatedEventSchema>;

// =============================================================================
// SESSION & SYNC STATUS SCHEMAS
// =============================================================================

/**
 * Session status result from daemon
 */
export const SessionStatusResultSchema = z.object({
	active: z.boolean(),
	taskId: z.string().optional(),
	task: z.string().optional(),
	startedAt: z.string().optional(),
	filesModified: z.number(),
	snapshotCount: z.number(),
});
export type SessionStatusResult = z.infer<typeof SessionStatusResultSchema>;

/**
 * Sync status values
 */
export const SyncStatusSchema = z.enum(["connected", "connecting", "syncing", "offline", "error"]);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

/**
 * Sync status result from daemon
 */
export const SyncStatusResultSchema = z.object({
	status: SyncStatusSchema,
	lastSyncedAt: z.string().nullable(),
	pendingChanges: z.number(),
	errorMessage: z.string().optional(),
	connectedSince: z.string().optional(),
});
export type SyncStatusResult = z.infer<typeof SyncStatusResultSchema>;

/**
 * Sync status change event
 */
export const SyncStatusChangedEventSchema = z.object({
	previousStatus: SyncStatusSchema,
	newStatus: SyncStatusSchema,
	pendingChanges: z.number(),
});
export type SyncStatusChangedEvent = z.infer<typeof SyncStatusChangedEventSchema>;

// =============================================================================
// DAEMON STATUS & CONNECTION STATE
// =============================================================================

/**
 * Memory usage metrics from daemon
 */
export const MemoryUsageSchema = z.object({
	heapUsed: z.number(),
	heapTotal: z.number(),
	rss: z.number(),
});
export type MemoryUsage = z.infer<typeof MemoryUsageSchema>;

/**
 * Daemon status information
 *
 * Extended to include health metrics for status bar tooltip:
 * - connections: Current active connections
 * - maxConnections: Connection limit (connection exhaustion warning)
 * - memoryUsage: Heap and RSS metrics
 * - idleTimeout: Configured idle timeout
 * - lastActivity: Timestamp of last activity
 */
export const DaemonStatusSchema = z.object({
	connected: z.boolean(),
	pid: z.number().optional(),
	version: z.string().optional(),
	uptime: z.number().optional(),
	workspaces: z.number().optional(),
	// Health metrics for status bar tooltip
	connections: z.number().optional(),
	maxConnections: z.number().optional(),
	memoryUsage: MemoryUsageSchema.optional(),
	idleTimeout: z.number().optional(),
	lastActivity: z.number().optional(),
	startedAt: z.string().optional(),
});
export type DaemonStatus = z.infer<typeof DaemonStatusSchema>;

/**
 * Connection state values
 */
export const ConnectionStateSchema = z.enum(["connected", "disconnected", "reconnecting", "cli_missing", "degraded"]);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

/**
 * State change event with all relevant details
 */
export const StateChangeEventSchema = z.object({
	state: ConnectionStateSchema,
	previousState: ConnectionStateSchema,
	// Reconnection details
	attempt: z.number().optional(),
	maxAttempts: z.number().optional(),
	// Health check details
	healthy: z.boolean().optional(),
	lastHealthCheck: z.date().optional(),
	nextRetryMs: z.number().optional(),
	// Error details
	reason: z.string().optional(),
	// Version info
	daemonVersion: z.string().optional(),
});
export type StateChangeEvent = z.infer<typeof StateChangeEventSchema>;

// =============================================================================
// IPC METHOD SCHEMAS (Request/Response pairs)
// =============================================================================

/**
 * Health check request params
 */
export const HealthCheckParamsSchema = z.object({});
export type HealthCheckParams = z.infer<typeof HealthCheckParamsSchema>;

/**
 * Health check response
 */
export const HealthCheckResultSchema = z.object({
	status: z.literal("ok"),
	version: z.string(),
	uptime: z.number(),
});
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;

/**
 * Create snapshot request params
 */
export const CreateSnapshotParamsSchema = z.object({
	filePath: z.string(),
	reason: z.string().optional(),
	trigger: SnapshotTriggerSchema.optional(),
	workspaceId: z.string().optional(),
});
export type CreateSnapshotParams = z.infer<typeof CreateSnapshotParamsSchema>;

/**
 * Create snapshot response
 */
export const CreateSnapshotResultSchema = z.object({
	snapshotId: z.string(),
	created: z.boolean(),
	deduplicated: z.boolean().optional(),
});
export type CreateSnapshotResult = z.infer<typeof CreateSnapshotResultSchema>;

/**
 * Restore snapshot request params
 */
export const RestoreSnapshotParamsSchema = z.object({
	snapshotId: z.string(),
	filePath: z.string().optional(),
});
export type RestoreSnapshotParams = z.infer<typeof RestoreSnapshotParamsSchema>;

/**
 * Restore snapshot response
 */
export const RestoreSnapshotResultSchema = z.object({
	restored: z.boolean(),
	filePath: z.string(),
});
export type RestoreSnapshotResult = z.infer<typeof RestoreSnapshotResultSchema>;

/**
 * List snapshots request params
 */
export const ListSnapshotsParamsSchema = z.object({
	filePath: z.string().optional(),
	limit: z.number().optional(),
	workspaceId: z.string().optional(),
});
export type ListSnapshotsParams = z.infer<typeof ListSnapshotsParamsSchema>;

/**
 * Snapshot metadata in list response
 */
export const SnapshotMetadataSchema = z.object({
	id: z.string(),
	filePath: z.string(),
	timestamp: z.number(),
	trigger: SnapshotTriggerSchema,
	source: SnapshotSourceSchema,
	size: z.number().optional(),
});
export type SnapshotMetadata = z.infer<typeof SnapshotMetadataSchema>;

/**
 * List snapshots response
 */
export const ListSnapshotsResultSchema = z.object({
	snapshots: z.array(SnapshotMetadataSchema),
	total: z.number(),
});
export type ListSnapshotsResult = z.infer<typeof ListSnapshotsResultSchema>;

// =============================================================================
// VERSION HANDSHAKE
// =============================================================================

/**
 * Protocol version for compatibility checking
 */
export const PROTOCOL_VERSION = "1.0.0" as const;

/**
 * Version handshake request
 */
export const VersionHandshakeParamsSchema = z.object({
	clientVersion: z.string(),
	protocolVersion: z.string(),
	capabilities: z.array(z.string()).optional(),
});
export type VersionHandshakeParams = z.infer<typeof VersionHandshakeParamsSchema>;

/**
 * Version handshake response
 */
export const VersionHandshakeResultSchema = z.object({
	serverVersion: z.string(),
	protocolVersion: z.string(),
	compatible: z.boolean(),
	capabilities: z.array(z.string()).optional(),
	minClientVersion: z.string().optional(),
});
export type VersionHandshakeResult = z.infer<typeof VersionHandshakeResultSchema>;

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Parse and validate a JSON-RPC response with type safety
 */
export function parseJsonRpcResponse(data: unknown): JsonRpcResponse {
	return JsonRpcResponseSchema.parse(data) as unknown as JsonRpcResponse;
}

/**
 * Parse and validate a JSON-RPC notification
 */
export function parseJsonRpcNotification(data: unknown): JsonRpcNotification {
	return JsonRpcNotificationSchema.parse(data) as unknown as JsonRpcNotification;
}

/**
 * Safe parse that returns Result-like object instead of throwing
 */
export function safeParseResponse<T>(
	schema: z.ZodSchema<T>,
	data: unknown,
): { success: true; data: T } | { success: false; error: z.ZodError } {
	const result = schema.safeParse(data);
	if (result.success) {
		return { success: true, data: result.data };
	}
	return { success: false, error: result.error };
}

/**
 * Type guard for JSON-RPC error responses
 */
export function isJsonRpcError(
	response: JsonRpcResponse,
): response is Extract<JsonRpcResponse, { error: JsonRpcError }> {
	return "error" in response;
}

/**
 * Type guard for JSON-RPC success responses
 */
export function isJsonRpcSuccess(response: JsonRpcResponse): response is Extract<JsonRpcResponse, { result: unknown }> {
	return "result" in response;
}

// =============================================================================
// METHOD REGISTRY (for type-safe method dispatch)
// =============================================================================

/**
 * Registry of all IPC methods with their request/response types
 */
export const IPC_METHODS = {
	"health.check": {
		params: HealthCheckParamsSchema,
		result: HealthCheckResultSchema,
	},
	"snapshot.create": {
		params: CreateSnapshotParamsSchema,
		result: CreateSnapshotResultSchema,
	},
	"snapshot.restore": {
		params: RestoreSnapshotParamsSchema,
		result: RestoreSnapshotResultSchema,
	},
	"snapshot.list": {
		params: ListSnapshotsParamsSchema,
		result: ListSnapshotsResultSchema,
	},
	"session.status": {
		params: z.object({}),
		result: SessionStatusResultSchema,
	},
	"sync.status": {
		params: z.object({}),
		result: SyncStatusResultSchema,
	},
	"version.handshake": {
		params: VersionHandshakeParamsSchema,
		result: VersionHandshakeResultSchema,
	},
} as const;

export type IpcMethodName = keyof typeof IPC_METHODS;

/**
 * Extract params type for a given method
 */
export type IpcMethodParams<M extends IpcMethodName> = z.infer<(typeof IPC_METHODS)[M]["params"]>;

/**
 * Extract result type for a given method
 */
export type IpcMethodResult<M extends IpcMethodName> = z.infer<(typeof IPC_METHODS)[M]["result"]>;
