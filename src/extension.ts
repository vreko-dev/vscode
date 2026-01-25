/**
 * @fileoverview SnapBack Extension Entry Point - Modular Architecture
 */

process.env.SKIP_ENV_VALIDATION = "1";
process.env.MCP_QUIET = "1";

import { SnapBackEventBus } from "@snapback/contracts";
import * as vscode from "vscode";
import { initializePhase1Services } from "./activation/phase1-services";
import { initializeContextFileManager, initializePhase2Storage } from "./activation/phase2-storage";
import { initializePhase3Managers } from "./activation/phase3-managers";
import { initializePhase4Providers } from "./activation/phase4-providers";
import { initializePhase5Registration } from "./activation/phase5-registration";
import { initializePioneerInfrastructure } from "./activation/pioneer";
import { autoConfigureAgentRules, registerAgentRulesCommands } from "./ai/config";
import { createAuthedApiClient } from "./api/authedApiClient";
import { AnonymousIdManager } from "./auth/AnonymousIdManager";
import { AuthState } from "./auth/AuthState";
import { createCredentialsManager } from "./auth/credentials";
import { EventBridge } from "./bridges/EventBridge";
import { getMCPClient, disposeAllMCPClients } from "./mcp";
import { SignalBridge } from "./bridges/SignalBridge";
import { registerAllCommands } from "./commands/index";
import { ContextManager } from "./contextManager";
import { createRateLimiter } from "./domain/rateLimiter";
import { SaveHandler } from "./handlers/SaveHandler";
import { disposeHeatIntegration, initializeHeatIntegration } from "./heat";
import { AutoDecisionIntegration } from "./integration/AutoDecisionIntegration";
import { autoConfigureMCP, registerMCPCommands } from "./mcp/auto-configure";
import { AIDetectionToast } from "./notifications/AIDetectionToast";
import { initializeHealthMonitor } from "./observability/ActivationHealthMonitor";
import { addBreadcrumb, initSentryExtension } from "./observability/sentry";
import { FileSystemWatcher } from "./protection/FileSystemWatcher";
import { RulesManager } from "./rules/RulesManager";
import { initializeSecureConfig } from "./security/SecureConfigService";
import { NoopAIRiskService } from "./services/aiRiskService";
import { activateLanguageServer, preCacheVitals } from "./services/LanguageClient";
import { TelemetryProxy } from "./services/telemetry-proxy";
import { FeatureFlagService } from "./services/feature-flag-service";
import { UserIdentityService } from "./services/UserIdentityService";
import { createWorkspaceContextManager } from "./services/WorkspaceContextManager";
import { WorkspaceManager } from "./services/WorkspaceManager";
import { initializeActivationFunnel } from "./telemetry/ActivationFunnelIntegration";
import { initializeCoreEventTracker } from "./telemetry/core-event-tracker";
import { SnapBackCodeLensProvider } from "./ui/SnapBackCodeLensProvider";
import { SnapshotRestoreUI } from "./ui/SnapshotRestoreUI";
import { logger } from "./utils/logger";
import { installProcessExitGuard } from "./utils/processGuard";
import { findProjectRoot } from "./utils/projectRoot";
import { WorkspaceFolderResolver } from "./utils/WorkspaceFolderResolver";
import { registerEmptyViews } from "./views/ViewRegistry";
import { ExtensionHost } from "./platform/ExtensionHost";
import { installGlobalErrorHandlers } from "./utils/errorHandlers";
import type { AppContext } from "./activation/AppContext";
import { AuthService } from "./auth/AuthService";

let host: ExtensionHost | null = null;

export function getWorkspaceManager() { return host?.workspaceManager; }
export function getAuthState() { return host?.authState; }
export function getAnonymousIdManager() { return host?.anonymousIdManager; }

