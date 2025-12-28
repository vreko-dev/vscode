/**
 * SignalOrchestrator - Invokes all engine signals and aggregates results
 *
 * @fileoverview Bridges the gap between:
 * - packages/engine/src/signals/* (signal computation modules)
 * - apps/vscode/src/domain/signalAggregator.ts (signal aggregation)
 *
 * Unlike SignalBridge which only handles burst/AI detection,
 * this orchestrator invokes the full signal pipeline including
 * complexity, risk-score, and sensitive file detection.
 *
 * Implemented using TDD Red-Green-Refactor methodology.
 *
 * ## Design Decisions
 *
 * 1. **Synchronous Invocation**: Engine signals export pure functions,
 *    so we invoke them directly (<5ms) instead of child process (~100ms).
 *
 * 2. **Singleton Pattern**: Following codebase pattern from SnapBack learnings.
 *
 * 3. **Performance Budget**: Must complete in <100ms per CLAUDE.md save latency.
 *
 * ## Performance Constraints (from CLAUDE.md)
 *
 * - Save latency <100ms (all signal computation batched)
 * - Memory <200MB (no unbounded caches)
 *
 * @see apps/vscode/src/integration/INTELLIGENCE_INTEGRATION_PLAN.md Task 6
 * @see packages/engine/src/signals/
 * @module bridges/SignalOrchestrator
 */

import { calculateComplexityAggregate, calculateRiskScore, isSensitiveFile } from "@snapback/engine/signals";
import type { SignalAggregator } from "../domain/signalAggregator";
import { logger } from "../utils/logger";
import type { FileForSignals, SignalOrchestratorResult } from "./types";

// Re-export types for consumers
export type { FileForSignals, SignalOrchestratorResult } from "./types";

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * SignalOrchestrator invokes engine signals synchronously
 *
 * Design decision: Synchronous invocation instead of child process
 * - Engine signals export pure functions
 * - No need for stdin/stdout JSON parsing in extension
 * - Much faster (<5ms vs ~100ms for child process)
 */
export class SignalOrchestrator {
	/**
	 * Run all signals on files and return aggregated result
	 *
	 * @param files - Files to analyze
	 * @returns Aggregated signal result
	 */
	computeSignals(files: FileForSignals[]): SignalOrchestratorResult {
		const startTime = Date.now();

		// Handle empty input
		if (files.length === 0) {
			return {
				riskScore: 0,
				complexity: 0,
				factors: [],
				sensitiveFiles: [],
				threatCount: 0,
			};
		}

		// Convert to engine format
		const engineFiles = files.map((f) => ({
			path: f.path,
			content: f.content,
			lineCount: f.lineCount,
			changeType: "modify" as const,
		}));

		// 1. Calculate risk score and factors
		const riskResult = calculateRiskScore(engineFiles);
		const riskScore = riskResult.score;
		const factors = riskResult.factors;

		// 2. Calculate complexity
		const complexityResult = calculateComplexityAggregate(engineFiles);
		const maxComplexity = complexityResult.maxComplexity;

		// 3. Identify sensitive files
		const sensitiveFiles = files.filter((f) => isSensitiveFile(f.path)).map((f) => f.path);

		// 4. Count threat-related factors
		const threatCount = factors.filter(
			(f) =>
				f.toLowerCase().includes("security") ||
				f.toLowerCase().includes("threat") ||
				f.toLowerCase().includes("sensitive"),
		).length;

		const duration = Date.now() - startTime;
		logger.debug("SignalOrchestrator computed signals", {
			riskScore,
			complexity: maxComplexity,
			factorCount: factors.length,
			sensitiveFileCount: sensitiveFiles.length,
			duration,
		});

		return {
			riskScore,
			complexity: maxComplexity,
			factors,
			sensitiveFiles,
			threatCount,
		};
	}

	/**
	 * Populate a SignalAggregator with computed signals
	 *
	 * This bridges the orchestrator output to the existing
	 * signalAggregator interface used by AutoDecisionIntegration.
	 *
	 * @param aggregator - SignalAggregator to populate
	 * @param files - Files to analyze
	 */
	populateAggregator(aggregator: SignalAggregator, files: FileForSignals[]): void {
		const signals = this.computeSignals(files);

		// Convert to normalized score (0-100 scale for aggregator)
		const riskSignal = {
			score: signals.riskScore * 10, // Convert 0-10 to 0-100
			factors: signals.factors,
		};

		// Set the risk signal
		aggregator.setRiskSignal(riskSignal);

		// Set critical file signal
		aggregator.setCriticalFileSignal({
			detected: signals.sensitiveFiles.length > 0,
			files: signals.sensitiveFiles,
			count: signals.sensitiveFiles.length,
		});

		logger.debug("SignalAggregator populated from engine signals", {
			riskScore: riskSignal.score,
			criticalFiles: signals.sensitiveFiles.length,
		});
	}
}

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

/**
 * Module-level singleton instance
 * Pattern from SnapBack learnings: module-level variables for race condition handling
 */
let orchestratorInstance: SignalOrchestrator | null = null;

/**
 * Get the SignalOrchestrator singleton
 */
export function getSignalOrchestrator(): SignalOrchestrator {
	if (!orchestratorInstance) {
		orchestratorInstance = new SignalOrchestrator();
	}
	return orchestratorInstance;
}

/**
 * Dispose the SignalOrchestrator singleton
 */
export function disposeSignalOrchestrator(): void {
	orchestratorInstance = null;
}
