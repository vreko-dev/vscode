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

import { createHash } from "node:crypto";
import * as vscode from "vscode";
import type { SignalBridge } from "../bridges/SignalBridge";
import { TelemetryProxy } from "../services/telemetry-proxy";
import { isMonitorableDocument } from "../utils/documentFilters";
import { logger } from "../utils/logger";

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
	workspaceId: string;
}

/**
 * Observation for proactive hints
 */
export interface MCPObservation {
	type: "risk" | "pattern" | "suggestion" | "warning" | "progress";
	message: string;
	timestamp: number;
	context?: Record<string, unknown>;
	workspaceId: string;
}

/**
 * MCPClient configuration
 */
export interface MCPClientConfig {
	/** Remote MCP bridge endpoint */
	remoteEndpoint?: string;
	/** Local MCP bridge endpoint for fallback */
	localEndpoint?: string;
	/** Flush interval in ms */
	flushInterval?: number;
	/** Enable AI attribution detection */
	enableAIDetection?: boolean;
	/** Risk file patterns */
	riskPatterns?: string[];
	/** Workspace ID */
	workspaceId?: string;
	/** Use local endpoint only */
	useLocalOnly?: boolean;
}

/**
 * Circuit breaker state
 */
type CircuitState = "closed" | "open" | "half-open";

/**
 * Push payload
 */
interface BridgePushPayload {
	workspaceId: string;
	observations: Array<Omit<MCPObservation, "workspaceId">>;
	changes: Array<Omit<MCPFileChange, "workspaceId">>;
	workspaceRoot: string;
}

/**
 * Client status
 */
export interface MCPClientStatus {
	connected: boolean;
	pushCount: number;
	failureCount: number;
	pendingObservations: number;
	pendingChanges: number;
	circuitState: CircuitState;
	lastSuccessfulEndpoint: "remote" | "local" | null;
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
		this.remoteEndpoint = config.remoteEndpoint ?? "https://snapback-mcp.fly.dev";
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

		this.flushToMCP().catch(() => {});
		logger.debug("MCPClient disposed");
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

		// Immediate flush for high-priority
		if (observation.type === "risk" || observation.type === "warning") {
			this.flushToMCP().catch(() => {});
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

	getFormattedWorkspaceId(): string {
		const hash = createHash("md5").update(this.workspaceId).digest("hex");
		return `ws_${hash}`;
	}

	getStatus(): MCPClientStatus {
		return {
			connected: this.failureCount === 0 || this.pushCount > 0,
			pushCount: this.pushCount,
			failureCount: this.failureCount,
			pendingObservations: this.observationQueue.length,
			pendingChanges: this.changeQueue.length,
			circuitState: this.circuitState,
			lastSuccessfulEndpoint: this.lastSuccessfulEndpoint,
		};
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
		} else {
			this.onPushFailure();
			this.failureCount++;
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
