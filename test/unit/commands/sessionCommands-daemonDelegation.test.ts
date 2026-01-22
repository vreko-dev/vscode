/**
 * Session Commands - Daemon Delegation Tests (TDD)
 *
 * Following TDD best practices:
 * - Write tests FIRST (RED phase) ✅
 * - Clear, descriptive test names
 * - Independent, isolated tests
 * - Focus on behavior, not implementation
 * - Test delegation fallback pattern thoroughly
 *
 * Pattern: Chain of Responsibility Fallback
 * - Try daemon first (fast, fresh data)
 * - Fall back to local on failure (reliable, cached)
 * - Graceful degradation throughout
 *
 * Research Sources:
 * - https://nobuti.com/thoughts/resilience-patterns-fallback (TypeScript fallback patterns)
 * - https://www.accelq.com/blog/tdd-best-practices/ (TDD best practices 2024)
 * - https://monday.com/blog/rnd/what-is-tdd/ (Red-Green-Refactor cycle)
 *
 * Context: ARCHITECTURE_REFACTOR_SPEC.md Phase 2
 * Target: session.list, session.restore, session.export commands
 * Migration: 3 `snapshotManager.getAll()` calls → daemon delegation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { CommandContext } from "../../../src/commands/types";
import { registerSessionCommands } from "../../../src/commands/sessionCommands";
import type { DaemonBridge } from "../../../src/services/DaemonBridge";
import type { SnapshotManager } from "../../../src/snapshot/SnapshotManager";
import type { RichSnapshot as Snapshot } from "../../../src/types/snapshot";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.

/**
 * Daemon snapshot list item format (lightweight)
 */
interface DaemonSnapshotItem {
	snapshotId: string;
	createdAt: string;
	files: string[];
}

