/**
 * J5 Pioneer Points Journey Tests
 *
 * Spec Reference: unified_ux_spec_UPDATED.md §3.6
 *
 * Edge Cases Covered:
 *   - J5-E05: User deletes account, rejoins (Gap → Implementing)
 *
 * TDD Approach: RED → GREEN → REFACTOR
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AccountDeletionHandler, type AccountDeletionResult, type PointsStorage } from "../../../src/services/AccountDeletionHandler";

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
			update: vi.fn(),
		})),
	},
	commands: {
		executeCommand: vi.fn(),
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("J5 Pioneer Points Journey", () => {
	let handler: AccountDeletionHandler;
	let storage: Map<string, unknown>;

	beforeEach(() => {
		vi.clearAllMocks();
		storage = new Map();
		handler = new AccountDeletionHandler(storage);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("J5-E05: User deletes account, rejoins", () => {
		describe("Data Summary", () => {
			it("should report no data for fresh account", () => {
				const summary = handler.getDataSummary();

				expect(summary.hasPoints).toBe(false);
				expect(summary.totalPoints).toBe(0);
				expect(summary.snapshotCount).toBe(0);
				expect(summary.hasAuth).toBe(false);
			});

			it("should report accurate data summary", () => {
				handler.setPointsData({
					totalPoints: 1500,
					pointsHistory: [
						{ timestamp: Date.now(), points: 100, reason: "snapshot" },
						{ timestamp: Date.now(), points: 50, reason: "streak" },
					],
					streakDays: 7,
					lastActivity: Date.now(),
				});
				handler.setSnapshotsData([{ id: "1" }, { id: "2" }, { id: "3" }]);
				handler.setAuthData({ userId: "user123", token: "token" });

				const summary = handler.getDataSummary();

				expect(summary.hasPoints).toBe(true);
				expect(summary.totalPoints).toBe(1500);
				expect(summary.snapshotCount).toBe(3);
				expect(summary.hasAuth).toBe(true);
			});
		});

		describe("Clear All Data", () => {
			it("should clear all points on account deletion", async () => {
				handler.setPointsData({
					totalPoints: 2500,
					pointsHistory: [
						{ timestamp: Date.now(), points: 2000, reason: "snapshots" },
						{ timestamp: Date.now(), points: 500, reason: "streak" },
					],
					streakDays: 30,
					lastActivity: Date.now(),
				});

				const result = await handler.clearAllData();

				expect(result.success).toBe(true);
				expect(result.pointsCleared).toBe(2500);
				expect(handler.getPointsData()).toBeUndefined();
			});

			it("should clear all snapshots on account deletion", async () => {
				handler.setSnapshotsData([
					{ id: "snap1", content: "..." },
					{ id: "snap2", content: "..." },
					{ id: "snap3", content: "..." },
				]);

				const result = await handler.clearAllData();

				expect(result.success).toBe(true);
				expect(result.snapshotsCleared).toBe(3);
			});

			it("should clear auth data on account deletion", async () => {
				handler.setAuthData({ userId: "user123", token: "secret" });

				await handler.clearAllData();

				expect(handler.hasLocalData()).toBe(false);
			});

			it("should reset settings to defaults", async () => {
				storage.set("snapback.settings", { theme: "dark", notifications: false });

				const result = await handler.clearAllData();

				expect(result.settingsReset).toBe(true);
				expect(storage.has("snapback.settings")).toBe(false);
			});
		});

		describe("Account Deletion Flow", () => {
			it("should require confirmation before deletion", async () => {
				const confirmCallback = vi.fn().mockResolvedValue(false);

				handler.setPointsData({
					totalPoints: 1000,
					pointsHistory: [],
					streakDays: 5,
					lastActivity: Date.now(),
				});

				const result = await handler.deleteAccount("user123", confirmCallback);

				expect(confirmCallback).toHaveBeenCalled();
				expect(result.success).toBe(false);
				expect(result.error).toBe("User cancelled deletion");
				// Data should NOT be cleared
				expect(handler.getPointsData()?.totalPoints).toBe(1000);
			});

			it("should clear all data after confirmation", async () => {
				const confirmCallback = vi.fn().mockResolvedValue(true);

				handler.setPointsData({
					totalPoints: 5000,
					pointsHistory: [],
					streakDays: 60,
					lastActivity: Date.now(),
				});
				handler.setSnapshotsData([{ id: "1" }]);
				handler.setAuthData({ userId: "user123" });

				const result = await handler.deleteAccount("user123", confirmCallback);

				expect(result.success).toBe(true);
				expect(result.pointsCleared).toBe(5000);
				expect(handler.hasLocalData()).toBe(false);
			});
		});

		describe("Rejoin After Deletion", () => {
			it("should start with clean slate on rejoin", async () => {
				const result = await handler.handleRejoin("newUser456");

				expect(result.success).toBe(true);
				expect(result.isCleanSlate).toBe(true);
				expect(result.message).toBe("Welcome to SnapBack!");
			});

			it("should clear residual data on rejoin", async () => {
				// Simulate leftover data from incomplete deletion
				handler.setPointsData({
					totalPoints: 100,
					pointsHistory: [],
					streakDays: 1,
					lastActivity: Date.now(),
				});

				const result = await handler.handleRejoin("newUser789");

				expect(result.success).toBe(true);
				expect(result.isCleanSlate).toBe(true);
				expect(result.message).toBe("Previous account data cleared. Welcome back!");
				expect(handler.hasLocalData()).toBe(false);
			});

			it("should not restore previous points on rejoin", async () => {
				// First, set up points
				handler.setPointsData({
					totalPoints: 10000,
					pointsHistory: [],
					streakDays: 100,
					lastActivity: Date.now(),
				});

				// Simulate deletion
				await handler.clearAllData();

				// Rejoin
				const result = await handler.handleRejoin("sameUser123");

				// Should have zero points
				expect(result.isCleanSlate).toBe(true);
				expect(handler.getPointsData()).toBeUndefined();
			});
		});

		describe("Edge Cases", () => {
			it("should handle deletion with no existing data", async () => {
				const result = await handler.clearAllData();

				expect(result.success).toBe(true);
				expect(result.pointsCleared).toBe(0);
				expect(result.snapshotsCleared).toBe(0);
			});

			it("should handle partial data state", async () => {
				// Only has points, no snapshots or auth
				handler.setPointsData({
					totalPoints: 500,
					pointsHistory: [],
					streakDays: 3,
					lastActivity: Date.now(),
				});

				const result = await handler.clearAllData();

				expect(result.success).toBe(true);
				expect(result.pointsCleared).toBe(500);
				expect(result.snapshotsCleared).toBe(0);
			});

			it("should preserve privacy - no points data sent to server", async () => {
				// This test ensures we don't accidentally send points data
				const serverSpy = vi.spyOn(handler, "notifyServerDeletion");

				handler.setPointsData({
					totalPoints: 9999,
					pointsHistory: [],
					streakDays: 365,
					lastActivity: Date.now(),
				});

				await handler.deleteAccount("user123", async () => true);

				// Server notification should only receive userId, not points data
				expect(serverSpy).toHaveBeenCalledWith("user123");
				expect(serverSpy).not.toHaveBeenCalledWith(
					expect.objectContaining({ totalPoints: 9999 })
				);
			});
		});
	});
});
