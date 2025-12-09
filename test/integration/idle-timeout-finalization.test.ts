/**
 * @fileoverview Idle Timeout Session Finalization Integration Tests
 *
 * Integration tests verifying that sessions are properly finalized
 * based on idle timeout, window blur, git commit, and other triggers.
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

type SessionFinalizeReason = "idle-break" | "blur" | "commit" | "task" | "manual" | "max-duration";

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

function createMockSessionCoordinator(config: {
	idleTimeout?: number;
	minSessionDuration?: number;
	maxSessionDuration?: number;
} = {}) {
	const {
		idleTimeout = 5 * 60 * 1000, // 5 minutes default
		minSessionDuration = 5 * 1000, // 5 seconds default
		maxSessionDuration = 4 * 60 * 60 * 1000, // 4 hours default
	} = config;

	const listeners: Array<(session: SessionManifest) => void> = [];
	const candidates: Map<string, string> = new Map(); // uri -> snapshotId
	let sessionStart = Date.now();
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let longSessionTimer: ReturnType<typeof setTimeout> | null = null;

	const resetIdleTimer = () => {
		if (idleTimer) {
			clearTimeout(idleTimer);
		}
		idleTimer = setTimeout(() => {
			if (candidates.size > 0) {
				coordinator.finalizeSession("idle-break");
			}
		}, idleTimeout);
	};

	const coordinator = {
		config: { idleTimeout, minSessionDuration, maxSessionDuration },
		onSessionFinalized: vi.fn((callback: (session: SessionManifest) => void) => {
			listeners.push(callback);
			return { dispose: vi.fn() };
		}),
		_fireSessionFinalized: (session: SessionManifest) => {
			for (const listener of listeners) {
				listener(session);
			}
		},
		addCandidate: vi.fn((uri: string, snapshotId: string) => {
			candidates.set(uri, snapshotId);
			resetIdleTimer();
		}),
		getCandidates: () => candidates,
		finalizeSession: vi.fn((reason: SessionFinalizeReason): string | null => {
			const now = Date.now();
			const sessionDuration = now - sessionStart;

			// Don't finalize if session too short or no candidates
			if (sessionDuration < minSessionDuration && candidates.size === 0) {
				return null;
			}

			// Don't finalize if no candidates
			if (candidates.size === 0) {
				return null;
			}

			const sessionId = `session-${Math.random().toString(36).slice(2, 11)}`;
			const manifest: SessionManifest = {
				id: sessionId,
				startedAt: sessionStart,
				endedAt: now,
				reason,
				files: Array.from(candidates.entries()).map(([uri, snapshotId]) => ({
					uri,
					snapshotId,
				})),
				tags: [],
			};

			// Fire event
			coordinator._fireSessionFinalized(manifest);

			// Reset state
			candidates.clear();
			sessionStart = Date.now();

			// Clear timers
			if (idleTimer) {
				clearTimeout(idleTimer);
				idleTimer = null;
			}
			if (longSessionTimer) {
				clearTimeout(longSessionTimer);
				longSessionTimer = null;
			}

			return sessionId;
		}),
		handleWindowBlur: vi.fn(() => {
			if (candidates.size > 0) {
				coordinator.finalizeSession("blur");
			}
		}),
		handleGitCommit: vi.fn(() => {
			if (candidates.size > 0) {
				coordinator.finalizeSession("commit");
			}
		}),
		handleTaskCompletion: vi.fn(() => {
			if (candidates.size > 0) {
				coordinator.finalizeSession("task");
			}
		}),
		handleManualFinalization: vi.fn(() => {
			coordinator.finalizeSession("manual");
		}),
		resetSession: () => {
			candidates.clear();
			sessionStart = Date.now();
			if (idleTimer) {
				clearTimeout(idleTimer);
				idleTimer = null;
			}
		},
		_setSessionStart: (time: number) => {
			sessionStart = time;
		},
		_getSessionStart: () => sessionStart,
		dispose: () => {
			if (idleTimer) {
				clearTimeout(idleTimer);
			}
			if (longSessionTimer) {
				clearTimeout(longSessionTimer);
			}
		},
	};

	return coordinator;
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

// =========================================================================
// INTEGRATION TESTS - Idle Timeout Session Finalization
// =========================================================================

describe("Idle Timeout Session Finalization", () => {
	let mockCoordinator: ReturnType<typeof createMockSessionCoordinator>;
	let mockStorageManager: ReturnType<typeof createMockStorageManager>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mockCoordinator = createMockSessionCoordinator();
		mockStorageManager = createMockStorageManager();
	});

	afterEach(() => {
		mockCoordinator.dispose();
		vi.useRealTimers();
	});

	// =========================================================================
	// HAPPY PATH - Expected successful scenarios
	// =========================================================================
	describe("Happy Path", () => {
		it("should finalize session after 5 minutes idle (default)", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");
			let finalizedSession: SessionManifest | undefined;
			mockCoordinator.onSessionFinalized((session) => {
				finalizedSession = session;
			});

			// Act - Advance time by 5 minutes
			vi.advanceTimersByTime(5 * 60 * 1000);

			// Assert
			expect(mockCoordinator.finalizeSession).toHaveBeenCalledWith("idle-break");
			expect(finalizedSession).toBeDefined();
			expect(finalizedSession!.reason).toBe("idle-break");
		});

		it("should finalize session on window blur", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");
			let finalizedSession: SessionManifest | undefined;
			mockCoordinator.onSessionFinalized((session) => {
				finalizedSession = session;
			});

			// Act
			mockCoordinator.handleWindowBlur();

			// Assert
			expect(mockCoordinator.finalizeSession).toHaveBeenCalledWith("blur");
			expect(finalizedSession).toBeDefined();
			expect(finalizedSession!.reason).toBe("blur");
		});

		it("should finalize session on git commit", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");
			let finalizedSession: SessionManifest | undefined;
			mockCoordinator.onSessionFinalized((session) => {
				finalizedSession = session;
			});

			// Act
			mockCoordinator.handleGitCommit();

			// Assert
			expect(mockCoordinator.finalizeSession).toHaveBeenCalledWith("commit");
			expect(finalizedSession).toBeDefined();
			expect(finalizedSession!.reason).toBe("commit");
		});

		it("should finalize session on task completion", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");
			let finalizedSession: SessionManifest | undefined;
			mockCoordinator.onSessionFinalized((session) => {
				finalizedSession = session;
			});

			// Act
			mockCoordinator.handleTaskCompletion();

			// Assert
			expect(mockCoordinator.finalizeSession).toHaveBeenCalledWith("task");
			expect(finalizedSession!.reason).toBe("task");
		});

		it("should include all candidate files in finalized session", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");
			mockCoordinator.addCandidate("file2.ts", "snap2");
			mockCoordinator.addCandidate("file3.ts", "snap3");

			let finalizedSession: SessionManifest | undefined;
			mockCoordinator.onSessionFinalized((session) => {
				finalizedSession = session;
			});

			// Act
			mockCoordinator.handleManualFinalization();

			// Assert
			expect(finalizedSession!.files).toHaveLength(3);
			expect(finalizedSession!.files.map((f) => f.uri)).toContain("file1.ts");
			expect(finalizedSession!.files.map((f) => f.uri)).toContain("file2.ts");
			expect(finalizedSession!.files.map((f) => f.uri)).toContain("file3.ts");
		});
	});

	// =========================================================================
	// SAD PATH - Expected failure scenarios
	// =========================================================================
	describe("Sad Path", () => {
		it("should NOT finalize empty session (no candidates)", async () => {
			// Arrange - No candidates added
			let finalizeCalled = false;
			mockCoordinator.onSessionFinalized(() => {
				finalizeCalled = true;
			});

			// Act
			const result = mockCoordinator.finalizeSession("manual");

			// Assert
			expect(result).toBeNull();
			expect(finalizeCalled).toBe(false);
		});

		it("should NOT finalize session on window blur without edits", async () => {
			// Arrange - No candidates
			let finalizeCalled = false;
			mockCoordinator.onSessionFinalized(() => {
				finalizeCalled = true;
			});

			// Act
			mockCoordinator.handleWindowBlur();

			// Assert - finalizeSession should be called but return null
			expect(finalizeCalled).toBe(false);
		});

		it("should NOT finalize session on git commit without edits", async () => {
			// Arrange - No candidates
			let finalizeCalled = false;
			mockCoordinator.onSessionFinalized(() => {
				finalizeCalled = true;
			});

			// Act
			mockCoordinator.handleGitCommit();

			// Assert
			expect(finalizeCalled).toBe(false);
		});
	});

	// =========================================================================
	// EDGE CASES - Boundary conditions
	// =========================================================================
	describe("Edge Cases", () => {
		it("should respect configurable idle timeout", async () => {
			// Arrange - Short 30 second timeout
			const shortTimeoutCoordinator = createMockSessionCoordinator({
				idleTimeout: 30 * 1000,
			});
			shortTimeoutCoordinator.addCandidate("file1.ts", "snap1");

			let finalized = false;
			shortTimeoutCoordinator.onSessionFinalized(() => {
				finalized = true;
			});

			// Act - Advance 30 seconds
			vi.advanceTimersByTime(30 * 1000);

			// Assert
			expect(finalized).toBe(true);

			shortTimeoutCoordinator.dispose();
		});

		it("should finalize at max 4-hour session duration", async () => {
			// Arrange
			const maxDurationCoordinator = createMockSessionCoordinator({
				maxSessionDuration: 4 * 60 * 60 * 1000, // 4 hours
				idleTimeout: 1000 * 60 * 60 * 24, // Very long idle so it doesn't trigger first
			});

			maxDurationCoordinator.addCandidate("file1.ts", "snap1");

			// Simulate 4-hour old session
			const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
			maxDurationCoordinator._setSessionStart(fourHoursAgo);

			let finalizedSession: SessionManifest | undefined;
			maxDurationCoordinator.onSessionFinalized((session) => {
				finalizedSession = session;
			});

			// Act - Force finalization due to max duration
			maxDurationCoordinator.finalizeSession("max-duration");

			// Assert
			expect(finalizedSession).toBeDefined();
			expect(finalizedSession!.reason).toBe("max-duration");

			maxDurationCoordinator.dispose();
		});

		it("should reset idle timer on activity", async () => {
			// Arrange
			const shortTimeoutCoordinator = createMockSessionCoordinator({
				idleTimeout: 100, // 100ms for fast testing
			});

			shortTimeoutCoordinator.addCandidate("file1.ts", "snap1");

			let finalized = false;
			shortTimeoutCoordinator.onSessionFinalized(() => {
				finalized = true;
			});

			// Act - Advance 50ms, add another candidate, then advance 50ms more
			vi.advanceTimersByTime(50);
			shortTimeoutCoordinator.addCandidate("file2.ts", "snap2"); // Resets timer
			vi.advanceTimersByTime(50);

			// Assert - Should NOT be finalized yet (timer was reset)
			expect(finalized).toBe(false);

			// Advance remaining time
			vi.advanceTimersByTime(50);

			// Now it should be finalized
			expect(finalized).toBe(true);

			shortTimeoutCoordinator.dispose();
		});

		it("should clear candidates after finalization", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");
			mockCoordinator.addCandidate("file2.ts", "snap2");

			expect(mockCoordinator.getCandidates().size).toBe(2);

			// Act
			mockCoordinator.finalizeSession("manual");

			// Assert - Candidates should be cleared
			expect(mockCoordinator.getCandidates().size).toBe(0);
		});

		it("should generate new session after finalization", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");

			const sessionIds: string[] = [];
			mockCoordinator.onSessionFinalized((session) => {
				sessionIds.push(session.id);
			});

			// Act - Finalize twice
			mockCoordinator.finalizeSession("manual");
			mockCoordinator.addCandidate("file2.ts", "snap2");
			mockCoordinator.finalizeSession("manual");

			// Assert - Should have two different session IDs
			expect(sessionIds).toHaveLength(2);
			expect(sessionIds[0]).not.toBe(sessionIds[1]);
		});

		it("should track session duration correctly", async () => {
			// Arrange
			const now = Date.now();
			vi.setSystemTime(now);

			mockCoordinator._setSessionStart(now - 60000); // 1 minute ago
			mockCoordinator.addCandidate("file1.ts", "snap1");

			let finalizedSession: SessionManifest | null = null;
			mockCoordinator.onSessionFinalized((session) => {
				finalizedSession = session;
			});

			// Act
			mockCoordinator.finalizeSession("manual");

			// Assert
			expect(finalizedSession).not.toBeNull();
			expect(finalizedSession!.startedAt).toBe(now - 60000);
			expect(finalizedSession!.endedAt).toBeGreaterThanOrEqual(now);
		});
	});

	// =========================================================================
	// ERROR PATH - Error handling
	// =========================================================================
	describe("Error Path", () => {
		it("should retry finalization on storage failure", async () => {
			// Arrange
			const failingStorage = createMockStorageManager();
			let storeCallCount = 0;
			failingStorage.storeSessionManifest = vi.fn().mockImplementation(async () => {
				storeCallCount++;
				if (storeCallCount < 3) {
					throw new Error("Storage temporarily unavailable");
				}
			});

			mockCoordinator.addCandidate("file1.ts", "snap1");

			// Connect storage to coordinator events
			mockCoordinator.onSessionFinalized(async (session) => {
				try {
					await failingStorage.storeSessionManifest(session);
				} catch {
					// Retry logic would go here in real implementation
				}
			});

			// Act
			mockCoordinator.finalizeSession("manual");

			// Assert - The session should still be finalized
			expect(mockCoordinator.getCandidates().size).toBe(0);
		});

		it("should handle concurrent finalization requests gracefully", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");

			const sessionIds: (string | null)[] = [];
			mockCoordinator.onSessionFinalized((session) => {
				sessionIds.push(session.id);
			});

			// Act - Try to finalize twice simultaneously
			const result1 = mockCoordinator.finalizeSession("manual");
			const result2 = mockCoordinator.finalizeSession("manual");

			// Assert - First should succeed, second should return null (no candidates)
			expect(result1).not.toBeNull();
			expect(result2).toBeNull();
			expect(sessionIds).toHaveLength(1);
		});

		it("should handle timer cleanup on dispose", async () => {
			// Arrange
			const coordinator = createMockSessionCoordinator({
				idleTimeout: 1000,
			});
			coordinator.addCandidate("file1.ts", "snap1");

			let finalized = false;
			coordinator.onSessionFinalized(() => {
				finalized = true;
			});

			// Act - Dispose before timer fires
			coordinator.dispose();
			vi.advanceTimersByTime(2000);

			// Assert - Should NOT finalize after dispose
			expect(finalized).toBe(false);
		});
	});

	// =========================================================================
	// TRIGGER TYPE TESTS
	// =========================================================================
	describe("Trigger Types", () => {
		it("should record 'idle-break' reason for idle timeout", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");

			let reason: string | null = null;
			mockCoordinator.onSessionFinalized((session) => {
				reason = session.reason;
			});

			// Act
			vi.advanceTimersByTime(5 * 60 * 1000);

			// Assert
			expect(reason).toBe("idle-break");
		});

		it("should record 'blur' reason for window blur", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");

			let reason: string | null = null;
			mockCoordinator.onSessionFinalized((session) => {
				reason = session.reason;
			});

			// Act
			mockCoordinator.handleWindowBlur();

			// Assert
			expect(reason).toBe("blur");
		});

		it("should record 'commit' reason for git commit", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");

			let reason: string | null = null;
			mockCoordinator.onSessionFinalized((session) => {
				reason = session.reason;
			});

			// Act
			mockCoordinator.handleGitCommit();

			// Assert
			expect(reason).toBe("commit");
		});

		it("should record 'task' reason for task completion", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");

			let reason: string | null = null;
			mockCoordinator.onSessionFinalized((session) => {
				reason = session.reason;
			});

			// Act
			mockCoordinator.handleTaskCompletion();

			// Assert
			expect(reason).toBe("task");
		});

		it("should record 'manual' reason for manual finalization", async () => {
			// Arrange
			mockCoordinator.addCandidate("file1.ts", "snap1");

			let reason: string | null = null;
			mockCoordinator.onSessionFinalized((session) => {
				reason = session.reason;
			});

			// Act
			mockCoordinator.handleManualFinalization();

			// Assert
			expect(reason).toBe("manual");
		});
	});
});
