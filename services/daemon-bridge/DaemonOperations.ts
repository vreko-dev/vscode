/**
 * Daemon Operations
 *
 * Type-safe wrappers for all daemon IPC methods.
 * Each method handles:
 * - Connection state checking
 * - Path normalization (absolute -> relative)
 * - Response type inference
 *
 * Extracted from DaemonBridge for better testability and separation of concerns.
 *
 * @module daemon-bridge/DaemonOperations
 */

import { isAbsolute, relative } from "node:path";
import { logger } from "../../utils/logger";
import type { IpcMethodName, IpcMethodParams, IpcMethodResult } from "../daemon-ipc-schema";

// =============================================================================
// TYPES
// =============================================================================

export interface DaemonStatus {
	connected: boolean;
	pid?: number;
	version?: string;
	uptime?: number;
	workspaces?: number;
	auth?: {
		authenticated: boolean;
		user?: string;
		tier?: string;
	};
}

export interface SessionStatusResult {
	active: boolean;
	taskId?: string;
	task?: string;
	startedAt?: string;
	filesModified: number;
	snapshotCount: number;
}

// =============================================================================
// METHOD NAME NORMALIZATION
// =============================================================================

import { normalizeMethod as normalizeMethodRegistry } from "@vreko/contracts";

export function normalizeMethod(method: string): string {
	return normalizeMethodRegistry(method);
}

// =============================================================================
// REQUEST INTERFACE
// =============================================================================

/**
 * Interface for the request function that DaemonOperations needs.
 * Implemented by DaemonBridge.request()
 */
export interface RequestFunction {
	<M extends IpcMethodName>(method: M, params: IpcMethodParams<M>): Promise<IpcMethodResult<M>>;
	<T>(method: string, params: Record<string, unknown>): Promise<T>;
}

/**
 * Interface for connection state checking.
 * Implemented by DaemonBridge.isConnected()
 */
export type ConnectionChecker = () => boolean;

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Convert absolute path to relative path within workspace
 */
export function toRelativePath(workspacePath: string, filePath: string): string {
	if (isAbsolute(filePath) && filePath.startsWith(workspacePath)) {
		return relative(workspacePath, filePath);
	}
	return filePath;
}

/**
 * Convert multiple paths to relative paths
 */
export function toRelativePaths(workspacePath: string, filePaths: string[]): string[] {
	return filePaths.map((fp) => toRelativePath(workspacePath, fp));
}

// =============================================================================
// DAEMON OPERATIONS CLASS
// =============================================================================

const LOG_PREFIX = "[DaemonOperations]";

/**
 * Provides type-safe wrappers for all daemon IPC operations.
 *
 * This class encapsulates all daemon method calls, handling:
 * - Connection checking (optional, for methods that need it)
 * - Path normalization
 * - Response type safety
 *
 * Usage:
 * ```typescript
 * const ops = new DaemonOperations(
 *   (method, params) => bridge.request(method, params),
 *   () => bridge.isConnected()
 * );
 * const result = await ops.createSnapshot(workspace, files);
 * ```
 */
export class DaemonOperations {
	constructor(
		private readonly request: RequestFunction,
		private readonly isConnected: ConnectionChecker,
	) {
		/* intentionally empty */
	}

	// =========================================================================
	// DAEMON LIFECYCLE OPERATIONS
	// =========================================================================

	async ping(): Promise<{ pong: true; uptime: number; version: string }> {
		return this.request("daemon.ping", {});
	}

	async getStatus(): Promise<DaemonStatus> {
		if (!this.isConnected()) {
			return { connected: false };
		}
		try {
			const result = await this.request<{
				pid: number;
				version: string;
				uptime: number;
				workspaces: number;
				auth?: {
					authenticated: boolean;
					user?: string;
					tier?: string;
				};
			}>("daemon.status", {});
			return {
				connected: true,
				pid: result.pid,
				version: result.version,
				uptime: result.uptime,
				workspaces: result.workspaces,
				auth: result.auth,
			};
		} catch {
			logger.debug("getDaemonStatus: daemon unreachable");
			return { connected: false };
		}
	}

