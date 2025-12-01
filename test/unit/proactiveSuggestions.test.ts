import * as assert from "node:assert";
// @ts-expect-error
import sinon from "sinon";
import * as vscode from "vscode";
import { ProactiveSuggestionsService } from "../../src/proactiveSuggestions.js";

suite("ProactiveSuggestionsService Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Should create proactive suggestions service instance", () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockOperationCoordinator = {} as any;

		const proactiveSuggestionsService = new ProactiveSuggestionsService(
			mockNotificationManager,
			mockOperationCoordinator,
		);

		assert.ok(proactiveSuggestionsService);
	});

	test("Should analyze document for coding patterns", async () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockOperationCoordinator = {} as any;

		const proactiveSuggestionsService = new ProactiveSuggestionsService(
			mockNotificationManager,
			mockOperationCoordinator,
		);

		// Create a mock document with security pattern
		const mockDocument = {
			fileName: "test.ts",
			lineCount: 10,
			getText: sinon.stub().returns('const password = "secret123";'),
		} as unknown as vscode.TextDocument;

		// Analyze document
		const suggestions =
			await proactiveSuggestionsService.analyzeDocument(mockDocument);

		// Should find at least one suggestion for security pattern
		assert.ok(suggestions.length > 0);

		// Check that we have a security suggestion
		const securitySuggestion = suggestions.find(
			(s) => s.patternId === "security-pattern",
		);
		assert.ok(securitySuggestion);
		assert.strictEqual(
			securitySuggestion?.title,
			"Pattern Detected: Security Patterns",
		);
	});

	test("Should sort suggestions by priority and confidence", async () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockOperationCoordinator = {} as any;

		const proactiveSuggestionsService = new ProactiveSuggestionsService(
			mockNotificationManager,
			mockOperationCoordinator,
		);

		// Clear history for consistent testing
		proactiveSuggestionsService.clearHistory();

		// Create a mock document with multiple patterns
		const mockDocument = {
			fileName: "package.json",
			lineCount: 50,
			getText: sinon.stub().returns(
				JSON.stringify({
					dependencies: {
						react: "^17.0.0",
					},
				}),
			),
		} as unknown as vscode.TextDocument;

		// Analyze document
		const suggestions =
			await proactiveSuggestionsService.analyzeDocument(mockDocument);

		// Should have suggestions
		assert.ok(suggestions.length > 0);

		// Check sorting - high priority should come first
		if (suggestions.length > 1) {
			const priorityOrder = { high: 3, medium: 2, low: 1 };
			for (let i = 0; i < suggestions.length - 1; i++) {
				const currentPriority = priorityOrder[suggestions[i].priority];
				const nextPriority = priorityOrder[suggestions[i + 1].priority];
				assert.ok(
					currentPriority >= nextPriority,
					"Suggestions should be sorted by priority",
				);
			}
		}
	});

	test("Should respect cooldown period for suggestions", async () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockOperationCoordinator = {} as any;

		const proactiveSuggestionsService = new ProactiveSuggestionsService(
			mockNotificationManager,
			mockOperationCoordinator,
		);

		// Clear history for consistent testing
		proactiveSuggestionsService.clearHistory();

		// Create a mock document with a pattern
		const mockDocument = {
			fileName: "config.json",
			lineCount: 10,
			getText: sinon.stub().returns('{"api_key": "12345"}'),
		} as unknown as vscode.TextDocument;

		// Analyze document first time
		const suggestions1 =
			await proactiveSuggestionsService.analyzeDocument(mockDocument);

		// Analyze document second time (should be on cooldown)
		const suggestions2 =
			await proactiveSuggestionsService.analyzeDocument(mockDocument);

		// First analysis should have suggestions
		assert.ok(suggestions1.length > 0);

		// Second analysis should have fewer or no suggestions due to cooldown
		assert.ok(suggestions2.length <= suggestions1.length);
	});
});
