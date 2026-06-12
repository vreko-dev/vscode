/**
 * Post-Authentication Setup
 *
 * Automatically generates `.vrekorc` config after successful OAuth.
 * Detects workspace technology stacks and applies appropriate protection rules.
 * Initializes `.vreko/` directory structure for learnings, state, and team configs.
 *
 * Runs only on first authentication (skips if .vrekorc already exists).
 * Non-blocking: failures are logged but don't prevent extension activation.
 */

import * as path from "node:path";
import * as vscode from "vscode";
import { initializeWorkspaceDirectory } from "../auth/workspace-id";
import { type ConfigStoreV2, getInitializedConfigStore } from "../config/configStore";
import { detectWorkspaceFrameworks } from "../services/IntelligenceService";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import { logger } from "../utils/logger";

const VREKO_AI_INSTRUCTIONS = `## Vreko Intelligence

Always call \`vreko\` before any coding task. It opens a session and returns
codebase intelligence (fragile files, co-change patterns, past learnings) that
your context window does not have. Without it: no session tracking, no automatic
snapshots, vreko_pulse and vreko_end return empty results.

### Tool Sequence
1. **vreko** \u2190 Always first, before file reads or any other tool
2. [your work tools]
3. **vreko_pulse** \u2190 After 3+ tool calls, when uncertain, before clarifying questions
4. **vreko_learn** \u2190 When user corrects you, or you discover unexpected codebase patterns
5. **vreko_end** \u2190 After task completion, before your final message

### Without vreko
- No session = no automatic snapshots
- No intelligence context = blind to codebase risks
- vreko_pulse and vreko_end return empty results
`;

/**
 * Write CLAUDE.md / .cursor/rules/vreko.mdc / .windsurfrules to the workspace root
 * so LLMs automatically call vreko at the start of every task.
 * Idempotent \u2014 skips if already configured. Non-fatal \u2014 failures are logged only.
 */
async function writeWorkspaceAIInstructions(workspaceRoot: string): Promise<void> {
	const header = "## Vreko Intelligence";
	const targets = [
		{ path: "CLAUDE.md", content: VREKO_AI_INSTRUCTIONS },
		{
			path: ".cursor/rules/vreko.mdc",
			content: `---
description: Vreko intelligence for session tracking and codebase awareness
alwaysApply: true
---

${VREKO_AI_INSTRUCTIONS}`,
		},
		{ path: ".windsurfrules", content: VREKO_AI_INSTRUCTIONS },
	];
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	for (const { path: file, content: fileContent } of targets) {
		const uri = vscode.Uri.file(path.join(workspaceRoot, file));
		try {
			// For Cursor, ensure directory exists
			if (file.startsWith(".cursor/rules/")) {
				const dirUri = vscode.Uri.file(path.join(workspaceRoot, ".cursor", "rules"));
				try {
					await vscode.workspace.fs.createDirectory(dirUri);
				} catch {
					// Directory may already exist
				}
			}

			let existingContent = "";
			try {
				const bytes = await vscode.workspace.fs.readFile(uri);
				existingContent = decoder.decode(bytes);
			} catch {
				// File does not exist yet \u2014 will create
			}

			if (existingContent.includes(header)) {
				continue; // Already configured
			}

			const content = existingContent ? `${existingContent}\n\n${fileContent}` : fileContent;

			await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
			logger.debug(`[PostAuth] Wrote AI instructions to ${file}`);
		} catch (err) {
			logger.warn(`[PostAuth] Could not write ${file}`, err instanceof Error ? err : new Error(String(err)));
		}
	}
}

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
 * Generates `.vrekorc` with stack-detected rules if it doesn't already exist.
 * Uses zero-config defaults if no stacks detected.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @returns void (failures are logged, not thrown)
 */
export async function runPostAuthSetup(workspaceRoot: string, telemetry?: TelemetryProxy): Promise<void> {
	try {
		const rcPath = path.join(workspaceRoot, ".vrekorc");

		// Skip if config already exists
		if (await fileExists(rcPath)) {
			logger.debug("Config file already exists, skipping post-auth setup", { rcPath });
			return;
		}

		logger.info("Running post-authentication setup", { workspaceRoot });

		// 1. Detect workspace frameworks using Intelligence package
		// NOTE: Migrated from local stacks/stackDetection.ts (now uses intelligence package)
		logger.debug("Detecting workspace frameworks...");
		const frameworks = await detectWorkspaceFrameworks();
		logger.info(`Detected ${frameworks.length} frameworks`, {
			frameworks: frameworks.map((f) => f.name).join(", "),
		});

		// Track telemetry for config generation
		if (telemetry) {
			await telemetry.trackEvent("activation_funnel", {
				stage: "config_generated",
				frameworks_detected: frameworks.length,
				framework_names: frameworks.map((f) => f.name),
			});
		}

		// 2. Use security-focused default rules
		// NOTE: Intelligence package handles framework-specific protection internally
		// These defaults cover essential security patterns for all workspaces
		const defaultRules = [
			{ pattern: "*.env*", level: "block" as const, precedence: 100 },
			{ pattern: "**/*.secret*", level: "block" as const, precedence: 100 },
			{ pattern: "**/credentials*", level: "block" as const, precedence: 100 },
			{ pattern: "package*.json", level: "warn" as const, precedence: 50 },
			{ pattern: "**/migrations/*", level: "block" as const, precedence: 100 },
			{ pattern: ".git/**", level: "watch" as const, precedence: 10 },
			// Framework-specific rules (Next.js is most common)
			...(frameworks.some((f) => f.id === "nextjs")
				? [
						{ pattern: "next.config.*", level: "block" as const, precedence: 90 },
						{ pattern: ".env.local", level: "block" as const, precedence: 100 },
					]
				: []),
			// Docker/infrastructure rules (always include as common patterns)
			{ pattern: "docker-compose*.yml", level: "warn" as const, precedence: 70 },
			{ pattern: "Dockerfile", level: "warn" as const, precedence: 70 },
		];

		logger.debug("Protection rules configured", {
			frameworks_detected: frameworks.length,
			total_rules: defaultRules.length,
		});

		// 3. Build config object with proper typing
		const config: ConfigStoreV2 = {
			version: 2,
			protections: defaultRules,
			protectedFiles: [],
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
						baseUrl: "https://api.vreko.dev",
					},
					http: {
						allowedOrigins: ["*"],
						apiUrl: "http://api:8080",
					},
				},
				webBaseUrl: "https://console.vreko.dev",
			},
			policies: {
				enforceProtectionLevels: false,
				allowOverrides: true,
				overrides: [],
			},
		};

		// 4. Write config atomically
		logger.debug("Writing config to .vrekorc...");
		const configStore = getInitializedConfigStore();
		await configStore.saveVrekorc(config);
		logger.info("Config saved successfully", { rcPath });

		// 5. Initialize .vreko directory structure
		logger.debug("Initializing .vreko directory structure...");
		// No bridge available here  -  initialization is deferred to daemon connection
		const directoryInitialized = await initializeWorkspaceDirectory();
		if (directoryInitialized) {
			logger.debug(".vreko directory structure initialized");
		}

		// 6. Write workspace AI instruction files so LLMs auto-call snap_begin
		await writeWorkspaceAIInstructions(workspaceRoot);

		// 7. Notify user
		const frameworkNames = frameworks.length > 0 ? frameworks.map((f) => f.name).join(", ") : "default";
		const message = `🦎 Vreko: Configured for ${frameworkNames} workspace`;

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
