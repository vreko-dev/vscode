/**
 * CliLockFile.ts
 *
 * Data structure and utilities for the CLI lock file.
 *
 * Spec Reference: unified_ux_spec.md §4.5
 *
 * Implementation:
 *   - Read/write CLI lock file with schema validation
 *   - Heartbeat staleness detection (>30s = stale)
 *   - Process liveness verification via kill(pid, 0)
 *   - Automatic stale lock cleanup
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import * as fs from "node:fs/promises";
import * as path from "path";

/** Helper to check if path exists */
async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/** Helper to remove file if exists */
async function removeIfExists(filePath: string): Promise<void> {
	try {
		await fs.rm(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
}

/** Lock file schema as defined in unified_ux_spec.md §4.5 */
export interface CliLockData {
	pid: number;
	version: string;
	startedAt: string; // ISO timestamp
	lastHeartbeat: string; // ISO timestamp
	mcpPort: number;
	mcpTransport: "sse" | "stdio";
	watchingProjects: string[]; // Absolute paths
	activeBackups: number;
	linkedExtensions: string[]; // Extension instance IDs
}

/** Result of lock file check */
export interface CliLockState {
	isRunning: boolean;
	wasStale?: boolean;
	mcpPort?: number;
	version?: string;
	data?: CliLockData;
}

/** Configuration for staleness detection */
interface LockConfig {
	staleThresholdMs: number;
	cleanupStale: boolean;
}

const DEFAULT_CONFIG: LockConfig = {
	staleThresholdMs: 30_000, // 30 seconds per spec
	cleanupStale: true,
};

export class CliLockFile {
	private readonly lockPath: string;
	private readonly config: LockConfig;

	constructor(snapbackHome: string, config: Partial<LockConfig> = {}) {
		this.lockPath = path.join(snapbackHome, "cli-lock.json");
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Read current lock file state.
	 *
	 * Returns null if:
	 * - File doesn't exist
	 * - File is corrupted (invalid JSON)
	 * - Schema validation fails
	 */
	async read(): Promise<CliLockData | null> {
		try {
			if (!(await pathExists(this.lockPath))) {
				return null;
			}

			const content = await fs.readFile(this.lockPath, "utf-8");
			const data = JSON.parse(content) as unknown;

			// Validate schema
			if (!this.isValidLockData(data)) {
				// Invalid schema - treat as corrupted
				if (this.config.cleanupStale) {
					await this.cleanup();
				}
				return null;
			}

			return data;
		} catch {
			// Read or parse error
			return null;
		}
	}

	/**
	 * Validate lock data schema.
	 */
	private isValidLockData(data: unknown): data is CliLockData {
		if (typeof data !== "object" || data === null) {
			return false;
		}

		const obj = data as Record<string, unknown>;

		return (
			typeof obj.pid === "number" &&
			typeof obj.version === "string" &&
			typeof obj.startedAt === "string" &&
			typeof obj.lastHeartbeat === "string" &&
			typeof obj.mcpPort === "number" &&
			(obj.mcpTransport === "sse" || obj.mcpTransport === "stdio") &&
			Array.isArray(obj.watchingProjects) &&
			Array.isArray(obj.linkedExtensions)
		);
	}

	/**
	 * Check complete CLI lock state including staleness.
	 *
	 * Edge Cases:
	 * - J9-E06: CLI heartbeat stale (crashed)
	 * - J9-E07: Graceful degradation mode
	 */
	async checkState(): Promise<CliLockState> {
		const data = await this.read();

		if (!data) {
			return { isRunning: false };
		}

		// Check staleness
		if (await this.isStale(data)) {
			// CLI crashed or was killed without cleanup
			if (this.config.cleanupStale) {
				await this.cleanup();
			}
			return { isRunning: false, wasStale: true };
		}

		return {
			isRunning: true,
			mcpPort: data.mcpPort,
			version: data.version,
			data,
		};
	}

	/**
	 * Update heartbeat timestamp.
	 * (Primarily used by CLI, but useful for extension to know logic)
	 */
	async updateHeartbeat(): Promise<void> {
		const data = await this.read();
		if (!data) {
			return; // No lock file to update
		}

		data.lastHeartbeat = new Date().toISOString();
		await fs.writeFile(this.lockPath, JSON.stringify(data, null, 2), {
			mode: 0o600,
		});
	}

	/**
	 * Register an extension instance as linked.
	 */
	async registerExtension(extensionId: string): Promise<void> {
		const data = await this.read();
		if (!data) {
			return;
		}

		if (!data.linkedExtensions.includes(extensionId)) {
			data.linkedExtensions.push(extensionId);
			await fs.writeFile(this.lockPath, JSON.stringify(data, null, 2), {
				mode: 0o600,
			});
		}
	}

	/**
	 * Unregister an extension instance.
	 */
	async unregisterExtension(extensionId: string): Promise<void> {
		const data = await this.read();
		if (!data) {
			return;
		}

		data.linkedExtensions = data.linkedExtensions.filter((id) => id !== extensionId);
		await fs.writeFile(this.lockPath, JSON.stringify(data, null, 2), {
			mode: 0o600,
		});
	}

	/**
	 * Check if lock is stale (no heartbeat > 30s or process dead).
	 *
	 * A lock is considered stale if:
	 * 1. Last heartbeat is older than threshold (default 30s)
	 * 2. The owning process (PID) is no longer running
	 */
	async isStale(data: CliLockData): Promise<boolean> {
		const heartbeatAge = Date.now() - new Date(data.lastHeartbeat).getTime();

		// Stale if heartbeat too old
		if (heartbeatAge > this.config.staleThresholdMs) {
			return true;
		}

		// Verify process is still alive
		if (!this.isProcessAlive(data.pid)) {
			return true;
		}

		return false;
	}

	/**
	 * Check if a process is still running.
	 *
	 * Uses kill(pid, 0) on Unix-like systems which checks existence
	 * without sending an actual signal.
	 */
	private isProcessAlive(pid: number): boolean {
		try {
			// Signal 0 = check process existence without killing
			process.kill(pid, 0);
			return true;
		} catch {
			// Process doesn't exist or we don't have permission
			return false;
		}
	}

	/**
	 * Remove stale lock file.
	 */
	async cleanup(): Promise<void> {
		await removeIfExists(this.lockPath);
	}

	/**
	 * Get the lock file path (for debugging/testing).
	 */
	getPath(): string {
		return this.lockPath;
	}
}
