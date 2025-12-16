/**
 * SignalBridge - V2 Engine Signal Detection for VS Code
 *
 * DESIGN:
 * - Wraps @snapback/engine signals for VS Code context
 * - Converts VS Code TextDocument to engine input format
 * - Provides burst detection and AI tool detection
 *
 * TARGET: ~180 LOC (V2-only, V1 removed)
 */

import { AIDetector, BurstDetector, type BurstEvent } from "@snapback/engine/signals";
import * as vscode from "vscode";

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
	/** Burst detector config */
	burstThreshold?: number;
}

/**
 * SignalBridge wraps V2 engine signals for VS Code
 *
 * Usage:
 * ```typescript
 * const bridge = new SignalBridge({ burstThreshold: 30 });
 *
 * // Compute burst state from document changes
 * const burstState = bridge.computeBurst(document, changes);
 *
 * // Detect AI tool usage
 * const aiResult = bridge.detectAI(document, changes);
 * ```
 */
export class SignalBridge {
	// V2 engine detectors
	private burstDetector: BurstDetector;
	private aiDetector: AIDetector;

	// State tracking for burst context
	private lastBurstEvent: BurstEvent | null = null;

	constructor(options: SignalBridgeOptions = {}) {
		// Initialize V2 engine detectors
		this.burstDetector = new BurstDetector({
			threshold: options.burstThreshold ?? 30, // 30 chars per 100ms
			windowMs: 100,
			cooldownMs: 500,
		});

		this.aiDetector = new AIDetector({
			velocityThreshold: 10, // 10 chars/ms
			minCharsForVelocity: 100,
			enablePatternMatching: true,
		});

		console.log("[SignalBridge] Initialized V2 engine detectors");
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
		// Calculate total characters changed
		const charCount = changes.reduce((sum, change) => sum + change.text.length, 0);

		// Process change with engine BurstDetector
		const burstEvent = this.burstDetector.processChange(document.uri.fsPath, charCount, Date.now());

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

	/**
	 * Detect AI tool usage from document changes
	 * @param document The changed document
	 * @param changes The content changes
	 * @returns AIDetectionResult with tool identification
	 */
	detectAI(
		_document: vscode.TextDocument,
		changes: readonly vscode.TextDocumentContentChangeEvent[],
	): AIDetectionResult {
		// Extract content from changes
		const content = changes.map((change) => change.text).join("\n");

		// Calculate character count
		const charCount = changes.reduce((sum, change) => sum + change.text.length, 0);

		// Get extension IDs
		const extensionIds = vscode.extensions.all.map((ext) => ext.id);

		// Get velocity from last burst event (if available)
		const velocity = this.lastBurstEvent?.velocity;

		// Detect AI using engine AIDetector
		const result = this.aiDetector.detect({
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

	/**
	 * Reset detection state (e.g., on session end)
	 */
	reset(): void {
		this.burstDetector.clear();
		this.lastBurstEvent = null;
	}

	/**
	 * Update burst threshold dynamically
	 */
	updateBurstThreshold(threshold: number): void {
		this.burstDetector.updateThreshold(threshold);
	}

	/**
	 * Cleanup old history (periodic maintenance)
	 */
	cleanup(): void {
		this.burstDetector.cleanup();
	}
}
