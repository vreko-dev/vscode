/**
 * WebviewActivityTab - Dashboard activity tab messaging and data types
 *
 * Provides the data layer for the dashboard activity tab webview.
 * The actual webview HTML/CSS/JS is bundled separately; this module
 * handles message passing and data transformation.
 *
 * Design Principles:
 * - Type-safe message passing between extension and webview
 * - Pre-computed summary data for efficient rendering
 * - Session timeline with visual indicators
 *
 * Visual Format (in webview):
 * ┌──────────────────────────────────────────────────────────────┐
 * │  AI Detection Summary                                        │
 * │  ┌─────────┐  ┌─────────┐  ┌─────────┐                      │
 * │  │ 🤖 12   │  │ ⚡ 45   │  │ 📸 23   │                      │
 * │  │  AI     │  │  Auto   │  │ Manual  │                      │
 * │  └─────────┘  └─────────┘  └─────────┘                      │
 * │                                                              │
 * │  Session Timeline                                            │
 * │  ├─ 🤖 api.ts          2:45 PM                              │
 * │  ├─ 📸 index.ts (+2)   2:30 PM                              │
 * │  └─ ⚡ config.ts       1:15 PM                              │
 * └──────────────────────────────────────────────────────────────┘
 *
 * @packageDocumentation
 */

import type { SnapshotManifest } from "../../storage/types";
import {
	type AnySnapshotManifest,
	formatAnchorFile,
	formatReason,
	formatRelativeTime,
	getOriginIcon,
	isV2Manifest,
} from "./formatting";

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Message types for extension ↔ webview communication
 */
export const ActivityTabMessages = {
	/** Request webview to refresh data */
	REFRESH: "refresh",
	/** User selected a snapshot in the webview */
	SNAPSHOT_SELECTED: "snapshotSelected",
	/** User requested to restore a snapshot */
	RESTORE_SNAPSHOT: "restoreSnapshot",
	/** Extension sending updated data to webview */
	UPDATE_DATA: "updateData",
} as const;

export type ActivityTabMessageType = (typeof ActivityTabMessages)[keyof typeof ActivityTabMessages];

// =============================================================================
// DATA TYPES
// =============================================================================

/**
 * Summary data for a single snapshot (for webview display)
 */
export interface SnapshotSummary {
	/** Snapshot ID */
	id: string;
	/** File name with count (e.g., "api.ts (+2)") */
	fileName: string;
	/** Emoji icon (🤖, ⚡, 📸, ⏪) */
	icon: string;
	/** Relative time (e.g., "5m ago") */
	relativeTime: string;
	/** Human-readable reason */
	reason: string;
	/** Number of files in snapshot */
	fileCount: number;
	/** Timestamp for sorting/comparison */
	timestamp: number;
}

/**
 * Timeline item for session timeline display
 */
export interface SessionTimelineItem {
	/** Snapshot ID */
	snapshotId: string;
	/** File name */
	fileName: string;
	/** Emoji icon */
	icon: string;
	/** Time display (relative) */
	time: string;
	/** Reason label */
	reason: string;
}

/**
 * AI detection summary for the dashboard card
 */
