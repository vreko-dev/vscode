// ============================================
// apps/vscode/src/storage/headMap.ts
// PRW: Materialized view of HEAD for fast tombstone/decision lookups
// ============================================

import type { SnapshotFileRefV2 } from "./types";

// ============================================
// HeadMap Types (head-map.json)
// Materialized view of HEAD only
// ============================================

/** File reference in head map (blobHash + size) or null for tombstone */
export type HeadMapFileRef = { blobHash: string; size: number } | null;

export interface HeadMap {
	/** Schema version for head-map migrations */
	schemaVersion: 1;
	/** Current head sequence number */
	headSeq: number;
	/** File path → file ref or null (tombstone) */
	files: Record<string, HeadMapFileRef>;
}

export const DEFAULT_HEAD_MAP: HeadMap = {
	schemaVersion: 1,
	headSeq: 0,
	files: {},
};

// ============================================
// File Operations
// ============================================

/** Add or update a file entry in the head map */
export function setFile(headMap: HeadMap, path: string, ref: { blobHash: string; size: number }): void {
	headMap.files[path] = ref;
}

/** Mark a file as deleted (tombstone) */
export function markDeleted(headMap: HeadMap, path: string): void {
	headMap.files[path] = null;
}

/** Get file reference by path (undefined if not in map) */
export function getFile(headMap: HeadMap, path: string): HeadMapFileRef | undefined {
	if (!(path in headMap.files)) {
		return undefined;
	}
	return headMap.files[path];
}

/** Check if a file is marked as deleted (tombstone) */
export function isDeleted(headMap: HeadMap, path: string): boolean {
	return path in headMap.files && headMap.files[path] === null;
}

/** Check if a file exists and is not a tombstone */
export function hasFile(headMap: HeadMap, path: string): boolean {
	return path in headMap.files && headMap.files[path] !== null;
}

// ============================================
// Bulk Operations
// ============================================

/** Apply snapshot files to head map, updating headSeq */
export function applySnapshot(
	headMap: HeadMap,
	snapshotFiles: Record<string, SnapshotFileRefV2>,
	newSeq: number,
): void {
	headMap.headSeq = newSeq;
	for (const [path, ref] of Object.entries(snapshotFiles)) {
		headMap.files[path] = { blobHash: ref.blobHash, size: ref.size };
	}
}

/** Mark multiple files as deleted (tombstones) */
export function applyDeletions(headMap: HeadMap, deletedPaths: string[]): void {
	for (const path of deletedPaths) {
		headMap.files[path] = null;
	}
}

/** Get all active (non-tombstone) files */
export function getActiveFiles(headMap: HeadMap): Array<{ path: string; blobHash: string; size: number }> {
	const active: Array<{ path: string; blobHash: string; size: number }> = [];
	for (const [path, ref] of Object.entries(headMap.files)) {
		if (ref !== null) {
			active.push({ path, blobHash: ref.blobHash, size: ref.size });
		}
	}
	return active;
}

/** Get all tombstone (deleted) file paths */
export function getTombstones(headMap: HeadMap): string[] {
	const tombstones: string[] = [];
	for (const [path, ref] of Object.entries(headMap.files)) {
		if (ref === null) {
			tombstones.push(path);
		}
	}
	return tombstones;
}

// ============================================
// Validation
// ============================================

export function isValidHeadMap(obj: unknown): obj is HeadMap {
	if (!obj || typeof obj !== "object") {
		return false;
	}
	const map = obj as HeadMap;
	return (
		map.schemaVersion === 1 &&
		typeof map.headSeq === "number" &&
		typeof map.files === "object" &&
		map.files !== null
	);
}

// ============================================
// Clone/Reset Operations
// ============================================

/** Create a deep copy of the head map */
export function cloneHeadMap(headMap: HeadMap): HeadMap {
	return {
		schemaVersion: 1,
		headSeq: headMap.headSeq,
		files: { ...headMap.files },
	};
}

/** Create a fresh empty head map */
export function resetHeadMap(): HeadMap {
	return {
		schemaVersion: 1,
		headSeq: 0,
		files: {},
	};
}
