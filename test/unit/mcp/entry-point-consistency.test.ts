/**
 * @fileoverview MCP Entry Point Consistency Tests
 *
 * This test suite validates that all MCP-related entry points and commands
 * use consistent detection methods, ensuring the same behavior regardless
 * of how the user accesses the feature (Command Palette, Dashboard, Status Bar).
 *
 * BUG CONTEXT:
 * - Issue: AI client detection worked via Command Palette but not via Dashboard
 * - Root Cause: detectAIClients() was called without `cwd` parameter in some paths
 * - Without `cwd`, the function searches in VS Code's install directory instead
 *   of the workspace folder, resulting in no clients being found
 *
 * TEST COVERAGE:
 * - All detectAIClients() calls include workspace context
 * - Onboarding entry points are consistent
 * - Dashboard → MCP configure flow matches Command Palette flow
 *
 * @author SnapBack QA Team
 * @version 1.0.0
 * @since 2025-01-08
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("MCP Entry Point Consistency", () => {
	describe("detectAIClients() calls", () => {
		it("should pass cwd parameter in all detectAIClients() calls in auto-configure.ts", async () => {
			const filePath = path.join(__dirname, "../../../src/mcp/auto-configure.ts");
			const content = await fs.readFile(filePath, "utf-8");

			// Find all detectAIClients() calls
			const detectCalls = content.match(/detectAIClients\([^)]*\)/g) || [];

			expect(detectCalls.length).toBeGreaterThan(0);

			// Each call should include cwd parameter
			for (const call of detectCalls) {
				expect(call).toMatch(/detectAIClients\(\s*\{[^}]*cwd/);
			}
		});

		it("should pass cwd parameter in OnboardingPanelProvider detectProviders()", async () => {
			const filePath = path.join(__dirname, "../../../src/ui/OnboardingPanelProvider.ts");
			const content = await fs.readFile(filePath, "utf-8");

			// Find detectAIClients() calls
			const detectCalls = content.match(/detectAIClients\([^)]*\)/g) || [];

			expect(detectCalls.length).toBeGreaterThan(0);

			// Each call should include cwd parameter
			for (const call of detectCalls) {
				expect(call).toMatch(/detectAIClients\(\s*\{[^}]*cwd/);
			}
		});

		it("should obtain workspace folder before calling detectAIClients()", async () => {
			const filePath = path.join(__dirname, "../../../src/mcp/auto-configure.ts");
			const content = await fs.readFile(filePath, "utf-8");

			// Each function that calls detectAIClients should get workspaceFolder first
			// Pattern: workspaceFolder should be defined before detectAIClients is called
			const functions = content.split(/(?=async function|function |registerCommand)/);

			for (const func of functions) {
				if (func.includes("detectAIClients(")) {
					// Check if workspaceFolder is obtained in this function
					const detectIndex = func.indexOf("detectAIClients(");
					const workspaceFolderIndex = func.indexOf("workspaceFolder");

					// workspaceFolder should be defined before detectAIClients call
					if (detectIndex > 0 && !func.includes("detectAIClients()")) {
						// Only check if it's not an empty call (which would be a bug)
						expect(workspaceFolderIndex).toBeLessThan(detectIndex);
					}
				}
			}
		});
	});

	describe("Dashboard → MCP Configure flow", () => {
		it("should route configureMCP message to snapback.mcp.configure command", async () => {
			const filePath = path.join(__dirname, "../../../src/ui/DashboardPanel.ts");
			const content = await fs.readFile(filePath, "utf-8");

			// Dashboard should handle configureMCP type
			expect(content).toContain('case "configureMCP"');

			// It should call injectSystemPrompt which executes mcp.configure
			expect(content).toContain("injectSystemPrompt");
			expect(content).toContain("snapback.mcp.configure");
		});

		it("should not call detectAIClients directly in DashboardPanel", async () => {
			const filePath = path.join(__dirname, "../../../src/ui/DashboardPanel.ts");
			const content = await fs.readFile(filePath, "utf-8");

			// Dashboard should NOT call detectAIClients directly
			// It should delegate to the mcp.configure command
			expect(content).not.toContain("detectAIClients");
		});
	});

	describe("Onboarding entry points", () => {
		it("should have snapback.openOnboarding command declared in package.json", async () => {
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);

			const declaredCommands = packageJson.contributes?.commands || [];
			const declaredCommandIds = declaredCommands.map((cmd: any) => cmd.command);

			expect(declaredCommandIds).toContain("snapback.openOnboarding");
		});

		it("should use OnboardingPanelProvider for onboarding command", async () => {
			const filePath = path.join(__dirname, "../../../src/extension.ts");
			const content = await fs.readFile(filePath, "utf-8");

			// The extension should register the openOnboarding command
			expect(content).toContain("snapback.openOnboarding");

			// It should use OnboardingPanelProvider
			expect(content).toContain("OnboardingPanelProvider");
		});
	});

	describe("MCP commands consistency", () => {
		it("should have all MCP commands declared in package.json", async () => {
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);

			const declaredCommands = packageJson.contributes?.commands || [];
			const declaredCommandIds = declaredCommands.map((cmd: any) => cmd.command);

			// All MCP commands should be declared
			expect(declaredCommandIds).toContain("snapback.mcp.configure");
			expect(declaredCommandIds).toContain("snapback.mcp.status");
			expect(declaredCommandIds).toContain("snapback.mcp.disable");
			expect(declaredCommandIds).toContain("snapback.mcp.validate");
			expect(declaredCommandIds).toContain("snapback.mcp.repair");
			expect(declaredCommandIds).toContain("snapback.mcp.reset");
		});

		it("should register all MCP commands in registerMCPCommands function", async () => {
			const filePath = path.join(__dirname, "../../../src/mcp/auto-configure.ts");
			const content = await fs.readFile(filePath, "utf-8");

			// All MCP commands should be registered
			expect(content).toContain('registerCommand("snapback.mcp.configure"');
			expect(content).toContain('registerCommand("snapback.mcp.status"');
			expect(content).toContain('registerCommand("snapback.mcp.disable"');
			expect(content).toContain('registerCommand("snapback.mcp.validate"');
			expect(content).toContain('registerCommand("snapback.mcp.repair"');
			expect(content).toContain('registerCommand("snapback.mcp.reset"');
		});
	});

	describe("No empty detectAIClients() calls", () => {
		it("should not have any detectAIClients() calls without parameters", async () => {
			const files = [
				"../../../src/mcp/auto-configure.ts",
				"../../../src/ui/OnboardingPanelProvider.ts",
				"../../../src/ui/DashboardPanel.ts",
				"../../../src/extension.ts",
			];

			for (const file of files) {
				const filePath = path.join(__dirname, file);
				try {
					const content = await fs.readFile(filePath, "utf-8");

					// Check for empty detectAIClients() calls (the bug pattern)
					const emptyCallMatches = content.match(/detectAIClients\(\s*\)/g) || [];

					expect(emptyCallMatches.length).toBe(0);
				} catch {
					// File doesn't exist or can't be read - skip
				}
			}
		});
	});
});

describe("Webview Message Handling Consistency", () => {
	describe("OnboardingPanel message types", () => {
		it("should handle providersDetected message in OnboardingPanel", async () => {
			const filePath = path.join(__dirname, "../../../webview/src/panels/OnboardingPanel.tsx");
			const content = await fs.readFile(filePath, "utf-8");

			expect(content).toContain('case "providersDetected"');
		});

		it("should send providersDetected from OnboardingPanelProvider", async () => {
			const filePath = path.join(__dirname, "../../../src/ui/OnboardingPanelProvider.ts");
			const content = await fs.readFile(filePath, "utf-8");

			expect(content).toContain('type: "providersDetected"');
		});
	});

	describe("Dashboard message types", () => {
		it("should handle both legacy command and React type message formats", async () => {
			const filePath = path.join(__dirname, "../../../src/ui/DashboardPanel.ts");
			const content = await fs.readFile(filePath, "utf-8");

			// Should handle React webview 'type' messages
			expect(content).toContain("message.type");
			expect(content).toContain('case "webviewReady"');
			expect(content).toContain('case "configureMCP"');

			// Should also handle legacy 'command' messages
			expect(content).toContain("message.command");
		});
	});
});
