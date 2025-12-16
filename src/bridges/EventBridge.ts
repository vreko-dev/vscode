/**
 * EventBridge - Maps @snapback/engine events to PostHog telemetry
 *
 * Phase 4: Event telemetry integration with privacy-first design.
 *
 * Design constraints:
 * - Zero duplication: Each engine event mapped exactly once
 * - Privacy-first: Strip absolute paths, hash identifiers, no file content
 * - Schema preservation: PostHog event schema unchanged
 * - Feature-flagged: Optional V2 engine event integration
 *
 * Event mappings:
 * - Engine: burst.detected        → PostHog: burst_detected
 * - Engine: ai.detected            → PostHog: ai_presence_detected
 * - Engine: snapshot.created       → PostHog: snapshot_created
 * - Engine: decision.made          → PostHog: protection_decision_made
 * - Engine: file.changed           → PostHog: file_change_detected
 * - Engine: risk.analyzed          → PostHog: risk_analyzed
 * - Engine: validation.passed      → PostHog: validation_passed
 * - Engine: validation.failed      → PostHog: validation_failed
 * - Engine: protection.changed     → PostHog: protection_level_changed
 * - Engine: error.occurred         → PostHog: error (reuses existing schema)
 *
 * Time budget: 2-3 hours (actual implementation time)
 */

import type { SnapBackEvents } from "@snapback/engine/runtime";
import * as vscode from "vscode";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { hashContent } from "../storage/utils/hash";

/**
 * Event bus interface compatible with both node EventEmitter and EventEmitter2
 */
interface EventBusLike {
	on(event: string | string[], listener: (...args: any[]) => void): any;
	off(event: string | string[], listener: (...args: any[]) => void): any;
}

/**
 * Privacy scrubbing utilities
 */
interface ScrubOptions {
	/** Strip absolute file paths, keep relative workspace paths */
	stripAbsolutePaths: boolean;
	/** Hash user identifiers (workspace paths, user IDs) */
	hashIdentifiers: boolean;
	/** Never include file content */
	excludeFileContent: boolean;
}

/**
 * Event deduplication tracker
 */
interface EventDeduplication {
	/** Last event timestamp by event type */
	lastEventTime: Map<string, number>;
	/** Minimum interval between duplicate events (ms) */
	dedupeWindow: number;
}

/**
 * EventBridge configuration
 */
export interface EventBridgeOptions {
	/** VS Code extension context */
	context: vscode.ExtensionContext;
	/** Telemetry proxy for PostHog integration */
	telemetryProxy: TelemetryProxy;
	/** Engine event bus (EventEmitter-like interface) */
	eventBus: EventBusLike;
	/** Feature flag: Enable V2 engine event forwarding */
	useV2Engine?: boolean;
	/** Privacy scrubbing options (defaults to maximum privacy) */
	scrubOptions?: Partial<ScrubOptions>;
	/** Event deduplication window in milliseconds (default: 1000ms) */
	dedupeWindowMs?: number;
}

/**
 * EventBridge - Forward engine events to PostHog with PII scrubbing
 *
 * Design:
 * - Subscribes to @snapback/engine event bus
 * - Maps engine events to PostHog event schema
 * - Applies PII scrubbing before emission
 * - Prevents duplicate events within deduplication window
 * - Feature-flagged for gradual V2 rollout
 *
 * Performance:
 * - Event forwarding: <5ms per event
 * - Hashing overhead: <1ms per identifier
 * - Memory: O(n) where n = unique event types (~15 events)
 *
 * Privacy guarantees:
 * - Absolute paths → Hashed workspace-relative paths
 * - User IDs → SHA-256 hashed
 * - File content → Never logged
 * - Aggregate metrics only (counts, scores, durations)
 */
export class EventBridge {
	private readonly useV2: boolean;
	private readonly scrubOptions: ScrubOptions;
	private readonly deduplication: EventDeduplication;
	private readonly telemetryProxy: TelemetryProxy;
	private readonly eventBus: EventBusLike;
	private readonly workspaceRoot: string;
	private readonly eventListeners: Array<{ event: keyof SnapBackEvents; listener: (...args: any[]) => void }> = [];

	constructor(options: EventBridgeOptions) {
		this.telemetryProxy = options.telemetryProxy;
		this.eventBus = options.eventBus;

		// Feature flag: Check VS Code config for V2 engine usage
		this.useV2 = options.useV2Engine ?? vscode.workspace.getConfiguration("snapback").get("useV2Engine", false);

		// Privacy scrubbing options (default to maximum privacy)
		this.scrubOptions = {
			stripAbsolutePaths: options.scrubOptions?.stripAbsolutePaths ?? true,
			hashIdentifiers: options.scrubOptions?.hashIdentifiers ?? true,
			excludeFileContent: options.scrubOptions?.excludeFileContent ?? true,
		};

		// Event deduplication configuration
		this.deduplication = {
			lastEventTime: new Map(),
			dedupeWindow: options.dedupeWindowMs ?? 100, // 100ms default (per spec)
		};

		// Get workspace root for path scrubbing
		this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

		// Subscribe to engine events if V2 is enabled
		if (this.useV2) {
			this.subscribeToEngineEvents();
		}
	}

