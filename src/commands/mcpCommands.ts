/**
 * MCP Command Handlers - VS Code command implementations for MCP federation and AI features
 *
 * This module provides command handlers for MCP (Model Context Protocol) federation testing
 * and AI monitoring features.
 *
 * Commands:
 * - snapback.testMCPFederation: [DEBUG] Test basic MCP federation
 * - snapback.testMCPFederationComprehensive: [DEBUG] Comprehensive MCP federation test
 * - snapback.analyzeRisk: [DEBUG] Analyze risk using AI
 * - snapback.toggleAIMonitoring: Toggle AI monitoring
 * - snapback.showAIMonitoringStatus: Show AI monitoring status
 * - snapback.applyWorkflowSuggestion: Apply a workflow suggestion
 * - snapback.autoApplySuggestions: Auto-apply suggestions
 *
 * NOTE: Commands marked [DEBUG] are disabled in production builds.
 * See P2 recommendations in COMMAND_LIFECYCLE_AUDIT.md
 *
 * @module commands/mcpCommands
 */

import type { ServiceFederation } from "@snapback/core";
import * as vscode from "vscode";
import type { OperationCoordinator } from "../operationCoordinator.js";
import type { StatusBarController } from "../ui/statusBar.js";
import type { WorkflowIntegration } from "../workflowIntegration.js";

/**
 * Register all MCP and AI-related commands
 *
 * @param context - VS Code extension context
 * @param federation - Service federation instance
 * @param operationCoordinator - Operation coordinator instance
 * @param workflowIntegration - Workflow integration instance
 * @param statusBar - Status bar instance
 * @returns Array of disposables for command registrations
 */
export function registerMcpCommands(
	_context: vscode.ExtensionContext,
	federation: InstanceType<typeof ServiceFederation>,
	operationCoordinator: OperationCoordinator,
	_workflowIntegration: WorkflowIntegration,
	statusBar: StatusBarController,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// DEBUG COMMANDS - Disabled in production (P2 Recommendation)
	// Uncomment for local MCP testing if needed:
	// disposables.push(
	// 	vscode.commands.registerCommand("snapback.testMCPFederation", async () => {
	// 		try {
	// 			// Simulate MCP service call with fallback strategy
	// 			const docsResult = await federation.executeWithFallback(
	// 				"docs",
	// 				() => Promise.resolve("Successful Context7 result"),
	// 				() => "Fallback result",
	// 			);
	// 			vscode.window.showInformationMessage(
	// 				`MCP Federation Test: ${docsResult}`,
	// 			);
	// 		} catch (error) {
	// 			vscode.window.showErrorMessage(`MCP Federation Test failed: ${error}`);
	// 		}
	// 	})
	// );

	// disposables.push(
	// 	vscode.commands.registerCommand(
	// 		"snapback.testMCPFederationComprehensive",
	// 		async () => {
	// 			// [Comprehensive test code commented out for production]
	// 			// See git history for full implementation
	// 		},
	// 	)
	// );

	// disposables.push(
	// 	vscode.commands.registerCommand("snapback.analyzeRisk", async () => {
	// 		vscode.window.setStatusBarMessage("Analyzing risk...", 3000);
	// 		try {
	// 			const editor = vscode.window.activeTextEditor;
	// 			if (editor) {
	// 				await operationCoordinator.coordinateRiskAnalysis(
	// 					editor.document.fileName,
	// 				);
	// 				vscode.window.setStatusBarMessage("Risk analysis completed", 3000);
	// 			}
	// 		} catch (error) {
	// 			vscode.window.showErrorMessage(`Risk analysis failed: ${error}`);
	// 		}
	// 	})
	// );

	// Command: Test MCP Federation

	// Command: Toggle AI Monitoring
	disposables.push(
		vscode.commands.registerCommand("snapback.toggleAIMonitoring", async () => {
			try {
				// Read current configuration state
				const config = vscode.workspace.getConfiguration("snapback");
				const currentEnabled = config.get<boolean>("aiDetectionEnabled", true);

				// Persist configuration change
				await config.update(
					"aiDetectionEnabled",
					!currentEnabled,
					vscode.ConfigurationTarget.Global,
				);

				// Update UI and provide feedback
				vscode.window.showInformationMessage(
					`AI Monitoring ${!currentEnabled ? "enabled" : "disabled"}`,
				);
				statusBar.setProtectionStatus(!currentEnabled ? "protected" : "atRisk");
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to toggle AI monitoring: ${error}`,
				);
			}
		}),
	);

	// Command: Show AI Monitoring Status
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.showAIMonitoringStatus",
			async () => {
				try {
					const config = vscode.workspace.getConfiguration("snapback");
					const aiDetectionEnabled = config.get<boolean>(
						"aiDetectionEnabled",
						true,
					);

					vscode.window.showInformationMessage(
						`AI Monitoring is currently ${
							aiDetectionEnabled ? "enabled" : "disabled"
						}`,
					);
				} catch (error) {
					vscode.window.showErrorMessage(
						`Failed to get AI monitoring status: ${error}`,
					);
				}
			},
		),
	);

	return disposables;
}
