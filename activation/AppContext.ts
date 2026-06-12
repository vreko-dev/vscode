import type { FeatureManager } from "@vreko/contracts";
import type * as vscode from "vscode";
import type { AuthState } from "../auth/AuthState";
import type { VrekoChatParticipant } from "../chat/VrekoChatParticipant";
import type { ConflictResolver } from "../conflictResolver";
import type { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider";
import type { SnapshotDecorations } from "../decorations/snapshotDecorations";
import type { VrekoRCDecorator } from "../decorators/vrekorcDecorator";
import type { VrekoEventBus } from "../events";
import type { RecurrenceNotificationManager } from "../notifications/RecurrenceNotificationManager";
import type { OperationCoordinator } from "../operationCoordinator";
import type { PlatformCoordinator } from "../platform/PlatformCoordinator";
import type { AutoProtectConfig } from "../protection/autoProtectConfig";
import type { ConfigFileManager } from "../protection/ConfigFileManager";
import type { VrekoRCLoader } from "../protection/VrekoRCLoader";
import type { DetectionCodeActionProvider } from "../providers/DetectionCodeActionProvider";
import type { ProtectionCodeLensProvider } from "../providers/ProtectionCodeLensProvider";
import type { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider";
import type { RollbackService } from "../rollback/RollbackService";
import type { ActivityPersistenceService } from "../services/ActivityPersistenceService";
import type { DaemonBridge } from "../services/DaemonBridge";
import type { DaemonHealthConsumer } from "../services/DaemonHealthConsumer";
import type { MCPToolsService } from "../services/MCPToolsService";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import type { ProtectionService } from "../services/protectionService";
import type { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider";
import type { TelemetryProxy } from "../services/telemetry-proxy";
import type { UnifiedOnboardingService } from "../services/UnifiedOnboardingService";
import type { WorkspaceSafetyService } from "../services/WorkspaceSafetyService";
import type { StatusFlagManager } from "../signals/StatusFlagManager";
import type { SmartContextDetector } from "../smartContext";
import type { SessionCoordinator } from "../snapshot/SessionCoordinator";
import type { SnapshotManager } from "../snapshot/SnapshotManager";
import type { IStorageManager } from "../storage/types";
import type { ActivityFeedBridge } from "../ui/ActivityFeedBridge";
import type { MCPStatusItem } from "../ui/MCPStatusItem";
import type { NotificationCoordinator } from "../ui/NotificationCoordinator";
import type { ProjectionStore } from "../ui/ProjectionStore";
import type { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider";
import type { StatusBarController } from "../ui/statusBar/StatusBarController";
import type { RecoveryTreeProvider } from "../ui/tree/RecoveryTreeProvider";
import type { VitalsUIIntegration } from "../ui/VitalsUIIntegration";
import type { CockpitTreeProvider } from "../views/CockpitTreeProvider";
import type { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider";
import type { CeremonyWebViewProvider } from "../webview/CeremonyWebViewProvider";
import type { WorkflowIntegration } from "../workflowIntegration";
import type { WorkspaceMemoryManager } from "../workspaceMemory";

/**
 * Unified application context that accumulates services and providers during activation.
 * Replaces fragmented phase result objects.
 */
export interface AppContext {
	// Infrastructure
	context: vscode.ExtensionContext;
	workspaceRoot: string;
	eventBus?: VrekoEventBus;
	telemetryProxy?: TelemetryProxy;
	authState?: AuthState;

	// Storage & Registry (Phase 2)
	storage?: IStorageManager;
	protectedFileRegistry?: ProtectedFileRegistry;
	configManager?: ConfigFileManager;
	autoProtectConfig?: AutoProtectConfig;
	vrekorcDecorator?: VrekoRCDecorator;
	vrekorcLoader?: VrekoRCLoader;
	daemonBridge?: DaemonBridge;
	featureManager?: FeatureManager;
	// sdkProtectionManager removed - thin client uses VSCode storage, not SDK directly

	// Managers (Phase 3)
	workspaceMemoryManager?: WorkspaceMemoryManager;
	operationCoordinator?: OperationCoordinator;
	sessionCoordinator?: SessionCoordinator;
	snapshotManager?: SnapshotManager;
	rollbackService?: RollbackService;
	smartContextDetector?: SmartContextDetector;
	workflowIntegration?: WorkflowIntegration;
	conflictResolver?: ConflictResolver;
	notificationCoordinator?: NotificationCoordinator;
	snapshotSummaryProvider?: StorageSnapshotSummaryProvider;
	snapshotNavigatorProvider?: SnapshotNavigatorProvider;
	protectionService?: ProtectionService;
	unifiedOnboarding?: UnifiedOnboardingService;
	mcpToolsService?: MCPToolsService | null;
	platformCoordinator?: PlatformCoordinator;
	activityPersistenceService?: ActivityPersistenceService;
	chatParticipant?: VrekoChatParticipant;

	// Providers (Phase 4)
	treeProvider?: CockpitTreeProvider;
	ceremonyWebViewProvider?: CeremonyWebViewProvider;
	recoveryTreeProvider?: RecoveryTreeProvider;
	snapshotDocumentProvider?: SnapshotDocumentProvider;
	protectionDecorationProvider?: ProtectionDecorationProvider;
	protectionCodeLensProvider?: ProtectionCodeLensProvider;
	statusFlagManager?: StatusFlagManager;
	statusBarController?: StatusBarController;
	projectionStore?: ProjectionStore;
	activityFeedBridge?: ActivityFeedBridge;
	mcpStatusItem?: MCPStatusItem;
	snapshotDecorations?: SnapshotDecorations;
	detectionCodeActionProvider?: DetectionCodeActionProvider;
	fileHealthDecorationProvider?: FileHealthDecorationProvider;
	workspaceSafetyService?: WorkspaceSafetyService;
	vitalsUIIntegration?: VitalsUIIntegration;

	// Additionals
	workspaceManager?: import("../services/WorkspaceManager").WorkspaceManager;
	prwManager?: import("../services/PRWManager").PRWManager;

	// Health Monitoring (Consolidated  -  daemon is single source of truth)
	daemonHealthConsumer?: DaemonHealthConsumer;

	// Notifications (Phase 4b)
	recurrenceNotificationManager?: RecurrenceNotificationManager;
}
