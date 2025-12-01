/**
 * Session Storage Tests
 *
 * Tests for the session manifest storage functionality.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionManifest } from "../../../src/snapshot/sessionTypes";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter";

// Mock the file system
vi.mock("node:fs/promises", () => ({
	default: {
		mkdir: vi.fn().mockResolvedValue(undefined),
		stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
		readFile: vi.fn().mockResolvedValue("test content"),
		writeFile: vi.fn().mockResolvedValue(undefined),
		unlink: vi.fn().mockResolvedValue(undefined),
		copyFile: vi.fn().mockResolvedValue(undefined),
	},
}));

// Mock better-sqlite3
vi.mock("better-sqlite3", () => {
	return {
		default: vi.fn().mockImplementation(() => ({
			pragma: vi.fn(),
			exec: vi.fn(),
			prepare: vi.fn().mockReturnValue({
				run: vi.fn(),
				get: vi.fn(),
				all: vi.fn(),
			}),
			transaction: vi.fn().mockImplementation((fn) => fn),
			close: vi.fn(),
		})),
	};
});

describe("Session Storage", () => {
	let storageAdapter: SqliteStorageAdapter;
	const testWorkspaceRoot = "/test/workspace";

	beforeEach(() => {
		storageAdapter = new SqliteStorageAdapter(testWorkspaceRoot);
	});

	it("should store and retrieve session manifests", async () => {
		const testSession: SessionManifest = {
			id: "session-123",
			startedAt: Date.now() - 3600000,
			endedAt: Date.now(),
			reason: "manual",
			files: [
				{
					uri: "file1.ts",
					snapshotId: "snapshot-1",
					changeStats: {
						added: 10,
						deleted: 5,
					},
				},
				{
					uri: "file2.ts",
					snapshotId: "snapshot-2",
				},
			],
			summary: "Test session summary",
			tags: ["test", "manual"],
		};

		// Mock the sqliteStorage methods
		const mockStoreSessionManifest = vi.fn().mockResolvedValue(undefined);
		const mockGetSessionManifest = vi.fn().mockResolvedValue({
			id: testSession.id,
			startedAt: testSession.startedAt,
			endedAt: testSession.endedAt,
			reason: testSession.reason,
			files: testSession.files,
			summary: testSession.summary,
			tags: testSession.tags,
		});

		// @ts-expect-error - accessing private property for testing
		storageAdapter.sqliteStorage = {
			storeSessionManifest: mockStoreSessionManifest,
			getSessionManifest: mockGetSessionManifest,
		} as any;

		// @ts-expect-error - accessing private property for testing
		storageAdapter.initialized = true;

		// Store the session manifest
		await storageAdapter.storeSessionManifest(testSession);

		// Verify the store method was called
		expect(mockStoreSessionManifest).toHaveBeenCalledWith({
			id: testSession.id,
			startedAt: testSession.startedAt,
			endedAt: testSession.endedAt,
			reason: testSession.reason,
			files: testSession.files.map((file) => ({
				uri: file.uri,
				snapshotId: file.snapshotId,
				changeStats: file.changeStats,
			})),
			summary: testSession.summary,
			tags: testSession.tags,
		});

		// Retrieve the session manifest
		const retrievedSession = await storageAdapter.getSessionManifest(
			testSession.id,
		);

		// Verify the retrieved session matches the stored session
		expect(retrievedSession).toEqual(testSession);
	});

	it("should list session manifests with pagination", async () => {
		const testSessions: SessionManifest[] = [
			{
				id: "session-1",
				startedAt: Date.now() - 7200000,
				endedAt: Date.now() - 3600000,
				reason: "manual",
				files: [],
				summary: "First test session",
				tags: ["test"],
			},
			{
				id: "session-2",
				startedAt: Date.now() - 3600000,
				endedAt: Date.now(),
				reason: "idle-break",
				files: [],
				summary: "Second test session",
				tags: ["test", "idle"],
			},
		];

		// Mock the sqliteStorage methods
		const mockListSessionManifests = vi.fn().mockResolvedValue({
			sessions: testSessions.map((session) => ({
				id: session.id,
				startedAt: session.startedAt,
				endedAt: session.endedAt,
				reason: session.reason,
				fileCount: session.files.length,
				summary: session.summary,
				tags: session.tags,
			})),
			total: 2,
			page: 1,
			limit: 50,
		});

		// @ts-expect-error - accessing private property for testing
		storageAdapter.sqliteStorage = {
			listSessionManifests: mockListSessionManifests,
		} as any;

		// @ts-expect-error - accessing private property for testing
		storageAdapter.initialized = true;

		// List the session manifests
		const result = await storageAdapter.listSessionManifests(
			1,
			50,
			"endedAt",
			"DESC",
		);

		// Verify the list method was called with correct parameters
		expect(mockListSessionManifests).toHaveBeenCalledWith(
			1,
			50,
			"ended_at",
			"DESC",
		);

		// Verify the result
		expect(result.sessions).toHaveLength(2);
		expect(result.total).toBe(2);
		expect(result.page).toBe(1);
		expect(result.limit).toBe(50);

		// Verify the session data (files array should be empty in list view)
		expect(result.sessions[0].files).toEqual([]);
		expect(result.sessions[1].files).toEqual([]);
	});

	it("should handle storage errors gracefully", async () => {
		const testSession: SessionManifest = {
			id: "session-123",
			startedAt: Date.now() - 3600000,
			endedAt: Date.now(),
			reason: "manual",
			files: [],
		};

		// Mock the sqliteStorage methods to throw errors
		const mockStoreSessionManifest = vi
			.fn()
			.mockRejectedValue(new Error("Database error"));
		const mockGetSessionManifest = vi
			.fn()
			.mockRejectedValue(new Error("Database error"));

		// @ts-expect-error - accessing private property for testing
		storageAdapter.sqliteStorage = {
			storeSessionManifest: mockStoreSessionManifest,
			getSessionManifest: mockGetSessionManifest,
		} as any;

		// @ts-expect-error - accessing private property for testing
		storageAdapter.initialized = true;

		// Store should not throw an error
		await expect(
			storageAdapter.storeSessionManifest(testSession),
		).resolves.not.toThrow();

		// Retrieve should return null on error
		await expect(
			storageAdapter.getSessionManifest("session-123"),
		).resolves.toBeNull();
	});
});
