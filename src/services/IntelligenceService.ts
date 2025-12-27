/**
 * Intelligence Service for VS Code Extension
 *
 * @fileoverview Provides singleton access to @snapback/intelligence for extension.
 * Mirrors the CLI's intelligence-service.ts pattern but adapted for VS Code context.
 *
 * ## Key Differences from CLI
 *
 * - Uses VS Code workspace API instead of process.cwd()
 * - Integrates with extension's globalStorage for some paths
 * - Provides VS Code-specific convenience methods
 * - Handles multi-root workspaces
 *
 * ## Architecture
 *
 * ```
 * Extension Commands/UI
 *         ↓
 * IntelligenceService (this file)
 *         ↓
 * @snapback/intelligence
 * ```
 *
 * ## Migration Notes
 *
 * REPLACES: apps/vscode/src/stacks/stackDetection.ts
 * REPLACES: apps/vscode/src/stacks/stackProfiles.ts
 *
 * @see packages/intelligence/inteligence_migration.md for migration plan
 * @module services/IntelligenceService
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	type DetectedFramework,
	type FrameworkDetectionContext,
	Intelligence,
	type IntelligenceConfig,
	detectFrameworks as intelligenceDetectFrameworks,
	detectPrimaryFramework as intelligenceDetectPrimaryFramework,
	type PipelineResult,
} from "@snapback/intelligence";
import { type VitalsSnapshot, WorkspaceVitals } from "@snapback/intelligence/vitals";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

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
// SINGLETON MANAGEMENT
// =============================================================================

/**
 * Cache of Intelligence instances per workspace
 * Key: workspace folder URI string
 */
const instances = new Map<string, Intelligence>();

/**
 * Cache of WorkspaceVitals instances per workspace
 * Separate from Intelligence for lightweight vitals-only access
 */
const vitalsInstances = new Map<string, WorkspaceVitals>();

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Create Intelligence configuration for a VS Code workspace
 *
 * IMPORTANT: Session persistence path MUST match MCP and CLI configurations
 * to enable cross-surface session sharing (Extension ⇄ MCP ⇄ CLI)
 */
function createExtensionIntelligenceConfig(
	workspaceRoot: string,
	options: ExtensionIntelligenceOptions = {},
): IntelligenceConfig {
	// Use .snapback/ directory in workspace (same as CLI)
	const snapbackDir = `${workspaceRoot}/.snapback`;

	return {
		rootDir: snapbackDir,
		patternsDir: "patterns",
		learningsDir: "learnings",
		constraintsFile: "constraints.md",
		violationsFile: "patterns/violations.jsonl",
		embeddingsDb: "embeddings.db",
		contextFiles: ["patterns/workspace-patterns.json", "vitals.json", "constraints.md"],
		enableSemanticSearch: options.enableSemanticSearch ?? false,
		enableLearningLoop: options.enableLearningLoop ?? true,
		enableAutoPromotion: options.enableAutoPromotion ?? true,
		// Session persistence for cross-surface coordination
		// Matches MCP's configuration for shared session state
		sessionPersistence: {
			path: `${workspaceRoot}/.snapback/session/sessions.jsonl`,
			autosave: true,
		},
	};
}

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Get or create Intelligence instance for a workspace
 *
 * @param workspaceFolder - VS Code workspace folder (defaults to first workspace)
 * @param options - Configuration options
 * @returns Intelligence instance
 *
 * @example
 * ```typescript
 * const intel = await getIntelligence();
 * const context = await intel.getContext({ task: "Add authentication" });
 * ```
 */
export async function getIntelligence(
	workspaceFolder?: vscode.WorkspaceFolder,
	options?: ExtensionIntelligenceOptions,
): Promise<Intelligence> {
	const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];

	if (!folder) {
		throw new Error("No workspace folder open");
	}

	const key = folder.uri.toString();

	const instance = instances.get(key);
	if (instance) {
		return instance;
	}

	const config = createExtensionIntelligenceConfig(folder.uri.fsPath, options);
	const intel = new Intelligence(config);

	instances.set(key, intel);
	logger.info(`Intelligence initialized for workspace: ${folder.name}`);

	return intel;
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
export async function getIntelligenceWithSemantic(workspaceFolder?: vscode.WorkspaceFolder): Promise<Intelligence> {
	const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];

	if (!folder) {
		throw new Error("No workspace folder open");
	}

	const key = `${folder.uri.toString()}:semantic`;

	const instance = instances.get(key);
	if (instance) {
		return instance;
	}

	const config = createExtensionIntelligenceConfig(folder.uri.fsPath, {
		enableSemanticSearch: true,
	});

	const intel = new Intelligence(config);
	await intel.initialize();

	instances.set(key, intel);

	return intel;
}

