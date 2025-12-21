import * as path from "node:path";
import type { ProtectionLevel as SDKProtectionLevel } from "@snapback/contracts";
import { SnapBackEvent, type SnapBackEventBus } from "@snapback/contracts";
import { THRESHOLDS } from "@snapback/sdk";
import type { Disposable, Memento } from "vscode";
import * as vscode from "vscode";
import { EventEmitter, workspace } from "vscode";
import type { IStorageManager } from "../storage/types";
import { logger } from "../utils/logger";
import type { ProtectedFileEntry, ProtectedFileProvider, ProtectionLevel } from "../views/types";

/**
 * Interface for SDK ProtectionManager - defines the contract for protection decisions.
 * Per arch_remediation.md Task 1.2: SDK owns the "whether" decisions.
 */
export interface IProtectionManager {
	// DECISIONS (SDK owns)
	isProtected(filePath: string): boolean;
	getLevel(filePath: string): SDKProtectionLevel | null;
	// STATE MANAGEMENT (SDK owns)
	protect(filePath: string, level: SDKProtectionLevel, reason?: string): void;
	unprotect(filePath: string): void;
	listProtected(): Array<{ path: string; level: SDKProtectionLevel; reason?: string; addedAt: Date }>;
}

const STORAGE_KEY = "snapback:protected-files";

type StoredProtectedFile = {
	path: string;
	label: string;
	lastProtectedAt: number;
	lastSnapshotId?: string;
	// 🆕 Add protection level field
	protectionLevel?: ProtectionLevel;
};

export class ProtectedFileRegistry implements ProtectedFileProvider, Disposable {
	/**
	 * SDK ProtectionManager - Single Source of Truth for protection decisions.
	 * Per arch_remediation.md Task 1.2: All isProtected() and getProtectionLevel()
	 * decisions MUST delegate to SDK. VSCode only handles persistence (HOW).
	 */
	private sdkProtectionManager: IProtectionManager | null = null;

	get(uri: vscode.Uri): ProtectedFileEntry | undefined {
		const normalizedPath = this.normalize(uri.fsPath);
		return this.cachedFiles.find((entry) => this.normalize(entry.path) === normalizedPath);
	}
	private _onDidChangeProtectedFiles = new EventEmitter<void>();
	readonly onDidChangeProtectedFiles = this._onDidChangeProtectedFiles.event;

	// REQUIRED: Add event emitter for decoration updates
	private readonly _onProtectionChanged = new EventEmitter<vscode.Uri[]>();
	readonly onProtectionChanged = this._onProtectionChanged.event;

	/**
	 * Cached files from VSCode storage - used for persistence and UI.
	 * NOTE: This is NOT the source of truth for protection decisions.
	 * Use sdkProtectionManager.isProtected() for decisions.
	 */
	private cachedFiles: ProtectedFileEntry[] = [];

	/**
	 * StorageManager - Single source for cooldowns, snapshots, and audit
	 * Per arch_remediation.md Task 2.3: Consolidated cooldown management
	 */
	private storageManager: IStorageManager | null = null;
	private eventBus?: SnapBackEventBus;

	constructor(
		private readonly state: Memento,
		eventBus?: SnapBackEventBus,
	) {
		// Load files synchronously on construction to avoid race conditions
		this.cachedFiles = this.loadFilesFromStorage();
		this.eventBus = eventBus;
		logger.info("[SnapBack] ProtectedFileRegistry constructed", {
			cachedCount: this.cachedFiles.length,
		});
	}

	/**
	 * REFACTOR: Extract common event publishing pattern
	 * Defensive pattern: only publishes if eventBus is available
	 */
	private publishEvent<T>(event: SnapBackEvent, payload: T): void {
		if (this.eventBus) {
			this.eventBus.publish(event, payload);
		}
	}

	/**
	 * Initialize SDK ProtectionManager - REQUIRED for proper trust chain.
	 * Per arch_remediation.md Task 1.2: SDK is the Single Source of Truth.
	 *
	 * @param sdkManager - SDK ProtectionManager instance
	 */
	initializeSDKProtectionManager(sdkManager: IProtectionManager): void {
		this.sdkProtectionManager = sdkManager;

		// Sync existing files from VSCode storage to SDK
		for (const file of this.cachedFiles) {
			const level = this.mapToSDKLevel(file.protectionLevel);
			const absolutePath = this.getAbsolutePath(file.path);
			this.sdkProtectionManager.protect(absolutePath, level, "Synced from VSCode storage");
		}

		logger.info("[SnapBack] SDK ProtectionManager initialized with cached files", {
			filesCount: this.cachedFiles.length,
		});
	}

