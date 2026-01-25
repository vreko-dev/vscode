import * as vscode from "vscode";
import type { SnapBackEventBus } from "@snapback/contracts";
import type { IStorageManager } from "../storage/types";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry";
import type { ConfigFileManager } from "../protection/ConfigFileManager";
import type { AutoProtectConfig } from "../protection/autoProtectConfig";
import type { SnapBackRCDecorator } from "../decorators/snapbackrcDecorator";
import type { SnapBackRCLoader } from "../protection/SnapBackRCLoader";
import type { DaemonBridge } from "../services/DaemonBridge";
import type { ProtectionManager as SDKProtectionManager } from "@snapback/sdk";
import type { WorkspaceMemoryManager } from "../workspaceMemory";
import type { OperationCoordinator } from "../operationCoordinator";
import type { SessionCoordinator } from "../snapshot/SessionCoordinator";
import type { SnapshotManager } from "../snapshot/SnapshotManager";
import type { SmartContextDetector } from "../smartContext";
import type { WorkflowIntegration } from "../workflowIntegration";
import type { ConflictResolver } from "../conflictResolver";
import type { NotificationManager } from "../notificationManager";
import type { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider";
import type { SnapshotNavigatorProvider } from "../views/snapshotNavigatorProvider";
import type { ProtectionService } from "../services/protectionService";
import type { UnifiedOnboardingService } from "../services/UnifiedOnboardingService";
import type { MCPToolsService } from "../services/MCPToolsService";
import type { PlatformCoordinator } from "../platform/PlatformCoordinator";
import type { SnapBackTreeProvider } from "../views/snapBackTreeProvider";
import type { IntelligenceTreeProvider } from "../views/IntelligenceTreeProvider";
import type { SnapshotDocumentProvider } from "../providers/SnapshotDocumentProvider";
import type { ProtectionDecorationProvider } from "../ui/ProtectionDecorationProvider";
import type { ProtectionCodeLensProvider } from "../providers/ProtectionCodeLensProvider";
import type { StatusBarManager } from "../ui/StatusBarManager";
import type { StatusBarController } from "../ui/statusBar/StatusBarController";
import type { MCPStatusItem } from "../ui/MCPStatusItem";
import type { WelcomeView } from "../welcomeView";
import type { SnapshotDecorations } from "../decorations/snapshotDecorations";
import type { DetectionCodeActionProvider } from "../providers/DetectionCodeActionProvider";
import type { FileHealthDecorationProvider } from "../decorations/FileHealthDecorationProvider";
import type { SessionsTreeProvider } from "../views/SessionsTreeProvider";
import type { WorkspaceSafetyService } from "../services/WorkspaceSafetyService";
import type { VitalsUIIntegration } from "../ui/VitalsUIIntegration";
import type { TelemetryProxy } from "../services/telemetry-proxy";

/**
 * Unified application context that accumulates services and providers during activation.
 * Replaces fragmented phase result objects.
 */
export interface AppContext {
	// Infrastructure
	context: vscode.ExtensionContext;
	workspaceRoot: string;
	eventBus?: SnapBackEventBus;
	telemetryProxy?: TelemetryProxy;

	// Storage & Registry (Phase 2)
	storage?: IStorageManager;
	protectedFileRegistry?: ProtectedFileRegistry;
	configManager?: ConfigFileManager;
	autoProtectConfig?: AutoProtectConfig;
	snapbackrcDecorator?: SnapBackRCDecorator;
	snapbackrcLoader?: SnapBackRCLoader;
	daemonBridge?: DaemonBridge;
	sdkProtectionManager?: SDKProtectionManager;

	// Managers (Phase 3)
	workspaceMemoryManager?: WorkspaceMemoryManager;
	operationCoordinator?: OperationCoordinator;
	sessionCoordinator?: SessionCoordinator;
	snapshotManager?: SnapshotManager;
	smartContextDetector?: SmartContextDetector;
	workflowIntegration?: WorkflowIntegration;
	conflictResolver?: ConflictResolver;
	notificationManager?: NotificationManager;
	snapshotSummaryProvider?: StorageSnapshotSummaryProvider;
	snapshotNavigatorProvider?: SnapshotNavigatorProvider;
	protectionService?: ProtectionService;
	unifiedOnboarding?: UnifiedOnboardingService;
	mcpToolsService?: MCPToolsService | null;
	platformCoordinator?: PlatformCoordinator;

	// Providers (Phase 4)
	snapBackTreeProvider?: SnapBackTreeProvider;
	intelligenceTreeProvider?: IntelligenceTreeProvider;
	snapshotDocumentProvider?: SnapshotDocumentProvider;
	protectionDecorationProvider?: ProtectionDecorationProvider;
	protectionCodeLensProvider?: ProtectionCodeLensProvider;
	statusBarManager?: StatusBarManager;
	statusBarController?: StatusBarController;
	mcpStatusItem?: MCPStatusItem;
	welcomeView?: WelcomeView;
	snapshotDecorations?: SnapshotDecorations;
	detectionCodeActionProvider?: DetectionCodeActionProvider;
	fileHealthDecorationProvider?: FileHealthDecorationProvider;
	sessionsTreeProvider?: SessionsTreeProvider;
	workspaceSafetyService?: WorkspaceSafetyService;
	vitalsUIIntegration?: VitalsUIIntegration;

	// Additionals
	workspaceManager?: import("../services/WorkspaceManager").WorkspaceManager;
	prwManager?: import("../domain/prwManager").PRWManager;
}
