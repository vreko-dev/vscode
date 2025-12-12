/**
 * Post-Authentication Setup
 *
 * Automatically generates `.snapbackrc` config after successful OAuth.
 * Detects workspace technology stacks and applies appropriate protection rules.
 *
 * Runs only on first authentication (skips if .snapbackrc already exists).
 * Non-blocking: failures are logged but don't prevent extension activation.
 */

import * as path from "node:path";
import * as vscode from "vscode";
import { type ConfigStoreV2Type, getInitializedConfigStore } from "../config/configStore";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { detectStacks } from "../stacks/stackDetection";
import { logger } from "../utils/logger";

/**
 * Check if file exists in workspace
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
		return true;
	} catch {
		return false;
	}
}

/**
 * Run post-authentication setup
 *
 * Generates `.snapbackrc` with stack-detected rules if it doesn't already exist.
 * Uses zero-config defaults if no stacks detected.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @returns void (failures are logged, not thrown)
 */
export async function runPostAuthSetup(workspaceRoot: string, telemetry?: TelemetryProxy): Promise<void> {
	try {
		const rcPath = path.join(workspaceRoot, ".snapbackrc");

		// Skip if config already exists
		if (await fileExists(rcPath)) {
			logger.debug("Config file already exists, skipping post-auth setup", { rcPath });
			return;
		}

		logger.info("Running post-authentication setup", { workspaceRoot });

		// 1. Detect workspace stacks
		logger.debug("Detecting workspace stacks...");
		const stacks = await detectStacks(workspaceRoot);
		logger.info(`Detected ${stacks.length} stacks`, {
			stacks: stacks.map((s) => s.name).join(", "),
		});

		// Track telemetry for config generation
		if (telemetry) {
			await telemetry.trackEvent("activation_funnel", {
				stage: "config_generated",
				stacks_detected: stacks.length,
				stack_names: stacks.map((s) => s.name),
			});
		}

		// 2. Collect rules from detected stacks and ensure they have precedence
		const detectedRules = stacks.flatMap((s) => s.rules);
		const rulesWithPrecedence = detectedRules.map((rule) => ({
			...rule,
			// Stack rules may not have precedence, default to 50
			precedence: "precedence" in rule ? (rule as any).precedence : 50,
		}));

		// Use detected rules, or fallback to security defaults if none detected
		// Note: fallback rules need to match ProtectionRuleSchema (includes precedence)
		const fallbackRules = [
			{ pattern: "*.env*", level: "block" as const, precedence: 100 },
			{ pattern: "**/*.secret*", level: "block" as const, precedence: 100 },
			{ pattern: "**/credentials*", level: "block" as const, precedence: 100 },
			{ pattern: "package*.json", level: "warn" as const, precedence: 50 },
			{ pattern: "**/migrations/*", level: "block" as const, precedence: 100 },
			{ pattern: ".git/**", level: "watch" as const, precedence: 10 },
		];
		const finalRules = rulesWithPrecedence.length > 0 ? rulesWithPrecedence : fallbackRules;

		logger.debug("Protection rules collected", {
			from_detected_stacks: detectedRules.length,
			from_defaults: finalRules.length - detectedRules.length,
			total: finalRules.length,
		});

		// 3. Build config object with proper typing
		const config: ConfigStoreV2Type = {
			version: 2,
			protections: finalRules,
			ignore: ["node_modules/**", ".git/**", "dist/**", "build/**", ".next/**", "__pycache__/**", "*.log"],
			engine: {
				maxDepth: 2,
				burstThreshold: 30,
				cooldowns: {
					block: 60000,
					warn: 30000,
					watch: 0,
				},
			},
			settings: {
				defaultProtectionLevel: "watch" as const,
				requireSnapshotMessage: true,
				maxSnapshots: 100,
				aiDetectionEnabled: true,
				autoRestoreOnDetection: false,
				privacy: {
					consent: true, // User just authenticated
					clipboard: false,
					watcher: false,
					gitWrapper: false,
				},
				notifications: {
					enabled: true,
					quietHours: { start: "22:00", end: "08:00" },
					rateLimit: 5,
				},
				snapshots: {
					enabled: true,
					autoCreate: true,
					retentionDays: 30,
				},
				ai: {
					enabled: true,
					context: true,
					copilot: true,
				},
				guardian: {
					enabled: true,
					warnThreshold: 5,
					blockThreshold: 8,
					protectionLevel: "warn" as const,
					plugins: {
						secretDetection: true,
						mockReplacement: true,
						phantomDependency: true,
					},
					thresholds: {
						warn: 6,
						block: 8,
					},
				},
				autoDecision: {
					riskThreshold: 60,
					notifyThreshold: 40,
					minFilesForBurst: 3,
					maxSnapshotsPerMinute: 4,
				},
				mcp: {
					performanceBudgets: { analyze_risk: 200, create_snapshot: 500 },
					context7: {
						apiUrl: "https://context7.com/api",
						cacheTtlSearch: 3600,
						cacheTtlDocs: 86400,
					},
					api: {
						baseUrl: "https://api.snapback.dev",
					},
					http: {
						allowedOrigins: ["*"],
						apiUrl: "http://api:8080",
					},
				},
				webBaseUrl: "https://app.snapback.dev",
			},
			policies: {
				enforceProtectionLevels: false,
				allowOverrides: true,
				overrides: [],
			},
		};

		// 4. Write config atomically
		logger.debug("Writing config to .snapbackrc...");
		const configStore = getInitializedConfigStore();
		await configStore.saveSnapbackrc(config);
		logger.info("Config saved successfully", { rcPath });

		// 5. Notify user
		const stackNames = stacks.length > 0 ? stacks.map((s) => s.name).join(", ") : "default";
		const message = `SnapBack configured for ${stackNames} workspace`;

		vscode.window.showInformationMessage(message, "View Config").then(
			(selection) => {
				if (selection === "View Config") {
					vscode.workspace.openTextDocument(rcPath).then((doc) => {
						vscode.window.showTextDocument(doc);
					});
				}
			},
			(error) => {
				logger.error("Failed to show notification", error);
			},
		);
	} catch (error) {
		// Log error but don't throw - post-auth setup is not critical
		logger.error("Post-authentication setup failed", error instanceof Error ? error : new Error(String(error)));
	}
}
