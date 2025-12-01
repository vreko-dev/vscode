import * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Policy rule interface
 */
interface PolicyRule {
	id: string;
	pattern: string;
	level: "watch" | "warn" | "block" | "unprotected";
	reason?: string;
	precedence?: number;
}

/**
 * Policy bundle interface for rules validation
 */
interface PolicyBundle {
	version: string;
	minClientVersion: string;
	rules: PolicyRule[];
	metadata: {
		timestamp: number;
		schemaVersion: string;
	};
}

/**
 * Snapback API client for fetching rules and policies
 */
export class SnapbackAPI {
	private static instance: SnapbackAPI;
	private baseUrl: string;
	private apiKey: string | null = null;

	private constructor() {
		// Default to production API
		this.baseUrl = "https://api.snapback.dev";

		// Check for development API endpoint
		const config = vscode.workspace.getConfiguration("snapback");
		const apiEndpoint = config.get<string>("apiEndpoint");
		if (apiEndpoint) {
			this.baseUrl = apiEndpoint;
		}
	}

	public static getInstance(): SnapbackAPI {
		if (!SnapbackAPI.instance) {
			SnapbackAPI.instance = new SnapbackAPI();
		}
		return SnapbackAPI.instance;
	}

	/**
	 * Set API key for authentication
	 */
	public setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
	}

	/**
	 * Get rules bundle with ETag caching
	 */
	public async getRulesBundle(etag?: string): Promise<{
		bundle?: string;
		etag?: string;
		notModified?: boolean;
		tier?: string;
	}> {
		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};

			// Add API key if available
			if (this.apiKey) {
				headers.Authorization = `Bearer ${this.apiKey}`;
			}

			// Add ETag header for conditional request
			if (etag) {
				headers["If-None-Match"] = etag;
			}

			const response = await this.fetchWithTimeout(
				`${this.baseUrl}/api/rules/getBundle`,
				{
					method: "GET",
					headers,
				},
			);

			// Handle 304 Not Modified
			if (response.status === 304) {
				return {
					notModified: true,
				};
			}

			// Handle successful response
			if (response.ok) {
				const data = (await response.json()) as {
					bundle: string;
					tier: string;
				};
				const responseEtag = response.headers.get("ETag");

				return {
					bundle: data.bundle,
					etag: responseEtag || undefined,
					tier: data.tier,
				};
			}

			// Handle errors
			const errorText = await response.text();
			logger.error(`API request failed: ${response.status} - ${errorText}`);
			throw new Error(`API request failed: ${response.status}`);
		} catch (error) {
			logger.error("Failed to fetch rules bundle", error as Error);
			throw error;
		}
	}

	/**
	 * Fetch with timeout
	 */
	private async fetchWithTimeout(
		url: string,
		options: RequestInit,
		timeout = 10000,
	): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
			});
			clearTimeout(timeoutId);
			return response;
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}

	/**
	 * Validate a JWS-signed rules bundle
	 * MVP implementation - in production this would verify the signature
	 */
	public async validateRulesBundle(bundle: string): Promise<PolicyBundle> {
		try {
			// For MVP, we'll just decode the JWT payload
			// In a real implementation, this would verify the JWS signature
			const payload = bundle.split(".")[1];
			if (!payload) {
				throw new Error("Invalid bundle format");
			}

			// Decode base64 payload
			const decoded = atob(payload);
			return JSON.parse(decoded) as PolicyBundle;
		} catch (error) {
			logger.error("Failed to validate rules bundle", error as Error);
			throw new Error("Invalid rules bundle");
		}
	}
}
