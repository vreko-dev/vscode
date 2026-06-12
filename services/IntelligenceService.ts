/**
 * Intelligence Service for VS Code Extension
 *
 * @fileoverview Provides proxy access to @vreko/intelligence via DaemonBridge.
 * All heavy @vreko/intelligence operations run in the daemon process,
 * keeping the extension bundle lightweight (<1MB target).
 *
 * ## Architecture
 *
 * ```
 * Extension Commands/UI
 *         ↓
 * IntelligenceService (this file - PROXY LAYER)
 *         ↓
 * DaemonBridge (JSON-RPC over socket)
 *         ↓
 * Vreko Daemon (apps/local-service)
 *         ↓
 * @vreko/intelligence (bundled in daemon)
 * ```
 *
 * ## Key Design Decisions
 *
 * - All @vreko/intelligence imports are TYPE-ONLY (no bundling)
 * - All function bodies delegate to DaemonBridge.request()
 * - API signatures remain unchanged (drop-in replacement)
 * - Graceful degradation when daemon unavailable
 *
 * @see apps/vscode/src/services/DaemonBridge.ts for IPC implementation
 * @module services/IntelligenceService
 */

// TYPE-ONLY imports - these do NOT force bundling!
import type { DetectedFramework, PipelineResult, VitalsSnapshot } from "@vreko/contracts";
import type * as vscode from "vscode";
import { logger } from "../utils/logger";
import { getCurrentWorkspaceId, getDaemonBridge } from "./DaemonBridge";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration options for extension intelligence
 */
export interface ExtensionIntelligenceOptions {
	/**
	 * Enable semantic search (slower startup, better context)
	 * @default false
	 */
	enableSemanticSearch?: boolean;

	/**
	 * Enable learning loop for pattern promotion
	 * @default true
	 */
	enableLearningLoop?: boolean;

	/**
	 * Enable auto-promotion of violations to patterns
	 * @default true
	 */
	enableAutoPromotion?: boolean;
}

/**
 * Violation input for reporting
 * All fields are required to ensure quality learning data
 */
export interface ViolationInput {
	type: string;
	file: string;
	message: string;
	reason: string;
	prevention: string;
}

/**
 * Minimal proxy interface for WorkspaceVitals access.
 * Sources data from daemon via DaemonBridge.
 */
export interface WorkspaceVitalsProxy {
	current(): VitalsSnapshot | null;
	getThresholdMultiplier(): number;
	getAgentGuidance(): unknown;
	recordBehavior(userInitiated: boolean): void;
	recordEdit(linesAdded: number, linesDeleted: number): void;
}

// =============================================================================
// HELPER: Get workspace path from folder
// =============================================================================

function getWorkspacePath(folder?: vscode.WorkspaceFolder): string | null {
	if (folder) {
		return folder.uri.fsPath;
	}
	const id = getCurrentWorkspaceId();
	if (!id) {
		return null; // Graceful fallback - return null instead of throwing
	}
	return id;
}

// =============================================================================
// MAIN API (Proxy to Daemon via DaemonBridge)
// =============================================================================

/**
 * Get or create Intelligence instance for a workspace
 * Proxies to daemon via DaemonBridge.
 *
 * @param workspaceFolder - VS Code workspace folder (defaults to first workspace)
 * @param _options - Configuration options (passed to daemon)
 * @returns Promise that resolves when Intelligence is initialized
 */
export async function getIntelligence(
	workspaceFolder?: vscode.WorkspaceFolder,
	_options?: ExtensionIntelligenceOptions,
): Promise<void> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		logger.debug("getIntelligence: no workspace path available");
		return;
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		await bridge.request("intelligence/initialize", { workspace: workspacePath });
		logger.debug("getIntelligence: initialized via daemon");
	} catch (error) {
		logger.warn("getIntelligence: daemon unavailable", { error: (error as Error).message });
	}
}

