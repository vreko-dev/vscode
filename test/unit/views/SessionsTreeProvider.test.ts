/**
 * SessionsTreeProvider Tests
 *
 * Comprehensive tests for the SessionsTreeProvider that displays sessions in VS Code tree view.
 * Tests tree structure, session loading, event handling, and UI interactions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { StorageManager } from "@vscode/services/StorageManager";
import type { SessionCoordinator } from "@vscode/snapshot/SessionCoordinator";
import type { SessionManifest } from "@vscode/snapshot/sessionTypes";
import { SessionsTreeProvider } from "@vscode/views/SessionsTreeProvider";
import {
	SessionFileTreeItem,
	SessionTreeItem,
} from "@vscode/views/sessionTypes";

// Mock vscode
vi.mock("vscode", () => ({
	TreeItemCollapsibleState: {
		None: 0,
		Collapsed: 1,
		Expanded: 2,
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
	})),
	TreeItem: vi.fn(),
	MarkdownString: vi.fn().mockImplementation(() => ({
		supportHtml: false,
		isTrusted: false,
		appendMarkdown: vi.fn(),
		appendText: vi.fn(),
	})),
	ThemeIcon: vi.fn().mockImplementation((id: string) => ({ id })),
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path, scheme: "file" })),
	},
}));

// Mock SessionCoordinator
const createMockSessionCoordinator = () => {
	const listeners: Array<(session: SessionManifest) => void> = [];

	return {
		onSessionFinalized: vi.fn(
			(callback: (session: SessionManifest) => void) => {
				listeners.push(callback);
				return { dispose: vi.fn() };
			},
		),
		_fireSessionFinalized: (session: SessionManifest) => {
			listeners.forEach((listener) => {
				listener(session);
			});
		},
	} as unknown as SessionCoordinator;
};

// Mock StorageManager
const createMockStorageManager = () => {
	return {
		listSessionManifests: vi.fn().mockResolvedValue([]),
		storeSessionManifest: vi.fn().mockResolvedValue(undefined),
	} as unknown as StorageManager;
};

describe("SessionsTreeProvider", () => {
	let provider: SessionsTreeProvider;
	let mockCoordinator: SessionCoordinator & {
		_fireSessionFinalized: (session: SessionManifest) => void;
	};
	let mockStorageManager: StorageManager;

	beforeEach(() => {
		vi.clearAllMocks();
		mockCoordinator = createMockSessionCoordinator() as SessionCoordinator & {
			_fireSessionFinalized: (session: SessionManifest) => void;
		};
		mockStorageManager = createMockStorageManager();
		provider = new SessionsTreeProvider(mockCoordinator, mockStorageManager);
	});

	describe("initialization", () => {
		it("should create tree provider", () => {
			expect(provider).toBeDefined();
		});

		it("should listen for session finalized events", () => {
			expect(mockCoordinator.onSessionFinalized).toHaveBeenCalled();
		});

		it("should load sessions from storage on initialization", () => {
			expect(mockStorageManager.listSessionManifests).toHaveBeenCalled();
		});

		it("should start with empty sessions list if storage is empty", async () => {
			const children = await provider.getChildren();
			expect(children).toHaveLength(0);
		});
	});

	describe("session display", () => {
		it("should display sessions after finalization", async () => {
			const session: SessionManifest = {
				id: "session-1",
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [
					{
						uri: "file1.ts",
						snapshotId: "snapshot1",
					},
				],
				tags: [],
			};

			// Trigger session finalized event
			mockCoordinator._fireSessionFinalized(session);

			const children = await provider.getChildren();

			expect(children).toHaveLength(1);
			expect(children[0]).toBeInstanceOf(SessionTreeItem);

			// Should save session to storage
			expect(mockStorageManager.storeSessionManifest).toHaveBeenCalledWith(
				session,
			);
		});

		it("should display multiple sessions", async () => {
			const session1: SessionManifest = {
				id: "session-1",
				startedAt: Date.now() - 120000,
				endedAt: Date.now() - 60000,
				reason: "commit",
				files: [{ uri: "file1.ts", snapshotId: "snapshot1" }],
				tags: [],
			};

			const session2: SessionManifest = {
				id: "session-2",
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "blur",
				files: [{ uri: "file2.ts", snapshotId: "snapshot2" }],
				tags: [],
			};

			mockCoordinator._fireSessionFinalized(session1);
			mockCoordinator._fireSessionFinalized(session2);

			const children = await provider.getChildren();

			expect(children).toHaveLength(2);
		});

		it("should sort sessions by most recent first", async () => {
			const olderSession: SessionManifest = {
				id: "session-old",
				startedAt: Date.now() - 180000, // 3 minutes ago
				endedAt: Date.now() - 120000,
				reason: "commit",
				files: [{ uri: "file1.ts", snapshotId: "snapshot1" }],
				tags: [],
			};

			const newerSession: SessionManifest = {
				id: "session-new",
				startedAt: Date.now() - 60000, // 1 minute ago
				endedAt: Date.now(),
				reason: "blur",
				files: [{ uri: "file2.ts", snapshotId: "snapshot2" }],
				tags: [],
			};

			// Add in reverse chronological order
			mockCoordinator._fireSessionFinalized(olderSession);
			mockCoordinator._fireSessionFinalized(newerSession);

			const children = (await provider.getChildren()) as SessionTreeItem[];

			// Should be sorted with newest first
			expect(children[0].session.id).toBe("session-new");
			expect(children[1].session.id).toBe("session-old");
		});

		it("should set collapsible state based on file count", async () => {
			const sessionWithFiles: SessionManifest = {
				id: "session-with-files",
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [
					{ uri: "file1.ts", snapshotId: "snapshot1" },
					{ uri: "file2.ts", snapshotId: "snapshot2" },
				],
				tags: [],
			};

			const sessionWithoutFiles: SessionManifest = {
				id: "session-empty",
				startedAt: Date.now() - 30000,
				endedAt: Date.now(),
				reason: "manual",
				files: [],
				tags: [],
			};

			mockCoordinator._fireSessionFinalized(sessionWithFiles);
			mockCoordinator._fireSessionFinalized(sessionWithoutFiles);

			const children = (await provider.getChildren()) as SessionTreeItem[];

			// Session with files should be collapsed
			const sessionWithFilesItem = children.find(
				(c) => c.session.id === "session-with-files",
			);
			expect(sessionWithFilesItem?.collapsibleState).toBe(
				vscode.TreeItemCollapsibleState.Collapsed,
			);

			// Session without files should not be collapsible
			const sessionEmptyItem = children.find(
				(c) => c.session.id === "session-empty",
			);
			expect(sessionEmptyItem?.collapsibleState).toBe(
				vscode.TreeItemCollapsibleState.None,
			);
		});
	});

	describe("file display", () => {
		it("should display files when session is expanded", async () => {
			const session: SessionManifest = {
				id: "session-1",
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [
					{ uri: "file1.ts", snapshotId: "snapshot1" },
					{ uri: "file2.ts", snapshotId: "snapshot2" },
					{ uri: "file3.ts", snapshotId: "snapshot3" },
				],
				tags: [],
			};

			mockCoordinator._fireSessionFinalized(session);

			const sessionItems = (await provider.getChildren()) as SessionTreeItem[];
			const sessionItem = sessionItems[0];

			const fileItems = await provider.getChildren(sessionItem);

			expect(fileItems).toHaveLength(3);
			expect(fileItems[0]).toBeInstanceOf(SessionFileTreeItem);
			expect(fileItems[1]).toBeInstanceOf(SessionFileTreeItem);
			expect(fileItems[2]).toBeInstanceOf(SessionFileTreeItem);
		});

		it("should return empty array for file items (no grandchildren)", async () => {
			const session: SessionManifest = {
				id: "session-1",
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [{ uri: "file1.ts", snapshotId: "snapshot1" }],
				tags: [],
			};

			mockCoordinator._fireSessionFinalized(session);

			const sessionItems = (await provider.getChildren()) as SessionTreeItem[];
			const sessionItem = sessionItems[0];
			const fileItems = (await provider.getChildren(
				sessionItem,
			)) as SessionFileTreeItem[];
			const fileItem = fileItems[0];

			const grandchildren = await provider.getChildren(fileItem);

			expect(grandchildren).toHaveLength(0);
		});
	});

	describe("refresh", () => {
		it("should refresh tree when session finalized", async () => {
			const refreshSpy = vi.spyOn(provider, "refresh");

			const session: SessionManifest = {
				id: "session-1",
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [{ uri: "file1.ts", snapshotId: "snapshot1" }],
				tags: [],
			};

			mockCoordinator._fireSessionFinalized(session);

			expect(refreshSpy).toHaveBeenCalled();
		});

		it("should fire onDidChangeTreeData event when refreshed", () => {
			// Access private property
			const emitter = (provider as any)
				._onDidChangeTreeData as vscode.EventEmitter<
				vscode.TreeItem | undefined
			>;
			const fireSpy = vi.spyOn(emitter, "fire");

			provider.refresh();

			expect(fireSpy).toHaveBeenCalledWith(undefined);
		});
	});

	describe("getTreeItem", () => {
		it("should return the same tree item", async () => {
			const session: SessionManifest = {
				id: "session-1",
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files: [{ uri: "file1.ts", snapshotId: "snapshot1" }],
				tags: [],
			};

			mockCoordinator._fireSessionFinalized(session);

			const children = (await provider.getChildren()) as SessionTreeItem[];
			const sessionItem = children[0];

			const treeItem = provider.getTreeItem(sessionItem);

			expect(treeItem).toBe(sessionItem);
		});
	});

	describe("session grouping by reason", () => {
		it("should display sessions grouped by finalization reason", async () => {
			const commitSession: SessionManifest = {
				id: "session-commit",
				startedAt: Date.now() - 120000,
				endedAt: Date.now() - 60000,
				reason: "commit",
				files: [{ uri: "file1.ts", snapshotId: "snapshot1" }],
				tags: [],
			};

			const blurSession: SessionManifest = {
				id: "session-blur",
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "blur",
				files: [{ uri: "file2.ts", snapshotId: "snapshot2" }],
				tags: [],
			};

			const manualSession: SessionManifest = {
				id: "session-manual",
				startedAt: Date.now() - 30000,
				endedAt: Date.now(),
				reason: "manual",
				files: [{ uri: "file3.ts", snapshotId: "snapshot3" }],
				tags: [],
			};

			mockCoordinator._fireSessionFinalized(commitSession);
			mockCoordinator._fireSessionFinalized(blurSession);
			mockCoordinator._fireSessionFinalized(manualSession);

			const children = (await provider.getChildren()) as SessionTreeItem[];

			// Should have all sessions
			expect(children).toHaveLength(3);

			// Verify each session has correct reason
			const commitItem = children.find((c) => c.session.reason === "commit");
			const blurItem = children.find((c) => c.session.reason === "blur");
			const manualItem = children.find((c) => c.session.reason === "manual");

			expect(commitItem).toBeDefined();
			expect(blurItem).toBeDefined();
			expect(manualItem).toBeDefined();
		});
	});

	describe("performance", () => {
		it("should handle large number of sessions efficiently", async () => {
			// Create 100 sessions
			for (let i = 0; i < 100; i++) {
				const session: SessionManifest = {
					id: `session-${i}`,
					startedAt: Date.now() - (100 - i) * 1000,
					endedAt: Date.now() - (100 - i) * 1000 + 500,
					reason: "manual",
					files: [{ uri: `file${i}.ts`, snapshotId: `snapshot${i}` }],
					tags: [],
				};

				mockCoordinator._fireSessionFinalized(session);
			}

			const start = performance.now();
			const children = await provider.getChildren();
			const duration = performance.now() - start;

			// Should retrieve all sessions quickly
			expect(children).toHaveLength(100);
			expect(duration).toBeLessThan(50); // Fast retrieval
		});

		it("should handle sessions with many files efficiently", async () => {
			// Create session with 50 files
			const files = Array.from({ length: 50 }, (_, i) => ({
				uri: `file${i}.ts`,
				snapshotId: `snapshot${i}`,
			}));

			const session: SessionManifest = {
				id: "session-many-files",
				startedAt: Date.now() - 60000,
				endedAt: Date.now(),
				reason: "manual",
				files,
				tags: [],
			};

			mockCoordinator._fireSessionFinalized(session);

			const sessionItems = (await provider.getChildren()) as SessionTreeItem[];
			const sessionItem = sessionItems[0];

			const start = performance.now();
			const fileItems = await provider.getChildren(sessionItem);
			const duration = performance.now() - start;

			// Should retrieve all files quickly
			expect(fileItems).toHaveLength(50);
			expect(duration).toBeLessThan(20); // Fast file retrieval
		});
	});
});
