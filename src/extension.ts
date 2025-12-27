/**
 * @fileoverview SnapBack Extension Entry Point - Modular Architecture
 *
 * This module serves as the primary entry point for the SnapBack VS Code extension,
 * implementing a modular architecture with clear separation of concerns.
 *
 * @author SnapBack Architecture Team
 * @version 1.0.0
 */

// 🔇 MUST be first: Suppress console.error logs from shared packages (config store, etc.)
// These packages check MCP_QUIET at module load time, so this must run before imports.
// This prevents confusing ERR entries in dev console from MCP-compatible packages.
process.env.MCP_QUIET = "1";

// Import real EventBus from @snapback/contracts (consolidated from @snapback/events)
import { SnapBackEvent, SnapBackEventBus } from "@snapback/contracts";
import * as vscode from "vscode";
import { initializePhase1Services } from "./activation/phase1-services";
import { initializePhase2Storage } from "./activation/phase2-storage";
import { initializePhase3Managers } from "./activation/phase3-managers";
import { initializePhase4Providers } from "./activation/phase4-providers";
import { initializePhase5Registration } from "./activation/phase5-registration";
import { initializePioneerInfrastructure } from "./activation/pioneer"; // 🆕 Import Pioneer Initialization
import { createAuthedApiClient } from "./api/authedApiClient";
import { AnonymousIdManager } from "./auth/AnonymousIdManager";
import { AuthState } from "./auth/AuthState";
import { createCredentialsManager } from "./auth/credentials";
import { EventBridge } from "./bridges/EventBridge";
import { MCPBridge } from "./bridges/MCPBridge"; // 🆕 Import MCPBridge for pair programming
import { SignalBridge } from "./bridges/SignalBridge";
import { registerDiffCommands } from "./commands/diffCommands"; // 🆕 Import diff commands
// SnapBackOAuthProvider is now used by UnifiedAuthProvider internally
import { registerAllCommands } from "./commands/index";
import { initializeProtectionNotifications } from "./commands/protectionCommands";
import { ContextManager } from "./contextManager";
import { FileHealthDecorationProvider } from "./decorations/FileHealthDecorationProvider"; // 🆕 Import FileHealthDecorationProvider
import { createPRWManager, type PRWManager } from "./domain/prwManager";
import { createRateLimiter } from "./domain/rateLimiter";
import { FeedbackManager } from "./engine/FeedbackManager";
import { SaveHandler } from "./handlers/SaveHandler";
import { AutoDecisionIntegration } from "./integration/AutoDecisionIntegration"; // 🆕 Import AutoDecisionIntegration
import { autoConfigureMCP, registerMCPCommands } from "./mcp/auto-configure"; // 🆕 Import MCP auto-configure
import { FileSystemWatcher } from "./protection/FileSystemWatcher";
import { SnapshotContentProvider } from "./providers/SnapshotContentProvider"; // 🆕 Import SnapshotContentProvider
import { RulesManager } from "./rules/RulesManager";
import { initializeSecureConfig } from "./security/SecureConfigService"; // 🆕 Import SecureConfigService
import { NoopAIRiskService, RemoteAIRiskService } from "./services/aiRiskService";
import { ApiClient } from "./services/api-client";
import { FeatureFlagService } from "./services/feature-flag-service"; // 🆕 Import FeatureFlagService
import { TelemetryProxy } from "./services/telemetry-proxy";
import { UserIdentityService } from "./services/UserIdentityService";
import { createWorkspaceContextManager } from "./services/WorkspaceContextManager"; // 🆕 Import WorkspaceContextManager
import { WorkspaceManager } from "./services/WorkspaceManager"; // 🆕 Import WorkspaceManager
import type { IStorageManager } from "./storage/types.js";
import { disposeActivationFunnel, initializeActivationFunnel } from "./telemetry/ActivationFunnelIntegration"; // 🆕 Activation funnel tracking
import type { ProtectionChangedPayload } from "./types/api";
import { CooldownIndicator } from "./ui/cooldownIndicator"; // 🆕 Import CooldownIndicator
import { SnapBackCodeLensProvider } from "./ui/SnapBackCodeLensProvider";
import { SnapshotRestoreUI } from "./ui/SnapshotRestoreUI";
import type { StatusBarManager } from "./ui/StatusBarManager"; // 🆕 Import Vitals StatusBar type
import { VitalsIntegration } from "./ui/VitalsIntegration"; // 🆕 Import Vitals Integration
import { logger } from "./utils/logger";
import { findProjectRoot } from "./utils/projectRoot";
import { WorkspaceFolderResolver } from "./utils/WorkspaceFolderResolver"; // 🆕 Import WorkspaceFolderResolver
import { registerEmptyViews, showErrorInViews } from "./views/ViewRegistry";
import { WelcomePanel } from "./welcome/WelcomePanel"; // 🆕 Fallback for 3rd party IDEs

// 🆕 IntelligenceService imported dynamically after process.exit guard (see deactivate function)

// Import the new EventBus and feature flag

// Global reference to storage for cleanup during deactivation
let storage: IStorageManager | null = null;
// Global reference to event bus for cleanup during deactivation
let eventBus: InstanceType<typeof SnapBackEventBus> | null = null;
// 🆕 Global reference to feature flag service
let featureFlagService: FeatureFlagService | null = null;
// 🆕 Global reference to workspace manager for multi-root support
let workspaceManager: WorkspaceManager | null = null;
// 🆕 Global reference to auth state for user authentication checks
let authState: AuthState | null = null;
// 🆕 Global reference to anonymous ID manager
let anonymousIdManager: AnonymousIdManager | null = null;
// 🆕 Global reference to AutoDecisionIntegration
let autoDecisionIntegration: AutoDecisionIntegration | null = null;
// 🆕 Global reference to UserIdentityService
let userIdentityService: UserIdentityService | null = null;
// 🆕 Global reference to activation funnel
let activationFunnelIntegration: ReturnType<typeof initializeActivationFunnel> | null = null;
// 🆕 Global reference to PRWManager for PRE/POST checkpoint coordination
let prwManager: PRWManager | null = null;
// 🆕 Global reference to SignalBridge for AI paste/burst detection
let signalBridge: SignalBridge | null = null;
// 🆕 Global reference to MCPBridge for pair programming observations
let mcpBridge: MCPBridge | null = null;
// 🆕 Global reference to EventBridge for V2 engine telemetry
let eventBridge: EventBridge | null = null;
// 🆕 Global reference to Vitals StatusBar
let vitalsStatusBar: StatusBarManager | null = null;
let vitalsIntegration: VitalsIntegration | null = null;
let vitalsUpdateInterval: NodeJS.Timeout | null = null;

// 🆕 Global reference to refresh views function
let refreshViews = () => {};

// (Removed unused credentialsManagerGetter)

