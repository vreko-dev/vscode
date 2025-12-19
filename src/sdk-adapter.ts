import * as vscode from "vscode";
import { analyze, type Envelope, evaluatePolicy, ingestTelemetry, SnapbackClient } from "./sdk-types";
import { getSecureConfig } from "./security/SecureConfigService";

/**
 * SDK Adapter for VS Code Extension
 * Wraps the Snapback SDK for use in the VS Code extension
 */

export class VSCodeSDKAdapter {
	private _clientPromise: Promise<SnapbackClient>;
	private sessionId: string;
	private workspaceId: string | undefined;

	constructor() {
		// Generate a session ID for this VS Code session
		this.sessionId = this.generateSessionId();

		// Get workspace ID from VS Code
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			this.workspaceId = workspaceFolders[0].uri.fsPath;
		}

		// ✅ SECURITY (AUTH-030): Initialize client asynchronously with SecretStorage
		this._clientPromise = this.initializeClient();
	}

	/**
	 * Initialize SDK client with API key from SecretStorage
	 *
	 * ✅ SECURITY (AUTH-030): Loads API key from encrypted storage
	 */
	private async initializeClient(): Promise<SnapbackClient> {
		const config = vscode.workspace.getConfiguration("snapback");
		const baseUrl = config.get("api.baseUrl", "https://api.snapback.dev");

		// ✅ Load API key from SecretStorage (not workspace config)
		const secureConfig = getSecureConfig();
		const apiKey = await secureConfig.get("api.key");

		return new SnapbackClient({
			endpoint: baseUrl,
			apiKey: apiKey,
			privacy: {
				hashFilePaths: true,
				anonymizeWorkspace: false,
			},
			cache: {
				enabled: true,
				ttl: {},
			},
			retry: {
				maxRetries: 3,
				backoffMs: 1000,
			},
		});
	}

	/**
	 * Ensure client is initialized before use
	 */
	private async ensureClientReady(): Promise<SnapbackClient> {
		return await this._clientPromise;
	}

	/**
	 * Generate a unique ID with timestamp and random suffix
	 */
	private generateUniqueId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
	}

	/**
	 * Generate a unique session ID
	 */
	private generateSessionId(): string {
		return this.generateUniqueId();
	}

	/**
	 * Create envelope for requests
	 */
	private createEnvelope(): Envelope {
		return {
			session_id: this.sessionId,
			request_id: this.generateRequestId(),
			workspace_id: this.workspaceId,
			client: "vscode",
		};
	}

	/**
	 * Generate a unique request ID
	 */
	private generateRequestId(): string {
		return this.generateUniqueId();
	}

	/**
	 * Analyze code content
	 */
	async analyzeContent(content: string, filePath: string, language?: string): Promise<unknown> {
		const client = await this.ensureClientReady();
		const envelope = this.createEnvelope();

		return await analyze(client, envelope, {
			content,
			filePath,
			language,
		});
	}

	/**
	 * Evaluate policy
	 */
	async evaluatePolicy(context: Record<string, unknown>): Promise<unknown> {
		const client = await this.ensureClientReady();
		const envelope = this.createEnvelope();

		return await evaluatePolicy(client, envelope, {
			context,
		});
	}

	/**
	 * Ingest telemetry data
	 */
	async ingestTelemetry(eventType: string, payload: Record<string, unknown>): Promise<unknown> {
		const client = await this.ensureClientReady();
		const envelope = this.createEnvelope();

		return await ingestTelemetry(client, envelope, {
			eventType,
			payload,
			timestamp: Date.now(),
		});
	}
}
