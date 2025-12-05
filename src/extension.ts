/**
 * @fileoverview SnapBack Extension Entry Point - Modular Architecture
 *
 * This module serves as the primary entry point for the SnapBack VS Code extension,
 * implementing a modular architecture with clear separation of concerns.
 *
 * @author SnapBack Architecture Team
 * @version 1.0.0
 */

// Import real EventBus from @snapback/events
import { SnapBackEvent, SnapBackEventBus } from "@snapback/events";
import * as vscode from "vscode";
import { initializePhase1Services } from "./activation/phase1-services.js";
import { initializePhase2Storage } from "./activation/phase2-storage.js";
import { initializePhase3Managers } from "./activation/phase3-managers.js";
import { initializePhase4Providers } from "./activation/phase4-providers.js";
import { initializePhase5Registration } from "./activation/phase5-registration.js";
import { createAuthedApiClient } from "./api/authedApiClient.js";
import { AnonymousIdManager } from "./auth/AnonymousIdManager.js";
import { AuthState } from "./auth/AuthState.js";
import { createCredentialsManager } from "./auth/credentials.js";
import { SnapBackOAuthProvider } from "./auth/OAuthProvider.js"; // 🆕 Import OAuth provider
import { registerAllCommands } from "./commands/index.js";
import { initializeProtectionNotifications } from "./commands/protectionCommands.js";
import { ContextManager } from "./contextManager.js";
import { FileHealthDecorationProvider } from "./decorations/FileHealthDecorationProvider.js"; // 🆕 Import FileHealthDecorationProvider
import { SaveHandler } from "./handlers/SaveHandler.js";
import { FileSystemWatcher } from "./protection/FileSystemWatcher.js";
import { RulesManager } from "./rules/RulesManager.js";
import {
	NoopAIRiskService,
	RemoteAIRiskService,
} from "./services/aiRiskService.js";
import { ApiClient } from "./services/api-client.js";
import { FeatureFlagService } from "./services/feature-flag-service.js"; // 🆕 Import FeatureFlagService
import { ProtectionManager } from "./services/protectionPolicy.js";
import { ProtectionService } from "./services/protectionService.js";
import { TelemetryProxy } from "./services/telemetry-proxy.js";
import { WorkspaceManager } from "./services/WorkspaceManager.js"; // 🆕 Import WorkspaceManager
import type { StorageManager } from "./storage/StorageManager.js";
import type { ProtectionChangedPayload } from "./types/api.js";
import { CooldownIndicator } from "./ui/cooldownIndicator.js"; // 🆕 Import CooldownIndicator
import { SnapBackCodeLensProvider } from "./ui/SnapBackCodeLensProvider.js";
import { SnapshotRestoreUI } from "./ui/SnapshotRestoreUI.js";
import { logger } from "./utils/logger.js";
import { findProjectRoot } from "./utils/projectRoot.js";
import { WorkspaceFolderResolver } from "./utils/WorkspaceFolderResolver.js"; // 🆕 Import WorkspaceFolderResolver
import { registerEmptyViews, showErrorInViews } from "./views/ViewRegistry.js";
import { AutoDecisionIntegration } from "./integration/AutoDecisionIntegration.js"; // 🆕 Import AutoDecisionIntegration

// Import the new EventBus and feature flag

// Global reference to storage for cleanup during deactivation
let storage: StorageManager | null = null;
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

