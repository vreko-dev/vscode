/**
 * Re-exports from local oss-sdk stubs for backwards compatibility.
 */

export type { DeletableSnapshot as Snapshot, ISnapshotManagerForDeletion as ISnapshotManager } from "../types/oss-sdk";
export {
	type AutoCleanupConfig,
	type DeletableSnapshot,
	type DeletionOptions,
	type DeletionResult,
	type IConfirmationService,
	type ISnapshotManagerForDeletion,
	SnapshotDeletionService,
	type SnapshotDeletionServiceOptions,
} from "../types/oss-sdk";
