/**
 * Constants and configuration values for SnapBack extension
 *
 * Note: Most threshold values are imported from @snapback/sdk for consistency
 * across all platforms (VSCode, CLI, MCP, Web). Only VSCode-specific constants
 * are defined locally.
 */

import { THRESHOLDS } from "@snapback/sdk";

/**
 * Timing-related constants
 *
 * Centralized timing thresholds from SDK with VSCode-specific additions.
 */
export const TIMING_CONSTANTS = {
	/** Debounce window for rapid saves (5 seconds) - from SDK protection.debounceWindow */
	SNAPSHOT_DEBOUNCE_MS: THRESHOLDS.protection.debounceWindow,
	/** Session idle timeout (105 seconds) - from SDK session.idleTimeout */
	SESSION_IDLE_TIMEOUT_MS: THRESHOLDS.session.idleTimeout,
	/** Maximum session duration (1 hour) - from SDK session.maxSessionDuration */
	SESSION_MAX_DURATION_MS: THRESHOLDS.session.maxSessionDuration,
	/** Database lock timeout (30 seconds) - VSCode-specific for SQLite WAL mode */
	LOCK_TIMEOUT_MS: 30000,
	/** Default cooldown period (5 minutes) - from SDK protection.otherCooldown */
	COOLDOWN_DEFAULT_MS: THRESHOLDS.protection.otherCooldown,
} as const;

/**
 * File and storage size limits
 *
 * Centralized resource limits from SDK with VSCode-specific UI constants.
 */
export const SIZE_LIMITS = {
	/** Maximum individual file size (10 MB) - from SDK resources.snapshotMaxFileSize */
	MAX_FILE_SIZE: THRESHOLDS.resources.snapshotMaxFileSize,
	/** Maximum total snapshot size (500 MB) - from SDK resources.snapshotMaxTotalSize */
	MAX_TOTAL_SIZE: THRESHOLDS.resources.snapshotMaxTotalSize,
	/** Maximum files in a snapshot - from SDK resources.snapshotMaxFiles */
	MAX_FILES: THRESHOLDS.resources.snapshotMaxFiles,
	/** Default pagination size - VSCode-specific UI constant */
	DEFAULT_PAGE_SIZE: 100,
	/** Maximum page size - VSCode-specific UI constant */
	MAX_PAGE_SIZE: 1000,
	/** Default maximum snapshots to retain - from SDK resources.dedupCacheSize */
	DEFAULT_MAX_SNAPSHOTS: THRESHOLDS.resources.dedupCacheSize,
	/** Default retention period (30 days in ms) - VSCode-specific retention policy */
	DEFAULT_MAX_RETENTION_MS: 30 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Risk score thresholds
 *
 * Centralized risk thresholds from SDK for consistent behavior.
 */
export const RISK_THRESHOLDS = {
	/** Score above which to block changes - from SDK risk.blockingThreshold */
	BLOCK_SCORE: THRESHOLDS.risk.blockingThreshold,
	/** Score above which to warn - from SDK risk.highThreshold */
	WARN_SCORE: THRESHOLDS.risk.highThreshold,
} as const;

/** Database configuration */
export const DATABASE_CONFIG = {
	/** WAL mode journal setting */
	JOURNAL_MODE: "WAL",
	/** Synchronous mode */
	SYNCHRONOUS: "NORMAL",
	/** Cache size in pages */
	CACHE_SIZE: -2000,
} as const;
