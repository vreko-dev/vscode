import * as vscode from "vscode";
import type { NetworkAdapter } from "../network/NetworkAdapter.js";
import { QueuedNetworkAdapter } from "../network/QueuedNetworkAdapter.js";
import { logger } from "../utils/logger.js";

// API client for SnapBack backend
export class ApiClient {
	private baseUrl: string;
	private apiKey: string | undefined;
	private networkAdapter: NetworkAdapter;

	constructor(networkAdapter?: NetworkAdapter) {
		// Use provided network adapter or default to queued implementation
		this.networkAdapter = networkAdapter || new QueuedNetworkAdapter();

		try {
			// Get API configuration from VS Code settings
			const config = vscode.workspace.getConfiguration("snapback");
			this.baseUrl = config.get("api.baseUrl", "https://api.snapback.dev/api");
			this.apiKey = config.get("api.key");
		} catch (_error) {
			// In test environments, vscode.workspace might not be available
			// Use default values
			this.baseUrl = "https://api.snapback.dev/api";
			this.apiKey = undefined;
			logger.debug("Using default API configuration due to test environment");
		}
	}

	// Update API key
	public setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
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
			const response = await this.networkAdapter.post(
				`${this.baseUrl}/v1/analyze`,
				requestBody,
				{
					"X-API-Key": this.apiKey,
				},
			);

			if (!response.ok) {
				throw new Error(
					`API request failed: ${response.status} ${response.statusText} - ${response.text}`,
				);
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
			const response = await this.networkAdapter.post(
				`${this.baseUrl}/v1/detect-secrets`,
				requestBody,
				{
					"X-API-Key": this.apiKey,
				},
			);

			if (!response.ok) {
				throw new Error(
					`API request failed: ${response.status} ${response.statusText} - ${response.text}`,
				);
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
			const response = await this.networkAdapter.post(
				`${this.baseUrl}/v1/policy/evaluate`,
				requestBody,
				{
					"X-API-Key": this.apiKey,
				},
			);

			if (!response.ok) {
				throw new Error(
					`API request failed: ${response.status} ${response.statusText} - ${response.text}`,
				);
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
