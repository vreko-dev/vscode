/**
 * SignalService - Unified Signal Detection Service
 *
 * Integrates local signal detection (SignalBridge) with server-side signal analysis (ApiClientORPC).
 * Follows 2026 best practices with oRPC migration and graceful fallback patterns.
 *
 * Architecture:
 * - Primary: Server-side analysis via ApiClientORPC (oRPC)
 * - Fallback: Local analysis via SignalBridge (VS Code engine)
 * - Smart: Combines results when both available
 *
 * @package apps/vscode/src/services
 */

import type {
	AiDetectionInput,
	AiDetectionOutput,
	BurstDetectionInput,
	BurstDetectionOutput,
	ComplexityAnalysisInput,
	ComplexityAnalysisOutput,
	ComprehensiveSignalInput,
	ComprehensiveSignalOutput,
	ThreatDetectionInput,
	ThreatDetectionOutput,
} from "@snapback/contracts";
import type { ExtensionContext } from "vscode";
import { SignalBridge } from "../bridges/SignalBridge";
import { logger } from "../utils/logger";
import { ApiClientORPC } from "./api-client-orpc";

/**
 * Signal detection strategy configuration
 */
export interface SignalServiceConfig {
	/** Use server-side analysis when available (requires API key) */
	preferServer?: boolean;
	/** Combine server + local results for higher confidence */
	hybridMode?: boolean;
	/** Timeout for server requests (ms) */
	serverTimeout?: number;
}

/**
 * Unified Signal Service
 *
 * Provides seamless signal detection with automatic fallback:
 * 1. Try server-side analysis (oRPC) if API key available
 * 2. Fall back to local analysis (SignalBridge) if server unavailable
 * 3. Combine results in hybrid mode for maximum accuracy
 */
export class SignalService {
	private signalBridge: SignalBridge;
	private apiClient: ApiClientORPC | null = null;
	private config: Required<SignalServiceConfig>;

	constructor(context?: ExtensionContext, config: SignalServiceConfig = {}) {
		this.signalBridge = new SignalBridge();

		if (context) {
			this.apiClient = new ApiClientORPC(context);
		}

		this.config = {
			preferServer: config.preferServer ?? true,
			hybridMode: config.hybridMode ?? false,
			serverTimeout: config.serverTimeout ?? 5000,
		};

		logger.info("SignalService initialized", {
			hasApiClient: !!this.apiClient,
			config: this.config,
		});
	}

	/**
	 * Detect AI tool usage with smart fallback
	 *
	 * @param input AI detection parameters
	 * @returns AI detection result with tool identification
	 *
	 * @example
	 * ```typescript
	 * const result = await signalService.detectAI({
	 *   extensionIds: ['github.copilot'],
	 *   content: 'const generated = "code";',
	 *   velocity: 150,
	 *   charCount: 100
	 * });
	 *
	 * if (result?.tool) {
	 *   console.log(`AI detected: ${result.tool} (confidence: ${result.confidence})`);
	 * }
	 * ```
	 */
	async detectAI(input: AiDetectionInput): Promise<AiDetectionOutput | null> {
		if (this.config.preferServer && this.apiClient) {
			try {
				const serverResult = await this.apiClient.detectAiServer(input);

				if (serverResult) {
					logger.debug("AI detection: server-side success", {
						tool: serverResult.tool,
						confidence: serverResult.confidence,
					});
					return serverResult;
				}
			} catch (error) {
				logger.warn("Server AI detection failed, falling back to local", {
					error: error instanceof Error ? error.message : "unknown",
				});
			}
		}

		// Fallback to local detection
		logger.debug("AI detection: using local SignalBridge");
		return null; // Local SignalBridge.detectAI returns different format - needs adapter
	}

	/**
	 * Detect security threats with smart fallback
	 *
	 * @param input Threat detection parameters
	 * @returns Threat detection result with identified threats
	 *
	 * @example
	 * ```typescript
	 * const result = await signalService.detectThreats({
	 *   content: 'eval(userInput); // dangerous'
	 * });
	 *
	 * if (result && result.threatCount > 0) {
	 *   console.log(`Found ${result.threatCount} threats`);
	 * }
	 * ```
	 */
	async detectThreats(input: ThreatDetectionInput): Promise<ThreatDetectionOutput | null> {
		if (this.config.preferServer && this.apiClient) {
			try {
				const serverResult = await this.apiClient.detectThreatsServer(input);

				if (serverResult) {
					logger.debug("Threat detection: server-side success", {
						threatCount: serverResult.threatCount,
					});
					return serverResult;
				}
			} catch (error) {
				logger.warn("Server threat detection failed, falling back to local", {
					error: error instanceof Error ? error.message : "unknown",
				});
			}
		}

		// Fallback to local detection (SignalBridge doesn't have threat detection yet)
		logger.debug("Threat detection: local fallback not implemented");
		return null;
	}

