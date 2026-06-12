/**
 * OSS SDK Types & Stubs - Local definitions for thin client architecture
 *
 * Replaces @vreko-oss/sdk imports with local minimal implementations.
 */

// Re-export canonical FileChange from fileChanges.ts (single source of truth)
export type { FileChange } from "./fileChanges";

import type { FileChange } from "./fileChanges";

// =============================================================================
// LOGGER
// =============================================================================

export interface ILogger {
	debug(message: string, data?: unknown): void;
	info(message: string, data?: unknown): void;
	error(message: string, error?: Error, data?: unknown): void;
}

// =============================================================================
// FILE SYSTEM PROVIDER
// =============================================================================

export interface IFileSystemProvider {
	glob(patterns: string[], cwd: string, options?: { ignore?: string[] }): Promise<string[]>;
	readFile(filePath: string): Promise<string>;
}

// =============================================================================
// SNAPSHOT NAMING STRATEGY
// =============================================================================

export interface SnapshotInfo {
	id: string;
	origin: string;
	createdAt: number;
	files: Array<{ path: string; content?: string }>;
	metadata?: Record<string, unknown>;
}

export interface SnapshotNamingStrategyOptions {
	workspaceRoot?: string;
	logger?: ILogger;
}

export class SnapshotNamingStrategy {
	constructor(_workspaceRoot?: string, _options?: SnapshotNamingStrategyOptions) {
		void _workspaceRoot;
		void _options;
	}

	generateName(info: SnapshotInfo, _fileChanges?: FileChange[]): string {
		const fileCount = info.files?.length ?? 0;
		const origin = info.origin ?? "manual";
		if (fileCount === 0) {
			return `${origin} snapshot`;
		}
		const primaryFile = info.files[0]?.path?.split("/").pop() ?? "file";
		return `${origin}: ${primaryFile}${fileCount > 1 ? ` +${fileCount - 1}` : ""}`;
	}
}

// =============================================================================
// SNAPSHOT DELETION SERVICE
// =============================================================================

export interface DeletableSnapshot {
	id: string;
	createdAt: number;
	origin?: string;
	label?: string;
	fileCount?: number;
}

export interface ISnapshotManagerForDeletion {
	listAll(): Promise<DeletableSnapshot[]>;
	delete(id: string): Promise<void>;
}

export interface AutoCleanupConfig {
	enabled: boolean;
	maxSnapshotCount?: number;
	maxAgeDays?: number;
	minKeepCount?: number;
}

export interface DeletionOptions {
	maxAgeDays?: number;
	maxCount?: number;
	keepMinimum?: number;
	dryRun?: boolean;
	/** Skip user confirmation dialog */
	skipConfirmation?: boolean;
	/** Unprotect snapshot before deletion (otherwise throws error) */
	unprotectFirst?: boolean;
}

export interface DeletionResult {
	/** Whether the operation completed successfully */
	success: boolean;
	/** Number of snapshots deleted */
	deletedCount: number;
	/** Error message if operation failed */
	error?: string;
	/** @deprecated Legacy field */
	deleted?: string[];
	/** @deprecated Legacy field */
	skipped?: string[];
	/** @deprecated Legacy field */
	errors?: Array<{ id: string; error: string }>;
}

export interface IConfirmationService {
	confirm(message: string, detail?: string): Promise<boolean>;
}

export interface SnapshotDeletionServiceOptions {
	snapshotManager: ISnapshotManagerForDeletion;
	logger?: ILogger;
	confirmationService?: IConfirmationService;
}

export class SnapshotDeletionService {
	private options: SnapshotDeletionServiceOptions;

	constructor(options: SnapshotDeletionServiceOptions) {
		this.options = options;
	}

	async cleanup(config: DeletionOptions): Promise<DeletionResult> {
		const all = await this.options.snapshotManager.listAll();
		const deleted: string[] = [];
		const skipped: string[] = [];
		const errors: Array<{ id: string; error: string }> = [];

		const sorted = [...all].sort((a, b) => b.createdAt - a.createdAt);
		const keepMin = config.keepMinimum ?? 5;
		const maxCount = config.maxCount ?? Number.POSITIVE_INFINITY;
		const maxAgeMs = config.maxAgeDays ? config.maxAgeDays * 86400000 : Number.POSITIVE_INFINITY;
		const now = Date.now();

		for (let i = 0; i < sorted.length; i++) {
			const snap = sorted[i];
			if (i < keepMin) {
				skipped.push(snap.id);
				continue;
			}
			const age = now - snap.createdAt;
			if (i >= maxCount || age > maxAgeMs) {
				if (!config.dryRun) {
					try {
						await this.options.snapshotManager.delete(snap.id);
						deleted.push(snap.id);
					} catch (e) {
						errors.push({ id: snap.id, error: String(e) });
					}
				} else {
					deleted.push(snap.id);
				}
			} else {
				skipped.push(snap.id);
			}
		}

		return { success: errors.length === 0, deletedCount: deleted.length, deleted, skipped, errors };
	}

