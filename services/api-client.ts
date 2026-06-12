import { API_DEFAULTS } from "../config/hardcodedDefaults";
import type { NetworkAdapter } from "../network/NetworkAdapter";
import { QueuedNetworkAdapter } from "../network/QueuedNetworkAdapter";
import { getSecureConfig } from "../security/SecureConfigService";
import type { AIInsights, AIInsightsInput } from "../types/ai-insights";
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
} from "../types/signals";
import { logger } from "../utils/logger";

// API client for Vreko backend
export class ApiClient {
	private baseUrl: string;
	private apiKey: string | undefined;
	private apiKeyInitialized = false;
	private networkAdapter: NetworkAdapter;
	private sessionToken: string | undefined; // OAuth session token

	constructor(networkAdapter?: NetworkAdapter) {
		// Use provided network adapter or default to queued implementation
		this.networkAdapter = networkAdapter || new QueuedNetworkAdapter();

		// Use hardcoded API URL - no user configuration needed
		this.baseUrl = API_DEFAULTS.baseUrl;

		// ✅ SECURITY (AUTH-030): API key now loaded lazily from SecureConfigService
		// No longer retrieved from workspace config to prevent exposure in settings.json
	}

	/**
	 * Set OAuth session token for API authentication
	 * OAuth session tokens are the canonical auth method
	 * @param accessToken - The OAuth access token from session
	 * @param _email - User email (for logging)
	 */
	public async setSessionToken(accessToken: string, _email: string): Promise<void> {
		this.sessionToken = accessToken;
		logger.debug("Session token set for API client", { email: _email });
	}

	/**
	 * Lazy initialization of API key from SecretStorage
	 * Called automatically before API requests
	 *
	 * ✅ SECURITY (AUTH-030): Uses SecretStorage instead of workspace config
	 */
	private async ensureApiKeyLoaded(): Promise<void> {
		if (this.apiKeyInitialized) {
			return;
		}

		try {
			// ✅ Retrieve from SecretStorage (OS-level encrypted storage)
			const secureConfig = getSecureConfig();
			this.apiKey = await secureConfig.get("api.key");
			this.apiKeyInitialized = true;

			if (this.apiKey) {
				logger.debug("API key loaded from secure storage");
			}
		} catch (error) {
			logger.warn("Failed to load API key from secure storage", {
				error: error instanceof Error ? error.message : "unknown",
			});
			this.apiKeyInitialized = true; // Mark as attempted to avoid repeated failures
		}
	}

	/**
	 * Update API key and store securely
	 *
	 * ✅ SECURITY (AUTH-030): Stores in SecretStorage, not workspace config
	 */
	public async setApiKey(apiKey: string): Promise<void> {
		try {
			const secureConfig = getSecureConfig();
			await secureConfig.set("api.key", apiKey);
			this.apiKey = apiKey;
			this.apiKeyInitialized = true;
			logger.info("API key securely stored");
		} catch (error) {
			logger.error("Failed to store API key securely", error as Error);
			throw error;
		}
	}

	// Analyze files using the backend API
	public async analyzeFiles(
		files: Array<{ path: string; content: string }>,
		options?: {
			customRules?: Array<{
				name: string;
				pattern: string;
				severity: string;
				filePattern?: string;
			}>;
			workspaceId?: string;
			commitMessage?: string;
			branchName?: string;
		},
	): Promise<unknown> {
		// ✅ AUTH: Check for OAuth session token first (canonical auth)
		// Fall back to API key if no session token
		if (this.sessionToken) {
			// Use Bearer token from OAuth session
			return this.analyzeWithSession(files, options);
		}

		// Legacy: Load API key from SecretStorage
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			// Return neutral result instead of throwing
			// This allows fallback to basic pattern detection
			return {
				score: 0,
				factors: [],
				recommendations: [],
				severity: "low",
			};
		}

