/**
 * SignalBridge - Route signal detection operations to V1 or V2 based on feature flag
 *
 * DESIGN GOALS:
 * - Transparent routing: Same signal detection interface
 * - Feature flagged: `snapback.useV2Engine` controls routing
 * - Wraps @snapback/engine signals for VS Code context
 * - Zero breaking changes: Existing code continues to work
 *
 * PHASE 3 IMPLEMENTATION:
 * - computeBurst(): Detect rapid code changes (AI paste detection)
 * - detectAI(): Detect AI tool usage from document changes
 * - Route to V1 (existing detectors) or V2 (@snapback/engine)
 * - Convert VS Code TextDocument to engine input format
 *
 * TARGET: ~280 LOC
 */

import { AIDetector, BurstDetector, type BurstEvent } from "@snapback/engine/signals";
import * as vscode from "vscode";
import { BurstDetector as V1BurstDetector } from "../engine/BurstDetector";
import type { ConfigStore } from "../storage/ConfigStore";

/**
 * Burst state indicating if rapid changes detected
 */
export interface BurstState {
	/** Whether a burst was detected */
	detected: boolean;
	/** Velocity in chars/ms (if burst detected) */
	velocity?: number;
	/** Total characters changed */
	charCount?: number;
	/** File path */
	filePath?: string;
}

/**
 * AI detection result with tool identification
 */
export interface AIDetectionResult {
	/** AI tool detected (null if no detection) */
	tool: string | null;
	/** Confidence score (0-1) */
	confidence: number;
	/** Detection method that triggered */
	method: "extension" | "velocity" | "pattern" | "combined" | null;
	/** Indicators that contributed to detection */
	indicators?: string[];
}

/**
 * Configuration for SignalBridge
 */
export interface SignalBridgeOptions {
	/** ConfigStore for V1 burst detector */
	configStore: ConfigStore;
	/** Feature flag: use V2 engine (optional, reads from VS Code config if not provided) */
	useV2Engine?: boolean;
}

/**
 * SignalBridge routes signal detection operations to V1 or V2 based on feature flag
 *
 * Usage:
 * ```typescript
 * const bridge = new SignalBridge({
 *   configStore: storageManager.getConfigStore(),
 *   useV2Engine: vscode.workspace.getConfiguration("snapback").get("useV2Engine", false),
 * });
 *
 * // Compute burst state from document changes
 * const burstState = bridge.computeBurst(document, changes);
 *
 * // Detect AI tool usage
 * const aiResult = bridge.detectAI(document, changes);
 * ```
 */
export class SignalBridge {
	private useV2: boolean;
	private configStore: ConfigStore;

	// V1 detectors (existing VS Code-specific)
	private v1BurstDetector: V1BurstDetector | null = null;

	// V2 detectors (@snapback/engine - transport-agnostic)
	private v2BurstDetector: BurstDetector | null = null;
	private v2AIDetector: AIDetector | null = null;

	// State tracking for burst context
	private lastBurstEvent: BurstEvent | null = null;

	constructor(options: SignalBridgeOptions) {
		this.configStore = options.configStore;

		// Read feature flag from options or VS Code config
		this.useV2 = options.useV2Engine ?? vscode.workspace.getConfiguration("snapback").get("useV2Engine", false);

		// Initialize detectors based on flag
		if (this.useV2) {
			// Initialize V2 engine detectors
			this.v2BurstDetector = new BurstDetector({
				threshold: 30, // 30 chars per 100ms
				windowMs: 100,
				cooldownMs: 500,
			});

			this.v2AIDetector = new AIDetector({
				velocityThreshold: 10, // 10 chars/ms
				minCharsForVelocity: 100,
				enablePatternMatching: true,
			});

			console.log("[SignalBridge] Initialized V2 engine detectors");
		} else {
			// Initialize V1 burst detector
			this.v1BurstDetector = new V1BurstDetector(this.configStore, () => {
				// No-op burst callback (we handle detection in computeBurst)
			});

			console.log("[SignalBridge] Initialized V1 detectors");
		}
	}

	// ============================================
	// Public API
	// ============================================

	/**
	 * Compute burst state from document changes
	 * @param document The changed document
	 * @param changes The content changes
	 * @returns BurstState indicating if rapid changes detected
	 */
	computeBurst(document: vscode.TextDocument, changes: readonly vscode.TextDocumentContentChangeEvent[]): BurstState {
		if (!this.useV2) {
			return this.v1ComputeBurst(document, changes);
		}
		return this.v2ComputeBurst(document, changes);
	}

