/**
 * VSCode Path Normalizer - Local implementation for thin client
 *
 * Platform-agnostic path normalization utilities.
 *
 * @module PathNormalizer
 */

import * as path from "node:path";

/**
 * Normalize a file path to use forward slashes and resolve relative segments
 */
export function normalize(filePath: string): string {
	return path.normalize(filePath).replace(/\\/g, "/");
}

/**
 * Check if a path is within another path
 */
export function isWithin(parent: string, child: string): boolean {
	const normalizedParent = normalize(parent);
	const normalizedChild = normalize(child);
	return normalizedChild.startsWith(`${normalizedParent}/`) || normalizedChild === normalizedParent;
}

/**
 * Check if two paths are equal after normalization
 */
export function areEqual(pathA: string, pathB: string): boolean {
	return normalize(pathA) === normalize(pathB);
}

/**
 * Get the depth of a path (number of segments)
 */
export function getDepth(filePath: string): number {
	const normalized = normalize(filePath).replace(/^\//, "").replace(/\/$/, "");
	if (!normalized) {
		return 0;
	}
	return normalized.split("/").length;
}
