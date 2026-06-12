/**
 * @fileoverview Vreko Extension Entry Point - Modular Architecture
 */

process.env.SKIP_ENV_VALIDATION = "1";
process.env.MCP_QUIET = "1";

import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import * as vscode from "vscode";
import type { AppContext } from "./activation/AppContext";
import { initializePhase2Storage } from "./activation/phase2-storage";
import { initializePhase3Managers } from "./activation/phase3-managers";
import { initializePhase4aCriticalUI } from "./activation/phase4a-critical-ui";
import { initializePhase4bDeferredUI } from "./activation/phase4b-deferred-ui";
import { initializePhase5Registration } from "./activation/phase5-registration";
import { autoConfigureAgentRules, registerAgentRulesCommands } from "./ai/config";
import { AnonymousIdManager } from "./auth/AnonymousIdManager";
import { AuthState } from "./auth/AuthState";
import { createCredentialsManager } from "./auth/credentials";
import { EventBridge } from "./bridges/EventBridge";
import { SignalBridge } from "./bridges/SignalBridge";
import { registerAllCommands, registerCriticalCommands } from "./commands/index";
import { isValidCommandContext } from "./commands/types";
import { LocalEventBus } from "./events";
import { disposeHeatIntegration, initializeHeatIntegration } from "./heat";
import { autoConfigureMCP, registerMCPCommands } from "./mcp/auto-configure";
import { AIDetectionToast } from "./notifications/AIDetectionToast";
import { addBreadcrumb, initSentryExtension } from "./observability/sentry";
import { ExtensionHost } from "./platform/ExtensionHost";
import { FileSystemWatcher } from "./protection/FileSystemWatcher";
import { RulesManager } from "./rules/RulesManager";
import { initializeSecureConfig } from "./security/SecureConfigService";
import { migrateSettingsPrefix } from "./services/migration-service.js";
import { RecoveryService } from "./services/recovery";
import { TelemetryProxy } from "./services/telemetry-proxy";
import { UserIdentityService } from "./services/UserIdentityService";
import { initializeSignalSystem } from "./signals/integration";
import { SetupGateMonitor } from "./signals/SetupGateMonitor";
import { initializeActivationFunnel } from "./telemetry/ActivationFunnelIntegration";
import { initializeCoreEventTracker } from "./telemetry/core-event-tracker";
import { ActivityLog } from "./ui/ActivityLog";
import { FragilityGutterDecorationProvider } from "./ui/decorations/FragilityGutterDecorationProvider";
import { VrekoDecorationProvider } from "./ui/decorations/VrekoDecorationProvider";
import { FragileFileCodeLensProvider } from "./ui/FragileFileCodeLensProvider";
import { ProgressIndicator } from "./ui/ProgressIndicator";
import { SnapshotRestoreUI } from "./ui/SnapshotRestoreUI";
import type { StatusWebViewProvider } from "./ui/StatusWebViewProvider";
import { RecoveryTreeProvider } from "./ui/tree/RecoveryTreeProvider";
import { withTimeout } from "./utils/degraded-state";
import { installGlobalErrorHandlers } from "./utils/errorHandlers";
import { logger } from "./utils/logger";
import { installProcessExitGuard } from "./utils/processGuard";
import { findProjectRoot } from "./utils/projectRoot";
import { WorkspaceFolderResolver } from "./utils/WorkspaceFolderResolver";

let host: ExtensionHost | null = null;

// Activation guard  -  prevents double-activation on window reload / extension-host restart (Issue #7)
let _isActivating = false;
let _activationComplete = false;

export function getWorkspaceManager() {
	return host?.workspaceManager;
}
export function getAuthState() {
	return host?.authState;
}
export function getAnonymousIdManager() {
	return host?.anonymousIdManager;
}