export async function activate(context: vscode.ExtensionContext) {
	const startTime = Date.now();
	const phaseTimings: Record<string, number> = {};

	// Initialize LogOutputChannel and logger (uses native log levels - no more ERR in dev console)
	const outputChannel = vscode.window.createOutputChannel("SnapBack", { log: true });
	context.subscriptions.push(outputChannel);
	logger.getInstance(outputChannel);

	// 🛡️ Defensive Registration: Register views immediately so UI is never empty
	registerEmptyViews(context);

	logger.info("Extension activation started");
	outputChannel.appendLine("🚀 SnapBack Extension Activating...");
	outputChannel.appendLine("[PERF] Measuring activation phases...");

	// 🛡️ CRITICAL: Install global error handlers to prevent process.exit()
	// These handlers catch unhandled promise rejections and uncaught exceptions
	// that could otherwise trigger process.exit() and crash the extension
	//
	// NOTE: These handlers catch ALL errors in the extension host, including from other extensions.
	// We filter by stack trace to only log/show errors that originate from SnapBack code.
	const isSnapBackError = (stack: string | undefined): boolean => {
		if (!stack) return false;
		// Check if error originates from SnapBack extension code
		return stack.includes("/snapback/") || stack.includes("\\snapback\\") || stack.includes("@snapback");
	};

	process.on("unhandledRejection", (reason, promise) => {
		const errorMessage = reason instanceof Error ? reason.message : String(reason);
		const errorStack = reason instanceof Error ? reason.stack : undefined;
		const error = reason instanceof Error ? reason : new Error(String(reason));

		// Only log and notify for SnapBack errors - ignore errors from other extensions
		if (!isSnapBackError(errorStack)) {
			// Silently ignore errors from other extensions to avoid polluting our logs
			return;
		}

		logger.error("CRITICAL: Unhandled Promise Rejection during activation", error, {
			promise: String(promise),
			errorMessage,
			errorStack,
		});

		// DO NOT call process.exit() - log and attempt recovery
		vscode.window.showErrorMessage(
			"SnapBack encountered an unexpected error during activation. Some features may be unavailable. Check Output → SnapBack for details.",
		);
	});

	process.on("uncaughtException", (error) => {
		// Only log and notify for SnapBack errors - ignore errors from other extensions
		if (!isSnapBackError(error.stack)) {
			// Silently ignore errors from other extensions
			return;
		}

		logger.error("CRITICAL: Uncaught Exception during activation", error, {
			errorName: error.name,
		});

		// DO NOT call process.exit() - log and attempt recovery
		vscode.window.showErrorMessage(
			"SnapBack encountered a critical error. Extension may be unstable. Please reload VS Code.",
		);
	});

	// 🛡️ CRITICAL: Install process.exit() guard to prevent accidental crashes
	// This guard prevents the extension from crashing when bundled code (like CLI modules)
	// attempts to call process.exit(). Instead of exiting or throwing, we silently log and return.
	// This is necessary because some dependencies may call process.exit() as part of their
	// normal error handling, but in the VS Code extension context, this would crash the host.
	function preventProcessExit() {
		process.exit = ((code?: number) => {
			const stack = new Error().stack;
			logger.warn("BLOCKED: process.exit() call prevented", {
				exitCode: code,
				stack: stack?.split("\n").slice(0, 3).join("\n"), // First 3 stack frames
			});
			// Return without exiting or throwing - just log and continue
			return undefined as never;
		}) as typeof process.exit;

		logger.info("process.exit() guard installed - extension is protected from unexpected exits");
	}

	// Install the guard immediately after error handlers
	preventProcessExit();

	// 🔐 UNIFIED AUTH PROVIDER (Proxy Pattern)
	// Registers ONCE with VS Code, delegates to Real or Mock based on test mode.
	// This solves the "Provider Locking" limitation where VS Code doesn't allow
	// re-registering providers with the same ID.

	// 1. SYNCHRONOUS CHECK: Determine test mode BEFORE constructing the provider
	// This eliminates the race condition where provider defaults to Real mode
	const isTestMode =
		process.env.VSCODE_SNAPSHOT_TEST_MODE === "true" ||
		vscode.workspace.getConfiguration("snapback").get<boolean>("testMode", false);

	logger.debug(`Activation: Initializing with Test Mode = ${isTestMode}`);
	logger.info(`Extension activation: isTestMode = ${isTestMode}`);

	// 2. Construct provider WITH the correct mode immediately
	const { UnifiedAuthProvider } = await import("./auth/UnifiedAuthProvider");
	const authProvider = new UnifiedAuthProvider(context, isTestMode);

	// 3. Register the unified provider (claims 'snapback' ID permanently)
	context.subscriptions.push(
		vscode.authentication.registerAuthenticationProvider("snapback", "SnapBack Auth", authProvider, {
			supportsMultipleAccounts: false,
		}),
	);
	logger.info("UnifiedAuthProvider registered");

	if (isTestMode) {
		logger.info("⚠️ RUNNING IN TEST MODE: Using MockAuthProvider delegate");
	}

	// 🆕 REACTIVE TEST MODE LISTENER
	// When 'snapback.testMode' changes, swap the auth delegate dynamically.
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("snapback.testMode")) {
				const configTestMode = vscode.workspace.getConfiguration("snapback").get<boolean>("testMode", false);
				logger.debug(`Config changed: testMode = ${configTestMode}, calling setTestMode...`);
				authProvider.setTestMode(configTestMode);
				logger.debug("setTestMode completed");
			}
		}),
	);

	// 🛠️ TEST HOOK: Explicitly force the provider mode from tests
	// This bypasses config listeners and provides synchronous control
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.__setTestMode", async (enable: boolean) => {
			logger.debug(`COMMAND: snapback.__setTestMode called with ${enable}`);
			authProvider.setTestMode(enable);
			return { success: true, mode: enable ? "MOCK" : "REAL" };
		}),
	);

	// 🆕 Initialize feature flag service
	featureFlagService = new FeatureFlagService();

	// 🆕 Check if this is the first time the extension is installed
	const hasBeenInstalled = context.globalState.get<boolean>("snapback.installed", false);
	if (!hasBeenInstalled) {
		// Mark as installed
		await context.globalState.update("snapback.installed", true);

		// Get extension ID dynamically to support VS Code forks (Cursor, Qoder, etc.)
		const extensionId = context.extension.id;
		const extensionVersion = context.extension.packageJSON.version || "unknown";

		// Track extension installation
		try {
			// Send installation event through telemetry proxy
			const telemetryProxy = new TelemetryProxy(context);
			await telemetryProxy.trackEvent("extension_installed", {
				extensionVersion,
				vscodeVersion: vscode.version,
				platform: process.platform,
				install_source: "marketplace", // Default to marketplace
			});
		} catch (error) {
			logger.error("Failed to track extension installation", error as Error);
		}

		// 🆕 Show welcome walkthrough on first install (after a short delay for UI to settle)
		setTimeout(async () => {
			try {
				// Try to open the native walkthrough (may not be available in all VS Code forks)
				await vscode.commands.executeCommand(
					"workbench.action.openWalkthrough",
					`${extensionId}#snapback.welcome`,
					false, // Don't open in new editor group
				);
				logger.info("Welcome walkthrough opened for first-time user", { extensionId });
			} catch (error) {
				// Walkthrough not supported in this VS Code fork - show WelcomePanel instead
				logger.warn("Native walkthrough not available, showing WelcomePanel fallback", {
					extensionId,
					error: error instanceof Error ? error.message : String(error),
				});

				// Fallback: Show custom WelcomePanel webview
				WelcomePanel.createOrShow(context.extensionUri);
			}
		}, 1500); // Small delay to let extension fully activate
	}

	// 🆕 Initialize CredentialsManager early
	const credentialsManager = createCredentialsManager(context.secrets);

	// 🆕 Initialize SecureConfigService for API key migration
	initializeSecureConfig(context.secrets);
	logger.info("SecureConfigService initialized");

	// 🔗 Register URI Handler for authentication deep links (early in activation)
	// This must be registered before async operations so deep links work even if extension is activating
	try {
		const { AuthUriHandler } = await import("./auth/AuthUriHandler");
		const authUriHandler = new AuthUriHandler(
			credentialsManager,
			vscode.workspace.getConfiguration("snapback").get<string>("apiBaseUrl", "https://api.snapback.dev"),
			outputChannel,
		);
		context.subscriptions.push(vscode.window.registerUriHandler(authUriHandler));
		logger.info("AuthUriHandler registered for deep links");
	} catch (error) {
		logger.error("Failed to register AuthUriHandler", error as Error);
	}

	// 🆕 Initialize WorkspaceFolderResolver for early workspace verification
	// This is lightweight and doesn't require storage
	const workspaceFolderResolver = new WorkspaceFolderResolver(vscode.workspace.workspaceFolders || []);
	context.subscriptions.push(workspaceFolderResolver);

	// Verify at least one workspace exists
	if (!workspaceFolderResolver.hasWorkspace()) {
		const errorMsg = "SnapBack requires an open workspace folder";
		vscode.window.showErrorMessage(errorMsg);
		throw new Error(errorMsg);
	}

	// For backward compatibility with existing phase initialization functions,
	// we get a single workspace root. In multi-root scenarios, this will be
	// the first workspace (sorted by depth).
	const workspaceFolders = workspaceFolderResolver.getAllWorkspaceFolders();

	// 🛡️ DEFENSIVE: Double-check workspaceFolders is not empty
	// This should never happen due to hasWorkspace() check above, but add guard for safety
	if (workspaceFolders.length === 0) {
		const errorMsg = "SnapBack requires an open workspace folder (workspaceFolders empty)";
		vscode.window.showErrorMessage(errorMsg);
		throw new Error(errorMsg);
	}

	let workspaceRoot = workspaceFolders[0].uri.fsPath;

	// Try to find the actual project root if we're in a subdirectory
	// Non-blocking async operation
	const projectRoot = await findProjectRoot(workspaceRoot);
	if (projectRoot && projectRoot !== workspaceRoot) {
		logger.info("Detected project root different from workspace root", {
			workspaceRoot,
			projectRoot,
		});
		workspaceRoot = projectRoot;
	}

	// Log workspace information
	if (workspaceFolderResolver.hasMultipleWorkspaces()) {
		logger.info(`Multi-root workspace detected: ${workspaceFolderResolver.getWorkspaceCount()} folders`);
		logger.info(`Primary workspace: ${workspaceRoot}`);
	}

	// Check workspace trust
	const isWorkspaceTrusted = vscode.workspace.isTrusted;
	if (!isWorkspaceTrusted) {
		logger.warn("Workspace is not trusted - SnapBack is running in limited mode");
		// Show warning asynchronously after activation completes (non-blocking)
		// This prevents extension startup from waiting for user interaction
		void showDeferredWorkspaceTrustWarning(context);
		// Continue activation but features will be limited
	}

	// Check if offline mode is enabled
	const config = vscode.workspace.getConfiguration("snapback");
	const offlineModeEnabled = config.get<boolean>("offlineMode.enabled", false);

	// Initialize RulesManager with offline mode setting
	const rulesManager = RulesManager.getInstance(context);
	rulesManager.setOfflineMode(offlineModeEnabled);

	// If offline mode is enabled, show a notification asynchronously
	if (offlineModeEnabled) {
		setTimeout(() => vscode.window.showInformationMessage("SnapBack is running in offline mode"), 100);
	}

	try {
		// Initialize event bus with EventEmitter2
		eventBus = new SnapBackEventBus();
		try {
			await eventBus.initialize();
			logger.info("EventEmitter2 event bus initialized");
		} catch (err) {
			logger.error("Failed to initialize EventEmitter2 event bus", err as Error);
		}

		// Phase 1: Core services
		const phase1Start = Date.now();
		initializePhase1Services();
		phaseTimings["Phase 1 (Services)"] = Date.now() - phase1Start;

		// Phase 2: Storage and configuration (fail-fast if unavailable)
		const phase2Start = Date.now();
		const phase2Result = await initializePhase2Storage(workspaceRoot, context, eventBus); // GREEN: Pass eventBus
		phaseTimings["Phase 2 (Storage)"] = Date.now() - phase2Start;
		storage = phase2Result.storage;

		// 🆕 Initialize WorkspaceManager now that context is available
		// This provides workspace-aware operations for commands and services
		workspaceManager = new WorkspaceManager(vscode.workspace.workspaceFolders || [], context);
		logger.info("WorkspaceManager initialized");

		// 🆕 Create cooldown indicator
		const cooldownIndicator = new CooldownIndicator(phase2Result.protectedFileRegistry);
		context.subscriptions.push(cooldownIndicator);

		// 🆕 Initialize PRWManager for PRE/POST checkpoint coordination
		// This enables automatic PRE checkpoints on save bursts
		const prwRateLimiter = createRateLimiter(4, 60000); // 4 snapshots per minute
		prwManager = createPRWManager({
			snapshotStore: phase2Result.storage.getPRWSnapshotStore(),
			rateLimiter: prwRateLimiter,
		});
		context.subscriptions.push({
			dispose: () => {
				prwManager?.dispose();
				prwManager = null;
			},
		});
		logger.info("PRWManager initialized for PRE/POST checkpoint coordination");

		// 🆕 Initialize SignalBridge for AI paste/burst detection (V2 engine only)
		signalBridge = new SignalBridge({ burstThreshold: 30 });

		// Subscribe to document changes for burst detection
		context.subscriptions.push(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (!signalBridge) return;

				// Compute burst state
				const burstState = signalBridge.computeBurst(e.document, e.contentChanges);

				if (burstState.detected && burstState.velocity) {
					// On burst detected → create PRE checkpoint
					const riskScore = Math.min(100, Math.round(burstState.velocity * 10));
					void prwManager?.handleSave(burstState.filePath!, riskScore);
					logger.debug("SignalBridge triggered PRE checkpoint", {
						filePath: burstState.filePath,
						riskScore,
						velocity: burstState.velocity,
					});

					// 🐛 FIX: Trigger FeedbackManager on burst detection
					try {
						const feedbackManager = FeedbackManager.getInstance();
						const detectionId = `burst-${Date.now()}-${burstState.filePath?.split("/").pop()}`;
						const confidence = Math.min(1, burstState.velocity / 100);
						feedbackManager.handleDetection(detectionId, confidence);
						logger.debug("FeedbackManager triggered from SignalBridge", {
							detectionId,
							confidence,
							velocity: burstState.velocity,
						});
					} catch (error) {
						logger.warn("Failed to trigger FeedbackManager from SignalBridge", {
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				// Detect AI tool usage
				const aiResult = signalBridge.detectAI(e.document, e.contentChanges);
				if (aiResult.tool) {
					logger.debug("AI tool detected", {
						tool: aiResult.tool,
						confidence: aiResult.confidence,
						method: aiResult.method,
					});

					// 🆕 Trigger status bar activity sequence for AI detection
					// Note: statusBarManager wired after Phase 4 initialization
					if (vitalsStatusBar) {
						void vitalsStatusBar.showAIDetectedSequence(aiResult.tool);
					}
				}

				// 🆕 Trigger status bar activity sequence for burst detection
				if (burstState.detected && vitalsStatusBar) {
					void vitalsStatusBar.showBurstDetectedSequence();
				}
			}),
		);

		logger.info("SignalBridge initialized (V2 engine)");

		// 🆕 Initialize MCPBridge for pair programming observations
		// Pushes file changes and observations to MCP server for composite tools
		mcpBridge = new MCPBridge({
			mcpEndpoint: "http://127.0.0.1:3100",
			flushInterval: 5000,
			enableAIDetection: true,
		});
		mcpBridge.activate(context, signalBridge ?? undefined);
		context.subscriptions.push({
			dispose: () => {
				mcpBridge?.dispose();
				mcpBridge = null;
			},
		});
		logger.info("MCPBridge initialized for pair programming");

		// Phase 3: Business logic managers
		const phase3Start = Date.now();
		const telemetryProxy = new TelemetryProxy(context); // Ensure telemetryProxy is defined here

		// 🆕 Initialize EventBridge for V2 engine telemetry mapping
		// This routes engine events to PostHog with PII scrubbing
		eventBridge = new EventBridge({
			context,
			telemetryProxy,
			eventBus,
			useV2Engine: true, // Explicitly enable V2 engine events
		});
		context.subscriptions.push(eventBridge);
		logger.info("EventBridge initialized for V2 engine telemetry");

		// 🆕 Initialize ActivationFunnelIntegration for funnel tracking (P0-3)
		activationFunnelIntegration = initializeActivationFunnel({
			context,
			telemetryProxy,
		});

		// Track first install if this is a new installation
		if (!context.globalState.get<boolean>("snapback.funnelInstallTracked", false)) {
			activationFunnelIntegration.trackInstalled();
			void context.globalState.update("snapback.funnelInstallTracked", true);
		}

		logger.info("ActivationFunnelIntegration initialized");

		const phase3Result = await initializePhase3Managers(
			context,
			workspaceRoot,
			phase2Result.storage,
			telemetryProxy, // Pass telemetryProxy here
			phase2Result.protectedFileRegistry,
			phase2Result.snapbackrcLoader, // 🟢 TDD GREEN: Pass for ProtectionService
			eventBus, // GREEN PHASE: Pass event bus for SNAPSHOT_CREATED publishing
		);
		phaseTimings["Phase 3 (Managers)"] = Date.now() - phase3Start;

		// Note: SignalBridge doesn't have setOnBurstEnd() callback like V1 BurstDetector.
		// POST checkpoint creation now happens in the onDidChangeTextDocument listener above.
		// Session tracking is handled by PRWManager.onBurstEnd() internally.
		logger.info("SignalBridge wired with SessionCoordinator tracking");

		// Initialize additional components that were missing
		const fileHealthDecorationProvider = new FileHealthDecorationProvider();

		// Phase 2 Slice 4: Initialize AIRiskService
		const guardianEnabled = config.get<boolean>("snapback.guardian.enabled", true);
		const aiRiskService = guardianEnabled
			? new RemoteAIRiskService(new ApiClient(), config)
			: new NoopAIRiskService();

		logger.info("AI Risk Service initialized", {
			enabled: guardianEnabled,
			type: guardianEnabled ? "RemoteAIRiskService" : "NoopAIRiskService",
		});

		const saveHandler = new SaveHandler(
			phase2Result.protectedFileRegistry,
			phase3Result.operationCoordinator,
			fileHealthDecorationProvider,
			aiRiskService,
			phase3Result.milestoneService,
		);
		saveHandler.register(context);

		/**
		 * Initialize SDK ProtectionDecisionEngine for centralized protection decisions.
		 * Per arch_remediation.md Task 1.3: SDK owns the "whether" decisions.
		 */
		try {
			const { ProtectionDecisionEngine } = await import("@snapback/sdk");
			const decisionEngine = new ProtectionDecisionEngine(phase2Result.sdkProtectionManager);
			saveHandler.initializeDecisionEngine(decisionEngine);
			logger.info("SDK ProtectionDecisionEngine initialized successfully");
		} catch (error) {
			logger.warn("Failed to initialize SDK ProtectionDecisionEngine, using legacy decisions", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		// 🆕 Check if file health decorations are enabled
		const showFileHealthDecorations = config.get<boolean>("showFileHealthDecorations", true);
		if (showFileHealthDecorations) {
			// 🆕 Register file health decoration provider only if enabled
			context.subscriptions.push(fileHealthDecorationProvider);
			vscode.window.registerFileDecorationProvider(fileHealthDecorationProvider);
		}

		// Create file watcher
		const fileWatcher = new FileSystemWatcher(phase2Result.protectedFileRegistry);
		context.subscriptions.push(fileWatcher);

		// Phase 4: UI providers
		const phase4Start = Date.now();
		// credentialsManager is already initialized
		const apiClient = createAuthedApiClient(context);

		// 🆕 Initialize AuthState (authentication status checker)
		authState = new AuthState(credentialsManager);
		logger.info("AuthState initialized");

		// 🆕 Initialize AnonymousIdManager (anonymous user tracking)
		anonymousIdManager = new AnonymousIdManager(context.globalState);
		logger.info("AnonymousIdManager initialized");

		// 🆕 Initialize UserIdentityService
		// Requires AuthService (from apiClient? No, create separate AuthService if needed or reuse apiClient's internal one?)
		// Wait, `apiClient` manages auth internally or uses `AuthService`?
		// `createAuthedApiClient` uses `AuthService` internally but doesn't expose it.
		// We need to construct `AuthService` here to pass to `UserIdentityService`.
		// `AuthService` needs `CredentialsManager`.
		const authService = new (await import("./auth/AuthService.js")).AuthService(
			credentialsManager,
			config.get<string>("apiBaseUrl", "https://api.snapback.dev"),
		);

		userIdentityService = new UserIdentityService(anonymousIdManager, authService, telemetryProxy);
		// Configure TelemetryProxy to use UserIdentityService
		telemetryProxy.setIdentityProvider(() => userIdentityService?.getCurrentId() ?? Promise.resolve("unknown"));
		logger.info("UserIdentityService initialized");

		// 🔒 AUTH LISTENER (moved here - userIdentityService now guaranteed to exist)
		// Listen for session changes to track when user successfully authenticates
		context.subscriptions.push(
			vscode.authentication.onDidChangeSessions(async (e) => {
				logger.info(`📨 Extension: Heard Auth Change for provider: ${e.provider.id}`);

				if (e.provider.id === "snapback") {
					// Check if we have a valid session
					const sessions = await vscode.authentication.getSession("snapback", [], { createIfNone: false });
					logger.info(`👤 Extension: Current Session: ${sessions ? sessions.account.label : "None"}`);

					if (sessions) {
						if (!userIdentityService) {
							logger.error("userIdentityService not initialized during auth callback");
							return;
						}
						await userIdentityService.handleLogin(sessions.account.id);

						// 🆕 Track auth completion in activation funnel (P0-3)
						if (activationFunnelIntegration) {
							activationFunnelIntegration.trackAuthCompleted("vscode");
						}

						// Track auth event via telemetry proxy
						await telemetryProxy.trackEvent("activation_funnel", {
							stage: "auth_completed",
							provider: "vscode",
						});

						// Update global state
						await context.globalState.update("snapback.hasAuthenticated", true);

						// Sync credentials for test mode
						const isTestMode =
							process.env.VSCODE_SNAPSHOT_TEST_MODE === "true" ||
							vscode.workspace.getConfiguration("snapback").get<boolean>("testMode", false);

						logger.info(`🔧 Extension: isTestMode = ${isTestMode}`);

						if (isTestMode) {
							await credentialsManager.setCredentials({
								accessToken: sessions.accessToken,
								refreshToken: "mock-refresh-token",
								expiresAt: Date.now() + 3600 * 1000,
								user: {
									id: sessions.account.id,
									email: sessions.account.label,
									name: sessions.account.label,
								},
							});
							logger.info("✅ Synced mock credentials to CredentialsManager");
						}

						// Refresh views to show authenticated state
						logger.info("🔄 Extension: Triggering View Refresh...");
						refreshViews();
						logger.info("✅ Extension: View Refresh triggered");
					} else {
						logger.info("⚠️ Extension: No active session");
					}
				}
			}),
		);

		const phase4Result = await initializePhase4Providers(
			context,
			phase3Result,
			phase2Result.storage,
			phase2Result.protectedFileRegistry,
			workspaceRoot,
			apiClient,
			credentialsManager,
		);
		phaseTimings["Phase 4 (Providers)"] = Date.now() - phase4Start;

		// Phase 5: Registration
		const phase5Start = Date.now();
		await initializePhase5Registration(context, phase4Result, phase3Result.sessionCoordinator);
		phaseTimings["Phase 5 (Registration)"] = Date.now() - phase5Start;

		// 🆕 Pioneer Infrastructure
		const pioneerStart = Date.now();
		await initializePioneerInfrastructure(context);
		phaseTimings["Pioneer Infrastructure"] = Date.now() - pioneerStart;

		// 🆕 MCP Auto-Configuration (detects AI assistants and offers to configure)
		const mcpStart = Date.now();
		registerMCPCommands(context);
		// Run auto-configure asynchronously to not block activation
		void autoConfigureMCP(context).catch((err) => {
			logger.warn("MCP auto-configure failed (non-blocking)", {
				error: err instanceof Error ? err.message : String(err),
			});
		});
		phaseTimings["MCP Configuration"] = Date.now() - mcpStart;

		// 🆕 Phase 14: Initialize WorkspaceContextManager (fixes Antipattern #2)
		const workspaceContextManager = createWorkspaceContextManager();
		context.subscriptions.push(workspaceContextManager);
		logger.info("WorkspaceContextManager initialized");

		// 🆕 Phase 14: Initialize AutoDecisionIntegration (session-level AI protection)
		// FIX: Pass OperationCoordinator to enable proper event bus integration for UI refresh
		const phase14Start = Date.now();
		autoDecisionIntegration = new AutoDecisionIntegration(
			phase3Result.snapshotManager,
			phase3Result.notificationManager,
			workspaceContextManager, // Pass WorkspaceContextManager for dynamic workspace resolution
			{
				riskThreshold: config.get<number>("snapback.autoDecision.riskThreshold", 60),
				notifyThreshold: config.get<number>("snapback.autoDecision.notifyThreshold", 40),
				minFilesForBurst: config.get<number>("snapback.autoDecision.minFilesForBurst", 3),
				maxSnapshotsPerMinute: config.get<number>("snapback.autoDecision.maxSnapshotsPerMinute", 4),
			},
			context, // Pass context for globalState storage persistence
			aiRiskService, // GREEN: Pass AIRiskService for risk assessment
			phase3Result.operationCoordinator, // 🔧 FIX: Wire OperationCoordinator for UI refresh
			eventBus ?? undefined, // 🔧 FIX: Wire EventBus for vitals pressure reset on all snapshots
		);
		autoDecisionIntegration.activate();
		context.subscriptions.push({
			dispose: () => autoDecisionIntegration?.deactivate(),
		});
		phaseTimings["Phase 14 (AutoDecision)"] = Date.now() - phase14Start;
		// AutoDecisionIntegration.activate() already logs activation message
		if (offlineModeEnabled) {
			// Removed: StatusBarController no longer used - protection status shown in Activity Bar only
		}

		// 🆕 Phase 15: Initialize Onboarding & Progressive Disclosure
		const phase15Start = Date.now();
		try {
			const { UserExperienceService } = await import("./services/UserExperienceService");
			const { ProgressiveDisclosureController } = await import("./ui/ProgressiveDisclosureController");
			const { OnboardingProgression } = await import("./onboardingProgression");

			// Initialize user experience tracking
			const userExperienceService = new UserExperienceService(context);

			// Initialize progressive disclosure (shows hints to beginners, hides advanced features)
			const progressiveDisclosure = new ProgressiveDisclosureController(context, userExperienceService);
			context.subscriptions.push(progressiveDisclosure);

			// Initialize onboarding progression tracking
			const onboardingProgression = new OnboardingProgression(context.globalState);

			// Track first activation
			onboardingProgression.initialize();

			logger.info("Onboarding & Progressive Disclosure initialized", {
				experienceLevel: await userExperienceService.getExperienceLevel(),
				onboardingPhase: onboardingProgression.getCurrentPhase(),
			});
		} catch (error) {
			logger.warn("Failed to initialize onboarding services (non-critical)", { error });
		}
		phaseTimings["Phase 15 (Onboarding)"] = Date.now() - phase15Start;

		// 🆕 Phase 16: Initialize Vitals StatusBar (power user feature)
		const phase16Start = Date.now();
		try {
			// Use StatusBarManager from Phase 4 (avoid creating duplicate)
			vitalsStatusBar = phase4Result.statusBarManager;

			// Create VitalsIntegration bridge for power user vitals display
			vitalsIntegration = new VitalsIntegration(vitalsStatusBar);

			// Read vitals display setting from configuration (default: enabled)
			const vitalsEnabled = config.get<boolean>("snapback.vitals.showInStatusBar", true);
			vitalsIntegration.setVitalsEnabled(vitalsEnabled);

			// Get UnifiedDataService singleton for vitals data flow
			const unifiedDataService = phase4Result.vitalsUIIntegration.getDataService();

			// Set up periodic vitals update with telemetry tracking
			if (autoDecisionIntegration) {
				const workspaceVitals = autoDecisionIntegration.getVitals();
				let lastTrajectory: string | null = null;

				vitalsUpdateInterval = setInterval(() => {
					if (vitalsIntegration && workspaceVitals) {
						const snapshot = workspaceVitals.current();

						// 🆕 Wire vitals to UnifiedDataService (feeds VitalsUIIntegration)
						unifiedDataService.updateVitals(snapshot);

						// Also update power user vitals display
						vitalsIntegration.onVitalsSnapshot(snapshot);

						// Track trajectory changes for telemetry (privacy-safe: no file content)
						if (lastTrajectory !== null && lastTrajectory !== snapshot.trajectory) {
							telemetryProxy.trackEvent("vitals_trajectory_changed", {
								from: lastTrajectory,
								to: snapshot.trajectory,
								pulseLevel: snapshot.pulse.level,
								tempLevel: snapshot.temperature.level,
								pressure: snapshot.pressure.value,
								oxygen: snapshot.oxygen.value,
							});

							// 🆕 Trigger status bar activity sequence when vitals are degrading
							if (
								(snapshot.trajectory === "escalating" || snapshot.trajectory === "critical") &&
								(lastTrajectory === "stable" || lastTrajectory === "recovering")
							) {
								void vitalsStatusBar?.showVitalsDegradingSequence();
							}

							// Track critical state separately for alerting
							if (snapshot.trajectory === "critical") {
								telemetryProxy.trackEvent("vitals_critical_state", {
									pressure: snapshot.pressure.value,
									oxygen: snapshot.oxygen.value,
									tempLevel: snapshot.temperature.level,
									unsnapshotedChanges: snapshot.pressure.unsnapshotedChanges,
								});
							}
						}
						lastTrajectory = snapshot.trajectory;
					}
				}, 1000);

				context.subscriptions.push({
					dispose: () => {
						if (vitalsUpdateInterval) {
							clearInterval(vitalsUpdateInterval);
							vitalsUpdateInterval = null;
						}
					},
				});
			}

			// Listen for config changes to toggle vitals display
			context.subscriptions.push(
				vscode.workspace.onDidChangeConfiguration((e) => {
					if (e.affectsConfiguration("snapback.vitals.showInStatusBar")) {
						const enabled = vscode.workspace
							.getConfiguration()
							.get<boolean>("snapback.vitals.showInStatusBar", true);
						vitalsIntegration?.setVitalsEnabled(enabled);
						logger.info("Vitals status bar display updated", { enabled });
					}
				}),
			);

			logger.info("Vitals StatusBar initialized", { vitalsEnabled });
		} catch (error) {
			logger.warn("Failed to initialize Vitals StatusBar (non-critical)", { error });
		}
		phaseTimings["Phase 16 (Vitals)"] = Date.now() - phase16Start;

		// Create SnapshotRestoreUI now that SnapshotDocumentProvider is available
		const snapshotRestoreUI = new SnapshotRestoreUI(
			phase3Result.operationCoordinator,
			phase4Result.snapshotDocumentProvider,
			workspaceRoot,
		);

		// Create CodeLens provider for inline UI elements
		const codeLensProvider = new SnapBackCodeLensProvider(
			phase2Result.protectedFileRegistry,
			phase3Result.operationCoordinator,
		);
		codeLensProvider.register(context);

		// Create ContextManager
		const contextManager = new ContextManager(phase2Result.protectedFileRegistry);

		// ⚡ Use ProtectionService from Phase 3 (already initialized with deferred audit)
		// Removed duplicate instance that was causing double audits and race conditions

		// Create refreshViews function and assign to global ref
		refreshViews = () => {
			phase4Result.protectedFilesTreeProvider.refresh();
			phase4Result.snapshotNavigatorProvider.refresh();
			phase4Result.snapBackTreeProvider.refresh();
		};

		// 🆕 Register SnapshotContentProvider for snapback:// URIs (enables diff views)
		const snapshotContentProvider = new SnapshotContentProvider(phase2Result.storage);
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider("snapback", snapshotContentProvider),
		);
		logger.info("SnapshotContentProvider registered for snapback:// URIs");

		// 🆕 Register diff commands (showFileDiff, viewSnapshot)
		const diffCommandDisposables = registerDiffCommands(phase2Result.storage);
		context.subscriptions.push(...diffCommandDisposables);
		logger.info("Diff commands registered");

		// Register RPC handlers for MCP requests
		if (eventBus) {
			// Handler: Get protection level for file
			eventBus.onRequest("get_protection_level", async (data: { filePath: string }) => {
				const isProtected = phase2Result.protectedFileRegistry.isProtected(data.filePath);
				const protectionLevel = phase2Result.protectedFileRegistry.getProtectionLevel(data.filePath);
				return {
					filePath: data.filePath,
					isProtected,
					level: protectionLevel || null,
				};
			});
			// Note: onRequest doesn't return a Disposable; cleanup handled in deactivate()

			// Handler: Get iteration statistics
			eventBus.onRequest("get_iteration_stats", async (data: { filePath: string }) => {
				// Use the real implementation from SaveHandler
				const stats = saveHandler.getIterationStats(data.filePath);

				// Generate recommendation based on stats
				let recommendation = "Continue coding normally";
				if (stats.riskLevel === "high") {
					recommendation = "Consider taking a break or reviewing changes";
				} else if (stats.riskLevel === "medium") {
					recommendation = "Monitor your changes carefully";
				}

				return {
					filePath: data.filePath,
					consecutiveAIEdits: stats.consecutiveAIEdits,
					riskLevel: stats.riskLevel,
					velocity: Math.round(stats.velocity * 100) / 100, // Round to 2 decimal places
					recommendation,
				};
			});
			// Note: onRequest doesn't return a Disposable; cleanup handled in deactivate()

			// Handler: Create snapshot
			eventBus.onRequest("create_snapshot", async (data: { filePath: string; reason?: string }) => {
				const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(data.filePath));
				const snapshot = await phase3Result.snapshotManager.createSnapshot(
					[
						{
							path: data.filePath,
							content: fileContent.toString(),
							action: "modify",
						},
					],
					{
						description: data.reason || "MCP snapshot",
						protected: false,
					},
				);

				return {
					id: snapshot.id,
					timestamp: snapshot.timestamp,
					meta: { source: "mcp", reason: data.reason },
				};
			});
			// Note: onRequest doesn't return a Disposable; cleanup handled in deactivate()
		}

		// Listen for snapshot created events from MCP
		if (eventBus) {
			// Capture eventBus in closure to avoid null check issues
			const bus = eventBus;

			const snapshotCreatedHandler = (payload: unknown) => {
				logger.info("Snapshot created event received", payload);
				// Refresh all tree views when snapshot is created
				refreshViews();

				// Show notification
				const data = payload as { id: string };
				vscode.window.showInformationMessage(`🧢 Snapshot created by AI: ${data.id}`);
			};
			bus.on(SnapBackEvent.SNAPSHOT_CREATED, snapshotCreatedHandler);
			context.subscriptions.push({
				dispose: () => bus.off(SnapBackEvent.SNAPSHOT_CREATED, snapshotCreatedHandler),
			});

			const protectionChangedHandler = (payload: unknown) => {
				logger.info("Protection changed event received", payload);
				// Update context for the changed file
				const data = payload as { filePath: string };
				contextManager.updateContextForFile(data.filePath);
				// Refresh views
				refreshViews();
			};
			bus.on(SnapBackEvent.PROTECTION_CHANGED, protectionChangedHandler);
			context.subscriptions.push({
				dispose: () => bus.off(SnapBackEvent.PROTECTION_CHANGED, protectionChangedHandler),
			});

			const analysisCompletedHandler = (payload: unknown) => {
				logger.info("Analysis completed event received", payload);
				// Could update UI or show notifications based on analysis results
			};
			bus.on(SnapBackEvent.ANALYSIS_COMPLETED, analysisCompletedHandler);
			context.subscriptions.push({
				dispose: () => bus.off(SnapBackEvent.ANALYSIS_COMPLETED, analysisCompletedHandler),
			});
		}

		// Create updateFileProtectionContext function
		const updateFileProtectionContext = async (uri: vscode.Uri) => {
			const isProtected = phase2Result.protectedFileRegistry.isProtected(uri.fsPath);
			await vscode.commands.executeCommand("setContext", "snapback.fileProtected", isProtected);
			// Also update the context manager
			await contextManager.updateContextForFile(uri.fsPath);
		};

		// Create updateHasProtectedFilesContext function
		const updateHasProtectedFilesContext = async () => {
			const protectedFiles = await phase2Result.protectedFileRegistry.list();
			await vscode.commands.executeCommand("setContext", "snapback.hasProtectedFiles", protectedFiles.length > 0);
		};

		// Create getProtectionStateSummary function
		const getProtectionStateSummary = async () => {
			const protectedFiles = await phase2Result.protectedFileRegistry.list();
			const watchCount = protectedFiles.filter((f) => f.protectionLevel === "watch").length;
			const warnCount = protectedFiles.filter((f) => f.protectionLevel === "warn").length;
			const blockCount = protectedFiles.filter((f) => f.protectionLevel === "block").length;

			return {
				state: {
					watch: watchCount,
					warn: warnCount,
					block: blockCount,
				},
				message: `SnapBack: ${protectedFiles.length} protected files (${watchCount} \u{1f7e2}, ${warnCount} \u{1f7e1}, ${blockCount} \u{1f534})`,
			};
		};

		// Create command context
		const commandContext = {
			// Services
			protectedFileRegistry: phase2Result.protectedFileRegistry,
			// Removed protectionConfigManager
			operationCoordinator: phase3Result.operationCoordinator,
			snapshotManager: phase3Result.snapshotManager,
			workflowIntegration: phase3Result.workflowIntegration,
			// Removed: StatusBarController - protection status shown in Activity Bar only
			notificationManager: phase3Result.notificationManager,
			workspaceMemoryManager: phase3Result.workspaceMemoryManager,
			conflictResolver: phase3Result.conflictResolver,
			// 🆕 Add feature flag service to command context
			featureFlagService: featureFlagService,
			// 🟢 TDD GREEN: Add protection service for audit cache invalidation
			protectionService: phase3Result.protectionService,

			// Providers
			snapshotDocumentProvider: phase4Result.snapshotDocumentProvider,
			protectionDecorationProvider: phase4Result.protectionDecorationProvider,
			fileHealthDecorationProvider: fileHealthDecorationProvider, // 🆕 Add FileHealthDecorationProvider to command context
			snapshotRestoreUI: snapshotRestoreUI, // Use the newly created instance

			// Other dependencies
			saveHandler,
			protectedFilesTreeProvider: phase4Result.protectedFilesTreeProvider,
			snapshotNavigatorProvider: phase4Result.snapshotNavigatorProvider,
			snapshotSummaryProvider: phase3Result.snapshotSummaryProvider,
			snapBackTreeProvider: phase4Result.snapBackTreeProvider,

			// Configuration
			configManager: phase2Result.configManager,
			fileWatcher: fileWatcher,
			snapbackrcLoader: phase2Result.snapbackrcLoader,

			// UI Components
			welcomeView: phase4Result.welcomeView,
			cooldownIndicator: cooldownIndicator, // 🆕 Add cooldown indicator to command context

			// MCP Manager
			mcpManager: phase2Result.mcpManager,

			// Utility functions
			refreshViews,
			updateFileProtectionContext,
			updateHasProtectedFilesContext,
			getProtectionStateSummary,

			// Storage
			storage: phase2Result.storage,

			// Event bus
			eventBus,

			// Workspace
			workspaceManager, // 🆕 Pass WorkspaceManager for multi-root support
			workspaceRoot,
		};

		// ✅ Initialize ProtectionNotifications before registering commands
		// This enables protection level notifications with "Don't show again" support
		initializeProtectionNotifications(context.globalState);
		logger.info("ProtectionNotifications initialized with globalState");

		// Register commands
		const commandDisposables = registerAllCommands(context, commandContext);
		context.subscriptions.push(...commandDisposables);

		// Set the extension as active
		await vscode.commands.executeCommand("setContext", "snapback.isActive", true);
		logger.info("SnapBack context set to active");

		// ⚡ PERF: Defer context updates to background (after UI responsive)
		// These call protectedFileRegistry.list() which can be slow
		setTimeout(async () => {
			try {
				console.log("[PERF] Updating context in background...");
				const ctxStart = Date.now();
				await updateHasProtectedFilesContext();
				logger.info("Protected files context updated");

				// Update file protection context for active editor
				const activeEditor = vscode.window.activeTextEditor;
				if (activeEditor) {
					await updateFileProtectionContext(activeEditor.document.uri);
					logger.info("File protection context updated for active editor");
				}
				console.log("[PERF] Context updates completed", {
					ms: Date.now() - ctxStart,
				});
			} catch (err) {
				logger.error("Failed to update context in background", err as Error);
			}
		}, 100);

		// Listen for protection changes to update file protection context
		//  TDD: Wire cache invalidation + dashboard refresh on protection changes
		let auditDebounceTimer: NodeJS.Timeout | undefined;
		const protectionChangeListener = phase2Result.protectedFileRegistry.onProtectionChanged(async (uris) => {
			// Update the file protection context for the active editor
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				await updateFileProtectionContext(activeEditor.document.uri);
			}
			// Update hasProtectedFiles context
			await updateHasProtectedFilesContext();
			// Refresh all tree views when protection changes
			refreshViews();

			// 🟢 TDD GREEN: Invalidate audit cache and refresh with debouncing
			// Debounce to prevent excessive audits during bulk protection operations
			if (auditDebounceTimer) {
				clearTimeout(auditDebounceTimer);
			}
			auditDebounceTimer = setTimeout(async () => {
				logger.info("Protection changed, refreshing audit...");
				// Invalidate cache to ensure fresh scan
				phase3Result.protectionService.invalidateAuditCache();
				// Run audit with force=true to bypass cache
				await phase3Result.protectionService.auditRepo(true);
				// 🟢 Phase 2: Refresh SnapBack TreeView to show updated status
				phase4Result.snapBackTreeProvider.refresh();
			}, 300); // 300ms debounce for responsive feel

			// Publish event when protection changes
			if (eventBus && uris.length > 0) {
				const filePath = uris[0].fsPath;
				// Simplified approach since we can't easily access getProtectionInfo
				const payload: ProtectionChangedPayload = {
					filePath,
					level: "watch", // Default level
					timestamp: Date.now(),
				};
				eventBus.publish(SnapBackEvent.PROTECTION_CHANGED, payload);
			}
		});
		context.subscriptions.push(protectionChangeListener);

		// Listen for active editor changes to update file protection context
		const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
			if (editor) {
				await updateFileProtectionContext(editor.document.uri);
			}
		});
		context.subscriptions.push(activeEditorChangeListener);

		// Activation complete
		const elapsedTime = Date.now() - startTime;
		logger.info(`Extension activated in ${elapsedTime}ms`);
		outputChannel.appendLine(`✅ SnapBack activated in ${elapsedTime}ms`);

		// Log phase timings for performance analysis
		outputChannel.appendLine("\n[PERF] Phase Timing Breakdown:");
		let totalPhaseTime = 0;
		for (const [phase, duration] of Object.entries(phaseTimings)) {
			totalPhaseTime += duration;
			const barLength = Math.round(duration / 100);
			const bar = "█".repeat(Math.min(barLength, 50));
			outputChannel.appendLine(`  ${phase.padEnd(25)} ${bar} ${duration}ms`);
		}
		outputChannel.appendLine(`\n  Total (Phase Time):   ${totalPhaseTime}ms`);
		outputChannel.appendLine(`  Total (Including UI): ${elapsedTime}ms`);

		if (elapsedTime > 500) {
			outputChannel.appendLine(
				`\n⚠️ WARNING: Activation time ${elapsedTime}ms exceeds 500ms budget by ${elapsedTime - 500}ms`,
			);
			logger.warn("Activation performance degraded", {
				elapsedTime,
				budget: 500,
			});
		} else {
			outputChannel.appendLine(`\n✅ Activation time within budget (${elapsedTime}ms < 500ms)`);
		}
	} catch (error) {
		logger.error("Activation failed", error as Error);
		vscode.window.showErrorMessage(
			`SnapBack activation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		// 🛡️ Show error in views so user knows what happened
		showErrorInViews(context, error as Error);
	}
}

export async function deactivate() {
	logger.info("Extension deactivation started");

	try {
		if (storage) {
			await storage.dispose();
			storage = null;
			logger.info("Storage connection closed");
		}

		if (eventBus) {
			eventBus.close();
			eventBus = null;
			logger.info("Event bus closed");
		}

		// 🆕 Clear feature flag service cache
		if (featureFlagService) {
			featureFlagService.clearAllCache();
			featureFlagService = null;
			logger.info("Feature flag service cache cleared");
		}

		// 🆕 Dispose of workspace manager
		if (workspaceManager) {
			workspaceManager.dispose();
			workspaceManager = null;
			logger.info("Workspace manager disposed");
		}

		// 🆕 Clear auth state
		if (authState) {
			authState = null;
			logger.info("Auth state cleared");
		}

		// 🆕 Clear anonymous ID manager
		if (anonymousIdManager) {
			anonymousIdManager = null;
			logger.info("Anonymous ID manager cleared");
		}

		// 🆕 Deactivate AutoDecisionIntegration
		if (autoDecisionIntegration) {
			autoDecisionIntegration.deactivate();
			autoDecisionIntegration = null;
			logger.info("AutoDecisionIntegration deactivated");
		}

		// 🆕 Dispose EventBridge
		if (eventBridge) {
			eventBridge.dispose();
			eventBridge = null;
			logger.info("EventBridge disposed");
		}

		// 🆕 Clear SignalBridge (AI paste/burst detection)
		if (signalBridge) {
			signalBridge = null;
			logger.info("SignalBridge cleared");
		}

		// 🆕 Clear UserIdentityService
		if (userIdentityService) {
			userIdentityService = null;
			logger.info("UserIdentityService cleared");
		}

		// 🆕 Dispose Vitals StatusBar
		if (vitalsUpdateInterval) {
			clearInterval(vitalsUpdateInterval);
			vitalsUpdateInterval = null;
		}
		if (vitalsIntegration) {
			vitalsIntegration.dispose();
			vitalsIntegration = null;
			logger.info("VitalsIntegration disposed");
		}
		if (vitalsStatusBar) {
			vitalsStatusBar.dispose();
			vitalsStatusBar = null;
			logger.info("Vitals StatusBar disposed");
		}

		// 🆕 Dispose ActivationFunnelIntegration
		if (activationFunnelIntegration) {
			disposeActivationFunnel();
			activationFunnelIntegration = null;
			logger.info("ActivationFunnelIntegration disposed");
		}

		// 🆕 Dispose Intelligence instances (from migration)
		// Dynamic import to avoid loading ONNX modules before process.exit guard is installed
		try {
			const { disposeAll: disposeIntelligence } = await import("./services/IntelligenceService");
			await disposeIntelligence();
			logger.info("Intelligence instances disposed");
		} catch (error) {
			logger.warn("Failed to dispose Intelligence instances", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		logger.info("Extension deactivated successfully");
	} catch (error) {
		logger.error("Error during deactivation", error as Error);
	}
}

/**
 * Get the current WorkspaceManager instance
 * Provides access to multi-root workspace operations for commands
 *
 * @returns WorkspaceManager instance, or null if not yet initialized
 */
export function getWorkspaceManager(): WorkspaceManager | null {
	return workspaceManager;
}

/**
 * Get the current AuthState instance
 * Provides authentication status checking for the current user
 *
 * @returns AuthState instance, or null if not yet initialized
 */
export function getAuthState(): AuthState | null {
	return authState;
}

/**
 * Get the current AnonymousIdManager instance
 * Provides anonymous ID management for unauthenticated users
 *
 * @returns AnonymousIdManager instance, or null if not yet initialized
 */
export function getAnonymousIdManager(): AnonymousIdManager | null {
	return anonymousIdManager;
}

/**
 * Show workspace trust warning asynchronously (non-blocking).
 * Called after activation completes to avoid blocking extension startup.
 */
async function showDeferredWorkspaceTrustWarning(context: vscode.ExtensionContext): Promise<void> {
	const ACK_KEY = "snapback.workspace-trust-warning-acknowledged";

	// Check if already acknowledged
	if (context.globalState.get<boolean>(ACK_KEY)) {
		return;
	}

	try {
		const result = await vscode.window.showWarningMessage(
			"SnapBack is running in limited mode because this workspace is not trusted. Some features like snapshot creation and risk analysis are disabled.",
			"Trust Workspace",
			"Continue Anyway",
			"Don't Show Again",
		);

		if (result === "Trust Workspace") {
			// Wrap in try/catch - command may not exist in VS Code forks (Cursor, Qoder, etc.)
			try {
				await vscode.commands.executeCommand("workbench.action.manageTrust");
			} catch (cmdError) {
				// Fallback: Show manual instructions for VS Code forks that don't have this command
				logger.warn("Workspace trust command not available (VS Code fork)", {
					error: cmdError instanceof Error ? cmdError.message : String(cmdError),
				});
				vscode.window.showInformationMessage(
					"To trust this workspace: Open Command Palette (Cmd/Ctrl+Shift+P) → search 'Workspace Trust' or add this folder to your trusted workspaces in Settings.",
				);
			}
		} else if (result === "Don't Show Again") {
			await context.globalState.update(ACK_KEY, true);
		}
	} catch (error) {
		logger.error("Error showing workspace trust warning", error as Error);
	}
}
