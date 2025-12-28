/**
 * SnapBack Language Client
 *
 * Spawns and communicates with the language server for heavy compute operations.
 * This is the main proxy layer - all @snapback/intelligence calls go through here.
 *
 * The language server runs in a separate process and contains all heavy packages,
 * keeping the extension bundle lightweight (<1MB target).
 *
 * @module languageClient
 */

import * as path from "node:path";
import type { DetectedFramework, PipelineResult } from "@snapback/intelligence";
import type { VitalsSnapshot } from "@snapback/intelligence/vitals";
import * as vscode from "vscode";
import {
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";
import { logger } from "../utils/logger";

let client: LanguageClient | undefined;

// =============================================================================
// VITALS CACHE (for sync access in constructors)
// =============================================================================

interface CachedVitals {
	snapshot: VitalsSnapshot;
	thresholdMultiplier: number;
	timestamp: number;
}

const vitalsCache = new Map<string, CachedVitals>();
const VITALS_CACHE_TTL_MS = 30_000; // 30 seconds

// =============================================================================
// WORKSPACE VITALS PROXY
// =============================================================================

/**
 * WorkspaceVitalsProxy - Provides WorkspaceVitals-like interface using LSP
 * This allows code that depends on WorkspaceVitals methods to work
 * without bundling the heavy @snapback/intelligence package.
 */
export class WorkspaceVitalsProxy {
	private workspaceId: string;

	constructor(workspaceId: string) {
		this.workspaceId = workspaceId;
	}

	/**
	 * Get current vitals snapshot (from cache)
	 */
	current(): VitalsSnapshot {
		return getVitalsFromCacheSync(this.workspaceId);
	}

	/**
	 * Get threshold multiplier (from cache)
	 */
	getThresholdMultiplier(): number {
		return getThresholdMultiplierFromCacheSync(this.workspaceId);
	}

	/**
	 * Notify of file change - sends to server asynchronously
	 */
	onFileChange(event: { path: string; isAI: boolean; tool?: string }): void {
		// Fire-and-forget notification to server
		if (isLanguageServerActive()) {
			sendRequest("snapback/vitals/onFileChange", {
				workspaceId: this.workspaceId,
				...event,
			}).catch(() => {
				// Ignore errors - this is a notification
			});
		}
	}

	/**
	 * Notify of snapshot creation - sends to server asynchronously
	 */
	onSnapshot(event: { filePath: string }): void {
		if (isLanguageServerActive()) {
			sendRequest("snapback/vitals/onSnapshot", {
				workspaceId: this.workspaceId,
				...event,
			}).catch(() => {
				// Ignore errors - this is a notification
			});
		}
	}

	/**
	 * Record behavior for learning - sends to server asynchronously
	 */
	recordBehavior(created: boolean): void {
		if (isLanguageServerActive()) {
			sendRequest("snapback/vitals/recordBehavior", {
				workspaceId: this.workspaceId,
				created,
			}).catch(() => {
				// Ignore errors - this is a notification
			});
		}
	}

	/**
	 * Get agent guidance synchronously (from current snapshot)
	 */
	getAgentGuidance(): { shouldSnapshot: boolean; reason: string } {
		const vitals = this.current();
		// Simple heuristic based on vitals - the real logic is on server
		const shouldSnapshot = vitals.pressure.value > 70 || vitals.trajectory === "critical";
		return {
			shouldSnapshot,
			reason: shouldSnapshot ? "High pressure or critical trajectory" : "Vitals are stable",
		};
	}

	/**
	 * Check if should snapshot (from current snapshot)
	 */
	shouldSnapshot(): boolean {
		const vitals = this.current();
		return vitals.pressure.value > 70 || vitals.trajectory === "critical";
	}
}

// Cache of WorkspaceVitalsProxy instances
const vitalsProxyCache = new Map<string, WorkspaceVitalsProxy>();

/**
 * Get or create WorkspaceVitalsProxy for a workspace
 */
export function getWorkspaceVitalsProxy(workspaceId: string): WorkspaceVitalsProxy {
	if (!vitalsProxyCache.has(workspaceId)) {
		vitalsProxyCache.set(workspaceId, new WorkspaceVitalsProxy(workspaceId));
	}
	return vitalsProxyCache.get(workspaceId)!;
}

/**
 * Activate the language server (lazy-loaded)
 */
export async function activateLanguageServer(context: vscode.ExtensionContext): Promise<void> {
	if (client) {
		return; // Already activated
	}

	// Path to the server module (will be bundled separately by esbuild)
	const serverModule = context.asAbsolutePath(path.join("dist", "server", "index.js"));

	// Server options for run and debug modes
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: { execArgv: ["--nolazy", "--inspect=6009"] }, // Allow debugging
		},
	};

	// Client options
	const clientOptions: LanguageClientOptions = {
		// Document selector - we handle all file types for workspace analysis
		documentSelector: [{ scheme: "file", pattern: "**/*" }],
		synchronize: {
			// Notify server of .snapback config changes
			fileEvents: vscode.workspace.createFileSystemWatcher("**/.snapbackrc"),
		},
	};

	// Create and start the language client
	client = new LanguageClient("snapbackLanguageServer", "SnapBack Language Server", serverOptions, clientOptions);

	await client.start();
	console.log("SnapBack Language Server started");
}

