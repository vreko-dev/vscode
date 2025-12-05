/**
 * Comprehensive error type system for SnapBack VS Code Extension
 *
 * This module provides a hierarchical error type system with proper error chaining,
 * error codes, and type guards for robust error handling across the extension.
 */

/**
 * Base error class for all SnapBack errors
 *
 * Provides:
 * - Unique error codes for programmatic error handling
 * - Error cause chaining for debugging
 * - Proper stack traces via Error.captureStackTrace
 */
export class SnapBackError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = "SnapBackError";

		// Maintains proper stack trace for where error was thrown (only available in V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Returns full error chain as string for logging
	 */
	getFullMessage(): string {
		const messages = [this.message];
		let current = this.cause;
		while (current) {
			messages.push(`Caused by: ${current.message}`);
			current = current instanceof SnapBackError ? current.cause : undefined;
		}
		return messages.join("\n");
	}
}

// =============================================================================
// Storage Errors
// =============================================================================

/**
 * Storage-related errors
 * Base class for all storage and database errors
 */
export class StorageError extends SnapBackError {
	constructor(message: string, code: string, cause?: Error) {
		super(message, code, cause);
		this.name = "StorageError";
	}
}

/**
 * Database connection failed
 * Thrown when unable to connect to SQLite database
 */
export class DatabaseConnectionError extends StorageError {
	constructor(message: string, cause?: Error) {
		super(message, "DATABASE_CONNECTION_ERROR", cause);
		this.name = "DatabaseConnectionError";
	}
}

/**
 * Database initialization failed
 * Thrown when database schema creation or migration fails
 */
export class DatabaseInitializationError extends StorageError {
	constructor(message: string, cause?: Error) {
		super(message, "DATABASE_INITIALIZATION_ERROR", cause);
		this.name = "DatabaseInitializationError";
	}
}

/**
 * Database query failed
 * Thrown when a database query execution fails
 */
export class DatabaseQueryError extends StorageError {
	constructor(
		message: string,
		public readonly query?: string,
		cause?: Error,
	) {
		super(message, "DATABASE_QUERY_ERROR", cause);
		this.name = "DatabaseQueryError";
	}
}

/**
 * Database transaction failed
 * Thrown when a database transaction cannot be completed
 */
export class DatabaseTransactionError extends StorageError {
	constructor(message: string, cause?: Error) {
		super(message, "DATABASE_TRANSACTION_ERROR", cause);
		this.name = "DatabaseTransactionError";
	}
}

/**
 * Storage corruption detected
 * Thrown when data integrity issues are detected
 */
export class StorageCorruptionError extends StorageError {
	constructor(message: string, cause?: Error) {
		super(message, "STORAGE_CORRUPTION_ERROR", cause);
		this.name = "StorageCorruptionError";
	}
}

// =============================================================================
// Snapshot Errors
// =============================================================================

/**
 * Snapshot-related errors
 * Base class for all snapshot operation errors
 */
export class SnapshotError extends SnapBackError {
	constructor(message: string, code: string, cause?: Error) {
		super(message, code, cause);
		this.name = "SnapshotError";
	}
}

/**
 * Snapshot not found
 * Thrown when attempting to access a non-existent snapshot
 */
export class SnapshotNotFoundError extends SnapshotError {
	constructor(
		public readonly snapshotId: string,
		cause?: Error,
	) {
		super(`Snapshot not found: ${snapshotId}`, "SNAPSHOT_NOT_FOUND", cause);
		this.name = "SnapshotNotFoundError";
	}
}

/**
 * Snapshot creation failed
 * Thrown when snapshot creation process fails
 */
export class SnapshotCreationError extends SnapshotError {
	constructor(
		message: string,
		public readonly filePath?: string,
		cause?: Error,
	) {
		super(message, "SNAPSHOT_CREATION_ERROR", cause);
		this.name = "SnapshotCreationError";
	}
}

/**
 * Snapshot restoration failed
 * Thrown when snapshot restoration process fails
 */
export class SnapshotRestorationError extends SnapshotError {
	constructor(
		message: string,
		public readonly snapshotId: string,
		cause?: Error,
	) {
		super(message, "SNAPSHOT_RESTORATION_ERROR", cause);
		this.name = "SnapshotRestorationError";
	}
}

/**
 * Snapshot validation failed
 * Thrown when snapshot data fails validation checks
 */
