import * as assert from "node:assert";
import * as vscode from "vscode";
import { WorkspaceContextView } from "../../src/workspaceContextView.js";
import type {
	WorkspaceContext,
	WorkspaceMemoryManager,
} from "../../src/workspaceMemory";

suite("WorkspaceContextView Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Should create workspace context view instance", () => {
		// Create a minimal mock for the workspace memory manager
		const mockWorkspaceMemory = {
			getContext: () => ({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "unprotected",
				recentActions: [],
			}),
			updateLastActiveFile: () => {},
			updateActiveBranch: () => {},
			updateLastCheckpoint: () => {},
			updateProtectionStatus: () => {},
			saveContext: async () => {},
			loadContext: async () => {},
		} as unknown as WorkspaceMemoryManager;

		const view = new WorkspaceContextView(mockWorkspaceMemory);
		assert.ok(view);
	});

	test("Should have correct root level items", async () => {
		const mockContext: WorkspaceContext = {
			lastActiveFile: "/path/to/file.ts",
			recentFiles: ["/path/to/file.ts", "/path/to/another.ts"],
			activeBranch: "main",
			lastCheckpoint: "cp-123",
			protectionStatus: "protected",
			recentActions: [
				{ action: "file_opened", timestamp: Date.now() },
				{ action: "checkpoint_created", timestamp: Date.now() - 1000 },
			],
		};

		const mockWorkspaceMemory = {
			getContext: () => mockContext,
			updateLastActiveFile: () => {},
			updateActiveBranch: () => {},
			updateLastCheckpoint: () => {},
			updateProtectionStatus: () => {},
			saveContext: async () => {},
			loadContext: async () => {},
		} as unknown as WorkspaceMemoryManager;

		const view = new WorkspaceContextView(mockWorkspaceMemory);
		const children = await view.getChildren(undefined);

		assert.ok(children, "Children should not be null or undefined");
		assert.ok(children.length >= 6, "Should have at least 6 context items");

		// Verify that specific items exist
		const labels = children.map((c) => c.label);
		assert.ok(
			labels.includes("Last Active File"),
			"Should have Last Active File item",
		);
		assert.ok(
			labels.includes("Active Branch"),
			"Should have Active Branch item",
		);
		assert.ok(
			labels.includes("Protection Status"),
			"Should have Protection Status item",
		);
	});
});
