/**
 * @deprecated This module has been extracted to @snapback-oss/sdk
 * Import directly from '@snapback-oss/sdk' instead:
 *
 * @example
 * ```typescript
 * import {
 *   SnapshotDeletionService,
 *   type DeletionOptions,
 *   type DeletionResult,
 *   type AutoCleanupConfig,
 *   type IConfirmationService,
 * } from '@snapback-oss/sdk';
 * ```
 *
 * This file re-exports from the SDK for backwards compatibility.
 */

// Re-export Snapshot as an alias for backwards compatibility
// Legacy interface alias
export type { DeletableSnapshot as Snapshot, ISnapshotManagerForDeletion as ISnapshotManager } from "@snapback-oss/sdk";
export {
	type AutoCleanupConfig,
	type DeletableSnapshot,
	type DeletionOptions,
	type DeletionResult,
	type IConfirmationService,
	type ISnapshotManagerForDeletion,
	SnapshotDeletionService,
	type SnapshotDeletionServiceOptions,
} from "@snapback-oss/sdk";
