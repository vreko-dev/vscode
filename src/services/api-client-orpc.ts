/**
 * GREEN Phase: VS Code API Client oRPC Wrapper
 *
 * Wraps @snapback/api-client/vscode to provide the same interface as the old ApiClient
 * while using oRPC under the hood.
 *
 * Phase 2A: Signals Methods (5/10 methods migrated)
 * - detectAiServer → client.signals.detectAi
 * - detectThreatsServer → client.signals.detectThreats
 * - analyzeBurstServer → client.signals.analyzeBurst
 * - analyzeComplexityServer → client.signals.analyzeComplexity
 * - analyzeComprehensive → client.signals.comprehensive
 *
 * Phase 2B: Attribution Methods (Gap 4 - Attribution Integration)
 * - transferAttribution → client.attribution.transfer
 * - getAttribution → client.attribution.get
 *
 * Phase 2C: Remaining methods require new oRPC procedures (3/10 methods - BLOCKED)
 * - analyzeFiles → Need client.risk.analyze or equivalent
 * - detectSecrets → Need client.risk.detectSecrets or equivalent
 * - evaluatePolicy → Need client.risk.evaluatePolicy or equivalent
 *
 * Also needs migration (2/10 methods):
 * - healthCheck → Need client.health.check or equivalent
 * - setApiKey → Handled by SecretStorage directly
 */