// =============================================================================
// CONVENIENCE METHODS (Replace Local Implementations)
// =============================================================================

/**
 * Build framework detection context from workspace
 */
async function buildFrameworkContext(workspaceRoot: string): Promise<FrameworkDetectionContext> {
	const packageJsonPath = path.join(workspaceRoot, "package.json");
	let packageJson: FrameworkDetectionContext["packageJson"];

	try {
		const content = await fs.promises.readFile(packageJsonPath, "utf-8");
		packageJson = JSON.parse(content);
	} catch {
		// No package.json or invalid - that's ok
	}

	// Get file paths from workspace - simplified for common framework files
	const filePaths: string[] = [];
	try {
		const entries = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile()) {
				filePaths.push(entry.name);
			} else if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
				// Check first-level subdirectories for common patterns
				filePaths.push(`${entry.name}/`);
			}
		}
	} catch {
		// Can't read directory - continue with empty list
	}

	return {
		packageJson,
		filePaths,
	};
}

/**
 * Detect frameworks in workspace
 * REPLACES: apps/vscode/src/stacks/stackDetection.ts
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
	const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];

	if (!folder) {
		return [];
	}

	try {
		const context = await buildFrameworkContext(folder.uri.fsPath);
		const frameworks = await intelligenceDetectFrameworks(context);
		logger.debug(`Detected ${frameworks.length} frameworks`, {
			frameworks: frameworks.map((f: DetectedFramework) => f.id).join(", "),
		});
		return frameworks;
	} catch (error) {
		logger.error("Framework detection failed", error as Error);
		return [];
	}
}

/**
 * Get primary framework for workspace
 * REPLACES: Primary stack detection logic
 */
export async function getPrimaryFramework(workspaceFolder?: vscode.WorkspaceFolder): Promise<DetectedFramework | null> {
	const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];

	if (!folder) {
		return null;
	}

	try {
		const context = await buildFrameworkContext(folder.uri.fsPath);
		return await intelligenceDetectPrimaryFramework(context);
	} catch (error) {
		logger.error("Primary framework detection failed", error as Error);
		return null;
	}
}

/**
 * Validate code using intelligence pipeline
 * Provides access to full 7-layer validation
 */
