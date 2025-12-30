/**
 * Core Event Tracker
 *
 * Tracks Core V1 product telemetry events for save attempts, snapshots, and sessions.
 * These events enable product analytics and funnel tracking.
 *
 * Reference: event-implementation-spec.md §P0 - Demo Critical Events
 *
 * Design Decisions:
 * - Fire-and-forget pattern (void trackEvent) to avoid blocking critical paths
 * - Type-safe props matching Zod schemas from @snapback/contracts
 * - Auto-inject event_version and timestamp
 *
 * @package apps/vscode
 */

import { CORE_TELEMETRY_EVENTS, EVENT_VERSION } from "@snapback/contracts";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";

/**
 * Properties for save_attempt event
 */
export interface SaveAttemptProps {
	/** Protection level applied to the file */
	protection: "watch" | "warn" | "block";
	/** Severity of the risk detected */
	severity: "low" | "medium" | "high" | "critical";
	/** Type of file being protected (e.g., "typescript", "javascript", "json") */
	file_kind: string;
	/** Reason for the save attempt (e.g., "user_save", "auto_save") */
	reason: string;
	/** Whether AI was involved in the decision */
	ai_present: boolean;
	/** Whether this was part of an AI burst operation */
	ai_burst: boolean;
	/** Outcome of the save attempt */
	outcome: "saved" | "canceled" | "blocked";
}

/**
 * Properties for snapshot_created event
 */
export interface SnapshotCreatedProps {
	/** Unique identifier for the session */
	session_id: string;
	/** Unique identifier for the snapshot */
	snapshot_id: string;
	/** Original size of the file in bytes */
	bytes_original: number;
	/** Size of the stored snapshot in bytes */
	bytes_stored: number;
	/** Whether deduplication was applied */
	dedup_hit: boolean;
	/** Time taken to create the snapshot in milliseconds */
	latency_ms: number;
}

/**
 * Properties for session_finalized event
 */
export interface SessionFinalizedProps {
	/** Unique identifier for the session */
	session_id: string;
	/** List of files in the session (relative paths only - privacy) */
	files: string[];
	/** List of triggers that activated during the session */
	triggers: string[];
	/** Duration of the session in milliseconds */
	duration_ms: number;
	/** Whether AI was involved in the session */
	ai_present: boolean;
	/** Whether this was part of an AI burst operation */
	ai_burst: boolean;
	/** Highest severity of issues in the session */
	highest_severity: "info" | "low" | "medium" | "high" | "critical";
	/** Optional AI detection v1 fields */
	ai_assist_level?: "none" | "light" | "medium" | "heavy" | "unknown";
	ai_confidence_score?: number;
	ai_provider?: "cursor" | "claude" | "unknown" | "none";
	ai_large_insert_count?: number;
	ai_total_chars?: number;
}

/**
 * Properties for issue_created event
 */
export interface IssueCreatedProps {
	/** Unique identifier for the issue */
	issue_id: string;
	/** Unique identifier for the session */
	session_id: string;
	/** Type of file where the issue was detected */
	file_kind: string;
	/** Type of issue detected */
	type: "secret" | "mock" | "phantom";
	/** Severity of the issue */
	severity: "info" | "low" | "medium" | "high" | "critical";
	/** Recommendation for resolving the issue */
	recommendation: string;
}

/**
 * Properties for issue_resolved event
 */
export interface IssueResolvedProps {
	/** Unique identifier for the issue */
	issue_id: string;
	/** How the issue was resolved */
	resolution: "fixed" | "ignored" | "allowlisted";
}

/**
 * Properties for session_restored event
 */
export interface SessionRestoredProps {
	/** Unique identifier for the session */
	session_id: string;
	/** List of files that were restored (relative paths only - privacy) */
	files_restored: string[];
	/** Time taken to restore the session in milliseconds */
	time_to_restore_ms: number;
	/** Reason for the session restoration */
	reason: string;
}

/**
 * Properties for policy_changed event
 */
export interface PolicyChangedProps {
	/** File pattern that the policy applies to */
	pattern: string;
	/** Previous protection level */
	from: "watch" | "warn" | "block" | "unprotected" | "unauthenticated" | "unaware";
	/** New protection level */
	to: "watch" | "warn" | "block" | "unprotected" | "authenticated" | "aware";
	/** Source of the policy change */
	source: string;
}

/**
 * Core event tracker class
 * Handles Core V1 product event tracking (save attempts, snapshots, sessions)
 *
 * All methods use fire-and-forget pattern to avoid blocking critical paths.
 * Events are queued by TelemetryProxy if network is unavailable.
 */
export class CoreEventTracker {
	constructor(private telemetryProxy: TelemetryProxy) {}

	/**
	 * Track save attempt event
	 *
	 * Called after protection level handling in SaveHandler.
	 * Tracks the outcome of protected file save operations.
	 *
	 * @param props - Save attempt properties
	 */
	trackSaveAttempt(props: SaveAttemptProps): void {
		logger.debug("Tracking save_attempt event", { protection: props.protection, outcome: props.outcome });

		// Fire-and-forget - don't await to avoid blocking save operation
		void this.telemetryProxy.trackEvent(CORE_TELEMETRY_EVENTS.SAVE_ATTEMPT, {
			...props,
			event_version: EVENT_VERSION,
			timestamp: Date.now(),
		});
	}

