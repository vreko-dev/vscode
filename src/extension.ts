/**
 * @fileoverview SnapBack Extension Entry Point - Modular Architecture
 *
 * This module serves as the primary entry point for the SnapBack VS Code extension,
 * implementing a modular architecture with clear separation of concerns.
 *
 * @author SnapBack Architecture Team
 * @version 1.0.0
 */

// 🛡️ DEFENSE-IN-DEPTH: Skip environment validation for VS Code extension context
// The root cause is fixed (env.ts removed from @snapback/config exports), but we keep
// this as a safety net in case any transitive dependency still triggers validation.
// This MUST be set before any imports that might use @snapback/config or @snapback/env.
process.env.SKIP_ENV_VALIDATION = "1";

// 🔇 Suppress console.error logs from shared packages (config store, etc.)
// These packages check MCP_QUIET at module load time, so this must run before imports.
// This prevents confusing ERR entries in dev console from MCP-compatible packages.
process.env.MCP_QUIET = "1";

// Import real EventBus from @snapback/contracts (consolidated from @snapback/events)
import { SnapBackEvent, SnapBackEventBus } from "@snapback/contracts";
import * as vscode from "vscode";
import { initializePhase1Services } from "./activation/phase1-services";
import { initializeContextFileManager, initializePhase2Storage } from "./activation/phase2-storage";
import { initializePhase3Managers } from "./activation/phase3-managers";
import { initializePhase4Providers } from "./activation/phase4-providers";
import { initializePhase5Registration } from "./activation/phase5-registration";
import { logPhaseTimings } from "./activation/phaseTracker";
import { initializePioneerInfrastructure } from "./activation/pioneer"; // 🆕 Import Pioneer Initialization
import { autoConfigureAgentRules, registerAgentRulesCommands } from "./ai/config"; // 🆕 Import Agent Rules auto-configure
import { createAuthedApiClient } from "./api/authedApiClient";
import { AnonymousIdManager } from "./auth/AnonymousIdManager";
import { AuthState } from "./auth/AuthState";
import { createCredentialsManager } from "./auth/credentials";
import { EventBridge } from "./bridges/EventBridge";
import { disposeAllMCPBridges, getMCPBridge, type MCPBridge } from "./bridges/MCPBridge"; // 🆕 Import MCPBridge for pair programming
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
import { disposeHeatIntegration, type HeatIntegration, initializeHeatIntegration } from "./heat"; // 🆕 Import Heat Integration
import { AutoDecisionIntegration } from "./integration/AutoDecisionIntegration"; // 🆕 Import AutoDecisionIntegration
import { autoConfigureMCP, registerMCPCommands } from "./mcp/auto-configure"; // 🆕 Import MCP auto-configure
import { AIDetectionToast, type AISignal } from "./notifications/AIDetectionToast"; // 🆕 Import AIDetectionToast
// 🆕 Import health monitor for proactive issue detection
import {
	createDefaultHealthChecks,
	disposeHealthMonitor,
	initializeHealthMonitor,
} from "./observability/ActivationHealthMonitor";
// 🆕 Import Sentry observability for error tracking (isolated client pattern)
import { addBreadcrumb, captureException, closeSentry, initSentryExtension, setUser } from "./observability/sentry";
import { FileSystemWatcher } from "./protection/FileSystemWatcher";
import { SnapshotContentProvider } from "./providers/SnapshotContentProvider"; // 🆕 Import SnapshotContentProvider
import { RulesManager } from "./rules/RulesManager";
import { initializeSecureConfig } from "./security/SecureConfigService"; // 🆕 Import SecureConfigService
import { NoopAIRiskService, RemoteAIRiskService } from "./services/aiRiskService";
import { ApiClient } from "./services/api-client";
import { disposeDaemonBridge, getDaemonBridge, type SnapshotCreatedEvent } from "./services/DaemonBridge";
import { FeatureFlagService } from "./services/feature-flag-service"; // 🆕 Import FeatureFlagService
import { getWorkspaceVitalsSync } from "./services/IntelligenceService"; // 🆕 Import for Phase 2A
import { activateLanguageServer, deactivateLanguageServer, preCacheVitals } from "./services/LanguageClient";
import { TelemetryProxy } from "./services/telemetry-proxy";
import type { UnifiedOnboardingService } from "./services/UnifiedOnboardingService";
import { UserIdentityService } from "./services/UserIdentityService";
import { createWorkspaceContextManager } from "./services/WorkspaceContextManager"; // 🆕 Import WorkspaceContextManager
import { WorkspaceManager } from "./services/WorkspaceManager"; // 🆕 Import WorkspaceManager
import type { IStorageManager } from "./storage/types.js";
import {
	disposeActivationFunnel,
	getActivationFunnel,
	initializeActivationFunnel,
} from "./telemetry/ActivationFunnelIntegration"; // 🆕 Activation funnel tracking
import { initializeCoreEventTracker } from "./telemetry/core-event-tracker";
import type { ProtectionChangedPayload } from "./types/api";
import { CooldownIndicator } from "./ui/cooldownIndicator"; // 🆕 Import CooldownIndicator
// REMOVED: DashboardPanel - consolidated into UnifiedDashboardPanel home tab
// REMOVED: OnboardingPanelProvider - consolidated into UnifiedDashboardPanel setup tab
// REMOVED: VitalsDashboardPanel - consolidated into UnifiedDashboardPanel vitals tab
import { SnapBackCodeLensProvider } from "./ui/SnapBackCodeLensProvider";
import { SnapshotRestoreUI } from "./ui/SnapshotRestoreUI";
import type { StatusBarManager } from "./ui/StatusBarManager"; // 🆕 Import StatusBarManager type
import { UnifiedDashboardPanel } from "./ui/UnifiedDashboardPanel"; // 🆕 Consolidated dashboard panel
// REMOVED: VitalsIntegration - consolidated into VitalsUIIntegration to eliminate duplicate status bar updates
import { isMonitorableDocument } from "./utils/documentFilters";
import { isSnapBackError } from "./utils/errorHelpers";
import { calculateLineDiff } from "./utils/lineDiff";
import { logger } from "./utils/logger";
import { installProcessExitGuard } from "./utils/processGuard";
import { findProjectRoot } from "./utils/projectRoot";
import { WorkspaceFolderResolver } from "./utils/WorkspaceFolderResolver"; // 🆕 Import WorkspaceFolderResolver
import { registerEmptyViews, showErrorInViews } from "./views/ViewRegistry";