	async deleteSnapshot(id: string, _options?: DeletionOptions): Promise<DeletionResult> {
		try {
			await this.options.snapshotManager.delete(id);
			return { success: true, deletedCount: 1, deleted: [id], skipped: [], errors: [] };
		} catch (e) {
			return { success: false, deletedCount: 0, deleted: [], skipped: [], errors: [{ id, error: String(e) }] };
		}
	}

	async deleteOlderThan(timestamp: number, keepProtected = true): Promise<DeletionResult> {
		const maxAgeMs = Date.now() - timestamp;
		const maxAgeDays = Math.ceil(maxAgeMs / 86400000);
		return this.cleanup({ maxAgeDays, keepMinimum: keepProtected ? 5 : 0 });
	}

	async autoCleanup(config: AutoCleanupConfig): Promise<DeletionResult> {
		if (!config.enabled) {
			return { success: true, deletedCount: 0, deleted: [], skipped: [], errors: [] };
		}
		return this.cleanup({
			maxAgeDays: config.maxAgeDays,
			maxCount: config.maxSnapshotCount,
			keepMinimum: config.minKeepCount,
		});
	}
}

// =============================================================================
// SNAPSHOT ICON STRATEGY
// =============================================================================

// Re-export canonical IconResult from snapshotInfo.ts (single source of truth)
export type { IconResult } from "./snapshotInfo";

import type { IconResult } from "./snapshotInfo";

/**
 * Minimal metadata for icon classification.
 * Not the same as snapshot.ts SnapshotMetadata (which is richer).
 */
export interface SnapshotIconInput {
	origin?: string;
	aiTool?: string;
	isAIDetected?: boolean;
	[key: string]: unknown;
}

/** @deprecated Use SnapshotIconInput instead */
export type SnapshotMetadata = SnapshotIconInput;

export class SnapshotIconStrategy {
	getIcon(metadata?: SnapshotIconInput): IconResult {
		if (metadata?.isAIDetected || metadata?.aiTool) {
			return { icon: "🤖", color: "charts.purple" };
		}
		switch (metadata?.origin) {
			case "manual":
				return { icon: "📸", color: "charts.blue" };
			case "auto":
				return { icon: "⚡", color: "charts.green" };
			case "pre-save":
				return { icon: "💾", color: "charts.yellow" };
			default:
				return { icon: "📷", color: "charts.foreground" };
		}
	}

	classifyIcon(metadata?: SnapshotIconInput): IconResult {
		return this.getIcon(metadata);
	}
}

// =============================================================================
// CONFIG DETECTOR
// =============================================================================
// NOTE: This is an intentional thin-client stub. Config detection is a
// client-side operation that scans local files (package.json, tsconfig.json, etc.)
// and does not require daemon delegation. The daemon protocol does not have
// equivalent methods for config detection.
// =============================================================================

export interface DetectedConfig {
	type: string;
	path: string;
	patterns: string[];
}

export class ConfigDetector {
	constructor(_workspaceRoot?: string, _fileSystemProvider?: unknown) {
		void _workspaceRoot;
		void _fileSystemProvider;
	}

	/**
	 * Detect project configurations by scanning local files.
	 * This is a client-side operation - no daemon delegation needed.
	 */
	async detect(): Promise<DetectedConfig[]> {
		return [];
	}

	/**
	 * Get protected file patterns from detected configs.
	 * This is a client-side operation - no daemon delegation needed.
	 */
	async getProtectedPatterns(): Promise<string[]> {
		return [];
	}
}

// =============================================================================
// DEVICE AUTH
// =============================================================================
// NOTE: This is an intentional thin-client stub. Device authentication is a
// client-side OAuth flow that communicates directly with the cloud API
// (api.vreko.dev). It does not use the daemon because:
// 1. Auth is for cloud services, not local operations
// 2. The daemon does not proxy cloud authentication
// 3. OAuth device flow requires browser interaction
// =============================================================================

export type FlowState = "idle" | "requesting" | "polling" | "complete" | "error" | "cancelled";

export interface DeviceCodeResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	expires_in: number;
	interval: number;
}

export interface AuthResult {
	apiKey: string;
	userId?: string;
	refreshToken?: string;
	expiresIn?: number;
	tier?: string;
}

interface TokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	tier?: string;
	user?: { email?: string };
	error?: string;
}

interface ProvisionResponse {
	apiKey?: { key?: string };
}

export interface DeviceAuthClientOptions {
	onDeviceCode?: (response: DeviceCodeResponse) => Promise<void>;
	onPoll?: (attempt: number, intervalMs: number) => void;
	onSlowDown?: (newIntervalMs: number) => void;
	onApproved?: (result: AuthResult) => Promise<void>;
	onError?: (error: Error) => void;
	onCancelled?: () => void;
	onStateChange?: (state: FlowState) => void;
}

