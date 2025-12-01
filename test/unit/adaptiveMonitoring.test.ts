import * as assert from "node:assert";
import { vi } from "vitest";
import * as vscode from "vscode";
import { AdaptiveMonitoringService } from "../../src/adaptiveMonitoring.js";
// @ts-expect-error
import type { NotificationManager } from "../../src/notificationManager.js";
// @ts-expect-error
import type { WorkspaceMemoryManager } from "../../src/workspaceMemory.js";

suite("AdaptiveMonitoringService Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Should create adaptive monitoring service instance", () => {
		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = {
			showNotification: vi.fn().mockResolvedValue(undefined),
		} as unknown as NotificationManager;

		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		assert.ok(adaptiveMonitoringService);
	});

	test("Should start and stop adaptive monitoring", () => {
		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = {
			showNotification: vi.fn().mockResolvedValue(undefined),
		} as unknown as NotificationManager;

		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		// Start the monitoring
		adaptiveMonitoringService.start();

		// Stop the monitoring
		adaptiveMonitoringService.stop();

		// If we get here without errors, the test passes
		assert.ok(true);
	});

	test("Should analyze user behavior patterns", () => {
		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [
					{ action: "file_opened", timestamp: Date.now() - 1000 },
					{ action: "file_opened", timestamp: Date.now() - 2000 },
					{ action: "file_opened", timestamp: Date.now() - 3000 },
				],
			}),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = {
			showNotification: vi.fn().mockResolvedValue(undefined),
		} as unknown as NotificationManager;

		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		// Get the private analyzeUserBehavior method
		// @ts-expect-error
		const behaviorAnalysis = adaptiveMonitoringService.analyzeUserBehavior(
			mockWorkspaceMemory.getContext(),
		);

		assert.ok(behaviorAnalysis);
		assert.ok(behaviorAnalysis instanceof Map);
	});

	test("Should adjust monitoring profile based on behavior", () => {
		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = {
			showNotification: vi.fn().mockResolvedValue(undefined),
		} as unknown as NotificationManager;

		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		// Create a behavior analysis map
		const behaviorAnalysis = new Map<string, number>();
		behaviorAnalysis.set("rapid-changes", 0.8);
		behaviorAnalysis.set("error-prone", 0.9);

		// @ts-expect-error
		adaptiveMonitoringService.adjustMonitoringProfile(behaviorAnalysis);

		// @ts-expect-error
		const currentProfile = adaptiveMonitoringService.getCurrentProfile();

		// Should switch to high intensity profile
		assert.strictEqual(currentProfile.intensity, "high");
	});

	test("Should calculate current risk level", () => {
		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = {
			showNotification: vi.fn().mockResolvedValue(undefined),
		} as unknown as NotificationManager;

		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		// @ts-expect-error
		const riskLevel = adaptiveMonitoringService.calculateCurrentRiskLevel({
			recentActions: [{ action: "error", timestamp: Date.now() - 1000 }],
			protectionStatus: "atRisk",
		});

		assert.ok(riskLevel >= 0);
		assert.ok(riskLevel <= 1);
	});

	test("Should determine if notification should be shown", () => {
		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = {
			showNotification: vi.fn().mockResolvedValue(undefined),
		} as unknown as NotificationManager;

		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		// @ts-expect-error
		const shouldShow1 = adaptiveMonitoringService.shouldShowNotification(0.8);

		// @ts-expect-error
		const currentProfile = adaptiveMonitoringService.getCurrentProfile();

		if (currentProfile.notificationLevel === "all") {
			assert.ok(shouldShow1);
		} else if (currentProfile.notificationLevel === "important") {
			assert.ok(shouldShow1);
		} else {
			// For critical level, 0.8 should be enough
			assert.ok(shouldShow1);
		}
	});

	test("Should set monitoring profile manually", () => {
		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = {
			showNotification: vi.fn().mockResolvedValue(undefined),
		} as unknown as NotificationManager;

		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		// Set profile to low
		adaptiveMonitoringService.setProfile("low");

		// @ts-expect-error
		const currentProfile = adaptiveMonitoringService.getCurrentProfile();

		assert.strictEqual(currentProfile.id, "low");
		assert.strictEqual(currentProfile.intensity, "low");
	});

	test("Should clear behavior history", () => {
		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = {
			showNotification: vi.fn().mockResolvedValue(undefined),
		} as unknown as NotificationManager;

		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		// @ts-expect-error
		adaptiveMonitoringService.clearHistory();

		// If we get here without errors, the test passes
		assert.ok(true);
	});
});