export class SnapshotValidationError extends SnapshotError {
	constructor(
		message: string,
		public readonly snapshotId?: string,
		cause?: Error,
	) {
		super(message, "SNAPSHOT_VALIDATION_ERROR", cause);
		this.name = "SnapshotValidationError";
	}
}

/**
 * Snapshot deduplication failed
 * Thrown when deduplication process encounters an error
 */
export class SnapshotDeduplicationError extends SnapshotError {
	constructor(message: string, cause?: Error) {
		super(message, "SNAPSHOT_DEDUPLICATION_ERROR", cause);
		this.name = "SnapshotDeduplicationError";
	}
}

// =============================================================================
// Session Errors
// =============================================================================

/**
 * Session-related errors
 * Base class for all session operation errors
 */
export class SessionError extends SnapBackError {
	constructor(message: string, code: string, cause?: Error) {
		super(message, code, cause);
		this.name = "SessionError";
	}
}

/**
 * Session not found
 * Thrown when attempting to access a non-existent session
 */
export class SessionNotFoundError extends SessionError {
	constructor(
		public readonly sessionId: string,
		cause?: Error,
	) {
		super(`Session not found: ${sessionId}`, "SESSION_NOT_FOUND", cause);
		this.name = "SessionNotFoundError";
	}
}

/**
 * Session creation failed
 * Thrown when session creation process fails
 */
export class SessionCreationError extends SessionError {
	constructor(message: string, cause?: Error) {
		super(message, "SESSION_CREATION_ERROR", cause);
		this.name = "SessionCreationError";
	}
}

/**
 * Session finalization failed
 * Thrown when session finalization process fails
 */
export class SessionFinalizationError extends SessionError {
	constructor(
		message: string,
		public readonly sessionId?: string,
		cause?: Error,
	) {
		super(message, "SESSION_FINALIZATION_ERROR", cause);
		this.name = "SessionFinalizationError";
	}
}

/**
 * Session restoration failed
 * Thrown when session restoration process fails
 */
export class SessionRestorationError extends SessionError {
	constructor(
		message: string,
		public readonly sessionId: string,
		cause?: Error,
	) {
		super(message, "SESSION_RESTORATION_ERROR", cause);
		this.name = "SessionRestorationError";
	}
}

// =============================================================================
// Protection Errors
// =============================================================================

/**
 * Protection-related errors
 * Base class for all protection system errors
 */
export class ProtectionError extends SnapBackError {
	constructor(message: string, code: string, cause?: Error) {
		super(message, code, cause);
		this.name = "ProtectionError";
	}
}

/**
 * Protection blocked operation
 * Thrown when a file operation is blocked by protection level
 */
export class ProtectionBlockedError extends ProtectionError {
	constructor(
		public readonly filePath: string,
		public readonly reason: string,
		public readonly protectionLevel?: string,
	) {
		super(
			`Save blocked for protected file: ${filePath}. Reason: ${reason}`,
			"PROTECTION_BLOCKED",
		);
		this.name = "ProtectionBlockedError";
	}
}

/**
 * Protection level validation failed
 * Thrown when an invalid protection level is specified
 */
export class InvalidProtectionLevelError extends ProtectionError {
	constructor(
		public readonly level: string,
		public readonly validLevels: string[],
	) {
		super(
			`Invalid protection level: ${level}. Valid levels: ${validLevels.join(", ")}`,
			"INVALID_PROTECTION_LEVEL",
		);
		this.name = "InvalidProtectionLevelError";
	}
}

/**
 * Policy evaluation failed
 * Thrown when protection policy evaluation encounters an error
 */
export class PolicyEvaluationError extends ProtectionError {
	constructor(
		message: string,
		public readonly policyPath?: string,
		cause?: Error,
	) {
		super(message, "POLICY_EVALUATION_ERROR", cause);
		this.name = "PolicyEvaluationError";
	}
}

// =============================================================================
// Validation Errors
// =============================================================================

/**
 * Validation errors
 * Thrown when data validation fails
 */
export class ValidationError extends SnapBackError {
	constructor(
		message: string,
		code: string = "VALIDATION_ERROR",
		public readonly field?: string,
		public readonly value?: unknown,
		cause?: Error,
	) {
		super(message, code, cause);
		this.name = "ValidationError";
	}
}

/**
 * Schema validation failed
 * Thrown when data fails schema validation (Zod, etc.)
 */
