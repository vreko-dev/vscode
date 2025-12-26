/**
 * MCPBridge - Pushes observations and file changes to MCP server
 *
 * Part of the "pair programmer" architecture. This bridge:
 * - Tracks file changes with AI attribution
 * - Generates observations based on risk detection
 * - Pushes data to MCP server for composite tool awareness
 *
 * Architecture:
 * - Observes VS Code file events
 * - Integrates with SignalBridge for AI detection
 * - Batches and pushes to MCP server periodically
 *
 * @module bridges/MCPBridge
 */

import * as vscode from "vscode";
import type { SignalBridge } from "./SignalBridge";

// =============================================================================
// TYPES
// =============================================================================

/**
 * File change tracked for MCP session
 */
export interface MCPFileChange {
	file: string;
	type: "created" | "modified" | "deleted";
	timestamp: number;
	aiAttributed: boolean;
	linesChanged: number;
}

/**
 * Observation for proactive hints
 */
export interface MCPObservation {
	type: "risk" | "pattern" | "suggestion" | "warning" | "progress";
	message: string;
	timestamp: number;
	context?: Record<string, unknown>;
}

/**
 * MCPBridge configuration
 */
export interface MCPBridgeConfig {
	/** MCP bridge endpoint (default: http://localhost:3100) */
	mcpEndpoint?: string;
	/** Flush interval in ms (default: 5000) */
	flushInterval?: number;
	/** Enable AI attribution detection (default: true) */
	enableAIDetection?: boolean;
	/** Risk file patterns */
	riskPatterns?: string[];
}

/**
 * Payload sent to MCP bridge endpoint
 */
interface BridgePushPayload {
	observations: MCPObservation[];
	changes: MCPFileChange[];
	workspaceRoot: string;
}

// =============================================================================
// RISK DETECTION
// =============================================================================

/**
 * Default risk patterns for high-risk file detection
 */
const DEFAULT_RISK_PATTERNS = [
	"**/auth/**",
	"**/login/**",
	"**/session/**",
	"**/payment/**",
	"**/stripe/**",
	"**/billing/**",
	"**/database/**",
	"**/migration/**",
	"**/*.env*",
	"**/config/**",
	"**/secret*",
	"**/security/**",
];

/**
 * Check if file matches risk patterns
 */
function isRiskFile(filePath: string, _patterns: string[]): boolean {
	const relativePath = vscode.workspace.asRelativePath(filePath, false);
	const lowerPath = relativePath.toLowerCase();

	// Quick check for common risk indicators
	const riskKeywords = [
		"auth",
		"login",
		"session",
		"payment",
		"billing",
		"database",
		"migration",
		"secret",
		"security",
		"config",
		".env",
	];

	for (const keyword of riskKeywords) {
		if (lowerPath.includes(keyword)) {
			return true;
		}
	}

	// TODO: Add full glob matching if needed
	return false;
}

/**
 * Get risk reason for a file
 */
function getRiskReason(filePath: string): string {
	const lowerPath = filePath.toLowerCase();

	if (lowerPath.includes("auth") || lowerPath.includes("login")) {
		return "authentication code";
	}
	if (lowerPath.includes("payment") || lowerPath.includes("billing") || lowerPath.includes("stripe")) {
		return "payment processing";
	}
	if (lowerPath.includes("database") || lowerPath.includes("migration")) {
		return "database/migration";
	}
	if (lowerPath.includes(".env") || lowerPath.includes("secret")) {
		return "sensitive configuration";
	}
	if (lowerPath.includes("security")) {
		return "security module";
	}

	return "critical code";
}

// =============================================================================
// MCP BRIDGE CLASS
// =============================================================================

/**
 * MCPBridge - Extension-side bridge to MCP server
 *
 * Tracks file changes and generates observations for the MCP session.
 * Integrates with SignalBridge for AI attribution detection.
 *
 * Usage:
 * ```typescript
 * const bridge = new MCPBridge({
 *   mcpEndpoint: "http://localhost:3100",
 *   flushInterval: 5000,
 * });
 *
 * bridge.activate(context);
 * // ... later
 * bridge.dispose();
 * ```
 */
export class MCPBridge {
	private readonly mcpEndpoint: string;
	private readonly flushInterval: number;
	private readonly enableAIDetection: boolean;
	private readonly riskPatterns: string[];
	private readonly workspaceRoot: string;

	// State
	private observationQueue: MCPObservation[] = [];
	private changeQueue: MCPFileChange[] = [];
	private aiAttributedFiles = new Set<string>();
	private disposables: vscode.Disposable[] = [];
	private flushTimer: NodeJS.Timeout | null = null;
	private signalBridge: SignalBridge | null = null;

	// Stats
	private pushCount = 0;
	private failureCount = 0;
	private lastPushTime: number | null = null;

