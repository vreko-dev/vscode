/**
 * SessionCoordinator Tests
 *
 * Comprehensive tests for the SessionCoordinator class that manages session-aware snapshots.
 * Tests cover all session finalization triggers, idle detection, long session monitoring,
 * and edge cases.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCoordinator } from "../../../src/snapshot/SessionCoordinator";
import type { SessionManifest } from "../../../src/snapshot/sessionTypes";
import type { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter";

// Mock storage adapter
const mockStorage = {
	storeSessionManifest: vi.fn().mockResolvedValue(undefined),
} as unknown as SqliteStorageAdapter;

describe("SessionCoordinator", () => {
	let coordinator: SessionCoordinator;

	beforeEach(() => {
		vi.clearAllMocks();
		coordinator = new SessionCoordinator(mockStorage);
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

		it("should start with empty candidates map", () => {
			const candidates = (coordinator as any).candidates;
			expect(candidates.size).toBe(0);
		});

		it("should initialize session start time", () => {
			const sessionStart = (coordinator as any).sessionStart;
			expect(sessionStart).toBeGreaterThan(0);
			expect(Date.now() - sessionStart).toBeLessThan(100); // Started recently
		});

		it("should start idle detection timer", () => {
			const idleTimeout = (coordinator as any).idleTimeout;
			expect(idleTimeout).not.toBeNull();
		});

		it("should start long session monitoring", () => {
			const longSessionInterval = (coordinator as any).longSessionInterval;
			expect(longSessionInterval).not.toBeNull();
		});
	});

	describe("addCandidate", () => {
		it("should add candidates to the session", () => {
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});

			const candidates = (coordinator as any).candidates;
			expect(candidates.size).toBe(1);
			expect(candidates.has("file1.ts")).toBe(true);
		});

		it("should store candidate with correct data", () => {
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});

			const candidates = (coordinator as any).candidates;
			const candidate = candidates.get("file1.ts");

			expect(candidate.uri).toBe("file1.ts");
			expect(candidate.snapshotId).toBe("snapshot1");
			expect(candidate.stats).toEqual({ added: 5, deleted: 2 });
			expect(candidate.updatedAt).toBeGreaterThan(0);
		});

		it("should update existing candidate for same file", () => {
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});
			coordinator.addCandidate("file1.ts", "snapshot2", {
				added: 10,
				deleted: 3,
			});

			const candidates = (coordinator as any).candidates;
			expect(candidates.size).toBe(1);

			const candidate = candidates.get("file1.ts");
			expect(candidate.snapshotId).toBe("snapshot2");
			expect(candidate.stats).toEqual({ added: 10, deleted: 3 });
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

			const candidates = (coordinator as any).candidates;
			expect(candidates.size).toBe(3);
		});

		it("should reset idle timer when candidate added", () => {
			const resetIdleTimerSpy = vi.spyOn(coordinator as any, "resetIdleTimer");

			coordinator.addCandidate("file1.ts", "snapshot1");

			expect(resetIdleTimerSpy).toHaveBeenCalled();
		});
	});

	describe("finalizeSession", () => {
		it("should finalize session with idle-break trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});

			const storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			const sessionId = await coordinator.finalizeSession("idle-break");

			expect(sessionId).toMatch(/^session-/);
			expect(storeSessionManifestSpy).toHaveBeenCalled();
		});

		it("should finalize session with blur trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			const sessionId = await coordinator.finalizeSession("blur");

			expect(sessionId).toBeTruthy();
			const manifest = storeSessionManifestSpy.mock
				.calls[0][0] as SessionManifest;
			expect(manifest.reason).toBe("blur");
		});

		it("should finalize session with commit trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			const sessionId = await coordinator.finalizeSession("commit");

			expect(sessionId).toBeTruthy();
			const manifest = storeSessionManifestSpy.mock
				.calls[0][0] as SessionManifest;
			expect(manifest.reason).toBe("commit");
		});

		it("should finalize session with task trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			const sessionId = await coordinator.finalizeSession("task");

			expect(sessionId).toBeTruthy();
			const manifest = storeSessionManifestSpy.mock
				.calls[0][0] as SessionManifest;
			expect(manifest.reason).toBe("task");
		});

		it("should finalize session with manual trigger", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			const sessionId = await coordinator.finalizeSession("manual");

			expect(sessionId).toBeTruthy();
			const manifest = storeSessionManifestSpy.mock
				.calls[0][0] as SessionManifest;
			expect(manifest.reason).toBe("manual");
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

			const storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			await coordinator.finalizeSession("manual");

			const manifest = storeSessionManifestSpy.mock
				.calls[0][0] as SessionManifest;
			expect(manifest.files).toHaveLength(3);
			expect(manifest.files[0].uri).toBe("file1.ts");
			expect(manifest.files[1].uri).toBe("file2.ts");
			expect(manifest.files[2].uri).toBe("file3.ts");
		});

		it("should emit session finalized event", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const _storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			const eventPromise = new Promise<SessionManifest>((resolve) => {
				coordinator.onSessionFinalized((manifest) => resolve(manifest));
			});

			await coordinator.finalizeSession("manual");

			const manifest = await eventPromise;
			expect(manifest.reason).toBe("manual");
		});

		it("should reset session state after finalization", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");
			coordinator.addCandidate("file2.ts", "snapshot2");

			const _storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			await coordinator.finalizeSession("manual");

			const candidates = (coordinator as any).candidates;
			expect(candidates.size).toBe(0);
		});

		it("should handle storage failures gracefully", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const _storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockRejectedValue(new Error("Storage error"));

			const sessionId = await coordinator.finalizeSession("manual");

			expect(sessionId).toBeNull();
		});
	});

	describe("trigger handlers", () => {
		it("should handle window blur event", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const finalizeSessionSpy = vi.spyOn(coordinator, "finalizeSession");

			coordinator.handleWindowBlur();

			expect(finalizeSessionSpy).toHaveBeenCalledWith("blur");
		});

		it("should handle git commit event", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const finalizeSessionSpy = vi.spyOn(coordinator, "finalizeSession");

			coordinator.handleGitCommit();

			expect(finalizeSessionSpy).toHaveBeenCalledWith("commit");
		});

		it("should handle task completion event", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const finalizeSessionSpy = vi.spyOn(coordinator, "finalizeSession");

			coordinator.handleTaskCompletion();

			expect(finalizeSessionSpy).toHaveBeenCalledWith("task");
		});

		it("should handle manual finalization", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");

			const finalizeSessionSpy = vi.spyOn(coordinator, "finalizeSession");

			coordinator.handleManualFinalization();

			expect(finalizeSessionSpy).toHaveBeenCalledWith("manual");
		});
	});

	describe("long session monitoring", () => {
		it("should finalize long sessions when they exceed max duration", async () => {
			// Override the session start time to simulate a long-running session
			(coordinator as any).sessionStart = Date.now() - 3600001; // 1 hour + 1ms ago

			// Add a candidate to make the session valid
			coordinator.addCandidate("file1.ts", "snapshot1", {
				added: 5,
				deleted: 2,
			});

			// Mock the storeSessionManifest method to avoid actual storage operations
			const storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			// Mock the finalizeSession method to capture the reason it's called with
			const finalizeSessionSpy = vi.spyOn(coordinator, "finalizeSession");

			// Manually trigger the long session check
			(coordinator as any).checkLongSession();

			// Verify that finalizeSession was called with the correct reason
			expect(finalizeSessionSpy).toHaveBeenCalledWith("max-duration");

			storeSessionManifestSpy.mockRestore();
			finalizeSessionSpy.mockRestore();
		});

		it("should not finalize long sessions with no candidates", async () => {
			// Override the session start time to simulate a long-running session
			(coordinator as any).sessionStart = Date.now() - 3600001; // 1 hour + 1ms ago

			// Don't add any candidates

			const finalizeSessionSpy = vi.spyOn(coordinator, "finalizeSession");

			// Manually trigger the long session check
			(coordinator as any).checkLongSession();

			// Should not finalize if no candidates
			expect(finalizeSessionSpy).not.toHaveBeenCalled();
		});

		it("should not finalize sessions under max duration", async () => {
			// Session is only 30 minutes old (under 1 hour max)
			(coordinator as any).sessionStart = Date.now() - 1800000; // 30 minutes

			coordinator.addCandidate("file1.ts", "snapshot1");

			const finalizeSessionSpy = vi.spyOn(coordinator, "finalizeSession");

			// Manually trigger the long session check
			(coordinator as any).checkLongSession();

			// Should not finalize
			expect(finalizeSessionSpy).not.toHaveBeenCalled();
		});
	});

	describe("performance", () => {
		it("should finalize session within performance budget (<50ms)", async () => {
			coordinator.addCandidate("file1.ts", "snapshot1");
			coordinator.addCandidate("file2.ts", "snapshot2");
			coordinator.addCandidate("file3.ts", "snapshot3");

			const _storeSessionManifestSpy = vi
				.spyOn(coordinator as any, "storeSessionManifest")
				.mockResolvedValue(undefined);

			const start = performance.now();
			await coordinator.finalizeSession("manual");
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(50); // P95 budget from spec
		});
	});
});
