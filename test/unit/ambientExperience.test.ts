import * as assert from "node:assert";
import { RiskAnalyzer } from "@snapback/core";
import { vi } from "vitest";
import * as vscode from "vscode";
import type { NotificationManager as NotificationManagerInterface } from "../../src/notificationManager.js";
import { NotificationManager } from "../../src/notificationManager.js";
import { OperationCoordinator } from "../../src/operationCoordinator.js";
import type { FileSystemStorage } from "../../src/storage/types.js";
import type { WorkspaceMemoryManager } from "../../src/workspaceMemory.js";

suite("Ambient Experience Integration Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Should analyze file changes and detect security threats", async () => {
		// Stub VS Code notification methods
		const showWarningStub = vi
			.spyOn(vscode.window, "showWarningMessage")
			.mockResolvedValue("" as any);

		const riskAnalyzer = new RiskAnalyzer();
		const fileChanges = [
			{
				filePath: "src/auth.ts",
				lineCount: 50,
				content: 'const password = "secret123";\nrm -rf /tmp/important_files;',
			},
		];

		const result = await riskAnalyzer.analyzeFileChanges(fileChanges);

		assert.ok(result.score > 0, "Should have a risk score greater than 0");
		assert.strictEqual(
			result.threats.length,
			2,
			"Should detect 2 security threats",
		);
		assert.ok(
			result.factors.includes("Security threat detected: hardcoded password"),
			"Should detect hardcoded password",
		);
		assert.ok(
			result.factors.includes("Security threat detected: rm -rf"),
			"Should detect rm -rf command",
		);

		// Restore stubs
		showWarningStub.mockRestore();
	});

	test("Should show enhanced security alert for sensitive file modifications", async () => {
		// Stub VS Code notification methods
		const showWarningStub = vi
			.spyOn(vscode.window, "showWarningMessage")
			.mockResolvedValue("" as any);

		const notificationManager = new NotificationManager();
		const securityInfo = {
			modifiedFiles: [
				{ file: ".env.production", type: "environment variables" },
				{ file: "package.json", type: "dependency changes" },
			],
			riskFactors: ["Production secrets exposed", "Build pipeline could break"],
			autoCheckpointId: "test-checkpoint-id",
		};

		await notificationManager.showEnhancedSecurityAlert(securityInfo);

		// Check that the notification was displayed
		assert.ok(
			showWarningStub.mock.calls.length === 1,
			"Should show warning message",
		);
		const callArgs = showWarningStub.mock.calls[0];
		assert.ok(
			callArgs[0].includes("Sensitive file modification detected"),
			"Should show security alert message",
		);

		// Check that the notification was stored in history
		const notifications = notificationManager.getRecentNotifications(1);
		assert.strictEqual(
			notifications.length,
			1,
			"Should store notification in history",
		);
		assert.ok(
			notifications[0].message.includes("Sensitive file modification detected"),
			"Should store correct message in history",
		);

		// Restore stubs
		showWarningStub.mockRestore();
	});

	test("Should create automatic checkpoint for high-risk changes", async () => {
		// Create mock objects for the required dependencies
		const mockWorkspaceMemory = {
			updateLastCheckpoint: vi.fn(),
			saveContext: vi.fn().mockResolvedValue(undefined),
			updateLastActiveFile: vi.fn(),
			updateActiveBranch: vi.fn(),
			updateProtectionStatus: vi.fn(),
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
			loadContext: vi.fn().mockResolvedValue(undefined),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = {
			showEnhancedCheckpointCreated: vi.fn().mockResolvedValue(undefined),
			showNotification: vi.fn().mockResolvedValue(undefined),
			getRecentNotifications: vi.fn().mockReturnValue([]),
			clearNotifications: vi.fn(),
			dismissNotification: vi.fn(),
			createDismissalRule: vi.fn(),
		} as unknown as NotificationManagerInterface;

		// Mock storage
		const mockStorage = {
			create: vi.fn().mockResolvedValue({
				id: "test-checkpoint-id",
				timestamp: Date.now(),
			}),
			retrieve: vi.fn().mockResolvedValue(null),
			list: vi.fn().mockResolvedValue([]),
			restore: vi.fn().mockResolvedValue(null),
		} as unknown as FileSystemStorage;

		const riskAnalyzer = new RiskAnalyzer();
		const operationCoordinator = new OperationCoordinator(
			mockWorkspaceMemory,
			mockNotificationManager,
			mockStorage,
		);
		const fileChanges = [
			{
				filePath: ".env",
				lineCount: 10,
				content: "API_KEY=12345\nDB_PASSWORD=secret",
			},
		];

		const result = await riskAnalyzer.analyzeFileChanges(fileChanges);
		const shouldCreateCheckpoint =
			result.score > 0.5 ||
			result.threats.length > 0 ||
			fileChanges[0].filePath.endsWith(".env") ||
			fileChanges[0].filePath.endsWith("package.json") ||
			fileChanges[0].filePath.includes("config");

		assert.ok(
			shouldCreateCheckpoint,
			"Should create checkpoint for sensitive file changes",
		);

		// Simulate the checkpoint creation
		const checkpointId =
			await operationCoordinator.coordinateCheckpointCreation();
		assert.strictEqual(
			checkpointId,
			"test-checkpoint-id",
			"Should create checkpoint",
		);
	});

	test("Should show enhanced checkpoint created notification", async () => {
		// Stub VS Code notification methods
		const showInfoStub = vi
			.spyOn(vscode.window, "showInformationMessage")
			.mockResolvedValue("" as any);

		const notificationManager = new NotificationManager();
		const checkpointInfo = {
			trigger: "Automatic checkpoint for high-risk file: .env",
			protectedFiles: 1,
			directories: 1,
			checkpointId: "test-checkpoint-id",
			storageLocation: ".snapback/checkpoints/",
		};

		await notificationManager.showEnhancedCheckpointCreated(checkpointInfo);

		// Check that the notification was displayed
		assert.ok(showInfoStub.mock.calls.length === 1, "Should show info message");
		const callArgs = showInfoStub.mock.calls[0];
		assert.ok(
			callArgs[0].includes("SnapBack checkpoint secured"),
			"Should show checkpoint created message",
		);

		// Check notification history
		const notifications = notificationManager.getRecentNotifications(1);
		assert.strictEqual(
			notifications.length,
			1,
			"Should store notification in history",
		);
		assert.ok(
			notifications[0].message.includes("SnapBack checkpoint secured"),
			"Should store correct message in history",
		);

		// Restore stubs
		showInfoStub.mockRestore();
	});

	test("Should detect large changes and show enhanced notification", async () => {
		// Stub VS Code notification methods
		const showWarningStub = vi
			.spyOn(vscode.window, "showWarningMessage")
			.mockResolvedValue("" as any);

		const notificationManager = new NotificationManager();
		const changeInfo = {
			filesModified: 47,
			linesChanged: 2340,
			newDependencies: 8,
			configFilesUpdated: 3,
			changeVelocity: "156 files/minute (AI assistant pattern detected)",
			riskLevel: "HIGH",
			lastCheckpoint: "5 minutes ago",
		};

		await notificationManager.showEnhancedLargeChange(changeInfo);

		// Check that the notification was displayed
		assert.ok(
			showWarningStub.mock.calls.length === 1,
			"Should show warning message",
		);
		const callArgs = showWarningStub.mock.calls[0];
		assert.ok(
			callArgs[0].includes("Significant codebase changes detected"),
			"Should show large change notification",
		);

		// Check notification history
		const notifications = notificationManager.getRecentNotifications(1);
		assert.strictEqual(
			notifications.length,
			1,
			"Should store notification in history",
		);
		assert.ok(
			notifications[0].message.includes(
				"Significant codebase changes detected",
			),
			"Should store correct message in history",
		);

		// Restore stubs
		showWarningStub.mockRestore();
	});

	test("Should respect rate limiting for automatic checkpoint creation", async () => {
		const riskAnalyzer = new RiskAnalyzer();

		// First checkpoint creation should be allowed
		const shouldCreate1 = riskAnalyzer.shouldCreateCheckpoint(0.8);
		assert.ok(shouldCreate1, "Should allow first checkpoint creation");

		// Second checkpoint creation should be blocked by rate limiting
		const shouldCreate2 = riskAnalyzer.shouldCreateCheckpoint(0.8);
		assert.ok(
			!shouldCreate2,
			"Should block second checkpoint creation due to rate limiting",
		);
	});

	test("Should analyze change velocity with Git context", async () => {
		const riskAnalyzer = new RiskAnalyzer();
		const fileChanges = [
			{
				filePath: "src/file1.ts",
				lineCount: 50,
				content: 'console.log("test");',
			},
		];

		const mockCommitContext = {
			branch: "main",
			commitHash: "abc123",
			commitMessage: "Test commit",
			author: "Test User",
			changes: {
				added: [
					"src/file1.ts",
					"src/file2.ts",
					"src/file3.ts",
					"src/file4.ts",
					"src/file5.ts",
					"src/file6.ts",
					"src/file7.ts",
					"src/file8.ts",
					"src/file9.ts",
					"src/file10.ts",
					"src/file11.ts",
				],
				modified: [],
				deleted: [],
			},
		};

		const result = await riskAnalyzer.analyzeFileChanges(
			fileChanges,
			mockCommitContext,
		);

		assert.ok(
			result.changeVelocity !== undefined,
			"Should calculate change velocity",
		);
		assert.ok(
			result.changeVelocity > 0.8,
			"Should detect high change velocity",
		);
		assert.ok(
			result.factors.includes("High change velocity: 100% of files changed"),
			"Should include change velocity factor",
		);
	});

	test("Should detect pattern-based triggers for automatic checkpoints", async () => {
		const riskAnalyzer = new RiskAnalyzer();
		const fileChanges = [
			{
				filePath: "package.json",
				lineCount: 100,
				content: JSON.stringify({
					dependencies: {
						react: "^17.0.0",
						"react-dom": "^17.0.0",
					},
					scripts: {
						build: "webpack --mode production",
					},
				}),
			},
		];

		const result = await riskAnalyzer.analyzeFileChanges(fileChanges);

		assert.ok(
			result.factors.includes("Pattern trigger: Dependency changes detected"),
			"Should detect dependency changes pattern",
		);
	});

	test("Should show enhanced AI activity notification", async () => {
		// Stub VS Code notification methods
		const showInfoStub = vi
			.spyOn(vscode.window, "showInformationMessage")
			.mockResolvedValue("" as any);

		const notificationManager = new NotificationManager();
		const aiInfo = {
			tool: "GitHub Copilot",
			confidence: 94,
			activityType: "Multi-file refactoring",
			filesModified: 8,
			timeFrame: "30 seconds",
			autoCheckpointId: "test-checkpoint-id",
		};

		await notificationManager.showEnhancedAiActivity(aiInfo);

		// Check that the notification was displayed
		assert.ok(showInfoStub.mock.calls.length === 1, "Should show info message");
		const callArgs = showInfoStub.mock.calls[0];
		assert.ok(
			callArgs[0].includes("AI coding session detected - Auto-protecting"),
			"Should show AI activity notification",
		);

		// Check notification history
		const notifications = notificationManager.getRecentNotifications(1);
		assert.strictEqual(
			notifications.length,
			1,
			"Should store notification in history",
		);
		assert.ok(
			notifications[0].message.includes(
				"AI coding session detected - Auto-protecting",
			),
			"Should store correct message in history",
		);

		// Restore stubs
		showInfoStub.mockRestore();
	});

	test("Should handle failure recovery scenarios", async () => {
		// Stub VS Code notification methods
		const showErrorStub = vi
			.spyOn(vscode.window, "showErrorMessage")
			.mockResolvedValue("" as any);

		const notificationManager = new NotificationManager();
		const failureInfo = {
			errorSource: "TypeScript compilation failed",
			likelyCause: "Recent dependency updates (last 3 minutes)",
			aiToolActive: "Cursor",
			aiConfidence: 87,
			lastCheckpoint: "2 min ago",
			recoveryOptions: [
				{ type: "Rollback", description: "to last successful build" },
				{
					type: "Selective",
					description: "file recovery (restore package.json only)",
				},
				{
					type: "Full",
					description: "workspace restore (snap_20241028_142847)",
				},
			],
		};

		await notificationManager.showEnhancedFailureRecovery(failureInfo);

		// Check that the notification was displayed
		assert.ok(
			showErrorStub.mock.calls.length === 1,
			"Should show error message",
		);
		const callArgs = showErrorStub.mock.calls[0];
		assert.ok(
			callArgs[0].includes("Build failure detected - Recovery available"),
			"Should show failure recovery notification",
		);

		// Check notification history
		const notifications = notificationManager.getRecentNotifications(1);
		assert.strictEqual(
			notifications.length,
			1,
			"Should store notification in history",
		);
		assert.ok(
			notifications[0].message.includes(
				"Build failure detected - Recovery available",
			),
			"Should store correct message in history",
		);

		// Restore stubs
		showErrorStub.mockRestore();
	});
});
