import type { SnapBackEventBus } from "@snapback/contracts";
import * as vscode from "vscode";
import type { AnonymousIdManager } from "../auth/AnonymousIdManager";
import type { AuthState } from "../auth/AuthState";
import { UnifiedAuthProvider } from "../auth/UnifiedAuthProvider";
import type { EventBridge } from "../bridges/EventBridge";
import type { SignalBridge } from "../bridges/SignalBridge";
import type { PRWManager } from "../domain/prwManager";
import type { HeatIntegration } from "../heat";
import type { AutoDecisionIntegration } from "../integration/AutoDecisionIntegration";
import { disposeAllMCPClients, type getMCPClient } from "../mcp";
import type { AIDetectionToast } from "../notifications/AIDetectionToast";
import { EditMonitorService } from "../services/EditMonitorService";
import type { FeatureFlagService } from "../services/feature-flag-service";
import type { UserIdentityService } from "../services/UserIdentityService";
import type { WorkspaceManager } from "../services/WorkspaceManager";
import type { IStorageManager } from "../storage/types";
import type { initializeActivationFunnel } from "../telemetry/ActivationFunnelIntegration";
import type { StatusBarManager } from "../ui/StatusBarManager";
import { logger } from "../utils/logger";

export class ExtensionHost implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];

	// Services
	public storage: IStorageManager | null = null;
	public eventBus: InstanceType<typeof SnapBackEventBus> | null = null;
	public featureFlagService: FeatureFlagService | null = null;
	public workspaceManager: WorkspaceManager | null = null;
	public authState: AuthState | null = null;
	public anonymousIdManager: AnonymousIdManager | null = null;
	public autoDecisionIntegration: AutoDecisionIntegration | null = null;
	public userIdentityService: UserIdentityService | null = null;
	public activationFunnel: ReturnType<typeof initializeActivationFunnel> | null = null;
	public prwManager: PRWManager | null = null;
	public signalBridge: SignalBridge | null = null;
	public mcpClient: ReturnType<typeof getMCPClient> | null = null;
	public eventBridge: EventBridge | null = null;
	public statusBarManager: StatusBarManager | null = null;
	public aiDetectionToast: AIDetectionToast | null = null;
	public heatIntegration: HeatIntegration | null = null;
	public editMonitor: EditMonitorService | null = null;
	public unifiedAuthProvider: UnifiedAuthProvider | null = null;

	constructor(public readonly context: vscode.ExtensionContext) {}

	/**
	 * Registers a disposable to be cleaned up on deactivation
	 */
	public register<T extends vscode.Disposable>(disposable: T): T {
		this.disposables.push(disposable);
		return disposable;
	}

	/**
	 * Sets up the unified auth provider
	 */
	public async initAuthProvider(isTestMode: boolean) {
		this.unifiedAuthProvider = new UnifiedAuthProvider(this.context, isTestMode);
		this.register(
			vscode.authentication.registerAuthenticationProvider(
				"snapback",
				"SnapBack Auth",
				this.unifiedAuthProvider,
				{
					supportsMultipleAccounts: false,
				},
			),
		);
		return this.unifiedAuthProvider;
	}

	/**
	 * Initializes the edit monitor once required services are ready
	 */
	public initEditMonitor() {
		if (this.signalBridge) {
			this.editMonitor = new EditMonitorService({
				signalBridge: this.signalBridge,
				statusBarManager: this.statusBarManager,
				aiDetectionToast: this.aiDetectionToast,
				prwManager: this.prwManager,
			});
			this.disposables.push(this.editMonitor);
		}
	}

	public dispose() {
		// Specific cleanups
		if (this.mcpClient) {
			disposeAllMCPClients();
		}

		this.disposables.forEach((d) => {
			try {
				d.dispose();
			} catch (err) {
				logger.warn("Error during disposal", { error: err });
			}
		});
		this.disposables = [];
	}
}
