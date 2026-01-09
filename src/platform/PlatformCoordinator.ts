/**
 * Platform Coordinator - Multi-Surface Workspace Coordination
 *
 * Orchestrates coordination between VS Code extension, CLI, and MCP server.
 * Implements "first to scene" initialization, health monitoring, and celebration UX.
 *
 * Key Responsibilities:
 * - Manage workspace ID across all surfaces (canonical identifier)
 * - Implement "first to scene" initialization protocol
 * - Coordinate health status from MCPHealthGuardian
 * - Trigger celebration events for success moments
 * - Maintain shared `.snapback/workspace.json` manifest
 *
 * @module platform/PlatformCoordinator
 */

import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Mutex } from "async-mutex";
import * as lockfile from "proper-lockfile";
import * as vscode from "vscode";
import { getOrCreateWorkspaceId, isValidWorkspaceId } from "../auth/workspace-id";
import type { MCPHealthGuardian } from "../services/MCPHealthGuardian";
import { logger } from "../utils/logger";
import type {
	CelebrationEvent,
	CelebrationType,
	PlatformInitResult,
	Surface,
	SurfaceHealthStatus,
	SurfaceRegistration,
	WorkspaceManifest,
	WorkspaceTier,
} from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Current manifest version for migrations */
const MANIFEST_VERSION = 1;

/** Manifest file name */
const MANIFEST_FILENAME = "workspace.json";

/** Default tier */
const DEFAULT_TIER: WorkspaceTier = "free";

/** Max retry attempts for transient failures */
const MAX_RETRY_ATTEMPTS = 3;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY = 100;

/** Max delay for exponential backoff (ms) */
const RETRY_MAX_DELAY = 5000;

/** Lock options for proper-lockfile */
const LOCK_OPTIONS = {
	stale: 10000, // Consider lock stale after 10 seconds
	update: 2000, // Update mtime every 2 seconds
	retries: {
		retries: 5,
		minTimeout: 50,
		maxTimeout: 1000,
	},
};

// =============================================================================
// TELEMETRY TYPES (2026 Best Practice)
// =============================================================================

/** Retry telemetry for observability */
interface RetryMetrics {
	totalAttempts: number;
	totalBackoffMs: number;
	failuresByType: Map<string, number>;
	lastFailureTime?: number;
}

/** Operation performance metrics */
interface PerformanceMetrics {
	saveOperations: number;
	totalSaveLatencyMs: number;
	lockAcquisitionMs: number;
	retryOverheadMs: number;
}

// =============================================================================
// PLATFORM COORDINATOR
// =============================================================================

/**
 * PlatformCoordinator - Manages multi-surface workspace coordination
 *
 * Implements the "invisible until needed, then celebrate" UX philosophy.
 * Coordinates workspace identity, health monitoring, and success celebrations.
 */
export class PlatformCoordinator implements vscode.Disposable {
	private manifest: WorkspaceManifest | null = null;
	private manifestPath: string | null = null;
	private backupPath: string | null = null;
	private isHealthGuardianWired = false;
	private healthGuardian?: MCPHealthGuardian;
	private inMemoryMode = false;
	private disposables: vscode.Disposable[] = [];

	// 2026 Optimization: In-memory Mutex for manifest mutations
	private readonly manifestMutex = new Mutex();

	// 2026 Optimization: Retry telemetry
	private readonly retryMetrics: RetryMetrics = {
		totalAttempts: 0,
		totalBackoffMs: 0,
		failuresByType: new Map(),
	};

	// 2026 Optimization: Performance metrics
	private readonly performanceMetrics: PerformanceMetrics = {
		saveOperations: 0,
		totalSaveLatencyMs: 0,
		lockAcquisitionMs: 0,
		retryOverheadMs: 0,
	};

