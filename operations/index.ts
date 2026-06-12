/**
 * Operations Module
 *
 * Extracted operation coordination system from OperationCoordinator.
 *
 * @module operations
 */

// Re-export the original OperationCoordinator as the facade
// This maintains backward compatibility while we extract services
export { OperationCoordinator } from "../operationCoordinator.js";

// Filesystem utilities
export {
	createIgnoreInstance,
	DEFAULT_IGNORE_PATTERNS,
	filterWorkspaceFiles,
	getSnapshotLimits,
	isWithinWorkspace,
	loadIgnorePatterns,
	toAbsolutePaths,
	toRelativePaths,
	walkDirectory,
} from "./filesystem-utils.js";

// Core operation management
export { OperationManager } from "./operation-manager.js";
// Helpers
export { failedRestoreResult, successRestoreResult } from "./restore-helpers.js";
export { RestoreService } from "./restore-service.js";
// Additional exports from snapshot-service
export type { SnapshotCreationOptions, SnapshotCreationResult as SnapshotResult } from "./snapshot-service.js";
// Services
export { SnapshotService } from "./snapshot-service.js";
// Types
export type {
	DetailedRestoreResult,
	DirectoryWalkOptions,
	Operation,
	RestoreOptions,
	SnapshotCreationResult,
	SnapshotLimits,
} from "./types.js";
