/**
 * J7 Session Lifecycle Journey Tests
 *
 * Spec Reference: unified_ux_spec_UPDATED.md §3.8
 *
 * Edge Cases Covered:
 *   - J7-E05: Two workspaces interleaved (Gap → Implementing)
 *
 * TDD Approach: RED → GREEN → REFACTOR
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkspaceSessionManager, type WorkspaceSession, type SessionIsolationResult } from "../../../src/session/WorkspaceSessionManager";

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: undefined,
		name: undefined,
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

/**
 * Workspace session info
 */

/**
 * Session isolation result
 */

/**
 * Workspace-scoped session manager
 *
 * Implements J7-E05: Workspace-scoped session isolation
 */

describe("J7 Session Lifecycle Journey", () => {
	let manager: WorkspaceSessionManager;

	beforeEach(() => {
		vi.clearAllMocks();
		manager = new WorkspaceSessionManager();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("J7-E05: Workspace-scoped session isolation", () => {
		describe("Workspace ID Generation", () => {
			it("should generate consistent ID for same workspace", () => {
				const folders = [{ uri: { fsPath: "/projects/my-app" } }];

				const id1 = manager.generateWorkspaceId(folders);
				const id2 = manager.generateWorkspaceId(folders);

				expect(id1).toBe(id2);
				expect(id1).toMatch(/^ws_/);
			});

			it("should generate different IDs for different workspaces", () => {
				const folders1 = [{ uri: { fsPath: "/projects/app-a" } }];
				const folders2 = [{ uri: { fsPath: "/projects/app-b" } }];

				const id1 = manager.generateWorkspaceId(folders1);
				const id2 = manager.generateWorkspaceId(folders2);

				expect(id1).not.toBe(id2);
			});

			it("should handle multi-root workspaces consistently", () => {
				const folders1 = [
					{ uri: { fsPath: "/projects/frontend" } },
					{ uri: { fsPath: "/projects/backend" } },
				];
				const folders2 = [
					{ uri: { fsPath: "/projects/backend" } },
					{ uri: { fsPath: "/projects/frontend" } },
				];

				const id1 = manager.generateWorkspaceId(folders1);
				const id2 = manager.generateWorkspaceId(folders2);

				// Order shouldn't matter
				expect(id1).toBe(id2);
			});

			it("should handle no workspace", () => {
				const id = manager.generateWorkspaceId([]);

				expect(id).toBe("no-workspace");
			});
		});

		describe("Session Management", () => {
			it("should start new session for workspace", () => {
				const folders = [{ uri: { fsPath: "/projects/my-app" } }];

				const session = manager.startSession(folders, "My App");

				expect(session.workspaceName).toBe("My App");
				expect(session.sessionId).toMatch(/^sess_/);
				expect(session.isActive).toBe(true);
				expect(session.snapshotCount).toBe(0);
			});

			it("should resume existing active session", () => {
				const folders = [{ uri: { fsPath: "/projects/my-app" } }];

				const session1 = manager.startSession(folders, "My App");
				const originalSessionId = session1.sessionId;

				// Start again should resume
				const session2 = manager.startSession(folders, "My App");

				expect(session2.sessionId).toBe(originalSessionId);
			});

			it("should resume session after previous ended", () => {
				const folders = [{ uri: { fsPath: "/projects/my-app" } }];

				const session1 = manager.startSession(folders, "My App");
				const originalSessionId = session1.sessionId;

				manager.endSession(session1.workspaceId);

				// Resume should keep the same session
				const session2 = manager.startSession(folders, "My App");

				expect(session2.sessionId).toBe(originalSessionId);
				expect(session2.isActive).toBe(true);
			});
		});

		describe("Workspace Switching", () => {
			it("should switch between workspaces", () => {
				const workspace1 = [{ uri: { fsPath: "/projects/app-a" } }];
				const workspace2 = [{ uri: { fsPath: "/projects/app-b" } }];

				manager.startSession(workspace1, "App A");

				const result = manager.switchWorkspace(workspace2, "App B");

				expect(result.wasSwitch).toBe(true);
				expect(result.previousSession?.workspaceName).toBe("App A");
				expect(result.previousSession?.isActive).toBe(false);
				expect(result.newSession.workspaceName).toBe("App B");
				expect(result.newSession.isActive).toBe(true);
			});

			it("should not switch when same workspace", () => {
				const folders = [{ uri: { fsPath: "/projects/my-app" } }];

				manager.startSession(folders, "My App");

				const result = manager.switchWorkspace(folders, "My App");

				expect(result.wasSwitch).toBe(false);
				expect(result.previousSession).toBeNull();
			});

			it("should maintain separate sessions for each workspace", () => {
				const workspace1 = [{ uri: { fsPath: "/projects/app-a" } }];
				const workspace2 = [{ uri: { fsPath: "/projects/app-b" } }];

				const session1 = manager.startSession(workspace1, "App A");
				manager.recordSnapshot(session1.workspaceId);
				manager.recordSnapshot(session1.workspaceId);

				const switchResult = manager.switchWorkspace(workspace2, "App B");
				manager.recordSnapshot(switchResult.newSession.workspaceId);

				// Switch back to workspace1 - should RESUME the same session (preserving snapshots)
				const switchBack = manager.switchWorkspace(workspace1, "App A");
				// This is the SAME session, so snapshot count continues from 2
				manager.recordSnapshot(switchBack.newSession.workspaceId);

				const stats = manager.getStats();
				expect(stats.totalSessions).toBe(2);
				// workspace1: 2 + 1 = 3 snapshots, workspace2: 1 snapshot = 4 total
				expect(stats.totalSnapshots).toBe(4);
			});
		});

		describe("Session Isolation", () => {
			it("should report isolated when only one workspace active", () => {
				const folders = [{ uri: { fsPath: "/projects/my-app" } }];
				const session = manager.startSession(folders, "My App");

				const isolation = manager.checkIsolation(session.workspaceId);

				expect(isolation.isIsolated).toBe(true);
				expect(isolation.conflictingSessions).toHaveLength(0);
			});

			it("should detect conflicting sessions", () => {
				const workspace1 = [{ uri: { fsPath: "/projects/app-a" } }];
				const workspace2 = [{ uri: { fsPath: "/projects/app-b" } }];

				const session1 = manager.startSession(workspace1, "App A");
				// Directly create second session without switching (simulating bug)
				manager.getSessionsMap().set(
					manager.generateWorkspaceId(workspace2),
					{
						workspaceId: manager.generateWorkspaceId(workspace2),
						workspaceName: "App B",
						sessionId: "sess_test",
						startTime: Date.now(),
						lastActivity: Date.now(),
						snapshotCount: 0,
						isActive: true, // Both active!
					}
				);

				const isolation = manager.checkIsolation(session1.workspaceId);

				expect(isolation.isIsolated).toBe(false);
				expect(isolation.conflictingSessions).toHaveLength(1);
				expect(isolation.conflictingSessions[0].workspaceName).toBe("App B");
			});
		});

		describe("Snapshot Recording", () => {
			it("should record snapshot in correct workspace", () => {
				const workspace1 = [{ uri: { fsPath: "/projects/app-a" } }];
				const workspace2 = [{ uri: { fsPath: "/projects/app-b" } }];

				const session1 = manager.startSession(workspace1, "App A");
				manager.switchWorkspace(workspace2, "App B");

				// Record in first workspace (even though second is active)
				manager.recordSnapshot(session1.workspaceId);

				const session1Updated = manager.getSession(session1.workspaceId);
				expect(session1Updated?.snapshotCount).toBe(1);
			});

			it("should return false for invalid workspace", () => {
				const result = manager.recordSnapshot("invalid-id");

				expect(result).toBe(false);
			});
		});

		describe("Session Statistics", () => {
			it("should track all sessions", () => {
				const workspace1 = [{ uri: { fsPath: "/projects/app-a" } }];
				const workspace2 = [{ uri: { fsPath: "/projects/app-b" } }];
				const workspace3 = [{ uri: { fsPath: "/projects/app-c" } }];

				const s1 = manager.startSession(workspace1, "App A");
				manager.recordSnapshot(s1.workspaceId);

				manager.switchWorkspace(workspace2, "App B");

				manager.switchWorkspace(workspace3, "App C");
				const s3 = manager.getActiveSession();
				manager.recordSnapshot(s3!.workspaceId);
				manager.recordSnapshot(s3!.workspaceId);

				const stats = manager.getStats();

				expect(stats.totalSessions).toBe(3);
				expect(stats.activeSessions).toBe(1); // Only app-c is active
				expect(stats.totalSnapshots).toBe(3);
			});

			it("should clear all sessions", () => {
				const folders = [{ uri: { fsPath: "/projects/my-app" } }];
				manager.startSession(folders, "My App");

				manager.clearAll();

				const stats = manager.getStats();
				expect(stats.totalSessions).toBe(0);
				expect(manager.getActiveSession()).toBeNull();
			});
		});
	});
});

// Expose sessions map for testing
declare module "./J7-SessionLifecycle.test" {
	interface WorkspaceSessionManager {
		sessions: Map<string, WorkspaceSession>;
	}
}
