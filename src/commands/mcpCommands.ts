/**
 * MCP Command Handlers - VS Code command implementations for MCP federation and AI features
 *
 * This module provides command handlers for MCP (Model Context Protocol) federation testing
 * and AI monitoring features.
 *
 * Commands:
 * - snapback.testMCPFederation: Test basic MCP federation
 * - snapback.testMCPFederationComprehensive: Comprehensive MCP federation test
 * - snapback.analyzeRisk: Analyze risk using AI
 * - snapback.toggleAIMonitoring: Toggle AI monitoring
 * - snapback.showAIMonitoringStatus: Show AI monitoring status
 * - snapback.applyWorkflowSuggestion: Apply a workflow suggestion
 * - snapback.autoApplySuggestions: Auto-apply suggestions
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

	// Command: Test MCP Federation
	disposables.push(
		vscode.commands.registerCommand("snapback.testMCPFederation", async () => {
			try {
				// Simulate MCP service call with fallback strategy
				// In production: actual Context7 MCP service integration
				const docsResult = await federation.executeWithFallback(
					"docs",
					() => Promise.resolve("Successful Context7 result"),
					() => "Fallback result", // Simplified fallback
				);

				vscode.window.showInformationMessage(
					`MCP Federation Test: ${docsResult}`,
				);
			} catch (error) {
				vscode.window.showErrorMessage(`MCP Federation Test failed: ${error}`);
			}
		}),
	);

	// Command: Comprehensive MCP Federation Test
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.testMCPFederationComprehensive",
			async () => {
				try {
					// Circuit Breaker Pattern Testing
					let _failures = 0;
					for (let i = 0; i < 3; i++) {
						try {
							await federation.executeWithFallback(
								"docs",
								() => Promise.reject(new Error("Simulated MCP failure")),
								() => `Fallback result ${i + 1}`,
							);
						} catch (_error) {
							_failures++;
						}
					}

					// Verify circuit breaker activation after failure threshold
					const circuitBreakerResult = await federation.executeWithFallback(
						"docs",
						() => Promise.resolve("This should not be called"),
						() => "Circuit breaker is open, using fallback",
					);

					// Caching Mechanism Testing
					const cacheKey = "test-cache-key";
					const cachedResult1 = await federation.executeWithCache(
						"docs",
						cacheKey,
						() => Promise.resolve("Cached result"),
						() => "Fallback result",
					);

					// Verify cache hit on subsequent call
					const cachedResult2 = await federation.executeWithCache(
						"docs",
						cacheKey,
						() => Promise.resolve("This should not be called due to cache"),
						() => "Fallback result",
					);

					// Timeout Management Testing
					const timeoutResult = await federation.executeWithTimeout(
						"docs",
						() =>
							new Promise((resolve) =>
								setTimeout(() => resolve("Slow result"), 1000),
							),
						() => "Timeout fallback result",
						100, // 100ms timeout threshold
					);

					// Present comprehensive test results
					vscode.window.showInformationMessage(
						`Comprehensive MCP Federation Test Results:
        - Circuit breaker: ${circuitBreakerResult}
        - Cache test 1: ${cachedResult1}
        - Cache test 2: ${cachedResult2}
        - Timeout test: ${timeoutResult}`,
					);
				} catch (error) {
					vscode.window.showErrorMessage(
						`Comprehensive MCP Federation Test failed: ${error}`,
					);
				}
			},
		),
	);

	// Command: Analyze Risk
	disposables.push(
		vscode.commands.registerCommand("snapback.analyzeRisk", async () => {
			vscode.window.setStatusBarMessage("Analyzing risk...", 3000);
			try {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					await operationCoordinator.coordinateRiskAnalysis(
						editor.document.fileName,
					);
					vscode.window.setStatusBarMessage("Risk analysis completed", 3000);
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Risk analysis failed: ${error}`);
			}
		}),
	);

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