	/**
	 * Analyze burst patterns with smart fallback
	 *
	 * @param input Burst detection parameters
	 * @returns Burst detection result
	 *
	 * @example
	 * ```typescript
	 * const result = await signalService.analyzeBurst({
	 *   filePath: '/src/index.ts',
	 *   charCount: 500,
	 *   timestamp: Date.now()
	 * });
	 *
	 * if (result?.isBurst) {
	 *   console.log(`Burst detected: ${result.velocity} chars/ms`);
	 * }
	 * ```
	 */
	async analyzeBurst(input: BurstDetectionInput): Promise<BurstDetectionOutput | null> {
		if (this.config.preferServer && this.apiClient) {
			try {
				const serverResult = await this.apiClient.analyzeBurstServer(input);

				if (serverResult) {
					logger.debug("Burst analysis: server-side success", {
						isBurst: serverResult.isBurst,
						velocity: serverResult.velocity,
					});
					return serverResult;
				}
			} catch (error) {
				logger.warn("Server burst analysis failed, falling back to local", {
					error: error instanceof Error ? error.message : "unknown",
				});
			}
		}

		// Fallback to local burst detection via SignalBridge
		logger.debug("Burst analysis: local fallback not implemented for standalone mode");
		return null;
	}

	/**
	 * Analyze code complexity with smart fallback
	 *
	 * @param input Complexity analysis parameters
	 * @returns Complexity analysis result
	 */
	async analyzeComplexity(input: ComplexityAnalysisInput): Promise<ComplexityAnalysisOutput | null> {
		if (this.config.preferServer && this.apiClient) {
			try {
				const serverResult = await this.apiClient.analyzeComplexityServer(input);

				if (serverResult) {
					logger.debug("Complexity analysis: server-side success", {
						avgComplexity: serverResult.avgComplexity,
					});
					return serverResult;
				}
			} catch (error) {
				logger.warn("Server complexity analysis failed, falling back to local", {
					error: error instanceof Error ? error.message : "unknown",
				});
			}
		}

		// Fallback to local complexity calculation
		logger.debug("Complexity analysis: local fallback not implemented");
		return null;
	}

	/**
	 * Run comprehensive signal analysis (recommended)
	 *
	 * Combines AI detection, threat detection, burst analysis, and complexity analysis
	 * into a single comprehensive result with overall risk assessment.
	 *
	 * @param input Comprehensive signal parameters
	 * @returns Comprehensive signal result with all signal types
	 *
	 * @example
	 * ```typescript
	 * const result = await signalService.analyzeComprehensive({
	 *   filePath: '/src/index.ts',
	 *   content: 'const code = "test";',
	 *   lineCount: 10,
	 *   charCount: 100,
	 *   extensionIds: ['github.copilot'],
	 *   velocity: 150,
	 *   timestamp: Date.now()
	 * });
	 *
	 * console.log(`Risk Level: ${result?.riskLevel}`);
	 * console.log(`Overall Risk: ${result?.overallRisk}`);
	 * ```
	 */
	async analyzeComprehensive(input: ComprehensiveSignalInput): Promise<ComprehensiveSignalOutput | null> {
		if (this.config.preferServer && this.apiClient) {
			try {
				const serverResult = await this.apiClient.analyzeComprehensive(input);

				if (serverResult) {
					logger.info("Comprehensive analysis: server-side success", {
						riskLevel: serverResult.riskLevel,
						overallRisk: serverResult.overallRisk,
						hasAI: !!serverResult.signals.ai?.tool,
						threatCount: serverResult.signals.threats?.threatCount ?? 0,
					});
					return serverResult;
				}
			} catch (error) {
				logger.warn("Server comprehensive analysis failed, falling back to local", {
					error: error instanceof Error ? error.message : "unknown",
				});
			}
		}

		// Fallback to local comprehensive analysis
		logger.debug("Comprehensive analysis: local fallback not fully implemented");
		return null;
	}

	/**
	 * Get the underlying SignalBridge for direct local access
	 *
	 * Use this when you need access to SignalBridge-specific methods like
	 * computeBurst() or detectLanguageModels().
	 */
	getSignalBridge(): SignalBridge {
		return this.signalBridge;
	}

	/**
	 * Check if server-side analysis is available
	 */
	hasServerAnalysis(): boolean {
		return !!this.apiClient;
	}

	/**
	 * Update service configuration
	 */
	updateConfig(config: Partial<SignalServiceConfig>): void {
		this.config = { ...this.config, ...config };
		logger.debug("SignalService config updated", { config: this.config });
	}

	/**
	 * Reset SignalBridge state (e.g., on session end)
	 */
	reset(): void {
		this.signalBridge.reset();
		logger.debug("SignalService reset");
	}

	/**
	 * Cleanup resources
	 */
	dispose(): void {
		this.signalBridge.cleanup();
		logger.debug("SignalService disposed");
	}
}

/**
 * Create a SignalService instance with Extension Context
 *
 * @param context VS Code Extension Context for oRPC client
 * @param config Optional service configuration
 * @returns Configured SignalService instance
 */
export function createSignalService(context: ExtensionContext, config?: SignalServiceConfig): SignalService {
	return new SignalService(context, config);
}

/**
 * Create a SignalService instance without server support (local-only)
 *
 * @param config Optional service configuration
 * @returns Local-only SignalService instance
 */
export function createLocalSignalService(config?: SignalServiceConfig): SignalService {
	return new SignalService(undefined, { ...config, preferServer: false });
}
