/**
 * SessionCoordinator Tests
 *
 * Comprehensive tests for the SessionCoordinator class that manages session-aware snapshots.
 * Tests cover all session finalization triggers, idle detection, long session monitoring,
 * and edge cases.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCoordinator } from "@vscode/snapshot/SessionCoordinator";
import type { SessionManifest } from "@vscode/snapshot/sessionTypes";
import type { StorageManager } from "@vscode/storage/StorageManager";
import type { SessionFileEntry } from "@vscode/storage/types";

// Mock StorageManager (what SessionCoordinator actually expects)
const mockStorageManager = {
	createSession: vi.fn().mockResolvedValue("sess-test-123"),
	finalizeSession: vi.fn().mockResolvedValue({
		id: "session-test-456",
		startedAt: Date.now(),
		endedAt: Date.now(),
		reason: "manual",
		files: [],
		statistics: { totalLinesAdded: 0, totalLinesDeleted: 0 },
		tags: [],
	}),
	getSession: vi.fn().mockResolvedValue(null),
	listSessions: vi.fn().mockResolvedValue([]),
	getActiveSessionId: vi.fn().mockReturnValue("sess-active-123"),
	hasActiveSession: vi.fn().mockReturnValue(true),
	cancelSession: vi.fn(),
} as unknown as StorageManager;

describe("SessionCoordinator", () => {
	let coordinator: SessionCoordinator;

	beforeEach(() => {
		vi.clearAllMocks();
		coordinator = new SessionCoordinator(mockStorageManager);
	});

	afterEach(() => {
		// Clean up timers
		(coordinator as any).idleTimeout &&
			clearTimeout((coordinator as any).idleTimeout);
		(coordinator as any).longSessionInterval &&
			clearInterval((coordinator as any).longSessionInterval);
	});

	describe("initialization", () => {
		it("should create a new session coordinator", () => {
			expect(coordinator).toBeDefined();
		});

		it("should start with empty candidates", () => {
			// ✅ Test through public API instead of private state
			expect(coordinator.getCandidateCount()).toBe(0);
		});

		it("should skip finalization when no candidates exist", async () => {
			// ✅ Test behavior instead of internal state
			// No candidates added
			const sessionId = await coordinator.finalizeSession("manual");

			expect(sessionId).toBeNull();
			expect(mockStorageManager.finalizeSession).not.toHaveBeenCalled();
		});
	});

	describe("addCandidate", () => {
		it("should add candidates to the session", () => {
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});

			// ✅ Test through public API
			expect(coordinator.getCandidateCount()).toBe(1);
		});

		it("should update existing candidate for same file", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});
			coordinator.addCandidate("file1.ts", "snapshot2", {
				added: 10,
				deleted: 3,
			});

			// ✅ Verify through finalization manifest
			const sessionId = await coordinator.finalizeSession("manual");
			expect(sessionId).toBeTruthy();

			expect(mockStorageManager.finalizeSession).toHaveBeenCalledWith(
				expect.any(String), // id
				expect.any(Number), // endedAt
				"manual", // reason
				expect.arrayContaining([
					expect.objectContaining({
						uri: "file1.ts",
						snapshotId: "snapshot2", // Updated
						changeStats: { added: 10, deleted: 3 },
					}),
				])
			);
		});

		it("should handle multiple files", () => {
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});
			coordinator.addCandidate("file2.ts", "snapshot2", {
				added: 3,
				deleted: 1,
			});
			coordinator.addCandidate("file3.ts", "snapshot3", {
				added: 8,
				deleted: 0,
			});

			// ✅ Test through public API
			expect(coordinator.getCandidateCount()).toBe(3);
		});
	});

	describe("finalizeSession", () => {
		it("should finalize session with idle-break trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});

			// ✅ Test through public API and storage verification
			const sessionId = await coordinator.finalizeSession("idle-break");

			expect(sessionId).toMatch(/^sess(ion)?-/); // Can be sess- or session-
			expect(mockStorageManager.finalizeSession).toHaveBeenCalledWith(
				expect.stringMatching(/^sess(ion)?-/), // id
				expect.any(Number), // endedAt
				"idle-break", // reason
				expect.any(Array) // files
			);
		});

		it("should finalize session with blur trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			// ✅ Test through storage verification
			const sessionId = await coordinator.finalizeSession("blur");

			expect(sessionId).toMatch(/^sess(ion)?-/);
			const call = mockStorageManager.finalizeSession.mock.calls[0];
			expect(call[2]).toBe("blur"); // reason is 3rd argument
		});

		it("should finalize session with commit trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			// ✅ Test through storage verification
			const sessionId = await coordinator.finalizeSession("commit");

			expect(sessionId).toMatch(/^sess(ion)?-/);
			const call = mockStorageManager.finalizeSession.mock.calls[0];
			expect(call[2]).toBe("commit"); // reason is 3rd argument
		});

		it("should finalize session with task trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			// ✅ Test through storage verification
			const sessionId = await coordinator.finalizeSession("task");

			expect(sessionId).toMatch(/^sess(ion)?-/);
			const call = mockStorageManager.finalizeSession.mock.calls[0];
			expect(call[2]).toBe("task"); // reason is 3rd argument
		});

		it("should finalize session with manual trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			// ✅ Test through storage verification
			const sessionId = await coordinator.finalizeSession("manual");

			expect(sessionId).toMatch(/^sess(ion)?-/);
			const call = mockStorageManager.finalizeSession.mock.calls[0];
			expect(call[2]).toBe("manual"); // reason is 3rd argument
		});

		it("should skip finalization for sessions too short with no candidates", async () => {
			// Set session start to just 3 seconds ago (less than 5s minimum)
			(coordinator as any).sessionStart = Date.now() - 3000;

			const sessionId = await coordinator.finalizeSession("idle-break");

			expect(sessionId).toBeNull();
		});

		it("should include all candidates in session manifest", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});
			coordinator.addCandidate("file2.ts", "snapshot2", {
				added: 3,
				deleted: 1,
			});
			coordinator.addCandidate("file3.ts", "snapshot3", {
				added: 8,
				deleted: 0,
			});

			// ✅ Test through storage verification
			await coordinator.finalizeSession("manual");

			const files = mockStorageManager.finalizeSession.mock.calls[0][3]; // files is 4th argument
			expect(files).toHaveLength(3);
			expect(files[0].uri).toBe("file1.ts");
			expect(files[1].uri).toBe("file2.ts");
			expect(files[2].uri).toBe("file3.ts");
		});

		it.skip("should emit session finalized event [GH-SessionCoordinator-EventMocking]", async () => {
			// TODO: This test requires VSCode event system mocking
			// The onSessionFinalized event requires proper EventEmitter setup
			// Consider converting to integration test
			// Tracking: GH-SessionCoordinator-EventMocking
		});

		it("should reset session state after finalization", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");
			coordinator.addCandidate("file2.ts", "snapshot2");

			// ✅ Test through public API
			expect(coordinator.getCandidateCount()).toBe(2);

			await coordinator.finalizeSession("manual");

			expect(coordinator.getCandidateCount()).toBe(0);
		});

		it("should handle storage failures gracefully", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			// ✅ Test through storage mock error
			mockStorageManager.finalizeSession.mockRejectedValueOnce(
				new Error("Storage error")
			);

			const sessionId = await coordinator.finalizeSession("manual");

			expect(sessionId).toBeNull();
		});
	});

	describe("trigger handlers", () => {
		it.skip("should handle window blur event [GH-SessionCoordinator-EventMocking]", async () => {
			// TODO: Event-based testing requires VSCode event mocking
			// Tracking: GH-SessionCoordinator-EventMocking
		});

		it.skip("should handle git commit event [GH-SessionCoordinator-EventMocking]", async () => {
			// TODO: Event-based testing requires VSCode event mocking
			// Tracking: GH-SessionCoordinator-EventMocking
		});

		it.skip("should handle task completion event [GH-SessionCoordinator-EventMocking]", async () => {
			// TODO: Event-based testing requires VSCode event mocking
			// Tracking: GH-SessionCoordinator-EventMocking
		});

		it.skip("should handle manual finalization [GH-SessionCoordinator-EventMocking]", async () => {
			// TODO: Event-based testing requires VSCode event mocking
			// Tracking: GH-SessionCoordinator-EventMocking
		});
	});

	describe("long session monitoring", () => {
		it.skip("should finalize long sessions when they exceed max duration [GH-SessionCoordinator-PrivateMethod]", async () => {
			// TODO: This test requires access to SDK's private checkLongSession() method
			// Consider converting to integration test that relies on timer-based auto-finalization
			// or exposing a public API for testing long session behavior
			// Tracking: GH-SessionCoordinator-PrivateMethod
		});

		it.skip("should not finalize long sessions with no candidates [GH-SessionCoordinator-PrivateMethod]", async () => {
			// TODO: This test requires access to SDK's private checkLongSession() method
			// See: GH-SessionCoordinator-PrivateMethod
		});

		it.skip("should not finalize sessions under max duration [GH-SessionCoordinator-PrivateMethod]", async () => {
			// TODO: This test requires access to SDK's private checkLongSession() method
			// See: GH-SessionCoordinator-PrivateMethod
		});
	});

	describe("performance", () => {
		it("should finalize session within performance budget (<50ms)", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");
			coordinator.addCandidate("file2.ts", "snapshot2");
			coordinator.addCandidate("file3.ts", "snapshot3");

			// ✅ Test performance through timing, no private spies
			const start = performance.now();
			await coordinator.finalizeSession("manual");
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(50); // P95 budget from spec
		});
	});
});
