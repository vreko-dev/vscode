/**
 * Snapshot Types for VSCode Extension
 *
 * Re-exports canonical types from @snapback/contracts (single source of truth).
 * Defines VSCode-specific interfaces for UI and storage only.
 *
 * ADR-004 Compliance: All snapshot types are now exported from @snapback/contracts.
 * This file serves as a convenience re-export layer with VSCode-specific additions.
 */

// =============================================================================
// RE-EXPORTS FROM @snapback/contracts (Single Source of Truth - ADR-004)
// =============================================================================

export type {
	AnySnapshotManifest,
	ConflictReport,
	// Creation and filtering
	CreateSnapshotOptions,
	DiffPreview,
	FileDiff,
	FileInput,
	FileState,
	MinimalSnapshot,
	// Extended snapshot types
	RichSnapshot,
	// Core snapshot types
	Snapshot,
	SnapshotFilters,
	SnapshotManifestV1,
	SnapshotManifestV2,
	// Metadata and manifest
	SnapshotMetadata,
	SnapshotOrigin,
	// Restore and diff
	SnapshotRestoreResult,
	SnapshotState,
} from "@snapback/contracts";

// Import types for local use in VSCode-specific interfaces
import type { RichSnapshot } from "@snapback/contracts";

// =============================================================================
// VSCODE-SPECIFIC INTERFACES (UI and storage)
// =============================================================================

/**
 * Confirmation service interface for user prompts
 * VSCode-specific - implements window.showInformationMessage pattern
 */
export interface IConfirmationService {
	confirm(message: string, detail?: string): Promise<boolean>;
}

/**
 * Storage interface for snapshot persistence
 * VSCode-specific - wraps local SQLite storage
 */
export interface IStorage {
	save(snapshot: RichSnapshot): Promise<void>;
	get(id: string): Promise<RichSnapshot | undefined>;
	getAll(): Promise<RichSnapshot[]>;
	delete(id: string): Promise<void>;
	update(id: string, updates: Partial<RichSnapshot>): Promise<void>;
}

/**
 * Event emitter interface for UI updates
 * VSCode-specific - maps to EventBus pattern
 */
export interface IEventEmitter {
	emit(type: string, data: unknown): void;
}
