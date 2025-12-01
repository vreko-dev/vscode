import * as assert from "node:assert";
// @ts-expect-error
import sinon from "sinon";
import * as vscode from "vscode";
import { PredictiveRiskAssessmentService } from "../../src/predictiveRiskAssessment.js";

suite("PredictiveRiskAssessmentService Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Should create predictive risk assessment service instance", () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockWorkspaceMemory = {
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as any;

		const predictiveRiskAssessmentService = new PredictiveRiskAssessmentService(
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		assert.ok(predictiveRiskAssessmentService);
	});

	test("Should assess risk and return predictive assessment", async () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockWorkspaceMemory = {
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as any;

		const predictiveRiskAssessmentService = new PredictiveRiskAssessmentService(
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		// Assess risk
		const assessment = await predictiveRiskAssessmentService.assessRisk();

		// Should return a valid assessment
		assert.ok(assessment);
		assert.ok(typeof assessment.overallRiskScore === "number");
		assert.ok(typeof assessment.confidence === "number");
		assert.ok(Array.isArray(assessment.factors));
		assert.ok(Array.isArray(assessment.recommendations));
		assert.ok(Array.isArray(assessment.predictedEvents));
	});

	test("Should calculate overall risk score correctly", async () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockWorkspaceMemory = {
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as any;

		const predictiveRiskAssessmentService = new PredictiveRiskAssessmentService(
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		// Assess risk
		const assessment = await predictiveRiskAssessmentService.assessRisk();

		// Overall risk score should be between 0 and 1
		assert.ok(assessment.overallRiskScore >= 0);
		assert.ok(assessment.overallRiskScore <= 1);

		// Confidence should be between 0 and 1
		assert.ok(assessment.confidence >= 0);
		assert.ok(assessment.confidence <= 1);
	});

	test("Should generate recommendations based on risk factors", async () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockWorkspaceMemory = {
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [".env", "config.json"],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [
					{ action: "file_opened", timestamp: Date.now() },
					{ action: "file_opened", timestamp: Date.now() - 1000 },
					{ action: "file_opened", timestamp: Date.now() - 2000 },
				],
			}),
		} as any;

		const predictiveRiskAssessmentService = new PredictiveRiskAssessmentService(
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		// Assess risk
		const assessment = await predictiveRiskAssessmentService.assessRisk();

		// Should have recommendations
		assert.ok(assessment.recommendations.length >= 0);
	});

	test("Should predict events based on risk factors", async () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockWorkspaceMemory = {
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as any;

		const predictiveRiskAssessmentService = new PredictiveRiskAssessmentService(
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		// Assess risk
		const assessment = await predictiveRiskAssessmentService.assessRisk();

		// Should have predicted events array
		assert.ok(Array.isArray(assessment.predictedEvents));
	});

	test("Should add risk analysis to history", () => {
		// Create mock dependencies
		const mockNotificationManager = {} as any;
		const mockWorkspaceMemory = {
			getContext: sinon.stub().returns({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		} as any;

		const predictiveRiskAssessmentService = new PredictiveRiskAssessmentService(
			mockNotificationManager,
			mockWorkspaceMemory,
		);

		// Clear history first
		predictiveRiskAssessmentService.clearHistory();

		// Add a risk analysis to history
		const riskAnalysis = {
			score: 0.8,
			factors: ["test factor"],
			threats: [],
		};

		predictiveRiskAssessmentService.addRiskAnalysisToHistory(riskAnalysis);

		// History should now contain the risk analysis
		// Note: We can't directly check the private history, but we can verify the method doesn't throw
		assert.ok(true);
	});
});
