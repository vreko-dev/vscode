/**
 * MCPClient - Unified MCP communication and telemetry
 *
 * Consolidates:
 * - MCPBridge: Push observations/changes to MCP server
 * - MCPTelemetry: Event tracking with deduplication
 *
 * This handles all MCP communication, circuit breaker logic,
 * and telemetry event emission.
 *
 * @module mcp/MCPClient
 */

// Import shared types from MCP Client SDK
// Note: Some types may not be exported from the built package - these are commented out
// Issue: LIN-0000  -  Fix mcp-client build to generate .d.ts files
import type { CircuitState, MCPClientConfig, MCPClientStatus, MCPFileChange, MCPObservation } from "@vreko/mcp-client";
import * as vscode from "vscode";
import type { SignalBridge } from "../bridges/SignalBridge";
import { TelemetryProxy } from "../services/telemetry-proxy";
import { isMonitorableDocument } from "../utils/documentFilters";
import { logger } from "../utils/logger";
import { MCPStorage } from "./MCPStorage";

// Re-export for backward compatibility
export type { MCPClientConfig, MCPClientStatus, MCPFileChange, MCPObservation };

// =============================================================================
// LOCAL TYPES (VS Code-specific)
// =============================================================================

/**
 * Push payload (VS Code-specific)
 */
interface BridgePushPayload {
	workspaceId: string;
	observations: Array<Omit<MCPObservation, "workspaceId">>;
	changes: Array<Omit<MCPFileChange, "workspaceId">>;
	workspaceRoot: string;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

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

// =============================================================================
// MCP CLIENT
// =============================================================================

/**
 * Workspace-keyed instances
 */
const clientInstances: Map<string, MCPClient> = new Map();

/**
 * MCPClient - Handles MCP communication and telemetry
 */
export class MCPClient {
	private readonly remoteEndpoint: string;
	private readonly localEndpoint: string;
	private readonly useLocalOnly: boolean;
	private readonly flushInterval: number;
	private readonly enableAIDetection: boolean;
	private readonly riskPatterns: string[];
	private readonly workspaceRoot: string;
	private readonly workspaceId: string;

	// Queues
	private observationQueue: MCPObservation[] = [];
	private changeQueue: MCPFileChange[] = [];
	private aiAttributedFiles = new Set<string>();

	// P0-5: Persistent storage for offline-first architecture
	private storage: MCPStorage | null = null;

	// State
	private disposables: vscode.Disposable[] = [];
	private flushTimer: NodeJS.Timeout | null = null;
	private signalBridge: SignalBridge | null = null;
	private isActivationGracePeriod = true;
	private gracePeriodTimeout: NodeJS.Timeout | null = null;

	// Stats
	private pushCount = 0;
	private failureCount = 0;
	private lastSuccessfulEndpoint: "remote" | "local" | null = null;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: Tracked for telemetry/debugging
	private lastPushTime: number | null = null;

	// Circuit breaker
	private circuitState: CircuitState = "closed";
	private consecutiveFailures = 0;
	private lastFailureTime: number | null = null;
	private readonly circuitFailureThreshold = 5;
	private readonly circuitResetTimeout = 30000;
	private readonly fetchTimeout = 5000;

	// Telemetry
	private telemetryProxy: TelemetryProxy | null = null;
	private lastEventTime: Map<string, number> = new Map();
	private readonly dedupeWindowMs = 5000;

	constructor(config: MCPClientConfig = {}) {
		this.remoteEndpoint = config.remoteEndpoint ?? "https://mcp.vreko.dev";
		this.localEndpoint = config.localEndpoint ?? "http://127.0.0.1:3100";
		this.useLocalOnly = config.useLocalOnly ?? false;
		this.flushInterval = config.flushInterval ?? 5000;
		this.enableAIDetection = config.enableAIDetection ?? true;
		this.riskPatterns = config.riskPatterns ?? DEFAULT_RISK_PATTERNS;
		this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
		this.workspaceId = config.workspaceId ?? vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? "default";
	}

	// =========================================================================
	// PUBLIC API - Lifecycle
	// =========================================================================

	/**
	 * Activate the client
	 */
	activate(context: vscode.ExtensionContext, signalBridge?: SignalBridge): void {
		this.signalBridge = signalBridge ?? null;
		this.telemetryProxy = new TelemetryProxy(context);

		// P0-5: Initialize persistent storage and restore queues
		this.storage = new MCPStorage(context.globalState);
		this.restoreQueuesFromStorage();

		this.setupFileWatchers();
		this.startFlushTimer();

		// Activation grace period
		this.gracePeriodTimeout = setTimeout(() => {
			this.isActivationGracePeriod = false;
			this.gracePeriodTimeout = null;
			logger.debug("MCPClient: Activation grace period ended");
		}, 2000);

		logger.debug("MCPClient activated");
	}