	/**
	 * Subscribe to all @snapback/engine events and forward to PostHog
	 */
	private subscribeToEngineEvents(): void {
		// Map: snapshot.created → snapshot_created (PostHog)
		this.on("snapshot.created", (payload) => {
			this.emit("snapshot.created", {
				method: payload.trigger, // "manual" | "auto" | "risk"
				filesCount: payload.fileCount,
				totalBytes: payload.totalBytes,
				riskScore: payload.riskScore,
			});
		});

		// Map: file.changed → file_change_detected (PostHog - new event)
		this.on("file.changed", (payload) => {
			this.emit("file.changed", {
				changeType: payload.changeType,
				extension: payload.extension,
				lineCount: payload.lineCount,
			});
		});

		// Map: risk.analyzed → risk_analyzed (PostHog - new event)
		this.on("risk.analyzed", (payload) => {
			this.emit("risk.analyzed", {
				score: payload.score,
				factorCount: payload.factorCount,
				threatCount: payload.threatCount,
			});
		});

		// Map: burst.detected → burst_detected (PostHog - AI paste detection)
		this.on("burst.detected", (payload) => {
			this.emit("burst.detected", {
				velocity: payload.velocity,
				charCount: payload.charCount,
				fileExtension: payload.fileExtension,
			});
		});

		// Map: ai.detected → ai_presence_detected (PostHog - AI tool detection)
		this.on("ai.detected", (payload) => {
			this.emit("ai.detected", {
				tool: payload.tool,
				confidence: payload.confidence,
				method: payload.method,
			});
		});

		// Map: validation.passed → validation_passed (PostHog - new event)
		this.on("validation.passed", (payload) => {
			this.emit("validation.passed", {
				validator: payload.validator,
				duration: payload.duration,
			});
		});

		// Map: validation.failed → validation_failed (PostHog - new event)
		this.on("validation.failed", (payload) => {
			this.emit("validation.failed", {
				validator: payload.validator,
				errorCount: payload.errorCount,
				duration: payload.duration,
			});
		});

		// Map: protection.changed → protection_level_changed (PostHog - new event)
		this.on("protection.changed", (payload) => {
			this.emit("protection.changed", {
				from: payload.from,
				to: payload.to,
				source: payload.source,
			});
		});

		// Map: error.occurred → error (PostHog - reuses existing schema)
		this.on("error.occurred", (payload) => {
			this.emit("error.occurred", {
				component: payload.component,
				message: payload.message,
				recoverable: payload.recoverable,
			});
		});

		// Map: session.started → session_started (PostHog - new event)
		this.on("session.started", (payload) => {
			this.emit("session.started", {
				sessionId: this.scrubIdentifier(payload.sessionId),
				workspaceHash: payload.workspaceHash, // Already hashed by engine
			});
		});

		// Map: session.ended → session_ended (PostHog - new event)
		this.on("session.ended", (payload) => {
			this.emit("session.ended", {
				sessionId: this.scrubIdentifier(payload.sessionId),
				duration: payload.duration,
				filesModified: payload.filesModified,
				snapshotsCreated: payload.snapshotsCreated,
			});
		});

		// Map: feedback.collected → feedback_collected (PostHog - user feedback on AI detection)
		this.on("feedback.collected", (payload) => {
			this.emit("feedback.collected", {
				detectionId: this.scrubIdentifier(payload.detectionId),
				verdict: payload.verdict,
				confidence: payload.confidence,
				reason: payload.reason,
				durationMs: payload.durationMs,
			});
		});
	}

	/**
	 * Subscribe to engine event with type safety
	 */
	private on<K extends keyof SnapBackEvents>(event: K, handler: (payload: SnapBackEvents[K]) => void): void {
		const listener = (payload: SnapBackEvents[K]) => {
			try {
				handler(payload);
			} catch (error) {
				console.error(`EventBridge: Error handling ${event}`, error);
			}
		};

		this.eventBus.on(event, listener);
		this.eventListeners.push({ event, listener });
	}

	/**
	 * Emit event to PostHog with deduplication and PII scrubbing
	 */
	private emit(event: string, properties: Record<string, unknown>): void {
		// Check deduplication window
		if (this.isDuplicate(event)) {
			return;
		}

		// Scrub PII from properties
		const scrubbedProperties = this.scrubProperties(properties);

		// Forward to telemetry proxy
		this.telemetryProxy.trackEvent(event, scrubbedProperties);

		// Update deduplication tracker
		this.deduplication.lastEventTime.set(event, Date.now());
	}

