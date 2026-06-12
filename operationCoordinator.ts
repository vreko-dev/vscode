/**
 * OperationCoordinator - Centralized coordination for snapshot operations
 *
 * Thin facade that delegates to specialized services:
 * - OperationManager: Operation lifecycle and dependency tracking
 * - SnapshotService: Snapshot creation and listing
 * - RestoreService: Snapshot restoration with conflict handling
 *
 * @module operationCoordinator
 */

import type { ConflictResolver } from "./conflictResolver.js";
import { VrekoEvent, type VrekoEventBus } from "./events";
import { OperationManager } from "./operations/operation-manager.js";
import { RestoreService } from "./operations/restore-service.js";
import { SnapshotService } from "./operations/snapshot-service.js";
import type { DetailedRestoreResult, Operation, RestoreOptions } from "./operations/types.js";
import type { DaemonBridge } from "./services/DaemonBridge.js";
import type { TelemetryProxy } from "./services/telemetry-proxy.js";
import type { UnifiedOnboardingService } from "./services/UnifiedOnboardingService.js";
import type { SessionCoordinator } from "./snapshot/SessionCoordinator.js";
import type { IStorageManager } from "./storage/types.js";
import type { NotificationCoordinator } from "./ui/NotificationCoordinator.js";
import type { WorkspaceMemoryManager } from "./workspaceMemory.js";

/**
 * Re-export types for backward compatibility
 */
export type { DetailedRestoreResult, Operation } from "./operations/types.js";

/**
 * Centralized coordination engine for managing complex multi-step operations.
 *
 * @class OperationCoordinator
 * @description Thin facade that orchestrates snapshot and restore operations
 * through delegated services.
 */
export class OperationCoordinator {
	private readonly operationManager: OperationManager;
	private readonly snapshotService: SnapshotService;
	private readonly restoreService: RestoreService;

	constructor(
		private workspaceMemory: WorkspaceMemoryManager,
		private notificationCoordinator: NotificationCoordinator,
		storage: IStorageManager,
		telemetryProxy: TelemetryProxy,
		conflictResolver: ConflictResolver,
		private unifiedOnboarding: UnifiedOnboardingService,
		sessionCoordinator: SessionCoordinator,
		private eventBus?: VrekoEventBus,
		daemonBridge?: DaemonBridge,
	) {
		this.operationManager = new OperationManager();
		this.snapshotService = new SnapshotService(
			storage,
			workspaceMemory,
			notificationCoordinator,
			sessionCoordinator,
			eventBus,
			daemonBridge,
		);
		this.restoreService = new RestoreService(
			storage,
			telemetryProxy,
			unifiedOnboarding,
			conflictResolver,
			eventBus,
		);
	}

	// ==================== Operation Management ====================

	/** @deprecated Use operationManager.startOperation directly */
	startOperation(id: string, name: string, dependencies?: string[]): void {
		this.operationManager.startOperation(id, name, dependencies);
	}

	/** @deprecated Use operationManager.updateOperationProgress directly */
	updateOperationProgress(id: string, progress: number): void {
		this.operationManager.updateOperationProgress(id, progress);
	}

	/** @deprecated Use operationManager.updateOperationStatus directly */
	updateOperationStatus(id: string, status: "pending" | "running" | "completed" | "failed"): void {
		this.operationManager.updateOperationStatus(id, status);
	}

	/** @deprecated Use operationManager.getOperation directly */
	getOperation(id: string): Operation | undefined {
		return this.operationManager.getOperation(id);
	}

	/** @deprecated Use operationManager.getAllOperations directly */
	getAllOperations(): Operation[] {
		return this.operationManager.getAllOperations();
	}

	/** @deprecated Use operationManager.canStartOperation directly */
	canStartOperation(id: string): boolean {
		return this.operationManager.canStartOperation(id);
	}

	// ==================== Snapshot Operations ====================

	/**
	 * Creates a snapshot of the workspace or specific files
	 */
	async coordinateSnapshotCreation(
		showNotification = true,
		specificFiles?: string[],
		providedFileContents?: Record<string, string>,
		customSnapshotName?: string,
		sessionId?: string,
	): Promise<string | undefined> {
		const operationId = `snapshot-${Date.now()}`;
		this.operationManager.startOperation(operationId, "Create Snapshot");

		try {
			const result = await this.snapshotService.createSnapshot(
				{
					showNotification,
					specificFiles,
					providedFileContents,
					customSnapshotName,
					sessionId,
				},
				this.operationManager.getOperation(operationId)!,
				(progress) => this.operationManager.updateOperationProgress(operationId, progress),
			);

			this.operationManager.updateOperationStatus(operationId, "completed");
			return result.snapshotId;
		} catch (error) {
			this.operationManager.updateOperationStatus(operationId, "failed");
			throw error;
		}
	}

