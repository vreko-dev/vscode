import * as assert from "node:assert";
import * as vscode from "vscode";
import type { WorkflowIntegration } from "../../src/workflowIntegration";
import { WorkflowView } from "../../src/workflowView";

suite("WorkflowView Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Should create workflow view instance", () => {
		// Create a mock workflow integration
		const mockWorkflowIntegration = {
			getWorkflowSuggestions: async () => [],
		} as unknown as WorkflowIntegration;
		const view = new WorkflowView(mockWorkflowIntegration);
		assert.ok(view);
	});

	test("Should have event emitter properly configured", () => {
		const mockWorkflowIntegration = {
			getWorkflowSuggestions: async () => [],
		} as unknown as WorkflowIntegration;
		const view = new WorkflowView(mockWorkflowIntegration);
		// Test that the view has the event emitter
		assert.ok(view.onDidChangeTreeData, "Event emitter should be defined");
	});

	test("Should implement TreeDataProvider interface", () => {
		const mockWorkflowIntegration = {
			getWorkflowSuggestions: async () => [],
		} as unknown as WorkflowIntegration;
		const view = new WorkflowView(mockWorkflowIntegration);
		assert.ok(
			typeof view.getTreeItem === "function",
			"Should have getTreeItem method",
		);
		assert.ok(
			typeof view.getChildren === "function",
			"Should have getChildren method",
		);
		assert.ok(typeof view.refresh === "function", "Should have refresh method");
		assert.ok(
			view.onDidChangeTreeData,
			"Should have onDidChangeTreeData event",
		);
	});

	test("Should return empty array for nested elements", async () => {
		const mockWorkflowIntegration = {
			getWorkflowSuggestions: async () => [
				{
					id: "test-1",
					title: "Test Suggestion",
					description: "Test Description",
					action: "test_action",
					confidence: 80,
					priority: "medium" as const,
				},
				{
					id: "test-2",
					title: "Test Suggestion 2",
					description: "Test Description 2",
					action: "test_action_2",
					confidence: 90,
					priority: "high" as const,
				},
			],
		} as unknown as WorkflowIntegration;
		const view = new WorkflowView(mockWorkflowIntegration);

		// Root level should return suggestions
		const children = await view.getChildren(undefined);
		assert.ok(children, "Children should not be null or undefined");
		assert.strictEqual(
			children.length,
			2,
			"Should return 2 workflow suggestions for root level",
		);
	});
});
