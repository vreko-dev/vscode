/**
 * IntelligenceBridge - Central router for Intelligence integration
 *
 * @fileoverview EventBus subscriber that routes extension events to Intelligence.
 * Following TDD Red-Green-Refactor pattern - this is the GREEN phase implementation.
 *
 * ## Architecture (from INTELLIGENCE_INTEGRATION_PLAN.md)
 *
 * ```
 * Components emit events → EventBus → IntelligenceBridge → IntelligenceService
 * ```
 *
 * ## Design Decisions
 *
 * 1. **EventBus Subscriber Pattern**: Instead of direct calls from each component,
 *    IntelligenceBridge subscribes to EventBus and routes to Intelligence.
 *
 * 2. **Singleton Per Workspace**: Following codebase pattern from SnapBack learnings.
 *
 * 3. **Async Handling**: All async operations use `void` prefix per codebase convention.
 *
 * ## Performance Constraints (from CLAUDE.md)
 *
 * - Bridge init must be async, non-blocking (<500ms activation budget)
 * - Save latency <100ms (all signal computation batched)
 * - Memory <200MB (no unbounded caches)
 *
 * @see apps/vscode/src/integration/INTELLIGENCE_INTEGRATION_PLAN.md
 * @module bridges/IntelligenceBridge
 */

import type { Intelligence } from "@snapback/intelligence";
import type { VitalsSnapshot, WorkspaceVitals } from "@snapback/intelligence/vitals";
import type * as vscode from "vscode";
import { getIntelligence, getWorkspaceVitals } from "../services/IntelligenceService";
import { logger } from "../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

/**
 * EventBus interface for subscription
 */
