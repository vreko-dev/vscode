import * as path from "node:path";
import { THRESHOLDS } from "@snapback/sdk";
import type { Disposable, Memento } from "vscode";
import * as vscode from "vscode";
import { EventEmitter, workspace } from "vscode";
import { logger } from "../utils/logger.js";
import type {
	ProtectedFileEntry,
	ProtectedFileProvider,
	ProtectionLevel,
} from "../views/types";
import { CooldownManager } from "./cooldownManager.js"; // 🆕 Import CooldownManager

const STORAGE_KEY = "snapback:protected-files";

// Add interface for temporary allowances
interface TemporaryAllowance {
	filePath: string;
	allowedAt: number;
	expiresAt: number; // Timestamp when allowance expires
	// 🆕 Add cooldown-related fields
	cooldownExpiresAt?: number;
	cooldownAction?:
		| "snapshot_created"
		| "save_allowed"
		| "save_blocked"
		| "user_override";
}

type StoredProtectedFile = {
	path: string;
	label: string;
	lastProtectedAt: number;
	lastSnapshotId?: string;
	// 🆕 Add protection level field
	protectionLevel?: ProtectionLevel;
};

export class ProtectedFileRegistry
	implements ProtectedFileProvider, Disposable
{
	get(uri: vscode.Uri): ProtectedFileEntry | undefined {
		const normalizedPath = this.normalize(uri.fsPath);
		return this.cachedFiles.find(
			(entry) => this.normalize(entry.path) === normalizedPath,
		);
	}
	private _onDidChangeProtectedFiles = new EventEmitter<void>();
	readonly onDidChangeProtectedFiles = this._onDidChangeProtectedFiles.event;

	// REQUIRED: Add event emitter for decoration updates
	private readonly _onProtectionChanged = new EventEmitter<vscode.Uri[]>();
	readonly onProtectionChanged = this._onProtectionChanged.event;

	private cachedFiles: ProtectedFileEntry[] = [];

	/**
	 * O(1) lookup index for protected file paths
	 * Maintains normalized paths for fast isProtected() checks
	 */
	private protectedPathsIndex = new Set<string>();

	/**
	 * Temporary allowances for files - allows one save operation to proceed
	 * without requiring a snapshot
	 */
	private temporaryAllowances = new Map<string, TemporaryAllowance>();

	// 🆕 Add CooldownManager instance
	private cooldownManager: CooldownManager | null = null;

	constructor(private readonly state: Memento) {
		// Load files synchronously on construction to avoid race conditions
		this.cachedFiles = this.loadFilesFromStorage();
	}

	// 🆕 Add method to initialize CooldownManager
	async initializeCooldownManager(dbPath: string): Promise<void> {
		this.cooldownManager = new CooldownManager(dbPath);
		await this.cooldownManager.initialize();
		logger.info("CooldownManager initialized in ProtectedFileRegistry");
	}

	// 🆕 Add method to get CooldownManager
	getCooldownManager(): CooldownManager | null {
		return this.cooldownManager;
	}

	// 🆕 Add method to record audit entries
	async recordAudit(
		filePath: string,
		protectionLevel: ProtectionLevel,
		action: string,
		details?: Record<string, unknown>,
		snapshotId?: string,
	): Promise<void> {
		if (this.cooldownManager) {
			try {
				await this.cooldownManager.recordAudit(
					filePath,
					protectionLevel,
					action as
						| "save_attempt"
						| "save_blocked"
						| "snapshot_created"
						| "user_override",
					details,
					snapshotId,
				);
			} catch (error) {
				logger.warn("Failed to record audit entry", { error });
			}
		}
	}

	// 🆕 Add method to check cooldown status
	async isInCooldown(
		filePath: string,
		protectionLevel: ProtectionLevel,
	): Promise<boolean> {
		if (this.cooldownManager) {
			try {
				return await this.cooldownManager.isInCooldown(
					filePath,
					protectionLevel,
				);
			} catch (error) {
				logger.warn("Failed to check cooldown status", { error });
				return false; // Fail open
			}
		}
		return false;
	}

	// 🆕 Add method to set cooldown
	async setCooldown(
		filePath: string,
		protectionLevel: ProtectionLevel,
		actionTaken:
			| "snapshot_created"
			| "save_allowed"
			| "save_blocked"
			| "user_override",
		snapshotId?: string,
	): Promise<void> {
		if (this.cooldownManager) {
			try {
				await this.cooldownManager.setCooldown(
					filePath,
					protectionLevel,
					actionTaken,
					snapshotId,
				);
			} catch (error) {
				logger.warn("Failed to set cooldown", { error });
			}
		}
	}

	/**
	 * Dispose of the EventEmitter to prevent memory leaks
	 */
	dispose(): void {
		this._onDidChangeProtectedFiles.dispose();
		// REQUIRED: Dispose new event emitter
		this._onProtectionChanged.dispose();

		// 🆕 Dispose CooldownManager
		if (this.cooldownManager) {
			this.cooldownManager.close().catch((error) => {
				logger.warn("Failed to close CooldownManager", { error });
			});
		}
	}

	private loadFilesFromStorage(): ProtectedFileEntry[] {
		const stored = this.state.get<StoredProtectedFile[]>(STORAGE_KEY, []);

		// Debug logging to identify potential issues with stored data
		logger.debug("Loading protected files from storage", {
			storedCount: stored.length,
			hasInvalidEntries: stored.some(
				(file) => !file || typeof file !== "object",
			),
		});

		// Clear and rebuild the O(1) lookup index
		this.protectedPathsIndex.clear();

		// CRITICAL FIX: Store the path in normalized form (relative path)
		// This ensures consistency with isProtected() which also uses normalized paths
		const result: ProtectedFileEntry[] = [];

		for (let index = 0; index < stored.length; index++) {
			const file = stored[index];

			// Add defensive check for invalid entries
			if (!file) {
				logger.warn(`Skipping invalid entry at index ${index} in stored files`);
				continue;
			}

			// Validate required properties
			if (!file.path || !file.label) {
				logger.warn(
					`Skipping entry with missing required properties at index ${index}`,
					{ file },
				);
				continue;
			}

			// Add to O(1) lookup index
			this.protectedPathsIndex.add(file.path);

			result.push({
				id: this.getAbsolutePath(file.path),
				label: file.label,
				path: file.path, // Store the normalized (relative) path
				lastProtectedAt: file.lastProtectedAt,
				lastSnapshotId: file.lastSnapshotId,
				// 🆕 Add protection level with default value if not present
				protectionLevel: file.protectionLevel || "Watched",
			});
		}

		return result;
	}

	private getAbsolutePath(relativePath: string): string {
		const folders = workspace.workspaceFolders;
		const workspacePath = folders?.[0]?.uri.fsPath;
		return workspacePath
			? path.resolve(workspacePath, relativePath)
			: relativePath;
	}

	async list(): Promise<ProtectedFileEntry[]> {
		// Refresh cache from storage
		this.cachedFiles = this.loadFilesFromStorage();

		// Debug logging to identify potential issues with cached data
		logger.debug("Returning protected files list", {
			cachedCount: this.cachedFiles.length,
			hasInvalidEntries: this.cachedFiles.some(
				(file) => !file || typeof file !== "object",
			),
		});

		// Return entries with absolute paths for display
		const result = this.cachedFiles
			.map((file) => {
				// Add defensive check for invalid entries
				if (!file) {
					logger.warn("Skipping invalid entry in list() method mapping");
					return undefined;
				}

				return {
					...file,
					path: this.getAbsolutePath(file.path),
				};
			})
			.filter((file): file is ProtectedFileEntry => file !== undefined); // Filter out undefined entries

		logger.debug("Final result count", { resultCount: result.length });
		return result;
	}

	getFilesSync(): ProtectedFileEntry[] {
		// Debug logging to identify potential issues with cached data
		logger.debug("Returning protected files sync list", {
			cachedCount: this.cachedFiles.length,
			hasInvalidEntries: this.cachedFiles.some(
				(file) => !file || typeof file !== "object",
			),
		});

		// Return entries with absolute paths for display
		const result = this.cachedFiles
			.map((file) => {
				// Add defensive check for invalid entries
				if (!file) {
					logger.warn(
						"Skipping invalid entry in getFilesSync() method mapping",
					);
					return undefined;
				}

				return {
					...file,
					path: this.getAbsolutePath(file.path),
				};
			})
			.filter((file): file is ProtectedFileEntry => file !== undefined); // Filter out undefined entries

		logger.debug("Final sync result count", { resultCount: result.length });
		return result;
	}

	async total(): Promise<number> {
		const entries = await this.read(); // Fix: await the promise
		return entries.length;
	}

	/**
	 * Get protection level counts for TreeView display
	 * Required by SnapBackTreeProvider IConfigManager interface
	 */
	async getProtectionCounts(): Promise<{
		block: number;
		warn: number;
		watch: number;
	}> {
		const files = await this.list();

		// Count files by protection level
		const counts = {
			block: 0,
			warn: 0,
			watch: 0,
		};

		for (const file of files) {
			const level = file.protectionLevel;

			// Map protection levels to UI categories
			// 'Protected' → block (🔴 red)
			// 'Warning' → warn (🟡 yellow)
			// 'Watched' → watch (🟢 green)
			if (level === "Protected") {
				counts.block++;
			} else if (level === "Warning") {
				counts.warn++;
			} else if (level === "Watched") {
				counts.watch++;
			} else {
				// Default to watch if no level specified
				counts.watch++;
			}
		}

		logger.debug("Protection counts calculated", counts);
		return counts;
	}

	async add(
		filePath: string,
		options?: { snapshotId?: string; protectionLevel?: ProtectionLevel },
	): Promise<void> {
		const entries = await this.read();
		const normalized = this.normalize(filePath);
		const label = path.basename(normalized);

		// 🛡️ CRITICAL: Validate before writing to prevent storage corruption
		if (!normalized || normalized.trim().length === 0) {
			logger.error(
				`Cannot add file with empty path: ${filePath} (normalized: ${normalized})`,
			);
			throw new Error(`Invalid file path: ${filePath}`);
		}
		if (!label || label.trim().length === 0) {
			logger.error(
				`Cannot add file with empty label: ${filePath} (normalized: ${normalized}, label: ${label})`,
			);
			throw new Error(`Invalid file label for path: ${filePath}`);
		}

		const existingIndex = entries.findIndex((item) => item.path === normalized);

		const updated: StoredProtectedFile = {
			path: normalized,
			label,
			lastProtectedAt: Date.now(),
			lastSnapshotId: options?.snapshotId,
			// 🆕 Add protection level with default value
			protectionLevel: options?.protectionLevel || "Watched",
		};

		if (existingIndex >= 0) {
			entries.splice(existingIndex, 1, updated);
		} else {
			entries.unshift(updated);
		}

		await this.write(entries);
		// Refresh cache immediately after update
		this.cachedFiles = this.loadFilesFromStorage();
		this._onDidChangeProtectedFiles.fire();

		// REQUIRED: Fire decoration update event
		logger.info("[SnapBack] Adding protected file:", filePath);

		const uri = vscode.Uri.file(filePath);
		logger.info("[SnapBack] Firing onProtectionChanged for:", uri.fsPath);
		this._onProtectionChanged.fire([uri]);
	}

	async remove(filePath: string): Promise<void> {
		const entries = await this.read();
		const normalized = this.normalize(filePath);
		const next = entries.filter((entry) => entry.path !== normalized);
		if (next.length !== entries.length) {
			await this.write(next);
			// Refresh cache immediately after update
			this.cachedFiles = this.loadFilesFromStorage();
			this._onDidChangeProtectedFiles.fire();

			// REQUIRED: Fire decoration update event
			logger.info("[SnapBack] Removing protected file:", filePath);
			const uri = vscode.Uri.file(filePath);
			logger.info(
				"[SnapBack] Firing onProtectionChanged for removal:",
				uri.fsPath,
			);
			this._onProtectionChanged.fire([uri]);
		}
	}

	async markSnapshot(id: string, filePaths: string[]): Promise<void> {
		if (filePaths.length === 0) {
			return;
		}

		const entries = await this.read();
		const set = new Set(filePaths.map((file) => this.normalize(file)));
		const next = entries.map((entry) =>
			set.has(entry.path)
				? {
						...entry,
						lastSnapshotId: id,
						lastProtectedAt: Date.now(),
					}
				: entry,
		);
		await this.write(next);
		// Refresh cache immediately after update
		this.cachedFiles = this.loadFilesFromStorage();
		this._onDidChangeProtectedFiles.fire();
	}

	// 🆕 Add method to update protection level
	async updateProtectionLevel(
		path: string,
		level: ProtectionLevel,
	): Promise<void> {
		logger.info(
			`[SnapBack] updateProtectionLevel called - path: ${path}, level: ${level}`,
		);
		const entries = await this.read();
		const normalized = this.normalize(path);
		logger.info(`[SnapBack] Normalized path: ${normalized}`);
		const existingIndex = entries.findIndex((item) => item.path === normalized);

		if (existingIndex >= 0) {
			logger.info(
				`[SnapBack] Found entry at index ${existingIndex}, current level: ${entries[existingIndex].protectionLevel}`,
			);
			entries[existingIndex].protectionLevel = level;
			entries[existingIndex].lastProtectedAt = Date.now();
			logger.info(
				`[SnapBack] Updated entry protectionLevel to: ${entries[existingIndex].protectionLevel}`,
			);
			await this.write(entries);
			logger.info(`[SnapBack] Written to storage`);
			// Refresh cache immediately after update
			this.cachedFiles = this.loadFilesFromStorage();
			logger.info(
				`[SnapBack] Reloaded cache, cached file protection level: ${
					this.cachedFiles.find((f) => f.path === normalized)?.protectionLevel
				}`,
			);
			this._onDidChangeProtectedFiles.fire();

			// REQUIRED: Fire decoration update event
			const uri = vscode.Uri.file(path);
			this._onProtectionChanged.fire([uri]);
		} else {
			throw new Error(`File not protected: ${path}`);
		}
	}

	/**
	 * Clear all protected files
	 */
	clearAll(): void {
		// REQUIRED: Fire decoration update event for all URIs
		const allUris = this.cachedFiles.map((f) =>
			vscode.Uri.file(this.getAbsolutePath(f.path)),
		);
		this.cachedFiles = [];
		this.write([]);
		this._onDidChangeProtectedFiles.fire();

		// REQUIRED: Fire decoration update event
		if (allUris.length > 0) {
			logger.info(
				"[SnapBack] Clearing all protected files, firing onProtectionChanged for all URIs",
			);
			this._onProtectionChanged.fire(allUris);
		}
	}

	/**
	 * Get all protected file paths
	 */
	getAllProtectedFiles(): string[] {
		return this.cachedFiles.map((f) => this.getAbsolutePath(f.path));
	}

	/**
	 * Check if a file is protected - O(1) lookup using Set
	 */
	isProtected(filePath: string): boolean {
		const normalized = this.normalize(filePath);
		// O(1) lookup instead of O(n) Array.some()
		const isProtected = this.protectedPathsIndex.has(normalized);
		logger.info(
			"[SnapBack] isProtected check - filePath:",
			filePath,
			"normalized:",
			normalized,
			"result:",
			isProtected,
		);
		logger.info("[SnapBack] Current cached files:", undefined, {
			paths: this.cachedFiles.map((f) => f.path),
		});
		return isProtected;
	}

	// 🆕 Add helper method to get protection level for a file
	getProtectionLevel(filePath: string): ProtectionLevel | undefined {
		const normalized = this.normalize(filePath);
		const file = this.cachedFiles.find((f) => f.path === normalized);
		const level = file?.protectionLevel;

		// 🛡️ CRITICAL FIX: Verify state consistency to prevent UI mismatch
		if (file && level) {
			logger.debug("Protection level retrieved", {
				filePath,
				normalized,
				level,
				source: "cache",
			});
		}

		return level;
	}

	/**
	 * Verify protection state consistency between storage and cache
	 * Fixes Issue #2: Protection level mismatch
	 */
	async verifyProtectionState(filePath: string): Promise<void> {
		const stored = await this.read();
		const normalized = this.normalize(filePath);
		const storedEntry = stored.find((f) => f.path === normalized);
		const cachedEntry = this.cachedFiles.find((f) => f.path === normalized);

		if (storedEntry && cachedEntry) {
			if (storedEntry.protectionLevel !== cachedEntry.protectionLevel) {
				logger.error("🚨 Protection level mismatch detected!", undefined, {
					filePath,
					stored: storedEntry.protectionLevel,
					cached: cachedEntry.protectionLevel,
				});

				// Force refresh from storage to fix mismatch
				this.cachedFiles = this.loadFilesFromStorage();
				this._onDidChangeProtectedFiles.fire();

				// Fire decoration update
				const uri = vscode.Uri.file(filePath);
				this._onProtectionChanged.fire([uri]);
			}
		}
	}

	private async read(): Promise<StoredProtectedFile[]> {
		const existing = this.state.get<StoredProtectedFile[]>(STORAGE_KEY);
		if (!Array.isArray(existing)) {
			return [];
		}

		// 🛡️ CRITICAL: Validate and clean storage on read
		const validated = existing.filter((entry): entry is StoredProtectedFile => {
			if (!entry || typeof entry !== "object") {
				logger.warn(
					`⚠️ Removing invalid entry from storage (not an object): ${JSON.stringify(
						entry,
					)}`,
				);
				return false;
			}
			if (
				!entry.path ||
				typeof entry.path !== "string" ||
				entry.path.trim().length === 0
			) {
				logger.warn(
					`⚠️ Removing entry with invalid path: ${JSON.stringify(entry)}`,
				);
				return false;
			}
			if (
				!entry.label ||
				typeof entry.label !== "string" ||
				entry.label.trim().length === 0
			) {
				logger.warn(
					`⚠️ Removing entry with invalid label: ${JSON.stringify(entry)}`,
				);
				return false;
			}
			return true;
		});

		// If we cleaned corrupted data, write back the clean version
		if (validated.length !== existing.length) {
			const removed = existing.length - validated.length;
			logger.info(`🧹 Cleaned storage: removed ${removed} corrupted entries`);
			await this.write(validated);
		}

		return validated;
	}

	private async write(entries: StoredProtectedFile[]): Promise<void> {
		// 🛡️ CRITICAL: Final validation before writing to prevent corruption
		const validated = entries.filter((entry) => {
			if (!entry || typeof entry !== "object") {
				logger.error(
					`🚨 Attempted to write invalid entry (not an object): ${JSON.stringify(
						entry,
					)}`,
				);
				return false;
			}
			if (
				!entry.path ||
				typeof entry.path !== "string" ||
				entry.path.trim().length === 0
			) {
				logger.error(
					`🚨 Attempted to write entry with invalid path: ${JSON.stringify(
						entry,
					)}`,
				);
				return false;
			}
			if (
				!entry.label ||
				typeof entry.label !== "string" ||
				entry.label.trim().length === 0
			) {
				logger.error(
					`🚨 Attempted to write entry with invalid label: ${JSON.stringify(
						entry,
					)}`,
				);
				return false;
			}
			return true;
		});

		if (validated.length !== entries.length) {
			const rejected = entries.length - validated.length;
			logger.error(
				`🚨 Prevented writing ${rejected} invalid entries to storage`,
			);
		}

		await this.state.update(STORAGE_KEY, validated);
	}

	private normalize(filePath: string): string {
		const absolute = path.resolve(filePath);
		const folders = workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			return absolute;
		}
		const workspacePath = folders[0].uri.fsPath;
		return path.relative(workspacePath, absolute) || absolute;
	}

	/**
	 * Grant temporary allowance for a file to bypass protection for one save operation
	 * @param filePath The file path to grant allowance for
	 * @param durationMs Duration in milliseconds for which the allowance is valid (default: 5 minutes from SDK)
	 */
	grantTemporaryAllowance(
		filePath: string,
		durationMs: number = THRESHOLDS.protection.otherCooldown,
	): void {
		const normalized = this.normalize(filePath);
		const now = Date.now();

		const allowance: TemporaryAllowance = {
			filePath: normalized,
			allowedAt: now,
			expiresAt: now + durationMs,
		};

		this.temporaryAllowances.set(normalized, allowance);
		logger.info(
			`[SnapBack] Granted temporary allowance for ${normalized} (expires in ${durationMs}ms)`,
		);
	}

	/**
	 * Check if a file has a valid temporary allowance
	 * @param filePath The file path to check
	 * @returns true if the file has a valid temporary allowance, false otherwise
	 */
	hasTemporaryAllowance(filePath: string): boolean {
		const normalized = this.normalize(filePath);
		const allowance = this.temporaryAllowances.get(normalized);

		if (!allowance) {
			return false;
		}

		// Check if allowance is still valid
		const now = Date.now();
		if (now > allowance.expiresAt) {
			// Expired allowance, remove it
			this.temporaryAllowances.delete(normalized);
			logger.info(
				`[SnapBack] Removed expired temporary allowance for ${normalized}`,
			);
			return false;
		}

		return true;
	}

	/**
	 * Consume a temporary allowance for a file (use it up)
	 * @param filePath The file path to consume allowance for
	 * @returns true if an allowance was consumed, false if no valid allowance existed
	 */
	consumeTemporaryAllowance(filePath: string): boolean {
		const normalized = this.normalize(filePath);
		const allowance = this.temporaryAllowances.get(normalized);

		if (!allowance) {
			return false;
		}

		// Check if allowance is still valid
		const now = Date.now();
		if (now > allowance.expiresAt) {
			// Expired allowance, remove it
			this.temporaryAllowances.delete(normalized);
			logger.info(
				`[SnapBack] Removed expired temporary allowance for ${normalized}`,
			);
			return false;
		}

		// Valid allowance, consume it
		this.temporaryAllowances.delete(normalized);
		logger.info(`[SnapBack] Consumed temporary allowance for ${normalized}`);
		return true;
	}
}
