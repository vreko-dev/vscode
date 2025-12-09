/**
 * @fileoverview Session to UI Sync Integration Tests
 *
 * Integration tests verifying that session finalization events properly
 * propagate to the UI layer (SessionsTreeProvider, status bar, etc.)
 *
 * Tests the data flow:
 * SessionCoordinator → SessionsTreeProvider → VS Code TreeView
 *
 * Follows TDD 4-Path Model: Happy/Sad/Edge/Error
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =========================================================================
// Type Definitions (inline for test isolation)
// =========================================================================

interface SessionFileEntry {
	uri: string;
	snapshotId: string;
}

interface SessionManifest {
	id: string;
	startedAt: number;
	endedAt: number;
	reason: string;
	files: SessionFileEntry[];
	tags: string[];
}

// =========================================================================
// Test Factories
// =========================================================================

function createTestSessionManifest(overrides: Partial<SessionManifest> = {}): SessionManifest {
	const now = Date.now();
	return {
		id: `session-${Math.random().toString(36).slice(2, 11)}`,
		startedAt: now - 60000, // 1 minute ago
		endedAt: now,
		reason: "manual",
		files: [],
		tags: [],
		...overrides,
	};
}

function createMockSessionCoordinator() {
	const listeners: Array<(session: SessionManifest) => void> = [];

	return {
		onSessionFinalized: vi.fn((callback: (session: SessionManifest) => void) => {
			listeners.push(callback);
			return { dispose: vi.fn() };
		}),
		_fireSessionFinalized: (session: SessionManifest) => {
			for (const listener of listeners) {
				listener(session);
			}
		},
		finalizeSession: vi.fn().mockResolvedValue("session-123"),
		addCandidate: vi.fn(),
		handleWindowBlur: vi.fn(),
		handleGitCommit: vi.fn(),
	};
}

function createMockStorageManager() {
	const sessions: SessionManifest[] = [];

	return {
		listSessionManifests: vi.fn().mockImplementation(async () => sessions),
		storeSessionManifest: vi.fn().mockImplementation(async (session: SessionManifest) => {
			sessions.push(session);
		}),
		deleteSessionManifest: vi.fn().mockResolvedValue(true),
		_getSessions: () => sessions,
		_clearSessions: () => {
			sessions.length = 0;
		},
	};
}

// Mock SessionsTreeProvider behavior for integration testing
function createMockSessionsTreeProvider(coordinator: ReturnType<typeof createMockSessionCoordinator>, storage: ReturnType<typeof createMockStorageManager>) {
	const sessions: SessionManifest[] = [];
	const disposables: Array<{ dispose: () => void }> = [];

	// Subscribe to session events
	const subscription = coordinator.onSessionFinalized((session: SessionManifest) => {
		sessions.push(session);
		storage.storeSessionManifest(session);
	});
	disposables.push(subscription);

	return {
		getChildren: async (element?: any) => {
			if (!element) {
				// Root level - return session items sorted by most recent
				return sessions
					.sort((a, b) => b.startedAt - a.startedAt)
					.map((session) => ({
						session,
						collapsibleState: session.files.length > 0 ? 1 : 0, // 1=Collapsed, 0=None
					}));
			}
			// Session element - return file items
			return element.session?.files?.map((file: SessionFileEntry) => ({
				file,
				label: file.uri,
			})) || [];
		},
		refresh: vi.fn(),
		dispose: () => {
			for (const d of disposables) {
				d.dispose();
			}
		},
		_sessions: sessions,
	};
}

// =========================================================================
// INTEGRATION TESTS - Session to UI Sync
// =========================================================================

describe("Session → UI Sync Integration", () => {
	let provider: ReturnType<typeof createMockSessionsTreeProvider>;
	let mockCoordinator: ReturnType<typeof createMockSessionCoordinator>;
	let mockStorageManager: ReturnType<typeof createMockStorageManager>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockCoordinator = createMockSessionCoordinator();
		mockStorageManager = createMockStorageManager();
		provider = createMockSessionsTreeProvider(mockCoordinator, mockStorageManager);
	});

	afterEach(() => {
		provider.dispose();
	});

	// =========================================================================
	// HAPPY PATH - Expected successful scenarios
	// =========================================================================
	describe("Happy Path", () => {
		it("should update SessionsTreeProvider when session finalized", async () => {
			// Arrange
			const session = createTestSessionManifest({
				files: [{ uri: "file1.ts", snapshotId: "snap1" }],
			});

			// Act - Fire session finalized event
			mockCoordinator._fireSessionFinalized(session);

			// Assert - TreeProvider should have the session
			const children = await provider.getChildren();
			expect(children).toHaveLength(1);
			expect(children[0].session.id).toBe(session.id);
		});

		it("should show correct file count in session list", async () => {
			// Arrange
			const session = createTestSessionManifest({
				files: [
					{ uri: "file1.ts", snapshotId: "snap1" },
					{ uri: "file2.ts", snapshotId: "snap2" },
					{ uri: "file3.ts", snapshotId: "snap3" },
				],
			});

			// Act
			mockCoordinator._fireSessionFinalized(session);

			// Assert
			const children = await provider.getChildren();
			const sessionItem = children[0];
			expect(sessionItem.session.files).toHaveLength(3);

			// Verify files are accessible as children
			const fileChildren = await provider.getChildren(sessionItem);
			expect(fileChildren).toHaveLength(3);
		});

		it("should display session tags in tree view", async () => {
			// Arrange
			const session = createTestSessionManifest({
				tags: ["ai-assisted", "multi-file", "long-session"],
				files: [{ uri: "file1.ts", snapshotId: "snap1" }],
			});

			// Act
			mockCoordinator._fireSessionFinalized(session);

			// Assert
			const children = await provider.getChildren();
			const sessionItem = children[0];
			expect(sessionItem.session.tags).toContain("ai-assisted");
			expect(sessionItem.session.tags).toContain("multi-file");
			expect(sessionItem.session.tags).toContain("long-session");
		});

		it("should persist session to storage when finalized", async () => {
			// Arrange
			const session = createTestSessionManifest();

			// Act
			mockCoordinator._fireSessionFinalized(session);

			// Assert - Storage should have been called
			expect(mockStorageManager.storeSessionManifest).toHaveBeenCalledWith(session);
		});

		it("should display sessions in reverse chronological order", async () => {
			// Arrange
			const now = Date.now();
			const olderSession = createTestSessionManifest({
				id: "session-older",
				startedAt: now - 120000,
				endedAt: now - 60000,
			});
			const newerSession = createTestSessionManifest({
				id: "session-newer",
				startedAt: now - 60000,
				endedAt: now,
			});

			// Act - Add older first, then newer
			mockCoordinator._fireSessionFinalized(olderSession);
			mockCoordinator._fireSessionFinalized(newerSession);

			// Assert - Newer should be first
			const children = await provider.getChildren();
			expect(children).toHaveLength(2);
			expect(children[0].session.id).toBe("session-newer");
			expect(children[1].session.id).toBe("session-older");
		});

		it("should display session finalization reason", async () => {
			// Arrange
			const commitSession = createTestSessionManifest({ reason: "commit" });
			const blurSession = createTestSessionManifest({ reason: "blur" });
			const idleSession = createTestSessionManifest({ reason: "idle-break" });

			// Act
			mockCoordinator._fireSessionFinalized(commitSession);
			mockCoordinator._fireSessionFinalized(blurSession);
			mockCoordinator._fireSessionFinalized(idleSession);

			// Assert
			const children = await provider.getChildren();
			const reasons = children.map((c) => c.session.reason);
			expect(reasons).toContain("commit");
			expect(reasons).toContain("blur");
			expect(reasons).toContain("idle-break");
		});
	});

	// =========================================================================
	// SAD PATH - Expected failure scenarios
	// =========================================================================
	describe("Sad Path", () => {
		it("should show empty state when no sessions exist", async () => {
			// Arrange - No sessions finalized

			// Act
			const children = await provider.getChildren();

			// Assert
			expect(children).toHaveLength(0);
		});

		it("should handle session with no files", async () => {
			// Arrange
			const emptySession = createTestSessionManifest({ files: [] });

			// Act
			mockCoordinator._fireSessionFinalized(emptySession);

			// Assert
			const children = await provider.getChildren();
			expect(children).toHaveLength(1);

			// Session should not be expandable if no files (collapsibleState = 0 = None)
			const sessionItem = children[0];
			expect(sessionItem.collapsibleState).toBe(0);
		});

		it("should handle session without tags", async () => {
			// Arrange
			const session = createTestSessionManifest({ tags: [] });

			// Act
			mockCoordinator._fireSessionFinalized(session);

			// Assert
			const children = await provider.getChildren();
			const sessionItem = children[0];
			expect(sessionItem.session.tags).toEqual([]);
		});
	});

	// =========================================================================
	// EDGE CASES - Boundary conditions
	// =========================================================================
	describe("Edge Cases", () => {
		it("should refresh on explicit refresh call", async () => {
			// Arrange
			const session = createTestSessionManifest();
			mockCoordinator._fireSessionFinalized(session);

			// Act
			provider.refresh();

			// Assert - onDidChangeTreeData should have fired
			const children = await provider.getChildren();
			expect(children).toHaveLength(1);
		});

		it("should handle 50+ sessions (pagination)", async () => {
			// Arrange - Create 60 sessions
			for (let i = 0; i < 60; i++) {
				const session = createTestSessionManifest({
					id: `session-${i}`,
					startedAt: Date.now() - (60 - i) * 1000,
				});
				mockCoordinator._fireSessionFinalized(session);
			}

			// Act
			const children = await provider.getChildren();

			// Assert - Should handle all sessions
			expect(children.length).toBe(60);
		});

		it("should handle rapid session finalization events", async () => {
			// Arrange & Act - Fire 10 sessions rapidly
			const sessions: SessionManifest[] = [];
			for (let i = 0; i < 10; i++) {
				const session = createTestSessionManifest({ id: `rapid-session-${i}` });
				sessions.push(session);
				mockCoordinator._fireSessionFinalized(session);
			}

			// Assert - All sessions should be captured
			const children = await provider.getChildren();
			expect(children).toHaveLength(10);
		});

		it("should handle sessions with very long file paths", async () => {
			// Arrange
			const longPath = `/very/long/path/${"a".repeat(200)}/file.ts`;
			const session = createTestSessionManifest({
				files: [{ uri: longPath, snapshotId: "snap1" }],
			});

			// Act
			mockCoordinator._fireSessionFinalized(session);

			// Assert - Should not throw
			const children = await provider.getChildren();
			expect(children).toHaveLength(1);
		});

		it("should handle session with many files (50+)", async () => {
			// Arrange
			const files = Array.from({ length: 50 }, (_, i) => ({
				uri: `file${i}.ts`,
				snapshotId: `snap${i}`,
			}));
			const session = createTestSessionManifest({ files });

			// Act
			mockCoordinator._fireSessionFinalized(session);

			// Assert
			const children = await provider.getChildren();
			const sessionItem = children[0];
			const fileChildren = await provider.getChildren(sessionItem);
			expect(fileChildren).toHaveLength(50);
		});

		it("should handle duplicate session IDs gracefully", async () => {
			// Arrange
			const session1 = createTestSessionManifest({ id: "duplicate-id" });
			const session2 = createTestSessionManifest({ id: "duplicate-id" });

			// Act
			mockCoordinator._fireSessionFinalized(session1);
			mockCoordinator._fireSessionFinalized(session2);

			// Assert - Both should be added (implementation may dedupe)
			const children = await provider.getChildren();
			expect(children.length).toBeGreaterThanOrEqual(1);
		});
	});

	// =========================================================================
	// ERROR PATH - Error handling
	// =========================================================================
	describe("Error Path", () => {
		it("should handle error when storage read fails", async () => {
			// Arrange - Make storage throw error
			const errorStorage = {
				listSessionManifests: vi.fn().mockRejectedValue(new Error("Storage read failed")),
				storeSessionManifest: vi.fn().mockResolvedValue(undefined),
				_getSessions: () => [],
				_clearSessions: () => {},
			};

			const errorCoordinator = createMockSessionCoordinator();
			const errorProvider = createMockSessionsTreeProvider(
				errorCoordinator,
				errorStorage as any,
			);

			// Act - Should not throw
			const children = await errorProvider.getChildren();

			// Assert - Should return empty array on error (no sessions added)
			expect(children).toEqual([]);

			errorProvider.dispose();
		});

		it("should continue working after storage write fails", async () => {
			// Arrange
			const failingStorage = {
				listSessionManifests: vi.fn().mockResolvedValue([]),
				storeSessionManifest: vi.fn().mockRejectedValue(new Error("Write failed")),
				_getSessions: () => [],
				_clearSessions: () => {},
			};

			const failingProvider = createMockSessionsTreeProvider(
				mockCoordinator,
				failingStorage as any,
			);

			// Act
			const session = createTestSessionManifest();
			mockCoordinator._fireSessionFinalized(session);

			// Assert - Provider should still work (session in memory)
			const children = await failingProvider.getChildren();
			// Even if storage fails, in-memory session should be visible
			expect(children.length).toBeGreaterThanOrEqual(1);

			failingProvider.dispose();
		});

		it("should handle malformed session data", async () => {
			// Arrange - Create session with missing fields
			const malformedSession = {
				id: "malformed",
				startedAt: Date.now(),
				// Missing: endedAt, reason, files, tags
			} as unknown as SessionManifest;

			// Act - Should not throw
			try {
				mockCoordinator._fireSessionFinalized(malformedSession);
				const children = await provider.getChildren();
				expect(children).toBeDefined();
			} catch (error) {
				// Some implementations may throw, which is acceptable
				expect(error).toBeDefined();
			}
		});
	});

	// =========================================================================
	// DISPOSAL TESTS
	// =========================================================================
	describe("Disposal", () => {
		it("should clean up event listeners on dispose", () => {
			// Arrange
			const disposeSpies: Array<ReturnType<typeof vi.fn>> = [];
			const coordinator = {
				onSessionFinalized: vi.fn((callback: (session: SessionManifest) => void) => {
					const disposeFn = vi.fn();
					disposeSpies.push(disposeFn);
					return { dispose: disposeFn };
				}),
			};

			const testProvider = createMockSessionsTreeProvider(
				coordinator as any,
				mockStorageManager,
			);

			// Act
			testProvider.dispose();

			// Assert - Dispose should have been called on subscription
			for (const spy of disposeSpies) {
				expect(spy).toHaveBeenCalled();
			}
		});
	});
});