import { type ApiRouterClient, createVSCodeClient } from "@snapback/api-client/vscode";
import type {
	AiDetectionInput,
	AiDetectionOutput,
	AttributionRecord,
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
import { logger } from "../utils/logger";

/**
 * oRPC-based API client for VS Code extension
 *
 * Pure migration approach: Only migrated methods are exposed.
 * Legacy REST methods will be added when oRPC procedures are created.
 */
export class ApiClientORPC {
	private clientPromise: Promise<ApiRouterClient>;
	private context: ExtensionContext;

	constructor(context: ExtensionContext) {
		this.context = context;

		// Lazy initialization of oRPC client
		this.clientPromise = createVSCodeClient({
			context: this.context,
			baseUrl: process.env.SNAPBACK_API_URL || "https://api.snapback.dev",
		});
	}

	// =============================================================================
	// Phase 2A: Migrated Signal Methods (oRPC)
	// =============================================================================

	/**
	 * Detect AI tool presence via server-side analysis
	 *
	 * GREEN: Migrated to oRPC client.signals.detectAi
	 * Uses Bearer token from SecretStorage via Better Auth
	 */
	public async detectAiServer(input: AiDetectionInput): Promise<AiDetectionOutput | null> {
		try {
			const client = await this.clientPromise;
			const result = await client.signals.detectAi(input);
			return result as AiDetectionOutput;
		} catch (error) {
			// Handle 403 (Pro plan required) gracefully
			if (error instanceof Error && error.message.includes("403")) {
				logger.debug("AI detection requires Pro plan or advancedSignals permission");
				return null;
			}

			logger.error("Server AI detection failed", error as Error);
			return null;
		}
	}

	/**
	 * Detect security threats via server-side analysis
	 *
	 * GREEN: Migrated to oRPC client.signals.detectThreats
	 * Uses Bearer token from SecretStorage via Better Auth
	 */
	public async detectThreatsServer(input: ThreatDetectionInput): Promise<ThreatDetectionOutput | null> {
		try {
			const client = await this.clientPromise;
			const result = await client.signals.detectThreats(input);
			return result as ThreatDetectionOutput;
		} catch (error) {
			if (error instanceof Error && error.message.includes("403")) {
				logger.debug("Threat detection requires Pro plan or advancedSignals permission");
				return null;
			}

			logger.error("Server threat detection failed", error as Error);
			return null;
		}
	}

	/**
	 * Analyze edit burst patterns via server-side analysis
	 *
	 * GREEN: Migrated to oRPC client.signals.analyzeBurst
	 * Uses Bearer token from SecretStorage via Better Auth
	 */
	public async analyzeBurstServer(input: BurstDetectionInput): Promise<BurstDetectionOutput | null> {
		try {
			const client = await this.clientPromise;
			const result = await client.signals.analyzeBurst(input);
			return result as BurstDetectionOutput;
		} catch (error) {
			if (error instanceof Error && error.message.includes("403")) {
				logger.debug("Burst analysis requires Pro plan or advancedSignals permission");
				return null;
			}

			logger.error("Server burst analysis failed", error as Error);
			return null;
		}
	}

	/**
	 * Analyze code complexity via server-side analysis
	 *
	 * GREEN: Migrated to oRPC client.signals.analyzeComplexity
	 * Uses Bearer token from SecretStorage via Better Auth
	 */
	public async analyzeComplexityServer(input: ComplexityAnalysisInput): Promise<ComplexityAnalysisOutput | null> {
		try {
			const client = await this.clientPromise;
			const result = await client.signals.analyzeComplexity(input);
			return result as ComplexityAnalysisOutput;
		} catch (error) {
			if (error instanceof Error && error.message.includes("403")) {
				logger.debug("Complexity analysis requires Pro plan or advancedSignals permission");
				return null;
			}

			logger.error("Server complexity analysis failed", error as Error);
			return null;
		}
	}

	/**
	 * Run comprehensive signal analysis via server
	 *
	 * GREEN: Migrated to oRPC client.signals.comprehensive
	 * Uses Bearer token from SecretStorage via Better Auth
	 */
	public async analyzeComprehensive(input: ComprehensiveSignalInput): Promise<ComprehensiveSignalOutput | null> {
		try {
			const client = await this.clientPromise;
			const result = await client.signals.comprehensive(input);
			return result as ComprehensiveSignalOutput;
		} catch (error) {
			if (error instanceof Error && error.message.includes("403")) {
				logger.debug("Comprehensive analysis requires Pro plan or advancedSignals permission");
				return null;
			}

			logger.error("Server comprehensive analysis failed", error as Error);
			return null;
		}
	}

	// =============================================================================
	// Phase 2B: Attribution Methods (Gap 4 - Attribution Integration)
	// =============================================================================

	/**
	 * Transfer web attribution to authenticated user
	 *
	 * Used after extension authentication to link marketing attribution
	 * from the web (captured via fingerprint) to the authenticated user.
	 *
	 * @param fingerprint - Device/browser fingerprint from web session
	 * @param attribution - Marketing attribution data (source, UTM, etc.)
	 * @returns Transfer result or null on error
	 */
	public async transferAttribution(
		fingerprint: string,
		attribution: {
			source: "facebook" | "google" | "twitter" | "linkedin" | "reddit" | "direct" | "referral" | "organic";
			campaignId?: string;
			utmParams?: {
				utm_source?: string;
				utm_medium?: string;
				utm_campaign?: string;
				utm_content?: string;
				utm_term?: string;
			};
			conversionData?: {
				landingPage?: string;
				referrer?: string;
				deviceType?: "mobile" | "tablet" | "desktop";
			};
			referralCode?: string;
		},
	): Promise<{ success: boolean; attributionId: string; action: "created" | "merged" | "ignored" } | null> {
		try {
			const client = await this.clientPromise;
			const result = await client.attribution.transfer({
				fingerprint,
				attribution,
			});
			logger.info(`Attribution transferred: ${result.action}`);
			return result;
		} catch (error) {
			if (error instanceof Error && error.message.includes("401")) {
				logger.debug("Attribution transfer requires authentication");
				return null;
			}
			logger.error("Failed to transfer attribution", error as Error);
			return null;
		}
	}

	/**
	 * Get attribution data for the current authenticated user
	 *
	 * @returns Attribution record or null if not found/not authenticated
	 */
	public async getAttribution(): Promise<AttributionRecord | null> {
		try {
			const client = await this.clientPromise;
			const result = await client.attribution.get();
			return result as AttributionRecord | null;
		} catch (error) {
			if (error instanceof Error && error.message.includes("401")) {
				logger.debug("Attribution get requires authentication");
				return null;
			}
			logger.error("Failed to get attribution", error as Error);
			return null;
		}
	}

	// =============================================================================
	// Phase 2C: Blocked - Awaiting oRPC Procedures
	// =============================================================================

	/**
	 * BLOCKED: analyzeFiles() - Needs oRPC procedure
	 *
	 * Current REST endpoint: POST /v1/analyze
	 * Required oRPC: client.risk.analyze() or client.dashboard.analyze()
	 *
	 * Action: API team must create oRPC procedure before migration
	 */

	/**
	 * BLOCKED: detectSecrets() - Needs oRPC procedure
	 *
	 * Current REST endpoint: POST /v1/detect-secrets
	 * Required oRPC: client.risk.detectSecrets() or similar
	 *
	 * Action: API team must create oRPC procedure before migration
	 */

	/**
	 * BLOCKED: evaluatePolicy() - Needs oRPC procedure
	 *
	 * Current REST endpoint: POST /v1/policy/evaluate
	 * Required oRPC: client.risk.evaluatePolicy() or similar
	 *
	 * Action: API team must create oRPC procedure before migration
	 */

	/**
	 * BLOCKED: healthCheck() - Needs oRPC procedure
	 *
	 * Current REST endpoint: GET /health
	 * Required oRPC: client.health.check() or similar
	 *
	 * Action: API team must create oRPC procedure before migration
	 */

	/**
	 * Update API key - Handled by SecretStorage
	 *
	 * Note: setApiKey() is no longer needed as the oRPC client
	 * automatically reads from SecretStorage via createVSCodeClient.
	 *
	 * To update the API key, use context.secrets.store() directly.
	 */
	public async setApiKey(apiKey: string): Promise<void> {
		try {
			await this.context.secrets.store("snapback.apiKey", apiKey);
			logger.info("API key securely stored in SecretStorage");

			// Recreate client with new token
			this.clientPromise = createVSCodeClient({
				context: this.context,
				baseUrl: process.env.SNAPBACK_API_URL || "https://api.snapback.dev",
			});
		} catch (error) {
			logger.error("Failed to store API key", error as Error);
			throw error;
		}
	}
}
