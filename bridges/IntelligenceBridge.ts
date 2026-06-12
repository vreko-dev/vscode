/**
 * IntelligenceBridge - Central router for Intelligence integration
 *
 * @fileoverview EventBus subscriber that routes extension events to Intelligence.
 * Implemented using TDD Red-Green-Refactor methodology.
 *
 * ## Architecture
 *
 * ```
 * Components emit events → EventBus → IntelligenceBridge → DaemonBridge → Daemon
 * ```
 *
 * @see apps/vscode/src/services/DaemonBridge.ts
 * @module bridges/IntelligenceBridge
 */

import type { VitalsSnapshot } from "@vreko/contracts";
import type * as vscode from "vscode";
import { getCurrentWorkspaceId, getDaemonBridge } from "../services/DaemonBridge";
import { reportViolation } from "../services/IntelligenceService";
import type { EventBusLike } from "../types/event-bus";
import { logger } from "../utils/logger";

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
// TYPES
// =============================================================================

export interface AnalysisResultInput {
	filePath: string;
	score: number;
	severity: "low" | "medium" | "high" | "critical";
	factors: string[];
	passed: boolean;
}

export interface UserBehaviorInput {
	type: "snapshot_created" | "restore_performed" | "ai_session";
	userInitiated: boolean;
}

export interface SessionMetadata {
	files?: string[];
}

export interface IntelligenceBridgeOptions {
	workspaceFolder?: vscode.WorkspaceFolder;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * IntelligenceBridge - EventBus subscriber for Intelligence integration
 *
 * Now uses DaemonBridge for all intelligence operations.
 */
export class IntelligenceBridge implements vscode.Disposable {
	private vitals: WorkspaceVitalsProxy | null = null;
	private intelligenceReady = false;
	private eventBus: EventBusLike | null = null;
	private disposables: vscode.Disposable[] = [];
	private initialized = false;
	private workspaceFolder: vscode.WorkspaceFolder | undefined;
	private workspaceId: string | null = null;

	private boundHandlers: Map<string, (...args: unknown[]) => void> = new Map();

	constructor(options: IntelligenceBridgeOptions = {}) {
		this.workspaceFolder = options.workspaceFolder;
	}

	// =========================================================================
	// INITIALIZATION
	// =========================================================================

	/**
	 * Initialize the bridge - connects to Intelligence via DaemonBridge
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			// Get workspace ID
			this.workspaceId = this.workspaceFolder?.uri?.fsPath ?? getCurrentWorkspaceId();

			if (this.workspaceId) {
				const bridge = getDaemonBridge(this.workspaceId);

				// Initialize intelligence on daemon
				await bridge
					.request("intelligence.initialize", {
						workspace: this.workspaceId,
					})
					.catch(() => {
						/* fire-and-forget */
					});

				this.intelligenceReady = true;

				// Create vitals proxy
				this.vitals = {
					current: (): VitalsSnapshot | null => null,
					getThresholdMultiplier: (): number => 1.0,
					getAgentGuidance: (): unknown => null,
					recordBehavior: (userInitiated: boolean): void => {
						if (!this.workspaceId) {
							return;
						}
						void getDaemonBridge(this.workspaceId)
							.request("intelligence.recordBehavior", {
								workspace: this.workspaceId,
								userInitiated,
							})
							.catch(() => {
								/* fire-and-forget */
							});
					},
					recordEdit: (linesAdded: number, linesDeleted: number): void => {
						if (!this.workspaceId) {
							return;
						}
						void getDaemonBridge(this.workspaceId)
							.request("intelligence.recordEdit", {
								workspace: this.workspaceId,
								linesAdded,
								linesDeleted,
							})
							.catch(() => {
								/* fire-and-forget */
							});
					},
				};
			}

			this.subscribeToEventBus();
			this.initialized = true;
			logger.info("IntelligenceBridge initialized via DaemonBridge");
		} catch (error) {
			logger.error("Failed to initialize IntelligenceBridge", error as Error);
		}
	}

	/**
	 * Check if bridge is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	// =========================================================================
	// EVENTBUS SUBSCRIPTION
	// =========================================================================

	private subscribeToEventBus(): void {
		// EventBus wiring removed: VrekoEventBus was replaced by LocalEventBus during
		// the thin-client migration. All intelligence events are now routed via DaemonBridge
		// (request/response over IPC). If direct EventBus subscription is needed in future,
		// inject a LocalEventBus instance via IntelligenceBridgeOptions.eventBus.
		logger.debug("IntelligenceBridge: EventBus subscription skipped (handled via DaemonBridge)");
	}

	private unsubscribeFromEventBus(): void {
		if (!this.eventBus) {
			return;
		}
		for (const [event, handler] of this.boundHandlers) {
			this.eventBus.off(event, handler);
		}
		this.boundHandlers.clear();
	}

	// =========================================================================
	// VITALS ACCESS
	// =========================================================================

	getVitalsSnapshot(): VitalsSnapshot | null {
		if (!this.vitals) {
			return null;
		}
		return this.vitals.current();
	}

	getThresholdMultiplier(): number {
		if (!this.vitals) {
			return 1.0;
		}
		return this.vitals.getThresholdMultiplier();
	}

	getAgentGuidance(): unknown {
		if (!this.vitals) {
			return null;
		}
		return this.vitals.getAgentGuidance();
	}

	// =========================================================================
	// ANALYSIS RECORDING
	// =========================================================================

	async recordAnalysisResult(result: AnalysisResultInput): Promise<void> {
		if (!this.intelligenceReady || !this.vitals) {
			return;
		}

		if (result.severity === "critical" || result.severity === "high") {
			for (const factor of result.factors) {
				await reportViolation(
					{
						type: `analysis-${result.severity}`,
						file: result.filePath,
						message: factor,
						reason: `Detected during save-time analysis (score: ${result.score})`,
						prevention: "Review AI-generated code before saving",
					},
					this.workspaceFolder,
				);
			}
		}
	}

	// =========================================================================
	// SESSION MANAGEMENT
	// =========================================================================

	startSession(_sessionId: string, _metadata?: SessionMetadata): void {
		logger.debug("Session start handled by MCP server");
	}

	endSession(_sessionId: string): void {
		logger.debug("Session end handled by MCP server");
	}

	// =========================================================================
	// USER BEHAVIOR RECORDING
	// =========================================================================

	recordUserBehavior(event: UserBehaviorInput): void {
		if (!this.vitals) {
			return;
		}

		if (event.type === "snapshot_created") {
			this.vitals.recordBehavior(event.userInitiated);
		}
	}

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	dispose(): void {
		this.unsubscribeFromEventBus();

		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];

		this.intelligenceReady = false;
		this.vitals = null;
		this.eventBus = null;
		this.initialized = false;

		logger.debug("IntelligenceBridge disposed");
	}
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let bridgeInstance: IntelligenceBridge | null = null;

export function getIntelligenceBridge(): IntelligenceBridge {
	if (!bridgeInstance) {
		bridgeInstance = new IntelligenceBridge();
	}
	return bridgeInstance;
}

export async function initializeIntelligenceBridge(
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<IntelligenceBridge> {
	if (!bridgeInstance) {
		bridgeInstance = new IntelligenceBridge({ workspaceFolder });
	}
	await bridgeInstance.initialize();
	return bridgeInstance;
}

export function disposeIntelligenceBridge(): void {
	if (bridgeInstance) {
		bridgeInstance.dispose();
		bridgeInstance = null;
	}
}
