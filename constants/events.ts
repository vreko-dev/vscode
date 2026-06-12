/**
 * Local event constants for VSCode extension
 * Copied from @vreko/contracts to avoid runtime dependency
 *
 * @see packages/contracts/src/eventBus.emitter.ts (source)
 */
export enum VrekoEvent {
	SNAPSHOT_CREATED = "snapshot:created",
	SNAPSHOT_DELETED = "snapshot:deleted",
	SNAPSHOT_RESTORED = "snapshot:restored",
	RESTORE_STARTED = "snapshot:restore_started",
	PROTECTION_CHANGED = "protection:changed",
	FILE_PROTECTED = "file:protected",
	FILE_UNPROTECTED = "file:unprotected",
	ANALYSIS_REQUESTED = "analysis:requested",
	ANALYSIS_COMPLETED = "analysis:completed",
}

/**
 * Event payload types for type-safe event handling
 */
export interface VrekoEventPayloads {
	[VrekoEvent.SNAPSHOT_CREATED]: {
		snapshotId: string;
		fileCount: number;
		trigger: string;
	};
	[VrekoEvent.SNAPSHOT_DELETED]: {
		snapshotId: string;
	};
	[VrekoEvent.SNAPSHOT_RESTORED]: {
		snapshotId: string;
		fileCount: number;
	};
	[VrekoEvent.RESTORE_STARTED]: {
		snapshotId: string;
	};
	[VrekoEvent.PROTECTION_CHANGED]: {
		filePath: string;
		protected: boolean;
	};
	[VrekoEvent.FILE_PROTECTED]: {
		filePath: string;
	};
	[VrekoEvent.FILE_UNPROTECTED]: {
		filePath: string;
	};
	[VrekoEvent.ANALYSIS_REQUESTED]: {
		filePath: string;
	};
	[VrekoEvent.ANALYSIS_COMPLETED]: {
		filePath: string;
		result: unknown;
	};
}
