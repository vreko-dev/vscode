/**
 * IPC Boundary Mapping Functions
 *
 * Maps between daemon/local-service IPC shapes (defined in daemon-ipc-schema.ts)
 * and the extension's public façade types (defined in types/).
 *
 * This is the ONLY place where IPC wire shapes are converted to/from
 * extension domain types. All other extension code works exclusively
 * with the public façade types.
 *
 * Design rationale:
 * - The VS Code extension is a "type island" for IP protection.
 * - Internal @vreko/contracts types NEVER leak into the extension.
 * - Unification happens HERE, at the IPC edge, via explicit mappers.
 * - Mapping functions are trivial and safe because naming is aligned.
 *
 * @see daemon-ipc-schema.ts for IPC wire types
 * @see ../types/snapshot.ts for extension Snapshot types
 * @see ../types/protection.ts for extension ProtectionLevel types
 */

import type { MinimalSnapshot, SnapshotOrigin, SnapshotRestoreResult } from "../types/snapshot";
import type {
	CreateSnapshotResult,
	DaemonStatus,
	SnapshotMetadata as IpcSnapshotMetadata,
	ListSnapshotsResult,
	RestoreSnapshotResult,
	SessionStatusResult,
} from "./daemon-ipc-schema";

// =============================================================================
// SNAPSHOT MAPPERS
// =============================================================================

/**
 * Map IPC SnapshotMetadata (wire format) → extension MinimalSnapshot.
 *
 * The IPC layer returns a flat metadata record per snapshot;
 * the extension works with MinimalSnapshot for list views.
 */
export function ipcSnapshotToMinimal(ipc: IpcSnapshotMetadata): MinimalSnapshot {
	return {
		id: ipc.id,
		origin: ipc.trigger as SnapshotOrigin,
		createdAt: ipc.timestamp,
		fileCount: ipc.size ?? 0,
	};
}

/**
 * Map IPC list snapshots result → extension MinimalSnapshot array.
 */
export function ipcListResultToMinimalSnapshots(result: ListSnapshotsResult): MinimalSnapshot[] {
	return result.snapshots.map(ipcSnapshotToMinimal);
}

/**
 * Map IPC create snapshot result → extension-friendly create result.
 */
export interface ExtensionCreateSnapshotResult {
	snapshotId: string;
	created: boolean;
	deduplicated: boolean;
}

export function ipcCreateResultToExtension(result: CreateSnapshotResult): ExtensionCreateSnapshotResult {
	return {
		snapshotId: result.snapshotId,
		created: result.created,
		deduplicated: result.deduplicated ?? false,
	};
}

/**
 * Map IPC restore snapshot result → extension SnapshotRestoreResult.
 */
export function ipcRestoreResultToExtension(result: RestoreSnapshotResult): SnapshotRestoreResult {
	return {
		success: result.restored,
		restoredFiles: [result.filePath],
	};
}

// =============================================================================
// SESSION MAPPERS
// =============================================================================

/**
 * Extension-facing session status (public façade shape).
 */
export interface ExtensionSessionStatus {
	active: boolean;
	taskId?: string;
	task?: string;
	startedAt?: string;
	filesModified: number;
	snapshotCount: number;
}

/**
 * Map IPC session status → extension session status.
 * Currently 1:1 but exists as an explicit boundary so shapes can diverge safely.
 */
export function ipcSessionStatusToExtension(ipc: SessionStatusResult): ExtensionSessionStatus {
	return {
		active: ipc.active,
		taskId: ipc.taskId,
		task: ipc.task,
		startedAt: ipc.startedAt,
		filesModified: ipc.filesModified,
		snapshotCount: ipc.snapshotCount,
	};
}

// =============================================================================
// DAEMON STATUS MAPPERS
// =============================================================================

/**
 * Extension-facing daemon status (public façade shape).
 */
export interface ExtensionDaemonStatus {
	connected: boolean;
	version?: string;
	pid?: number;
	uptime?: number;
	workspaces?: number;
	memoryMB?: number;
}

/**
 * Map IPC daemon status → extension daemon status.
 * Simplifies memory metrics to a single MB value for UI consumption.
 */
export function ipcDaemonStatusToExtension(ipc: DaemonStatus): ExtensionDaemonStatus {
	return {
		connected: ipc.connected,
		version: ipc.version,
		pid: ipc.pid,
		uptime: ipc.uptime,
		workspaces: ipc.workspaces,
		memoryMB: ipc.memoryUsage ? Math.round(ipc.memoryUsage.heapUsed / 1024 / 1024) : undefined,
	};
}

// =============================================================================
// PROTECTION LEVEL MAPPERS (IPC ↔ Extension)
// =============================================================================

/**
 * Normalize any protection level string from IPC into canonical form.
 * Handles legacy "Watched"/"Warning"/"Protected" → "watch"/"warn"/"block".
 */
export function normalizeProtectionLevel(level: string): "watch" | "warn" | "block" {
	const normalized = level.toLowerCase().trim();
	switch (normalized) {
		case "watch":
		case "watched":
		case "checkpoint":
			return "watch";
		case "warn":
		case "warning":
		case "guarded":
			return "warn";
		case "block":
		case "protected":
		case "strict":
			return "block";
		default:
			return "watch"; // safe default
	}
}
