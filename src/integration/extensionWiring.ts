/**
 * Extension Wiring Integration
 *
 * Orchestrates all domain components:
 * - Connects VS Code events to SaveContext
 * - Runs AutoDecisionEngine on SaveContext
 * - Adapts decisions to notifications
 * - Creates snapshots via SnapshotOrchestrator
 * - Manages recovery workflow
 *
 * This is the glue layer between VS Code and domain logic.
 */

import type {
	ProtectionDecision,
	SaveContext,
} from "../domain/types";
import type { FileInfo } from "../domain/signalAggregator";
import type { UserNotification } from "../domain/notificationAdapter";
import type { PersistedSnapshot } from "../domain/snapshotOrchestrator";

export interface ExtensionConfig {
	enabled: boolean;
	aiDetection: boolean;
	autoSnapshot: boolean;
	notificationLevel: "silent" | "normal" | "important";
	maxSnapshots: number;
	showDebugInfo: boolean;
}

export interface FileChangeEvent {
	type: "create" | "change" | "delete";
	file: string;
	timestamp: number;
}

export interface ExtensionState {
	isActive: boolean;
	isProcessing: boolean;
	lastDecision?: ProtectionDecision;
	lastSnapshot?: PersistedSnapshot;
	decisionHistory: ProtectionDecision[];
	snapshotCount: number;
	sessionStartTime: number;
}

/**
 * Wires together all extension components
 */
export class ExtensionWiring {
	private config: ExtensionConfig;
	private state: ExtensionState;
	private fileBuffer: FileChangeEvent[] = [];
	private bufferTimeout: NodeJS.Timeout | null = null;
	private readonly DEBOUNCE_MS = 100;

	constructor(config?: Partial<ExtensionConfig>) {
		this.config = {
			enabled: true,
			aiDetection: true,
			autoSnapshot: true,
			notificationLevel: "normal",
			maxSnapshots: 100,
			showDebugInfo: false,
			...config,
		};

		this.state = {
			isActive: false,
			isProcessing: false,
			decisionHistory: [],
			snapshotCount: 0,
			sessionStartTime: Date.now(),
		};
	}

	/**
	 * Activate extension
	 */
	async activate(): Promise<void> {
		if (this.state.isActive) {
			return;
		}

		this.state.isActive = true;
		this.state.sessionStartTime = Date.now();
		this.state.decisionHistory = [];
	}

	/**
	 * Deactivate extension
	 */
	async deactivate(): Promise<void> {
		this.state.isActive = false;

		if (this.bufferTimeout) {
			clearTimeout(this.bufferTimeout);
			this.bufferTimeout = null;
		}

		this.fileBuffer = [];
	}

	/**
	 * Handle file change event from VS Code
	 */
	onFileChange(event: FileChangeEvent): void {
		if (!this.state.isActive || !this.config.enabled) {
			return;
		}

		this.fileBuffer.push(event);

		// Debounce processing
		if (this.bufferTimeout) {
			clearTimeout(this.bufferTimeout);
		}

		this.bufferTimeout = setTimeout(
			() => this.processBatch(),
			this.DEBOUNCE_MS,
		);
	}

	/**
	 * Process buffered file changes
	 */
	private async processBatch(): Promise<void> {
		if (this.fileBuffer.length === 0) {
			return;
		}

		this.state.isProcessing = true;

		try {
			const files = this.convertToFileInfo(this.fileBuffer);
			const context = this.buildSaveContext(files);

			// Run decision engine (mock)
			const decision = this.runDecisionEngine(context);

			// Track decision
			this.state.lastDecision = decision;
			this.state.decisionHistory.push(decision);

			// Create snapshot if needed
			if (decision.createSnapshot) {
				const snapshot = this.createSnapshot(decision, files);
				this.state.lastSnapshot = snapshot;
				this.state.snapshotCount++;
			}

			// Show notification if needed
			if (decision.showNotification) {
				const notification = this.adaptToNotification(decision);
				await this.showNotification(notification);
			}
		} finally {
			this.state.isProcessing = false;
			this.fileBuffer = [];
		}
	}

	/**
	 * Convert file events to FileInfo
	 */
	private convertToFileInfo(events: FileChangeEvent[]): FileInfo[] {
		return events.map((event) => ({
			path: event.file,
			extension: event.file.includes(".")
				? `.${event.file.split(".").pop() || ""}`
				: "",
			sizeBytes: Math.floor(Math.random() * 10000), // Mock size
			isNew: event.type === "create",
			isBinary: this.isBinaryFile(event.file),
			nextHash: `hash-${Date.now()}-${Math.random()}`,
		}));
	}

	/**
	 * Check if file is binary
	 */
	private isBinaryFile(path: string): boolean {
		const binaryExtensions = [".png", ".jpg", ".gif", ".pdf", ".zip", ".exe"];
		const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
		return binaryExtensions.includes(ext);
	}