	/**
	 * Map VSCode ProtectionLevel to SDK ProtectionLevel
	 */
	private mapToSDKLevel(level: ProtectionLevel | undefined): SDKProtectionLevel {
		// SDK uses lowercase: 'watch' | 'warn' | 'block'
		// VSCode types may use same or mixed case
		if (!level) {
			return "watch";
		}
		return level.toLowerCase() as SDKProtectionLevel;
	}

	/**
	 * Map SDK ProtectionLevel to VSCode ProtectionLevel
	 */
	private mapFromSDKLevel(level: SDKProtectionLevel | null): ProtectionLevel | undefined {
		if (!level) {
			return undefined;
		}
		return level as ProtectionLevel;
	}

	/**
	 * Initialize StorageManager for cooldown and audit operations
	 * Per arch_remediation.md Task 2.3: Consolidated cooldown management
	 */
	initializeStorageManager(storageManager: IStorageManager): void {
		this.storageManager = storageManager;
		logger.info("StorageManager initialized in ProtectedFileRegistry");
	}

	/**
	 * @deprecated Use initializeStorageManager instead
	 * Kept for backward compatibility during migration
	 */
	async initializeCooldownManager(_dbPath: string): Promise<void> {
		logger.warn("initializeCooldownManager is deprecated - use initializeStorageManager instead");
		// No-op: CooldownManager removed per arch_remediation.md Task 2.3
	}

	/**
	 * Record audit entry via StorageManager
	 */
	async recordAudit(
		filePath: string,
		protectionLevel: ProtectionLevel,
		action: string,
		details?: Record<string, unknown>,
		snapshotId?: string,
	): Promise<void> {
		if (this.storageManager) {
			try {
				await this.storageManager.recordAudit({
					filePath,
					protectionLevel,
					action: action as
						| "snapshot_created"
						| "snapshot_restored"
						| "save_blocked"
						| "save_warned"
						| "cooldown_triggered"
						| "ai_detected",
					details,
					snapshotId,
				});
			} catch (error) {
				logger.warn("Failed to record audit entry", { error });
			}
		}
	}

	/**
	 * Check cooldown status via StorageManager.CooldownCache
	 * Per arch_remediation.md Task 2.3: CooldownCache is single source
	 */
	isInCooldown(filePath: string, protectionLevel: ProtectionLevel): boolean {
		if (this.storageManager) {
			try {
				return this.storageManager.isInCooldown(this.normalize(filePath), protectionLevel);
			} catch (error) {
				logger.warn("Failed to check cooldown status", { error });
				return false; // Fail open
			}
		}
		return false;
	}

	/**
	 * Set cooldown via StorageManager.CooldownCache
	 * Per arch_remediation.md Task 2.3: CooldownCache is single source
	 */
	setCooldown(
		filePath: string,
		protectionLevel: ProtectionLevel,
		actionTaken: "snapshot_created" | "save_allowed" | "save_blocked" | "user_override" | "temporary_allowance",
		snapshotId?: string,
	): void {
		if (this.storageManager) {
			try {
				const normalized = this.normalize(filePath);
				const now = Date.now();
				const duration =
					actionTaken === "temporary_allowance"
						? THRESHOLDS.protection.otherCooldown
						: protectionLevel === "block"
							? THRESHOLDS.protection.protectedCooldown
							: THRESHOLDS.protection.otherCooldown;

				this.storageManager.setCooldown({
					filePath: normalized,
					protectionLevel,
					triggeredAt: now,
					expiresAt: now + duration,
					actionTaken,
					snapshotId,
				});
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
		// Note: StorageManager is disposed separately by extension
	}

	private loadFilesFromStorage(): ProtectedFileEntry[] {
		const stored = this.state.get<StoredProtectedFile[]>(STORAGE_KEY, []);

		// Debug logging to identify potential issues with stored data
		logger.info("Loading protected files from storage", {
			storedCount: stored.length,
			hasInvalidEntries: stored.some((file) => !file || typeof file !== "object"),
		});

		// NOTE: protectedPathsIndex has been removed per arch_remediation.md Task 1.2
		// SDK ProtectionManager is now the source of truth for isProtected() decisions

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
				logger.warn(`Skipping entry with missing required properties at index ${index}`, { file });
				continue;
			}

			result.push({
				id: this.getAbsolutePath(file.path),
				label: file.label,
				path: file.path, // Store the normalized (relative) path
				lastProtectedAt: file.lastProtectedAt,
				lastSnapshotId: file.lastSnapshotId,
				// 🆕 Add protection level with default value if not present
				protectionLevel: file.protectionLevel || "watch",
			});
		}

		logger.info("[SnapBack] Protected files loaded from storage", {
			storedCount: stored.length,
			validCount: result.length,
		});

		return result;
	}

