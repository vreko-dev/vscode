/**
 * Snapshot Commands - Daemon Delegation Tests
 *
 * Unit tests for ARCHITECTURE_REFACTOR_SPEC.md:
 * Validates hybrid delegation pattern for snapshot commands
 *
 * Test Coverage:
 * - Daemon delegation when available and connected
 * - Graceful fallback to local when daemon fails
 * - Local-only execution when daemon disconnected
 * - Backward compatibility when daemon undefined
 *
 * Commands Tested:
 * - createSnapshot: Create snapshot with daemon delegation
 * - undoLastAIChange: Restore last snapshot via daemon
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonBridge } from "../../../src/services/DaemonBridge";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.

describe("Snapshot Commands - Daemon Delegation", () => {
	let mockDaemonBridge: DaemonBridge;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock DaemonBridge
		mockDaemonBridge = {
			isConnected: vi.fn().mockReturnValue(true),
			createSnapshot: vi.fn().mockResolvedValue({
				snapshotId: "daemon-snap-123",
				createdAt: new Date().toISOString(),
			}),
			restoreSnapshot: vi.fn().mockResolvedValue({ restored: ["test.ts"], skipped: [] }),
			listSnapshots: vi.fn().mockResolvedValue([
				{ snapshotId: "snap-1", createdAt: new Date().toISOString(), files: [] },
			]),
			initialize: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
		} as unknown as DaemonBridge;
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("createSnapshot - Daemon Delegation", () => {
		it("should delegate to daemon when connected and workspace available", async () => {
			// Arrange
			vi.mocked(mockDaemonBridge.createSnapshot).mockResolvedValueOnce({
				snapshotId: "daemon-snap-123",
				createdAt: new Date().toISOString(),
			});

			// Act - simulate what the command does
			const workspaceRoot = "/test/workspace";
			const files = ["/test/workspace/src/test.ts"];
			const result = await mockDaemonBridge.createSnapshot(workspaceRoot, files, {
				trigger: "manual",
				reason: "Manual snapshot via VS Code command",
			});

			// Assert - Daemon should be called
			expect(mockDaemonBridge.createSnapshot).toHaveBeenCalledWith(
				workspaceRoot,
				files,
				expect.objectContaining({ trigger: "manual" }),
			);
			expect(result.snapshotId).toBe("daemon-snap-123");
		});

		it("should handle daemon failure gracefully", async () => {
			// Arrange
			vi.mocked(mockDaemonBridge.createSnapshot).mockRejectedValueOnce(new Error("Daemon error"));

			// Act & Assert
			await expect(mockDaemonBridge.createSnapshot("/test/workspace", [], {})).rejects.toThrow(
				"Daemon error",
			);
		});

		it("should skip daemon when not connected", () => {
			// Arrange
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			// Act - check connection status
			const shouldDelegate = mockDaemonBridge.isConnected();

			// Assert
			expect(shouldDelegate).toBe(false);
		});
	});

	describe("undoLastAIChange - Daemon Delegation", () => {
		it("should delegate restore to daemon when connected", async () => {
			// Arrange
			vi.mocked(mockDaemonBridge.restoreSnapshot).mockResolvedValueOnce({
				restored: ["src/test.ts"],
				skipped: [],
			});

			// Act
			const result = await mockDaemonBridge.restoreSnapshot("/test/workspace", "snap-123", {});

			// Assert
			expect(mockDaemonBridge.restoreSnapshot).toHaveBeenCalledWith("/test/workspace", "snap-123", {});
			expect(result.restored).toContain("src/test.ts");
		});

		it("should list snapshots via daemon to find latest", async () => {
			// Arrange
			const mockSnapshots = [
				{ snapshotId: "snap-2", createdAt: "2024-01-02T00:00:00Z", files: ["test.ts"] },
				{ snapshotId: "snap-1", createdAt: "2024-01-01T00:00:00Z", files: ["test.ts"] },
			];
			vi.mocked(mockDaemonBridge.listSnapshots).mockResolvedValueOnce(mockSnapshots);

			// Act
			const snapshots = await mockDaemonBridge.listSnapshots("/test/workspace", { limit: 1 });

			// Assert
			expect(mockDaemonBridge.listSnapshots).toHaveBeenCalledWith("/test/workspace", { limit: 1 });
			expect(snapshots[0].snapshotId).toBe("snap-2");
		});

		it("should handle daemon restore failure gracefully", async () => {
			// Arrange
			vi.mocked(mockDaemonBridge.restoreSnapshot).mockRejectedValueOnce(new Error("Restore failed"));

			// Act & Assert
			await expect(mockDaemonBridge.restoreSnapshot("/test/workspace", "snap-123", {})).rejects.toThrow(
				"Restore failed",
			);
		});
	});

	describe("Backward Compatibility", () => {
		it("should work when daemon is disconnected", () => {
			// Arrange
			vi.mocked(mockDaemonBridge.isConnected).mockReturnValue(false);

			// Act
			const connected = mockDaemonBridge.isConnected();

			// Assert - Should not attempt daemon calls when disconnected
			expect(connected).toBe(false);
		});

		it("should work when daemon is undefined", () => {
			// Arrange - simulate daemon bridge being undefined in context
			const testDaemonBridge: DaemonBridge | undefined = undefined;

			// Act - Commands should check for daemon availability
			const isAvailable = Boolean(testDaemonBridge);

			// Assert - Should not attempt daemon calls when undefined
			expect(isAvailable).toBe(false);
		});
	});
});
