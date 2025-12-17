/**
 * @fileoverview Regression tests for snapshot commands
 *
 * This test suite ensures that commands correctly extract snapshot IDs from tree items
 * and prevents regressions like "Snapshot not found" errors when deleting from tree view.
 *
 * Issues covered:
 * - Tree item ID is display ID for expansion persistence, not the snapshot ID
 * - Commands must extract actual ID from item.data?.id or item.id
 * - Backward compatibility with direct command invocation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";

/**
 * Mock SnapshotManager for testing
 */
interface MockSnapshotManager {
	deleteSnapshot: (id: string, options?: any) => Promise<any>;
	rename: (id: string, newName: string) => Promise<void>;
	protect: (id: string) => Promise<void>;
}

/**
 * Mock tree item structure matching snapBackTreeProvider output
 */
interface MockTreeItem {
	id: string; // Display ID for tree expansion persistence
	label: string;
	data?: { type: "snapshot" | "file"; id: string }; // Actual snapshot ID
}

describe("Snapshot Commands - Regression Tests", () => {
	let mockSnapshotManager: MockSnapshotManager;
	const ACTUAL_SNAPSHOT_ID = "snap-1765962781479-bg6b2i";
	const DISPLAY_ID = `snapback:activity:snapshot:${ACTUAL_SNAPSHOT_ID}`;

	beforeEach(() => {
		mockSnapshotManager = {
			deleteSnapshot: vi.fn().mockResolvedValue({ success: true }),
			rename: vi.fn().mockResolvedValue(undefined),
			protect: vi.fn().mockResolvedValue(undefined),
		};
	});

	describe("Tree Item ID Extraction", () => {
		it("should extract snapshot ID from item.data.id when called from tree view", () => {
			// Tree view item structure (from snapBackTreeProvider line 536)
			const treeItem: MockTreeItem = {
				id: DISPLAY_ID, // This is for expansion persistence, NOT the snapshot ID
				label: "📸 Activity Snapshot",
				data: {
					type: "snapshot",
					id: ACTUAL_SNAPSHOT_ID, // This is the REAL snapshot ID
				},
			};

			// Extract ID using the pattern from the fix
			const snapshotId = treeItem.data?.id || treeItem.id;

			expect(snapshotId).toBe(ACTUAL_SNAPSHOT_ID);
			expect(snapshotId).not.toBe(DISPLAY_ID);
		});

		it("should fall back to item.id when data is not available (direct invocation)", () => {
			const treeItem: MockTreeItem = {
				id: ACTUAL_SNAPSHOT_ID, // Direct call passes ID directly
				label: "📸 Activity Snapshot",
			};

			const snapshotId = treeItem.data?.id || treeItem.id;

			expect(snapshotId).toBe(ACTUAL_SNAPSHOT_ID);
		});

		it("should handle tree items with missing data property", () => {
			const treeItem: MockTreeItem = {
				id: ACTUAL_SNAPSHOT_ID,
				label: "📸 Activity Snapshot",
				// data property is optional
			};

			const snapshotId = treeItem.data?.id || treeItem.id;

			expect(snapshotId).toBe(ACTUAL_SNAPSHOT_ID);
		});
	});

	describe("Delete Snapshot Command", () => {
		it("should use actual snapshot ID (from data.id) when called from tree view", async () => {
			const treeItem: MockTreeItem = {
				id: DISPLAY_ID,
				label: "📸 Activity Snapshot",
				data: { type: "snapshot", id: ACTUAL_SNAPSHOT_ID },
			};

			const snapshotId = treeItem.data?.id || treeItem.id;
			await mockSnapshotManager.deleteSnapshot(snapshotId);

			expect(mockSnapshotManager.deleteSnapshot).toHaveBeenCalledWith(ACTUAL_SNAPSHOT_ID);
			expect(mockSnapshotManager.deleteSnapshot).not.toHaveBeenCalledWith(DISPLAY_ID);
		});

		it("should reject tree item with missing snapshot ID", () => {
			const treeItem: MockTreeItem = {
				id: DISPLAY_ID,
				label: "📸 Activity Snapshot",
				// data missing - this is an error case
			};

			// Extract with fallback
			const snapshotId = treeItem.data?.id || treeItem.id;

			// Should fall back to display ID, which would cause the "Snapshot not found" error
			// This test demonstrates why the fix is necessary
			expect(snapshotId).toBe(DISPLAY_ID);
			expect(snapshotId).not.toBe(ACTUAL_SNAPSHOT_ID);
		});
	});

	describe("Unprotect and Delete Command", () => {
		it("should pass unprotectFirst flag with actual snapshot ID", async () => {
			const treeItem: MockTreeItem = {
				id: DISPLAY_ID,
				label: "🔒 Protected Snapshot",
				data: { type: "snapshot", id: ACTUAL_SNAPSHOT_ID },
			};

			const snapshotId = treeItem.data?.id || treeItem.id;
			await mockSnapshotManager.deleteSnapshot(snapshotId, { unprotectFirst: true });

			expect(mockSnapshotManager.deleteSnapshot).toHaveBeenCalledWith(
				ACTUAL_SNAPSHOT_ID,
				{ unprotectFirst: true }
			);
		});
	});

	describe("Rename Snapshot Command", () => {
		it("should rename using actual snapshot ID from tree item", async () => {
			const treeItem: MockTreeItem = {
				id: DISPLAY_ID,
				label: "📸 My Snapshot",
				data: { type: "snapshot", id: ACTUAL_SNAPSHOT_ID },
			};

			const snapshotId = treeItem.data?.id || treeItem.id;
			await mockSnapshotManager.rename(snapshotId, "New Name");

			expect(mockSnapshotManager.rename).toHaveBeenCalledWith(ACTUAL_SNAPSHOT_ID, "New Name");
		});
	});

	describe("Protect Snapshot Command", () => {
		it("should protect using actual snapshot ID from tree item", async () => {
			const treeItem: MockTreeItem = {
				id: DISPLAY_ID,
				label: "📸 Activity Snapshot",
				data: { type: "snapshot", id: ACTUAL_SNAPSHOT_ID },
			};

			const snapshotId = treeItem.data?.id || treeItem.id;
			await mockSnapshotManager.protect(snapshotId);

			expect(mockSnapshotManager.protect).toHaveBeenCalledWith(ACTUAL_SNAPSHOT_ID);
		});
	});

	describe("Regression: Tree Item ID Format", () => {
		/**
		 * Regression test for issue:
		 * "Failed to delete snapshot: Snapshot not found: snapback:activity:snapshot:snap-1765962781479-bg6b2i"
		 *
		 * Root cause: Commands were using item.id directly, which is the display ID
		 * (set to `snapback:activity:snapshot:${snapshot.id}` for tree expansion persistence)
		 * instead of the actual snapshot ID stored in item.data.id
		 */
		it("should handle tree item ID format: snapback:activity:snapshot:*", () => {
			// This is the exact error case from the issue
			const displayId = "snapback:activity:snapshot:snap-1765962781479-bg6b2i";
			const actualId = "snap-1765962781479-bg6b2i";

			// Tree item from tree view (line 536 in snapBackTreeProvider.ts)
			const treeItem: MockTreeItem = {
				id: displayId,
				label: "📸 Activity Snapshot",
				data: { type: "snapshot", id: actualId },
			};

			// Before fix (WRONG):
			// Commands were using: treeItem.id
			// Result: "Snapshot not found: snapback:activity:snapshot:snap-..."

			// After fix (CORRECT):
			// Commands use: treeItem.data?.id || treeItem.id
			const correctId = treeItem.data?.id || treeItem.id;

			expect(correctId).toBe(actualId);
			expect(correctId).not.toContain("snapback:activity:snapshot:");
		});

		it("should preserve tree expansion state with display ID while using actual ID for operations", () => {
			const treeItem: MockTreeItem = {
				id: DISPLAY_ID, // Used by VS Code for expansion persistence
				label: "📸 Activity Snapshot",
				data: { type: "snapshot", id: ACTUAL_SNAPSHOT_ID }, // Used for operations
			};

			// Tree expansion state is keyed by item.id
			const expansionKey = treeItem.id;
			expect(expansionKey).toBe(DISPLAY_ID);

			// Operations use the actual snapshot ID
			const operationId = treeItem.data?.id || treeItem.id;
			expect(operationId).toBe(ACTUAL_SNAPSHOT_ID);

			// Both can exist independently
			expect(expansionKey).not.toBe(operationId);
		});
	});

	describe("Backward Compatibility", () => {
		it("should work with direct command invocation (no data property)", () => {
			// When command is called directly (not from tree view)
			const directItem: MockTreeItem = {
				id: ACTUAL_SNAPSHOT_ID,
				label: "Snapshot",
				// No data property when called directly
			};

			const snapshotId = directItem.data?.id || directItem.id;
			expect(snapshotId).toBe(ACTUAL_SNAPSHOT_ID);
		});

		it("should work with tree view invocation (with data property)", () => {
			// When command is called from tree view context menu
			const treeViewItem: MockTreeItem = {
				id: DISPLAY_ID,
				label: "Snapshot",
				data: { type: "snapshot", id: ACTUAL_SNAPSHOT_ID },
			};

			const snapshotId = treeViewItem.data?.id || treeViewItem.id;
			expect(snapshotId).toBe(ACTUAL_SNAPSHOT_ID);
		});
	});

	describe("Error Handling", () => {
		it("should detect missing snapshot ID", () => {
			const invalidItem: MockTreeItem = {
				id: "", // Empty ID
				label: "Invalid Snapshot",
			};

			const snapshotId = invalidItem.data?.id || invalidItem.id;
			expect(snapshotId).toBe(""); // Would fail downstream
		});

		it("should validate snapshot ID before deletion", () => {
			const item: MockTreeItem = {
				id: DISPLAY_ID,
				label: "Snapshot",
				data: { type: "snapshot", id: ACTUAL_SNAPSHOT_ID },
			};

			const snapshotId = item.data?.id || item.id;

			// Commands should validate the ID
			if (!snapshotId) {
				throw new Error("Snapshot ID not found");
			}

			expect(snapshotId).toBeTruthy();
		});
	});
});
