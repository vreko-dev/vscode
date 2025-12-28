/**
 * Intelligence Service for VS Code Extension
 *
 * @fileoverview Provides proxy access to @snapback/intelligence via Language Server.
 * All heavy @snapback/intelligence operations run in the language server process,
 * keeping the extension bundle lightweight (<1MB target).
 *
 * ## Architecture
 *
 * ```
 * Extension Commands/UI
 *         ↓
 * IntelligenceService (this file - PROXY LAYER)
 *         ↓
 * LanguageClient.ts (LSP client)
 *         ↓
 * Language Server Process (server/index.ts)
 *         ↓
 * @snapback/intelligence (bundled in server)
 * ```
 *
 * ## Key Design Decisions
 *
 * - All @snapback/intelligence imports are TYPE-ONLY (no bundling)
 * - All function bodies delegate to LanguageClient proxies
 * - getWorkspaceVitalsSync uses pre-cached vitals for constructor compat
 * - API signatures remain unchanged (drop-in replacement)
 *
 * @see apps/vscode/server/index.ts for server-side handlers
 * @see apps/vscode/src/services/LanguageClient.ts for proxy functions
 * @module services/IntelligenceService
 */

import * as fs from "node:fs";
import * as path from "node:path";

// TYPE-ONLY imports - these do NOT force bundling!
import type { DetectedFramework, PipelineResult } from "@snapback/intelligence";
import type { VitalsSnapshot } from "@snapback/intelligence/vitals";
import * as vscode from "vscode";
import { logger } from "../utils/logger";
// Import proxy functions from LanguageClient
import {
	detectFrameworksViaLSP,
	detectPatternsViaLSP,
	detectPrimaryFrameworkViaLSP,
	getFileModificationsViaLSP,
	getLearningStatsViaLSP,
	getVitalsViaLSP,
	getWorkspaceVitalsProxy,
	initializeIntelligence,
	isLanguageServerActive,
	recordFileModificationViaLSP,
	reportViolationViaLSP,
	validateCodeViaLSP,
	type WorkspaceVitalsProxy,
} from "./LanguageClient";

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

// =============================================================================
// MAIN API (Proxy to Language Server)
// =============================================================================

/**
 * Get or create Intelligence instance for a workspace
 * Now proxies to language server instead of direct instantiation.
 *
 * @param workspaceFolder - VS Code workspace folder (defaults to first workspace)
 * @param _options - Configuration options (passed to server)
 * @returns Promise that resolves when Intelligence is initialized
 *
 * @example
 * ```typescript
 * await getIntelligence();
 * // Intelligence is now ready on the server
 * ```
 */