export class SchemaValidationError extends ValidationError {
	constructor(
		message: string,
		public readonly schema?: string,
		public readonly errors?: unknown[],
		cause?: Error,
	) {
		super(message, "SCHEMA_VALIDATION_ERROR", "schema", errors, cause);
		this.name = "SchemaValidationError";
	}
}

// =============================================================================
// Configuration Errors
// =============================================================================

/**
 * Configuration errors
 * Thrown when configuration loading or validation fails
 */
export class ConfigurationError extends SnapBackError {
	constructor(
		message: string,
		code: string = "CONFIGURATION_ERROR",
		public readonly configKey?: string,
		cause?: Error,
	) {
		super(message, code, cause);
		this.name = "ConfigurationError";
	}
}

/**
 * Configuration file not found
 * Thrown when required configuration file is missing
 */
export class ConfigurationFileNotFoundError extends ConfigurationError {
	constructor(
		public readonly filePath: string,
		cause?: Error,
	) {
		super(
			`Configuration file not found: ${filePath}`,
			"CONFIGURATION_FILE_NOT_FOUND",
			filePath,
			cause,
		);
		this.name = "ConfigurationFileNotFoundError";
	}
}

/**
 * Configuration parse error
 * Thrown when configuration file cannot be parsed
 */
export class ConfigurationParseError extends ConfigurationError {
	constructor(
		public readonly filePath: string,
		cause?: Error,
	) {
		super(
			`Failed to parse configuration file: ${filePath}`,
			"CONFIGURATION_PARSE_ERROR",
			filePath,
			cause,
		);
		this.name = "ConfigurationParseError";
	}
}

// =============================================================================
// File System Errors
// =============================================================================

/**
 * File system errors
 * Base class for all file system operation errors
 */
export class FileSystemError extends SnapBackError {
	constructor(message: string, code: string, cause?: Error) {
		super(message, code, cause);
		this.name = "FileSystemError";
	}
}

/**
 * File not found
 * Thrown when a required file does not exist
 */
export class FileNotFoundError extends FileSystemError {
	constructor(
		public readonly filePath: string,
		cause?: Error,
	) {
		super(`File not found: ${filePath}`, "FILE_NOT_FOUND", cause);
		this.name = "FileNotFoundError";
	}
}

/**
 * File read error
 * Thrown when unable to read file contents
 */
export class FileReadError extends FileSystemError {
	constructor(
		public readonly filePath: string,
		cause?: Error,
	) {
		super(`Failed to read file: ${filePath}`, "FILE_READ_ERROR", cause);
		this.name = "FileReadError";
	}
}

/**
 * File write error
 * Thrown when unable to write file contents
 */
export class FileWriteError extends FileSystemError {
	constructor(
		public readonly filePath: string,
		cause?: Error,
	) {
		super(`Failed to write file: ${filePath}`, "FILE_WRITE_ERROR", cause);
		this.name = "FileWriteError";
	}
}

/**
 * File permission error
 * Thrown when file permissions prevent operation
 */
export class FilePermissionError extends FileSystemError {
	constructor(
		public readonly filePath: string,
		public readonly operation: string,
		cause?: Error,
	) {
		super(
			`Permission denied for ${operation} operation on: ${filePath}`,
			"FILE_PERMISSION_ERROR",
			cause,
		);
		this.name = "FilePermissionError";
	}
}

// =============================================================================
// Save Operation Errors
// =============================================================================

/**
 * Save operation error - discriminated union for Result<T, SaveError> pattern
 * Represents different failure modes during file save operations
 */
export type SaveError =
	| {
			/** Protection level blocked the save */
			type: "protection_blocked";
			reason: string;
			protectionLevel: string;
			filePath: string;
	  }
	| {
			/** Analysis/risk evaluation failed */
			type: "analysis_failed";
			message: string;
			filePath: string;
			cause?: Error;
	  }
	| {
			/** Snapshot creation failed */
			type: "snapshot_failed";
			message: string;
			filePath: string;
			cause?: Error;
	  }
	| {
			/** User cancelled save operation */
			type: "user_cancelled";
			reason:
				| "user_cancelled_protection"
				| "user_cancelled_ai_warning"
				| "user_cancelled_other";
	  };

/**
 * Type guard for SaveError
 */
export function isSaveError(error: unknown): error is SaveError {
	if (typeof error === "object" && error !== null && "type" in error) {
		const type = (error as Record<string, unknown>).type;
		return (
			type === "protection_blocked" ||
			type === "analysis_failed" ||
			type === "snapshot_failed" ||
			type === "user_cancelled"
		);
	}
	return false;
}