		const requestBody = {
			files: files.map((file) => ({
				path: file.path,
				content: file.content,
				changeType: "modified",
			})),
			customRules: options?.customRules,
			workspaceId: options?.workspaceId,
			commitMessage: options?.commitMessage,
			branchName: options?.branchName,
		};

		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/v1/analyze`, requestBody, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				throw new Error(`API request failed: ${response.status} ${response.statusText} - ${response.text}`);
			}

			return response.data;
		} catch (error) {
			logger.error("API analyze request failed", error as Error);
			throw error;
		}
	}

	/**
	 * Analyze files using OAuth session token (Bearer token)
	 * This is the canonical auth method - uses Better Auth's bearer plugin
	 * @param files - Files to analyze
	 * @param options - Analysis options
	 */
	private async analyzeWithSession(
		files: Array<{ path: string; content: string }>,
		options?: {
			customRules?: Array<{
				name: string;
				pattern: string;
				severity: string;
				filePattern?: string;
			}>;
			workspaceId?: string;
			commitMessage?: string;
			branchName?: string;
		},
	): Promise<unknown> {
		const requestBody = {
			files: files.map((file) => ({
				path: file.path,
				content: file.content,
				changeType: "modified",
			})),
			customRules: options?.customRules,
			workspaceId: options?.workspaceId,
			commitMessage: options?.commitMessage,
			branchName: options?.branchName,
		};

		try {
			// Use oRPC endpoint with Bearer token authentication
			// oRPC provides end-to-end type safety
			const response = await this.networkAdapter.post(
				`${this.baseUrl}/api/rpc`,
				{
					jsonrpc: "2.0",
					id: 1,
					method: "risk.analyze",
					params: requestBody,
				},
				{
					Authorization: `Bearer ${this.sessionToken}`,
				},
			);

			if (!response.ok) {
				throw new Error(`oRPC request failed: ${response.status} ${response.statusText}`);
			}

			const data = response.data as { result?: unknown; error?: { message: string } };

			if (data.error) {
				throw new Error(`oRPC error: ${data.error.message}`);
			}

			return data.result;
		} catch (error) {
			logger.error("oRPC analyze request failed (session auth)", error as Error);
			throw error;
		}
	}

	// Detect secrets using the backend API
	public async detectSecrets(
		files: Array<{ path: string; content: string }>,
		options?: {
			workspaceId?: string;
			commitMessage?: string;
			branchName?: string;
		},
	): Promise<unknown> {
		// ✅ SECURITY (AUTH-030): Load API key from SecretStorage before use
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			// Return neutral result instead of throwing
			// This allows fallback to basic pattern detection
			return {
				secrets: [],
			};
		}

		const requestBody = {
			files: files.map((file) => ({
				path: file.path,
				content: file.content,
				changeType: "modified",
			})),
			workspaceId: options?.workspaceId,
			commitMessage: options?.commitMessage,
			branchName: options?.branchName,
		};

		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/v1/detect-secrets`, requestBody, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				throw new Error(`API request failed: ${response.status} ${response.statusText} - ${response.text}`);
			}

			return response.data;
		} catch (error) {
			logger.error("API secret detection request failed", error as Error);
			throw error;
		}
	}

	// Evaluate policy using the backend API
	public async evaluatePolicy(
		sarif: unknown,
		policy?: unknown,
		filePath?: string,
		workspaceId?: string,
	): Promise<unknown> {
		// ✅ SECURITY (AUTH-030): Load API key from SecretStorage before use
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			// Return neutral policy result instead of throwing
			// This allows operations to continue in offline mode
			return {
				action: "apply",
				reason: "No API key configured",
				details: {},
			};
		}

		const requestBody = {
			sarif,
			policy,
			filePath,
			workspaceId,
		};

		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/v1/policy/evaluate`, requestBody, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				throw new Error(`API request failed: ${response.status} ${response.statusText} - ${response.text}`);
			}

			return response.data;
		} catch (error) {
			logger.error("API policy evaluation request failed", error as Error);
			throw error;
		}
	}

	// Check if the API is accessible
	public async healthCheck(): Promise<boolean> {
		try {
			const response = await this.networkAdapter.get(`${this.baseUrl}/health`);
			return response.ok;
		} catch (error) {
			logger.error("API health check failed", error as Error);
			return false;
		}
	}

	// =============================================================================
	// Signal Analysis Methods (Pro/advancedSignals)
	// =============================================================================

	/**
	 * Detect AI tool presence via server-side analysis
	 *
	 * Requires Pro plan or advancedSignals permission.
	 * Falls back to local SignalBridge if not authorized.
	 */
	public async detectAiServer(input: AiDetectionInput): Promise<AiDetectionOutput | null> {
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			logger.debug("No API key - skipping server-side AI detection");
			return null;
		}

		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/api/signals/ai`, input, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				if (response.status === 403) {
					logger.debug("AI detection requires Pro plan or advancedSignals permission");
					return null;
				}
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return response.data as AiDetectionOutput;
		} catch (error) {
			logger.error("Server AI detection failed", error as Error);
			return null;
		}
	}

	/**
	 * Detect security threats via server-side analysis
	 *
	 * Requires Pro plan or advancedSignals permission.
	 * Falls back to local SignalBridge if not authorized.
	 */
	public async detectThreatsServer(input: ThreatDetectionInput): Promise<ThreatDetectionOutput | null> {
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			logger.debug("No API key - skipping server-side threat detection");
			return null;
		}

		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/api/signals/threats`, input, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				if (response.status === 403) {
					logger.debug("Threat detection requires Pro plan or advancedSignals permission");
					return null;
				}
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return response.data as ThreatDetectionOutput;
		} catch (error) {
			logger.error("Server threat detection failed", error as Error);
			return null;
		}
	}

	/**
	 * Analyze edit burst patterns via server-side analysis
	 *
	 * Requires Pro plan or advancedSignals permission.
	 * Falls back to local SignalBridge if not authorized.
	 */
	public async analyzeBurstServer(input: BurstDetectionInput): Promise<BurstDetectionOutput | null> {
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			logger.debug("No API key - skipping server-side burst analysis");
			return null;
		}

		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/api/signals/burst`, input, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				if (response.status === 403) {
					logger.debug("Burst analysis requires Pro plan or advancedSignals permission");
					return null;
				}
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return response.data as BurstDetectionOutput;
		} catch (error) {
			logger.error("Server burst analysis failed", error as Error);
			return null;
		}
	}

	/**
	 * Analyze code complexity via server-side analysis
	 *
	 * Requires Pro plan or advancedSignals permission.
	 * Falls back to local SignalBridge if not authorized.
	 */
	public async analyzeComplexityServer(input: ComplexityAnalysisInput): Promise<ComplexityAnalysisOutput | null> {
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			logger.debug("No API key - skipping server-side complexity analysis");
			return null;
		}

		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/api/signals/complexity`, input, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				if (response.status === 403) {
					logger.debug("Complexity analysis requires Pro plan or advancedSignals permission");
					return null;
				}
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return response.data as ComplexityAnalysisOutput;
		} catch (error) {
			logger.error("Server complexity analysis failed", error as Error);
			return null;
		}
	}

	/**
	 * Run comprehensive signal analysis via server
	 *
	 * Executes all signals in parallel and computes overall risk score.
	 * Requires Pro plan or advancedSignals permission.
	 * Falls back to local SignalBridge if not authorized.
	 */
	public async analyzeComprehensive(input: ComprehensiveSignalInput): Promise<ComprehensiveSignalOutput | null> {
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			logger.debug("No API key - skipping server-side comprehensive analysis");
			return null;
		}

		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/api/signals/comprehensive`, input, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				if (response.status === 403) {
					logger.debug("Comprehensive analysis requires Pro plan or advancedSignals permission");
					return null;
				}
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return response.data as ComprehensiveSignalOutput;
		} catch (error) {
			logger.error("Server comprehensive analysis failed", error as Error);
			return null;
		}
	}

	/**
	 * Transfer web attribution to authenticated user
	 *
	 * Used after extension authentication to link marketing attribution
	 * from the web to the authenticated user.
	 *
	 * @param fingerprint - Device/browser fingerprint from web session
	 * @param attribution - Marketing attribution data
	 * @returns Transfer result or null on error
	 */
	public async transferAttribution(
		fingerprint: string,
		attribution: {
			source: "facebook" | "google" | "twitter" | "linkedin" | "reddit" | "direct" | "referral" | "organic";
			utmParams?: {
				utm_source?: string;
				utm_medium?: string;
				utm_campaign?: string;
				utm_content?: string;
				utm_term?: string;
			};
			referralCode?: string;
		},
	): Promise<{ success: boolean; attributionId: string; action: "created" | "merged" | "ignored" } | null> {
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			logger.debug("No API key - skipping attribution transfer");
			return null;
		}

		try {
			const response = await this.networkAdapter.post(
				`${this.baseUrl}/api/attribution/transfer`,
				{ fingerprint, attribution },
				{ "X-API-Key": this.apiKey },
			);

			if (!response.ok) {
				if (response.status === 401) {
					logger.debug("Attribution transfer requires authentication");
					return null;
				}
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return response.data as {
				success: boolean;
				attributionId: string;
				action: "created" | "merged" | "ignored";
			};
		} catch (error) {
			logger.error("Failed to transfer attribution", error as Error);
			return null;
		}
	}

	// =============================================================================
	// AI Insights Methods (Pro-gated)
	// =============================================================================

	/**
	 * Generate AI insights for closing ceremony
	 *
	 * Requires Pro subscription. Falls back gracefully if not authorized.
	 * Pre-fire pattern: Call this when session ends, insights ready by time user clicks.
	 *
	 * @param input - Session metadata for insight generation
	 * @returns AI insights or null if not authorized/failed
	 */
	public async generateInsights(input: AIInsightsInput): Promise<AIInsights | null> {
		// Prefer OAuth session token (canonical auth)
		if (this.sessionToken) {
			return this.generateInsightsWithSession(input);
		}

		// Fallback to API key
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			logger.debug("No API key - skipping AI insights");
			return null;
		}

		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/api/ai/generateInsights`, input, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				if (response.status === 403) {
					logger.debug("AI insights require Pro subscription");
					return null;
				}
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return response.data as AIInsights;
		} catch (error) {
			logger.error("Failed to generate AI insights", error as Error);
			return null;
		}
	}

	/**
	 * Generate AI insights using OAuth session token
	 */
	private async generateInsightsWithSession(input: AIInsightsInput): Promise<AIInsights | null> {
		try {
			const response = await this.networkAdapter.post(`${this.baseUrl}/api/ai/generateInsights`, input, {
				Authorization: `Bearer ${this.sessionToken}`,
			});

			if (!response.ok) {
				if (response.status === 403) {
					logger.debug("AI insights require Pro subscription");
					return null;
				}
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return response.data as AIInsights;
		} catch (error) {
			logger.error("Failed to generate AI insights (session auth)", error as Error);
			return null;
		}
	}

	/**
	 * Get attribution data for the current authenticated user
	 *
	 * @returns Attribution record or null if not found/not authenticated
	 */
	public async getAttribution(): Promise<unknown | null> {
		await this.ensureApiKeyLoaded();

		if (!this.apiKey) {
			logger.debug("No API key - skipping attribution get");
			return null;
		}

		try {
			const response = await this.networkAdapter.get(`${this.baseUrl}/api/attribution`, {
				"X-API-Key": this.apiKey,
			});

			if (!response.ok) {
				if (response.status === 401) {
					logger.debug("Attribution get requires authentication");
					return null;
				}
				throw new Error(`API request failed: ${response.status} ${response.statusText}`);
			}

			return response.data;
		} catch (error) {
			logger.error("Failed to get attribution", error as Error);
			return null;
		}
	}
}