	/**
	 * Lists all available snapshots
	 */
	async listSnapshots(): Promise<
		Array<{
			id: string;
			name: string;
			timestamp: number;
			fileCount: number;
			anchorFile?: string;
			fileContents?: Record<string, string>;
		}>
	> {
		return this.snapshotService.listSnapshots();
	}

	/**
	 * Gets a snapshot with its file contents
	 */
	async getSnapshotWithContent(snapshotId: string): Promise<{
		id: string;
		name: string;
		timestamp: number;
		fileCount: number;
		fileContents: Record<string, string>;
	} | null> {
		return this.snapshotService.getSnapshotWithContent(snapshotId);
	}

	// ==================== Restore Operations ====================

	/**
	 * Restores workspace to a previous snapshot
	 */
	async restoreToSnapshot(snapshotId: string, options?: RestoreOptions): Promise<DetailedRestoreResult> {
		const operationId = `restore-${Date.now()}`;
		this.operationManager.startOperation(operationId, "Restore from Snapshot", [snapshotId]);

		try {
			this.operationManager.updateOperationProgress(operationId, 10);
			const result = await this.restoreService.restoreToSnapshot(snapshotId, options);

			if (result.success) {
				this.operationManager.updateOperationStatus(operationId, "completed");
			} else {
				this.operationManager.updateOperationStatus(operationId, "failed");
			}

			this.operationManager.updateOperationProgress(operationId, 100);
			return result;
		} catch (error) {
			this.operationManager.updateOperationStatus(operationId, "failed");
			throw error;
		}
	}

	// ==================== Risk Analysis ====================

	/**
	 * Coordinates risk analysis workflow
	 */
	async coordinateRiskAnalysis(filePath: string): Promise<void> {
		const operationId = `risk-analysis-${Date.now()}`;
		this.operationManager.startOperation(operationId, "Risk Analysis", [`file-access-${filePath}`]);

		const startTime = Date.now();
		this.publishEvent(VrekoEvent.ANALYSIS_REQUESTED, {
			filePath,
			analysisType: "risk",
			timestamp: startTime,
		});

		try {
			this.workspaceMemory.updateLastActiveFile(filePath);
			this.workspaceMemory.updateProtectionStatus("analyzing");
			await this.workspaceMemory.saveContext();

			// Simulate analysis phases
			this.operationManager.updateOperationProgress(operationId, 30);
			await new Promise((resolve) => setTimeout(resolve, 300));
			this.operationManager.updateOperationProgress(operationId, 60);
			await new Promise((resolve) => setTimeout(resolve, 300));
			this.operationManager.updateOperationProgress(operationId, 90);

			this.operationManager.updateOperationStatus(operationId, "completed");
			this.operationManager.updateOperationProgress(operationId, 100);

			this.workspaceMemory.updateProtectionStatus("protected");
			await this.workspaceMemory.saveContext();

			this.publishEvent(VrekoEvent.ANALYSIS_COMPLETED, {
				filePath,
				riskScore: 85,
				duration: Date.now() - startTime,
				timestamp: Date.now(),
			});

			this.notificationCoordinator.showWarning("risk-detected", "Risk detected: MEDIUM");
		} catch (error) {
			this.operationManager.updateOperationStatus(operationId, "failed");
			this.workspaceMemory.updateProtectionStatus("atRisk");
			await this.workspaceMemory.saveContext();

			this.publishEvent(VrekoEvent.ANALYSIS_COMPLETED, {
				filePath,
				error: (error as Error).message,
				duration: Date.now() - startTime,
				timestamp: Date.now(),
			});

			throw error;
		}
	}

	// ==================== Utility Methods ====================

	/**
	 * Gets the unified onboarding service
	 */
	getUnifiedOnboarding(): UnifiedOnboardingService {
		return this.unifiedOnboarding;
	}

	/**
	 * Publishes event if eventBus is available
	 */
	private publishEvent<T>(event: VrekoEvent, payload: T): void {
		if (this.eventBus) {
			this.eventBus.publish(event, payload);
		}
	}
}