// =============================================================================
// Event Bus Errors
// =============================================================================

/**
 * Event bus errors
 * Base class for all event bus errors
 */
export class EventBusError extends SnapBackError {
	constructor(message: string, code: string, cause?: Error) {
		super(message, code, cause);
		this.name = "EventBusError";
	}
}

/**
 * Event bus connection failed
 * Thrown when unable to connect to event bus
 */
export class EventBusConnectionError extends EventBusError {
	constructor(message: string, cause?: Error) {
		super(message, "EVENT_BUS_CONNECTION_ERROR", cause);
		this.name = "EventBusConnectionError";
	}
}

/**
 * Event publish failed
 * Thrown when event publishing fails
 */
export class EventPublishError extends EventBusError {
	constructor(
		message: string,
		public readonly eventType?: string,
		cause?: Error,
	) {
		super(message, "EVENT_PUBLISH_ERROR", cause);
		this.name = "EventPublishError";
	}
}

// =============================================================================
// Type Guards and Utilities
// =============================================================================

/**
 * Type guard to check if error is a SnapBackError
 */
export function isSnapBackError(error: unknown): error is SnapBackError {
	return error instanceof SnapBackError;
}

/**
 * Type guard to check if error is a StorageError
 */
export function isStorageError(error: unknown): error is StorageError {
	return error instanceof StorageError;
}

/**
 * Type guard to check if error is a SnapshotError
 */
export function isSnapshotError(error: unknown): error is SnapshotError {
	return error instanceof SnapshotError;
}

/**
 * Type guard to check if error is a SessionError
 */
export function isSessionError(error: unknown): error is SessionError {
	return error instanceof SessionError;
}

/**
 * Type guard to check if error is a ProtectionError
 */
export function isProtectionError(error: unknown): error is ProtectionError {
	return error instanceof ProtectionError;
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
	return error instanceof ValidationError;
}

/**
 * Type guard to check if error is a ConfigurationError
 */
export function isConfigurationError(
	error: unknown,
): error is ConfigurationError {
	return error instanceof ConfigurationError;
}

/**
 * Type guard to check if error is a FileSystemError
 */
export function isFileSystemError(error: unknown): error is FileSystemError {
	return error instanceof FileSystemError;
}

/**
 * Converts unknown error to Error instance
 * Safely handles any thrown value and converts to Error
 */
export function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}
	if (typeof error === "string") {
		return new Error(error);
	}
	if (error && typeof error === "object" && "message" in error) {
		return new Error(String(error.message));
	}
	return new Error(String(error));
}

/**
 * Wraps error in SnapBackError if not already one
 * Useful for ensuring all errors thrown are SnapBackError instances
 */
export function ensureSnapBackError(
	error: unknown,
	defaultCode = "UNKNOWN_ERROR",
): SnapBackError {
	if (isSnapBackError(error)) {
		return error;
	}
	const errorObj = toError(error);
	return new SnapBackError(errorObj.message, defaultCode, errorObj);
}

/**
 * Error severity levels for logging and handling
 */
export enum ErrorSeverity {
	/** Low severity - informational, does not affect functionality */
	LOW = "low",
	/** Medium severity - degrades functionality but not critical */
	MEDIUM = "medium",
	/** High severity - significantly impacts functionality */
	HIGH = "high",
	/** Critical severity - system failure, requires immediate attention */
	CRITICAL = "critical",
}

/**
 * Maps error types to severity levels
 */
export function getErrorSeverity(error: unknown): ErrorSeverity {
	if (
		error instanceof DatabaseConnectionError ||
		error instanceof DatabaseInitializationError
	) {
		return ErrorSeverity.CRITICAL;
	}
	if (error instanceof StorageCorruptionError) {
		return ErrorSeverity.CRITICAL;
	}
	if (
		error instanceof SessionFinalizationError ||
		error instanceof SnapshotCreationError
	) {
		return ErrorSeverity.HIGH;
	}
	if (error instanceof ValidationError || error instanceof ConfigurationError) {
		return ErrorSeverity.MEDIUM;
	}
	if (error instanceof ProtectionBlockedError) {
		return ErrorSeverity.LOW; // Expected behavior, not an error
	}
	return ErrorSeverity.MEDIUM;
}
