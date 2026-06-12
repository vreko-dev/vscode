/**
 * Snapshot Display Formatting Utilities
 *
 * Shared formatting functions for consistent snapshot display across:
 * - Quick Pick (status bar click)
 * - Tree View (sidebar)
 * - Webview (dashboard activity tab)
 *
 * Design Principles:
 * 1. Instant recognition - Icons + file names, not UUIDs
 * 2. Progressive disclosure - Essential info first
 * 3. Consistent vocabulary - Same icons, same terms everywhere
 *
 * @packageDocumentation
 */

import type { ReasonCode, SnapshotManifest, SnapshotManifestV2 } from "../../storage/types";

// =============================================================================
// TYPE UTILITIES
// =============================================================================

/**
 * Union type for both V1 and V2 snapshot manifests
 */
export type AnySnapshotManifest = SnapshotManifest | SnapshotManifestV2;

/**
 * Type guard to check if a snapshot is V2
 */
export function isV2Manifest(snapshot: AnySnapshotManifest): snapshot is SnapshotManifestV2 {
	return "schemaVersion" in snapshot && snapshot.schemaVersion === 2;
}

// =============================================================================
// ORIGIN ICONS
// =============================================================================

/**
 * Icon mapping for snapshot origins.
 * Uses emoji for universal display across VS Code UI surfaces.
 */
export const ORIGIN_ICONS = {
	/** AI tool made changes */
	AI_DETECTED: "🤖",
	/** Auto-triggered (burst, risk, session) */
	AUTOMATED: "⚡",
	/** User manually created */
	INTERACTIVE: "📸",
	/** Safety snapshot before restore */
	PRE_RESTORE: "⏪",
} as const;

/**
 * Get the appropriate icon for a snapshot based on its origin.
 *
 * Works with both V1 (SnapshotManifest) and V2 (SnapshotManifestV2) manifests.
 *
 * Priority order:
 * 1. PRE_ROLLBACK type (V2) → ⏪ (always takes precedence)
 * 2. AI_DETECTED reason (V2) or ai-detected trigger (V1) → 🤖
 * 3. AUTOMATED origin (V2) or auto trigger (V1) → ⚡
 * 4. Default (INTERACTIVE/manual/unknown) → 📸
 *
 * @param snapshot - The snapshot manifest to get icon for
 * @returns Emoji icon representing the snapshot origin
 */
export function getOriginIcon(snapshot: AnySnapshotManifest): string {
	// V2 manifest handling
	if (isV2Manifest(snapshot)) {
		// PRE_ROLLBACK type always shows restore icon
		if (snapshot.type === "PRE_ROLLBACK") {
			return ORIGIN_ICONS.PRE_RESTORE;
		}

		const metadata = snapshot.metadata;

		// No metadata → default to interactive
		if (!metadata) {
			return ORIGIN_ICONS.INTERACTIVE;
		}

		// AI detected takes priority over general automation
		if (metadata.reasons?.includes("AI_DETECTED")) {
			return ORIGIN_ICONS.AI_DETECTED;
		}

		// Automated origin (burst, risk, session triggers)
		if (metadata.origin === "AUTOMATED") {
			return ORIGIN_ICONS.AUTOMATED;
		}

		// Default: interactive/manual
		return ORIGIN_ICONS.INTERACTIVE;
	}

	// V1 manifest handling (uses trigger field)
	const v1Snapshot = snapshot as SnapshotManifest;

	// Check for AI detection via trigger or metadata
	if (v1Snapshot.trigger === "ai-detected" || v1Snapshot.metadata?.aiDetection?.detected) {
		return ORIGIN_ICONS.AI_DETECTED;
	}

	// Auto trigger
	if (v1Snapshot.trigger === "auto") {
		return ORIGIN_ICONS.AUTOMATED;
	}

	// Pre-save trigger (similar to pre-restore)
	if (v1Snapshot.trigger === "pre-save") {
		return ORIGIN_ICONS.PRE_RESTORE;
	}

	// Manual or default
	return ORIGIN_ICONS.INTERACTIVE;
}

// =============================================================================
// REASON LABELS
// =============================================================================

/**
 * Human-readable labels for reason codes.
 * Maps internal reason codes to user-friendly descriptions.
 */
export const REASON_LABELS: Record<string, string> = {
	MANUAL_CHECKPOINT: "Manual snapshot",
	AI_DETECTED: "AI activity detected",
	RISK_BURST_START: "Rapid changes detected",
	CRITICAL_FILE: "Critical file changed",
	PRE_ROLLBACK: "Before restore",
	RISK_LARGE_DELETE: "Large deletion detected",
	RISK_MULTI_FILE: "Multiple files changed",
	MANUAL_SAVE: "Manual save",
	// Additional reason codes
	HIGH_RISK: "High-risk changes",
	SESSION_END: "Session ended",
	PATTERN_VIOLATION: "Pattern violation detected",
} as const;