	/**
	 * Track snapshot created event
	 *
	 * Called after successful snapshot creation in ProtectionLevelHandler.
	 * Tracks performance metrics and deduplication effectiveness.
	 *
	 * @param props - Snapshot created properties
	 */
	trackSnapshotCreated(props: SnapshotCreatedProps): void {
		logger.debug("Tracking snapshot_created event", {
			snapshot_id: props.snapshot_id,
			latency_ms: props.latency_ms,
		});

		// Fire-and-forget - don't await to avoid blocking save operation
		void this.telemetryProxy.trackEvent(CORE_TELEMETRY_EVENTS.SNAPSHOT_CREATED, {
			...props,
			event_version: EVENT_VERSION,
			timestamp: Date.now(),
		});
	}

	/**
	 * Track session finalized event
	 *
	 * Called after session storage in SessionCoordinator.
	 * Tracks session metrics, AI involvement, and risk severity.
	 *
	 * @param props - Session finalized properties
	 */
	trackSessionFinalized(props: SessionFinalizedProps): void {
		logger.debug("Tracking session_finalized event", {
			session_id: props.session_id,
			files_count: props.files.length,
			duration_ms: props.duration_ms,
		});

		// Fire-and-forget - don't await to avoid blocking session finalization
		void this.telemetryProxy.trackEvent(CORE_TELEMETRY_EVENTS.SESSION_FINALIZED, {
			...props,
			event_version: EVENT_VERSION,
			timestamp: Date.now(),
		});
	}

	/**
	 * Track issue created event
	 *
	 * Called when a risk/issue is detected in a protected file.
	 * Tracks issue type, severity, and recommendations.
	 *
	 * @param props - Issue created properties
	 */
	trackIssueCreated(props: IssueCreatedProps): void {
		logger.debug("Tracking issue_created event", {
			issue_id: props.issue_id,
			type: props.type,
			severity: props.severity,
		});

		// Fire-and-forget
		void this.telemetryProxy.trackEvent(CORE_TELEMETRY_EVENTS.ISSUE_CREATED, {
			...props,
			event_version: EVENT_VERSION,
			timestamp: Date.now(),
		});
	}

	/**
	 * Track issue resolved event
	 *
	 * Called when a user resolves/acknowledges an issue.
	 * Tracks resolution method (fixed, ignored, allowlisted).
	 *
	 * @param props - Issue resolved properties
	 */
	trackIssueResolved(props: IssueResolvedProps): void {
		logger.debug("Tracking issue_resolved event", {
			issue_id: props.issue_id,
			resolution: props.resolution,
		});

		// Fire-and-forget
		void this.telemetryProxy.trackEvent(CORE_TELEMETRY_EVENTS.ISSUE_RESOLVED, {
			...props,
			event_version: EVENT_VERSION,
			timestamp: Date.now(),
		});
	}

	/**
	 * Track session restored event
	 *
	 * Called when a user restores files from a session.
	 * Tracks restore performance and user intent.
	 *
	 * @param props - Session restored properties
	 */
	trackSessionRestored(props: SessionRestoredProps): void {
		logger.debug("Tracking session_restored event", {
			session_id: props.session_id,
			files_count: props.files_restored.length,
			time_to_restore_ms: props.time_to_restore_ms,
		});

		// Fire-and-forget
		void this.telemetryProxy.trackEvent(CORE_TELEMETRY_EVENTS.SESSION_RESTORED, {
			...props,
			event_version: EVENT_VERSION,
			timestamp: Date.now(),
		});
	}

	/**
	 * Track policy changed event
	 *
	 * Called when protection policy rules change.
	 * Tracks policy transitions and sources.
	 *
	 * @param props - Policy changed properties
	 */
	trackPolicyChanged(props: PolicyChangedProps): void {
		logger.debug("Tracking policy_changed event", {
			pattern: props.pattern,
			from: props.from,
			to: props.to,
		});

		// Fire-and-forget
		void this.telemetryProxy.trackEvent(CORE_TELEMETRY_EVENTS.POLICY_CHANGED, {
			...props,
			event_version: EVENT_VERSION,
			timestamp: Date.now(),
		});
	}
}

// Singleton instance for easy access across handlers
let coreEventTrackerInstance: CoreEventTracker | null = null;

/**
 * Initialize the core event tracker singleton
 *
 * @param telemetryProxy - TelemetryProxy instance for sending events
 */
export function initializeCoreEventTracker(telemetryProxy: TelemetryProxy): void {
	coreEventTrackerInstance = new CoreEventTracker(telemetryProxy);
	logger.info("[CoreEventTracker] Initialized");
}

/**
 * Get the core event tracker singleton
 *
 * @returns CoreEventTracker instance or null if not initialized
 */
export function getCoreEventTracker(): CoreEventTracker | null {
	return coreEventTrackerInstance;
}
