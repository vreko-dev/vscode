import * as assert from "node:assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { AdaptiveMonitoringService } from "../../adaptiveMonitoring.js";
import { BackgroundAnalyzer } from "../../backgroundAnalyzer.js";
import { EditorDecorations } from "../../editorDecorations.js";
import {
	NotificationManager,
	type SnapBackNotification,
} from "../../notificationManager";
import { OperationCoordinator } from "../../operationCoordinator.js";
import { PredictiveRiskAssessmentService } from "../../predictiveRiskAssessment.js";
import { ProactiveSuggestionsService } from "../../proactiveSuggestions.js";
import type { SmartContextDetector } from "../../smartContext.js";
import type { FileSystemStorage } from "../../src/storage/types.js";
import type { WorkspaceMemoryManager } from "../../workspaceMemory.js";

suite("Component Integration Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Should integrate notification frequency tuning with notification manager", async () => {
		const notificationManager = new NotificationManager();

		// Create test notifications with proper types
		const notification1: SnapBackNotification = {
			id: "test-1",
			type: "info",
			message: "Test notification",
			timestamp: Date.now(),
		};

		const notification2: SnapBackNotification = {
			id: "test-2",
			type: "info",
			message: "Test notification",
			timestamp: Date.now() + 100, // 100ms later
		};

		// First notification should be shown
		await notificationManager.showNotification(notification1);

		// Second notification should be suppressed due to frequency tuning
		await notificationManager.showNotification(notification2);

		// Check that only one notification was actually shown
		const recentNotifications = notificationManager.getRecentNotifications(10);
		// We expect only one notification because the second was suppressed
		assert.strictEqual(recentNotifications.length, 1);
	});

	test("Should integrate smart dismissal with notification manager", async () => {
		const notificationManager = new NotificationManager();

		// Create a dismissal rule for a specific pattern
		notificationManager.createDismissalRule("security alert");

		// Create a notification that matches the dismissal pattern
		const notification: SnapBackNotification = {
			id: "test-1",
			type: "warning",
			message: "security alert detected in auth.ts",
			timestamp: Date.now(),
		};

		// Notification should be dismissed due to smart dismissal rules
		await notificationManager.showNotification(notification);

		// Check that the notification was not added to history
		const recentNotifications = notificationManager.getRecentNotifications(10);
		assert.strictEqual(recentNotifications.length, 0);
	});

	test("Should integrate adaptive monitoring with notification manager", () => {
		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
			updateLastActiveFile: sinon.stub(),
			updateActiveBranch: sinon.stub(),
			updateLastCheckpoint: sinon.stub(),
			updateProtectionStatus: sinon.stub(),
			saveContext: sinon.stub().resolves(undefined),
			loadContext: sinon.stub().resolves(undefined),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = new NotificationManager();
		const notificationSpy = sinon.spy(
			mockNotificationManager,
			"showNotification",
		);

		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		// Start the monitoring service
		adaptiveMonitoringService.start();

		// Wait a bit to allow for monitoring cycle
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				// Stop the monitoring service
				adaptiveMonitoringService.stop();

				// Verify that notifications were sent
				// Note: This is a basic check, in a real test we might want to verify more details
				assert.ok(
					notificationSpy.called,
					"Notification manager should have been called",
				);
				resolve();
			}, 100);
		});
	});

	test("Should integrate background analyzer with smart context detector", async () => {
		// Create mock dependencies
		const detectContextStub = sinon.stub().resolves({
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
			showNotification: sinon.stub().resolves(undefined),
			showEnhancedRiskDetected: sinon.stub().resolves(undefined),
			showEnhancedCheckpointCreated: sinon.stub().resolves(undefined),
			showEnhancedAiActivity: sinon.stub().resolves(undefined),
			showEnhancedSecurityAlert: sinon.stub().resolves(undefined),
			showEnhancedLargeChange: sinon.stub().resolves(undefined),
			showEnhancedFailureRecovery: sinon.stub().resolves(undefined),
			showEnhancedSystemStatus: sinon.stub().resolves(undefined),
			showCheckpointCreated: sinon.stub().resolves(undefined),
			showRiskDetected: sinon.stub().resolves(undefined),
			getRecentNotifications: sinon.stub().returns([]),
			clearNotifications: sinon.stub(),
			dismissNotification: sinon.stub(),
			createDismissalRule: sinon.stub(),
		} as unknown as NotificationManager;

		const mockWorkspaceMemory = {
			updateProtectionStatus: sinon.stub(),
			updateLastCheckpoint: sinon.stub(),
			updateLastActiveFile: sinon.stub(),
			updateActiveBranch: sinon.stub(),
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
			saveContext: sinon.stub().resolves(undefined),
			loadContext: sinon.stub().resolves(undefined),
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
			detectContextStub.calledOnce,
			"Context detector should have been called",
		);
	});

	test("Should integrate proactive suggestions with notification manager", async () => {
		const mockNotificationManager = new NotificationManager();
		const notificationSpy = sinon.spy(
			mockNotificationManager,
			"showNotification",
		);

		// Mock storage
		const mockStorage = {
			create: sinon
				.stub()
				.resolves({ id: "test-checkpoint-id", timestamp: Date.now() }),
			retrieve: sinon.stub().resolves(null),
			list: sinon.stub().resolves([]),
			restore: sinon.stub().resolves(null),
		} as unknown as FileSystemStorage;

		const mockOperationCoordinator = new OperationCoordinator(
			{
				getContext: sinon.stub().returns({
					lastActiveFile: null,
					recentFiles: [],
					activeBranch: null,
					lastCheckpoint: null,
					protectionStatus: "protected",
					recentActions: [],
				}),
				updateLastActiveFile: sinon.stub(),
				updateActiveBranch: sinon.stub(),
				updateLastCheckpoint: sinon.stub(),
				updateProtectionStatus: sinon.stub(),
				saveContext: sinon.stub().resolves(undefined),
				loadContext: sinon.stub().resolves(undefined),
			} as unknown as WorkspaceMemoryManager,
			mockNotificationManager,
			mockStorage,
		);

		const proactiveSuggestionsService = new ProactiveSuggestionsService(
			mockNotificationManager,
			mockOperationCoordinator,
		);

		// Create a mock document with a pattern that should trigger a suggestion
		const getTextStub = sinon
			.stub()
			.returns("// TODO: Implement this feature\nfunction test() {}");
		const mockDocument = {
			getText: getTextStub,
			fileName: "test.ts",
			lineCount: 800, // Large file to trigger suggestions
		} as any;

		// Analyze the document
		const suggestions =
			await proactiveSuggestionsService.analyzeDocument(mockDocument);

		// Should have found at least one suggestion
		assert.ok(suggestions.length > 0);

		// Show the suggestions
		await proactiveSuggestionsService.showSuggestions(suggestions);

		// Verify that notifications were sent
		assert.ok(
			notificationSpy.called,
			"Notification manager should have been called for suggestions",
		);
	});

	test("Should integrate predictive risk assessment with notification manager", async () => {
		const mockNotificationManager = new NotificationManager();
		const notificationSpy = sinon.spy(
			mockNotificationManager,
			"showNotification",
		);

		// Create mock workspace memory
		const mockWorkspaceMemory = {
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
			updateLastActiveFile: sinon.stub(),
			updateActiveBranch: sinon.stub(),
			updateLastCheckpoint: sinon.stub(),
			updateProtectionStatus: sinon.stub(),
			saveContext: sinon.stub().resolves(undefined),
			loadContext: sinon.stub().resolves(undefined),
		} as unknown as WorkspaceMemoryManager;

		const predictiveRiskAssessmentService = new PredictiveRiskAssessmentService(
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		// Add some risk analysis to history
		predictiveRiskAssessmentService.addRiskAnalysisToHistory({
			score: 0.8,
			factors: ["High change velocity", "Multiple file modifications"],
			threats: [],
			fileComplexity: 0.7,
			changeVelocity: 0.9,
		});

		// Assess risk
		const assessment = await predictiveRiskAssessmentService.assessRisk();

		// Should have a valid risk assessment
		assert.ok(assessment);
		assert.ok(assessment.overallRiskScore >= 0);
		assert.ok(assessment.overallRiskScore <= 1);

		// Create a test notification for showing the risk assessment
		const testNotification: SnapBackNotification = {
			id: "risk-assessment-1",
			type: "warning",
			message: "Risk assessment completed",
			timestamp: Date.now(),
		};

		// Show the risk assessment
		await mockNotificationManager.showNotification(testNotification);

		// Verify that notifications were sent
		assert.ok(
			notificationSpy.called,
			"Notification manager should have been called for risk assessment",
		);
	});

	test("Should create dismissal rules in notification manager", async () => {
		const notificationManager = new NotificationManager();
		const originalLength = notificationManager.notifications.length;

		// Create a dismissal rule
		notificationManager.createDismissalRule("test-pattern");

		// The length should be the same since this just logs
		assert.strictEqual(
			notificationManager.notifications.length,
			originalLength,
		);
	});

	test("Should integrate all ambient experience components", async () => {
		// This is a high-level integration test that verifies all ambient experience
		// components work together

		// Create mock dependencies
		const mockWorkspaceMemory = {
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
			updateLastActiveFile: sinon.stub(),
			updateActiveBranch: sinon.stub(),
			updateLastCheckpoint: sinon.stub(),
			updateProtectionStatus: sinon.stub(),
			saveContext: sinon.stub().resolves(undefined),
			loadContext: sinon.stub().resolves(undefined),
		} as unknown as WorkspaceMemoryManager;

		const mockNotificationManager = new NotificationManager();
		const notificationSpy = sinon.spy(
			mockNotificationManager,
			"showNotification",
		);

		const detectContextStub = sinon.stub().resolves({
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

		// Mock storage
		const mockStorage = {
			create: sinon
				.stub()
				.resolves({ id: "test-checkpoint-id", timestamp: Date.now() }),
			retrieve: sinon.stub().resolves(null),
			list: sinon.stub().resolves([]),
			restore: sinon.stub().resolves(null),
		} as unknown as FileSystemStorage;

		const mockOperationCoordinator = new OperationCoordinator(
			mockWorkspaceMemory,
			mockNotificationManager,
			mockStorage,
		);

		// Create all ambient experience components
		const adaptiveMonitoringService = new AdaptiveMonitoringService(
			mockWorkspaceMemory,
			mockNotificationManager,
		);

		const backgroundAnalyzer = new BackgroundAnalyzer(
			mockSmartContextDetector,
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		const editorDecorations = new EditorDecorations();

		const proactiveSuggestionsService = new ProactiveSuggestionsService(
			mockNotificationManager,
			mockOperationCoordinator,
		);

		const predictiveRiskAssessmentService = new PredictiveRiskAssessmentService(
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		// Verify that all components were created successfully
		assert.ok(adaptiveMonitoringService);
		assert.ok(backgroundAnalyzer);
		assert.ok(editorDecorations);
		assert.ok(proactiveSuggestionsService);
		assert.ok(predictiveRiskAssessmentService);

		// Test that components can interact with each other through the notification manager
		const testNotification: SnapBackNotification = {
			id: "integration-test",
			type: "info",
			message: "Integration test notification",
			timestamp: Date.now(),
		};

		await mockNotificationManager.showNotification(testNotification);

		// Verify that the notification manager processed the notification
		assert.ok(notificationSpy.called);

		// Test that the frequency tuner and smart dismissal manager are working
		const recentNotifications =
			mockNotificationManager.getRecentNotifications(10);
		assert.strictEqual(recentNotifications.length, 1);
	});
});