export interface DeviceAuthClient {
	authenticate(options?: DeviceAuthClientOptions): Promise<AuthResult>;
	cancel(): void;
	getState(): FlowState;
}

/**
 * Real DeviceAuthClient implementation
 * Communicates with the web app's Better Auth device authorization endpoints
 */
class RealDeviceAuthClient implements DeviceAuthClient {
	private state: FlowState = "idle";
	private abortController: AbortController | null = null;
	private currentInterval = 5000;
	private baseUrl: string;
	private clientId: string;

	constructor(baseUrl: string, clientId: string) {
		this.baseUrl = baseUrl;
		this.clientId = clientId;
	}

	getState(): FlowState {
		return this.state;
	}

	cancel(): void {
		this.abortController?.abort();
		this.state = "cancelled";
	}

	async authenticate(options?: DeviceAuthClientOptions): Promise<AuthResult> {
		if (this.state === "requesting" || this.state === "polling") {
			throw new Error("Authentication already in progress");
		}

		this.abortController = new AbortController();
		this.state = "requesting";

		try {
			// Step 1: Request device code
			const codeResponse = await this.requestDeviceCode();
			await options?.onDeviceCode?.(codeResponse);

			// Step 2: Poll for token
			this.currentInterval = codeResponse.interval * 1000;
			this.state = "polling";

			const result = await this.pollForToken(codeResponse, options);
			this.state = "complete";
			await options?.onApproved?.(result);

			return result;
		} catch (error) {
			const currentState = this.state as FlowState;
			if (currentState === "cancelled") {
				options?.onCancelled?.();
			} else {
				this.state = "error";
				options?.onError?.(error instanceof Error ? error : new Error(String(error)));
			}
			throw error;
		}
	}

	private async requestDeviceCode(): Promise<DeviceCodeResponse> {
		const response = await fetch(`${this.baseUrl}/auth/device/code`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: this.clientId,
			}),
			signal: this.abortController?.signal,
		});

		if (!response.ok) {
			throw new Error(`Device code request failed: ${response.statusText}`);
		}

		return response.json() as Promise<DeviceCodeResponse>;
	}

	private async pollForToken(
		codeResponse: DeviceCodeResponse,
		options?: DeviceAuthClientOptions,
	): Promise<AuthResult> {
		const startTime = Date.now();
		const timeoutMs = codeResponse.expires_in * 1000;
		let attempt = 0;

		while (true) {
			if (Date.now() - startTime > timeoutMs) {
				throw new Error("Device code expired");
			}

			if (this.abortController?.signal.aborted) {
				this.state = "cancelled";
				throw new Error("Authentication cancelled");
			}

			await this.delay(this.currentInterval);
			attempt++;
			options?.onPoll?.(attempt, this.currentInterval);

			try {
				const response = await fetch(`${this.baseUrl}/auth/device/token`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						device_code: codeResponse.device_code,
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						client_id: this.clientId,
					}),
					signal: this.abortController?.signal,
				});

				const data = (await response.json()) as TokenResponse;

				// Check for success
				if (data.access_token) {
					// Call auto-provision to get an API key
					const provisionResponse = await fetch(`${this.baseUrl}/apikeys/auto-provision`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${data.access_token}`,
						},
						body: JSON.stringify({ source: "extension" }),
					});

					if (provisionResponse.ok) {
						const provisionData = (await provisionResponse.json()) as ProvisionResponse;
						return {
							apiKey: provisionData.apiKey?.key || data.access_token,
							userId: data.user?.email,
							refreshToken: data.refresh_token,
							expiresIn: data.expires_in,
							tier: data.tier || "free",
						};
					}

					// Fall back to using access token as API key
					return {
						apiKey: data.access_token,
						userId: data.user?.email,
						refreshToken: data.refresh_token,
						expiresIn: data.expires_in,
						tier: data.tier || "free",
					};
				}

				// Handle RFC 8628 error codes
				if (data.error) {
					switch (data.error) {
						case "authorization_pending":
							break; // Continue polling
						case "slow_down":
							this.currentInterval += 5000;
							options?.onSlowDown?.(this.currentInterval);
							break;
						case "access_denied":
							throw new Error("Authorization denied by user");
						case "expired_token":
							throw new Error("Device code expired");
						default:
							throw new Error(`Auth error: ${data.error}`);
					}
				}
			} catch (_error) {
				if (this.abortController?.signal.aborted) {
					throw new Error("Authentication cancelled");
				}
				// Network errors - continue polling
			}
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => {
			const timeout = setTimeout(resolve, ms);
			this.abortController?.signal.addEventListener(
				"abort",
				() => {
					clearTimeout(timeout);
					resolve();
				},
				{ once: true },
			);
		});
	}
}

export function createDeviceAuthClient(baseUrl: string, clientId: string): DeviceAuthClient {
	return new RealDeviceAuthClient(baseUrl, clientId);
}