export async function getIntelligence(
	workspaceFolder?: vscode.WorkspaceFolder,
	_options?: ExtensionIntelligenceOptions,
): Promise<void> {
	if (!isLanguageServerActive()) {
		throw new Error("Language server not active. Call activateLanguageServer first.");
	}

	const result = await initializeIntelligence(workspaceFolder);
	if (!result.success) {
		throw new Error(result.error ?? "Failed to initialize Intelligence");
	}

	logger.debug("Intelligence initialized via language server");
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
 * Note: Semantic search is configured on the server side.
 */
export async function getIntelligenceWithSemantic(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
	return getIntelligence(workspaceFolder, { enableSemanticSearch: true });
}

// =============================================================================
// CONVENIENCE METHODS (Proxy to Language Server)
// =============================================================================

/**
 * Detect frameworks in workspace (via language server)
 *
 * @example
 * ```typescript
 * const frameworks = await detectWorkspaceFrameworks();
 * // Returns: [{ id: 'nextjs', confidence: 0.95, ... }, ...]
 * ```
 */
export async function detectWorkspaceFrameworks(
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<DetectedFramework[]> {
	if (!isLanguageServerActive()) {
		logger.warn("Language server not active for framework detection");
		return [];
	}

	try {
		const frameworks = await detectFrameworksViaLSP(workspaceFolder);
		logger.debug(`Detected ${frameworks.length} frameworks via LSP`, {
			frameworks: frameworks.map((f: DetectedFramework) => f.id).join(", "),
		});
		return frameworks;
	} catch (error) {
		logger.error("Framework detection failed", error as Error);
		return [];
	}
}

/**
 * Get primary framework for workspace (via language server)
 */
export async function getPrimaryFramework(workspaceFolder?: vscode.WorkspaceFolder): Promise<DetectedFramework | null> {
	if (!isLanguageServerActive()) {
		logger.warn("Language server not active for primary framework detection");
		return null;
	}

	try {
		return await detectPrimaryFrameworkViaLSP(workspaceFolder);
	} catch (error) {
		logger.error("Primary framework detection failed", error as Error);
		return null;
	}
}

/**
 * Validate code using intelligence pipeline (via language server)
 * Provides access to full 7-layer validation
 */
export async function validateCode(
	code: string,
	filePath: string,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<PipelineResult> {
	return validateCodeViaLSP(code, filePath, workspaceFolder);
}

/**
 * Detect patterns in code (via language server)
 */
export async function detectPatterns(
	code: string,
	filePath: string,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<PipelineResult> {
	return detectPatternsViaLSP(code, filePath, workspaceFolder);
}

/**
 * Get workspace vitals snapshot (via language server)
 */
export async function getVitals(workspaceFolder?: vscode.WorkspaceFolder): Promise<VitalsSnapshot> {
	return getVitalsViaLSP(workspaceFolder);
}

/**
 * Report a violation for learning (via language server)
 */
export async function reportViolation(
	violation: ViolationInput,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<void> {
	return reportViolationViaLSP(violation, workspaceFolder);
}

/**
 * Get learning statistics (via language server)
 * Returns aggregated stats about learnings and violations
 */
export async function getLearningStats(workspaceFolder?: vscode.WorkspaceFolder): Promise<unknown> {
	return getLearningStatsViaLSP(workspaceFolder);
}

/**
 * Get WorkspaceVitals snapshot for subscriptions and direct access
 * Note: Returns snapshot instead of instance (instance is on server)
 */
export async function getWorkspaceVitals(workspaceFolder?: vscode.WorkspaceFolder): Promise<VitalsSnapshot> {
	return getVitalsViaLSP(workspaceFolder);
}

/**
 * Get WorkspaceVitals proxy synchronously by workspaceId
 * Uses WorkspaceVitalsProxy that provides same interface as WorkspaceVitals.
 * Use this in constructors where async is not possible.
 *
 * IMPORTANT: Call preCacheVitals() during extension activation
 * to ensure cache is populated before this is called.
 *
 * @param workspaceId - The workspace identifier string (e.g., folder path or URI)
 * @returns WorkspaceVitalsProxy instance
 */
export function getWorkspaceVitalsSync(workspaceId: string): WorkspaceVitalsProxy {
	return getWorkspaceVitalsProxy(workspaceId);
}

// =============================================================================
// SESSION & FILE MODIFICATION TRACKING
// =============================================================================

/**
 * Find the active session ID from shared session storage
 * Sessions are started by MCP's begin_task and stored in the shared sessions.jsonl file.
 */
async function findActiveSessionId(workspaceFolder?: vscode.WorkspaceFolder): Promise<string | null> {
	const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];

	if (!folder) {
		return null;
	}

	const sessionsPath = path.join(folder.uri.fsPath, ".snapback", "session", "sessions.jsonl");

	try {
		if (!fs.existsSync(sessionsPath)) {
			return null;
		}

		const content = await fs.promises.readFile(sessionsPath, "utf-8");
		const lines = content.trim().split("\n").filter(Boolean);

		// Read sessions from newest to oldest (file is append-only)
		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const session = JSON.parse(lines[i]);
				// Session is active if it has no endedAt timestamp
				if (session.id && !session.endedAt) {
					return session.id;
				}
			} catch {
				// Skip malformed lines
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Record a file modification to the active Intelligence session (via language server)
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
	try {
		if (!isLanguageServerActive()) {
			logger.debug("Language server not active for file modification tracking", { filePath });
			return;
		}

		const activeSessionId = await findActiveSessionId(workspaceFolder);

		if (!activeSessionId) {
			logger.debug("No active session for file modification tracking", { filePath });
			return;
		}

		await recordFileModificationViaLSP(
			activeSessionId,
			{
				path: filePath,
				timestamp: Date.now(),
				type,
				linesChanged: options?.linesChanged,
			},
			workspaceFolder,
		);

		logger.debug("Recorded file modification via LSP", {
			sessionId: activeSessionId,
			filePath,
			type,
			aiAttributed: options?.aiAttributed,
		});
	} catch (error) {
		logger.warn("Failed to record file modification", {
			filePath,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Get file modifications for the active session (via language server)
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
	try {
		if (!isLanguageServerActive()) {
			return [];
		}

		const sessionId = await findActiveSessionId(workspaceFolder);
		if (!sessionId) {
			return [];
		}

		return await getFileModificationsViaLSP(sessionId, since, workspaceFolder);
	} catch {
		return [];
	}
}

// =============================================================================
// LIFECYCLE
// =============================================================================

/**
 * Dispose all Intelligence instances (no-op now, server handles cleanup)
 * Call on extension deactivation
 */
export async function disposeAll(): Promise<void> {
	// Intelligence instances are now on the server - nothing to dispose here
	// The language server handles cleanup when it shuts down
	logger.info("Intelligence disposed (server-side)");
}

/**
 * Clear cache (for testing)
 */
export function clearCache(): void {
	// No local cache to clear - vitals cache is in LanguageClient
	logger.debug("Cache cleared");
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