/**
 * Format reasons array into a human-readable string.
 *
 * Uses the first reason code as the primary label.
 * Falls back to "Snapshot" if no reasons provided.
 *
 * @param reasons - Array of reason codes, or undefined
 * @returns Human-readable reason string
 */
export function formatReason(reasons: ReasonCode[] | undefined): string {
	if (!reasons?.length) {
		return "Snapshot";
	}

	const primaryReason = reasons[0];
	return REASON_LABELS[primaryReason] ?? "Snapshot";
}

// =============================================================================
// TIME FORMATTING
// =============================================================================

/**
 * Format timestamp as relative time (e.g., "5m ago").
 *
 * Time ranges:
 * - < 1 min: "Just now"
 * - < 60 min: "Xm ago"
 * - < 24 hours: "Xh ago"
 * - 1 day: "Yesterday"
 * - < 7 days: "Xd ago"
 * - >= 7 days: locale date string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time string
 */
export function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) {
		return "Just now";
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	if (hours < 24) {
		return `${hours}h ago`;
	}
	if (days === 1) {
		return "Yesterday";
	}
	if (days < 7) {
		return `${days}d ago`;
	}

	return new Date(timestamp).toLocaleDateString();
}

/**
 * Format timestamp as absolute time (e.g., "2:34 PM").
 *
 * Uses 12-hour format with hour and minute only (no seconds).
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string
 */
export function formatAbsoluteTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

// =============================================================================
// FILE FORMATTING
// =============================================================================

/**
 * Get basename from a path, handling both Unix and Windows separators.
 * This is needed because path.basename on Unix doesn't recognize Windows backslashes.
 *
 * @param filePath - File path (Unix or Windows style)
 * @returns The basename (filename) portion
 */
function getBasename(filePath: string): string {
	// Handle both forward slashes and backslashes
	const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
	if (lastSlash === -1) {
		return filePath;
	}
	return filePath.slice(lastSlash + 1);
}

/**
 * Format anchor file display with optional file count.
 *
 * Works with both V1 and V2 manifests.
 *
 * Single file: "api.ts"
 * Multiple files: "api.ts (+2)"
 *
 * @param snapshot - The snapshot manifest
 * @returns Formatted file display string
 */
export function formatAnchorFile(snapshot: AnySnapshotManifest): string {
	const anchor = snapshot.anchorFile;

	if (!anchor) {
		return "Multiple files";
	}

	// Get basename, handling both Unix and Windows paths
	const basename = getBasename(anchor);
	const fileCount = Object.keys(snapshot.files).length;

	if (fileCount > 1) {
		return `${basename} (+${fileCount - 1})`;
	}

	return basename;
}

// =============================================================================
// FILE TYPE ICONS
// =============================================================================

/**
 * Icon mapping for file types based on filename/extension patterns.
 * Provides contextual visual recognition in timeline view.
 */
export const FILE_TYPE_ICONS = {
	CONFIG: "⚙️",
	STYLE: "🎨",
	PACKAGE: "📦",
	TEST: "🧪",
	DOCS: "📝",
	DATA: "🗂️",
	UI: "🖼️",
	CODE: "📄",
	LOCK: "🔒",
	ENV: "🔐",
	IMAGE: "🖼️",
	DEFAULT: "📄",
} as const;

/**
 * Get file-type icon based on filename patterns.
 *
 * Pattern matching priority (first match wins):
 * 1. Special filenames (package.json, tsconfig.json, etc.)
 * 2. File extension patterns
 * 3. Default to CODE icon
 *
 * @param filePath - File path or filename
 * @returns Emoji icon representing the file type
 */