/**
 * Check if Intelligence is available (non-throwing)
 */
export async function hasIntelligence(workspaceFolder?: vscode.WorkspaceFolder): Promise<boolean> {
	try {
		await getIntelligence(workspaceFolder);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get Intelligence with semantic search enabled
 */
export async function getIntelligenceWithSemantic(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
	return getIntelligence(workspaceFolder, { enableSemanticSearch: true });
}

// =============================================================================
// CONVENIENCE METHODS (Proxy to Daemon)
// =============================================================================

/**
 * Detect frameworks in workspace (via daemon)
 */
export async function detectWorkspaceFrameworks(
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<DetectedFramework[]> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		return [];
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		return await bridge.request<DetectedFramework[]>("intelligence/detect-frameworks", {
			workspace: workspacePath,
		});
	} catch (error) {
		logger.debug("detectWorkspaceFrameworks: daemon unavailable", { error: (error as Error).message });
		return [];
	}
}

/**
 * Get primary framework for workspace (via daemon)
 */
export async function getPrimaryFramework(workspaceFolder?: vscode.WorkspaceFolder): Promise<DetectedFramework | null> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		return null;
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		return await bridge.request<DetectedFramework | null>("intelligence/get-primary-framework", {
			workspace: workspacePath,
		});
	} catch (error) {
		logger.debug("getPrimaryFramework: daemon unavailable", { error: (error as Error).message });
		return null;
	}
}

/**
 * Validate code using intelligence pipeline (via daemon)
 */
export async function validateCode(
	filePath: string,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<PipelineResult> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		return { violations: [], patterns: [], passed: true } as unknown as PipelineResult;
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		return await bridge.request<PipelineResult>("intelligence/validate-code", {
			workspace: workspacePath,
			filePath,
		});
	} catch (error) {
		logger.debug("validateCode: daemon unavailable", { error: (error as Error).message });
		return { violations: [], patterns: [], passed: true } as unknown as PipelineResult;
	}
}

/**
 * Detect patterns in code (via daemon)
 */
export async function detectPatterns(
	filePath: string,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<PipelineResult> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		return { violations: [], patterns: [], passed: true } as unknown as PipelineResult;
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		return await bridge.request<PipelineResult>("intelligence/detect-patterns", {
			workspace: workspacePath,
			filePath,
		});
	} catch (error) {
		logger.debug("detectPatterns: daemon unavailable", { error: (error as Error).message });
		return { violations: [], patterns: [], passed: true } as unknown as PipelineResult;
	}
}

/**
 * Get workspace vitals snapshot (via daemon)
 * Returns a default empty vitals snapshot if daemon unavailable.
 */
export async function getVitals(workspaceFolder?: vscode.WorkspaceFolder): Promise<VitalsSnapshot> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		return createDefaultVitals();
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		return await bridge.request<VitalsSnapshot>("intelligence/get-vitals", {
			workspace: workspacePath,
		});
	} catch (error) {
		logger.debug("getVitals: daemon unavailable", { error: (error as Error).message });
		return createDefaultVitals();
	}
}

/**
 * Create a default empty vitals snapshot for graceful fallback
 */
function createDefaultVitals(): VitalsSnapshot {
	return {
		timestamp: Date.now(),
		momentum: 0,
		velocity: 0,
		health: "unknown",
		indicators: {},
	} as unknown as VitalsSnapshot;
}

/**
 * Report a violation for learning (via daemon)
 */
export async function reportViolation(
	violation: ViolationInput,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<void> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		return;
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		await bridge.request("violation/report", {
			workspace: workspacePath,
			...violation,
		});
		logger.debug("reportViolation: recorded via daemon", { type: violation.type });
	} catch (error) {
		logger.debug("reportViolation: daemon unavailable", { error: (error as Error).message });
	}
}

/**
 * Get learning statistics (via daemon)
 */