export async function activate(context: vscode.ExtensionContext) {
	const startTime = Date.now();
	const phaseTimings: Record<string, number> = {};

	// Initialize output channel and logger
	const outputChannel = vscode.window.createOutputChannel("SnapBack");
	context.subscriptions.push(outputChannel);
	context.subscriptions.push(outputChannel);
	logger.getInstance(outputChannel);

	// 🛡️ Defensive Registration: Register views immediately so UI is never empty
	registerEmptyViews(context);

	logger.info("Extension activation started");
	outputChannel.appendLine("🚀 SnapBack Extension Activating...");
	outputChannel.appendLine("[PERF] Measuring activation phases...");

	// 🆕 Register OAuth authentication provider
	SnapBackOAuthProvider.register(context);
	logger.info("OAuth authentication provider registered");

	// 🆕 Initialize feature flag service
	featureFlagService = new FeatureFlagService();

	// 🆕 Check if this is the first time the extension is installed
	const hasBeenInstalled = context.globalState.get<boolean>(
		"snapback.installed",
		false,
	);
	if (!hasBeenInstalled) {
		// Mark as installed
		await context.globalState.update("snapback.installed", true);

		// Track extension installation
		try {
			const extension = vscode.extensions.getExtension("snapback.snapback");
			const extensionVersion = extension?.packageJSON.version || "unknown";

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
	}

	// 🆕 Initialize WorkspaceFolderResolver for early workspace verification
	// This is lightweight and doesn't require storage
	const workspaceFolderResolver = new WorkspaceFolderResolver(
		vscode.workspace.workspaceFolders || [],
	);
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
		logger.info(
			`Multi-root workspace detected: ${workspaceFolderResolver.getWorkspaceCount()} folders`,
		);
		logger.info(`Primary workspace: ${workspaceRoot}`);
	}

	// Check workspace trust
	const isWorkspaceTrusted = vscode.workspace.isTrusted;
	if (!isWorkspaceTrusted) {
		logger.warn(
			"Workspace is not trusted - SnapBack is running in limited mode",
		);
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
		setTimeout(
			() =>
				vscode.window.showInformationMessage(
					"SnapBack is running in offline mode",
				),
			100,
		);
	}

	try {
		// Initialize event bus with EventEmitter2
		eventBus = new SnapBackEventBus();
		try {
			await eventBus.initialize();
			logger.info("EventEmitter2 event bus initialized");
		} catch (err) {
			logger.error(
				"Failed to initialize EventEmitter2 event bus",
				err as Error,
			);
		}

		// Phase 1: Core services
		const phase1Start = Date.now();
		initializePhase1Services();
		phaseTimings["Phase 1 (Services)"] = Date.now() - phase1Start;

		// Phase 2: Storage and configuration (fail-fast if unavailable)
		const phase2Start = Date.now();
		const phase2Result = await initializePhase2Storage(workspaceRoot, context);
		phaseTimings["Phase 2 (Storage)"] = Date.now() - phase2Start;
		storage = phase2Result.storage;

		// 🆕 Initialize WorkspaceManager now that context is available
		// This provides workspace-aware operations for commands and services
		workspaceManager = new WorkspaceManager(
			vscode.workspace.workspaceFolders || [],
			context,
		);
		logger.info("WorkspaceManager initialized");

		// 🆕 Create cooldown indicator
		const cooldownIndicator = new CooldownIndicator(
			phase2Result.protectedFileRegistry,
		);
		context.subscriptions.push(cooldownIndicator);

		// Phase 3: Business logic managers
		const phase3Start = Date.now();
		const phase3Result = await initializePhase3Managers(
			context,
			workspaceRoot,
			phase2Result.storage,
			phase2Result.protectedFileRegistry,
			phase2Result.snapbackrcLoader, // 🟢 TDD GREEN: Pass for ProtectionService
		);
		phaseTimings["Phase 3 (Managers)"] = Date.now() - phase3Start;

		// Initialize additional components that were missing
		const fileHealthDecorationProvider = new FileHealthDecorationProvider();

		// Phase 2 Slice 4: Initialize AIRiskService
		const guardianEnabled = config.get<boolean>(
			"snapback.guardian.enabled",
			true,
		);
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
		);
		saveHandler.register(context);

		// 🆕 Check if file health decorations are enabled
		const showFileHealthDecorations = config.get<boolean>(
			"showFileHealthDecorations",
			true,
		);
		if (showFileHealthDecorations) {
			// 🆕 Register file health decoration provider only if enabled
			context.subscriptions.push(fileHealthDecorationProvider);
			vscode.window.registerFileDecorationProvider(
				fileHealthDecorationProvider,
			);
		}

		// Create file watcher
		const fileWatcher = new FileSystemWatcher(
			phase2Result.protectedFileRegistry,
		);
		context.subscriptions.push(fileWatcher);

		// Phase 4: UI providers
		const phase4Start = Date.now();
		const credentialsManager = createCredentialsManager(context.secrets);
		const apiClient = createAuthedApiClient(context);

		// 🆕 Initialize AuthState (authentication status checker)
		authState = new AuthState(credentialsManager);
		logger.info("AuthState initialized");

		// 🆕 Initialize AnonymousIdManager (anonymous user tracking)
		anonymousIdManager = new AnonymousIdManager(context.globalState);
		logger.info("AnonymousIdManager initialized");

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
		await initializePhase5Registration(
			context,
			phase4Result,
			phase3Result.sessionCoordinator,
		);
		phaseTimings["Phase 5 (Registration)"] = Date.now() - phase5Start;

		// 🆕 Phase 14: Initialize AutoDecisionIntegration (session-level AI protection)
		const phase14Start = Date.now();
		autoDecisionIntegration = new AutoDecisionIntegration(
			phase3Result.snapshotManager,
			phase3Result.notificationManager,
			{
				riskThreshold: config.get<number>("snapback.autoDecision.riskThreshold", 60),
				notifyThreshold: config.get<number>("snapback.autoDecision.notifyThreshold", 40),
				minFilesForBurst: config.get<number>("snapback.autoDecision.minFilesForBurst", 3),
				maxSnapshotsPerMinute: config.get<number>("snapback.autoDecision.maxSnapshotsPerMinute", 4),
			},
			context, // Pass context for globalState storage persistence
		);
		autoDecisionIntegration.activate();
		context.subscriptions.push({
			dispose: () => autoDecisionIntegration?.deactivate(),
		});
		phaseTimings["Phase 14 (AutoDecision)"] = Date.now() - phase14Start;
		logger.info("AutoDecisionIntegration activated");
		if (offlineModeEnabled) {
			phase4Result.statusBarController.setOfflineMode(true);
		}

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
		const contextManager = new ContextManager(
			phase2Result.protectedFileRegistry,
		);

		// Phase 2 Slice 5: Initialize ProtectionService for repo audit
		const existingProtectionManager =
			phase2Result.snapbackrcLoader?.getProtectionManager();
		const protectionManagerInstance =
			existingProtectionManager ||
			new ProtectionManager(
				phase2Result.protectedFileRegistry,
				() => phase2Result.snapbackrcLoader?.getMergedConfig() ?? null,
			);
		const protectionService = new ProtectionService(
			phase2Result.protectedFileRegistry,
			protectionManagerInstance,
			aiRiskService,
			(key: string, value: any) => {
				vscode.commands.executeCommand("setContext", key, value);
			},
		);

		// ⚡ PERF: Defer audit to background (after UI becomes responsive)
		// Don't await - this can take 10-20 seconds on large repos
		setTimeout(() => {
			console.log("[PERF] Running deferred auditRepo...");
			const auditStart = Date.now();
			protectionService
				.auditRepo()
				.catch((err) => {
					logger.error("Deferred protection audit failed", err as Error);
					console.log("[PERF] auditRepo failed", {
						ms: Date.now() - auditStart,
					});
				})
				.then(() => {
					console.log("[PERF] auditRepo completed", {
						ms: Date.now() - auditStart,
					});
				});
		}, 50); // Run early but after UI is responsive

		// Create refreshViews function
		const refreshViews = () => {
			phase4Result.protectedFilesTreeProvider.refresh();
			phase4Result.snapshotNavigatorProvider.refresh();
		};

		// Register RPC handlers for MCP requests
		if (eventBus) {
			// Handler: Get protection level for file
			eventBus.onRequest(
				"get_protection_level",
				async (data: { filePath: string }) => {
					const isProtected = phase2Result.protectedFileRegistry.isProtected(
						data.filePath,
					);
					const protectionLevel =
						phase2Result.protectedFileRegistry.getProtectionLevel(
							data.filePath,
						);
					return {
						filePath: data.filePath,
						isProtected,
						level: protectionLevel || null,
					};
				},
			);
			// Note: onRequest doesn't return a Disposable; cleanup handled in deactivate()

			// Handler: Get iteration statistics
			eventBus.onRequest(
				"get_iteration_stats",
				async (data: { filePath: string }) => {
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
				},
			);
			// Note: onRequest doesn't return a Disposable; cleanup handled in deactivate()

			// Handler: Create snapshot
			eventBus.onRequest(
				"create_snapshot",
				async (data: { filePath: string; reason?: string }) => {
					const fileContent = await vscode.workspace.fs.readFile(
						vscode.Uri.file(data.filePath),
					);
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
				},
			);
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
				vscode.window.showInformationMessage(
					`🧢 Snapshot created by AI: ${data.id}`,
				);
			};
			bus.on(SnapBackEvent.SNAPSHOT_CREATED, snapshotCreatedHandler);
			context.subscriptions.push({
				dispose: () =>
					bus.off(SnapBackEvent.SNAPSHOT_CREATED, snapshotCreatedHandler),
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
				dispose: () =>
					bus.off(SnapBackEvent.PROTECTION_CHANGED, protectionChangedHandler),
			});

			const analysisCompletedHandler = (payload: unknown) => {
				logger.info("Analysis completed event received", payload);
				// Could update UI or show notifications based on analysis results
			};
			bus.on(SnapBackEvent.ANALYSIS_COMPLETED, analysisCompletedHandler);
			context.subscriptions.push({
				dispose: () =>
					bus.off(SnapBackEvent.ANALYSIS_COMPLETED, analysisCompletedHandler),
			});
		}

		// Create updateFileProtectionContext function
		const updateFileProtectionContext = async (uri: vscode.Uri) => {
			const isProtected = phase2Result.protectedFileRegistry.isProtected(
				uri.fsPath,
			);
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.fileProtected",
				isProtected,
			);
			// Also update the context manager
			await contextManager.updateContextForFile(uri.fsPath);
		};

		// Create updateHasProtectedFilesContext function
		const updateHasProtectedFilesContext = async () => {
			const protectedFiles = await phase2Result.protectedFileRegistry.list();
			await vscode.commands.executeCommand(
				"setContext",
				"snapback.hasProtectedFiles",
				protectedFiles.length > 0,
			);
		};

		// Create getProtectionStateSummary function
		const getProtectionStateSummary = async () => {
			const protectedFiles = await phase2Result.protectedFileRegistry.list();
			const watchCount = protectedFiles.filter(
				(f) => f.protectionLevel === "Watched",
			).length;
			const warnCount = protectedFiles.filter(
				(f) => f.protectionLevel === "Warning",
			).length;
			const blockCount = protectedFiles.filter(
				(f) => f.protectionLevel === "Protected",
			).length;

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
			statusBarController: phase4Result.statusBarController,
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
			explorerTreeProvider: phase4Result.explorerTreeProvider,

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
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.isActive",
			true,
		);
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
		const protectionChangeListener =
			phase2Result.protectedFileRegistry.onProtectionChanged(async (uris) => {
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
						level: "Watched", // Default level
						timestamp: Date.now(),
					};
					eventBus.publish(SnapBackEvent.PROTECTION_CHANGED, payload);
				}
			});
		context.subscriptions.push(protectionChangeListener);

		// Listen for active editor changes to update file protection context
		const activeEditorChangeListener =
			vscode.window.onDidChangeActiveTextEditor(async (editor) => {
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
			outputChannel.appendLine(
				`\n✅ Activation time within budget (${elapsedTime}ms < 500ms)`,
			);
		}
	} catch (error) {
		logger.error("Activation failed", error as Error);
		vscode.window.showErrorMessage(
			`SnapBack activation failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
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
async function showDeferredWorkspaceTrustWarning(
	context: vscode.ExtensionContext,
): Promise<void> {
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
			await vscode.commands.executeCommand("workbench.action.manageTrust");
		} else if (result === "Don't Show Again") {
			await context.globalState.update(ACK_KEY, true);
		}
	} catch (error) {
		logger.error("Error showing workspace trust warning", error as Error);
	}
}
