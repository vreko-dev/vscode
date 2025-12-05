/**
 * @fileoverview Utility functions for SnapBack Explorer Tree View
 *
 * @see Design: .qoder/quests/snapback-explorer-tree.md
 */

import type { SnapshotBranchStatus } from "./types.js";

/**
 * Format ISO 8601 timestamp to relative age string
 *
 * @param isoString - ISO 8601 timestamp
 * @returns Formatted age string (e.g., "5m ago", "2h ago")
 *
 * @example
 * formatAge("2025-11-19T10:00:00Z") // "15m ago"
 */
export function formatAge(isoString: string): string {
	const now = Date.now();
	const then = new Date(isoString).getTime();
	const deltaSeconds = Math.floor((now - then) / 1000);

	if (deltaSeconds < 60) {
		return `${deltaSeconds}s ago`;
	}

	const deltaMinutes = Math.floor(deltaSeconds / 60);
	if (deltaMinutes < 60) {
		return `${deltaMinutes}m ago`;
	}

	const deltaHours = Math.floor(deltaMinutes / 60);
	if (deltaHours < 24) {
		return `${deltaHours}h ago`;
	}

	const deltaDays = Math.floor(deltaHours / 24);
	return `${deltaDays}d ago`;
}

/**
 * Format seconds to relative age string
 *
 * @param seconds - Age in seconds
 * @returns Formatted age string (e.g., "5m ago", "2h ago")
 */
export function formatAgeFromSeconds(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s ago`;
	}

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}

	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}

	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

/**
 * Convert branch status enum to display label
 *
 * @param status - Branch status enum
 * @returns Human-readable status label
 */
export function branchStatusLabel(status: SnapshotBranchStatus): string {
	switch (status) {
		case "healthy":
			return "healthy";
		case "needs_snapshot":
			return "needs snapshot";
		case "stale":
			return "stale";
		default: {
			// Exhaustive checking - TypeScript ensures all cases handled
			const _exhaustive: never = status;
			return String(_exhaustive);
		}
	}
}

/**
 * Format bytes to human-readable size
 *
 * @param bytes - Size in bytes
 * @returns Formatted size string (e.g., "8.0 MB", "512 B")
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	const kb = bytes / 1024;
	if (kb < 1024) {
		return `${kb.toFixed(1)} KB`;
	}

	const mb = kb / 1024;
	if (mb < 1024) {
		return `${mb.toFixed(1)} MB`;
	}

	const gb = mb / 1024;
	return `${gb.toFixed(1)} GB`;
}
