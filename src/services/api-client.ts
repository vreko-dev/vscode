import * as vscode from "vscode";
import type { NetworkAdapter } from "../network/NetworkAdapter";
import { QueuedNetworkAdapter } from "../network/QueuedNetworkAdapter";
import { getSecureConfig } from "../security/SecureConfigService";
import { logger } from "../utils/logger";

// API client for SnapBack backend
export class ApiClient {
	private baseUrl: string;
	private apiKey: string | undefined;
	private apiKeyInitialized = false;
	private networkAdapter: NetworkAdapter;

	constructor(networkAdapter?: NetworkAdapter) {
		// Use provided network adapter or default to queued implementation
		this.networkAdapter = networkAdapter || new QueuedNetworkAdapter();

		try {
			// Get API configuration from VS Code settings
			const config = vscode.workspace.getConfiguration("snapback");
			this.baseUrl = config.get("api.baseUrl", "https://api.snapback.dev/api");

			// ✅ SECURITY (AUTH-030): API key now loaded lazily from SecureConfigService
			// No longer retrieved from workspace config to prevent exposure in settings.json
		} catch (error) {
			// In test environments, vscode.workspace might not be available
			// Use default values
			this.baseUrl = "https://api.snapback.dev/api";
			logger.debug("Using default API configuration", {
				reason: error instanceof Error ? error.message : "test environment",
			});
		}
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
		// ✅ SECURITY (AUTH-030): Load API key from SecretStorage before use
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
}
