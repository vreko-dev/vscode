// apps/vscode/src/storage/utils/hash.ts

import * as crypto from "node:crypto";

/**
 * Generate SHA-256 hash of content
 * Used for content-addressable blob storage
 */
export function hashContent(content: string): string {
	return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Get blob path from hash: ab/cd/abcd1234...
 * Uses 2-level directory structure to avoid too many files in one dir
 */
export function getBlobPath(hash: string): string {
	return `${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}
