/**
 * Snapshot Semantic Labeling
 *
 * Transforms raw snapshot metadata into human-friendly labels for VS Code UI.
 * Provides intelligent naming derived from available context (trigger, branch, time, custom name).
 *
 * @module utils/snapshotLabeling
 */

/**
 * Formatted snapshot label for display
 */
export interface SnapshotLabel {
	/** Primary display label (friendly name with metadata) */
	primary: string;
	/** Secondary detail (ID and file count) */
	detail: string;
	/** Short label for compact displays */
	short: string;
}

/**
 * Type for snapshot objects that may have name field (RichSnapshot or compatible)
 */
type SnapshotLike = {
	id: string;
	timestamp: number;
	name?: string;
	files?: string[];
};

/**
 * Get relative time string (e.g., "5 minutes ago")
 *
 * @param timestamp - Timestamp in milliseconds
 * @returns Human-friendly time string
 */
function getRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) {
		return "just now";
	}
	if (diffMin < 60) {
		return diffMin === 1 ? "1 min ago" : `${diffMin} min ago`;
	}
	if (diffHour < 24) {
		return diffHour === 1 ? "1 hour ago" : `${diffHour} hours ago`;
	}
	if (diffDay < 7) {
		return diffDay === 1 ? "1 day ago" : `${diffDay} days ago`;
	}

	// Format as date for older snapshots
	const date = new Date(timestamp);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year:
			date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
	});
}

/**
 * Extract trigger type from snapshot name or metadata
 *
 * @param snapshot - Snapshot object
 * @returns Trigger label (e.g., "Manual", "Auto-save", "Risk detected")
 */
function extractTrigger(snapshot: SnapshotLike): string {
	const name = snapshot.name || "";

	// Check for common trigger patterns in the name
	if (name.includes("Auto-save") || name.includes("auto-save")) {
		return "Auto-save";
	}
	if (name.includes("Risk") || name.includes("risk")) {
		return "Risk detected";
	}
	if (name.includes("Manual")) {
		return "Manual";
	}
	if (name.includes("pre-commit")) {
		return "Pre-commit";
	}
	if (name.includes("Before")) {
		return "Before";
	}

	// Default based on content
	return "Snapshot";
}

/**
 * Truncate string to maximum length with ellipsis
 *
 * @param str - String to truncate
 * @param maxLen - Maximum length
 * @returns Truncated string
 */
function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) {
		return str;
	}
	return `${str.substring(0, maxLen - 1).trim()}…`;
}

/**
 * Generate semantic label for a snapshot
 *
 * Composes human-friendly labels from snapshot metadata, prioritizing:
 * 1. Custom snapshot name
 * 2. Auto-generated name with trigger/branch/description
 * 3. Fallback to timestamp-based label
 *
 * @param snapshot - Snapshot object (RichSnapshot with name, or compatible type)
 * @returns Formatted label object with primary, detail, and short variants
 *
 * @example
 * ```typescript
 * const snap = {
 *   id: "cp-123",
 *   name: "Auto-save before test refactor",
 *   timestamp: Date.now() - 5 * 60 * 1000,
 *   files: ["src/test.ts", "src/auth.ts"]
 * };
 *
 * const label = getSnapshotLabel(snap);
 * // label.primary = "Auto-save · before test refactor · 5 min ago"
 * // label.detail = "cp-123 · 2 files"
 * // label.short = "Auto-save · 5 min ago"
 * ```
 */
export function getSnapshotLabel(snapshot: SnapshotLike): SnapshotLabel {
	const fileCount = (snapshot.files || []).length;
	const trigger = extractTrigger(snapshot);
	const relativeTime = getRelativeTime(snapshot.timestamp);
	const shortId = snapshot.id.substring(0, 8);

	// Extract meaningful parts from name
	let description = "";
	const name = snapshot.name || "";

	// Remove trigger prefix if present to get description
	if (name) {
		description = name
			.replace(
				/^(Auto-save|Manual|Risk detected|Pre-commit|Before)[\s:·-]*/i,
				"",
			)
			.trim();
		// Remove timestamp suffix if present
		description = description.replace(/\s*[\d-]{10,}[\s:]*[\d:]*$/i, "").trim();
	}

	// Build primary label (40-60 chars target)
	const parts = [trigger];

	if (description) {
		// Limit description to ~30 chars to keep overall length manageable
		parts.push(truncate(description, 35));
	}

	parts.push(relativeTime);

	const primary = parts.join(" · ");

	// Build detail (secondary info)
	const detail = `${shortId} · ${fileCount} ${fileCount === 1 ? "file" : "files"}`;

	// Build short label (for compact displays)
	const short = `${trigger} · ${relativeTime}`;

	return {
		primary: truncate(primary, 80),
		detail,
		short,
	};
}

/**
 * Get display label for snapshot list item
 *
 * Convenience function combining primary label and detail into a single string
 * suitable for displaying in tree views or lists.
 *
 * @param snapshot - Snapshot object
 * @returns Formatted string for display
 *
 * @example
 * ```typescript
 * const label = getSnapshotDisplayLabel(snapshot);
 * // "Auto-save · before test refactor · 5 min ago · cp-123 · 2 files"
 * ```
 */
export function getSnapshotDisplayLabel(snapshot: SnapshotLike): string {
	const { primary, detail } = getSnapshotLabel(snapshot);
	return `${primary} (${detail})`;
}

/**
 * Get short label for snapshot list item
 *
 * Convenience function for compact displays that need less information.
 *
 * @param snapshot - Snapshot object
 * @returns Short formatted string
 */
export function getSnapshotShortLabel(snapshot: SnapshotLike): string {
	const { short, detail } = getSnapshotLabel(snapshot);
	return `${short} · ${detail}`;
}