	async getSessionStatus(workspacePath: string): Promise<SessionStatusResult | null> {
		if (!this.isConnected()) {
			return null;
		}
		try {
			return await this.request<SessionStatusResult>("session.status", { workspacePath });
		} catch {
			logger.debug("getSessionStatus: daemon unreachable");
			return null;
		}
	}

	// =========================================================================
	// FILE WATCHING OPERATIONS
	// =========================================================================

	async subscribeToFileWatching(workspacePath: string): Promise<boolean> {
		try {
			await this.request("watch.subscribe", { workspace: workspacePath });
			return true;
		} catch {
			logger.debug("subscribeToFileWatching: daemon unreachable");
			return false;
		}
	}

	async unsubscribeFromFileWatching(workspacePath: string): Promise<boolean> {
		if (!this.isConnected()) {
			return false;
		}
		try {
			await this.request("watch.unsubscribe", { workspace: workspacePath });
			return true;
		} catch {
			logger.debug("unsubscribeFromFileWatching: daemon unreachable");
			return false;
		}
	}

	async recordFileModification(
		workspacePath: string,
		filePath: string,
		linesChanged: number,
		aiAttributed: boolean,
		aiTool?: string,
	): Promise<boolean> {
		if (!this.isConnected()) {
			return false;
		}
		try {
			await this.request("intelligence/file-modified", {
				workspace: workspacePath,
				path: toRelativePath(workspacePath, filePath),
				linesChanged,
				aiAttributed,
				aiTool,
			});
			return true;
		} catch {
			logger.debug("recordFileModification: daemon unreachable");
			return false;
		}
	}

	// =========================================================================
	// SNAPSHOT OPERATIONS
	// =========================================================================

	async createSnapshot(
		workspacePath: string,
		files: string[],
		options?: { reason?: string; trigger?: "manual" | "mcp" | "ai_assist" | "session_end" },
	): Promise<{ snapshotId: string; createdAt: string }> {
		const relativePaths = toRelativePaths(workspacePath, files);
		return this.request("snapshot.create", {
			workspace: workspacePath,
			files: relativePaths,
			...options,
		});
	}

	async listSnapshots(
		workspacePath: string,
		options?: { limit?: number; since?: string },
	): Promise<Array<{ snapshotId: string; createdAt: number; files: string[] }>> {
		const result = await this.request("snapshot.list", { workspace: workspacePath, ...options });
		// Daemon returns { snapshots: [...], hasMore: boolean } with { id, createdAt, ... }
		if (result && typeof result === "object" && "snapshots" in result) {
			const snapshots = (result as { snapshots: Array<{ id: string; createdAt: number; files?: string[] }> })
				.snapshots;
			// Normalize daemon's 'id' field to expected 'snapshotId'
			return snapshots.map((s) => ({
				snapshotId: s.id,
				createdAt: s.createdAt,
				files: s.files ?? [],
			}));
		}
		// Fallback: if result is already an array, normalize it
		if (Array.isArray(result)) {
			return (result as Array<{ id: string; createdAt: number; files?: string[] }>).map((s) => ({
				snapshotId: s.id,
				createdAt: s.createdAt,
				files: s.files ?? [],
			}));
		}
		return [];
	}

	async deleteSnapshot(workspacePath: string, snapshotId: string): Promise<void> {
		return this.request("snapshot.delete", { workspace: workspacePath, snapshotId });
	}

	async restoreSnapshot(
		workspacePath: string,
		snapshotId: string,
		options?: { files?: string[]; dryRun?: boolean },
	): Promise<{ restored: string[]; skipped: string[] }> {
		const relativeFiles = options?.files ? toRelativePaths(workspacePath, options.files) : undefined;
		return this.request("snapshot.restore", {
			workspace: workspacePath,
			snapshotId,
			...(relativeFiles ? { files: relativeFiles, dryRun: options?.dryRun } : options),
		});
	}