export interface AIDetectionSummary {
	/** Number of AI-detected snapshots */
	aiSnapshotCount: number;
	/** Number of manual/interactive snapshots */
	manualSnapshotCount: number;
	/** Number of automated (non-AI) snapshots */
	automatedSnapshotCount: number;
	/** Total snapshot count */
	totalCount: number;
	/** AI percentage of total */
	aiPercentage: number;
	/** Manual percentage of total */
	manualPercentage: number;
	/** Automated percentage of total */
	automatedPercentage: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get reasons from a snapshot manifest (V1 or V2)
 */
function getSnapshotReasonsForWebview(snapshot: AnySnapshotManifest): string[] | undefined {
	if (isV2Manifest(snapshot)) {
		return snapshot.metadata?.reasons;
	}
	// V1 manifest - convert trigger to reason-like format
	const v1 = snapshot as SnapshotManifest;
	if (v1.metadata?.aiDetection?.detected) {
		return ["AI_DETECTED"];
	}
	switch (v1.trigger) {
		case "manual":
			return ["MANUAL_CHECKPOINT"];
		case "ai-detected":
			return ["AI_DETECTED"];
		case "auto":
			return ["RISK_BURST_START"];
		case "pre-save":
			return ["PRE_ROLLBACK"];
		default:
			return undefined;
	}
}

/**
 * Check if a snapshot is AI-detected
 */
function isAIDetected(snapshot: AnySnapshotManifest): boolean {
	if (isV2Manifest(snapshot)) {
		return snapshot.metadata?.reasons?.includes("AI_DETECTED") ?? false;
	}
	const v1 = snapshot as SnapshotManifest;
	return v1.trigger === "ai-detected" || v1.metadata?.aiDetection?.detected === true;
}

/**
 * Check if a snapshot is manual/interactive
 */
function isManualSnapshot(snapshot: AnySnapshotManifest): boolean {
	if (isV2Manifest(snapshot)) {
		return snapshot.metadata?.origin === "INTERACTIVE";
	}
	const v1 = snapshot as SnapshotManifest;
	return v1.trigger === "manual";
}

/**
 * Check if a snapshot is automated (non-AI)
 */
function isAutomatedSnapshot(snapshot: AnySnapshotManifest): boolean {
	if (isAIDetected(snapshot)) {
		return false;
	}
	if (isV2Manifest(snapshot)) {
		return snapshot.metadata?.origin === "AUTOMATED";
	}
	const v1 = snapshot as SnapshotManifest;
	return v1.trigger === "auto" || v1.trigger === "pre-save";
}

// =============================================================================
// DATA TRANSFORMATION FUNCTIONS
// =============================================================================

/**
 * Create a snapshot summary from a manifest
 */
export function createSnapshotSummary(snapshot: SnapshotManifest): SnapshotSummary {
	const reasons = getSnapshotReasonsForWebview(snapshot);
	return {
		id: snapshot.id,
		fileName: formatAnchorFile(snapshot),
		icon: getOriginIcon(snapshot),
		relativeTime: formatRelativeTime(snapshot.timestamp),
		reason: formatReason(reasons as any),
		fileCount: Object.keys(snapshot.files).length,
		timestamp: snapshot.timestamp,
	};
}

/**
 * Create session timeline data from snapshots
 */
export function createSessionTimelineData(snapshots: SnapshotManifest[]): SessionTimelineItem[] {
	return snapshots.map((snapshot) => {
		const reasons = getSnapshotReasonsForWebview(snapshot);
		return {
			snapshotId: snapshot.id,
			fileName: formatAnchorFile(snapshot),
			icon: getOriginIcon(snapshot),
			time: formatRelativeTime(snapshot.timestamp),
			reason: formatReason(reasons as any),
		};
	});
}

/**
 * Create AI detection summary from snapshots
 */
export function createAIDetectionSummary(snapshots: SnapshotManifest[]): AIDetectionSummary {
	let aiSnapshotCount = 0;
	let manualSnapshotCount = 0;
	let automatedSnapshotCount = 0;

	for (const snapshot of snapshots) {
		if (isAIDetected(snapshot)) {
			aiSnapshotCount++;
		} else if (isManualSnapshot(snapshot)) {
			manualSnapshotCount++;
		} else if (isAutomatedSnapshot(snapshot)) {
			automatedSnapshotCount++;
		} else {
			// Default to manual for snapshots without metadata
			manualSnapshotCount++;
		}
	}

	const totalCount = snapshots.length;

	return {
		aiSnapshotCount,
		manualSnapshotCount,
		automatedSnapshotCount,
		totalCount,
		aiPercentage: totalCount > 0 ? Math.round((aiSnapshotCount / totalCount) * 100) : 0,
		manualPercentage: totalCount > 0 ? Math.round((manualSnapshotCount / totalCount) * 100) : 0,
		automatedPercentage: totalCount > 0 ? Math.round((automatedSnapshotCount / totalCount) * 100) : 0,
	};
}

// =============================================================================
// WEBVIEW MESSAGE HANDLERS (Extension side)
// =============================================================================

/**
 * Message from webview to extension
 */
export interface WebviewToExtensionMessage {
	type: ActivityTabMessageType;
	payload?: unknown;
}

/**
 * Message from extension to webview
 */
export interface ExtensionToWebviewMessage {
	type: ActivityTabMessageType;
	payload?: {
		timeline?: SessionTimelineItem[];
		summary?: AIDetectionSummary;
		snapshots?: SnapshotSummary[];
	};
}

/**
 * Create the data payload to send to the webview
 */
export function createActivityTabData(snapshots: SnapshotManifest[]): ExtensionToWebviewMessage["payload"] {
	return {
		timeline: createSessionTimelineData(snapshots),
		summary: createAIDetectionSummary(snapshots),
		snapshots: snapshots.map(createSnapshotSummary),
	};
}