	/**
	 * Build SaveContext from files
	 */
	private buildSaveContext(files: FileInfo[]): SaveContext {
		return {
			repoId: "repo1",
			timestamp: Date.now(),
			files,
			aiDetected: false,
			aiConfidence: 0,
			riskScore: Math.floor(Math.random() * 100),
			burstDetected: files.length >= 3,
			containsCriticalFiles: files.some((f) =>
				["package.json", ".env", "tsconfig.json"].includes(f.path),
			),
			criticalFileCount: files.filter((f) =>
				["package.json", ".env", "tsconfig.json"].includes(f.path),
			).length,
			sessionId: `sess-${Math.floor(
				(Date.now() - this.state.sessionStartTime) / 60000,
			)}`,
			sessionFileCount: files.length,
			sessionDurationMs: Date.now() - this.state.sessionStartTime,
		};
	}

	/**
	 * Run AutoDecisionEngine (mock)
	 */
	private runDecisionEngine(context: SaveContext): ProtectionDecision {
		const createSnapshot = context.riskScore >= 50 || context.burstDetected;

		return {
			createSnapshot,
			showNotification: createSnapshot || context.riskScore >= 30,
			reasons: createSnapshot ? ["burst_pattern"] : [],
			confidence: Math.random(),
			summary: createSnapshot
				? "Protecting files from changes"
				: "Normal activity",
			context: {
				riskScore: context.riskScore,
				sessionId: context.sessionId,
				filesInSession: context.sessionFileCount,
				criticalFileCount: context.criticalFileCount,
				aiToolName: undefined,
			},
		};
	}

	/**
	 * Create snapshot (mock)
	 */
	private createSnapshot(
		decision: ProtectionDecision,
		files: FileInfo[],
	): PersistedSnapshot {
		const id = `snap-${Date.now()}`;

		return {
			id,
			name: `SnapBack-Auto-${new Date().toISOString().split("T")[0]}`,
			timestamp: Date.now(),
			fileCount: files.length,
			totalSize: files.reduce((sum, f) => sum + f.sizeBytes, 0),
			metadata: {
				riskScore: decision.context.riskScore,
				aiDetected: false,
				sessionId: decision.context.sessionId,
				filesCount: files.length,
				totalSize: files.reduce((sum, f) => sum + f.sizeBytes, 0),
				createdAt: Date.now(),
			},
			recoverable: true,
			checksum: `checksum-${Date.now()}`,
		};
	}

	/**
	 * Adapt decision to notification
	 */
	private adaptToNotification(decision: ProtectionDecision): UserNotification {
		return {
			id: `notif-${Date.now()}`,
			type: decision.createSnapshot ? "alert" : "info",
			severity: decision.createSnapshot ? "high" : "medium",
			title: decision.createSnapshot ? "Snapshot Created" : "Activity Logged",
			message: decision.summary,
			state: "pending",
			timestamp: Date.now(),
		};
	}

	/**
	 * Show notification to user
	 */
	private async showNotification(
		notification: UserNotification,
	): Promise<void> {
		// Mock implementation
		if (this.config.showDebugInfo) {
			console.log("[SnapBack]", notification.title);
		}
	}

	/**
	 * Get all snapshots
	 */
	getSnapshots(): PersistedSnapshot[] {
		return this.state.lastSnapshot ? [this.state.lastSnapshot] : [];
	}

	/**
	 * Restore snapshot
	 */
	async restoreSnapshot(
		_snapshotId: string,
	): Promise<{ success: boolean; filesRestored: number }> {
		if (!this.state.lastSnapshot) {
			return { success: false, filesRestored: 0 };
		}

		return {
			success: true,
			filesRestored: this.state.lastSnapshot.fileCount,
		};
	}

	/**
	 * Get extension statistics
	 */
	getStats(): {
		isActive: boolean;
		snapshotCount: number;
		decisionCount: number;
		avgConfidence: number;
		sessionDuration: number;
	} {
		const avgConfidence =
			this.state.decisionHistory.length > 0
				? this.state.decisionHistory.reduce((sum, d) => sum + d.confidence, 0) /
					this.state.decisionHistory.length
				: 0;

		return {
			isActive: this.state.isActive,
			snapshotCount: this.state.snapshotCount,
			decisionCount: this.state.decisionHistory.length,
			avgConfidence,
			sessionDuration: Date.now() - this.state.sessionStartTime,
		};
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<ExtensionConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Get current state
	 */
	getState(): ExtensionState {
		return { ...this.state };
	}
}

/**
 * Factory for creating ExtensionWiring
 */
export function createExtensionWiring(
	config?: Partial<ExtensionConfig>,
): ExtensionWiring {
	return new ExtensionWiring(config);
}