	async bulkDeleteSnapshots(
		workspacePath: string,
		options: { olderThanDays?: number; keepProtected?: boolean },
	): Promise<{ success: boolean; deletedCount: number }> {
		return this.request("snapshot.bulkDelete", { workspace: workspacePath, ...options });
	}

	async protectSnapshot(
		workspacePath: string,
		snapshotId: string,
	): Promise<{ success: boolean; snapshotId: string }> {
		return this.request("snapshot.protect", { workspace: workspacePath, snapshotId });
	}

	async unprotectSnapshot(
		workspacePath: string,
		snapshotId: string,
	): Promise<{ success: boolean; snapshotId: string }> {
		return this.request("snapshot.unprotect", { workspace: workspacePath, snapshotId });
	}

	async renameSnapshot(
		workspacePath: string,
		snapshotId: string,
		newName: string,
	): Promise<{ success: boolean; snapshotId: string; newName: string }> {
		return this.request("snapshot.rename", { workspace: workspacePath, snapshotId, newName });
	}

	// =========================================================================
	// SESSION OPERATIONS
	// =========================================================================

	async beginSession(
		workspacePath: string,
		task: string,
		files?: string[],
		keywords?: string[],
	): Promise<{
		taskId: string;
		patterns: Array<{ name: string; description: string }>;
		constraints: Array<{ domain: string; name: string; value: string | number; description: string }>;
		learnings: Array<{ type: string; trigger: string; action: string; relevanceScore: number }>;
		risk: { level: string; factors: string[] };
		nextActions: string[];
	}> {
		const relativeFiles = files ? toRelativePaths(workspacePath, files) : undefined;
		return this.request("session/start", {
			workspacePath,
			task,
			files: relativeFiles,
			keywords,
		});
	}

	async endSession(
		workspacePath: string,
		outcome: "completed" | "abandoned" | "blocked",
		createSnapshot = true,
		notes?: string,
	): Promise<{
		finalized: boolean;
		sessionId: string;
		filesModified: number;
		snapshotId?: string;
	}> {
		return this.request("session.end", {
			workspacePath: workspacePath,
			outcome,
			createSnapshot,
			notes,
		});
	}

	async getSessionChanges(
		workspacePath: string,
		includeDiff = false,
	): Promise<{
		files: Array<{ path: string; action: "add" | "change" | "delete"; linesChanged?: number }>;
		diff?: string;
	}> {
		return this.request("session.changes", { workspacePath, includeDiff });
	}

	/**
	 * Get closing ceremony data for a session
	 * TIER 1.6: Returns ceremony metrics for session completion UI
	 */
	async getClosingCeremony(
		workspacePath: string,
		sessionId: string,
	): Promise<{
		sessionId: string;
		workspacePath: string;
		duration: number;
		learningsCaptured: number;
		fragileFilesInSession: Array<{ path: string; riskScore: number }>;
		tokensSaved: number;
		tokensSavedIsEstimate: boolean;
		coherenceScore: "high" | "medium" | "low" | "scattered";
		coherenceRationale: string;
		checkpointsCreated: number;
		healthDelta: number | null;
		concurrentSessions: Array<{
			clientType: string;
			overlapFiles: number;
			conflictResolved: boolean;
		}> | null;
		topLearnings: Array<{
			content: string;
			captureMethod: string;
			confidence: number;
		}>;
		ceremony?: unknown; // Full ceremony payload matching CeremonyWebViewProvider types
	} | null> {
		try {
			return await this.request("session.review", { workspacePath, sessionId });
		} catch (error) {
			logger.warn(`${LOG_PREFIX} Failed to get closing ceremony data`, { sessionId, error });
			return null;
		}
	}

