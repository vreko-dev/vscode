/**
 * File ID utilities - Local implementation for thin client
 *
 * @deprecated This file is deprecated. Import from '@vreko/contracts' instead.
 * Will be removed after 2 releases. See ADR-004 for details.
 *
 * ID generation and parsing utilities for snapshots, sessions, etc.
 */

import { randomBytes } from "node:crypto";

export const ID_PREFIX = {
	snapshot: "vreko",
	session: "sess",
	checkpoint: "ckpt",
	audit: "aud",
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

/**
 * Generate a random ID with optional prefix
 */
export function randomId(prefix?: string): string {
	const hex = randomBytes(8).toString("hex");
	const ts = Date.now().toString(36);
	return prefix ? `${prefix}_${ts}_${hex}` : `${ts}_${hex}`;
}

export function generateSnapshotId(): string {
	return randomId(ID_PREFIX.snapshot);
}

export function generateSessionId(): string {
	return randomId(ID_PREFIX.session);
}

export function generateCheckpointId(): string {
	return randomId(ID_PREFIX.checkpoint);
}

export function generateAuditId(): string {
	return randomId(ID_PREFIX.audit);
}

/**
 * Check if a string is a valid ID with known prefix
 */
export function isValidId(id: string): boolean {
	if (!id || typeof id !== "string") {
		return false;
	}
	const prefixes = Object.values(ID_PREFIX);
	return prefixes.some((prefix) => id.startsWith(`${prefix}_`)) || /^[a-z0-9_]+$/.test(id);
}

/**
 * Parse timestamp from an ID (if it contains one)
 */
export function parseIdTimestamp(id: string): number | null {
	if (!id) {
		return null;
	}
	// IDs are formatted as prefix_base36timestamp_randomhex
	const parts = id.split("_");
	if (parts.length >= 2) {
		const tsStr = parts.length >= 3 ? parts[1] : parts[0];
		const ts = Number.parseInt(tsStr, 36);
		if (!Number.isNaN(ts) && ts > 1000000000000) {
			return ts;
		}
	}
	return null;
}

/**
 * @deprecated Use parseIdTimestamp instead
 */
export const parseTimestampFromId = parseIdTimestamp;