	/**
	 * Dispose the client
	 */
	dispose(): void {
		if (this.gracePeriodTimeout) {
			clearTimeout(this.gracePeriodTimeout);
			this.gracePeriodTimeout = null;
		}

		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}

		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];

		this.flushToMCP().catch(() => {
			/* fire-and-forget */
		});
		logger.debug("MCPClient disposed");
	}

	// =========================================================================
	// P0-5: Storage Methods
	// =========================================================================

	/**
	 * Restore queues from persistent storage on activation
	 */
	private restoreQueuesFromStorage(): void {
		if (!this.storage) {
			return;
		}

		const storedObservations = this.storage.loadObservationQueue();
		const storedChanges = this.storage.loadChangeQueue();

		if (storedObservations.length > 0) {
			this.observationQueue.push(...storedObservations);
			logger.debug(`Restored ${storedObservations.length} observations from storage`);
		}

		if (storedChanges.length > 0) {
			this.changeQueue.push(...storedChanges);
			logger.debug(`Restored ${storedChanges.length} changes from storage`);
		}
	}

	/**
	 * Persist current queues to storage
	 */
	private async persistQueues(): Promise<void> {
		if (!this.storage) {
			return;
		}

		await Promise.all([
			this.storage.saveObservationQueue(this.observationQueue),
			this.storage.saveChangeQueue(this.changeQueue),
		]);
	}

	// =========================================================================
	// PUBLIC API - Observations
	// =========================================================================

	/**
	 * Push an observation
	 */
	pushObservation(observation: MCPObservation): void {
		this.observationQueue.push(observation);

		if (this.observationQueue.length > 50) {
			this.observationQueue = this.observationQueue.slice(-50);
		}

		// P0-5: Persist to storage for durability
		this.persistQueues().catch(() => {
			/* fire-and-forget */
		});

		// Immediate flush for high-priority
		if (observation.type === "risk" || observation.type === "warning") {
			this.flushToMCP().catch(() => {
				/* fire-and-forget */
			});
		}
	}

	warn(message: string, context?: Record<string, unknown>): void {
		this.pushObservation({
			type: "warning",
			message,
			timestamp: Date.now(),
			context,
			workspaceId: this.workspaceId,
		});
	}

	suggest(message: string, context?: Record<string, unknown>): void {
		this.pushObservation({
			type: "suggestion",
			message,
			timestamp: Date.now(),
			context,
			workspaceId: this.workspaceId,
		});
	}

	// =========================================================================
	// PUBLIC API - Telemetry
	// =========================================================================

	/**
	 * Track event with deduplication
	 */
	trackEvent(eventName: string, properties?: Record<string, unknown>): void {
		const eventKey = `${eventName}.${JSON.stringify(properties)}`;
		const lastTime = this.lastEventTime.get(eventKey);

		if (lastTime && Date.now() - lastTime < this.dedupeWindowMs) {
			return;
		}

		this.lastEventTime.set(eventKey, Date.now());

		if (this.telemetryProxy) {
			this.telemetryProxy.trackEvent(eventName, properties);
		}
	}

	/**
	 * Track connection state change
	 */
	trackConnectionStateChange(state: string, options?: Record<string, unknown>): void {
		this.trackEvent("mcp.connection.state_changed", { state, ...options });
	}

	/**
	 * Track circuit breaker change
	 */
	trackCircuitBreakerChange(state: CircuitState, options?: Record<string, unknown>): void {
		this.trackEvent("mcp.bridge.circuit_changed", { state, ...options });
	}

	// =========================================================================
	// PUBLIC API - Status
	// =========================================================================

	getWorkspaceId(): string {
		return this.workspaceId;
	}

	/**
	 * Get formatted workspace ID for server communication
	 *
	 * Uses unified workspace identity algorithm for cross-surface consistency.
	 * Returns the workspace path hash directly (12-char hex).
	 */
	getFormattedWorkspaceId(): string {
		// Return unified workspace ID directly (already 12-char hex from generateWorkspaceId)
		return this.workspaceId;
	}

	getStatus(): MCPClientStatus {
		const status: MCPClientStatus = {
			connected: this.failureCount === 0 || this.pushCount > 0,
			pushCount: this.pushCount,
			failureCount: this.failureCount,
			pendingObservations: this.observationQueue.length,
			pendingChanges: this.changeQueue.length,
			circuitState: this.circuitState,
			lastSuccessfulEndpoint: this.lastSuccessfulEndpoint,
		};

		// P0-5: Add storage stats if available
		if (this.storage) {
			const storageStats = this.storage.getStats();
			logger.debug("MCPClient status", { status, storage: storageStats });
		}

		return status;
	}

	getCircuitState(): { state: CircuitState; consecutiveFailures: number; nextRetryIn?: number } {
		const result: { state: CircuitState; consecutiveFailures: number; nextRetryIn?: number } = {
			state: this.circuitState,
			consecutiveFailures: this.consecutiveFailures,
		};

		if (this.circuitState === "open" && this.lastFailureTime) {
			const remaining = this.circuitResetTimeout - (Date.now() - this.lastFailureTime);
			if (remaining > 0) {
				result.nextRetryIn = remaining;
			}
		}

		return result;
	}

	// =========================================================================
	// PUBLIC API - Circuit Breaker Control
	// =========================================================================

	forceOpenCircuit(reason?: string): void {
		this.circuitState = "open";
		this.lastFailureTime = Date.now();
		logger.warn("Circuit breaker forced open", { reason });
	}

	forceCloseCircuit(reason?: string): void {
		this.circuitState = "closed";
		this.consecutiveFailures = 0;
		this.lastFailureTime = null;
		logger.info("Circuit breaker forced closed", { reason });
	}

	// =========================================================================
	// PRIVATE - File Watchers
	// =========================================================================

	private setupFileWatchers(): void {
		const saveWatcher = vscode.workspace.onDidSaveTextDocument(async (doc) => {
			await this.handleFileSave(doc);
		});
		this.disposables.push(saveWatcher);

		const createWatcher = vscode.workspace.onDidCreateFiles((event) => {
			for (const file of event.files) {
				this.handleFileCreate(file);
			}
		});
		this.disposables.push(createWatcher);

		const deleteWatcher = vscode.workspace.onDidDeleteFiles((event) => {
			for (const file of event.files) {
				this.handleFileDelete(file);
			}
		});
		this.disposables.push(deleteWatcher);

		if (this.enableAIDetection) {
			const changeWatcher = vscode.workspace.onDidChangeTextDocument((event) => {
				if (!isMonitorableDocument(event.document)) {
					return;
				}
				this.handleTextChange(event);
			});
			this.disposables.push(changeWatcher);
		}
	}

	private async handleFileSave(doc: vscode.TextDocument): Promise<void> {
		const filePath = vscode.workspace.asRelativePath(doc.uri, false);

		if (!doc.isDirty) {
			this.aiAttributedFiles.delete(filePath);
			return;
		}

		const aiAttributed = this.aiAttributedFiles.has(filePath);

		this.changeQueue.push({
			file: filePath,
			type: "modified",
			timestamp: Date.now(),
			aiAttributed,
			linesChanged: doc.lineCount,
			workspaceId: this.workspaceId,
		});

		// P0-5: Persist changes for durability
		this.persistQueues().catch(() => {
			/* fire-and-forget */
		});

		this.aiAttributedFiles.delete(filePath);

		if (this.isRiskFile(filePath)) {
			this.pushObservation({
				type: "risk",
				message: `High-risk file modified: ${filePath}`,
				timestamp: Date.now(),
				context: { file: filePath },
				workspaceId: this.workspaceId,
			});
		}
	}

	private handleFileCreate(uri: vscode.Uri): void {
		const filePath = vscode.workspace.asRelativePath(uri, false);
		this.changeQueue.push({
			file: filePath,
			type: "created",
			timestamp: Date.now(),
			aiAttributed: false,
			linesChanged: 0,
			workspaceId: this.workspaceId,
		});

		// P0-5: Persist changes for durability
		this.persistQueues().catch(() => {
			/* fire-and-forget */
		});
	}

	private handleFileDelete(uri: vscode.Uri): void {
		const filePath = vscode.workspace.asRelativePath(uri, false);
		this.changeQueue.push({
			file: filePath,
			type: "deleted",
			timestamp: Date.now(),
			aiAttributed: false,
			linesChanged: 0,
			workspaceId: this.workspaceId,
		});

		// P0-5: Persist changes for durability
		this.persistQueues().catch(() => {
			/* fire-and-forget */
		});
	}

	private handleTextChange(event: vscode.TextDocumentChangeEvent): void {
		if (!this.signalBridge || this.isActivationGracePeriod) {
			return;
		}

		const filePath = vscode.workspace.asRelativePath(event.document.uri, false);
		const aiResult = this.signalBridge.detectAI(event.document, event.contentChanges);

		if (aiResult.tool && aiResult.confidence > 0.7) {
			this.aiAttributedFiles.add(filePath);

			if (aiResult.confidence > 0.85) {
				this.pushObservation({
					type: "pattern",
					message: `AI tool detected (${aiResult.tool}) modifying ${filePath}`,
					timestamp: Date.now(),
					context: { file: filePath, tool: aiResult.tool, confidence: aiResult.confidence },
					workspaceId: this.workspaceId,
				});
			}
		}
	}

	private isRiskFile(filePath: string): boolean {
		const lowerPath = filePath.toLowerCase();
		const keywords = [
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
		return keywords.some((k) => lowerPath.includes(k));
	}

	// =========================================================================
	// PRIVATE - Flush Logic
	// =========================================================================

	private startFlushTimer(): void {
		if (this.flushTimer) {
			return;
		}

		this.flushTimer = setInterval(() => {
			this.flushToMCP().catch((err) => {
				logger.warn("MCPClient periodic flush failed", { error: err });
			});
		}, this.flushInterval);
	}

	async flushToMCP(): Promise<void> {
		if (this.observationQueue.length === 0 && this.changeQueue.length === 0) {
			return;
		}

		if (!this.canAttemptPush()) {
			return;
		}

		const payload: BridgePushPayload = {
			workspaceId: this.getFormattedWorkspaceId(),
			observations: this.observationQueue.map(({ workspaceId: _ws, ...rest }) => rest),
			changes: this.changeQueue.map(({ workspaceId: _ws, ...rest }) => rest),
			workspaceRoot: this.workspaceRoot,
		};

		let success = false;

		if (!this.useLocalOnly) {
			success = await this.pushToEndpoint(this.remoteEndpoint, payload, "remote");
		}

		if (!success) {
			success = await this.pushToEndpoint(this.localEndpoint, payload, "local");
		}

		if (success) {
			this.observationQueue = [];
			this.changeQueue = [];
			this.pushCount++;
			this.lastPushTime = Date.now();
			this.onPushSuccess();

			// P0-5: Clear persistent storage after successful push
			if (this.storage) {
				await Promise.all([
					this.storage.clearObservationQueue(),
					this.storage.clearChangeQueue(),
					this.storage.updateLastSyncAt(),
				]);
			}
		} else {
			this.onPushFailure();
			this.failureCount++;
			// P0-5: Persist failed queues for retry after restart
			await this.persistQueues();
		}
	}

	private async pushToEndpoint(
		endpoint: string,
		payload: BridgePushPayload,
		type: "remote" | "local",
	): Promise<boolean> {
		try {
			const response = await fetch(`${endpoint}/bridge/push`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(this.fetchTimeout),
			});

			if (response.ok) {
				this.lastSuccessfulEndpoint = type;
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}

	private canAttemptPush(): boolean {
		if (this.circuitState === "closed") {
			return true;
		}
		if (this.circuitState === "half-open") {
			return true;
		}

		if (this.circuitState === "open" && this.lastFailureTime) {
			if (Date.now() - this.lastFailureTime >= this.circuitResetTimeout) {
				this.circuitState = "half-open";
				return true;
			}
		}

		return false;
	}

	private onPushSuccess(): void {
		if (this.circuitState !== "closed") {
			this.trackCircuitBreakerChange("closed", { previousState: this.circuitState });
		}
		this.circuitState = "closed";
		this.consecutiveFailures = 0;
	}

	private onPushFailure(): void {
		this.consecutiveFailures++;
		this.lastFailureTime = Date.now();

		if (this.circuitState === "half-open") {
			this.circuitState = "open";
			this.trackCircuitBreakerChange("open", { previousState: "half-open" });
		} else if (this.consecutiveFailures >= this.circuitFailureThreshold && this.circuitState === "closed") {
			this.circuitState = "open";
			this.trackCircuitBreakerChange("open", { previousState: "closed" });
		}
	}
}

// =============================================================================
// WORKSPACE-KEYED ACCESS
// =============================================================================

/**
 * Get or create MCPClient for a workspace
 */
export function getMCPClient(workspaceId: string, config?: MCPClientConfig): MCPClient {
	let instance = clientInstances.get(workspaceId);
	if (!instance) {
		instance = new MCPClient({ ...config, workspaceId });
		clientInstances.set(workspaceId, instance);
	}
	return instance;
}

/**
 * Dispose MCPClient for a workspace
 */
export function disposeMCPClient(workspaceId: string): void {
	const instance = clientInstances.get(workspaceId);
	if (instance) {
		instance.dispose();
		clientInstances.delete(workspaceId);
	}
}

/**
 * Dispose all MCPClient instances
 */
export function disposeAllMCPClients(): void {
	const ids = Array.from(clientInstances.keys());
	for (const id of ids) {
		const instance = clientInstances.get(id);
		if (instance) {
			instance.dispose();
			clientInstances.delete(id);
		}
	}
}

/**
 * Return all currently active workspace IDs
 */
export function getActiveMCPClientWorkspaces(): string[] {
	return Array.from(clientInstances.keys());
}
