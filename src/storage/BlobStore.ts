// apps/vscode/src/storage/BlobStore.ts

import * as vscode from "vscode";
import {
	atomicWriteFile,
	ensureDirectory,
	fileExists,
} from "./utils/atomicWrite";
import { getBlobPath, hashContent } from "./utils/hash";

/**
 * Content-addressable blob storage (git-style).
 *
 * Each unique file content is stored once, identified by its SHA-256 hash.
 * This provides automatic deduplication - if the same file content appears
 * in multiple snapshots, it's only stored once.
 *
 * Directory structure:
 *   blobs/
 *     ab/
 *       cd/
 *         abcd1234...  (full hash as filename)
 */
export class BlobStore {
	private readonly blobsUri: vscode.Uri;

	constructor(storageUri: vscode.Uri) {
		this.blobsUri = vscode.Uri.joinPath(storageUri, "blobs");
	}

	/**
	 * Initialize blob storage directory
	 */
	async initialize(): Promise<void> {
		await ensureDirectory(this.blobsUri);
	}

	/**
	 * Store content and return its hash (blob ID).
	 * If content already exists, returns hash without writing.
	 */
	async store(
		content: string,
	): Promise<{ hash: string; size: number; isNew: boolean }> {
		const hash = hashContent(content);
		const blobPath = getBlobPath(hash);
		const blobUri = vscode.Uri.joinPath(this.blobsUri, blobPath);

		// Check if blob already exists (deduplication)
		const exists = await fileExists(blobUri);

		if (!exists) {
			// Ensure parent directories exist (2-level structure)
			const parentUri = vscode.Uri.joinPath(blobUri, "..");
			const grandparentUri = vscode.Uri.joinPath(parentUri, "..");

			await ensureDirectory(grandparentUri);
			await ensureDirectory(parentUri);

			// Write blob content
			await atomicWriteFile(blobUri, content);
		}

		return {
			hash,
			size: Buffer.byteLength(content, "utf-8"),
			isNew: !exists,
		};
	}

	/**
	 * Retrieve content by hash
	 */
	async retrieve(hash: string): Promise<string | null> {
		const blobPath = getBlobPath(hash);
		const blobUri = vscode.Uri.joinPath(this.blobsUri, blobPath);

		try {
			const data = await vscode.workspace.fs.readFile(blobUri);
			return Buffer.from(data).toString("utf-8");
		} catch (error) {
			if ((error as vscode.FileSystemError).code === "FileNotFound") {
				return null;
			}
			throw error;
		}
	}

	/**
	 * Check if a blob exists
	 */
	async exists(hash: string): Promise<boolean> {
		const blobPath = getBlobPath(hash);
		const blobUri = vscode.Uri.joinPath(this.blobsUri, blobPath);
		return fileExists(blobUri);
	}

	/**
	 * Delete a blob (use with caution - may be referenced by snapshots)
	 */
	async delete(hash: string): Promise<boolean> {
		const blobPath = getBlobPath(hash);
		const blobUri = vscode.Uri.joinPath(this.blobsUri, blobPath);

		try {
			await vscode.workspace.fs.delete(blobUri);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get total size of all blobs (for stats)
	 */
	async getTotalSize(): Promise<number> {
		let totalSize = 0;

		try {
			// Iterate through 2-level directory structure
			const level1Entries = await vscode.workspace.fs.readDirectory(
				this.blobsUri,
			);

			for (const [l1Name, l1Type] of level1Entries) {
				if (l1Type !== vscode.FileType.Directory) continue;

				const l1Uri = vscode.Uri.joinPath(this.blobsUri, l1Name);
				const level2Entries = await vscode.workspace.fs.readDirectory(l1Uri);

				for (const [l2Name, l2Type] of level2Entries) {
					if (l2Type !== vscode.FileType.Directory) continue;

					const l2Uri = vscode.Uri.joinPath(l1Uri, l2Name);
					const blobEntries = await vscode.workspace.fs.readDirectory(l2Uri);

					for (const [blobName, blobType] of blobEntries) {
						if (blobType !== vscode.FileType.File) continue;

						const blobUri = vscode.Uri.joinPath(l2Uri, blobName);
						const stat = await vscode.workspace.fs.stat(blobUri);
						totalSize += stat.size;
					}
				}
			}
		} catch {
			// Directory may not exist yet
		}

		return totalSize;
	}

	/**
	 * Get count of blobs
	 */
	async count(): Promise<number> {
		let count = 0;

		try {
			const level1Entries = await vscode.workspace.fs.readDirectory(
				this.blobsUri,
			);

			for (const [l1Name, l1Type] of level1Entries) {
				if (l1Type !== vscode.FileType.Directory) continue;

				const l1Uri = vscode.Uri.joinPath(this.blobsUri, l1Name);
				const level2Entries = await vscode.workspace.fs.readDirectory(l1Uri);

				for (const [l2Name, l2Type] of level2Entries) {
					if (l2Type !== vscode.FileType.Directory) continue;

					const l2Uri = vscode.Uri.joinPath(l1Uri, l2Name);
					const blobEntries = await vscode.workspace.fs.readDirectory(l2Uri);

					count += blobEntries.filter(
						([, type]) => type === vscode.FileType.File,
					).length;
				}
			}
		} catch {
			// Directory may not exist yet
		}

		return count;
	}
}
