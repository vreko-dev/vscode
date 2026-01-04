/**
 * MCP Command Handlers - VS Code command implementations for MCP tools and AI features
 *
 * This module provides command handlers for MCP (Model Context Protocol) tools
 * and AI monitoring features.
 *
 * Commands:
 * - snapback.mcp.check: Run code validation check
 * - snapback.mcp.analyzeImpact: Analyze change impact
 * - snapback.mcp.startTask: Start a new development task
 * - snapback.mcp.endTask: End current development task
 * - snapback.mcp.diagnose: Diagnose MCP connection issues
 * - snapback.toggleAIMonitoring: Toggle AI monitoring
 * - snapback.showAIMonitoringStatus: Show AI monitoring status
 *
 * @module commands/mcpCommands
 */

import type { ServiceFederation } from "@snapback/core";
import * as vscode from "vscode";
import { getMCPBridge } from "../bridges/MCPBridge";
import type { OperationCoordinator } from "../operationCoordinator";
import type { MCPLifecycleManager } from "../services/MCPLifecycleManager";
import { getMCPTelemetry } from "../services/MCPTelemetry";
import type { MCPToolsService } from "../services/MCPToolsService";
import { logger } from "../utils/logger";
import type { WorkflowIntegration } from "../workflowIntegration";

/**
 * Register all MCP and AI-related commands
 *
 * @param context - VS Code extension context
 * @param federation - Service federation instance
 * @param operationCoordinator - Operation coordinator instance
 * @param workflowIntegration - Workflow integration instance
 * @param mcpToolsService - MCP Tools service instance (optional)
 * @param mcpManager - MCP Lifecycle manager for connection diagnostics (optional)
 * @returns Array of disposables for command registrations
 */