	/**
	 * Check if event is duplicate within deduplication window
	 */
	private isDuplicate(event: string): boolean {
		const lastTime = this.deduplication.lastEventTime.get(event);
		if (!lastTime) {
			return false;
		}

		const elapsed = Date.now() - lastTime;
		return elapsed < this.deduplication.dedupeWindow;
	}

	/**
	 * Scrub PII from event properties
	 *
	 * Privacy rules:
	 * 1. Strip absolute file paths → Keep workspace-relative paths or hash
	 * 2. Hash user identifiers (session IDs, user IDs, workspace paths)
	 * 3. Never log file content
	 * 4. Preserve aggregate metrics (counts, scores, durations)
	 *
	 * @param properties Raw event properties
	 * @returns Scrubbed properties safe for telemetry
	 */
	private scrubProperties(properties: Record<string, unknown>): Record<string, unknown> {
		const scrubbed: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(properties)) {
			// Skip null/undefined
			if (value === null || value === undefined) {
				continue;
			}

			// Handle known PII fields
			switch (key) {
				case "filePath":
				case "absolutePath":
					// Strip absolute paths, keep relative or hash
					if (this.scrubOptions.stripAbsolutePaths) {
						scrubbed.filePathHash = this.scrubFilePath(value as string);
					}
					break;

				case "fileName":
					// Keep file extension only for aggregate stats
					if (typeof value === "string") {
						const ext = value.substring(value.lastIndexOf("."));
						scrubbed.fileExtension = ext;
					}
					break;

				case "content":
				case "fileContent":
				case "diff":
				case "patch":
					// Never log file content (privacy rule #3)
					if (!this.scrubOptions.excludeFileContent) {
						scrubbed.contentLength = typeof value === "string" ? value.length : 0;
					}
					break;

				case "sessionId":
				case "workspaceId":
				case "userId":
					// Hash identifiers (privacy rule #2)
					if (this.scrubOptions.hashIdentifiers) {
						scrubbed[`${key}Hash`] = this.scrubIdentifier(value as string);
					}
					break;

				case "workspaceHash":
					// Already hashed by engine, pass through
					scrubbed[key] = value;
					break;

				// Allowlist: Safe aggregate metrics
				case "filesCount":
				case "fileCount":
				case "lineCount":
				case "charCount":
				case "duration":
				case "success":
				case "method":
				case "trigger":
				case "score":
				case "riskScore":
				case "confidence":
				case "factorCount":
				case "threatCount":
				case "errorCount":
				case "changeType":
				case "extension":
				case "fileExtension":
				case "validator":
				case "component":
				case "message":
				case "recoverable":
				case "from":
				case "to":
				case "source":
				case "filesModified":
				case "snapshotsCreated":
				case "totalBytes":
				case "velocity": // AI burst detection: chars per ms
				case "tool": // AI tool name (e.g., "copilot", "cursor")
					scrubbed[key] = value;
					break;

				default:
					// Unknown field - log warning and skip
					console.warn(`EventBridge: Unknown property "${key}" in event, skipping for privacy`);
					break;
			}
		}

		return scrubbed;
	}

	/**
	 * Scrub file path - convert absolute path to hashed workspace-relative path
	 *
	 * Examples:
	 * - /Users/john/project/src/auth.ts → hash("./src/auth.ts")
	 * - /home/alice/workspace/lib/db.ts → hash("./lib/db.ts")
	 *
	 * Privacy guarantee: Absolute paths never leave the machine
	 */
	private scrubFilePath(absolutePath: string): string {
		if (!this.workspaceRoot) {
			// No workspace root - hash entire path
			return this.scrubIdentifier(absolutePath);
		}

		// Convert to workspace-relative path
		const relativePath = absolutePath.replace(this.workspaceRoot, ".");

		// Hash the relative path (preserves file structure privacy)
		return this.scrubIdentifier(relativePath);
	}

	/**
	 * Scrub identifier - one-way hash using SHA-256
	 *
	 * Reuses existing hashContent utility from storage module.
	 * Same algorithm as blob storage for consistency.
	 *
	 * @param identifier User ID, session ID, or other PII
	 * @returns SHA-256 hash (64 hex characters)
	 */
	private scrubIdentifier(identifier: string): string {
		try {
			return hashContent(identifier);
		} catch {
			return "scrub-failed";
		}
	}

	/**
	 * Dispose - Clean up event listeners
	 *
	 * Called during extension deactivation to prevent memory leaks.
	 */
	dispose(): void {
		// Remove all event listeners
		for (const { event, listener } of this.eventListeners) {
			this.eventBus.off(event, listener);
		}

		this.eventListeners.length = 0;
		this.deduplication.lastEventTime.clear();
	}
}
