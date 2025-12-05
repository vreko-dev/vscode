// apps/vscode/src/storage/utils/fileId.ts

import * as crypto from "node:crypto";

/**
 * Generate a random alphanumeric string
 */
export function randomId(length: number = 6): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	const bytes = crypto.randomBytes(length);
	let result = "";
	for (let i = 0; i < length; i++) {
		result += chars[bytes[i] % chars.length];
	}
	return result;
}

/**
 * Generate snapshot ID: snap-{timestamp}-{random}
 * Safe for all filesystems (no colons, spaces, or special chars)
 */
export function generateSnapshotId(): string {
	return `snap-${Date.now()}-${randomId(6)}`;
}

/**
 * Generate session ID: sess-{timestamp}-{random}
 */
export function generateSessionId(): string {
	return `sess-${Date.now()}-${randomId(6)}`;
}

/**
 * Generate audit entry ID: audit-{timestamp}-{random}
 */
export function generateAuditId(): string {
	return `audit-${Date.now()}-${randomId(6)}`;
}

/**
 * Parse timestamp from ID (for sorting without reading file)
 */
export function parseTimestampFromId(id: string): number | null {
	const match = id.match(/^(?:snap|sess|audit)-(\d+)-/);
	return match ? parseInt(match[1], 10) : null;
}