	/**
	 * Detect AI tool usage from document changes
	 * @param document The changed document
	 * @param changes The content changes
	 * @returns AIDetectionResult with tool identification
	 */
	detectAI(
		document: vscode.TextDocument,
		changes: readonly vscode.TextDocumentContentChangeEvent[],
	): AIDetectionResult {
		if (!this.useV2) {
			return this.v1DetectAI(document, changes);
		}
		return this.v2DetectAI(document, changes);
	}

	/**
	 * Reset detection state (e.g., on session end)
	 */
	reset(): void {
		if (this.useV2) {
			this.v2BurstDetector?.clear();
			this.lastBurstEvent = null;
		} else {
			// V1 BurstDetector has clear() method
			const clearMethod = (this.v1BurstDetector as any)?.clear;
			if (typeof clearMethod === "function") {
				clearMethod.call(this.v1BurstDetector);
			}
		}
	}

	/**
	 * Update burst threshold dynamically
	 */
	updateBurstThreshold(threshold: number): void {
		if (this.useV2) {
			this.v2BurstDetector?.updateThreshold(threshold);
		}
		// V1 implementation reads threshold from VS Code config dynamically
		// ConfigStore is read-only, threshold changes require VS Code settings update
	}

	/**
	 * Cleanup old history (periodic maintenance)
	 */
	cleanup(): void {
		if (this.useV2) {
			this.v2BurstDetector?.cleanup();
		}
		// V1 has automatic cleanup via interval
	}

	/**
	 * Check if using V2 engine
	 */
	isUsingV2(): boolean {
		return this.useV2;
	}

	// ============================================
	// V1 Implementations (delegate to existing)
	// ============================================

	private v1ComputeBurst(
		document: vscode.TextDocument,
		changes: readonly vscode.TextDocumentContentChangeEvent[],
	): BurstState {
		// V1 BurstDetector uses onDidChangeTextDocument callback
		// We simulate the behavior here for compatibility

		// Calculate total characters changed
		const charCount = changes.reduce((sum, change) => sum + change.text.length, 0);

		// V1 doesn't expose direct burst check, so we return no burst
		// The actual V1 detection happens in BurstDetector's event listener
		return {
			detected: false,
			charCount,
			filePath: document.uri.fsPath,
		};
	}

	private v1DetectAI(
		_document: vscode.TextDocument,
		_changes: readonly vscode.TextDocumentContentChangeEvent[],
	): AIDetectionResult {
		// V1 doesn't have AI detection, return no detection
		return {
			tool: null,
			confidence: 0,
			method: null,
		};
	}

	// ============================================
	// V2 Implementations (use @snapback/engine)
	// ============================================

	private v2ComputeBurst(
		document: vscode.TextDocument,
		changes: readonly vscode.TextDocumentContentChangeEvent[],
	): BurstState {
		if (!this.v2BurstDetector) {
			return { detected: false };
		}

		// Calculate total characters changed
		const charCount = changes.reduce((sum, change) => sum + change.text.length, 0);

		// Process change with engine BurstDetector
		const burstEvent = this.v2BurstDetector.processChange(document.uri.fsPath, charCount, Date.now());

		if (burstEvent) {
			// Store for AI detection velocity context
			this.lastBurstEvent = burstEvent;

			return {
				detected: true,
				velocity: burstEvent.velocity,
				charCount: burstEvent.charCount,
				filePath: burstEvent.filePath,
			};
		}

		return {
			detected: false,
			charCount,
			filePath: document.uri.fsPath,
		};
	}

	private v2DetectAI(
		_document: vscode.TextDocument,
		changes: readonly vscode.TextDocumentContentChangeEvent[],
	): AIDetectionResult {
		if (!this.v2AIDetector) {
			return {
				tool: null,
				confidence: 0,
				method: null,
			};
		}

		// Extract content from changes
		const content = changes.map((change) => change.text).join("\n");

		// Calculate character count
		const charCount = changes.reduce((sum, change) => sum + change.text.length, 0);

		// Get extension IDs
		const extensionIds = vscode.extensions.all.map((ext) => ext.id);

		// Get velocity from last burst event (if available)
		const velocity = this.lastBurstEvent?.velocity;

		// Detect AI using engine AIDetector
		const result = this.v2AIDetector.detect({
			extensionIds,
			content,
			velocity,
			charCount,
		});

		return {
			tool: result.tool,
			confidence: result.confidence,
			method: result.method,
			indicators: result.indicators,
		};
	}
}
