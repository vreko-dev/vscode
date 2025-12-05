// Type declarations for Snapback SDK exports that are not properly exported due to dts: false in SDK

export type ClientSurface = "vscode" | "mcp" | "cli" | "web";

export interface Envelope {
	session_id: string;
	request_id: string;
	workspace_id?: string;
	client: ClientSurface;
}

export interface SDKConfig {
	endpoint: string;
	apiKey: string;
	privacy: {
		hashFilePaths: boolean;
		anonymizeWorkspace: boolean;
	};
	cache: {
		enabled: boolean;
		ttl: Record<string, number>;
	};
	retry: {
		maxRetries: number;
		backoffMs: number;
	};
}

export class SnapbackClient {
	constructor(config: SDKConfig);
	getHttpClient(): any;
}

export interface AnalyzeRequest {
	content: string;
	filePath: string;
	language?: string;
}

export interface AnalyzeResponse {
	decision: "allow" | "review" | "block";
	confidence: number;
	rules_hit: string[];
	metadata?: Record<string, any>;
}

export interface PolicyEvaluationRequest {
	policyId?: string;
	context: Record<string, any>;
}

export interface PolicyEvaluationResponse {
	decision: "allow" | "review" | "block";
	confidence: number;
	rules_hit: string[];
	policyVersion: string;
}

export interface TelemetryData {
	eventType: string;
	payload: Record<string, any>;
	timestamp: number;
}

export interface TelemetryResponse {
	id: string;
	received: boolean;
}

export function analyze(
	client: SnapbackClient,
	envelope: Envelope,
	request: AnalyzeRequest,
): Promise<AnalyzeResponse>;

export function evaluatePolicy(
	client: SnapbackClient,
	envelope: Envelope,
	request: PolicyEvaluationRequest,
): Promise<PolicyEvaluationResponse>;

export function ingestTelemetry(
	client: SnapbackClient,
	envelope: Envelope,
	data: TelemetryData,
): Promise<TelemetryResponse>;
