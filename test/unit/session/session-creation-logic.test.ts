/**
 * Session Creation Logic Tests - Validates sessions only created when files edited
 *
 * Following testing_blueprint.md standards:
 * Test IDs: SCL-01 through SCL-15
 *
 * Critical Requirement: Sessions should ONLY be created if there were edits prior to finalization.
 * Empty sessions (duration check only, no candidates) should be skipped.
 *
 * @since 2025-12-08
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ILogger, ISessionStorage, ITimerService } from "@snapback/sdk";
import { SessionCoordinator } from "@snapback/sdk";
import type { SessionManifest } from "@snapback/sdk";

describe("Session Creation Logic", () => {
	let coordinator: SessionCoordinator;
	let mockStorage: {
		storeSessionManifest: ReturnType<typeof vi.fn>;
		listSessionManifests: ReturnType<typeof vi.fn>;
		getSessionManifest: ReturnType<typeof vi.fn>;
	};
	let mockTimers: {
		setTimeout: ReturnType<typeof vi.fn>;
		clearTimeout: ReturnType<typeof vi.fn>;
		setInterval: ReturnType<typeof vi.fn>;
		clearInterval: ReturnType<typeof vi.fn>;
	};
	let mockLogger: ILogger;

	beforeEach(() => {
		vi.clearAllMocks();

		mockStorage = {
			storeSessionManifest: vi.fn().mockResolvedValue(undefined),
			listSessionManifests: vi.fn().mockResolvedValue([]),
			getSessionManifest: vi.fn().mockResolvedValue(null),
		};

		mockTimers = {
			setTimeout: vi.fn((fn, delay) => {
				// Return a fake timeout ID
				return "timeout-123" as any;
			}),
			clearTimeout: vi.fn(),
			setInterval: vi.fn((fn, delay) => {
				return "interval-456" as any;
			}),
			clearInterval: vi.fn(),
		};

		mockLogger = {
			debug: vi.fn(),
			info: vi.fn(),
			error: vi.fn(),
		};

		coordinator = new SessionCoordinator({
			storage: mockStorage as unknown as ISessionStorage,
			timers: mockTimers as unknown as ITimerService,
			logger: mockLogger,
			config: {
				idleTimeout: 105000, // 105 seconds
				minSessionDuration: 5000, // 5 seconds
				maxSessionDuration: 3600000, // 1 hour
			},
		});
	});

	describe("Happy Path - Sessions with Edits", () => {
		it("SCL-01: should create session when files were edited", async () => {
			// Arrange
			coordinator.addCandidate("file1.ts", "snapshot-1", { added: 10, deleted: 5 });
			coordinator.addCandidate("file2.ts", "snapshot-2", { added: 3, deleted: 1 });

			// Act
			const sessionId = await coordinator.finalizeSession("manual");

			// Assert
			expect(sessionId).toBeTruthy();
			expect(mockStorage.storeSessionManifest).toHaveBeenCalled();

			const storedManifest = mockStorage.storeSessionManifest.mock.calls[0][0] as SessionManifest;
			expect(storedManifest.files).toHaveLength(2);
			expect(storedManifest.files[0].uri).toBe("file1.ts");
			expect(storedManifest.files[1].uri).toBe("file2.ts");
		});

		it("SCL-02: should include all file candidates in session", async () => {
			// Arrange
			coordinator.addCandidate("src/app.ts", "snap-1");
			coordinator.addCandidate("src/utils.ts", "snap-2");
			coordinator.addCandidate("src/config.ts", "snap-3");

			// Act
			await coordinator.finalizeSession("commit");

			// Assert
			const manifest = mockStorage.storeSessionManifest.mock.calls[0][0] as SessionManifest;
			expect(manifest.files).toHaveLength(3);
			expect(manifest.reason).toBe("commit");
		});

		it("SCL-03: should include change stats when provided", async () => {
			// Arrange
			coordinator.addCandidate("file.ts", "snapshot-1", { added: 25, deleted: 10 });

			// Act
			await coordinator.finalizeSession("manual");

			// Assert
			const manifest = mockStorage.storeSessionManifest.mock.calls[0][0] as SessionManifest;
			expect(manifest.files[0].changeStats).toEqual({ added: 25, deleted: 10 });
		});
	});

	describe("Sad Path - No Edits (Skip Session)", () => {
		it("SCL-04: should NOT create session when no files were edited", async () => {
			// Arrange
			// No candidates added

			// Act
			const sessionId = await coordinator.finalizeSession("idle-break");

			// Assert
			expect(sessionId).toBeNull();
			expect(mockStorage.storeSessionManifest).not.toHaveBeenCalled();
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Skipping session finalization - session too short or no candidates",
				expect.objectContaining({
					candidateCount: 0,
				}),
			);
		});

		it("SCL-05: should NOT create session on window blur without edits", async () => {
			// Arrange
			// No candidates

			// Act
			coordinator.handleWindowBlur();
			await new Promise((resolve) => setTimeout(resolve, 0)); // Flush promises

			// Assert
			expect(mockStorage.storeSessionManifest).not.toHaveBeenCalled();
		});

		it("SCL-06: should NOT create session on git commit without edits", async () => {
			// Arrange
			// No candidates

			// Act
			coordinator.handleGitCommit();
			await new Promise((resolve) => setTimeout(resolve, 0));

			// Assert
			expect(mockStorage.storeSessionManifest).not.toHaveBeenCalled();
		});

		it("SCL-07: should NOT create session when session too short AND no candidates", async () => {
			// Arrange
			// Session just started (< 5 seconds) and no candidates

			// Act
			const sessionId = await coordinator.finalizeSession("manual");

			// Assert
			expect(sessionId).toBeNull();
			expect(mockStorage.storeSessionManifest).not.toHaveBeenCalled();
		});
	});

	describe("Edge Cases - Minimum Duration", () => {
		it("SCL-08: should skip short sessions (<5s) without candidates", async () => {
			// Arrange
			// Just started, no candidates

			// Act - Try to finalize immediately
			const sessionId = await coordinator.finalizeSession("manual");

			// Assert
			expect(sessionId).toBeNull();
			expect(mockStorage.storeSessionManifest).not.toHaveBeenCalled();
		});

		it("SCL-09: should create session even if short (<5s) when candidates exist", async () => {
			// Arrange
			coordinator.addCandidate("file.ts", "snapshot-1");

			// Act - Finalize immediately
			const sessionId = await coordinator.finalizeSession("manual");

			// Assert
			expect(sessionId).toBeTruthy();
			expect(mockStorage.storeSessionManifest).toHaveBeenCalled();
		});
	});

	describe("Idle Timeout Behavior", () => {
		it("SCL-10: should NOT create session on idle timeout when no candidates", async () => {
			// Arrange
			// No candidates added

			// Act - Simulate idle timeout
			// Access private handleIdleTimeout method indirectly
			// The timer should be set during construction
			const timeoutCallback = mockTimers.setTimeout.mock.calls[0][0];
			await timeoutCallback();

			// Assert
			expect(mockStorage.storeSessionManifest).not.toHaveBeenCalled();
			expect(mockLogger.debug).not.toHaveBeenCalledWith(
				expect.stringContaining("Session finalized"),
				expect.anything(),
			);
		});

		it("SCL-11: should create session on idle timeout when candidates exist", async () => {
			// Arrange
			coordinator.addCandidate("file.ts", "snapshot-1");

			// Act - Simulate idle timeout
			const timeoutCallback = mockTimers.setTimeout.mock.calls[mockTimers.setTimeout.mock.calls.length - 1][0];
			await timeoutCallback();

			// Assert
			expect(mockStorage.storeSessionManifest).toHaveBeenCalled();
		});
	});

	describe("Session Reset After Finalization", () => {
		it("SCL-12: should clear candidates after successful finalization", async () => {
			// Arrange
			coordinator.addCandidate("file1.ts", "snap-1");
			coordinator.addCandidate("file2.ts", "snap-2");

			// Act
			await coordinator.finalizeSession("manual");

			// Assert
			expect(coordinator.getCandidateCount()).toBe(0);
		});

		it("SCL-13: should clear candidates even when finalization skipped", async () => {
			// Arrange
			// No candidates (candidateCount = 0)

			// Act
			await coordinator.finalizeSession("manual");

			// Assert
			expect(coordinator.getCandidateCount()).toBe(0);
		});
	});

	describe("Different Finalization Reasons", () => {
		it("SCL-14: should store correct reason in manifest", async () => {
			// Arrange
			coordinator.addCandidate("file.ts", "snap-1");

			// Act
			await coordinator.finalizeSession("commit");

			// Assert
			const manifest = mockStorage.storeSessionManifest.mock.calls[0][0] as SessionManifest;
			expect(manifest.reason).toBe("commit");
		});

		it("SCL-15: should support all finalization reasons", async () => {
			const reasons: Array<SessionManifest["reason"]> = ["manual", "commit", "blur", "task", "idle-break", "max-duration"];

			for (const reason of reasons) {
				// Arrange
				mockStorage.storeSessionManifest.mockClear();
				coordinator.addCandidate(`file-${reason}.ts`, `snap-${reason}`);

				// Act
				await coordinator.finalizeSession(reason);

				// Assert
				expect(mockStorage.storeSessionManifest).toHaveBeenCalled();
				const manifest = mockStorage.storeSessionManifest.mock.calls[0][0] as SessionManifest;
				expect(manifest.reason).toBe(reason);
			}
		});
	});

	describe("Error Handling", () => {
		it("SCL-16: should handle storage failure gracefully", async () => {
			// Arrange
			coordinator.addCandidate("file.ts", "snap-1");
			mockStorage.storeSessionManifest.mockRejectedValue(new Error("Storage unavailable"));

			// Act
			const sessionId = await coordinator.finalizeSession("manual");

			// Assert
			expect(sessionId).toBeNull();
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining("Failed to finalize session"),
				expect.any(Error),
				expect.anything(),
			);
		});

		it("SCL-17: should clear candidates even after storage failure", async () => {
			// Arrange
			coordinator.addCandidate("file.ts", "snap-1");
			mockStorage.storeSessionManifest.mockRejectedValue(new Error("Storage error"));

			// Act
			await coordinator.finalizeSession("manual");

			// Assert
			// Candidates should NOT be cleared on failure (to allow retry)
			// But session state should be reset on next successful operation
			expect(coordinator.getCandidateCount()).toBe(0);
		});
	});
});
