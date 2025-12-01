/**
 * Session Storage Integration Tests
 *
 * Integration tests for the session manifest storage functionality.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCoordinator } from "../../../src/snapshot/SessionCoordinator";
import type { SessionManifest } from "../../../src/snapshot/sessionTypes";
import type { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter";

describe("Session Storage Integration", () => {
	let sessionCoordinator: SessionCoordinator;
	let mockStorageAdapter: SqliteStorageAdapter;

	beforeEach(() => {
		// Create a mock storage adapter
		mockStorageAdapter = {
			storeSessionManifest: vi.fn().mockResolvedValue(undefined),
			getSessionManifest: vi.fn().mockResolvedValue(null),
			listSessionManifests: vi.fn().mockResolvedValue({
				sessions: [],
				total: 0,
				page: 1,
				limit: 50,
			}),
			initialize: vi.fn().mockResolvedValue(undefined),
			create: vi.fn(),
			retrieve: vi.fn(),
			list: vi.fn(),
			restore: vi.fn(),
			close: vi.fn(),
		} as unknown as SqliteStorageAdapter;

		sessionCoordinator = new SessionCoordinator(mockStorageAdapter);
	});

	it("should store session manifest when finalizing session", async () => {
		// Add some candidates to the session
		sessionCoordinator.addCandidate("file1.ts", "snapshot1", {
			added: 5,
			deleted: 2,
		});
		sessionCoordinator.addCandidate("file2.ts", "snapshot2", {
			added: 3,
			deleted: 1,
		});

		// Mock the storeSessionManifest method to capture the call
		const storeSessionManifestSpy = vi.spyOn(
			mockStorageAdapter,
			"storeSessionManifest",
		);

		// Finalize the session
		const sessionId = await sessionCoordinator.finalizeSession("manual");

		// Verify that storeSessionManifest was called
		expect(storeSessionManifestSpy).toHaveBeenCalled();

		// Verify the session manifest that was stored
		const storedManifest = storeSessionManifestSpy.mock
			.calls[0][0] as SessionManifest;
		expect(storedManifest.id).toBe(sessionId);
		expect(storedManifest.reason).toBe("manual");
		expect(storedManifest.files).toHaveLength(2);
		expect(storedManifest.files[0].uri).toBe("file1.ts");
		expect(storedManifest.files[0].snapshotId).toBe("snapshot1");
		expect(storedManifest.files[0].changeStats).toEqual({
			added: 5,
			deleted: 2,
		});
		expect(storedManifest.files[1].uri).toBe("file2.ts");
		expect(storedManifest.files[1].snapshotId).toBe("snapshot2");
		expect(storedManifest.files[1].changeStats).toEqual({
			added: 3,
			deleted: 1,
		});
		expect(storedManifest.startedAt).toBeLessThanOrEqual(
			storedManifest.endedAt,
		);
	});

	it("should handle storage errors gracefully during session finalization", async () => {
		// Add some candidates to the session
		sessionCoordinator.addCandidate("file1.ts", "snapshot1");

		// Mock the storeSessionManifest method to throw an error
		const storeSessionManifestSpy = vi
			.spyOn(mockStorageAdapter, "storeSessionManifest")
			.mockRejectedValue(new Error("Database error"));

		// Mock the event emitter to capture events
		const eventFireSpy = vi.spyOn(
			(sessionCoordinator as any).eventEmitter,
			"fire",
		);

		// Finalize the session - should not throw an error
		const sessionId = await sessionCoordinator.finalizeSession("manual");

		// Verify that the session was still finalized (ID returned)
		expect(sessionId).toBeTruthy();

		// Verify that storeSessionManifest was called
		expect(storeSessionManifestSpy).toHaveBeenCalled();

		// Verify that the session event was still fired
		expect(eventFireSpy).toHaveBeenCalled();
	});

	it("should store session manifest for long-running sessions", async () => {
		// Override the session start time to simulate a long-running session
		(sessionCoordinator as any).sessionStart = Date.now() - 3600001; // 1 hour + 1ms ago

		// Add a candidate to make the session valid
		sessionCoordinator.addCandidate("file1.ts", "snapshot1", {
			added: 5,
			deleted: 2,
		});

		// Mock the storeSessionManifest method to capture the call
		const storeSessionManifestSpy = vi.spyOn(
			mockStorageAdapter,
			"storeSessionManifest",
		);

		// Manually trigger the long session check
		(sessionCoordinator as any).checkLongSession();

		// Verify that storeSessionManifest was called with max-duration reason
		expect(storeSessionManifestSpy).toHaveBeenCalled();

		// Verify the session manifest that was stored
		const storedManifest = storeSessionManifestSpy.mock
			.calls[0][0] as SessionManifest;
		expect(storedManifest.reason).toBe("max-duration");
	});
});