// Module-level fallback for Qoder/VS Code forks that freeze the context object
// biome-ignore lint/correctness/noUnusedVariables: Fallback storage accessed via module scope
let globalUnifiedOnboarding: UnifiedOnboardingService | undefined;

// 🆕 IntelligenceService imported dynamically after process.exit guard (see deactivate function)
// Note: calculateLineDiff moved to utils/lineDiff.ts

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
// 🆕 Global reference to StatusBarManager (consolidated status bar)
let vitalsStatusBar: StatusBarManager | null = null;
// 🆕 Global reference to AIDetectionToast
let aiDetectionToast: AIDetectionToast | null = null;
// REMOVED: vitalsIntegration - consolidated into VitalsUIIntegration
let vitalsUpdateInterval: NodeJS.Timeout | null = null;
// 🆕 Global reference to Heat Integration
let heatIntegration: HeatIntegration | null = null;
// REMOVED: aiRecordingTimeout - Recording state removed (Option 3)
// The "Recording..." state was triggering on AI extension presence rather than actual
// AI-assisted editing activity. StatusBarManager.showAIDetectedSequence() already
// provides visual feedback for AI activity, making the recording state redundant.

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

	// 🆕 Initialize Sentry for production error tracking (isolated client - no global pollution)
	// This runs early to capture any errors during activation phases
	try {
		await initSentryExtension(context);
		addBreadcrumb("Extension activation started", "lifecycle");
	} catch (sentryError) {
		logger.warn("Sentry initialization failed (non-critical)", {
			error: sentryError instanceof Error ? sentryError.message : String(sentryError),
		});
	}

	// 🆕 Initialize Health Monitor for proactive issue detection
	const healthMonitor = initializeHealthMonitor(context);
	healthMonitor.startActivation();
	context.subscriptions.push(healthMonitor.registerDiagnosticCommand());

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
	// Note: isSnapBackError moved to utils/errorHelpers.ts

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

		// 🆕 Send to Sentry for remote tracking
		captureException(error, {
			tags: { source: "unhandledRejection", phase: "activation" },
			level: "fatal",
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

		// 🆕 Send to Sentry for remote tracking
		captureException(error, {
			tags: { source: "uncaughtException", phase: "activation" },
			level: "fatal",
		});

		// DO NOT call process.exit() - log and attempt recovery
		vscode.window.showErrorMessage(
			"SnapBack encountered a critical error. Extension may be unstable. Please reload VS Code.",
		);
	});

	// 🛡️ CRITICAL: Install process.exit() guard to prevent accidental crashes
	// Note: Guard implementation moved to utils/processGuard.ts
	installProcessExitGuard();

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

	// 🛠️ DEBUG HOOK: Test status bar states manually
	// Usage: Run command "SnapBack: Debug Status Bar" from Command Palette
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.__debugStatusBar", async () => {
			if (!vitalsStatusBar) {
				vscode.window.showWarningMessage("StatusBarManager not initialized yet");
				return;
			}
			const state = await vscode.window.showQuickPick(
				[
					{ label: "🧢 Idle", value: "idle" },
					{ label: "✨ AI Session", value: "ai-session" },
					{ label: "✅ Checkpoint", value: "checkpoint" },
					{ label: "📜 Restored", value: "restored" },
					{ label: "⚡ AI Detected Sequence", value: "ai-sequence" },
					{ label: "🔄 Reset All", value: "reset" },
				],
				{ placeHolder: "Select status bar state to test" },
			);
			if (!state) {
				return;
			}

			switch (state.value) {
				case "idle":
					vitalsStatusBar.showIdle();
					break;
				case "ai-session":
					vitalsStatusBar.showAISession("Cursor");
					break;
				case "checkpoint":
					vitalsStatusBar.showCheckpointCreated();
					break;
				case "restored":
					vitalsStatusBar.showRestored(42);
					break;
				case "ai-sequence":
					void vitalsStatusBar.showAIDetectedSequence("Cursor");
					break;
				case "reset":
					vitalsStatusBar.showIdle();
					break;
			}
			vscode.window.showInformationMessage(`Status bar set to: ${state.label}`);
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

				// 🆕 Track welcome shown in activation funnel
				getActivationFunnel()?.trackWelcomeShown();
			} catch (error) {
				// Walkthrough not supported in this VS Code fork - show OnboardingPanel React webview instead
				logger.warn("Native walkthrough not available, showing OnboardingPanel fallback", {
					extensionId,
					error: error instanceof Error ? error.message : String(error),
				});

				// Fallback: Show React-based OnboardingPanel webview
				void Promise.resolve(vscode.commands.executeCommand("snapback.openOnboarding"))
					.then(() => {
						// 🆕 Track welcome shown in activation funnel (fallback path)
						getActivationFunnel()?.trackWelcomeShown();
					})
					.catch((err: unknown) => {
						logger.error("Failed to open onboarding panel", { error: err });
					});
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
		addBreadcrumb("Phase 1 complete: Core services", "activation", {
			duration: phaseTimings["Phase 1 (Services)"],
		});

		// 🆕 Phase 1.5: Defer Language Server startup for activation performance
		// The LSP runs in a separate process, keeping extension bundle lightweight (<1MB)
		// PERF: Deferring to setImmediate saves ~1000ms from activation critical path
		// LSP features (vitals, intelligence) become available shortly after activation
		const lspStart = Date.now();
		const primaryWorkspaceId = workspaceFolders[0]?.uri.toString() || "default";

		// Fire-and-forget LSP initialization - runs after activate() returns
		setImmediate(() => {
			activateLanguageServer(context)
				.then(() => preCacheVitals(primaryWorkspaceId))
				.then(() => {
					const lspDuration = Date.now() - lspStart;
					logger.info("Language Server activated and vitals pre-cached (deferred)", {
						primaryWorkspaceId,
						deferredMs: lspDuration,
					});
				})
				.catch((error) => {
					logger.warn("Language Server failed to start - Intelligence features unavailable", {
						error: error instanceof Error ? error.message : String(error),
					});
					// Non-fatal: extension continues with limited functionality
				});
		});

		// Record timing as near-zero since we're deferring
		phaseTimings["Phase 1.5 (LSP)"] = Date.now() - lspStart; // Should be <10ms now

		// Phase 2: Storage and configuration (fail-fast if unavailable)
		const phase2Start = Date.now();
		const phase2Result = await initializePhase2Storage(workspaceRoot, context, eventBus); // GREEN: Pass eventBus
		phaseTimings["Phase 2 (Storage)"] = Date.now() - phase2Start;
		storage = phase2Result.storage;
		addBreadcrumb("Phase 2 complete: Storage initialized", "activation", {
			duration: phaseTimings["Phase 2 (Storage)"],
		});

		// 🎩 Initialize Context File Manager (non-blocking)
		// Creates .snapback/ctx/context.json for AI assistant awareness
		initializeContextFileManager(context, workspaceRoot, phase2Result.storage);

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

		// 🆕 Cleanup orphan PRE checkpoints from previous crashes (fire-and-forget, non-fatal)
		void phase2Result.storage
			.getPRWSnapshotStore()
			.cleanupOldOrphanPREs(60 * 60 * 1000)
			.catch((err) => {
				logger.warn("Failed to cleanup orphan PRE checkpoints (non-critical)", { error: err });
			});

		// 🆕 Initialize SignalBridge for AI paste/burst detection (V2 engine only)
		signalBridge = new SignalBridge({ burstThreshold: 30 });

		// 🛡️ Activation Grace Period: Track when extension is ready
		// Note: Uses local variable because this is a closure, not a class method
		// 🐛 FIX: Increased from 2s to 6s because:
		// - Activation takes ~3.5s (budget is 500ms but we're exceeding it)
		// - VS Code workspace restoration can trigger document changes after activation
		// - Need buffer time for VS Code to finish restoring editor state
		let isActivationGracePeriod = true;
		let gracePeriodTimeout: NodeJS.Timeout | null = setTimeout(() => {
			isActivationGracePeriod = false;
			gracePeriodTimeout = null;
			logger.info("Extension: Activation grace period ended (6s), AI/burst detection now active");
		}, 6000);

		// Register cleanup for grace period timeout
		context.subscriptions.push({
			dispose: () => {
				if (gracePeriodTimeout) {
					clearTimeout(gracePeriodTimeout);
					gracePeriodTimeout = null;
				}
			},
		});

		// Subscribe to document changes for burst detection
		context.subscriptions.push(
			vscode.workspace.onDidChangeTextDocument((e) => {
				// 🛡️ CRITICAL: Only monitor real files, not Output channels/git diffs/etc
				// This prevents recursive loops where SnapBack's logging triggers AI detection
				if (!isMonitorableDocument(e.document)) {
					return;
				}

				if (!signalBridge) {
					return;
				}

				// 🛡️ Skip events during activation grace period to prevent false positives
				if (isActivationGracePeriod) {
					logger.debug("Grace period: Skipping document change event", {
						file: e.document.fileName,
						changeCount: e.contentChanges.length,
						reason: e.reason, // 1 = Undo, 2 = Redo, undefined = normal edit
					});
					return;
				}

				// 🛡️ Skip undo/redo operations - these are often VS Code restoration or user navigation
				// Not AI-generated content
				if (
					e.reason === vscode.TextDocumentChangeReason.Undo ||
					e.reason === vscode.TextDocumentChangeReason.Redo
				) {
					logger.debug("Skipping undo/redo document change", {
						file: e.document.fileName,
						reason: e.reason === vscode.TextDocumentChangeReason.Undo ? "undo" : "redo",
					});
					return;
				}

				// Compute burst state
				const burstState = signalBridge.computeBurst(e.document, e.contentChanges);

				// 🆕 Phase 2A: Track line changes for behavioral metadata
				const { linesAdded, linesDeleted } = calculateLineDiff(e.contentChanges);
				if (linesAdded > 0 || linesDeleted > 0) {
					const workspaceId = vscode.workspace.workspaceFolders?.[0]?.uri.toString() || "default";
					const vitals = getWorkspaceVitalsSync(workspaceId);
					if (vitals) {
						vitals.recordEdit(linesAdded, linesDeleted);
						logger.debug("Vitals: Line changes tracked", { linesAdded, linesDeleted });
					}
				}

				if (burstState.detected && burstState.velocity && burstState.filePath) {
					// On burst detected → create PRE checkpoint
					const riskScore = Math.min(100, Math.round(burstState.velocity * 10));
					void prwManager?.handleSave(burstState.filePath, riskScore);
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
					// 🔍 [SB_STATUS] Log AI detection from SignalBridge
					logger.info("[SB_STATUS] AI tool detected by SignalBridge", {
						tool: aiResult.tool,
						confidence: aiResult.confidence,
						method: aiResult.method,
					});

					// 🆕 Trigger status bar activity sequence for AI detection
					// Note: statusBarManager wired after Phase 4 initialization
					if (vitalsStatusBar) {
						void vitalsStatusBar.showAIDetectedSequence(aiResult.tool);
					}

					// 🆕 Show AI detection toast notification (new consolidated UI)
					if (aiDetectionToast) {
						const signals: AISignal[] = [
							{
								type: aiResult.method || "paste",
								confidence: aiResult.confidence,
							},
						];
						void aiDetectionToast.show(signals);
					}

					// REMOVED: Recording state trigger (Option 3)
					// The "Recording..." state was triggering on AI extension presence (having
					// Copilot/Cursor installed) rather than actual AI-assisted editing.
					// StatusBarManager.showAIDetectedSequence() already provides appropriate
					// visual feedback when AI activity is detected.
				}

				// 🆕 Trigger status bar activity sequence for burst detection
				if (burstState.detected && vitalsStatusBar) {
					// 🔍 [SB_STATUS] Log burst detection from SignalBridge
					logger.info("[SB_STATUS] Burst detected by SignalBridge", {
						velocity: burstState.velocity,
						charCount: burstState.charCount,
						filePath: burstState.filePath,
					});
					void vitalsStatusBar.showBurstDetectedSequence();
				}
			}),
		);

		logger.info("SignalBridge initialized (V2 engine)");

		// 🆕 Initialize MCPBridge for pair programming observations
		// Pushes file changes and observations to MCP server for composite tools
		// Uses workspace-scoped instance to prevent cross-workspace event leakage
		// Remote endpoint (Fly.dev) is tried first, with local fallback
		// Note: primaryWorkspaceId already declared at Phase 1.5 (LSP deferral)
		mcpBridge = getMCPBridge(primaryWorkspaceId, {
			remoteEndpoint: "https://snapback-mcp.fly.dev",
			localEndpoint: "http://127.0.0.1:3100",
			flushInterval: 5000,
			enableAIDetection: true,
		});
		mcpBridge.activate(context, signalBridge ?? undefined);
		context.subscriptions.push({
			dispose: () => {
				// Dispose all workspace-scoped bridges on deactivation
				disposeAllMCPBridges();
				mcpBridge = null;
			},
		});
		logger.info("MCPBridge initialized for pair programming", { workspaceId: primaryWorkspaceId });

		// Phase 3: Business logic managers
		const phase3Start = Date.now();
		const telemetryProxy = new TelemetryProxy(context); // Ensure telemetryProxy is defined here

		// 🆕 Track extension activation (every activation, not just first install)
		await telemetryProxy.trackActivation();

		// 🆕 Initialize CoreEventTracker for P0 product events (save_attempt, snapshot_created, session_finalized)
		initializeCoreEventTracker(telemetryProxy);
		logger.info("CoreEventTracker initialized for P0 product events");

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
		addBreadcrumb("Phase 3 complete: Business logic managers", "activation", {
			duration: phaseTimings["Phase 3 (Managers)"],
		});

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
			phase3Result.unifiedOnboarding,
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

		// 🆕 Initialize Proactive Alert System
		// Generates contextual alerts on file saves for LLM consumption via MCP
		const proactiveAlertsEnabled = vscode.workspace
			.getConfiguration("snapback")
			.get<boolean>("proactiveAlerts.enabled", true);

		if (proactiveAlertsEnabled) {
			try {
				// Create adapter services for alert generation
				const fileProtectionService = {
					isProtected: (filePath: string) => phase2Result.protectedFileRegistry.isProtected(filePath),
					getProtectedFiles: () => phase2Result.protectedFileRegistry.getAllProtectedFiles(),
				};

				const violationReader = {
					getViolationsForFile: async (_filePath: string) => {
						// TODO: Wire up violation reading via Intelligence Service
						// For now, return empty array (alerts will still work for critical files)
						return [];
					},
				};

				const pressureGauge = {
					getCurrentPressure: async () => {
						try {
							const { getVitalsViaLSP } = await import("./services/LanguageClient.js");
							const vitals = await getVitalsViaLSP();
							return vitals?.pressure.value || 0;
						} catch {
							return 0;
						}
					},
				};

				saveHandler.initializeAlertSystem(workspaceRoot, fileProtectionService, violationReader, pressureGauge);
				logger.info("Proactive Alert System initialized successfully");
			} catch (error) {
				logger.warn("Failed to initialize Proactive Alert System (non-critical)", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// 🔧 REMOVED: File health decorations registered in Phase 5 (phase5-registration.ts)
		// This legacy registration was causing conflicts with the new heat-based decorations

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

						// 🆕 Set user context in Sentry for error attribution
						setUser({ id: sessions.account.id });

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
			undefined, // telemetryProxy
			phase2Result.mcpManager,
		);
		phaseTimings["Phase 4 (Providers)"] = Date.now() - phase4Start;
		addBreadcrumb("Phase 4 complete: UI providers", "activation", {
			duration: phaseTimings["Phase 4 (Providers)"],
		});

		// 🆕 Heat Integration: File activity tracking with AI detection
		try {
			heatIntegration = initializeHeatIntegration();
			context.subscriptions.push({
				dispose: () => {
					disposeHeatIntegration();
					heatIntegration = null;
				},
			});
			logger.info("HeatIntegration initialized for file activity tracking");
		} catch (error) {
			logger.warn("Failed to initialize HeatIntegration (non-critical)", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		// Phase 5: Registration
		const phase5Start = Date.now();
		await initializePhase5Registration(context, phase4Result, phase3Result.sessionCoordinator);
		phaseTimings["Phase 5 (Registration)"] = Date.now() - phase5Start;
		addBreadcrumb("Phase 5 complete: Command registration", "activation", {
			duration: phaseTimings["Phase 5 (Registration)"],
		});

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

		// 🆕 Agent Rules Auto-Configuration (injects SnapBack context into .cursorrules, .clinerules, etc.)
		const agentRulesStart = Date.now();
		registerAgentRulesCommands(context);
		// Run auto-configure asynchronously to not block activation
		void autoConfigureAgentRules(context).catch((err) => {
			logger.warn("Agent rules auto-configure failed (non-blocking)", {
				error: err instanceof Error ? err.message : String(err),
			});
		});
		phaseTimings["Agent Rules Configuration"] = Date.now() - agentRulesStart;

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

		// 🆕 Phase 15: Initialize Unified Onboarding & Progressive Disclosure
		const phase15Start = Date.now();
		try {
			const { UserExperienceService } = await import("./services/UserExperienceService");
			const { ProgressiveDisclosureController } = await import("./ui/ProgressiveDisclosureController");

			// Initialize user experience tracking
			const userExperienceService = new UserExperienceService(context);

			// Initialize progressive disclosure (shows hints to beginners, hides advanced features)
			const progressiveDisclosure = new ProgressiveDisclosureController(context, userExperienceService);
			context.subscriptions.push(progressiveDisclosure);

			// 🧢 Initialize Unified Onboarding Service (replaces OnboardingProgression + MilestoneService)
			const unifiedOnboarding = phase3Result.unifiedOnboarding;
			await unifiedOnboarding.initialize();

			// Store reference for use by other components
			// Use globalState instead of context property (Qoder freezes context object)
			try {
				// biome-ignore lint/suspicious/noExplicitAny: ExtensionContext needs dynamic property
				(context as any)._unifiedOnboarding = unifiedOnboarding;
			} catch {
				// Qoder/some VS Code forks freeze the context object - store in module scope instead
				globalUnifiedOnboarding = unifiedOnboarding;
			}

			logger.info("Unified Onboarding & Progressive Disclosure initialized", {
				experienceLevel: await userExperienceService.getExperienceLevel(),
				onboardingState: unifiedOnboarding.getCurrentState(),
				snapshotsCreated: unifiedOnboarding.getMetrics().snapshotsCreated,
			});
		} catch (error) {
			logger.warn("Failed to initialize onboarding services (non-critical)", {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
		}
		phaseTimings["Phase 15 (Onboarding)"] = Date.now() - phase15Start;

		// 🆕 Register Onboarding Command - Routes to UnifiedDashboardPanel setup tab
		// CONSOLIDATION: All dashboard-related commands now route to single UnifiedDashboardPanel
		try {
			// Register command - routes to UnifiedDashboardPanel's setup tab
			context.subscriptions.push(
				vscode.commands.registerCommand("snapback.openOnboarding", async () => {
					// Route to unified dashboard with setup tab
					await vscode.commands.executeCommand("snapback.openDashboard.setup");
				}),
			);

			// Show onboarding on first install (non-blocking)
			const hasSeenOnboarding = context.globalState.get<boolean>("snapback.hasSeenOnboarding", false);
			if (!hasSeenOnboarding) {
				// Delay to let extension fully activate
				setTimeout(async () => {
					try {
						await vscode.commands.executeCommand("snapback.openOnboarding");
						await context.globalState.update("snapback.hasSeenOnboarding", true);
					} catch (error) {
						logger.warn("Failed to show onboarding panel", { error });
					}
				}, 2000);
			}

			logger.info("Onboarding command registered (routes to UnifiedDashboardPanel)");
		} catch (error) {
			logger.warn("Failed to register onboarding command (non-critical)", { error });
		}

		// 🆕 Register Language Model Detection Command (vscode.lm API)
		try {
			context.subscriptions.push(
				vscode.commands.registerCommand("snapback.detectLanguageModels", async () => {
					try {
						if (!signalBridge) {
							vscode.window.showErrorMessage("SnapBack SignalBridge not initialized");
							return;
						}

						// Detect language models using vscode.lm API
						const result = await signalBridge.detectLanguageModels();

						if (result.totalModels === 0) {
							vscode.window.showInformationMessage(
								"No language models detected. Ensure GitHub Copilot is installed and active.",
								"Learn More",
							);
							return;
						}

						// Show detected models
						const modelList = result.models
							.map((m) => `• ${m.family} (${m.vendor}, ${m.maxInputTokens} tokens)`)
							.join("\n");

						vscode.window.showInformationMessage(
							`🧢 SnapBack detected ${result.totalModels} language model(s):\n${modelList}`,
							"Configure MCP",
						);

						logger.info("Language models detected via command", {
							count: result.totalModels,
							copilot: result.copilotEnabled,
							models: result.models.map((m) => m.family).join(", "),
						});
					} catch (error) {
						logger.error("Failed to detect language models", { error });
						vscode.window.showErrorMessage(
							`Failed to detect language models: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}),
			);

			logger.info("Language model detection command registered");
		} catch (error) {
			logger.warn("Failed to register language model detection command (non-critical)", { error });
		}

		// 🆕 Phase 16: Initialize Vitals StatusBar (power user feature)
		// CONSOLIDATED: VitalsIntegration removed - now handled by VitalsUIIntegration
		const phase16Start = Date.now();
		try {
			// Use StatusBarManager from Phase 4 (avoid creating duplicate)
			vitalsStatusBar = phase4Result.statusBarManager;

			// 🆕 Create AIDetectionToast for AI detection notifications
			aiDetectionToast = new AIDetectionToast();

			// 🆕 Wire FeedbackManager to use unified StatusBarManager
			// This ensures AI detection feedback uses the shared status bar
			FeedbackManager.getInstance().setStatusBarManager(phase4Result.statusBarManager);

			// REMOVED: VitalsIntegration creation - consolidated into VitalsUIIntegration
			// VitalsUIIntegration now handles both session health AND power user vitals display

			// Read vitals display setting from configuration
			const vitalsEnabled = config.get<boolean>("snapback.vitals.showInStatusBar", false);
			// Update VitalsUIIntegration config (it handles showVitals internally now)
			phase4Result.vitalsUIIntegration.updateConfig({ showVitalsInStatusBar: vitalsEnabled });

			// Get UnifiedDataService singleton for vitals data flow
			const unifiedDataService = phase4Result.vitalsUIIntegration.getDataService();

			// Set up periodic vitals update with telemetry tracking
			if (autoDecisionIntegration) {
				const workspaceVitals = autoDecisionIntegration.getVitals();
				let lastTrajectory: string | null = null;

				vitalsUpdateInterval = setInterval(() => {
					if (workspaceVitals) {
						const snapshot = workspaceVitals.current();

						// Wire vitals to UnifiedDataService (feeds VitalsUIIntegration)
						// CONSOLIDATED: VitalsUIIntegration now handles BOTH:
						// 1. Session health updates (updateSessionHealth)
						// 2. Power user vitals display (showVitals) - no more duplicate call!
						// 🆕 ThresholdCalibrator: Pass calibrated threshold multiplier for adaptive health zones
						const thresholdMultiplier = workspaceVitals.getThresholdMultiplier();
						unifiedDataService.updateVitals(snapshot, thresholdMultiplier);

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

							// Trigger status bar activity sequence when vitals are degrading
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
							.get<boolean>("snapback.vitals.showInStatusBar", false);
						// Update via VitalsUIIntegration (consolidated)
						phase4Result.vitalsUIIntegration.updateConfig({ showVitalsInStatusBar: enabled });
						logger.info("Vitals status bar display updated", { enabled });
					}

					// TODO: Wire StatusBarController.setExtensionEnabled() when master enable/disable setting is added
					// Currently no snapback.enabled setting exists - extension is always enabled
					// When added, implement:
					// if (e.affectsConfiguration("snapback.enabled")) {
					//   const enabled = vscode.workspace.getConfiguration().get<boolean>("snapback.enabled", true);
					//   statusBarController?.setExtensionEnabled(enabled);
					// }
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
			phase4Result.intelligenceTreeProvider.refresh();
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

			// Use consistent workspace ID for filtering (URI string format)
			const currentWorkspaceId = workspaceFolders[0]?.uri.toString() || "default";

			const snapshotCreatedHandler = (payload: unknown) => {
				const data = payload as { id: string; workspaceId?: string; filePath?: string; source?: string };
				logger.info("Snapshot created event received", {
					...data,
					currentWorkspaceId,
					eventWorkspaceId: data.workspaceId,
				});

				// 🆕 Workspace-scoped filtering: Only update status bar for current workspace
				// This prevents multi-workspace cross-contamination
				const shouldProcess = !data.workspaceId || data.workspaceId === currentWorkspaceId;

				if (shouldProcess) {
					// Refresh all tree views when snapshot is created
					refreshViews();

					// 🆕 Update StatusBarManager snapshot count
					if (vitalsStatusBar) {
						vitalsStatusBar.incrementSnapshotCount();
					}

					// 🆕 Notify StatusBarController for FSM state transition (protected flash)
					phase4Result.statusBarController.onSnapshotCreated();

					// Show notification only for current workspace
					vscode.window.showInformationMessage(`🧢 Snapshot created by AI: ${data.id}`);
				} else {
					logger.debug("Snapshot event filtered - different workspace", {
						eventWorkspaceId: data.workspaceId,
						currentWorkspaceId,
					});
				}
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

			// 🆕 Wire StatusBarController recovery events for FSM "recovering" state
			const restoreStartedHandler = (payload: unknown) => {
				const data = payload as { snapshotId: string };
				logger.info("Restore started event received", data);
				phase4Result.statusBarController.onRecoveryStart();
			};
			bus.on(SnapBackEvent.RESTORE_STARTED, restoreStartedHandler);
			context.subscriptions.push({
				dispose: () => bus.off(SnapBackEvent.RESTORE_STARTED, restoreStartedHandler),
			});

			const snapshotRestoredHandler = (payload: unknown) => {
				const data = payload as { snapshotId: string; filesRestored: number };
				logger.info("Snapshot restored event received", data);
				// Recovery completed successfully
				phase4Result.statusBarController.onRecoveryComplete(true);
				// Refresh views after restore
				refreshViews();
			};
			bus.on(SnapBackEvent.SNAPSHOT_RESTORED, snapshotRestoredHandler);
			context.subscriptions.push({
				dispose: () => bus.off(SnapBackEvent.SNAPSHOT_RESTORED, snapshotRestoredHandler),
			});

			// 🆕 Initialize DaemonBridge for cross-surface snapshot coordination
			// When MCP or CLI creates a snapshot, the daemon notifies us, and we forward to EventBus
			// This enables vitals pressure reset regardless of snapshot source
			const daemonBridge = getDaemonBridge();
			void daemonBridge
				.initialize()
				.then(() => {
					logger.info("DaemonBridge initialized for cross-surface coordination");

					// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Wire DaemonBridge into SaveHandler
					// This enables SaveHandler to notify daemon of file modifications
					saveHandler.setDaemonBridge(daemonBridge);

					// 🆕 Wire DaemonBridge into UnifiedDashboardPanel (consolidated dashboard)
					// This enables the dashboard to refresh when snapshots are created from CLI/MCP
					// CONSOLIDATION: DashboardPanel and VitalsDashboardPanel wiring removed - all routes through UnifiedDashboardPanel
					UnifiedDashboardPanel.wireDaemonBridge(daemonBridge);
				})
				.catch((err) => {
					// Non-fatal: Extension continues without daemon coordination
					// Extension-only snapshots still work, just MCP/CLI won't reset vitals
					logger.warn("DaemonBridge initialization failed - cross-surface events unavailable", {
						error: err instanceof Error ? err.message : String(err),
					});
				});

			// Forward daemon snapshot.created notifications to EventBus
			const daemonSnapshotHandler = (event: SnapshotCreatedEvent) => {
				logger.info("Snapshot created via daemon (MCP/CLI) - forwarding to EventBus", {
					snapshotId: event.snapshotId,
					source: event.source,
					trigger: event.trigger,
					workspaceId: currentWorkspaceId,
				});

				// Forward to EventBus so AutoDecisionIntegration can reset vitals pressure
				// Include workspaceId for proper scope isolation
				bus.publish(SnapBackEvent.SNAPSHOT_CREATED, {
					id: event.snapshotId,
					filePath: event.filePath,
					source: event.source,
					trigger: event.trigger,
					workspaceId: currentWorkspaceId, // 🆕 Add workspace scope
				});

				// Note: refreshViews is handled by snapshotCreatedHandler which filters by workspace
			};
			daemonBridge.onSnapshotCreated(daemonSnapshotHandler);
			context.subscriptions.push({
				dispose: () => disposeDaemonBridge(),
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
			// 🆕 StatusBarController now exists for FSM-based status bar (vitals/risk states)
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
			intelligenceTreeProvider: phase4Result.intelligenceTreeProvider,
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
				logger.debug("PERF: Updating context in background...");
				const ctxStart = Date.now();
				await updateHasProtectedFilesContext();
				logger.info("Protected files context updated");

				// Update file protection context for active editor (defensive: editor or document may be undefined)
				const activeUri = vscode.window.activeTextEditor?.document?.uri;
				if (activeUri) {
					await updateFileProtectionContext(activeUri);
					logger.info("File protection context updated for active editor");
				}
				logger.debug("PERF: Context updates completed", { ms: Date.now() - ctxStart });
			} catch (err) {
				logger.error("Failed to update context in background", err as Error);
			}
		}, 100);

		// Listen for protection changes to update file protection context
		//  TDD: Wire cache invalidation + dashboard refresh on protection changes
		let auditDebounceTimer: NodeJS.Timeout | undefined;
		const protectionChangeListener = phase2Result.protectedFileRegistry.onProtectionChanged(async (uris) => {
			try {
				// Update the file protection context for the active editor (defensive: editor or document may be undefined)
				const activeUri = vscode.window.activeTextEditor?.document?.uri;
				if (activeUri) {
					await updateFileProtectionContext(activeUri);
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
			} catch (err) {
				logger.error("Error in protectionChangeListener", err as Error);
			}
		});
		context.subscriptions.push(protectionChangeListener);

		// Listen for active editor changes to update file protection context
		const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
			try {
				const uri = editor?.document?.uri;
				if (uri) {
					await updateFileProtectionContext(uri);
				}
			} catch (err) {
				logger.error("Error in activeEditorChangeListener", err as Error);
			}
		});
		context.subscriptions.push(activeEditorChangeListener);

		// Activation complete
		const elapsedTime = Date.now() - startTime;
		logger.info(`Extension activated in ${elapsedTime}ms`);
		outputChannel.appendLine(`✅ SnapBack activated in ${elapsedTime}ms`);

		// 🆕 Finalize health monitoring
		healthMonitor.endActivation();
		for (const [phase, duration] of Object.entries(phaseTimings)) {
			healthMonitor.recordPhaseTiming(phase, duration);
		}
		// Register default health checks with component refs
		// Note: Using simple existence checks - actual types are more complex
		createDefaultHealthChecks(healthMonitor, {
			storage: storage ? { isInitialized: () => true } : null,
			eventBus: eventBus ? { isInitialized: () => true } : null,
			mcpManager: phase2Result.mcpManager ? { getState: () => "connected" } : null,
			authState: authState ? { isAuthenticated: async () => authState?.isAuthenticated() ?? false } : null,
		});
		// Run health checks asynchronously (non-blocking)
		setImmediate(() => {
			healthMonitor.runHealthChecks().catch((err) => {
				logger.warn("Health check failed (non-critical)", {
					error: err instanceof Error ? err.message : String(err),
				});
			});
		});

		// Log phase timings for performance analysis
		// Note: logPhaseTimings moved to activation/phaseTracker.ts
		logPhaseTimings(outputChannel, phaseTimings, elapsedTime);
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

	// 🆕 Flush and close Sentry first to capture any final errors
	try {
		addBreadcrumb("Extension deactivation started", "lifecycle");
		await closeSentry();
		logger.debug("Sentry closed successfully");
	} catch (sentryError) {
		logger.warn("Error closing Sentry (non-critical)", {
			error: sentryError instanceof Error ? sentryError.message : String(sentryError),
		});
	}

	// 🆕 Dispose health monitor
	disposeHealthMonitor();

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

		// 🆕 Dispose HeatIntegration
		if (heatIntegration) {
			disposeHeatIntegration();
			heatIntegration = null;
			logger.info("HeatIntegration disposed");
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
		// REMOVED: aiRecordingTimeout cleanup - Recording state removed (Option 3)
		// REMOVED: vitalsIntegration dispose - consolidated into VitalsUIIntegration
		// VitalsUIIntegration is disposed as part of phase4Result
		if (vitalsStatusBar) {
			vitalsStatusBar.dispose();
			vitalsStatusBar = null;
			logger.info("StatusBarManager disposed");
		}

		// 🆕 Clear AIDetectionToast
		if (aiDetectionToast) {
			aiDetectionToast = null;
			logger.info("AIDetectionToast cleared");
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

		// 🆕 Dispose Language Server (LSP connection)
		try {
			await deactivateLanguageServer();
			logger.info("Language Server disposed");
		} catch (error) {
			logger.warn("Failed to dispose Language Server", {
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
