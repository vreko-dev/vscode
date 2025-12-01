import * as assert from "node:assert";
import { vi } from "vitest";
import * as vscode from "vscode";
import { BackgroundAnalyzer } from "../../backgroundAnalyzer.js";
import type { NotificationManager } from "../../notificationManager.js";
import type { SmartContextDetector } from "../../smartContext.js";
import type { WorkspaceMemoryManager } from "../../workspaceMemory.js";

suite("BackgroundAnalyzer Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Should create background analyzer instance", () => {
		// Create mock dependencies
		const mockSmartContextDetector = {} as SmartContextDetector;
		const mockNotificationManager = {} as NotificationManager;
		const mockWorkspaceMemory = {
			getContext: () => ({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
			updateLastActiveFile: () => {},
			updateActiveBranch: () => {},
			updateLastCheckpoint: () => {},
			updateProtectionStatus: () => {},
			saveContext: async () => {},
			loadContext: async () => {},
		} as unknown as WorkspaceMemoryManager;

		const backgroundAnalyzer = new BackgroundAnalyzer(
			mockSmartContextDetector,
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		assert.ok(backgroundAnalyzer);
	});

	test("Should start and stop background analysis", () => {
		// Create mock dependencies
		const mockSmartContextDetector = {} as SmartContextDetector;
		const mockNotificationManager = {} as NotificationManager;
		const mockWorkspaceMemory = {
			getContext: () => ({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
			updateLastActiveFile: () => {},
			updateActiveBranch: () => {},
			updateLastCheckpoint: () => {},
			updateProtectionStatus: () => {},
			saveContext: async () => {},
			loadContext: async () => {},
		} as unknown as WorkspaceMemoryManager;

		const backgroundAnalyzer = new BackgroundAnalyzer(
			mockSmartContextDetector,
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		// Start the analyzer
		backgroundAnalyzer.start();

		// Stop the analyzer
		backgroundAnalyzer.stop();

		// If we get here without errors, the test passes
		assert.ok(true);
	});

	test("Should perform analysis without errors", async () => {
		// Create mock dependencies
		const detectContextStub = vi.fn().mockResolvedValue({
			projectType: "typescript",
			framework: "vscode-extension",
			riskPatterns: [],
			sensitiveFiles: [],
			activeDevelopmentAreas: [],
			predictedNextAction: null,
		});

		const mockSmartContextDetector = {
			detectContext: detectContextStub,
		} as unknown as SmartContextDetector;

		const mockNotificationManager = {
			showNotification: vi.fn().mockResolvedValue(undefined),
			showEnhancedRiskDetected: vi.fn().mockResolvedValue(undefined),
			showEnhancedCheckpointCreated: vi.fn().mockResolvedValue(undefined),
			showEnhancedAiActivity: vi.fn().mockResolvedValue(undefined),
			showEnhancedSecurityAlert: vi.fn().mockResolvedValue(undefined),
			showEnhancedLargeChange: vi.fn().mockResolvedValue(undefined),
			showEnhancedFailureRecovery: vi.fn().mockResolvedValue(undefined),
			showEnhancedSystemStatus: vi.fn().mockResolvedValue(undefined),
			showCheckpointCreated: vi.fn().mockResolvedValue(undefined),
			showRiskDetected: vi.fn().mockResolvedValue(undefined),
			getRecentNotifications: vi.fn().mockReturnValue([]),
			clearNotifications: vi.fn(),
			dismissNotification: vi.fn(),
			createDismissalRule: vi.fn(),
		} as unknown as NotificationManager;

		const mockWorkspaceMemory = {
			updateProtectionStatus: vi.fn(),
			updateLastCheckpoint: vi.fn(),
			updateLastActiveFile: vi.fn(),
			updateActiveBranch: vi.fn(),
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
			saveContext: vi.fn().mockResolvedValue(undefined),
			loadContext: vi.fn().mockResolvedValue(undefined),
		} as unknown as WorkspaceMemoryManager;

		const backgroundAnalyzer = new BackgroundAnalyzer(
			mockSmartContextDetector,
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		// Perform analysis
		await backgroundAnalyzer.performAnalysis();

		// Verify that the context detector was called
		assert.ok(
			detectContextStub.mock.calls.length === 1,
			"Context detector should have been called",
		);
	});
});
