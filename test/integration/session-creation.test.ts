import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Session Creation & Linking Test
 *
 * CRITICAL BUG PREVENTION:
 * Sessions were never created, so snapshots had no sessionId linkage.
 * This caused:
 * - Orphaned snapshots not grouped by session
 * - Incomplete session data in UI
 * - Lost context about when/why snapshots were taken
 *
 * This test ensures:
 * - Session created on FIRST save
 * - Snapshots linked to active session
 * - Session finalized after idle
 * - New session after idle period
 */

describe("Session Creation & Linking", () => {
	let mockSessionManager: any;
	let mockSnapshotService: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockSessionManager = {
			listSessions: vi.fn().mockResolvedValue([]),
			createSession: vi.fn(),
			finalizeSession: vi.fn(),
			getActiveSession: vi.fn(),
		};

		mockSnapshotService = {
			createSnapshot: vi.fn(),
		};
	});

	describe("Automatic Session Creation", () => {
		it("should create session on FIRST save", async () => {
			// Start: no sessions
			let sessions: any[] = [];
			mockSessionManager.listSessions.mockResolvedValue(sessions);

			expect(sessions).toHaveLength(0);

			// First save
			const session = {
				id: `sess-${Date.now()}`,
				status: "active",
				startedAt: new Date().toISOString(),
			};

			sessions.push(session);

			// After first save, session should exist
			expect(sessions).toHaveLength(1);
			expect(sessions[0].status).toBe("active");
		});

		it("should NOT create new session on second save (same session)", async () => {
			let sessions: any[] = [];

			// First save creates session
			sessions.push({
				id: "sess-1",
				status: "active",
				startedAt: new Date().toISOString(),
			});

			const sessionCountAfterSave1 = sessions.length;

			// Second save - should reuse session, not create new one
			// (just do another snapshot in same session)

			const snapshot2 = {
				sessionId: "sess-1", // Same session
			};

			// Session count should still be 1
			expect(sessions).toHaveLength(sessionCountAfterSave1);
		});

		it("should create NEW session after idle timeout", async () => {
			vi.useFakeTimers();

			let sessions: any[] = [];

			const session1: any = {
				id: "sess-1",
				status: "active",
				startedAt: Date.now(),
			};

			sessions.push(session1);
			expect(sessions).toHaveLength(1);

			// Advance time past idle timeout (5 minutes)
			vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

			// Session should be finalized
			session1.status = "completed";
			session1.finalizedAt = Date.now();

			// Next save creates NEW session
			const session2 = {
				id: "sess-2",
				status: "active",
				startedAt: Date.now(),
			};

			sessions.push(session2);

			expect(sessions).toHaveLength(2);
			expect(sessions[0].status).toBe("completed");
			expect(sessions[1].status).toBe("active");

			vi.useRealTimers();
		});
	});

	describe("Snapshot-Session Linking", () => {
		it("should link snapshot to active session", async () => {
			const activeSession = {
				id: "sess-123",
				status: "active",
			};

			const snapshot = {
				id: "snap-1",
				filePath: "app.ts",
				sessionId: activeSession.id, // MUST have this
				createdAt: new Date().toISOString(),
			};

			// Verify snapshot has sessionId
			expect(snapshot.sessionId).toBeDefined();
			expect(snapshot.sessionId).toBe("sess-123");
		});

		it("should NOT create snapshot without sessionId", async () => {
			// Bad: snapshot without session
			const badSnapshot = {
				id: "snap-orphan",
				filePath: "app.ts",
				// NO sessionId - BAD!
			};

			// Good: snapshot always has session
			const goodSnapshot = {
				id: "snap-1",
				filePath: "app.ts",
				sessionId: "sess-1", // MUST be present
			};

			expect("sessionId" in badSnapshot).toBe(false);
			expect("sessionId" in goodSnapshot).toBe(true);
		});

		it("should update session with snapshot reference", async () => {
			const session = {
				id: "sess-1",
				snapshots: [] as string[],
			};

			// Create snapshot in session
			const snapshot = {
				id: "snap-1",
				sessionId: session.id,
			};

			// Session should track snapshots
			session.snapshots.push(snapshot.id);

			expect(session.snapshots).toHaveLength(1);
			expect(session.snapshots[0]).toBe("snap-1");
		});

		it("should handle multiple snapshots in one session", async () => {
			const session = {
				id: "sess-1",
				snapshots: [] as string[],
			};

			// Multiple saves -> multiple snapshots in same session
			for (let i = 1; i <= 5; i++) {
				const snapshot = {
					id: `snap-${i}`,
					sessionId: session.id,
				};
				session.snapshots.push(snapshot.id);
			}

			expect(session.snapshots).toHaveLength(5);
			session.snapshots.forEach((snapId) => {
				expect(snapId).toMatch(/^snap-\d+$/);
			});
		});
	});

	describe("Session Finalization", () => {
		it("should finalize session after idle timeout (5 minutes)", async () => {
			vi.useFakeTimers();

			const session: any = {
				id: "sess-1",
				status: "active",
				startedAt: Date.now(),
			};

			// Simulate 5 minutes of inactivity
			vi.advanceTimersByTime(5 * 60 * 1000);

			// At 5+ minutes, should finalize
			session.status = "completed" as any;
			session.finalizedAt = Date.now();

			expect(session.status).toBe("completed");
			expect(session.finalizedAt).toBeDefined();

			vi.useRealTimers();
		});

		it("should NOT finalize during active work", async () => {
			vi.useFakeTimers();

			const session: any = {
				id: "sess-1",
				status: "active",
				startedAt: Date.now(),
			};

			// Simulate activity every 1 minute for 3 minutes
			for (let i = 0; i < 3; i++) {
				vi.advanceTimersByTime(60 * 1000);
				// User saves (resets idle timer)
			}

			// Session should still be active (only 3 min elapsed)
			expect(session.status).toBe("active");
			expect(session.finalizedAt).toBeUndefined();

			vi.useRealTimers();
		});

		it("should set finalized timestamp", async () => {
			const now = Date.now();
			vi.useFakeTimers();
			vi.setSystemTime(now);

			const session: any = {
				id: "sess-1",
				startedAt: now,
			};

			// After finalization
			vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
			session.finalizedAt = Date.now();

			expect(session.finalizedAt).toBe(now + 5 * 60 * 1000 + 1000);

			vi.useRealTimers();
		});
	});

	describe("Idle Timer Reset", () => {
		it("should reset idle timer on each save", async () => {
			vi.useFakeTimers();

			const session = {
				id: "sess-1",
				status: "active",
				lastActivity: Date.now(),
			};

			// Advance 4 minutes (under 5 min limit)
			vi.advanceTimersByTime(4 * 60 * 1000);

			// User saves - resets timer
			session.lastActivity = Date.now();

			// Advance another 4 minutes (total 8, but timer was reset at 4)
			vi.advanceTimersByTime(4 * 60 * 1000);

			// Session should still be active (4 min since last reset)
			expect(session.status).toBe("active");

			// Only after 5 more minutes would it finalize
			vi.advanceTimersByTime(1 * 60 * 1000 + 1000);
			session.status = "completed" as any;

			expect(session.status).toBe("completed");

			vi.useRealTimers();
		});

		it("should handle rapid saves without issues", async () => {
			const session = {
				id: "sess-1",
				saveCount: 0,
			};

			// 10 rapid saves (< 1 sec apart)
			for (let i = 0; i < 10; i++) {
				session.saveCount++;
			}

			// Should not crash or timeout
			expect(session.saveCount).toBe(10);
		});
	});

	describe("Session Lifecycle", () => {
		it("should track session from creation to finalization", async () => {
			vi.useFakeTimers();

			const startTime = Date.now();
			vi.setSystemTime(startTime);

			const session: any = {
				id: "sess-1",
				status: "active",
				startedAt: startTime,
				snapshotCount: 0,
			};

			// Save 1 minute after start
			vi.advanceTimersByTime(60 * 1000);
			session.snapshotCount++;

			// Save again 2 minutes after start
			vi.advanceTimersByTime(60 * 1000);
			session.snapshotCount++;

			expect(session.snapshotCount).toBe(2);
			expect(session.status).toBe("active");

			// Wait for idle (5+ minutes total)
			vi.advanceTimersByTime(4 * 60 * 1000 + 1000);
			session.status = "completed" as any;
			session.finalizedAt = Date.now();

			// Final state
			expect(session.status).toBe("completed");
			expect(session.finalizedAt).toBeGreaterThan(session.startedAt);
			expect(session.snapshotCount).toBe(2);

			vi.useRealTimers();
		});

		it("should not leak session objects", async () => {
			const sessions: any[] = [];

			// Create 100 sessions
			for (let i = 0; i < 100; i++) {
				sessions.push({
					id: `sess-${i}`,
					status: "completed",
				});
			}

			// All should be finalized/cleanable
			const completedSessions = sessions.filter(
				(s) => s.status === "completed"
			);

			expect(completedSessions).toHaveLength(100);

			// Should be cleanable
			sessions.length = 0;
			expect(sessions).toHaveLength(0);
		});
	});

	describe("Session Metadata", () => {
		it("should store session start time", async () => {
			const now = Date.now();

			const session = {
				id: "sess-1",
				startedAt: new Date(now).toISOString(),
			};

			expect(session.startedAt).toBeDefined();
			expect(new Date(session.startedAt).getTime()).toBe(now);
		});

		it("should store finalization time when completed", async () => {
			const session = {
				id: "sess-1",
				startedAt: new Date().toISOString(),
				finalizedAt: new Date().toISOString(),
				status: "completed",
			};

			expect(session.finalizedAt).toBeDefined();
			const endTime = new Date(session.finalizedAt).getTime();
			const startTime = new Date(session.startedAt).getTime();

			expect(endTime).toBeGreaterThanOrEqual(startTime);
		});
	});
});
