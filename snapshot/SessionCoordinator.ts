/**
 * VSCode SessionCoordinator - Session management for VS Code extension
 *
 * This module provides VSCode-specific integration with the platform-agnostic
 * SessionCoordinator from @vreko/sdk. It handles VSCode-specific concerns:
 * - Event emission via vscode.EventEmitter adapter
 * - Performance monitoring integration
 * - VSCode logging integration
 * - SQLite storage integration
 *
 * Delegates to the CLI daemon via DaemonBridge for session operations:
 * - session.start - start a new session
 * - session.end - finalize a session
 * - session.status - get current session state
 * - session.review - review session changes
 *
 * @see DaemonBridge for the daemon RPC protocol
 * @see apps/cli/src/daemon/protocol.ts for available daemon methods
 * @module SessionCoordinator
 */

import type * as vscode from "vscode";
import { VscodeEventEmitterAdapter } from "../adapters/VscodeEventEmitterAdapter";
import { getSessionPerfMonitor } from "../performance/sessionPerfMonitor";
import type { IStorageManager } from "../storage/types.js";
import { getCoreEventTracker } from "../telemetry/core-event-tracker";
import type { ILogger } from "../types/oss-sdk";
import type { SessionFileEntry, SessionFinalizeReason, SessionId, SessionManifest } from "../types/sdk";
import { logger } from "../utils/logger";

/**
 * VSCode-specific logger adapter
 */
class _VscodeLoggerAdapter implements ILogger {
	debug(message: string, data?: unknown): void {
		logger.debug(message, data);
	}

	info(message: string, data?: unknown): void {
		logger.info(message, data);
	}

	error(message: string, error?: Error, data?: unknown): void {
		logger.error(message, error, data);
	}
}

/**
 * VSCode-specific storage adapter
 */
interface ISessionStorage {
	storeSessionManifest(manifest: SessionManifest): Promise<void>;
	listSessionManifests(): Promise<SessionManifest[]>;
	getSessionManifest(sessionId: string): Promise<SessionManifest | null>;
}

class VscodeStorageAdapter implements ISessionStorage {
	constructor(private storage: IStorageManager) {
		/* intentionally empty */
	}

	/**
	 * Store session manifest - TRUST SDK DECISION COMPLETELY
	 *
	 * Per arch_remediation.md Task 1.1: The adapter must trust the SDK's
	 * session finalization decision. The SDK owns the "whether" decision,
	 * the adapter only handles "how" to store.
	 *
	 * DO NOT add conditional logic based on manifest content (e.g., files.length).
	 * If the SDK decided to create a session, we store it without question.
	 */
	async storeSessionManifest(manifest: SessionManifest): Promise<void> {
		const files = (manifest as SessionManifest).files || [];
		const rawReason = (manifest as SessionManifest).reason || "manual";
		const triggers = (manifest as SessionManifest).triggers || [rawReason];

		// Map SDK reason to storage reason type
		const reason: "idle" | "manual" | "window-close" | "timeout" =
			rawReason === "window-blur"
				? "window-close"
				: rawReason === "manual"
					? "manual"
					: rawReason === "timeout"
						? "timeout"
						: rawReason === "idle"
							? "idle"
							: "manual"; // default fallback

		logger.debug("storeSessionManifest called", { manifestId: manifest.id, filesCount: files.length });

		// Ensure SessionStore has an active session before finalizing
		// Note: SDK SessionCoordinator uses its own session IDs (session-XXX)
		// while SessionStore uses different IDs (sess-XXX). This creates a session
		// in SessionStore when SDK is ready to finalize its session.
		const activeSessionId = this.storage.getActiveSessionId?.();
		if (!activeSessionId) {
			logger.debug("No active SessionStore session, starting one");
			await this.storage.createSession(manifest.startedAt);
		}

		// Convert SDK SessionFileEntry to storage SessionFileEntry format
		const storageFiles = files.map((f) => ({
			filePath: f.uri,
			snapshotId: f.snapshotId,
			changeStats: f.changeStats || { added: 0, deleted: 0 },
		}));

		logger.debug("Calling storage.finalizeSession", {
			manifestId: manifest.id,
			reason,
			filesCount: storageFiles.length,
		});
		await this.storage.finalizeSession(manifest.id, manifest.endedAt, reason, storageFiles);
		logger.debug("storage.finalizeSession completed");

		// Track session_finalized event (P0 - Demo Critical)
		// Fire-and-forget to avoid blocking session finalization
		const coreTracker = getCoreEventTracker();
		if (coreTracker) {
			const duration_ms = manifest.endedAt - manifest.startedAt;
			const extManifest = manifest as SessionManifest & {
				ai_present?: boolean;
				ai_burst?: boolean;
				highest_severity?: "info" | "low" | "medium" | "high" | "critical";
				ai_assist_level?: "none" | "light" | "medium" | "heavy" | "unknown";
				ai_confidence_score?: number;
				ai_provider?: "none" | "cursor" | "claude" | "unknown";
				ai_large_insert_count?: number;
				ai_total_chars?: number;
			};

			// Extract file paths from manifest (privacy: use relative paths only)
			const filePaths = files.map((f: SessionFileEntry) => f.uri);

			coreTracker.trackSessionFinalized({
				session_id: manifest.id,
				files: filePaths,
				triggers,
				duration_ms,
				ai_present: extManifest.ai_present ?? false,
				ai_burst: extManifest.ai_burst ?? false,
				highest_severity: extManifest.highest_severity || "info",
				// Optional AI detection v1 fields
				ai_assist_level: extManifest.ai_assist_level,
				ai_confidence_score: extManifest.ai_confidence_score,
				ai_provider: extManifest.ai_provider,
				ai_large_insert_count: extManifest.ai_large_insert_count,
				ai_total_chars: extManifest.ai_total_chars,
			});

			logger.debug("session_finalized event tracked", {
				session_id: manifest.id,
				files_count: filePaths.length,
				duration_ms,
			});
		}
	}

