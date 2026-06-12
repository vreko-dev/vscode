/**
 * MCP Command Handlers - VS Code command implementations for MCP tools and AI features
 *
 * This module provides command handlers for MCP (Model Context Protocol) tools
 * and AI monitoring features.
 *
 * Commands:
 * - vreko.mcp.check: Run code validation check
 * - vreko.mcp.analyzeImpact: Analyze change impact
 * - vreko.mcp.startTask: Start a new development task
 * - vreko.mcp.endTask: End current development task
 * - vreko.mcp.diagnose: Diagnose MCP connection issues
 * - vreko.mcp.reconnect: Force MCP service reconnection
 * - vreko.toggleAIMonitoring: Toggle AI monitoring
 * - vreko.showAIMonitoringStatus: Show AI monitoring status
 *
 * @module commands/mcpCommands
 */

import * as vscode from "vscode";
import type { OperationCoordinator } from "../operationCoordinator";
import { getCurrentWorkspaceId, getDaemonBridge } from "../services/DaemonBridge";
import type { MCPToolsService } from "../services/MCPToolsService";
import type { ServiceFederation } from "../types/core";
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
	_federation: ServiceFederation,
	_operationCoordinator: OperationCoordinator,
	_workflowIntegration: WorkflowIntegration,
	mcpToolsService?: MCPToolsService | null,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// =========================================================================
	// MCP Tools Commands (using MCPToolsService)
	// =========================================================================

	// Command: Run code check on current file
	disposables.push(
		vscode.commands.registerCommand("vreko.mcp.check", async () => {
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
		vscode.commands.registerCommand("vreko.mcp.checkPatterns", async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage("No active editor");
				return;
			}

			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const daemonBridge = getCurrentWorkspaceId() ? getDaemonBridge(getCurrentWorkspaceId()!) : null;
			if (!daemonBridge) {
				vscode.window.showErrorMessage("No workspace folder open");
				return;
			}

			// Try service delegation first (ARCHITECTURE_REFACTOR_SPEC.md pattern)
			if (daemonBridge?.isConnected() && workspaceRoot) {
				try {
					const code = editor.document.getText();
					const result = await daemonBridge.checkPatterns(workspaceRoot, code, editor.document.fileName);

					if (result.violations && result.violations.length > 0) {
						const items = result.violations.map((v) => `${v.pattern}: ${v.message}`);
						vscode.window.showQuickPick(items, {
							title: `Found ${result.violations.length} pattern violations`,
							canPickMany: false,
						});
					} else {
						vscode.window.showInformationMessage("✓ No pattern violations found");
					}
					return; // Success via service
				} catch (daemonError) {
					logger.warn("Daemon delegation failed for checkPatterns, falling back to local", {
						error: daemonError,
					});
					// Fall through to local implementation
				}
			}

			// Local fallback via MCPToolsService
			if (!mcpToolsService) {
				vscode.window.showWarningMessage("MCP Tools not available");
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
		vscode.commands.registerCommand("vreko.mcp.startTask", async () => {
			const taskDescription = await vscode.window.showInputBox({
				prompt: "What are you working on?",
				placeHolder: "e.g., Implementing user authentication",
			});

			if (!taskDescription) {
				return;
			}

			const editor = vscode.window.activeTextEditor;
			const files = editor ? [editor.document.fileName] : [];
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const daemonBridge = getCurrentWorkspaceId() ? getDaemonBridge(getCurrentWorkspaceId()!) : null;
			if (!daemonBridge) {
				vscode.window.showErrorMessage("No workspace folder open");
				return;
			}

			// Try service delegation first (ARCHITECTURE_REFACTOR_SPEC.md pattern)
			if (daemonBridge?.isConnected() && workspaceRoot) {
				try {
					const result = await daemonBridge.beginSession(workspaceRoot, taskDescription, files);

					vscode.window.showInformationMessage(`Task started: ${result.taskId}`);

					// Show risk assessment if available
					if (result.risk && result.risk.factors.length > 0) {
						for (const factor of result.risk.factors) {
							vscode.window.showWarningMessage(`⚠️ Risk factor: ${factor}`);
						}
					}
					return; // Success via service
				} catch (daemonError) {
					logger.warn("Daemon delegation failed for startTask, falling back to local", {
						error: daemonError,
					});
					// Fall through to local implementation
				}
			}

			// Local fallback via MCPToolsService
			if (!mcpToolsService) {
				vscode.window.showWarningMessage("MCP Tools not available");
				return;
			}

			try {
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
		vscode.commands.registerCommand("vreko.mcp.endTask", async () => {
			const success = await vscode.window.showQuickPick(["Yes, task completed", "No, task blocked/abandoned"], {
				title: "Did you complete the task successfully?",
			});

			if (!success) {
				return;
			}

			const ok = success.startsWith("Yes");
			const outcome = ok ? "completed" : "abandoned";
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			const daemonBridge = getCurrentWorkspaceId() ? getDaemonBridge(getCurrentWorkspaceId()!) : null;
			if (!daemonBridge) {
				vscode.window.showErrorMessage("No workspace folder open");
				return;
			}

			// Try service delegation first (ARCHITECTURE_REFACTOR_SPEC.md pattern)
			if (daemonBridge?.isConnected() && workspaceRoot) {
				try {
					const result = await daemonBridge.endSession(
						workspaceRoot,
						outcome,
						true, // createSnapshot
					);

					vscode.window.showInformationMessage(
						`Task ${outcome}: ${result.filesModified} files modified${result.snapshotId ? ", snapshot created" : ""}`,
					);
					return; // Success via service
				} catch (daemonError) {
					logger.warn("Daemon delegation failed for endTask, falling back to local", { error: daemonError });
					// Fall through to local implementation
				}
			}

			// Local fallback via MCPToolsService
			if (!mcpToolsService) {
				vscode.window.showWarningMessage("MCP Tools not available");
				return;
			}

			if (!mcpToolsService.activeTaskId) {
				vscode.window.showWarningMessage("No active task to end");
				return;
			}

			try {
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
	// 	vscode.commands.registerCommand("vreko.testMCPFederation", async () => {
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
	// 		"vreko.testMCPFederationComprehensive",
	// 		async () => {
	// 			// [Comprehensive test code commented out for production]
	// 			// See git history for full implementation
	// 		},
	// 	)
	// );

	// disposables.push(
	// 	vscode.commands.registerCommand("vreko.analyzeRisk", async () => {
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
		vscode.commands.registerCommand("vreko.mcp.diagnose", async () => {
			const diagnostics: string[] = [];
			diagnostics.push("=== Vreko MCP Diagnostics ===\n");

			// 1. Check MCP config
			const config = vscode.workspace.getConfiguration("vreko");
			const mcpEnabled = config.get<boolean>("mcp.enabled", true);
			const serverUrl = config.get<string>("mcp.serverUrl", "");

			if (!mcpEnabled) {
				diagnostics.push("❌ MCP is disabled in settings");
				diagnostics.push("   → Enable with: vreko.mcp.enabled = true\n");
			} else {
				diagnostics.push("✅ MCP is enabled in settings\n");
			}

			// 2. Check DaemonBridge state
			const daemonBridge = getCurrentWorkspaceId() ? getDaemonBridge(getCurrentWorkspaceId()!) : null;
			if (!daemonBridge) {
				vscode.window.showErrorMessage("No workspace folder open");
				return;
			}
			const connectionState = daemonBridge.getState();
			const isConnected = daemonBridge.isConnected();
			const serverVersion = daemonBridge.getDaemonVersion();

			if (isConnected) {
				diagnostics.push(`✅ MCP Connection: ${connectionState} (connected)`);
				if (serverVersion) {
					diagnostics.push(`   Daemon version: v${serverVersion}`);
				}
			} else {
				diagnostics.push(`⚠️ MCP Connection: ${connectionState} (not connected)`);
				if (connectionState === "reconnecting") {
					diagnostics.push(
						`   Attempt: ${daemonBridge.getReconnectAttempt()}/${daemonBridge.getMaxReconnectAttempts()}`,
					);
				}
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
				diagnostics.push("   → Configure with: vreko.mcp.serverUrl");
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

			// 5. Signal aggregation status
			diagnostics.push("\n📊 Signal Aggregation:");
			diagnostics.push("   File change signals route through daemon (intelligence/file-modified).");

			// 6. Summary and recommendations
			diagnostics.push("\n=== Recommendations ===");

			if (!mcpEnabled) {
				diagnostics.push("• Enable MCP in settings to use AI assistant features");
			}

			const workspaceId = getCurrentWorkspaceId();
			if (workspaceId && !getDaemonBridge(workspaceId).isConnected()) {
				diagnostics.push("• Check network connectivity to MCP server");
				diagnostics.push("• Verify server URL in settings is correct");
				diagnostics.push("• Try restarting VS Code if issues persist");
			}

			// Show in output channel
			const panel = vscode.window.createOutputChannel("Vreko MCP Diagnostics");
			panel.clear();
			for (const line of diagnostics) {
				panel.appendLine(line);
			}
			panel.show();

			// Telemetry for diagnose execution routes through daemon
			logger.info("MCP diagnostics executed", {
				mcpEnabled,
				serverReady: workspaceId ? getDaemonBridge(workspaceId).isConnected() : false,
			});

			logger.info("MCP diagnostics completed", { diagnosticsCount: diagnostics.length });
		}),
	);

	// Command: Force MCP Daemon Reconnection
	disposables.push(
		vscode.commands.registerCommand("vreko.mcp.reconnect", async () => {
			const reconnectWorkspaceId = getCurrentWorkspaceId();
			if (!reconnectWorkspaceId) {
				void vscode.window.showErrorMessage("No workspace folder open");
				return;
			}
			const bridge = getDaemonBridge(reconnectWorkspaceId);
			const currentState = bridge.getState();

			// Show confirmation dialog
			const confirm = await vscode.window.showWarningMessage(
				`Current MCP status: ${currentState}. Force reconnection?`,
				{ modal: true },
				"Reconnect",
				"Cancel",
			);

			if (confirm !== "Reconnect") {
				return;
			}

			// Show progress notification
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Reconnecting to MCP service...",
					cancellable: false,
				},
				async (progress) => {
					progress.report({ message: "Resetting connection state..." });

					// Force reconnection
					logger.info("[MCP] User triggered manual reconnection", { previousState: currentState });
					bridge.resetAndRetry();

					// Wait a moment for connection attempt
					await new Promise((resolve) => setTimeout(resolve, 2000));

					const newState = bridge.getState();
					progress.report({ message: `New state: ${newState}` });

					// Telemetry for reconnect routes through daemon
					logger.info("MCP manual reconnect triggered", {
						previousState: currentState,
						newState: newState,
					});
				},
			);

			const finalState = bridge.getState();
			if (finalState === "connected") {
				vscode.window.showInformationMessage("✓ MCP service reconnected.");
			} else if (finalState === "reconnecting") {
				vscode.window.showInformationMessage("MCP service is reconnecting... Check status bar for progress.");
			} else {
				vscode.window.showWarningMessage(
					`MCP service is ${finalState}. Try '🦎 Vreko: MCP Diagnose' for more details.`,
				);
			}
		}),
	);

	// Command: Toggle AI Monitoring
	disposables.push(
		vscode.commands.registerCommand("vreko.toggleAIMonitoring", async () => {
			try {
				// Read current configuration state
				const config = vscode.workspace.getConfiguration("vreko");
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
		vscode.commands.registerCommand("vreko.showAIMonitoringStatus", async () => {
			try {
				const config = vscode.workspace.getConfiguration("vreko");
				const aiDetectionEnabled = config.get<boolean>("aiDetectionEnabled", true);

				vscode.window.showInformationMessage(
					`AI Monitoring is currently ${aiDetectionEnabled ? "enabled" : "disabled"}`,
				);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to get AI monitoring status: ${error}`);
			}
		}),
	);

	// Command: Configure AI Tools (Phase 1 placeholder  -  wired in connective intelligence)
	disposables.push(
		vscode.commands.registerCommand("vreko.configureTools", async () => {
			// Phase 1 placeholder: opens dashboard settings until connective intelligence is wired
			vscode.commands.executeCommand("vreko.openDashboard.settings");
		}),
	);

	return disposables;
}