	/**
	 * List sessions for the Closing Ceremony Theater WebView.
	 * Returns sessions with ceremony-specific fields (snapshot count, learning count, etc.)
	 */
	async listSessionCeremonies(
		workspacePath: string,
		options?: { limit?: number; cursor?: string },
	): Promise<{
		sessions: Array<{
			sessionId: string;
			workspace: string;
			startedAt: number;
			endedAt: number | null;
			snapshotCount: number;
			restoreCount: number;
			learningCount: number;
			isLive: boolean;
		}>;
		nextCursor: string | null;
	}> {
		const result = await this.request("session/list-ceremonies", { workspacePath, ...options });
		return result as {
			sessions: Array<{
				sessionId: string;
				workspace: string;
				startedAt: number;
				endedAt: number | null;
				snapshotCount: number;
				restoreCount: number;
				learningCount: number;
				isLive: boolean;
			}>;
			nextCursor: string | null;
		};
	}

	/**
	 * Report a detected AI tool to the daemon for the active session.
	 *
	 * Populates `aiToolsDetected` on the session record so the intelligence
	 * pipeline can use it in `ai.presence` processor scoring (spec 5.4).
	 *
	 * Fire-and-forget safe: callers may discard the returned promise.
	 *
	 * @param workspacePath - Absolute path to workspace root
	 * @param sessionId     - Active session ID
	 * @param tool          - Detected tool name ("cursor" | "copilot" | "claude" | "windsurf")
	 */
	async reportAiTool(
		workspacePath: string,
		sessionId: string,
		tool: string,
	): Promise<{ updated: boolean; error?: string }> {
		return this.request<{ updated: boolean; error?: string }>("session/report-ai-tool", {
			workspace: workspacePath,
			sessionId,
			tool,
		});
	}

	// =========================================================================
	// LEARNING OPERATIONS
	// =========================================================================

	async addLearning(
		workspacePath: string,
		learning: {
			trigger: string;
			action: string;
			type?: "pattern" | "pitfall" | "efficiency" | "discovery" | "workflow";
			source?: string;
		},
	): Promise<{ id: string; recorded: boolean }> {
		return this.request("learning.add", { workspace: workspacePath, ...learning });
	}

	async searchLearnings(
		workspacePath: string,
		keywords: string[],
		limit = 10,
	): Promise<Array<{ type: string; trigger: string; action: string; usageCount: number; relevanceScore: number }>> {
		return this.request("learning.search", { workspace: workspacePath, keywords, limit });
	}

	async listLearnings(
		workspacePath: string,
		limit = 50,
	): Promise<{
		learnings: Array<{
			type: string;
			trigger: string;
			action: string;
			source?: string;
			timestamp?: string;
		}>;
		total: number;
	}> {
		return this.request("learning.list", { workspace: workspacePath, limit });
	}

	// =========================================================================
	// CONTEXT & VALIDATION OPERATIONS
	// =========================================================================

	async getBaseline(workspacePath: string): Promise<{
		fragileFiles: Array<{
			path: string;
			compositeScore: number;
			churnScore: number;
			blastRadiusScore: number;
			rollbackScore: number;
			dependentCount: number;
			rank: number;
		}>;
		totalFiles: number;
		overallHealthScore: number;
	} | null> {
		return this.request("baseline/get", { workspace: workspacePath });
	}

	async getContext(
		workspacePath: string,
		task?: string,
		keywords?: string[],
	): Promise<{
		patterns: string;
		constraints: Array<{ domain: string; name: string; value: string | number; description: string }>;
		learnings: Array<{ type: string; trigger: string; action: string }>;
	}> {
		return this.request("context.get", { workspace: workspacePath, task, keywords });
	}

	async validateQuick(
		workspacePath: string,
		files?: string[],
	): Promise<{
		passed: boolean;
		errors: Array<{ file: string; line: number; message: string }>;
		warnings: Array<{ file: string; line: number; message: string }>;
	}> {
		const relativeFiles = files ? toRelativePaths(workspacePath, files) : undefined;
		return this.request("validate.quick", { workspace: workspacePath, files: relativeFiles });
	}

	// =========================================================================
	// PROTECTION OPERATIONS
	// =========================================================================

	async getProtectionLevel(
		workspacePath: string,
		filePath: string,
	): Promise<{ level: "watch" | "warn" | "block" | null; reason?: string; pattern?: string }> {
		return this.request("protection.getLevel", {
			workspace: workspacePath,
			filePath: toRelativePath(workspacePath, filePath),
		});
	}