	async listSessionManifests(): Promise<SessionManifest[]> {
		// Map to new StorageManager API
		const result = await this.storage.listSessions();
		return (Array.isArray(result) ? result : []) as unknown as SessionManifest[];
	}

	async getSessionManifest(sessionId: string): Promise<SessionManifest | null> {
		// Map to new StorageManager API
		return (await this.storage.getSession(sessionId)) as unknown as SessionManifest | null;
	}
}

/**
 * SessionCoordinator - VSCode-specific wrapper around SDK SessionCoordinator
 *
 * This class wraps the platform-agnostic SessionCoordinator from the SDK
 * and provides VSCode-specific integrations while maintaining the same API.
 */
export class SessionCoordinator {
	private storage: VscodeStorageAdapter;
	private eventEmitter: VscodeEventEmitterAdapter<SessionManifest>;
	private candidates: Map<string, { snapshotId: string; stats?: { added: number; deleted: number } }> = new Map();
	private sessionStartTime = Date.now();
	private currentSessionId: string | null = null;

	/** Event for when sessions are finalized */
	public readonly onSessionFinalized: vscode.Event<SessionManifest>;

	/**
	 * Creates a new SessionCoordinator
	 *
	 * @param storage - Storage adapter for persisting session manifests
	 */
	constructor(storage: IStorageManager) {
		this.eventEmitter = new VscodeEventEmitterAdapter<SessionManifest>();
		this.storage = new VscodeStorageAdapter(storage);
		this.onSessionFinalized = this.eventEmitter.event;
	}

	/**
	 * Get the number of candidates in the current session
	 * @internal For testing only
	 */
	getCandidateCount(): number {
		return this.candidates.size;
	}

	/**
	 * Add or update a file candidate in the current session
	 *
	 * @param uri - URI of the file
	 * @param snapshotId - ID of the snapshot for this file
	 * @param stats - Optional change statistics
	 */
	addCandidate(uri: string, snapshotId: string, stats?: { added: number; deleted: number }): void {
		logger.debug("addCandidate called", { uri, snapshotId, stats });
		const perfMonitor = getSessionPerfMonitor();
		const operationId = perfMonitor?.startOperation("sessionCoordinator.addCandidate");

		try {
			this.candidates.set(uri, { snapshotId, stats });
			if (!this.currentSessionId) {
				this.currentSessionId = `session-${Date.now()}`;
				this.sessionStartTime = Date.now();
			}
			logger.debug("addCandidate completed");
		} finally {
			if (operationId && perfMonitor) {
				perfMonitor.endOperation(operationId);
			}
		}
	}

	/**
	 * Finalize the current session with a specific reason
	 *
	 * @param reason - Reason for finalizing the session
	 * @returns Session ID if finalized, null if skipped
	 */
	async finalizeSession(reason: SessionFinalizeReason): Promise<SessionId | null> {
		logger.debug("finalizeSession called", { reason });
		const perfMonitor = getSessionPerfMonitor();
		const operationId = perfMonitor?.startOperation("sessionCoordinator.finalizeSession");

		try {
			if (this.candidates.size === 0) {
				logger.debug("No candidates, skipping finalization");
				return null;
			}

			const sessionId = this.currentSessionId ?? `session-${Date.now()}`;

			// Convert candidates map to SessionFileEntry array
			const fileEntries: SessionFileEntry[] = Array.from(this.candidates.entries()).map(([uri, candidate]) => ({
				uri,
				snapshotId: candidate.snapshotId,
				changeStats: candidate.stats,
			}));

			const manifest: SessionManifest = {
				id: sessionId,
				startedAt: this.sessionStartTime,
				endedAt: Date.now(),
				snapshotCount: this.candidates.size,
				fileCount: this.candidates.size,
				files: fileEntries,
				reason,
			};

			await this.storage.storeSessionManifest(manifest);
			this.eventEmitter.fire(manifest);
			this.candidates.clear();
			this.currentSessionId = null;

			logger.debug("finalizeSession completed", { result: sessionId });
			return sessionId;
		} finally {
			if (operationId && perfMonitor) {
				perfMonitor.endOperation(operationId);
			}
		}
	}

	/**
	 * Handle window blur event - finalize session due to window focus change
	 */
	handleWindowBlur(): void {
		logger.debug("handleWindowBlur called");
		void this.finalizeSession("window-blur");
	}

	handleGitCommit(): void {
		void this.finalizeSession("git-commit");
	}

	handleTaskCompletion(): void {
		void this.finalizeSession("task-complete");
	}

	handleManualFinalization(): void {
		void this.finalizeSession("manual");
	}

	dispose(): void {
		this.candidates.clear();
		this.currentSessionId = null;
	}
}