export function registerMcpCommands(
	_context: vscode.ExtensionContext,
	_federation: InstanceType<typeof ServiceFederation>,
	_operationCoordinator: OperationCoordinator,
	_workflowIntegration: WorkflowIntegration,
	mcpToolsService?: MCPToolsService | null,
	mcpManager?: MCPLifecycleManager | null,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// =========================================================================
	// MCP Tools Commands (using MCPToolsService)
	// =========================================================================

	// Command: Run code check on current file
	disposables.push(
		vscode.commands.registerCommand("snapback.mcp.check", async () => {
			if (!mcpToolsService) {
				vscode.window.showWarningMessage("MCP Tools not available");
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage("No active editor");
				return;
			}

			try {
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: "Running code check...",
						cancellable: false,
					},
					async () => {
						const result = await mcpToolsService.check({
							mode: "quick",
							files: [editor.document.fileName],
						});

						if (result.passed) {
							vscode.window.showInformationMessage(
								`✓ Code check passed (${result.errors} errors, ${result.warnings} warnings)`,
							);
						} else {
							vscode.window.showWarningMessage(
								`✗ Code check failed: ${result.errors} errors, ${result.warnings} warnings`,
							);
						}
					},
				);
			} catch (error) {
				vscode.window.showErrorMessage(`Code check failed: ${error}`);
			}
		}),
	);

	// Command: Check patterns in current file
	disposables.push(
		vscode.commands.registerCommand("snapback.mcp.checkPatterns", async () => {
			if (!mcpToolsService) {
				vscode.window.showWarningMessage("MCP Tools not available");
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage("No active editor");
				return;
			}

			try {
				const code = editor.document.getText();
				const result = await mcpToolsService.check({
					mode: "patterns",
					code,
					filePath: editor.document.fileName,
				});

				if (result.violations && result.violations.length > 0) {
					const items = result.violations.map((v) => `${v.type}: ${v.message}`);
					vscode.window.showQuickPick(items, {
						title: `Found ${result.violations.length} pattern violations`,
						canPickMany: false,
					});
				} else {
					vscode.window.showInformationMessage("✓ No pattern violations found");
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Pattern check failed: ${error}`);
			}
		}),
	);

	// Command: Start development task
	disposables.push(
		vscode.commands.registerCommand("snapback.mcp.startTask", async () => {
			if (!mcpToolsService) {
				vscode.window.showWarningMessage("MCP Tools not available");
				return;
			}

			const taskDescription = await vscode.window.showInputBox({
				prompt: "What are you working on?",
				placeHolder: "e.g., Implementing user authentication",
			});

			if (!taskDescription) {
				return;
			}

			try {
				const editor = vscode.window.activeTextEditor;
				const files = editor ? [editor.document.fileName] : [];

				const result = await mcpToolsService.startTask({
					task: taskDescription,
					files,
				});

				vscode.window.showInformationMessage(`Task started: ${result.taskId}`);

				// Show any warnings about protected files
				if (result.warnings && result.warnings.length > 0) {
					for (const warning of result.warnings) {
						vscode.window.showWarningMessage(`⚠️ ${warning.file}: ${warning.message}`);
					}
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to start task: ${error}`);
			}
		}),
	);

	// Command: End current task
	disposables.push(
		vscode.commands.registerCommand("snapback.mcp.endTask", async () => {
			if (!mcpToolsService) {
				vscode.window.showWarningMessage("MCP Tools not available");
				return;
			}

			if (!mcpToolsService.activeTaskId) {
				vscode.window.showWarningMessage("No active task to end");
				return;
			}

			const success = await vscode.window.showQuickPick(["Yes, task completed", "No, task blocked/abandoned"], {
				title: "Did you complete the task successfully?",
			});

			if (!success) {
				return;
			}

			try {
				const ok = success.startsWith("Yes");
				const result = await mcpToolsService.endTask({ ok });

				vscode.window.showInformationMessage(
					`Task ${result.outcome}: ${result.learningsCaptured} learnings captured`,
				);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to end task: ${error}`);
			}
		}),
	);

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

	// =========================================================================
	// MCP Diagnostics Command
	// =========================================================================

	// Command: Diagnose MCP Connection
	disposables.push(
		vscode.commands.registerCommand("snapback.mcp.diagnose", async () => {
			const diagnostics: string[] = [];
			diagnostics.push("=== SnapBack MCP Diagnostics ===\n");

			// 1. Check MCP config
			const config = vscode.workspace.getConfiguration("snapback");
			const mcpEnabled = config.get<boolean>("mcp.enabled", true);
			const serverUrl = config.get<string>("mcp.serverUrl", "");

			if (!mcpEnabled) {
				diagnostics.push("❌ MCP is disabled in settings");
				diagnostics.push("   → Enable with: snapback.mcp.enabled = true\n");
			} else {
				diagnostics.push("✅ MCP is enabled in settings\n");
			}

			// 2. Check MCPLifecycleManager state
			if (mcpManager) {
				const connectionState = mcpManager.getConnectionState();
				const isReady = mcpManager.isServerReady();
				const serverVersion = mcpManager.getServerVersion();

				if (isReady) {
					diagnostics.push(`✅ MCP Lifecycle: ${connectionState} (server ready)`);
					if (serverVersion) {
						diagnostics.push(`   Server version: v${serverVersion}`);
					}
				} else {
					diagnostics.push(`⚠️ MCP Lifecycle: ${connectionState} (server not ready)`);
				}
			} else {
				diagnostics.push("⚠️ MCP Lifecycle Manager not available");
			}

			// 3. Check remote MCP server connectivity (if configured)
			if (serverUrl && serverUrl.trim() !== "") {
				diagnostics.push(`\n📡 Remote Server: ${serverUrl}`);
				try {
					const controller = new AbortController();
					const timeoutId = setTimeout(() => controller.abort(), 5000);

					const response = await fetch(`${serverUrl}/health`, {
						method: "GET",
						signal: controller.signal,
					});
					clearTimeout(timeoutId);

					if (response.ok) {
						diagnostics.push("✅ Remote MCP server reachable");
					} else {
						diagnostics.push(`⚠️ Remote server responded with: ${response.status}`);
					}
				} catch (error) {
					if (error instanceof Error && error.name === "AbortError") {
						diagnostics.push("❌ Remote server timeout (5s)");
					} else {
						diagnostics.push(
							`❌ Cannot reach remote server: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
			} else {
				diagnostics.push("\n⚠️ No remote MCP server configured");
				diagnostics.push("   → Configure with: snapback.mcp.serverUrl");
			}

			// 4. Check local bridge endpoint
			diagnostics.push("\n📡 Local Bridge:");
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 2000);

				const response = await fetch("http://127.0.0.1:3100/bridge/health", {
					method: "GET",
					signal: controller.signal,
				});
				clearTimeout(timeoutId);

				if (response.ok) {
					diagnostics.push("✅ Bridge receiver healthy at 127.0.0.1:3100");
				} else {
					diagnostics.push(`⚠️ Bridge responded with: ${response.status}`);
				}
			} catch {
				diagnostics.push("⚠️ Bridge receiver not available (CLI may not be running)");
			}

			// 5. Check MCPBridge queue depth and circuit breaker (G8, G9)
			diagnostics.push("\n📊 Queue & Circuit Breaker Status:");
			try {
				const bridge = getMCPBridge();
				const status = bridge.getStatus();
				const circuitState = bridge.getCircuitState();

				diagnostics.push(`   Pending observations: ${status.pendingObservations}`);
				diagnostics.push(`   Pending changes: ${status.pendingChanges}`);
				diagnostics.push(`   Total pushes: ${status.pushCount}`);
				diagnostics.push(`   Failures: ${status.failureCount}`);

				// Circuit breaker status
				const circuitIcon =
					circuitState.state === "closed" ? "✅" : circuitState.state === "open" ? "🔴" : "🟡";
				diagnostics.push(`   Circuit breaker: ${circuitIcon} ${circuitState.state}`);
				if (circuitState.consecutiveFailures > 0) {
					diagnostics.push(`   Consecutive failures: ${circuitState.consecutiveFailures}`);
				}
				if (circuitState.nextRetryIn) {
					diagnostics.push(`   Next retry in: ${Math.round(circuitState.nextRetryIn / 1000)}s`);
				}

				if (status.lastPushTime) {
					const ago = Math.round((Date.now() - status.lastPushTime) / 1000);
					diagnostics.push(`   Last push: ${ago}s ago`);
				} else {
					diagnostics.push("   Last push: never");
				}
				if (status.pendingObservations > 0 || status.pendingChanges > 0) {
					diagnostics.push("   ⚠️ Work is queued - will sync when connection restored");
				} else {
					diagnostics.push("   ✅ Queue is empty");
				}
			} catch {
				diagnostics.push("   ⚠️ MCPBridge not initialized");
			}

			// 6. Summary and recommendations
			diagnostics.push("\n=== Recommendations ===");

			if (!mcpEnabled) {
				diagnostics.push("• Enable MCP in settings to use AI assistant features");
			}

			if (!mcpManager?.isServerReady()) {
				diagnostics.push("• Check network connectivity to MCP server");
				diagnostics.push("• Verify server URL in settings is correct");
				diagnostics.push("• Try restarting VS Code if issues persist");
			}

			// Show in output channel
			const panel = vscode.window.createOutputChannel("SnapBack MCP Diagnostics");
			panel.clear();
			for (const line of diagnostics) {
				panel.appendLine(line);
			}
			panel.show();

			// Track telemetry for diagnose execution (G10: MCP metrics)
			try {
				const bridge = getMCPBridge();
				const status = bridge.getStatus();
				const circuitState = bridge.getCircuitState();

				getMCPTelemetry().trackDiagnoseExecuted({
					mcpEnabled,
					serverReady: mcpManager?.isServerReady() ?? false,
					circuitState: circuitState.state,
					queueDepth: status.pendingObservations + status.pendingChanges,
				});
			} catch {
				// Bridge not initialized, still track what we can
				getMCPTelemetry().trackDiagnoseExecuted({
					mcpEnabled,
					serverReady: mcpManager?.isServerReady() ?? false,
					circuitState: "closed",
					queueDepth: 0,
				});
			}

			logger.info("MCP diagnostics completed", { diagnosticsCount: diagnostics.length });
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
				await config.update("aiDetectionEnabled", !currentEnabled, vscode.ConfigurationTarget.Global);

				// Update UI and provide feedback
				vscode.window.showInformationMessage(`AI Monitoring ${!currentEnabled ? "enabled" : "disabled"}`);
				// Note: StatusBarController removed - status shown in Activity Bar only
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to toggle AI monitoring: ${error}`);
			}
		}),
	);

	// Command: Show AI Monitoring Status
	disposables.push(
		vscode.commands.registerCommand("snapback.showAIMonitoringStatus", async () => {
			try {
				const config = vscode.workspace.getConfiguration("snapback");
				const aiDetectionEnabled = config.get<boolean>("aiDetectionEnabled", true);

				vscode.window.showInformationMessage(
					`AI Monitoring is currently ${aiDetectionEnabled ? "enabled" : "disabled"}`,
				);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to get AI monitoring status: ${error}`);
			}
		}),
	);

	return disposables;
}