export async function validateCode(
	code: string,
	filePath: string,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<PipelineResult> {
	const intel = await getIntelligence(workspaceFolder);
	return intel.validateCode(code, filePath);
}

/**
 * Detect patterns in code
 * REPLACES: Local pattern matching
 */
export async function detectPatterns(
	code: string,
	filePath: string,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<PipelineResult> {
	const intel = await getIntelligence(workspaceFolder);
	return intel.checkPatterns(code, filePath);
}

/**
 * Get workspace vitals snapshot
 * ALREADY USED: But now via unified service
 */
export async function getVitals(workspaceFolder?: vscode.WorkspaceFolder): Promise<VitalsSnapshot> {
	const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];

	if (!folder) {
		throw new Error("No workspace folder open");
	}

	const workspaceId = folder.uri.toString();

	if (!vitalsInstances.has(workspaceId)) {
		const vitals = WorkspaceVitals.for(workspaceId);
		vitalsInstances.set(workspaceId, vitals);
	}

	const vitals = vitalsInstances.get(workspaceId);
	if (!vitals) {
		throw new Error(`Failed to get vitals for workspace ${workspaceId}`);
	}

	return vitals.current();
}

/**
 * Report a violation for learning
 */
export async function reportViolation(
	violation: ViolationInput,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<void> {
	const intel = await getIntelligence(workspaceFolder);
	await intel.reportViolation(violation);
}

/**
 * Get learning statistics
 * Returns aggregated stats about learnings and violations
 */
export async function getLearningStats(
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<ReturnType<Intelligence["getStats"]>> {
	const intel = await getIntelligence(workspaceFolder);
	return intel.getStats();
}

/**
 * Get WorkspaceVitals instance for subscriptions and direct access
 * Use this when you need to subscribe to vitals changes
 */
export async function getWorkspaceVitals(workspaceFolder?: vscode.WorkspaceFolder): Promise<WorkspaceVitals> {
	const folder = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];

	if (!folder) {
		throw new Error("No workspace folder open");
	}

	const workspaceId = folder.uri.toString();

	if (!vitalsInstances.has(workspaceId)) {
		const vitals = WorkspaceVitals.for(workspaceId);
		vitalsInstances.set(workspaceId, vitals);
	}

	const vitals = vitalsInstances.get(workspaceId);
	if (!vitals) {
		throw new Error(`Failed to get vitals for workspace ${workspaceId}`);
	}

	return vitals;
}

/**
 * Get WorkspaceVitals instance synchronously by workspaceId
 * Use this in constructors where async is not possible
 *
 * @param workspaceId - The workspace identifier string (e.g., folder path or URI)
 * @returns WorkspaceVitals instance for the workspace
 */
export function getWorkspaceVitalsSync(workspaceId: string): WorkspaceVitals {
	if (!vitalsInstances.has(workspaceId)) {
		const vitals = WorkspaceVitals.for(workspaceId);
		vitalsInstances.set(workspaceId, vitals);
	}

	const vitals = vitalsInstances.get(workspaceId);
	if (!vitals) {
		throw new Error(`Failed to get vitals for workspace ${workspaceId}`);
	}

	return vitals;
}

// =============================================================================
// SESSION & FILE MODIFICATION TRACKING
// =============================================================================

/**
 * Record a file modification to the active Intelligence session
 *
 * This is the key integration point for cross-surface session coordination.
 * When the Extension records a file modification, it becomes visible to:
 * - MCP's what_changed tool
 * - CLI's session.changes command
 * - Daemon's session monitoring
 *
 * @param filePath - Absolute path to the modified file
 * @param type - Type of modification: create, update, or delete
 * @param linesChanged - Number of lines changed (optional)
 * @param aiAttributed - Whether the change was made by an AI tool
 * @param aiTool - Name of the AI tool (e.g., "copilot", "cursor", "claude")
 * @param workspaceFolder - Target workspace folder (defaults to first workspace)
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
		const intel = await getIntelligence(workspaceFolder);

		// Find active session from Intelligence (shared across surfaces)
		// The session ID is stored in the shared session persistence file
		const activeSessionId = await findActiveSessionId(workspaceFolder);

		if (!activeSessionId) {
			// No active session - this can happen if MCP hasn't started a task yet
			// File modifications will still be tracked by git, just not in Intelligence
			logger.debug("No active session for file modification tracking", { filePath });
			return;
		}

		intel.recordFileModification(activeSessionId, {
			path: filePath,
			timestamp: Date.now(),
			type,
			linesChanged: options?.linesChanged,
		});

		logger.debug("Recorded file modification to Intelligence session", {
			sessionId: activeSessionId,
			filePath,
			type,
			aiAttributed: options?.aiAttributed,
		});
	} catch (error) {
		// Don't fail the save operation if modification tracking fails
		logger.warn("Failed to record file modification to Intelligence", {
			filePath,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Find the active session ID from shared session storage
 *
 * Sessions are started by MCP's begin_task and stored in the shared
 * sessions.jsonl file. This method reads that file to find any active session.
 *
 * @param workspaceFolder - Target workspace folder
 * @returns Active session ID or null if no active session
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
 * Get file modifications for the active session
 *
 * @param since - Optional timestamp to filter modifications
 * @param workspaceFolder - Target workspace folder
 * @returns Array of file modifications
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
		const intel = await getIntelligence(workspaceFolder);
		const sessionId = await findActiveSessionId(workspaceFolder);

		if (!sessionId) {
			return [];
		}

		return intel.getFileModifications(sessionId, since);
	} catch {
		return [];
	}
}

// =============================================================================
// LIFECYCLE
// =============================================================================

/**
 * Dispose all Intelligence instances
 * Call on extension deactivation
 */
export async function disposeAll(): Promise<void> {
	const disposals: Promise<void>[] = [];

	for (const [key, intel] of instances) {
		disposals.push(
			intel.dispose().catch((err) => {
				logger.warn(`Failed to dispose intelligence for ${key}`, err);
			}),
		);
	}

	for (const [key, vitals] of vitalsInstances) {
		disposals.push(
			Promise.resolve((vitals as any).dispose?.()).catch((err: unknown) => {
				logger.warn(`Failed to dispose vitals for ${key}`, err);
			}),
		);
	}

	await Promise.all(disposals);

	instances.clear();
	vitalsInstances.clear();

	logger.info("All Intelligence instances disposed");
}

/**
 * Clear cache (for testing)
 */
export function clearCache(): void {
	disposeAll().catch(() => {});
	instances.clear();
	vitalsInstances.clear();
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