	async setProtectionLevel(
		workspacePath: string,
		filePath: string,
		level: "watch" | "warn" | "block",
		reason?: string,
	): Promise<{ success: boolean; previousLevel?: "watch" | "warn" | "block" }> {
		return this.request("protection.setLevel", {
			workspace: workspacePath,
			filePath: toRelativePath(workspacePath, filePath),
			level,
			reason,
		});
	}

	async listProtectedFiles(
		workspacePath: string,
		options?: { level?: "watch" | "warn" | "block"; limit?: number },
	): Promise<{
		files: Array<{
			path: string;
			level: "watch" | "warn" | "block";
			pattern?: string;
			reason?: string;
			protectedAt?: string;
		}>;
		total: number;
	}> {
		return this.request("protection.list", { workspace: workspacePath, ...options });
	}

	// =========================================================================
	// VALIDATION OPERATIONS (Extended)
	// =========================================================================

	async validateComprehensive(
		workspacePath: string,
		code: string,
		filePath: string,
	): Promise<{
		passed: boolean;
		patternViolations: Array<{ pattern: string; file: string; line?: number; message: string }>;
		typescriptErrors: Array<{ file: string; line: number; message: string }>;
		lintErrors: Array<{ file: string; line: number; message: string; rule?: string }>;
	}> {
		return this.request("validate.comprehensive", {
			workspace: workspacePath,
			code,
			filePath: toRelativePath(workspacePath, filePath),
		});
	}

	async checkPatterns(
		workspacePath: string,
		code: string,
		filePath: string,
	): Promise<{
		passed: boolean;
		violations: Array<{ pattern: string; line?: number; message: string }>;
		suggestions: string[];
	}> {
		return this.request("context.check_patterns", {
			workspace: workspacePath,
			code,
			filePath: toRelativePath(workspacePath, filePath),
		});
	}

	// =========================================================================
	// VIOLATION OPERATIONS
	// =========================================================================

	async reportViolation(
		workspacePath: string,
		violation: {
			type: string;
			file: string;
			whatHappened: string;
			whyItHappened: string;
			prevention: string;
		},
	): Promise<{
		violationId: string;
		count: number;
		promoted: boolean;
		promotedTo?: "pattern" | "automation";
	}> {
		return this.request("violation.report", { workspace: workspacePath, ...violation });
	}

	async listViolations(workspacePath: string): Promise<{
		violations: Array<{
			id: string;
			type: string;
			file: string;
			whatHappened: string;
			whyItHappened: string;
			prevention: string;
			occurrences: number;
			createdAt: string;
		}>;
		total: number;
	}> {
		return this.request("violation.list", { workspace: workspacePath });
	}

	// =========================================================================
	// HEALTH OPERATIONS (SB-HEALTH-001)
	// =========================================================================

	/**
	 * Get workspace health via guard runner results
	 *
	 * Returns guard execution results from the daemon's GuardRunner service.
	 * Results are cached (stale-while-revalidate pattern) and automatically
	 * refresh in the background.
	 *
	 * @param workspacePath - Absolute path to workspace
	 * @param profile - Guard profile: "fast" (~3s) or "full" (~30s)
	 */
	async getWorkspaceHealth(
		workspacePath: string,
		profile: "fast" | "full" = "fast",
	): Promise<{
		guards: Array<{
			guard: string;
			status: "pass" | "warn" | "fail";
			files: Array<{ path: string; line?: number; message: string }>;
			durationMs: number;
		}>;
		timestamp: number;
		staleMs: number;
		profile: "fast" | "full";
		refreshing: boolean;
	}> {
		return this.request("health/workspace", { workspace: workspacePath, profile });
	}

	// =========================================================================
	// WORKSPACE ONBOARDING OPERATIONS (Track B)
	// =========================================================================