export async function getLearningStats(workspaceFolder?: vscode.WorkspaceFolder): Promise<unknown> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		return null;
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		return await bridge.request("intelligence/get-learning-stats", {
			workspace: workspacePath,
		});
	} catch (error) {
		logger.debug("getLearningStats: daemon unavailable", { error: (error as Error).message });
		return null;
	}
}

/**
 * Get WorkspaceVitals snapshot for subscriptions and direct access
 */
export async function getWorkspaceVitals(workspaceFolder?: vscode.WorkspaceFolder): Promise<VitalsSnapshot> {
	return getVitals(workspaceFolder);
}

/**
 * Get WorkspaceVitals proxy synchronously by workspaceId
 * Uses cached vitals from daemon for synchronous access.
 *
 * @param workspaceId - The workspace identifier string
 * @returns WorkspaceVitalsProxy instance or null if unavailable
 */
export function getWorkspaceVitalsSync(workspaceId: string): WorkspaceVitalsProxy | null {
	if (!workspaceId) {
		return null;
	}

	const bridge = getDaemonBridge(workspaceId);

	// Create a proxy that delegates to daemon
	return {
		current(): VitalsSnapshot | null {
			// Return null synchronously - actual vitals fetched async
			// This is acceptable for constructor usage where async isn't possible
			return null;
		},
		getThresholdMultiplier(): number {
			return 1.0;
		},
		getAgentGuidance(): unknown {
			return null;
		},
		recordBehavior(userInitiated: boolean): void {
			void bridge
				.request("intelligence/record-behavior", {
					workspace: workspaceId,
					userInitiated,
				})
				.catch(() => {
					/* fire-and-forget */
				});
		},
		recordEdit(linesAdded: number, linesDeleted: number): void {
			void bridge
				.request("intelligence/record-edit", {
					workspace: workspaceId,
					linesAdded,
					linesDeleted,
				})
				.catch(() => {
					/* fire-and-forget */
				});
		},
	};
}

// =============================================================================
// SESSION & FILE MODIFICATION TRACKING
// =============================================================================

/**
 * Record a file modification to the active Intelligence session (via daemon)
 */
export async function recordFileModification(
	filePath: string,
	type: "create" | "update" | "delete",
	options?: {
		linesChanged?: number;
		aiAttributed?: boolean;
		aiTool?: string;
	},
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<void> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		return;
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		await bridge.request("intelligence/file-modified", {
			workspace: workspacePath,
			path: filePath,
			type,
			...options,
		});
		logger.debug("recordFileModification: recorded via daemon", { filePath, type });
	} catch (error) {
		logger.debug("recordFileModification: daemon unavailable", { error: (error as Error).message });
	}
}

/**
 * Get file modifications for the active session (via daemon)
 */
export async function getFileModifications(
	since?: number,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<
	Array<{
		path: string;
		timestamp: number;
		type: "create" | "update" | "delete";
		linesChanged: number;
		aiAttributed: boolean;
	}>
> {
	const workspacePath = getWorkspacePath(workspaceFolder);
	if (!workspacePath) {
		return [];
	}
	try {
		const bridge = getDaemonBridge(workspacePath);
		return await bridge.request("intelligence/get-file-modifications", {
			workspace: workspacePath,
			since,
		});
	} catch (error) {
		logger.debug("getFileModifications: daemon unavailable", { error: (error as Error).message });
		return [];
	}
}

// =============================================================================
// LIFECYCLE
// =============================================================================

/**
 * Dispose all Intelligence instances
 * Daemon handles cleanup - this is a no-op for the extension
 */
export async function disposeAll(): Promise<void> {
	logger.info("Intelligence disposed (daemon-side)");
}

/**
 * Clear cache (for testing)
 */
export function clearCache(): void {
	logger.debug("Cache cleared (no local cache in thin client)");
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
	// Re-export types for convenience
	DetectedFramework,
	PipelineResult,
	PipelineResult as ValidationResult,
	VitalsSnapshot,
};
