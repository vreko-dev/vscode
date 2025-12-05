import * as vscode from "vscode";
import {
	analyze,
	type Envelope,
	evaluatePolicy,
	ingestTelemetry,
	SnapbackClient,
} from "./sdk-types";

/**
 * SDK Adapter for VS Code Extension
 * Wraps the Snapback SDK for use in the VS Code extension
 */

export class VSCodeSDKAdapter {
	private _client: SnapbackClient;
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

		// Initialize the Snapback client
		const config = vscode.workspace.getConfiguration("snapback");
		const baseUrl = config.get("api.baseUrl", "https://api.snapback.dev");
		const apiKey = config.get("api.key", "");

		this._client = new SnapbackClient({
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
	async analyzeContent(
		content: string,
		filePath: string,
		language?: string,
	): Promise<unknown> {
		const envelope = this.createEnvelope();

		return await analyze(this._client, envelope, {
			content,
			filePath,
			language,
		});
	}

	/**
	 * Evaluate policy
	 */
	async evaluatePolicy(context: Record<string, unknown>): Promise<unknown> {
		const envelope = this.createEnvelope();

		return await evaluatePolicy(this._client, envelope, {
			context,
		});
	}

	/**
	 * Ingest telemetry data
	 */
	async ingestTelemetry(
		eventType: string,
		payload: Record<string, unknown>,
	): Promise<unknown> {
		const envelope = this.createEnvelope();

		return await ingestTelemetry(this._client, envelope, {
			eventType,
			payload,
			timestamp: Date.now(),
		});
	}
}