export function getFileTypeIcon(filePath: string): string {
	const basename = getBasename(filePath).toLowerCase();
	const ext = basename.includes(".") ? (basename.split(".").pop() ?? "") : "";

	// Special filenames first (exact or pattern match)
	if (basename === "package.json" || basename === "package-lock.json") {
		return FILE_TYPE_ICONS.PACKAGE;
	}
	if (basename.endsWith(".lock") || basename === "yarn.lock" || basename === "pnpm-lock.yaml") {
		return FILE_TYPE_ICONS.LOCK;
	}
	if (basename.startsWith(".env") || basename === ".env") {
		return FILE_TYPE_ICONS.ENV;
	}
	if (
		basename.includes(".config.") ||
		basename.endsWith("rc") ||
		basename.endsWith("rc.js") ||
		basename.endsWith("rc.json") ||
		basename.endsWith("rc.ts") ||
		basename === "tsconfig.json" ||
		basename === "jsconfig.json" ||
		basename === "vite.config.ts" ||
		basename === "vitest.config.ts" ||
		basename === "tailwind.config.js" ||
		basename === "tailwind.config.ts" ||
		basename === "postcss.config.js" ||
		basename === "next.config.js" ||
		basename === "next.config.mjs"
	) {
		return FILE_TYPE_ICONS.CONFIG;
	}

	// Test files
	if (
		basename.includes(".test.") ||
		basename.includes(".spec.") ||
		basename.includes("__tests__") ||
		basename.endsWith(".test.ts") ||
		basename.endsWith(".test.tsx") ||
		basename.endsWith(".spec.ts") ||
		basename.endsWith(".spec.tsx")
	) {
		return FILE_TYPE_ICONS.TEST;
	}

	// Extension-based matching
	switch (ext) {
		// Styles
		case "css":
		case "scss":
		case "sass":
		case "less":
		case "styl":
			return FILE_TYPE_ICONS.STYLE;

		// UI/Views
		case "tsx":
		case "jsx":
		case "vue":
		case "svelte":
		case "html":
		case "htm":
			return FILE_TYPE_ICONS.UI;

		// Documentation
		case "md":
		case "mdx":
		case "txt":
		case "rst":
			return FILE_TYPE_ICONS.DOCS;

		// Data
		case "json":
		case "yaml":
		case "yml":
		case "toml":
		case "xml":
			return FILE_TYPE_ICONS.DATA;

		// Images
		case "png":
		case "jpg":
		case "jpeg":
		case "gif":
		case "svg":
		case "webp":
		case "ico":
			return FILE_TYPE_ICONS.IMAGE;

		// Code (explicit)
		case "ts":
		case "js":
		case "mjs":
		case "cjs":
		case "py":
		case "rb":
		case "go":
		case "rs":
		case "java":
		case "kt":
		case "swift":
		case "c":
		case "cpp":
		case "h":
		case "cs":
		case "php":
			return FILE_TYPE_ICONS.CODE;

		default:
			return FILE_TYPE_ICONS.DEFAULT;
	}
}

// =============================================================================
// NUMBER FORMATTING
// =============================================================================

/**
 * Format large numbers in compact form (1.2k, 15.6k, 1.2M).
 *
 * - Numbers < 1000: unchanged
 * - 1000-999999: X.Xk format
 * - 1000000+: X.XM format
 *
 * @param num - Number to format
 * @returns Compact formatted string
 */
export function formatCompactNumber(num: number): string {
	if (num < 1000) {
		return num.toString();
	}
	if (num < 1000000) {
		return `${(num / 1000).toFixed(1)}k`;
	}
	return `${(num / 1000000).toFixed(1)}M`;
}

// =============================================================================
// BYTE FORMATTING
// =============================================================================

/**
 * Format bytes into human-readable size string.
 *
 * @param bytes - Number of bytes
 * @returns Formatted size string (e.g., "1.5 KB", "10.0 MB")
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// =============================================================================
// DATE GROUPING
// =============================================================================

/**
 * Date group labels for organizing snapshots.
 */
export type DateGroup = "Today" | "Yesterday" | "This Week" | "Older";

/**
 * Get date group for a timestamp.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Date group label
 */
export function getDateGroup(timestamp: number): DateGroup {
	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const yesterdayStart = todayStart - 86400000;
	const weekStart = todayStart - 7 * 86400000;

	if (timestamp >= todayStart) {
		return "Today";
	}
	if (timestamp >= yesterdayStart) {
		return "Yesterday";
	}
	if (timestamp >= weekStart) {
		return "This Week";
	}
	return "Older";
}

/**
 * Group snapshots by date.
 *
 * @param snapshots - Array of snapshot manifests
 * @returns Object with date groups as keys and snapshot arrays as values
 */
export function groupByDate<T extends { timestamp: number }>(snapshots: T[]): Record<DateGroup, T[]> {
	const groups: Record<DateGroup, T[]> = {
		Today: [],
		Yesterday: [],
		"This Week": [],
		Older: [],
	};

	for (const snapshot of snapshots) {
		const group = getDateGroup(snapshot.timestamp);
		groups[group].push(snapshot);
	}

	// Sort each group by timestamp descending (newest first)
	for (const group of Object.values(groups)) {
		group.sort((a, b) => b.timestamp - a.timestamp);
	}

	return groups;
}