	private getAbsolutePath(relativePath: string): string {
		const folders = workspace.workspaceFolders;
		const workspacePath = folders?.[0]?.uri.fsPath;
		return workspacePath ? path.resolve(workspacePath, relativePath) : relativePath;
	}

	async list(): Promise<ProtectedFileEntry[]> {
		// Refresh cache from storage
		this.cachedFiles = this.loadFilesFromStorage();

		// Debug logging to identify potential issues with cached data
		logger.info("Returning protected files list", {
			cachedCount: this.cachedFiles.length,
			hasInvalidEntries: this.cachedFiles.some((file) => !file || typeof file !== "object"),
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
			hasInvalidEntries: this.cachedFiles.some((file) => !file || typeof file !== "object"),
		});

		// Return entries with absolute paths for display
		const result = this.cachedFiles
			.map((file) => {
				// Add defensive check for invalid entries
				if (!file) {
					logger.warn("Skipping invalid entry in getFilesSync() method mapping");
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
			// 'block' → block (🔴 red)
			// 'warn' → warn (🟡 yellow)
			// 'watch' → watch (🟢 green)
			if (level === "block") {
				counts.block++;
			} else if (level === "warn") {
				counts.warn++;
			} else if (level === "watch") {
				counts.watch++;
			} else {
				// Default to watch if no level specified
				counts.watch++;
			}
		}

		logger.debug("Protection counts calculated", counts);
		return counts;
	}

	async add(filePath: string, options?: { snapshotId?: string; protectionLevel?: ProtectionLevel }): Promise<void> {
		const entries = await this.read();
		const normalized = this.normalize(filePath);
		const label = path.basename(normalized);

		// 🛡️ CRITICAL: Validate before writing to prevent storage corruption
		if (!normalized || normalized.trim().length === 0) {
			logger.error(`Cannot add file with empty path: ${filePath} (normalized: ${normalized})`);
			throw new Error(`Invalid file path: ${filePath}`);
		}
		if (!label || label.trim().length === 0) {
			logger.error(`Cannot add file with empty label: ${filePath} (normalized: ${normalized}, label: ${label})`);
			throw new Error(`Invalid file label for path: ${filePath}`);
		}

		const level = options?.protectionLevel || "watch";
		const existingIndex = entries.findIndex((item) => item.path === normalized);

		const updated: StoredProtectedFile = {
			path: normalized,
			label,
			lastProtectedAt: Date.now(),
			lastSnapshotId: options?.snapshotId,
			protectionLevel: level,
		};

		if (existingIndex >= 0) {
			entries.splice(existingIndex, 1, updated);
		} else {
			entries.unshift(updated);
		}

		// Sync to SDK ProtectionManager (SSOT)
		if (this.sdkProtectionManager) {
			const absolutePath = this.getAbsolutePath(normalized);
			this.sdkProtectionManager.protect(absolutePath, this.mapToSDKLevel(level));
			logger.debug("[SnapBack] Synced protection to SDK", { absolutePath, level });
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

		// REFACTOR: Use extracted publishEvent helper
		this.publishEvent(SnapBackEvent.FILE_PROTECTED, {
			filePath: normalized,
			level: options?.protectionLevel || "watch",
			timestamp: Date.now(),
		});
	}

	async remove(filePath: string): Promise<void> {
		const entries = await this.read();
		const normalized = this.normalize(filePath);
		const next = entries.filter((entry) => entry.path !== normalized);
		if (next.length !== entries.length) {
			// Sync to SDK ProtectionManager (SSOT)
			if (this.sdkProtectionManager) {
				const absolutePath = this.getAbsolutePath(normalized);
				this.sdkProtectionManager.unprotect(absolutePath);
				logger.debug("[SnapBack] Synced unprotection to SDK", { absolutePath });
			}

			await this.write(next);
			// Refresh cache immediately after update
			this.cachedFiles = this.loadFilesFromStorage();
			this._onDidChangeProtectedFiles.fire();

			// REQUIRED: Fire decoration update event
			logger.info("[SnapBack] Removing protected file:", filePath);
			const uri = vscode.Uri.file(filePath);
			logger.info("[SnapBack] Firing onProtectionChanged for removal:", uri.fsPath);
			this._onProtectionChanged.fire([uri]);

			// REFACTOR: Use extracted publishEvent helper
			this.publishEvent(SnapBackEvent.FILE_UNPROTECTED, {
				filePath: normalized,
				timestamp: Date.now(),
			});
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
	async updateProtectionLevel(filePath: string, level: ProtectionLevel): Promise<void> {
		logger.info(`[SnapBack] updateProtectionLevel called - path: ${filePath}, level: ${level}`);
		const entries = await this.read();
		const normalized = this.normalize(filePath);
		logger.info(`[SnapBack] Normalized path: ${normalized}`);
		const existingIndex = entries.findIndex((item) => item.path === normalized);

		if (existingIndex >= 0) {
			logger.info(
				`[SnapBack] Found entry at index ${existingIndex}, current level: ${entries[existingIndex].protectionLevel}`,
			);
			entries[existingIndex].protectionLevel = level;
			entries[existingIndex].lastProtectedAt = Date.now();
			logger.info(`[SnapBack] Updated entry protectionLevel to: ${entries[existingIndex].protectionLevel}`);

			// Sync to SDK ProtectionManager (SSOT)
			if (this.sdkProtectionManager) {
				const absolutePath = this.getAbsolutePath(normalized);
				// Update level in SDK by re-protecting with new level
				this.sdkProtectionManager.protect(absolutePath, this.mapToSDKLevel(level));
				logger.debug("[SnapBack] Synced protection level update to SDK", { absolutePath, level });
			}

			await this.write(entries);
			logger.info("[SnapBack] Written to storage");
			// Refresh cache immediately after update
			this.cachedFiles = this.loadFilesFromStorage();
			logger.info(
				`[SnapBack] Reloaded cache, cached file protection level: ${
					this.cachedFiles.find((f) => f.path === normalized)?.protectionLevel
				}`,
			);
			this._onDidChangeProtectedFiles.fire();

			// REQUIRED: Fire decoration update event
			const uri = vscode.Uri.file(filePath);
			this._onProtectionChanged.fire([uri]);
		} else {
			throw new Error(`File not protected: ${filePath}`);
		}
	}

	/**
	 * Clear all protected files
	 */
	clearAll(): void {
		// REQUIRED: Fire decoration update event for all URIs
		const allUris = this.cachedFiles.map((f) => vscode.Uri.file(this.getAbsolutePath(f.path)));

		// Sync to SDK ProtectionManager (SSOT)
		if (this.sdkProtectionManager) {
			for (const file of this.cachedFiles) {
				const absolutePath = this.getAbsolutePath(file.path);
				this.sdkProtectionManager.unprotect(absolutePath);
			}
			logger.debug("[SnapBack] Synced clearAll to SDK", { count: this.cachedFiles.length });
		}

		this.cachedFiles = [];
		this.write([]);
		this._onDidChangeProtectedFiles.fire();

		// REQUIRED: Fire decoration update event
		if (allUris.length > 0) {
			logger.info("[SnapBack] Clearing all protected files, firing onProtectionChanged for all URIs");
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
	 * Check if a file is protected - DELEGATES TO SDK.
	 *
	 * Per arch_remediation.md Task 1.2: SDK owns the "whether" decision.
	 * This method MUST NOT contain any conditional logic based on local state.
	 * The SDK ProtectionManager is the Single Source of Truth.
	 */
	isProtected(filePath: string): boolean {
		// TRUST SDK DECISION COMPLETELY
		if (this.sdkProtectionManager) {
			const absolutePath = this.getAbsolutePathForCheck(filePath);
			const result = this.sdkProtectionManager.isProtected(absolutePath);
			logger.debug("[SnapBack] isProtected delegated to SDK", {
				filePath,
				absolutePath,
				result,
			});
			return result;
		}

		// Fallback: SDK not yet initialized - return safe default (not protected)
		// This avoids dual sources of truth per arch_remediation.md
		logger.warn("[SnapBack] isProtected called before SDK initialization - returning false (safe default)");
		return false;
	}

	/**
	 * Get absolute path for protection check.
	 * Handles both relative and absolute paths.
	 */
	private getAbsolutePathForCheck(filePath: string): string {
		if (path.isAbsolute(filePath)) {
			return filePath;
		}
		return this.getAbsolutePath(filePath);
	}

	/**
	 * Get protection level for a file - DELEGATES TO SDK.
	 *
	 * Per arch_remediation.md Task 1.2: SDK owns the "whether" decision.
	 * This method MUST NOT contain any conditional logic based on local state.
	 */
	getProtectionLevel(filePath: string): ProtectionLevel | undefined {
		// TRUST SDK DECISION COMPLETELY
		if (this.sdkProtectionManager) {
			const absolutePath = this.getAbsolutePathForCheck(filePath);
			const level = this.sdkProtectionManager.getLevel(absolutePath);
			logger.debug("[SnapBack] getProtectionLevel delegated to SDK", {
				filePath,
				level,
			});
			return this.mapFromSDKLevel(level);
		}

		// Fallback: SDK not yet initialized - return undefined (safe default)
		// This avoids dual sources of truth per arch_remediation.md
		logger.warn(
			"[SnapBack] getProtectionLevel called before SDK initialization - returning undefined (safe default)",
		);
		return undefined;
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
				logger.warn(`⚠️ Removing invalid entry from storage (not an object): ${JSON.stringify(entry)}`);
				return false;
			}
			if (!entry.path || typeof entry.path !== "string" || entry.path.trim().length === 0) {
				logger.warn(`⚠️ Removing entry with invalid path: ${JSON.stringify(entry)}`);
				return false;
			}
			if (!entry.label || typeof entry.label !== "string" || entry.label.trim().length === 0) {
				logger.warn(`⚠️ Removing entry with invalid label: ${JSON.stringify(entry)}`);
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
				logger.error(`🚨 Attempted to write invalid entry (not an object): ${JSON.stringify(entry)}`);
				return false;
			}
			if (!entry.path || typeof entry.path !== "string" || entry.path.trim().length === 0) {
				logger.error(`🚨 Attempted to write entry with invalid path: ${JSON.stringify(entry)}`);
				return false;
			}
			if (!entry.label || typeof entry.label !== "string" || entry.label.trim().length === 0) {
				logger.error(`🚨 Attempted to write entry with invalid label: ${JSON.stringify(entry)}`);
				return false;
			}
			return true;
		});

		if (validated.length !== entries.length) {
			const rejected = entries.length - validated.length;
			logger.error(`🚨 Prevented writing ${rejected} invalid entries to storage`);
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
	 * Grant temporary allowance for a file to bypass protection for one save operation.
	 * Per arch_remediation.md Task 2.3: Uses CooldownCache via StorageManager
	 * @param filePath The file path to grant allowance for
	 * @param durationMs Duration in milliseconds for which the allowance is valid (default: 5 minutes from SDK)
	 */
	grantTemporaryAllowance(filePath: string, durationMs: number = THRESHOLDS.protection.otherCooldown): void {
		const normalized = this.normalize(filePath);
		const now = Date.now();

		if (this.storageManager) {
			this.storageManager.setCooldown({
				filePath: normalized,
				protectionLevel: "temporary", // Special level for temporary allowances
				triggeredAt: now,
				expiresAt: now + durationMs,
				actionTaken: "temporary_allowance",
			});
		}
		logger.info(`[SnapBack] Granted temporary allowance for ${normalized} (expires in ${durationMs}ms)`);
	}

	/**
	 * Check if a file has a valid temporary allowance.
	 * Per arch_remediation.md Task 2.3: Uses CooldownCache via StorageManager
	 * @param filePath The file path to check
	 * @returns true if the file has a valid temporary allowance, false otherwise
	 */
	hasTemporaryAllowance(filePath: string): boolean {
		const normalized = this.normalize(filePath);

		if (!this.storageManager) {
			return false;
		}

		const entry = this.storageManager.getCooldownByPath(normalized);
		if (!entry || entry.actionTaken !== "temporary_allowance") {
			return false;
		}

		// CooldownCache already handles expiration, but double-check
		const now = Date.now();
		if (now > entry.expiresAt) {
			this.storageManager.removeCooldownByPath(normalized);
			logger.info(`[SnapBack] Removed expired temporary allowance for ${normalized}`);
			return false;
		}

		return true;
	}

	/**
	 * Consume a temporary allowance for a file (use it up).
	 * Per arch_remediation.md Task 2.3: Uses CooldownCache via StorageManager
	 * @param filePath The file path to consume allowance for
	 * @returns true if an allowance was consumed, false if no valid allowance existed
	 */
	consumeTemporaryAllowance(filePath: string): boolean {
		const normalized = this.normalize(filePath);

		if (!this.storageManager) {
			return false;
		}

		const entry = this.storageManager.getCooldownByPath(normalized);
		if (!entry || entry.actionTaken !== "temporary_allowance") {
			return false;
		}

		// Check if allowance is still valid
		const now = Date.now();
		if (now > entry.expiresAt) {
			this.storageManager.removeCooldownByPath(normalized);
			logger.info(`[SnapBack] Removed expired temporary allowance for ${normalized}`);
			return false;
		}

		// Valid allowance, consume it
		this.storageManager.removeCooldownByPath(normalized);
		logger.info(`[SnapBack] Consumed temporary allowance for ${normalized}`);
		return true;
	}
}
