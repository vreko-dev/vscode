/**
 * Snapshot Types for VSCode Extension
 *
 * Re-exports canonical types from @snapback/contracts where available.
 * Defines VSCode-specific interfaces for UI and storage.
 *
 * Note: Some types (RichSnapshot, MinimalSnapshot, SnapshotState) are defined locally
 * because contracts doesn't export them (to avoid naming conflicts with schemas.ts).
 */

import type { EncryptedData } from "../snapshot/EncryptionService";

// =============================================================================
// RE-EXPORTS FROM @snapback/contracts (Single Source of Truth)
// =============================================================================

export type {
	FileInput,
	FileState as ContractFileState,
	Snapshot,
	SnapshotOrigin,
} from "@snapback/contracts";

/**
 * Snapshot creation options
 * Extended from contracts with DORA metrics fields for VSCode
 */
export interface CreateSnapshotOptions {
	/** Custom description (overrides auto-generated name) */
	description?: string;
	/** Whether snapshot should be protected */
	protected?: boolean;
	/** Origin of the snapshot for DORA metrics (defaults to 'manual') */
	origin?: import("@snapback/contracts").SnapshotOrigin;
	/** Time since last file change in milliseconds (for DORA lead time metric) */
	timeSinceLastChangeMs?: number;
}

// =============================================================================
// LOCALLY DEFINED TYPES (Not exported from contracts)
// =============================================================================

/**
 * File state interface from SnapshotDeduplicator
 * Extends contract FileState with VSCode-specific EncryptedData
 */
export interface FileState {
	path: string;
	content: string;
	hash: string;
	encrypted?: EncryptedData;
}

/**
 * Snapshot state for deduplication
 * Local definition - contracts doesn't export SnapshotState
 */
export interface SnapshotState {
	id: string;
	timestamp: number;
	files: FileState[];
}

/**
 * Rich Snapshot with UI metadata
 * Local definition - contracts doesn't export RichSnapshot
 */
export interface RichSnapshot {
	id: string;
	timestamp: number;
	meta?: Record<string, unknown>;
	files?: string[];
	fileContents?: Record<string, string>;
	name: string;
	fileStates?: FileState[];
	isProtected: boolean;
	icon: string;
	iconColor: string;
	[key: string]: unknown;
}

/**
 * Minimal Snapshot for deletion operations
 * Local definition - contracts doesn't export MinimalSnapshot
 */
export interface MinimalSnapshot {
	id: string;
	name: string;
	timestamp: number;
	isProtected: boolean;
}

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
