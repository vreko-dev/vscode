/**
 * VSCode SessionCoordinator - Wrapper around SDK SessionCoordinator
 *
 * @deprecated **ARCHITECTURE_REFACTOR_SPEC.md Phase 3**: This extension-side wrapper is deprecated.
 * Session management should be handled via CLI daemon for workflow operations:
 *
 * ```typescript
 * // ❌ OLD (deprecated)
 * const coordinator = new SessionCoordinator(storage);
 * coordinator.addCandidate(uri, snapshotId);
 *
 * // ✅ NEW (use DaemonBridge for session workflows)
 * import { getDaemonBridge } from '../services/DaemonBridge';
 * const bridge = getDaemonBridge();
 *
 * // Begin a session
 * await bridge.request('session.begin', {
 *   workspace: workspacePath,
 *   task: 'Feature implementation',
 *   files: ['src/file.ts']
 * });
 *
 * // End a session
 * await bridge.request('session.end', {
 *   workspace: workspacePath,
 *   outcome: 'completed',
 *   createSnapshot: true
 * });
 * ```
 *
 * **Protocol Gap Note (Phase 6A):**
 * The daemon protocol currently supports these session operations:
 * - ✅ session.begin - start a new session
 * - ✅ session.end - finalize a session
 * - ✅ session.status - get current session state
 * - ✅ session.review - review session changes
 *
 * The following granular methods are NOT yet in daemon protocol:
 * - ⚠️ addCandidate() - add file to current session
 * - ⚠️ getCandidateCount() - get number of session files
 * - ⚠️ handleWindowBlur() - handle focus loss
 * - ⚠️ onSessionFinalized event - real-time session events
 *
 * These granular methods support extension-specific UX (like tree views and
 * real-time status updates). Until the daemon protocol is extended, consider:
 * 1. Using high-level session.begin/end workflows for most operations
 * 2. Keeping granular methods local for UI responsiveness
 * 3. Extending daemon protocol with real-time event subscriptions
 *
 * The CLI daemon uses @snapback/sdk SessionCoordinator as the canonical implementation.
 * This wrapper will be removed or simplified in Phase 4 after architectural decisions.
 *
 * @see DaemonBridge for the new API
 * @see apps/cli/src/daemon/protocol.ts for available daemon methods
 * @see ARCHITECTURE_REFACTOR_SPEC.md for migration details
 *
 * ---
 *
 * This module provides VSCode-specific integration with the platform-agnostic
 * SessionCoordinator from @snapback/sdk. It handles VSCode-specific concerns:
 * - Event emission via vscode.EventEmitter adapter
 * - Performance monitoring integration
 * - VSCode logging integration
 * - SQLite storage integration
 *
 * @module SessionCoordinator
 */

import {
	type ILogger,
	type ISessionStorage,
	NodeTimerService,
	SessionCoordinator as SDKSessionCoordinator,
	type SessionFinalizeReason,
	type SessionId,
	type SessionManifest,
} from "@snapback/sdk";
import type * as vscode from "vscode";
import { VscodeEventEmitterAdapter } from "../adapters/VscodeEventEmitterAdapter";
import { getSessionPerfMonitor } from "../performance/sessionPerfMonitor";
import type { IStorageManager } from "../storage/types.js";
import { getCoreEventTracker } from "../telemetry/core-event-tracker";
import { logger } from "../utils/logger";

/**
 * VSCode-specific logger adapter
 */
class VscodeLoggerAdapter implements ILogger {
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
class VscodeStorageAdapter implements ISessionStorage {
	constructor(private storage: IStorageManager) {}

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
		const files = (manifest as any).files || [];
		const reason = (manifest as any).reason || "manual";
		const triggers = (manifest as any).triggers || [reason];

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

		logger.debug("Calling storage.finalizeSession", { manifestId: manifest.id, reason, filesCount: files.length });
		await this.storage.finalizeSession(manifest.id, manifest.endedAt, reason, files);
		logger.debug("storage.finalizeSession completed");

		// Track session_finalized event (P0 - Demo Critical)
		// Fire-and-forget to avoid blocking session finalization
		const coreTracker = getCoreEventTracker();
		if (coreTracker) {
			const duration_ms = manifest.endedAt - manifest.startedAt;
			const extManifest = manifest as any;

			// Extract file paths from manifest (privacy: use relative paths only)
			const filePaths = files.map((f: any) => (typeof f === "string" ? f : f.path || f.filePath || "unknown"));

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
	private sdkCoordinator: SDKSessionCoordinator;
	private eventEmitter: VscodeEventEmitterAdapter<SessionManifest>;

	/** Event for when sessions are finalized */
	public readonly onSessionFinalized: vscode.Event<SessionManifest>;

	/**
	 * Creates a new SessionCoordinator
	 *
	 * @param storage - Storage adapter for persisting session manifests
	 */
	constructor(storage: IStorageManager) {
		// Create VSCode-specific adapters
		this.eventEmitter = new VscodeEventEmitterAdapter<SessionManifest>();
		const vscodeLogger = new VscodeLoggerAdapter();
		const vscodeStorage = new VscodeStorageAdapter(storage);
		const timerService = new NodeTimerService();

		// Create SDK coordinator with VSCode adapters
		this.sdkCoordinator = new SDKSessionCoordinator({
			storage: vscodeStorage,
			timers: timerService,
			logger: vscodeLogger,
			eventEmitter: this.eventEmitter,
		});

		// Expose VSCode event
		this.onSessionFinalized = this.eventEmitter.event;
	}

	/**
	 * Get the number of candidates in the current session
	 * @internal For testing only
	 */
	getCandidateCount(): number {
		return this.sdkCoordinator.getCandidateCount();
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
			this.sdkCoordinator.addCandidate(uri, snapshotId, stats);
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
			const result = await this.sdkCoordinator.finalizeSession(reason);
			logger.debug("finalizeSession completed", { result });
			return result;
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
		this.sdkCoordinator.handleWindowBlur();
	}

	/**
	 * Handle git commit event - finalize session due to git commit
	 */
	handleGitCommit(): void {
		this.sdkCoordinator.handleGitCommit();
	}

	/**
	 * Handle task completion event - finalize session due to task completion
	 */
	handleTaskCompletion(): void {
		this.sdkCoordinator.handleTaskCompletion();
	}

	/**
	 * Handle manual session finalization
	 */
	handleManualFinalization(): void {
		this.sdkCoordinator.handleManualFinalization();
	}

	/**
	 * Dispose of the session coordinator and clean up resources
	 */
	dispose(): void {
		this.sdkCoordinator.dispose();
	}
}
