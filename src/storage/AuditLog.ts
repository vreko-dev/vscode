// apps/vscode/src/storage/AuditLog.ts

import * as vscode from "vscode";
import type { AuditEntry } from "./types";
import { atomicWriteFile, ensureDirectory } from "./utils/atomicWrite";
import { generateAuditId } from "./utils/fileId";

/**
 * Append-only audit log using JSONL format.
 *
 * Single file for simplicity (daily rotation is over-engineering for now).
 * Can be easily grep'd or streamed for analysis.
 */
export class AuditLog {
	private readonly auditUri: vscode.Uri;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(storageUri: vscode.Uri) {
		this.auditUri = vscode.Uri.joinPath(storageUri, "audit.jsonl");
	}

	/**
	 * Initialize (ensure parent directory exists)
	 */
	async initialize(): Promise<void> {
		const parentUri = vscode.Uri.joinPath(this.auditUri, "..");
		await ensureDirectory(parentUri);
	}

	/**
	 * Append an audit entry
	 */
	async append(
		entry: Omit<AuditEntry, "id" | "timestamp">,
	): Promise<AuditEntry> {
		const fullEntry: AuditEntry = {
			...entry,
			id: generateAuditId(),
			timestamp: Date.now(),
		};

		const line = `${JSON.stringify(fullEntry)}\n`;

		// Queue writes to prevent interleaving
		this.writeQueue = this.writeQueue.then(async () => {
			// Read existing content
			let existing = "";
			try {
				const data = await vscode.workspace.fs.readFile(this.auditUri);
				existing = Buffer.from(data).toString("utf-8");
			} catch {
				// File doesn't exist yet, that's fine
			}

			// Append and write
			await atomicWriteFile(this.auditUri, existing + line);
		});

		await this.writeQueue;
		return fullEntry;
	}

	/**
	 * Get audit entries for a file (most recent first)
	 */
	async getForFile(
		filePath: string,
		limit: number = 50,
	): Promise<AuditEntry[]> {
		const all = await this.getAll();
		return all.filter((e) => e.filePath === filePath).slice(0, limit);
	}

	/**
	 * Get all audit entries (most recent first)
	 */
	async getAll(limit: number = 500): Promise<AuditEntry[]> {
		try {
			const data = await vscode.workspace.fs.readFile(this.auditUri);
			const content = Buffer.from(data).toString("utf-8");

			const entries: AuditEntry[] = [];
			const lines = content.split("\n").filter((l) => l.trim());

			// Parse from end (most recent)
			for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
				try {
					entries.push(JSON.parse(lines[i]));
				} catch {
					// Skip malformed lines
				}
			}

			return entries;
		} catch {
			return [];
		}
	}

	/**
	 * Get entries by action type
	 */
	async getByAction(
		action: AuditEntry["action"],
		limit: number = 100,
	): Promise<AuditEntry[]> {
		const all = await this.getAll(500);
		return all.filter((e) => e.action === action).slice(0, limit);
	}

	/**
	 * Get entries in time range
	 */
	async getInRange(
		after: number,
		before: number,
		limit: number = 100,
	): Promise<AuditEntry[]> {
		const all = await this.getAll(1000);
		return all
			.filter((e) => e.timestamp >= after && e.timestamp <= before)
			.slice(0, limit);
	}

	/**
	 * Clear all entries (use with caution)
	 */
	async clear(): Promise<void> {
		try {
			await vscode.workspace.fs.delete(this.auditUri);
		} catch {
			// File may not exist
		}
	}

	/**
	 * Get total entry count
	 */
	async count(): Promise<number> {
		try {
			const data = await vscode.workspace.fs.readFile(this.auditUri);
			const content = Buffer.from(data).toString("utf-8");
			return content.split("\n").filter((l) => l.trim()).length;
		} catch {
			return 0;
		}
	}

	/**
	 * Get file size in bytes
	 */
	async getSize(): Promise<number> {
		try {
			const stat = await vscode.workspace.fs.stat(this.auditUri);
			return stat.size;
		} catch {
			return 0;
		}
	}

	/**
	 * Rotate log if it exceeds max size (future improvement)
	 */
	async rotateIfNeeded(
		maxSizeBytes: number = 10 * 1024 * 1024,
	): Promise<boolean> {
		const size = await this.getSize();
		if (size <= maxSizeBytes) return false;

		// Archive current log
		const archiveUri = vscode.Uri.joinPath(
			this.auditUri,
			"..",
			`audit-${Date.now()}.jsonl.archive`,
		);

		try {
			await vscode.workspace.fs.rename(this.auditUri, archiveUri);
			return true;
		} catch {
			return false;
		}
	}
}