export async function activate(context: vscode.ExtensionContext) {
	host = new ExtensionHost(context);
	const startTime = Date.now();

	const outputChannel = vscode.window.createOutputChannel("SnapBack", { log: true });
	host.register(outputChannel);
	logger.getInstance(outputChannel);

	try {
		await initSentryExtension(context);
		addBreadcrumb("Extension activation started", "lifecycle");
	} catch (err) {
		logger.warn("Sentry initialization failed", { err });
	}

	const healthMonitor = initializeHealthMonitor(context);
	host.register(healthMonitor.registerDiagnosticCommand());
	healthMonitor.startActivation();

	registerEmptyViews(context);

	logger.info("Extension activation started");
	outputChannel.appendLine("🚀 SnapBack Extension Activating...");

	installGlobalErrorHandlers();
	installProcessExitGuard();

	const isTestMode = process.env.VSCODE_SNAPSHOT_TEST_MODE === "true" ||
		vscode.workspace.getConfiguration("snapback").get<boolean>("testMode", false);

	await host.initAuthProvider(isTestMode);

	host.featureFlagService = new FeatureFlagService();

	const credentialsManager = createCredentialsManager(context.secrets);
	initializeSecureConfig(context.secrets);

	const workspaceFolderResolver = new WorkspaceFolderResolver(vscode.workspace.workspaceFolders || []);
	host.register(workspaceFolderResolver);

	if (!workspaceFolderResolver.hasWorkspace()) {
		vscode.window.showErrorMessage("SnapBack requires an open workspace folder");
		return;
	}

	let workspaceRoot = workspaceFolderResolver.getAllWorkspaceFolders()[0].uri.fsPath;
	const projectRoot = await findProjectRoot(workspaceRoot);
	if (projectRoot) workspaceRoot = projectRoot;

	const config = vscode.workspace.getConfiguration("snapback");
	RulesManager.getInstance(context).setOfflineMode(config.get<boolean>("offlineMode.enabled", false));

	const eventBus = new SnapBackEventBus();
	const telemetryProxy = new TelemetryProxy(context);

	const appContext: AppContext = {
		context,
		workspaceRoot,
		eventBus,
		telemetryProxy
	};
	host.eventBus = eventBus as any;

	try {
		await eventBus.initialize();
		initializePhase1Services();

		const primaryWorkspaceId = workspaceFolderResolver.getAllWorkspaceFolders()[0]?.uri.toString() || "default";
		setImmediate(() => {
			activateLanguageServer(context)
				.then(() => preCacheVitals(primaryWorkspaceId))
				.catch(err => logger.warn("LSP failed", { err }));
		});

		// Execute Phases with Unified Context
		await initializePhase2Storage(appContext);
		await initializePhase3Managers(appContext);
		await initializePhase4Providers(appContext);

		// Record services in host for global accessors
		host.storage = appContext.storage!;
		host.workspaceManager = appContext.workspaceManager!;
		host.prwManager = appContext.prwManager!;
		host.signalBridge = new SignalBridge({ burstThreshold: 30 });

		host.mcpClient = getMCPClient(primaryWorkspaceId, {
			remoteEndpoint: "https://snapback-mcp.fly.dev",
			localEndpoint: "http://127.0.0.1:3100",
			flushInterval: 5000,
			enableAIDetection: true,
		});
		host.mcpClient.activate(context, host.signalBridge);

		initializeCoreEventTracker(telemetryProxy);
		host.register(new EventBridge({ context, telemetryProxy, eventBus: eventBus as any, useV2Engine: true }));
		host.activationFunnel = initializeActivationFunnel({ context, telemetryProxy });

		const apiBaseUrl = config.get<string>("apiBaseUrl", "https://api.snapback.dev");
		const authService = new AuthService(credentialsManager, apiBaseUrl);
		host.authState = new AuthState(credentialsManager);
		host.anonymousIdManager = new AnonymousIdManager(context.globalState);
		host.userIdentityService = new UserIdentityService(host.anonymousIdManager, authService, telemetryProxy);
		telemetryProxy.setIdentityProvider(() => host!.userIdentityService?.getCurrentId() ?? Promise.resolve("unknown"));

		host.statusBarManager = appContext.statusBarManager!;
		host.aiDetectionToast = new AIDetectionToast();
		host.initEditMonitor();

		host.heatIntegration = initializeHeatIntegration();
		host.register({ dispose: () => disposeHeatIntegration() });

		await initializePhase5Registration(appContext);
		await initializePioneerInfrastructure(context);

		registerMCPCommands(context);
		void autoConfigureMCP(context);
		registerAgentRulesCommands(context);
		void autoConfigureAgentRules(context);

		const workspaceContextManager = createWorkspaceContextManager();
		host.register(workspaceContextManager);

		host.autoDecisionIntegration = new AutoDecisionIntegration(
			appContext.snapshotManager!,
			appContext.notificationManager!,
			workspaceContextManager,
			{
				riskThreshold: config.get<number>("snapback.autoDecision.riskThreshold", 60),
				notifyThreshold: config.get<number>("snapback.autoDecision.notifyThreshold", 40),
				minFilesForBurst: config.get<number>("snapback.autoDecision.minFilesForBurst", 3),
				maxSnapshotsPerMinute: config.get<number>("snapback.autoDecision.maxSnapshotsPerMinute", 4),
			},
			context,
			new NoopAIRiskService(),
			appContext.operationCoordinator!,
			eventBus as any
		);
		host.autoDecisionIntegration.activate();

		const refreshViews = () => {
			appContext.intelligenceTreeProvider?.refresh();
			appContext.snapshotNavigatorProvider?.refresh();
			appContext.snapBackTreeProvider?.refresh();
		};

		registerAllCommands(context, {
			...appContext,
			refreshViews,
			updateFileProtectionContext: async (uri: vscode.Uri) => {
				const isProtected = appContext.protectedFileRegistry!.isProtected(uri.fsPath);
				await vscode.commands.executeCommand("setContext", "snapback.fileProtected", isProtected);
			},
			updateHasProtectedFilesContext: async () => {
				const protectedFiles = await appContext.protectedFileRegistry!.list();
				await vscode.commands.executeCommand("setContext", "snapback.hasProtectedFiles", protectedFiles.length > 0);
			},
			getProtectionStateSummary: async () => {
				const protectedFiles = await appContext.protectedFileRegistry!.list();
				return { state: {}, message: `SnapBack: ${protectedFiles.length} protected files` };
			},
			snapshotRestoreUI: new SnapshotRestoreUI(appContext.operationCoordinator!, appContext.snapshotDocumentProvider!, workspaceRoot),
			codeLensProvider: new SnapBackCodeLensProvider(appContext.protectedFileRegistry!, appContext.operationCoordinator!),
			contextManager: new ContextManager(appContext.protectedFileRegistry!),
			fileWatcher: new FileSystemWatcher(appContext.protectedFileRegistry!),
		} as any);

		await vscode.commands.executeCommand("setContext", "snapback.isActive", true);
		logger.info("SnapBack activated successfully", { duration: Date.now() - startTime });

	} catch (error) {
		logger.error("Activation failed", error as Error);
		throw error;
	}
}

export async function deactivate() {
	if (host) {
		host.dispose();
		host = null;
	}
}
