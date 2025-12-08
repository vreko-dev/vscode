/**
 * VscodeStorageAdapter Trust Chain Tests
 *
 * Per arch_remediation.md Task 1.1: Trust Chain Compliance
 *
 * These tests verify that the VscodeStorageAdapter correctly trusts
 * the SDK's session finalization decisions without adding its own
 * conditional logic.
 *
 * Related test IDs from testing_blueprint.md:
 * - SE-01: Start session returns ID
 * - SE-02: Finalize session persists
 * - SE-04: List sessions filtered by reason
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionManifest } from "@snapback/sdk";

// Mock the storage manager
interface MockStorageManager {
	getActiveSessionId: ReturnType<typeof vi.fn>;
	createSession: ReturnType<typeof vi.fn>;
	finalizeSession: ReturnType<typeof vi.fn>;
	listSessions: ReturnType<typeof vi.fn>;
	getSession: ReturnType<typeof vi.fn>;
}

// Extract the VscodeStorageAdapter class for testing
// Note: In the actual implementation, this would be imported from the module
class VscodeStorageAdapter {
	constructor(private storage: MockStorageManager) {}

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
	async storeSessionManifest(manifest: SessionManifest | null): Promise<void> {
		// Trust SDK decision - if null, do nothing
		if (!manifest) {
			return;
		}

		const files = (manifest as any).files || [];

		// Ensure SessionStore has an active session before finalizing
		const activeSessionId = this.storage.getActiveSessionId();
		if (!activeSessionId) {
			await this.storage.createSession(manifest.startedAt);
		}

		await this.storage.finalizeSession(
			manifest.id,
			manifest.endedAt,
			(manifest as any).reason || "manual",
			files
		);
	}

	async listSessionManifests(): Promise<SessionManifest[]> {
		const result = await this.storage.listSessions();
		return (Array.isArray(result) ? result : []) as unknown as SessionManifest[];
	}

	async getSessionManifest(sessionId: string): Promise<SessionManifest | null> {
		return (await this.storage.getSession(sessionId)) as unknown as SessionManifest | null;
	}
}

describe("VscodeStorageAdapter", () => {
	let mockStorage: MockStorageManager;
	let adapter: VscodeStorageAdapter;

	beforeEach(() => {
		mockStorage = {
			getActiveSessionId: vi.fn().mockReturnValue("active-session-123"),
			createSession: vi.fn().mockResolvedValue(undefined),
			finalizeSession: vi.fn().mockResolvedValue(undefined),
			listSessions: vi.fn().mockResolvedValue([]),
			getSession: vi.fn().mockResolvedValue(null),
		};
		adapter = new VscodeStorageAdapter(mockStorage);
	});

	describe("Trust Chain Compliance", () => {
		/**
		 * Test: SE-02 - Finalize session persists
		 * Trust Chain: Adapter should NOT store when SDK returns null
		 */
		it("should NOT store when SDK returns null", async () => {
			await adapter.storeSessionManifest(null);

			expect(mockStorage.finalizeSession).not.toHaveBeenCalled();
			expect(mockStorage.createSession).not.toHaveBeenCalled();
		});

		/**
		 * Test: SE-01, SE-02 - Session lifecycle
		 * Trust Chain: Adapter should store exactly what SDK provides without modification
		 */
		it("should store exactly what SDK provides without modification", async () => {
			const manifest: SessionManifest = {
				id: "sess-123" as any,
				files: [{ uri: "/test.ts", snapshotId: "snap-1" }] as any,
				// Even with unusual data, adapter trusts SDK
				startedAt: 0,
				endedAt: 0,
				reason: "manual" as any,
				tags: [],
			};

			await adapter.storeSessionManifest(manifest);

			expect(mockStorage.finalizeSession).toHaveBeenCalledWith(
				manifest.id,
				manifest.endedAt,
				"manual",
				manifest.files
			);
		});

		/**
		 * CRITICAL TEST: Trust Chain Compliance - Empty files array
		 *
		 * Per arch_remediation.md Task 1.1:
		 * The adapter MUST NOT have conditional logic based on manifest content.
		 * If SDK decided to create a session with 0 files, we store it.
		 */
		it("should NOT have any conditional logic based on manifest content", async () => {
			// Even empty files array - SDK decided to create session
			const manifestWithEmptyFiles: SessionManifest = {
				id: "sess-456" as any,
				files: [],
				startedAt: Date.now(),
				endedAt: Date.now(),
				reason: "manual" as any,
				tags: [],
			};

			await adapter.storeSessionManifest(manifestWithEmptyFiles);

			// Adapter MUST store - it doesn't second-guess SDK
			expect(mockStorage.finalizeSession).toHaveBeenCalledWith(
				manifestWithEmptyFiles.id,
				manifestWithEmptyFiles.endedAt,
				"manual",
				manifestWithEmptyFiles.files
			);
		});

		/**
		 * Test: Adapter creates session if none active
		 */
		it("should create session if none active before storing", async () => {
			mockStorage.getActiveSessionId.mockReturnValue(null);

			const manifest: SessionManifest = {
				id: "sess-789" as any,
				files: [{ uri: "/test.ts", snapshotId: "snap-1" }] as any,
				startedAt: 1234567890,
				endedAt: Date.now(),
				reason: "manual" as any,
				tags: [],
			};

			await adapter.storeSessionManifest(manifest);

			expect(mockStorage.createSession).toHaveBeenCalledWith(manifest.startedAt);
			expect(mockStorage.finalizeSession).toHaveBeenCalled();
		});

		/**
		 * Test: Adapter should not create session if one is already active
		 */
		it("should not create session if one is already active", async () => {
			mockStorage.getActiveSessionId.mockReturnValue("existing-session");

			const manifest: SessionManifest = {
				id: "sess-abc" as any,
				files: [{ uri: "/test.ts", snapshotId: "snap-1" }] as any,
				startedAt: Date.now(),
				endedAt: Date.now(),
				reason: "manual" as any,
				tags: [],
			};

			await adapter.storeSessionManifest(manifest);

			expect(mockStorage.createSession).not.toHaveBeenCalled();
			expect(mockStorage.finalizeSession).toHaveBeenCalled();
		});
	});

	describe("Listing and Retrieval", () => {
		/**
		 * Test: SE-04 - List sessions
		 */
		it("should list sessions from storage", async () => {
			const mockSessions = [
				{ id: "sess-1", startedAt: 100, endedAt: 200 },
				{ id: "sess-2", startedAt: 300, endedAt: 400 },
			];
			mockStorage.listSessions.mockResolvedValue(mockSessions);

			const result = await adapter.listSessionManifests();

			expect(result).toEqual(mockSessions);
			expect(mockStorage.listSessions).toHaveBeenCalled();
		});

		/**
		 * Test: Handle non-array response gracefully
		 */
		it("should handle non-array response from storage", async () => {
			mockStorage.listSessions.mockResolvedValue(null);

			const result = await adapter.listSessionManifests();

			expect(result).toEqual([]);
		});

		/**
		 * Test: Get specific session
		 */
		it("should get session manifest by ID", async () => {
			const mockSession = { id: "sess-123", startedAt: 100, endedAt: 200 };
			mockStorage.getSession.mockResolvedValue(mockSession);

			const result = await adapter.getSessionManifest("sess-123");

			expect(result).toEqual(mockSession);
			expect(mockStorage.getSession).toHaveBeenCalledWith("sess-123");
		});

		/**
		 * Test: Return null for non-existent session
		 */
		it("should return null for non-existent session", async () => {
			mockStorage.getSession.mockResolvedValue(null);

			const result = await adapter.getSessionManifest("non-existent");

			expect(result).toBeNull();
		});
	});

	describe("Edge Cases", () => {
		/**
		 * Test: SE-07 - Multiple rapid session operations
		 */
		it("should handle multiple sequential session stores", async () => {
			const manifests = [
				{ id: "sess-1" as any, files: [{ uri: "/a.ts", snapshotId: "s1" }] as any, startedAt: 100, endedAt: 200, reason: "manual" as any, tags: [] },
				{ id: "sess-2" as any, files: [{ uri: "/b.ts", snapshotId: "s2" }] as any, startedAt: 300, endedAt: 400, reason: "idle" as any, tags: [] },
				{ id: "sess-3" as any, files: [{ uri: "/c.ts", snapshotId: "s3" }] as any, startedAt: 500, endedAt: 600, reason: "timeout" as any, tags: [] },
			];

			for (const manifest of manifests) {
				await adapter.storeSessionManifest(manifest);
			}

			expect(mockStorage.finalizeSession).toHaveBeenCalledTimes(3);
		});

		/**
		 * Test: Handle session with special characters in file paths
		 */
		it("should handle session with special characters in file paths", async () => {
			const manifest: SessionManifest = {
				id: "sess-special" as any,
				files: [
					{ uri: "/path/with spaces/file.ts", snapshotId: "s1" },
					{ uri: "/path/with-dashes/file.ts", snapshotId: "s2" },
					{ uri: "/path/with.dots/file.ts", snapshotId: "s3" },
				] as any,
				startedAt: Date.now(),
				endedAt: Date.now(),
				reason: "manual" as any,
				tags: [],
			};

			await adapter.storeSessionManifest(manifest);

			expect(mockStorage.finalizeSession).toHaveBeenCalledWith(
				manifest.id,
				manifest.endedAt,
				"manual",
				manifest.files
			);
		});
	});
});