interface EventBusLike {
	on(event: string, listener: (...args: unknown[]) => void): void;
	off(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Analysis result for Intelligence recording
 */
export interface AnalysisResultInput {
	filePath: string;
	score: number;
	severity: "low" | "medium" | "high" | "critical";
	factors: string[];
	passed: boolean;
}

/**
 * User behavior event for calibration
 */
export interface UserBehaviorInput {
	type: "snapshot_created" | "restore_performed" | "ai_session";
	userInitiated: boolean;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
	files?: string[];
}

/**
 * Bridge configuration options
 */
export interface IntelligenceBridgeOptions {
	workspaceFolder?: vscode.WorkspaceFolder;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * IntelligenceBridge - EventBus subscriber for Intelligence integration
 *
 * Responsibilities:
 * - Subscribe to EventBus events (SNAPSHOT_CREATED, ANALYSIS_COMPLETE, etc.)
 * - Route events to IntelligenceService
 * - Provide unified API for vitals access
 * - Manage lifecycle and cleanup
 */
export class IntelligenceBridge implements vscode.Disposable {
	private vitals: WorkspaceVitals | null = null;
	private intelligence: Intelligence | null = null;
	private eventBus: EventBusLike | null = null;
	private disposables: vscode.Disposable[] = [];
	private initialized = false;
	private workspaceFolder: vscode.WorkspaceFolder | undefined;

	// Event handlers bound for cleanup
	private boundHandlers: Map<string, (...args: unknown[]) => void> = new Map();

	constructor(options: IntelligenceBridgeOptions = {}) {
		this.workspaceFolder = options.workspaceFolder;
	}

	// =========================================================================
	// INITIALIZATION
	// =========================================================================

	/**
	 * Initialize the bridge - connects to Intelligence and subscribes to EventBus
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			// Get Intelligence instance (singleton per workspace)
			this.intelligence = await getIntelligence(this.workspaceFolder);

			// Get WorkspaceVitals instance
			this.vitals = await getWorkspaceVitals(this.workspaceFolder);

			// Subscribe to EventBus if available
			this.subscribeToEventBus();

			this.initialized = true;
			logger.info("IntelligenceBridge initialized");
		} catch (error) {
			logger.error("Failed to initialize IntelligenceBridge", error as Error);
			// Don't throw - allow extension to continue without Intelligence
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

	/**
	 * Subscribe to EventBus events
	 */
	private subscribeToEventBus(): void {
		try {
			// Dynamic import to avoid circular dependencies
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { getEventBus } = require("../events/SnapBackEventBus");
			this.eventBus = getEventBus();

			if (!this.eventBus) {
				logger.debug("EventBus not available, skipping subscription");
				return;
			}

			// Subscribe to events
			this.subscribeToEvent("SNAPSHOT_CREATED", this.handleSnapshotCreated.bind(this));
			this.subscribeToEvent("ANALYSIS_COMPLETE", this.handleAnalysisComplete.bind(this));
			this.subscribeToEvent("SESSION_STARTED", this.handleSessionStarted.bind(this));
			this.subscribeToEvent("SESSION_ENDED", this.handleSessionEnded.bind(this));

			logger.debug("IntelligenceBridge subscribed to EventBus");
		} catch (error) {
			logger.debug("EventBus not available", { error: (error as Error).message });
		}
	}

	/**
	 * Subscribe to a single event and track handler for cleanup
	 */
	private subscribeToEvent(event: string, handler: (...args: unknown[]) => void): void {
		if (!this.eventBus) return;

		this.eventBus.on(event, handler);
		this.boundHandlers.set(event, handler);
	}

	/**
	 * Unsubscribe from all EventBus events
	 */
	private unsubscribeFromEventBus(): void {
		if (!this.eventBus) return;

		for (const [event, handler] of this.boundHandlers) {
			this.eventBus.off(event, handler);
		}
		this.boundHandlers.clear();
	}

	// =========================================================================
	// EVENT HANDLERS
	// =========================================================================

	private handleSnapshotCreated(_data: unknown): void {
		// Record behavior for calibration
		this.recordUserBehavior({
			type: "snapshot_created",
			userInitiated: true,
		});
	}

	private handleAnalysisComplete(_data: unknown): void {
		// Analysis results are recorded via recordAnalysisResult API
	}

	private handleSessionStarted(_data: unknown): void {
		// Session management via startSession API
	}

	private handleSessionEnded(_data: unknown): void {
		// Session management via endSession API
	}

	// =========================================================================
	// VITALS ACCESS
	// =========================================================================

	/**
	 * Get current vitals snapshot
	 */
	getVitalsSnapshot(): VitalsSnapshot | null {
		if (!this.vitals) return null;
		return this.vitals.current();
	}

	/**
	 * Get threshold multiplier for adaptive decisions
	 */
	getThresholdMultiplier(): number {
		if (!this.vitals) return 1.0;
		return this.vitals.getThresholdMultiplier();
	}

	/**
	 * Get agent guidance for AI tools
	 */
	getAgentGuidance(): unknown {
		if (!this.vitals) return null;
		return this.vitals.getAgentGuidance();
	}

	// =========================================================================
	// ANALYSIS RECORDING
	// =========================================================================

	/**
	 * Record analysis result for learning
	 */
	async recordAnalysisResult(result: AnalysisResultInput): Promise<void> {
		if (!this.intelligence || !this.vitals) return;

		// Record as pseudo-test result for behavioral metadata
		this.vitals.recordTest(result.passed);

		// Report violations for critical/high severity
		if (result.severity === "critical" || result.severity === "high") {
			for (const factor of result.factors) {
				await this.intelligence.reportViolation({
					type: `analysis-${result.severity}`,
					file: result.filePath,
					message: factor,
					reason: `Detected during save-time analysis (score: ${result.score})`,
					prevention: "Review AI-generated code before saving",
				});
			}
		}

		// Record learning if this is a repeated pattern
		if (result.factors.length > 0 && result.severity !== "low") {
			await this.intelligence.recordLearning({
				type: "pitfall",
				trigger: `${result.severity} severity in ${result.filePath.split("/").pop()}`,
				action: `Check for: ${result.factors.slice(0, 2).join(", ")}`,
				source: "analysis-coordinator",
			});
		}
	}

	// =========================================================================
	// SESSION MANAGEMENT
	// =========================================================================

	/**
	 * Start Intelligence session when SDK session starts
	 */
	startSession(sessionId: string, metadata?: SessionMetadata): void {
		if (!this.intelligence) return;

		this.intelligence.startSession(sessionId, {
			workspaceId: this.workspaceFolder?.uri.toString(),
			tags: metadata?.files?.slice(0, 5), // First 5 files as tags
		});
	}

	/**
	 * End Intelligence session when SDK session ends
	 */
	endSession(sessionId: string): void {
		if (!this.intelligence) return;
		this.intelligence.endSession(sessionId);
	}

	// =========================================================================
	// USER BEHAVIOR RECORDING
	// =========================================================================

	/**
	 * Record user behavior for threshold calibration
	 */
	recordUserBehavior(event: UserBehaviorInput): void {
		if (!this.vitals) return;

		if (event.type === "snapshot_created") {
			this.vitals.recordBehavior(event.userInitiated);
		}
	}

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	/**
	 * Dispose the bridge and cleanup resources
	 */
	dispose(): void {
		this.unsubscribeFromEventBus();

		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];

		this.intelligence = null;
		this.vitals = null;
		this.eventBus = null;
		this.initialized = false;

		logger.debug("IntelligenceBridge disposed");
	}
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

/**
 * Module-level singleton instance
 * Pattern from SnapBack learnings: module-level variables for race condition handling
 */
let bridgeInstance: IntelligenceBridge | null = null;

/**
 * Get the IntelligenceBridge singleton
 */
export function getIntelligenceBridge(): IntelligenceBridge {
	if (!bridgeInstance) {
		bridgeInstance = new IntelligenceBridge();
	}
	return bridgeInstance;
}

/**
 * Initialize the IntelligenceBridge singleton
 */
export async function initializeIntelligenceBridge(
	workspaceFolder?: vscode.WorkspaceFolder,
): Promise<IntelligenceBridge> {
	if (!bridgeInstance) {
		bridgeInstance = new IntelligenceBridge({ workspaceFolder });
	}

	await bridgeInstance.initialize();
	return bridgeInstance;
}

/**
 * Dispose the IntelligenceBridge singleton
 */
export function disposeIntelligenceBridge(): void {
	if (bridgeInstance) {
		bridgeInstance.dispose();
		bridgeInstance = null;
	}
}
