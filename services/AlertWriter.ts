/**
 * AlertWriter - Persists proactive alerts to JSONL format
 *
 * Writes alerts to `.vreko/alerts.jsonl` using append-only operations.
 * Uses promise-based queuing to prevent concurrent write conflicts.
 *
 * @module services/AlertWriter
 */

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * ProactiveAlert type (until properly exported from @vreko/mcp)
 */
export interface ProactiveAlert {
	id: string;
	timestamp: number;
	severity: "info" | "warning" | "error" | "critical";
	category: string;
	summary: string;
	details?: string;
	suggested_action?: string;
	learning_id?: string;
	confidence: number;
	dismissible: boolean;
}

/**
 * AlertWriter configuration
 */
export interface AlertWriterConfig {
	/** Workspace root directory */
	workspaceRoot: string;
}

/**
 * AlertWriter - Writes alerts to JSONL file with concurrency control
 */
export class AlertWriter {
	private workspaceRoot: string;
	private alertsPath: string;
	private writeQueues: Map<string, Promise<void>> = new Map();

	constructor(config: AlertWriterConfig) {
		this.workspaceRoot = config.workspaceRoot;
		this.alertsPath = join(this.workspaceRoot, ".vreko", "alerts.jsonl");
	}

	/**
	 * Write a single alert to the JSONL file
	 *
	 * Uses promise chaining to ensure sequential writes to the same file,
	 * preventing concurrent write conflicts and data corruption.
	 *
	 * @param alert - Alert to write
	 */
	async write(alert: ProactiveAlert): Promise<void> {
		const filePath = this.alertsPath;

		// Chain writes sequentially per file path
		const previousWrite = this.writeQueues.get(filePath) || Promise.resolve();

		const currentWrite = previousWrite
			.then(() => this.writeInternal(alert, filePath))
			.finally(() => {
				// Cleanup: Remove from queue if this is the last operation
				if (this.writeQueues.get(filePath) === currentWrite) {
					this.writeQueues.delete(filePath);
				}
			});

		this.writeQueues.set(filePath, currentWrite);
		await currentWrite;
	}

	/**
	 * Write multiple alerts sequentially
	 *
	 * @param alerts - Alerts to write
	 */
	async writeMany(alerts: ProactiveAlert[]): Promise<void> {
		for (const alert of alerts) {
			await this.write(alert);
		}
	}

	/**
	 * Internal write implementation
	 *
	 * Ensures .vreko directory exists, then appends alert as JSONL line.
	 *
	 * @param alert - Alert to write
	 * @param filePath - Target file path
	 */
	private async writeInternal(alert: ProactiveAlert, filePath: string): Promise<void> {
		try {
			// Ensure .vreko directory exists
			const dir = join(this.workspaceRoot, ".vreko");
			await mkdir(dir, { recursive: true });

			// Serialize alert as JSONL line
			const line = `${JSON.stringify(alert)}\n`;

			// Append to file (atomic at OS level for small writes)
			await appendFile(filePath, line, "utf-8");
		} catch (error) {
			// Re-throw with context
			throw new Error(`Failed to write alert: ${(error as Error).message}`);
		}
	}
}