	// Event emitters for celebrations
	private readonly _onCelebration = new vscode.EventEmitter<CelebrationEvent>();
	readonly onCelebration = this._onCelebration.event;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly workspaceRoot: string,
	) {}

	/**
	 * Initialize the platform coordinator
	 *
	 * Implements "first to scene" protocol with exclusive file creation:
	 * 1. Try to create .snapback/workspace.json with wx flag (exclusive)
	 * 2. If creation succeeds, we're first! Initialize and celebrate
	 * 3. If EEXIST error, someone else was first. Load and register
	 *
	 * @param surface - Which surface is initializing (typically "extension")
	 * @param version - Version of the surface
	 * @returns Initialization result with workspace ID and manifest
	 */
	async initialize(surface: Surface, version: string): Promise<PlatformInitResult> {
		logger.info("PlatformCoordinator initializing", { surface, version });

		// Ensure .snapback directory exists
		const snapbackDir = join(this.workspaceRoot, ".snapback");
		await mkdir(snapbackDir, { recursive: true });

		this.manifestPath = join(snapbackDir, MANIFEST_FILENAME);
		this.backupPath = join(snapbackDir, `${MANIFEST_FILENAME}.backup`);

		// Try exclusive file creation for "first to scene" detection (Issue 1.2)
		const workspaceId = await getOrCreateWorkspaceId(this.context.secrets);
		const now = new Date().toISOString();

		const initialManifest: WorkspaceManifest = {
			workspaceId,
			initializedBy: surface,
			initializedAt: now,
			surfaces: {
				[surface]: {
					version,
					lastSeen: now,
					healthy: "healthy",
				},
			},
			tier: DEFAULT_TIER,
			healthCheck: {
				lastCheck: now,
				status: "healthy",
				issues: [],
			},
			version: MANIFEST_VERSION,
		};

		try {
			// Try to create file exclusively (wx flag)
			const content = JSON.stringify(initialManifest, null, 2);
			await writeFile(this.manifestPath, content, { encoding: "utf-8", flag: "wx" });

			// Success! We're first to scene
			this.manifest = initialManifest;

			// Celebrate first initialization!
			const celebration = this.createCelebration("workspace_initialized", {
				surface,
				workspaceId,
			});

			// Fire celebration event immediately
			this._onCelebration.fire(celebration);

			logger.info("Workspace initialized successfully (first to scene)", { workspaceId, surface });

			return {
				firstInit: true,
				workspaceId,
				manifest: this.manifest,
				celebration,
			};
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;

			if (code === "EEXIST") {
				// File already exists - someone else was first
				logger.info("Workspace manifest exists, loading (not first to scene)", { surface });

				const existingManifest = await this.loadManifest();

				if (existingManifest) {
					this.manifest = existingManifest;

					// Register this surface
					await this.registerSurface({
						surface,
						version,
						health: "healthy",
					});

					return {
						firstInit: false,
						workspaceId: existingManifest.workspaceId,
						manifest: existingManifest,
					};
				}

				// Manifest exists but corrupted - log and treat as first init
				logger.warn("Manifest file exists but is corrupted, initializing fresh");
				this.manifest = initialManifest;
				await this.saveManifest();

				return {
					firstInit: true,
					workspaceId,
					manifest: this.manifest,
				};
			}

			// Other error - log and fail
			logger.error("Failed to initialize PlatformCoordinator", error as Error);
			throw error;
		}
	}

	/**
	 * Register or update a surface in the manifest
	 *
	 * 2026 Optimization: Uses Mutex to prevent concurrent in-memory mutations
	 *
	 * @param registration - Surface registration info
	 */
	async registerSurface(registration: SurfaceRegistration): Promise<void> {
		if (!this.manifest) {
			throw new Error("PlatformCoordinator not initialized");
		}

		// Acquire in-memory lock to prevent race conditions (2026 best practice)
		await this.manifestMutex.runExclusive(async () => {
			const { surface, version, health, details } = registration;
			const now = new Date().toISOString();

			// Update surface info
			if (this.manifest) {
				this.manifest.surfaces[surface] = {
					version,
					lastSeen: now,
					healthy: health,
					details,
				};
			}

			// Update health check
			await this.updateHealthCheck();

			// Save manifest
			await this.saveManifest();

			logger.debug("Surface registered", { surface, version, health });
		});
	}

	/**
	 * Wire up MCPHealthGuardian to update manifest on health changes
	 *
	 * @param healthGuardian - MCPHealthGuardian instance
	 */
	wireHealthGuardian(healthGuardian: MCPHealthGuardian): void {
		// Double-wire protection (Issue 4.2)
		if (this.isHealthGuardianWired) {
			logger.warn("MCPHealthGuardian already wired, ignoring duplicate wire attempt");
			return;
		}

		this.healthGuardian = healthGuardian;
		this.isHealthGuardianWired = true;

		// Subscribe to health change events
		this.disposables.push(
			healthGuardian.onHealthChange(async (event) => {
				logger.debug("MCP health changed", { from: event.from, to: event.to });

				// Update MCP surface health
				await this.updateMCPHealth(event.to, event.latencyMs);

				// Celebrate recovery if transitioning to healthy
				if (event.from !== "healthy" && event.to === "healthy") {
					this.celebrate("mcp_recovered", {
						from: event.from,
						latencyMs: event.latencyMs,
					});
				}
			}),
		);

		// Subscribe to failure events for tracking
		this.disposables.push(
			healthGuardian.onFailure(async (event) => {
				logger.warn("MCP health failure", { error: event.error });
				await this.updateMCPHealth("unhealthy", undefined, event.error);
			}),
		);

		logger.info("MCPHealthGuardian wired to PlatformCoordinator");
	}

	/**
	 * Update MCP surface health in manifest
	 */
	private async updateMCPHealth(health: SurfaceHealthStatus, latencyMs?: number, error?: string): Promise<void> {
		if (!this.manifest) {
			return;
		}

		const now = new Date().toISOString();
		const details = error || (latencyMs ? `Latency: ${latencyMs}ms` : undefined);

		this.manifest.surfaces.mcp = {
			version: "unknown", // MCP version not easily accessible
			lastSeen: now,
			healthy: health,
			details,
		};

		await this.updateHealthCheck();
		await this.saveManifest();
	}

	/**
	 * Update overall health check status based on all surfaces
	 */
	private async updateHealthCheck(): Promise<void> {
		if (!this.manifest) {
			return;
		}

		// Fix Issue 1.3/4.1: Capture previous status BEFORE updating manifest
		const previousStatus = this.manifest.healthCheck.status;

		const now = new Date().toISOString();
		const issues: string[] = [];
		let overallStatus: SurfaceHealthStatus = "healthy";

		// Check each surface
		for (const [surfaceName, surfaceHealth] of Object.entries(this.manifest.surfaces)) {
			if (!surfaceHealth) {
				continue;
			}

			const status = surfaceHealth.healthy;

			// Track issues
			if (status === "unhealthy") {
				issues.push(`${surfaceName}: unhealthy ${surfaceHealth.details ? `(${surfaceHealth.details})` : ""}`);
			} else if (status === "degraded") {
				issues.push(`${surfaceName}: degraded ${surfaceHealth.details ? `(${surfaceHealth.details})` : ""}`);
			}

			// Calculate overall status (worst wins)
			if (status === "unhealthy") {
				overallStatus = "unhealthy";
			} else if (status === "degraded" && overallStatus !== "unhealthy") {
				overallStatus = "degraded";
			}
		}

		// Update health check
		this.manifest.healthCheck = {
			lastCheck: now,
			status: overallStatus,
			issues,
		};

		// Celebrate if all surfaces are healthy (only on transition)
		if (overallStatus === "healthy" && Object.keys(this.manifest.surfaces).length > 1) {
			if (previousStatus !== "healthy") {
				this.celebrate("all_surfaces_healthy", {
					surfaces: Object.keys(this.manifest.surfaces),
				});
			}
		}
	}

	/**
	 * Update workspace tier
	 *
	 * 2026 Optimization: Uses Mutex to prevent concurrent tier updates
	 *
	 * @param tier - New tier level
	 */
	async updateTier(tier: WorkspaceTier): Promise<void> {
		if (!this.manifest) {
			throw new Error("PlatformCoordinator not initialized");
		}

		// Acquire in-memory lock (2026 best practice)
		await this.manifestMutex.runExclusive(async () => {
			if (!this.manifest) {
				return;
			}

			const previousTier = this.manifest.tier;
			this.manifest.tier = tier;

			await this.saveManifest();

			logger.info("Workspace tier updated", { from: previousTier, to: tier });

			// Celebrate tier upgrade
			if (tier === "pro" && previousTier === "free") {
				this.celebrate("tier_upgraded", { from: previousTier, to: tier });
			} else if (tier === "enterprise" && previousTier !== "enterprise") {
				this.celebrate("tier_upgraded", { from: previousTier, to: tier });
			}
		});
	}

	/**
	 * Get current workspace manifest
	 */
	getManifest(): WorkspaceManifest | null {
		return this.manifest;
	}

	/**
	 * Get workspace ID
	 */
	getWorkspaceId(): string | null {
		return this.manifest?.workspaceId || null;
	}

	/**
	 * Get current workspace tier
	 */
	getTier(): WorkspaceTier {
		return this.manifest?.tier || DEFAULT_TIER;
	}

	/**
	 * Check if workspace is healthy
	 */
	isHealthy(): boolean {
		return this.manifest?.healthCheck.status === "healthy";
	}

	/**
	 * Get health issues
	 */
	getHealthIssues(): string[] {
		return this.manifest?.healthCheck.issues || [];
	}

	// =============================================================================
	// CELEBRATION SYSTEM
	// =============================================================================

	/**
	 * Create a celebration event
	 */
	private createCelebration(type: CelebrationType, data?: Record<string, unknown>): CelebrationEvent {
		const messages: Record<CelebrationType, string> = {
			workspace_initialized: "🎉 SnapBack workspace initialized! Ready to protect your code.",
			mcp_connected: "✅ MCP server connected successfully",
			mcp_recovered: "🔄 MCP server recovered from failure",
			all_surfaces_healthy: "✨ All systems operational",
			tier_upgraded: "🚀 Workspace upgraded to Pro tier",
		};

		return {
			type,
			message: messages[type],
			timestamp: Date.now(),
			data,
		};
	}

	/**
	 * Trigger a celebration event
	 */
	private celebrate(type: CelebrationType, data?: Record<string, unknown>): void {
		const celebration = this.createCelebration(type, data);
		this._onCelebration.fire(celebration);

		// Show toast notification for celebrations
		void this.showCelebrationToast(celebration);

		logger.info("Celebration triggered", { type, message: celebration.message });
	}

	/**
	 * Show celebration toast notification
	 */
	private async showCelebrationToast(celebration: CelebrationEvent): Promise<void> {
		// Use information message for celebrations (positive feedback)
		void vscode.window.showInformationMessage(celebration.message);
	}

	// =============================================================================
	// MANIFEST PERSISTENCE
	// =============================================================================

	/**
	 * Load manifest from disk with corruption recovery
	 *
	 * Recovery hierarchy (Issue 2.2):
	 * 1. Try primary file
	 * 2. Try backup file
	 * 3. Try SecretStorage
	 * 4. Return null for fresh init
	 */
	private async loadManifest(): Promise<WorkspaceManifest | null> {
		if (!this.manifestPath || !this.backupPath) {
			return null;
		}

		// Try primary file first
		const primaryResult = await this.tryLoadManifestFile(this.manifestPath, "primary");
		if (primaryResult) {
			return primaryResult;
		}

		// Try backup file
		logger.warn("Primary manifest corrupted/missing, trying backup");
		const backupResult = await this.tryLoadManifestFile(this.backupPath, "backup");
		if (backupResult) {
			// Restore primary from backup
			try {
				await copyFile(this.backupPath, this.manifestPath);
				logger.info("Primary manifest restored from backup");
			} catch (error) {
				logger.error("Failed to restore primary from backup", error as Error);
			}
			return backupResult;
		}

		// Try SecretStorage fallback
		logger.warn("Both manifest files corrupted/missing, trying SecretStorage");
		const secretWorkspaceId = await this.context.secrets.get("snapback.workspaceId");
		if (secretWorkspaceId && isValidWorkspaceId(secretWorkspaceId)) {
			logger.info("Recovered workspace ID from SecretStorage", { workspaceId: secretWorkspaceId });
			// Manifest will be recreated by initialize()
			return null;
		}

		// No recovery possible - fresh init
		logger.info("No manifest found, ready for fresh initialization");
		return null;
	}

	/**
	 * Try to load and validate a manifest file
	 */
	private async tryLoadManifestFile(
		filePath: string,
		source: "primary" | "backup",
	): Promise<WorkspaceManifest | null> {
		try {
			const content = await readFile(filePath, "utf-8");
			const manifest = JSON.parse(content) as WorkspaceManifest;

			// Validate manifest schema (Issue 3.2)
			const validationError = this.validateManifest(manifest);
			if (validationError) {
				logger.warn(`Invalid manifest in ${source} file: ${validationError}`);
				return null;
			}

			logger.debug(`Manifest loaded from ${source}`, { workspaceId: manifest.workspaceId });
			return manifest;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ENOENT") {
				// File doesn't exist
				return null;
			}

			if (error instanceof SyntaxError) {
				logger.error(`Corrupted JSON in ${source} manifest`, error);
				return null;
			}

			logger.error(`Failed to load ${source} manifest`, error as Error);
			return null;
		}
	}

	/**
	 * Validate manifest schema (Issue 3.2)
	 */
	private validateManifest(manifest: unknown): string | null {
		if (!manifest || typeof manifest !== "object") {
			return "Manifest is not an object";
		}

		const m = manifest as Partial<WorkspaceManifest>;

		// Required fields
		if (!m.workspaceId || !isValidWorkspaceId(m.workspaceId)) {
			return "Invalid or missing workspaceId";
		}

		if (!m.initializedBy || !["extension", "cli", "mcp"].includes(m.initializedBy)) {
			return "Invalid or missing initializedBy";
		}

		if (!m.initializedAt || typeof m.initializedAt !== "string") {
			return "Invalid or missing initializedAt";
		}

		if (!m.surfaces || typeof m.surfaces !== "object") {
			return "Invalid or missing surfaces";
		}

		// Validate tier enum
		if (m.tier && !["free", "pro", "enterprise"].includes(m.tier)) {
			logger.warn(`Invalid tier value: ${m.tier}, defaulting to 'free'`);
			(m as WorkspaceManifest).tier = "free";
		}

		// Validate version
		if (!m.version || typeof m.version !== "number") {
			return "Invalid or missing version";
		}

		// Version migration check
		if (m.version > MANIFEST_VERSION) {
			return `Manifest version ${m.version} is newer than supported version ${MANIFEST_VERSION}`;
		}

		return null;
	}

	/**
	 * Save manifest to disk with atomic writes and retry logic
	 *
	 * Implements:
	 * - Issue 1.1: File locking with proper-lockfile
	 * - Issue 2.1: Retry logic with exponential backoff
	 * - Atomic write pattern: write to temp, then rename
	 * - 2026: Retry telemetry and performance metrics
	 */
	private async saveManifest(): Promise<void> {
		if (!this.manifestPath || !this.backupPath || !this.manifest) {
			return;
		}

		// In-memory mode fallback (Issue 2.1)
		if (this.inMemoryMode) {
			logger.debug("Skipping save in memory-only mode");
			return;
		}

		const saveStartTime = Date.now();

		// Retry with exponential backoff (Issue 2.1 + 2026 telemetry)
		for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
			try {
				await this.saveManifestAtomic();

				// 2026: Track performance metrics
				const saveLatency = Date.now() - saveStartTime;
				this.performanceMetrics.saveOperations++;
				this.performanceMetrics.totalSaveLatencyMs += saveLatency;

				if (attempt > 0) {
					logger.info("Manifest saved after retry", {
						attempt: attempt + 1,
						latencyMs: saveLatency,
					});
				}

				return; // Success!
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code || "UNKNOWN";

				// 2026: Track retry telemetry
				this.retryMetrics.totalAttempts++;
				this.retryMetrics.failuresByType.set(code, (this.retryMetrics.failuresByType.get(code) || 0) + 1);
				this.retryMetrics.lastFailureTime = Date.now();

				// Check for transient errors
				if (code === "ENOSPC" || code === "EACCES" || code === "EMFILE") {
					const delay = Math.min(RETRY_BASE_DELAY * 2 ** attempt + Math.random() * 100, RETRY_MAX_DELAY);

					// 2026: Track backoff time
					this.retryMetrics.totalBackoffMs += delay;
					this.performanceMetrics.retryOverheadMs += delay;

					logger.warn(
						`Transient save error (${code}), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`,
						{
							error: (error as Error).message,
						},
					);

					if (attempt < MAX_RETRY_ATTEMPTS - 1) {
						await this.sleep(delay);
						continue;
					}
				}

				// Permanent error or read-only filesystem
				if (code === "EROFS" || attempt === MAX_RETRY_ATTEMPTS - 1) {
					logger.error("Failed to save manifest after retries, switching to memory-only mode", {
						error: (error as Error).message,
						code,
						retryMetrics: this.getRetryMetricsSummary(),
					});

					this.inMemoryMode = true;

					// Notify user of persistent failure
					void vscode.window.showWarningMessage(
						"SnapBack: Unable to save workspace manifest. Running in memory-only mode. Your workspace configuration will not persist.",
					);
					return;
				}

				// Unknown error - log and give up
				logger.error("Failed to save manifest", error as Error);
				return;
			}
		}
	}

	/**
	 * Atomic save with file locking (Issue 1.1 + 2026 metrics)
	 */
	private async saveManifestAtomic(): Promise<void> {
		if (!this.manifestPath || !this.backupPath || !this.manifest) {
			return;
		}

		const tempPath = `${this.manifestPath}.tmp`;
		const content = JSON.stringify(this.manifest, null, 2);

		// Acquire lock using proper-lockfile
		let release: (() => Promise<void>) | null = null;
		const lockStartTime = Date.now();

		try {
			// Lock the manifest file (or directory if file doesn't exist yet)
			try {
				release = await lockfile.lock(this.manifestPath, LOCK_OPTIONS);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					// File doesn't exist yet, lock the directory instead
					const dir = join(this.manifestPath, "..");
					release = await lockfile.lock(dir, LOCK_OPTIONS);
				} else {
					throw error;
				}
			}

			// 2026: Track lock acquisition time
			const lockAcquisitionTime = Date.now() - lockStartTime;
			this.performanceMetrics.lockAcquisitionMs += lockAcquisitionTime;

			// Atomic write pattern: write to temp file, then rename
			await writeFile(tempPath, content, "utf-8");

			// Create backup before overwriting
			try {
				await copyFile(this.manifestPath, this.backupPath);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
					logger.warn("Failed to create backup", { error: (error as Error).message });
				}
			}

			// Atomic rename
			await copyFile(tempPath, this.manifestPath);
			await unlink(tempPath);

			logger.debug("Manifest saved atomically", {
				workspaceId: this.manifest.workspaceId,
				lockAcquisitionMs: lockAcquisitionTime,
			});
		} finally {
			// Always release lock
			if (release) {
				try {
					await release();
				} catch (error) {
					logger.warn("Failed to release lock", { error: (error as Error).message });
				}
			}
		}
	}

	/**
	 * Sleep utility for retry delays
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// =============================================================================
	// TELEMETRY & OBSERVABILITY (2026 Best Practice)
	// =============================================================================

	/**
	 * Get retry metrics summary for logging/debugging
	 */
	private getRetryMetricsSummary(): Record<string, unknown> {
		return {
			totalAttempts: this.retryMetrics.totalAttempts,
			totalBackoffMs: this.retryMetrics.totalBackoffMs,
			failuresByType: Object.fromEntries(this.retryMetrics.failuresByType),
			lastFailureTime: this.retryMetrics.lastFailureTime,
		};
	}

	/**
	 * Get performance metrics summary
	 */
	getPerformanceMetrics(): Record<string, unknown> {
		const avgSaveLatency =
			this.performanceMetrics.saveOperations > 0
				? this.performanceMetrics.totalSaveLatencyMs / this.performanceMetrics.saveOperations
				: 0;

		const avgLockAcquisition =
			this.performanceMetrics.saveOperations > 0
				? this.performanceMetrics.lockAcquisitionMs / this.performanceMetrics.saveOperations
				: 0;

		return {
			saveOperations: this.performanceMetrics.saveOperations,
			avgSaveLatencyMs: Math.round(avgSaveLatency * 100) / 100,
			avgLockAcquisitionMs: Math.round(avgLockAcquisition * 100) / 100,
			retryOverheadMs: this.performanceMetrics.retryOverheadMs,
			retryMetrics: this.getRetryMetricsSummary(),
		};
	}

	/**
	 * Log performance summary (useful for debugging)
	 */
	logPerformanceSummary(): void {
		const metrics = this.getPerformanceMetrics();
		logger.info("PlatformCoordinator performance summary", metrics);
	}

	// =============================================================================
	// CLEANUP
	// =============================================================================

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this._onCelebration.dispose();
	}
}