describe("Session Commands - Daemon Delegation for getAll() Operations (TDD)", () => {
	let mockDaemonBridge: DaemonBridge;
	let mockSnapshotManager: SnapshotManager;
	let commandContext: CommandContext;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock DaemonBridge with listSnapshots
		mockDaemonBridge = {
			isConnected: vi.fn().mockReturnValue(true),
			listSnapshots: vi.fn().mockResolvedValue([
				{
					snapshotId: "daemon-snap-1",
					createdAt: "2024-01-20T10:00:00Z",
					files: ["file1.ts", "file2.ts"],
				},
				{
					snapshotId: "daemon-snap-2",
					createdAt: "2024-01-20T09:00:00Z",
					files: ["file3.ts"],
				},
			] as DaemonSnapshotItem[]),
			initialize: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
		} as unknown as DaemonBridge;

		// Mock SnapshotManager
		mockSnapshotManager = {
			getAll: vi.fn().mockResolvedValue([
				{
					id: "local-snap-1",
					name: "Local Snapshot 1",
					timestamp: Date.now() - 1000,
					version: "1.0",
					isProtected: false,
					files: ["file1.ts"],
					meta: { sessionId: "session-1" },
				},
				{
					id: "local-snap-2",
					name: "Local Snapshot 2",
					timestamp: Date.now() - 2000,
					version: "1.0",
					isProtected: false,
					files: ["file2.ts"],
					meta: { sessionId: "session-1" },
				},
			] as Snapshot[]),
			get: vi.fn((id: string) =>
				Promise.resolve({
					id,
					name: `Snapshot ${id}`,
					timestamp: Date.now(),
					version: "1.0",
					isProtected: false,
					files: ["test.ts"],
					meta: {},
				}),
			),
		} as unknown as SnapshotManager;

		// Create CommandContext with mocks
		commandContext = {
			snapshotManager: mockSnapshotManager,
			snapshotDocumentProvider: {} as any,
			refreshViews: vi.fn(),
			daemonBridge: mockDaemonBridge,
			workspaceRoot: "/test/workspace",
			operationCoordinator: {
				restoreToSnapshot: vi.fn().mockResolvedValue(undefined),
			} as any,
			// Minimal required fields
			protectedFileRegistry: {} as any,
			workflowIntegration: {} as any,
			notificationManager: {} as any,
			workspaceMemoryManager: {} as any,
			conflictResolver: {} as any,
			featureFlagService: {} as any,
			protectionDecorationProvider: {} as any,
			fileHealthDecorationProvider: {} as any,
			snapshotRestoreUI: {} as any,
			intelligenceTreeProvider: {} as any,
			snapshotSummaryProvider: {} as any,
			configManager: {} as any,
			fileWatcher: {} as any,
			snapbackrcLoader: {} as any,
			welcomeView: {} as any,
			updateFileProtectionContext: vi.fn(),
			updateHasProtectedFilesContext: vi.fn(),
			getProtectionStateSummary: vi.fn(),
		} as unknown as CommandContext;
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("session.list - Snapshot List Delegation", () => {
		/**
		 * TDD: Test for daemon delegation of snapshot list
		 *
		 * Best Practice: Test behavior first, implementation later
		 * Expected: When daemon is available, prefer daemon list over local
		 */
		it("should use daemon listSnapshots when available and connected", async () => {
			// Arrange
			const _disposables = registerSessionCommands({} as any, commandContext);
			const listCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.session.list")?.[1];

			// Mock QuickPick to prevent hanging
			vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

			// Act
			await listCommand?.();

			// Assert - Daemon should be called
			expect(mockDaemonBridge.isConnected).toHaveBeenCalled();
			expect(mockDaemonBridge.listSnapshots).toHaveBeenCalledWith("/test/workspace");

			// Assert - Local should NOT be called (daemon succeeded)
			expect(mockSnapshotManager.getAll).not.toHaveBeenCalled();
		});

		/**
		 * TDD: Test for graceful fallback on daemon failure
		 *
		 * Best Practice: Test error paths thoroughly
		 * Pattern: Chain of Responsibility (daemon → local)
		 */
		it("should fall back to local getAll when daemon fails", async () => {
			// Arrange
			vi.mocked(mockDaemonBridge.listSnapshots).mockRejectedValueOnce(new Error("Daemon connection lost"));

			const _disposables = registerSessionCommands({} as any, commandContext);
			const listCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.session.list")?.[1];

			vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

			// Act
			await listCommand?.();

			// Assert - Daemon should be tried
			expect(mockDaemonBridge.listSnapshots).toHaveBeenCalled();

			// Assert - Local should be used as fallback
			expect(mockSnapshotManager.getAll).toHaveBeenCalled();
		});

		/**
		 * TDD: Test for daemon unavailable (disconnected)
		 */
		it("should use local getAll when daemon is disconnected", async () => {
			// Arrange
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			const _disposables = registerSessionCommands({} as any, commandContext);
			const listCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.session.list")?.[1];

			vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

			// Act
			await listCommand?.();

			// Assert - Daemon should NOT be called (disconnected)
			expect(mockDaemonBridge.listSnapshots).not.toHaveBeenCalled();

			// Assert - Local should be used directly
			expect(mockSnapshotManager.getAll).toHaveBeenCalled();
		});

		/**
		 * TDD: Test for missing workspace root
		 */
		it("should use local getAll when workspace root is missing", async () => {
			// Arrange
			commandContext.workspaceRoot = undefined as any;

			const _disposables = registerSessionCommands({} as any, commandContext);
			const listCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.session.list")?.[1];

			vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

			// Act
			await listCommand?.();

			// Assert - Daemon should NOT be called (no workspace)
			expect(mockDaemonBridge.listSnapshots).not.toHaveBeenCalled();

			// Assert - Local should be used
			expect(mockSnapshotManager.getAll).toHaveBeenCalled();
		});

		/**
		 * TDD: Test for backward compatibility (no daemon)
		 */
		it("should use local getAll when daemonBridge is undefined", async () => {
			// Arrange
			commandContext.daemonBridge = undefined;

			const _disposables = registerSessionCommands({} as any, commandContext);
			const listCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.session.list")?.[1];

			vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

			// Act
			await listCommand?.();

			// Assert - Local should be used
			expect(mockSnapshotManager.getAll).toHaveBeenCalled();
		});
	});

	describe("session.restore - Snapshot List Delegation", () => {
		/**
		 * TDD: session.restore should also use delegation
		 */
		it("should use daemon listSnapshots when available", async () => {
			// Arrange
			const _disposables = registerSessionCommands({} as any, commandContext);
			const restoreCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.session.restore")?.[1];

			vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

			// Act
			await restoreCommand?.();

			// Assert - Daemon should be used
			expect(mockDaemonBridge.isConnected).toHaveBeenCalled();
			expect(mockDaemonBridge.listSnapshots).toHaveBeenCalled();
			expect(mockSnapshotManager.getAll).not.toHaveBeenCalled();
		});
	});

	describe("session.export - Snapshot List Delegation", () => {
		/**
		 * TDD: session.export should also use delegation
		 */
		it("should use daemon listSnapshots when available", async () => {
			// Arrange
			const _disposables = registerSessionCommands({} as any, commandContext);
			const exportCommand = vi
				.mocked(vscode.commands.registerCommand)
				.mock.calls.find((call) => call[0] === "snapback.session.export")?.[1];

			vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

			// Act
			await exportCommand?.();

			// Assert - Daemon should be used
			expect(mockDaemonBridge.isConnected).toHaveBeenCalled();
			expect(mockDaemonBridge.listSnapshots).toHaveBeenCalled();
			expect(mockSnapshotManager.getAll).not.toHaveBeenCalled();
		});
	});
});