	/**
	 * Fingerprint workspace for initialization profile detection
	 *
	 * Performs a stat-based scan (no file reads) to determine workspace state.
	 * Performance budget: <500ms
	 *
	 * @param workspacePath - Absolute path to workspace
	 * @returns Fingerprint result with initialization profile
	 */
	async fingerprintWorkspace(workspacePath: string): Promise<{
		files: number;
		dirs: number;
		profile: "virgin" | "new" | "cold" | "warm" | "hot";
		hasVrekoDir: boolean;
		aiConfigs: Array<{ path: string; type: string; mtime: number }>;
		stale: boolean;
	}> {
		return this.request("workspace/fingerprint", { workspace: workspacePath });
	}

	/**
	 * Hydrate workspace with eager loading tasks
	 *
	 * Loads knowledge store, restores active session, parses AI configs.
	 * Called after fingerprint to bring workspace to ready state.
	 *
	 * @param workspacePath - Absolute path to workspace
	 * @param profile - Initialization profile from fingerprint
	 * @returns Hydration status
	 */
	async hydrateWorkspace(
		workspacePath: string,
		profile: "virgin" | "new" | "cold" | "warm" | "hot",
	): Promise<{
		loaded: boolean;
		sessionRestored: boolean;
		configsFresh: boolean;
		knowledgeEntries: number;
	}> {
		return this.request("workspace/hydrate", { workspace: workspacePath, profile });
	}

	/**
	 * Start deep workspace analysis (5-phase background task)
	 *
	 * Phases:
	 * 1. Structure build (import graph, blast radius)
	 * 2. Git history scan (co-change pairs, churn)
	 * 3. Baseline compute (fragile files, domain health)
	 * 4. Learning seed (framework-specific patterns)
	 * 5. Config freshness (AI config staleness check)
	 *
	 * @param workspacePath - Absolute path to workspace
	 * @returns Analysis job info
	 */
	async analyzeWorkspace(workspacePath: string): Promise<{
		started: boolean;
		jobId: string;
		estimatedDurationMs: number;
		phases: Array<{ name: string; weight: number }>;
	}> {
		return this.request("workspace/analyze", { workspace: workspacePath });
	}

	/**
	 * Get current onboarding status for workspace
	 *
	 * Used by status bar and activation gate to track progress.
	 *
	 * @param workspacePath - Absolute path to workspace
	 * @returns Current onboarding phase and progress
	 */
	async getOnboardingStatus(workspacePath: string): Promise<{
		phase: "idle" | "fingerprinting" | "hydrating" | "analyzing" | "ready" | "error";
		progress: number;
		currentStep?: string;
		message?: string;
		error?: string;
	}> {
		return this.request("workspace/status", { workspace: workspacePath });
	}

	/**
	 * Resolve workspace ID via daemon using 4-layer resolution strategy.
	 *
	 * Routes @vreko/intelligence/workspace logic through the daemon so the
	 * extension never imports intelligence directly (see apps/vscode/CLAUDE.md).
	 *
	 * @param workspacePath - Absolute path to workspace root
	 * @param fallbackUserId - Optional existing ID to use as fallback (e.g. from SecretStorage)
	 * @param autoPersist - Whether to write resolved ID back to .vreko (default true)
	 */
	async resolveWorkspaceId(
		workspacePath: string,
		fallbackUserId?: string,
		autoPersist = true,
	): Promise<{
		workspaceId: string;
		isTeamStable: boolean;
		source: "config" | "git" | "local" | "user" | "fallback" | "path";
	}> {
		return this.request("workspace/resolve-id", {
			workspace: workspacePath,
			...(fallbackUserId ? { fallbackUserId } : {}),
			autoPersist,
		});
	}

	/**
	 * Initialize .vreko directory structure for a workspace via daemon.
	 *
	 * Routes initializeVrekoDirectory through the daemon to avoid direct fs
	 * access and intelligence imports in the extension.
	 *
	 * @param workspacePath - Absolute path to workspace root
	 */
	async initializeWorkspaceDirectory(workspacePath: string): Promise<{ initialized: boolean }> {
		return this.request("workspace/init", { workspace: workspacePath });
	}
}