/**
 * Deactivate the language server
 */
export async function deactivateLanguageServer(): Promise<void> {
	if (!client) {
		return;
	}

	await client.stop();
	client = undefined;
	console.log("SnapBack Language Server stopped");
}

/**
 * Get the language client (if active)
 */
export function getLanguageClient(): LanguageClient | undefined {
	return client;
}

/**
 * Check if the language server is active
 */
export function isLanguageServerActive(): boolean {
	return client !== undefined;
}

/**
 * Send a custom request to the language server
 */
export async function sendRequest<P, R>(method: string, params: P): Promise<R> {
	if (!client) {
		throw new Error("Language server not active. Call activateLanguageServer first.");
	}

	return client.sendRequest(method, params);
}

// =============================================================================
// VITALS CACHE MANAGEMENT
// =============================================================================

/**
 * Pre-cache vitals for a workspace (call during activation)
 * This enables sync access via getVitalsFromCacheSync
 */
export async function preCacheVitals(workspaceId: string): Promise<void> {
	try {
		const response = await sendRequest<
			{ workspaceId: string },
			{ success: boolean; vitals?: VitalsSnapshot; thresholdMultiplier?: number; error?: string }
		>("snapback/vitals/full", { workspaceId });

		if (response.success && response.vitals) {
			vitalsCache.set(workspaceId, {
				snapshot: response.vitals,
				thresholdMultiplier: response.thresholdMultiplier ?? 1.0,
				timestamp: Date.now(),
			});
			logger.debug("Vitals pre-cached", { workspaceId });
		}
	} catch (error) {
		logger.warn("Failed to pre-cache vitals", {
			workspaceId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Get vitals from cache synchronously (for constructors)
 * Returns cached value or default if not available
 */
export function getVitalsFromCacheSync(workspaceId: string): VitalsSnapshot {
	const cached = vitalsCache.get(workspaceId);

	if (cached && Date.now() - cached.timestamp < VITALS_CACHE_TTL_MS) {
		return cached.snapshot;
	}

	// Return default vitals structure
	return createDefaultVitals();
}

/**
 * Get threshold multiplier from cache (for constructors)
 */
export function getThresholdMultiplierFromCacheSync(workspaceId: string): number {
	const cached = vitalsCache.get(workspaceId);
	return cached?.thresholdMultiplier ?? 1.0;
}

/**
 * Create default vitals structure for cache miss
 */
function createDefaultVitals(): VitalsSnapshot {
	return {
		timestamp: Date.now(),
		pulse: { level: "resting", changesPerMinute: 0 },
		temperature: { level: "cold", aiPercentage: 0 },
		pressure: { value: 0, unsnapshotedChanges: 0, timeSinceLastSnapshot: 0, criticalFilesTouched: [] },
		oxygen: { value: 100, coveragePercentage: 100, staleSnapshots: 0 },
		trajectory: "stable",
	};
}

/**
 * Refresh vitals cache (call periodically or after significant events)
 */
export async function refreshVitalsCache(workspaceId: string): Promise<void> {
	await preCacheVitals(workspaceId);
}

// =============================================================================
// INTELLIGENCE PROXY FUNCTIONS
// =============================================================================

/**
 * Get workspace context info (workspaceUri and root path)
 */
function getWorkspaceContext(folder?: vscode.WorkspaceFolder): {
	workspaceUri: string;
	workspaceRoot: string;
} {
	const f = folder ?? vscode.workspace.workspaceFolders?.[0];
	if (!f) {
		throw new Error("No workspace folder open");
	}
	return {
		workspaceUri: f.uri.toString(),
		workspaceRoot: f.uri.fsPath,
	};
}

/**
 * Initialize Intelligence instance on server
 */
export async function initializeIntelligence(
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<{ success: boolean; error?: string }> {
	const ctx = getWorkspaceContext(workspaceFolder);
	return sendRequest("snapback/intelligence/get", ctx);
}

/**
 * Detect frameworks in workspace (via language server)
 */
export async function detectFrameworksViaLSP(workspaceFolder?: vscode.WorkspaceFolder): Promise<DetectedFramework[]> {
	const ctx = getWorkspaceContext(workspaceFolder);
	const response = await sendRequest<
		{ workspaceRoot: string },
		{ success: boolean; frameworks?: DetectedFramework[]; error?: string }
	>("snapback/intelligence/detectFrameworks", { workspaceRoot: ctx.workspaceRoot });

	if (!response.success) {
		logger.error("detectFrameworks failed", new Error(response.error ?? "Unknown error"));
		return [];
	}

	return response.frameworks ?? [];
}

/**
 * Detect primary framework (via language server)
 */
export async function detectPrimaryFrameworkViaLSP(
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<DetectedFramework | null> {
	const ctx = getWorkspaceContext(workspaceFolder);
	const response = await sendRequest<
		{ workspaceRoot: string },
		{ success: boolean; framework?: DetectedFramework | null; error?: string }
	>("snapback/intelligence/detectPrimaryFramework", { workspaceRoot: ctx.workspaceRoot });

	if (!response.success) {
		logger.error("detectPrimaryFramework failed", new Error(response.error ?? "Unknown error"));
		return null;
	}

	return response.framework ?? null;
}

/**
 * Validate code using 7-layer pipeline (via language server)
 */
export async function validateCodeViaLSP(
	code: string,
	filePath: string,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<PipelineResult> {
	const ctx = getWorkspaceContext(workspaceFolder);
	const response = await sendRequest<
		{ code: string; filePath: string; workspaceUri: string; workspaceRoot: string },
		{ success: boolean; result?: PipelineResult; error?: string }
	>("snapback/intelligence/validateCode", {
		code,
		filePath,
		...ctx,
	});

	if (!response.success || !response.result) {
		throw new Error(response.error ?? "Validation failed");
	}

	return response.result;
}

/**
 * Detect patterns in code (via language server)
 */
export async function detectPatternsViaLSP(
	code: string,
	filePath: string,
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<PipelineResult> {
	const ctx = getWorkspaceContext(workspaceFolder);
	const response = await sendRequest<
		{ code: string; filePath: string; workspaceUri: string; workspaceRoot: string },
		{ success: boolean; result?: PipelineResult; error?: string }
	>("snapback/intelligence/detectPatterns", {
		code,
		filePath,
		...ctx,
	});

	if (!response.success || !response.result) {
		throw new Error(response.error ?? "Pattern detection failed");
	}

	return response.result;
}

/**
 * Get vitals snapshot (via language server)
 */
export async function getVitalsViaLSP(workspaceFolder?: vscode.WorkspaceFolder): Promise<VitalsSnapshot> {
	const f = workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
	const workspaceId = f?.uri.toString() ?? "default";

	const response = await sendRequest<
		{ workspaceId: string },
		{ success: boolean; vitals?: VitalsSnapshot; error?: string }
	>("snapback/vitals/full", { workspaceId });

	if (!response.success || !response.vitals) {
		throw new Error(response.error ?? "Failed to get vitals");
	}

	// Update cache
	vitalsCache.set(workspaceId, {
		snapshot: response.vitals,
		thresholdMultiplier: 1.0,
		timestamp: Date.now(),
	});

	return response.vitals;
}

/**
 * Report violation for learning (via language server)
 */
export async function reportViolationViaLSP(
	violation: {
		type: string;
		file: string;
		message: string;
		reason: string;
		prevention: string;
	},
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<void> {
	const ctx = getWorkspaceContext(workspaceFolder);
	const response = await sendRequest<
		{ violation: typeof violation; workspaceUri: string; workspaceRoot: string },
		{ success: boolean; error?: string }
	>("snapback/intelligence/reportViolation", {
		violation,
		...ctx,
	});

	if (!response.success) {
		throw new Error(response.error ?? "Failed to report violation");
	}
}

/**
 * Get learning statistics (via language server)
 */
export async function getLearningStatsViaLSP(workspaceFolder?: vscode.WorkspaceFolder): Promise<unknown> {
	const ctx = getWorkspaceContext(workspaceFolder);
	const response = await sendRequest<
		{ workspaceUri: string; workspaceRoot: string },
		{ success: boolean; stats?: unknown; error?: string }
	>("snapback/intelligence/getLearningStats", ctx);

	if (!response.success) {
		throw new Error(response.error ?? "Failed to get learning stats");
	}

	return response.stats;
}

/**
 * Record file modification to session (via language server)
 */
export async function recordFileModificationViaLSP(
	sessionId: string,
	modification: {
		path: string;
		timestamp: number;
		type: "create" | "update" | "delete";
		linesChanged?: number;
	},
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<void> {
	const ctx = getWorkspaceContext(workspaceFolder);
	const response = await sendRequest<
		{
			sessionId: string;
			modification: typeof modification;
			workspaceUri: string;
			workspaceRoot: string;
		},
		{ success: boolean; error?: string }
	>("snapback/intelligence/recordModification", {
		sessionId,
		modification,
		...ctx,
	});

	if (!response.success) {
		logger.warn("Failed to record modification", { error: response.error });
	}
}

/**
 * Get file modifications for session (via language server)
 */
export async function getFileModificationsViaLSP(
	sessionId: string,
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
	const ctx = getWorkspaceContext(workspaceFolder);
	const response = await sendRequest<
		{ sessionId: string; since?: number; workspaceUri: string; workspaceRoot: string },
		{
			success: boolean;
			modifications?: Array<{
				path: string;
				timestamp: number;
				type: "create" | "update" | "delete";
				linesChanged: number;
				aiAttributed: boolean;
			}>;
			error?: string;
		}
	>("snapback/intelligence/getModifications", {
		sessionId,
		since,
		...ctx,
	});

	if (!response.success) {
		return [];
	}

	return response.modifications ?? [];
}

// =============================================================================
// LEGACY COMPATIBILITY (kept for existing callers)
// =============================================================================

/**
 * Validate code using the language server (legacy API)
 */
export async function validateCode(
	code: string,
	filePath: string,
): Promise<{
	success: boolean;
	result?: unknown;
	error?: string;
}> {
	return sendRequest("snapback/validate", { code, filePath });
}

/**
 * Get workspace vitals from the language server (legacy API)
 */
export async function getWorkspaceVitals(): Promise<{
	success: boolean;
	vitals?: unknown;
	guidance?: unknown;
	snapshotDecision?: unknown;
	error?: string;
}> {
	return sendRequest("snapback/vitals", {});
}