async function resolveUserPath(): Promise<string> {
	if (process.platform === "win32") {
		return process.env.PATH ?? "";
	}

	try {
		const shell = process.env.SHELL || "/bin/zsh";
		const execFileAsync = promisify(execFile);
		const { stdout } = await execFileAsync(shell, ["-ilc", "echo $PATH"], {
			timeout: 3000,
			env: { ...process.env },
		});
		const result = stdout.trim();

		if (result && result.length > 0) {
			return result;
		}
	} catch {
		// Fallback below
	}

	const commonPaths = [
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/local/sbin",
		`${process.env.HOME}/.nvm/versions/node`,
		`${process.env.HOME}/.volta/bin`,
		`${process.env.HOME}/.fnm/aliases/default/bin`,
		`${process.env.HOME}/.local/bin`,
	].filter((p) => {
		try {
			return fs.existsSync(p);
		} catch {
			return false;
		}
	});

	return [process.env.PATH, ...commonPaths].filter(Boolean).join(":");
}

export async function activate(context: vscode.ExtensionContext) {
	if (process.platform !== "win32") {
		const resolvedPath = await resolveUserPath();
		process.env.PATH = resolvedPath;
	}

	// Double-activation guard: VS Code may call activate() twice on window reload
	// or extension-host restart during development. Both paths are silent no-ops.
	if (_isActivating) {
		logger.warn("[Vreko] activate() called while already activating – ignoring duplicate call");
		return;
	}
	if (_activationComplete) {
		logger.warn("[Vreko] activate() called after activation is complete – ignoring duplicate call");
		return;
	}
	_isActivating = true;

	try {
		host = new ExtensionHost(context);
		const startTime = Date.now();

		const outputChannel = vscode.window.createOutputChannel("Vreko", { log: true });
		host.register(outputChannel);
		logger.getInstance(outputChannel);

		try {
			await initSentryExtension(context);
			addBreadcrumb("Extension activation started", "lifecycle");
		} catch (err) {
			logger.warn("Sentry initialization failed", { err });
		}

		// One-time settings migration: vreko.* → vreko.* (runs silently if no old settings)
		await migrateSettingsPrefix(context);

		// SB-264: Register critical commands early so they're available even if phases fail
		const criticalCommandDisposables = registerCriticalCommands(context);
		// host is guaranteed to be initialized at line 68
		criticalCommandDisposables.forEach((d) => host?.register(d));

		// registerEmptyViews intentionally disabled  -  sidebar views are not registered
		// in this release (status bar only). Re-enable if views are added back to package.json.
		// registerEmptyViews(context);

		logger.info("Extension activation started");
		outputChannel.appendLine("🚀 Vreko Extension Activating...");

		installGlobalErrorHandlers();
		installProcessExitGuard();

		const _isTestMode =
			process.env.VSCODE_SNAPSHOT_TEST_MODE === "true" ||
			vscode.workspace.getConfiguration("vreko").get<boolean>("testMode", false);

		await Promise.resolve(); // Alpha: no auth provider to initialize

		const credentialsManager = createCredentialsManager(context.secrets);
		initializeSecureConfig(context.secrets);

		const workspaceFolderResolver = new WorkspaceFolderResolver(vscode.workspace.workspaceFolders || []);
		host.register(workspaceFolderResolver);

		if (!workspaceFolderResolver.hasWorkspace()) {
			vscode.window.showErrorMessage("🦎 Vreko: Requires an open workspace folder");
			return;
		}

		const firstFolder = workspaceFolderResolver.getAllWorkspaceFolders()[0];
		if (!firstFolder) {
			vscode.window.showErrorMessage("🦎 Vreko: Unable to resolve workspace folder");
			return;
		}

		// CRITICAL: fsPath can be undefined for non-file URIs (remote workspaces, virtual documents)
		// This is the root cause of "The 'path' argument must be of type string. Received undefined"
		const workspaceRoot = firstFolder.uri.fsPath;
		if (!workspaceRoot || typeof workspaceRoot !== "string" || workspaceRoot.trim() === "") {
			const uriScheme = firstFolder.uri.scheme;
			vscode.window.showErrorMessage(
				`Vreko requires a local file-based workspace. Current workspace scheme: '${uriScheme}'. ` +
					"Remote workspaces (SSH, WSL, Dev Containers) are not yet supported.",
			);
			return;
		}

		const projectRoot = await findProjectRoot(workspaceRoot);
		const resolvedWorkspaceRoot = projectRoot || workspaceRoot;

		const config = vscode.workspace.getConfiguration("vreko");
		RulesManager.getInstance(context).setOfflineMode(config.get<boolean>("offlineMode.enabled", false));

		const eventBus = new LocalEventBus();
		const telemetryProxy = new TelemetryProxy(context);

		const appContext: AppContext = {
			context,
			workspaceRoot: resolvedWorkspaceRoot,
			eventBus,
			telemetryProxy,
			// Wire authState early so Phase 3 can select RemoteAIRiskService for authenticated users.
			// credentialsManager is available here (created at line ~127), before any phase runs.
			authState: new AuthState(credentialsManager),
		};
		host.eventBus = eventBus as unknown as typeof host.eventBus;

		// =============================================================================
		// ACTIVATION PHASES OVERVIEW (SB-273)
		// =============================================================================
		//
		// The extension activation is structured in phases to ensure reliable startup
		// and graceful degradation when components fail. Each phase has a 5-second
		// timeout to prevent indefinite hangs.
		//
		// Phase 2: Storage (initializePhase2Storage)
		//   - Initialize storage manager and file registries
		//   - Critical for snapshot functionality
		//
		// Phase 3: Managers (initializePhase3Managers)
		//   - Initialize operation coordinator, snapshot manager
		//   - Critical for core functionality
		//
		// Phase 4a: Critical UI (initializePhase4aCriticalUI)
		//   - Status bar, notification manager
		//   - User-facing components that must be available
		//
		// Phase 5: Registration (initializePhase5Registration)
		//   - Register all VS Code commands and providers
		//   - Must succeed for extension to be functional
		//
		// NON-CRITICAL (deferred to setImmediate):
		//   - LSP activation
		//   - MCP client setup
		//   - Phase 4b: Deferred UI (tree providers, decorations)
		//   - Pioneer infrastructure
		//
		// FAILURE HANDLING:
		//   - Critical zone failure: Extension activation aborts
		//   - Non-critical failure: Logged, extension continues in degraded mode
		//   - Timeouts tracked via telemetry (activation.phase_timeout event)
		//
		// =============================================================================

		// SB-266: Restructure activation into critical/non-critical zones
		// CRITICAL ZONE: Must succeed for basic extension functionality
		// If critical zone fails, extension activation fails completely
		let _criticalZoneSuccess = false;
		try {
			await eventBus.initialize();

			const _primaryWorkspaceId =
				workspaceFolderResolver.getAllWorkspaceFolders()[0]?.uri.toString() || "default";

			// Execute Phases with Unified Context (with timeout protection)
			// P2 Fix: Prevent indefinite hangs during activation
			const PHASE_TIMEOUT = 5000; // 5 seconds per phase

			// SB-268: Add post-timeout guards for withTimeout calls
			// SB-269: Track activation timeouts for telemetry
			// FIX: Check for `!== true` instead of `=== undefined` since phase functions now return Promise<true>
			const phase2Result = await withTimeout(initializePhase2Storage(appContext), {
				timeout: PHASE_TIMEOUT,
				component: "storage",
				reason: "Phase 2 (Storage) initialization timed out",
			});
			if (phase2Result !== true) {
				logger.warn("Phase 2 (Storage) failed to initialize - continuing in degraded mode");
				telemetryProxy.trackEvent("activation.phase_timeout", {
					phase: "phase2_storage",
					timeout_ms: PHASE_TIMEOUT,
					degraded_mode: true,
				});
			}

			const phase3Result = await withTimeout(initializePhase3Managers(appContext), {
				timeout: PHASE_TIMEOUT,
				component: "snapshot_service",
				reason: "Phase 3 (Managers) initialization timed out",
			});
			if (phase3Result !== true) {
				logger.warn("Phase 3 (Managers) failed to initialize - continuing in degraded mode");
				telemetryProxy.trackEvent("activation.phase_timeout", {
					phase: "phase3_managers",
					timeout_ms: PHASE_TIMEOUT,
					degraded_mode: true,
				});
			}

			// Initialize Signal Communication System v2.0 BEFORE Phase 4a
			// This ensures StatusFlagManager is available for UI components
			// This wires SignalState, StatusFlagManager, and FileDecorationProvider
			const signalSystem = initializeSignalSystem(context, appContext.daemonBridge);
			host.signalSystem = signalSystem;
			appContext.statusFlagManager = signalSystem.coordinator.getFlagManager();
			host.statusFlagManager = appContext.statusFlagManager;

			// Wire SetupGateMonitor  -  evaluates CLI/daemon/auth/workspace/MCP gates
			if (appContext.daemonBridge && appContext.statusFlagManager) {
				const setupGateMonitor = new SetupGateMonitor(
					appContext.statusFlagManager,
					appContext.daemonBridge,
					context,
				);
				setupGateMonitor.activate();
				context.subscriptions.push(setupGateMonitor);
			}

			// Set global accessor for phase wiring
			(globalThis as { vrekoHost?: typeof host }).vrekoHost = host;

			initializeCoreEventTracker(telemetryProxy);
			host.register(
				new EventBridge({
					context,
					telemetryProxy,
					eventBus: eventBus as unknown as NonNullable<typeof host.eventBus>,
					useV2Engine: true,
				}),
			);
			host.activationFunnel = initializeActivationFunnel({ context, telemetryProxy });

			// Phase 4a: Critical UI components (status bar, MCP status) - BLOCKING
			const phase4aResult = await withTimeout(initializePhase4aCriticalUI(appContext), {
				timeout: PHASE_TIMEOUT,
				component: "critical_ui",
				reason: "Phase 4a (Critical UI) initialization timed out",
			});
			if (phase4aResult !== true) {
				logger.warn("Phase 4a (Critical UI) failed to initialize - continuing in degraded mode");
				telemetryProxy.trackEvent("activation.phase_timeout", {
					phase: "phase4a_critical_ui",
					timeout_ms: PHASE_TIMEOUT,
					degraded_mode: true,
				});
			}

			// Record services in host for global accessors
			// Only storage is truly critical for core functionality
			// workspaceManager and prwManager are optional (nullable) - used for enhanced features
			if (!appContext.storage) {
				throw new Error("Critical service failed to initialize: storage. Cannot continue activation.");
			}
			host.storage = appContext.storage;
			host.workspaceManager = appContext.workspaceManager ?? null;
			host.prwManager = appContext.prwManager ?? null;
			host.signalBridge = new SignalBridge({ burstThreshold: 30 });

			host.authState = new AuthState(credentialsManager);
			host.anonymousIdManager = new AnonymousIdManager(context.globalState);
			host.userIdentityService = new UserIdentityService(host.anonymousIdManager, telemetryProxy);
			telemetryProxy.setIdentityProvider(
				() => host?.userIdentityService?.getCurrentId() ?? Promise.resolve("unknown"),
			);

			// statusFlagManager is already set from signalSystem initialization above
			host.aiDetectionToast = new AIDetectionToast();
			host.initEditMonitor();

			// Wire auth state changes to StatusFlagManager for account display
			const authSessionDisposable = vscode.workspace.onDidChangeConfiguration(async (e) => {
				if (e.affectsConfiguration("vreko")) {
					try {
						const creds = await credentialsManager.getCredentials();
						const statusFlagManager = host?.statusFlagManager;
						if (creds && statusFlagManager) {
							statusFlagManager.updateUserInfo({
								username: "alpha user",
								subscriptionTier: "free",
							});
						} else if (statusFlagManager) {
							statusFlagManager.updateUserInfo(undefined);
						}
					} catch (err) {
						logger.debug("Failed to update user info on config change", { err });
					}
				}
			});
			context.subscriptions.push(authSessionDisposable);

			// Initial user info fetch (if already logged in via API key)
			try {
				const creds = await credentialsManager.getCredentials();
				const statusFlagManager = host?.statusFlagManager;
				if (creds && statusFlagManager) {
					statusFlagManager.updateUserInfo({
						username: "alpha user",
						subscriptionTier: "free",
					});
				}
			} catch (err) {
				logger.debug("Failed to fetch initial user info", { err });
			}

			host.heatIntegration = initializeHeatIntegration();
			host.register({ dispose: () => disposeHeatIntegration() });

			await initializePhase5Registration(appContext);

			// Wire StatusWebViewProvider to SignalState changes for MCP-initiated sessions
			// This ensures the status webview updates immediately when sessions start/end via MCP tools
			// Phase 5 creates StatusWebViewProvider, so this wiring must happen AFTER initializePhase5Registration
			const statusWebViewProvider = (
				globalThis as { vrekoHost?: { statusWebViewProvider?: StatusWebViewProvider } }
			).vrekoHost?.statusWebViewProvider;
			if (statusWebViewProvider && signalSystem?.coordinator) {
				const signalState = signalSystem.coordinator.getState();
				const stateChangeDisposable = signalState.onChanged(() => {
					statusWebViewProvider.updateState();
				});
				context.subscriptions.push(stateChangeDisposable);
				logger.debug("Wired StatusWebViewProvider to SignalState changes");
			}

			// Wire agents.workspace.json file watcher → Behavioral Intelligence status card
			if (statusWebViewProvider) {
				host.initAgentsWorkspaceWatcher(statusWebViewProvider);
				logger.debug("Wired agents.workspace.json file watcher to StatusWebViewProvider");
			}

			// Critical zone completed successfully
			_criticalZoneSuccess = true;
			logger.info("Extension critical zone initialized successfully");
		} catch (error) {
			// Critical zone failure - extension cannot function
			logger.error("Critical zone initialization failed - extension activation aborted", error as Error);
			void vscode.window.showErrorMessage(
				"Vreko failed to initialize. Please reload the window or check the logs.",
			);
			return;
		}

		// NON-CRITICAL ZONE: Can fail gracefully, extension continues with reduced functionality
		// All code below this line is wrapped in try-catch to ensure failures don't break activation
		try {
			// Task #14: Defer Phase 4b (non-critical UI) to setImmediate
			// Tree providers, decorations, and heavy UI components run AFTER activation
			setImmediate(() => {
				initializePhase4bDeferredUI(appContext).catch((err) => {
					logger.error("Phase 4b (Deferred UI) failed", err);
				});
			});

			registerMCPCommands(context);
			void autoConfigureMCP(context);
			registerAgentRulesCommands(context);
			void autoConfigureAgentRules(context);

			const refreshViews = () => {
				appContext.treeProvider?.refresh();
				appContext.snapshotNavigatorProvider?.refresh();
			};

			// SB-270: Build CommandContext with proper type safety
			// Validate required properties are present before constructing
			if (!appContext.protectedFileRegistry || !appContext.operationCoordinator) {
				throw new Error("Required services not initialized for command registration");
			}

			// SB-271: Create fileWatcher and register for disposal
			const fileWatcher = new FileSystemWatcher(appContext.protectedFileRegistry);
			context.subscriptions.push(fileWatcher);

			// Initialize RecoveryService if storage and daemonBridge are available
			const recoveryService =
				appContext.storage && appContext.daemonBridge
					? new RecoveryService(appContext.storage, appContext.daemonBridge, resolvedWorkspaceRoot)
					: undefined;
			if (recoveryService) {
				context.subscriptions.push({ dispose: () => recoveryService.dispose() });
			}

			// Initialize RecoveryTreeProvider if RecoveryService is available
			const recoveryTreeProvider = recoveryService ? new RecoveryTreeProvider(recoveryService) : undefined;
			if (recoveryTreeProvider) {
				appContext.recoveryTreeProvider = recoveryTreeProvider;
			}

			const commandContext = {
				// Core services from appContext (with non-null assertions validated above)
				protectedFileRegistry: appContext.protectedFileRegistry,
				operationCoordinator: appContext.operationCoordinator,
				snapshotManager: appContext.snapshotManager!,
				workflowIntegration: appContext.workflowIntegration!,
				notificationCoordinator: appContext.notificationCoordinator!,
				workspaceMemoryManager: appContext.workspaceMemoryManager!,
				conflictResolver: appContext.conflictResolver!,
				protectionService: appContext.protectionService,

				// Providers
				snapshotDocumentProvider: appContext.snapshotDocumentProvider!,
				protectionDecorationProvider: appContext.protectionDecorationProvider!,
				fileHealthDecorationProvider: appContext.fileHealthDecorationProvider!,
				snapshotRestoreUI: new SnapshotRestoreUI(
					appContext.operationCoordinator,
					appContext.snapshotDocumentProvider!,
					resolvedWorkspaceRoot,
				),
				snapshotSummaryProvider: appContext.snapshotSummaryProvider!,

				// Configuration
				configManager: appContext.configManager!,
				fileWatcher,
				vrekorcLoader: appContext.vrekorcLoader!,

				// cooldownIndicator not in AppContext - omit for now

				// Daemon bridge
				daemonBridge: appContext.daemonBridge!,

				// Recovery services (optional)
				recoveryService,
				recoveryTreeProvider,

				// Utility functions
				refreshViews,
				updateFileProtectionContext: async (uri: vscode.Uri) => {
					const isProtected = appContext.protectedFileRegistry?.isProtected(uri.fsPath);
					await vscode.commands.executeCommand("setContext", "vreko.fileProtected", isProtected);
				},
				updateHasProtectedFilesContext: async () => {
					const protectedFiles = await appContext.protectedFileRegistry?.list();
					await vscode.commands.executeCommand(
						"setContext",
						"vreko.hasProtectedFiles",
						(protectedFiles?.length ?? 0) > 0,
					);
				},
				getProtectionStateSummary: async () => {
					const protectedFiles = await appContext.protectedFileRegistry?.list();
					return { state: {}, message: `${protectedFiles?.length ?? 0} protected files` };
				},

				// Storage
				storage: appContext.storage!,

				// Event bus
				eventBus: appContext.eventBus,

				// MCP Tools
				mcpToolsService: appContext.mcpToolsService,

				// Workspace
				workspaceManager: appContext.workspaceManager,
				workspaceRoot: resolvedWorkspaceRoot,
			};

			// Validate the constructed context before passing to registerAllCommands
			if (!isValidCommandContext(commandContext)) {
				logger.error("CommandContext validation failed - absolute minimum properties are missing");
				// Debug: log which properties are missing
				const ctx = commandContext as Record<string, unknown>;
				const absoluteMinimum = [
					"protectedFileRegistry",
					"operationCoordinator",
					"snapshotManager",
					"workspaceRoot",
				];
				const missing = absoluteMinimum.filter((prop) => ctx[prop] === undefined || ctx[prop] === null);
				logger.error(`Missing or null minimum properties: ${missing.join(", ")}`);
				throw new Error("CommandContext validation failed");
			}

			const commandDisposables = registerAllCommands(context, commandContext);
			commandDisposables.forEach((d) => context.subscriptions.push(d));

			// =========================================================================
			// AMBIENT-07: Ambient UI providers
			// =========================================================================
			if (appContext.daemonBridge) {
				const vrekoDecorationProvider = new VrekoDecorationProvider(appContext.daemonBridge);
				context.subscriptions.push(
					vscode.window.registerFileDecorationProvider(vrekoDecorationProvider),
					vrekoDecorationProvider,
				);

				const fragileFileCodeLensProvider = new FragileFileCodeLensProvider(
					appContext.daemonBridge,
					context.globalState,
				);
				context.subscriptions.push(
					vscode.languages.registerCodeLensProvider({ scheme: "file" }, fragileFileCodeLensProvider),
					fragileFileCodeLensProvider,
				);

				// Subscribe to mcp.tool-called to flash agent_active status flag
				if (appContext.statusFlagManager) {
					const statusFlagManager = appContext.statusFlagManager;
					context.subscriptions.push(
						appContext.daemonBridge.onMcpToolCalled(() => {
							if (vscode.workspace.getConfiguration("vreko.ui").get("statusBarEnabled", true)) {
								statusFlagManager.setFlag("agent_active");
							}
						}),
					);
				}

				// Activity log for daemon events
				const activityLog = new ActivityLog();
				context.subscriptions.push(activityLog);
				context.subscriptions.push(
					appContext.daemonBridge.onSessionStarted(() => activityLog.log("session.started")),
					appContext.daemonBridge.onSessionEnded(() => activityLog.log("session.ended")),
					appContext.daemonBridge.onMcpToolCalled((e) => activityLog.log("mcp.tool-called", e.toolName)),
					appContext.daemonBridge.onMcpFileModified((e) => activityLog.log("mcp.file-modified", e.filePath)),
					// VSUI-06: observation taxonomy events
					appContext.daemonBridge.onLearningAdded(() => activityLog.log("learning.added")),
					appContext.daemonBridge.onSnapshotCreated((e) => activityLog.log("snapshot.created", e.snapshotId)),
					appContext.daemonBridge.onRiskUpdated((e) => activityLog.log("risk.updated", e.filePath)),
				);

				// Progress indicator for session lifecycle
				const progressIndicator = new ProgressIndicator();
				context.subscriptions.push(
					appContext.daemonBridge.onSessionStarted(() => progressIndicator.onSessionStarted()),
					appContext.daemonBridge.onSessionEnded(() => progressIndicator.onSessionEnding()),
				);

				// VSUI-08: Fragility gutter decorations  -  overview ruler per file fragility score
				const fragDecoProvider = new FragilityGutterDecorationProvider(appContext.daemonBridge);
				context.subscriptions.push(fragDecoProvider);
			}

			// AMBIENT-08: Vreko Live panel  -  lazy-loaded, never auto-opens by default
			const daemonBridgeRef = appContext.daemonBridge ?? null;
			context.subscriptions.push(
				vscode.commands.registerCommand("vreko.openLive", async () => {
					const { VrekoLivePanel } = await import("./webview/VrekoLivePanel.js");
					VrekoLivePanel.createOrReveal(context.extensionUri, daemonBridgeRef);
				}),
				vscode.commands.registerCommand("vreko.showFileHistory", (_uri?: vscode.Uri) => {
					void vscode.commands.executeCommand("vreko.openLive");
				}),
				// AMBIENT-07 (ceremony): Show Closing Ceremony panel on demand
				vscode.commands.registerCommand("vreko.showCeremony", async () => {
					if (appContext.ceremonyWebViewProvider) {
						appContext.ceremonyWebViewProvider.show();
					} else {
						const { CeremonyWebViewProvider: CeremonyProvider } = await import(
							"./webview/CeremonyWebViewProvider.js"
						);
						new CeremonyProvider(context.extensionUri, appContext.daemonBridge ?? null).show();
					}
				}),
			);

			// Wire liveWebviewAutoOpen guard  -  fires once when session starts
			if (appContext.daemonBridge) {
				context.subscriptions.push(
					appContext.daemonBridge.onSessionStarted(() => {
						const autoOpen = vscode.workspace
							.getConfiguration("vreko.ui")
							.get("liveWebviewAutoOpen", false);
						if (autoOpen) {
							void vscode.commands.executeCommand("vreko.openLive");
						}
					}),
				);
			}

			// Wire ceremonyAutoOpen guard  -  fires when session ends
			if (appContext.daemonBridge) {
				context.subscriptions.push(
					appContext.daemonBridge.onSessionEnded((_event) => {
						const autoOpen = vscode.workspace.getConfiguration("vreko.ui").get("ceremonyAutoOpen", false);
						if (autoOpen) {
							void vscode.commands.executeCommand("vreko.showCeremony");
						}
					}),
				);
			}

			await vscode.commands.executeCommand("setContext", "vreko.isActive", true);
			const elapsed = Date.now() - startTime;
			if (elapsed > 500) {
				logger.warn(`[Vreko] Activation took ${elapsed}ms  -  exceeds 500ms budget`, { elapsed });
			}
			logger.info("Vreko activated successfully", { duration: elapsed });
		} catch (error) {
			logger.error("Activation failed", error as Error);
			throw error;
		}
	} finally {
		_activationComplete = true;
		_isActivating = false;
	}
}

/**
 * Extension deactivation cleanup (SB-274)
 *
 * DISPOSAL PATTERN:
 * VS Code automatically disposes all context.subscriptions entries.
 * Additional cleanup needed for:
 * - Host-level services not in context.subscriptions
 * - Singleton instances with external resources
 * - Event listeners on global objects
 *
 * All components pushed to context.subscriptions during activation
 * are automatically cleaned up by VS Code - no manual disposal needed.
 */
export async function deactivate() {
	// Stop RulesManager polling
	try {
		RulesManager.getInstance().stopPolling();
	} catch (_error) {
		// Ignore if RulesManager was never initialized
	}

	// Dispose FeedbackManager singleton
	try {
		const { FeedbackManager } = await import("./engine/FeedbackManager");
		FeedbackManager.getInstance().dispose();
	} catch (_error) {
		// Ignore if FeedbackManager was never initialized
	}

	if (host) {
		host.dispose();
		host = null;
	}
}
