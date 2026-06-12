/**
 * Session Types - Re-exports from local SDK types
 *
 * This module re-exports session types from local stubs for backward compatibility
 * with existing VSCode extension code.
 */

export type {
	SessionCandidate,
	SessionFileEntry,
	SessionFinalizeReason,
	SessionId,
	SessionManifest,
} from "../types/sdk";
