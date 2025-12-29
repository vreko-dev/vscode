/**
 * Workspace Session Manager
 *
 * Implements J7-E05: Workspace-scoped session isolation
 *
 * Manages session lifecycle per workspace to ensure proper isolation
 * and prevent cross-workspace data leaks.
 *
 * @module session/WorkspaceSessionManager
 */

/**
 * Workspace session data
 */
export interface WorkspaceSession {
	workspaceId: string;
	workspaceName: string;
	sessionId: string;
	startTime: number;
	lastActivity: number;
	snapshotCount: number;
	isActive: boolean;
}

/**
 * Session isolation result
 */
export interface SessionIsolationResult {
	currentSession: WorkspaceSession | null;
	isIsolated: boolean;
	conflictingSessions: WorkspaceSession[];
}

/**
 * Workspace-scoped session manager
 *
 * Ensures each workspace has its own isolated session with proper
 * lifecycle management and conflict detection.
 */
export class WorkspaceSessionManager {
	private sessions: Map<string, WorkspaceSession> = new Map();
	private activeWorkspaceId: string | null = null;

	/**
	 * Generate unique workspace ID from workspace folders
	 */
	generateWorkspaceId(workspaceFolders: Array<{ uri: { fsPath: string } }>): string {
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return "no-workspace";
		}

		// Sort folders to ensure consistent ID regardless of order
		const sortedPaths = workspaceFolders.map((f) => f.uri.fsPath).sort();

		// Create hash from paths
		let hash = 0;
		const combined = sortedPaths.join("|");
		for (let i = 0; i < combined.length; i++) {
			const char = combined.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}

		return `ws_${Math.abs(hash).toString(36)}`;
	}

	/**
	 * Generate unique session ID
	 */
	generateSessionId(): string {
		return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	}

	/**
	 * Start or resume session for workspace
	 */
	startSession(workspaceFolders: Array<{ uri: { fsPath: string } }>, workspaceName?: string): WorkspaceSession {
		const workspaceId = this.generateWorkspaceId(workspaceFolders);

		// Check if session already exists for this workspace
		const existingSession = this.sessions.get(workspaceId);
		if (existingSession) {
			// Resume existing session (whether active or inactive)
			existingSession.isActive = true;
			existingSession.lastActivity = Date.now();
			this.activeWorkspaceId = workspaceId;
			return existingSession;
		}

		// Create new session only if none exists
		const session: WorkspaceSession = {
			workspaceId,
			workspaceName: workspaceName || workspaceId,
			sessionId: this.generateSessionId(),
			startTime: Date.now(),
			lastActivity: Date.now(),
			snapshotCount: 0,
			isActive: true,
		};

		this.sessions.set(workspaceId, session);
		this.activeWorkspaceId = workspaceId;

		return session;
	}

	/**
	 * Get current session for workspace
	 */
	getSession(workspaceId: string): WorkspaceSession | null {
		return this.sessions.get(workspaceId) || null;
	}

	/**
	 * Get active session
	 */
	getActiveSession(): WorkspaceSession | null {
		if (!this.activeWorkspaceId) return null;
		return this.sessions.get(this.activeWorkspaceId) || null;
	}

	/**
	 * Switch active workspace
	 */
	switchWorkspace(
		workspaceFolders: Array<{ uri: { fsPath: string } }>,
		workspaceName?: string,
	): {
		previousSession: WorkspaceSession | null;
		newSession: WorkspaceSession;
		wasSwitch: boolean;
	} {
		const newWorkspaceId = this.generateWorkspaceId(workspaceFolders);
		const previousSession = this.getActiveSession();

		// If same workspace, just update activity
		if (previousSession && previousSession.workspaceId === newWorkspaceId) {
			previousSession.lastActivity = Date.now();
			return {
				previousSession: null,
				newSession: previousSession,
				wasSwitch: false,
			};
		}

		// Deactivate previous session
		if (previousSession) {
			previousSession.isActive = false;
		}

		// Start/resume new session
		const newSession = this.startSession(workspaceFolders, workspaceName);

		return {
			previousSession,
			newSession,
			wasSwitch: true,
		};
	}

	/**
	 * Record snapshot in current session
	 */
	recordSnapshot(workspaceId: string): boolean {
		const session = this.sessions.get(workspaceId);
		if (!session) return false;

		session.snapshotCount++;
		session.lastActivity = Date.now();
		return true;
	}

	/**
	 * Check session isolation status
	 */
	checkIsolation(workspaceId: string): SessionIsolationResult {
		const currentSession = this.sessions.get(workspaceId) || null;

		// Find any conflicting sessions (other workspaces that are also active)
		const conflictingSessions = Array.from(this.sessions.values()).filter(
			(s) => s.workspaceId !== workspaceId && s.isActive,
		);

		return {
			currentSession,
			isIsolated: conflictingSessions.length === 0,
			conflictingSessions,
		};
	}

	/**
	 * End session for workspace
	 */
	endSession(workspaceId: string): WorkspaceSession | null {
		const session = this.sessions.get(workspaceId);
		if (!session) return null;

		session.isActive = false;

		if (this.activeWorkspaceId === workspaceId) {
			this.activeWorkspaceId = null;
		}

		return session;
	}

	/**
	 * Get all sessions
	 */
	getAllSessions(): WorkspaceSession[] {
		return Array.from(this.sessions.values());
	}

	/**
	 * Get sessions map (for testing)
	 * @internal
	 */
	getSessionsMap(): Map<string, WorkspaceSession> {
		return this.sessions;
	}

	/**
	 * Clear all sessions
	 */
	clearAll(): void {
		this.sessions.clear();
		this.activeWorkspaceId = null;
	}

	/**
	 * Get statistics
	 */
	getStats(): {
		totalSessions: number;
		activeSessions: number;
		totalSnapshots: number;
	} {
		const totalSnapshots = Array.from(this.sessions.values()).reduce((sum, s) => sum + s.snapshotCount, 0);
		const activeSessions = Array.from(this.sessions.values()).filter((s) => s.isActive).length;

		return {
			totalSessions: this.sessions.size,
			activeSessions,
			totalSnapshots,
		};
	}

	/**
	 * Clean up stale sessions (inactive for > 24 hours)
	 */
	cleanupStaleSessions(maxAgeMs = 24 * 60 * 60 * 1000): number {
		const now = Date.now();
		let cleaned = 0;

		for (const [workspaceId, session] of this.sessions.entries()) {
			if (!session.isActive && now - session.lastActivity > maxAgeMs) {
				this.sessions.delete(workspaceId);
				cleaned++;
			}
		}

		return cleaned;
	}
}