	constructor(config: MCPBridgeConfig = {}) {
		this.mcpEndpoint = config.mcpEndpoint ?? "http://127.0.0.1:3100";
		this.flushInterval = config.flushInterval ?? 5000;
		this.enableAIDetection = config.enableAIDetection ?? true;
		this.riskPatterns = config.riskPatterns ?? DEFAULT_RISK_PATTERNS;
		this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
	}

	/**
	 * Activate the bridge (register listeners)
	 */
	activate(_context: vscode.ExtensionContext, signalBridge?: SignalBridge): void {
		this.signalBridge = signalBridge ?? null;

		// Register file watchers
		this.setupFileWatchers();

		// Start periodic flush
		this.startFlushTimer();

		console.log("[MCPBridge] Activated");
	}

	/**
	 * Dispose the bridge (cleanup)
	 */
	dispose(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}

		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];

		// Final flush
		this.flushToMCP().catch(() => {});

		console.log("[MCPBridge] Disposed");
	}

	// =========================================================================
	// FILE WATCHERS
	// =========================================================================

	/**
	 * Set up file change watchers
	 */
	private setupFileWatchers(): void {
		// Track document saves as modifications
		const saveWatcher = vscode.workspace.onDidSaveTextDocument(async (doc) => {
			await this.handleFileSave(doc);
		});
		this.disposables.push(saveWatcher);

		// Track file creations
		const createWatcher = vscode.workspace.onDidCreateFiles((event) => {
			for (const file of event.files) {
				this.handleFileCreate(file);
			}
		});
		this.disposables.push(createWatcher);

		// Track file deletions
		const deleteWatcher = vscode.workspace.onDidDeleteFiles((event) => {
			for (const file of event.files) {
				this.handleFileDelete(file);
			}
		});
		this.disposables.push(deleteWatcher);

		// Track text changes for AI detection
		if (this.enableAIDetection) {
			const changeWatcher = vscode.workspace.onDidChangeTextDocument((event) => {
				this.handleTextChange(event);
			});
			this.disposables.push(changeWatcher);
		}
	}

	/**
	 * Handle file save event
	 */
	private async handleFileSave(doc: vscode.TextDocument): Promise<void> {
		const filePath = vscode.workspace.asRelativePath(doc.uri, false);

		// Count lines (approximate changed lines from document length)
		const lineCount = doc.lineCount;

		// Check AI attribution
		const aiAttributed = this.aiAttributedFiles.has(filePath);

		const change: MCPFileChange = {
			file: filePath,
			type: "modified",
			timestamp: Date.now(),
			aiAttributed,
			linesChanged: lineCount, // Approximation
		};

		this.changeQueue.push(change);

		// Clear AI attribution for this file (reset for next change)
		this.aiAttributedFiles.delete(filePath);

		// Check for high-risk file
		if (isRiskFile(filePath, this.riskPatterns)) {
			const reason = getRiskReason(filePath);
			this.pushObservation({
				type: "risk",
				message: `High-risk file modified: ${filePath} (${reason})`,
				timestamp: Date.now(),
				context: { file: filePath, riskLevel: "high", reason },
			});
		}
	}

	/**
	 * Handle file create event
	 */
	private handleFileCreate(uri: vscode.Uri): void {
		const filePath = vscode.workspace.asRelativePath(uri, false);

		const change: MCPFileChange = {
			file: filePath,
			type: "created",
			timestamp: Date.now(),
			aiAttributed: false,
			linesChanged: 0,
		};

		this.changeQueue.push(change);
	}

	/**
	 * Handle file delete event
	 */
	private handleFileDelete(uri: vscode.Uri): void {
		const filePath = vscode.workspace.asRelativePath(uri, false);

		const change: MCPFileChange = {
			file: filePath,
			type: "deleted",
			timestamp: Date.now(),
			aiAttributed: false,
			linesChanged: 0,
		};

		this.changeQueue.push(change);
	}

	/**
	 * Handle text change event (for AI detection and burst observation)
	 */
	private handleTextChange(event: vscode.TextDocumentChangeEvent): void {
		if (!this.signalBridge) {
			return;
		}

		const filePath = vscode.workspace.asRelativePath(event.document.uri, false);

		// Check for burst detection and create observation
		const burstState = this.signalBridge.computeBurst(event.document, event.contentChanges);
		if (burstState.detected && burstState.velocity) {
			// Generate observation for rapid changes
			this.pushObservation({
				type: "suggestion",
				message: `Rapid changes detected on ${filePath} (${burstState.charCount} chars at ${burstState.velocity.toFixed(1)} chars/ms) - consider creating a checkpoint`,
				timestamp: Date.now(),
				context: {
					file: filePath,
					velocity: burstState.velocity,
					charCount: burstState.charCount,
					suggestion: "snapshot",
				},
			});
		}

		// Use SignalBridge for AI detection
		const aiResult = this.signalBridge.detectAI(event.document, event.contentChanges);

		if (aiResult.tool && aiResult.confidence > 0.7) {
			this.aiAttributedFiles.add(filePath);

			// Generate observation for AI-attributed changes
			if (aiResult.confidence > 0.85) {
				this.pushObservation({
					type: "pattern",
					message: `AI tool detected (${aiResult.tool}) modifying ${filePath} with ${Math.round(aiResult.confidence * 100)}% confidence`,
					timestamp: Date.now(),
					context: {
						file: filePath,
						tool: aiResult.tool,
						confidence: aiResult.confidence,
						method: aiResult.method,
					},
				});
			}
		}
	}

	// =========================================================================
	// OBSERVATION MANAGEMENT
	// =========================================================================

	/**
	 * Push an observation to the queue
	 */
	pushObservation(observation: MCPObservation): void {
		this.observationQueue.push(observation);

		// Limit queue size
		if (this.observationQueue.length > 50) {
			this.observationQueue = this.observationQueue.slice(-50);
		}

		// Immediate flush for high-priority observations
		if (observation.type === "risk" || observation.type === "warning") {
			this.flushToMCP().catch(() => {});
		}
	}

	/**
	 * Create and push a warning observation
	 */
	warn(message: string, context?: Record<string, unknown>): void {
		this.pushObservation({
			type: "warning",
			message,
			timestamp: Date.now(),
			context,
		});
	}

	/**
	 * Create and push a suggestion observation
	 */
	suggest(message: string, context?: Record<string, unknown>): void {
		this.pushObservation({
			type: "suggestion",
			message,
			timestamp: Date.now(),
			context,
		});
	}

	/**
	 * Create and push a progress observation
	 */
	progress(message: string): void {
		this.pushObservation({
			type: "progress",
			message,
			timestamp: Date.now(),
		});
	}

	// =========================================================================
	// FLUSH TO MCP
	// =========================================================================

	/**
	 * Start the periodic flush timer
	 */
	private startFlushTimer(): void {
		if (this.flushTimer) {
			return;
		}

		this.flushTimer = setInterval(() => {
			this.flushToMCP().catch((err) => {
				console.warn("[MCPBridge] Periodic flush failed:", err);
			});
		}, this.flushInterval);
	}

	/**
	 * Flush queued observations and changes to MCP server
	 */
	async flushToMCP(): Promise<void> {
		// Skip if nothing to flush
		if (this.observationQueue.length === 0 && this.changeQueue.length === 0) {
			return;
		}

		const payload: BridgePushPayload = {
			observations: [...this.observationQueue],
			changes: [...this.changeQueue],
			workspaceRoot: this.workspaceRoot,
		};

		try {
			const response = await fetch(`${this.mcpEndpoint}/bridge/push`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (response.ok) {
				// Clear queues on success
				this.observationQueue = [];
				this.changeQueue = [];
				this.pushCount++;
				this.lastPushTime = Date.now();
			} else {
				this.failureCount++;
				console.warn(`[MCPBridge] Push failed: ${response.status}`);
			}
		} catch (error) {
			this.failureCount++;
			// Keep queued for retry (silent failure is expected when MCP not running)
		}
	}

	// =========================================================================
	// STATUS
	// =========================================================================

	/**
	 * Get bridge status
	 */
	getStatus(): {
		connected: boolean;
		pushCount: number;
		failureCount: number;
		pendingObservations: number;
		pendingChanges: number;
		lastPushTime: number | null;
	} {
		return {
			connected: this.failureCount === 0 || this.pushCount > 0,
			pushCount: this.pushCount,
			failureCount: this.failureCount,
			pendingObservations: this.observationQueue.length,
			pendingChanges: this.changeQueue.length,
			lastPushTime: this.lastPushTime,
		};
	}

	/**
	 * Check if MCP bridge is reachable
	 */
	async checkHealth(): Promise<boolean> {
		try {
			const response = await fetch(`${this.mcpEndpoint}/bridge/health`, {
				method: "GET",
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}

// =============================================================================
// SINGLETON
// =============================================================================

let mcpBridge: MCPBridge | null = null;

/**
 * Get or create MCPBridge singleton
 */
export function getMCPBridge(config?: MCPBridgeConfig): MCPBridge {
	if (!mcpBridge) {
		mcpBridge = new MCPBridge(config);
	}
	return mcpBridge;
}

/**
 * Dispose MCPBridge singleton
 */
export function disposeMCPBridge(): void {
	if (mcpBridge) {
		mcpBridge.dispose();
		mcpBridge = null;
	}
}
