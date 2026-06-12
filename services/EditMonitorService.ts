import * as vscode from "vscode";
import type { SignalBridge } from "../bridges/SignalBridge";
import { FeedbackManager } from "../engine/FeedbackManager";
import type { AIDetectionToast, AISignal } from "../notifications/AIDetectionToast";
import type { StatusFlagManager } from "../signals/StatusFlagManager";
import { isMonitorableDocument } from "../utils/documentFilters";
import { calculateLineDiff } from "../utils/lineDiff";
import { logger } from "../utils/logger";
import { getWorkspaceVitalsSync } from "./IntelligenceService";
import type { PRWManager } from "./PRWManager";

export interface EditMonitorDeps {
	signalBridge: SignalBridge;
	statusFlagManager: StatusFlagManager | null;
	aiDetectionToast: AIDetectionToast | null;
	prwManager: PRWManager | null;
}

export class EditMonitorService implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private isActivationGracePeriod = true;
	private gracePeriodTimeout: NodeJS.Timeout | null = null;
	private lastDetection = { time: 0, tool: "", file: "" };
	private readonly DETECTION_DEDUP_MS = 100;

	constructor(private readonly deps: EditMonitorDeps) {
		this.startGracePeriod();
		this.registerListeners();
	}

	private startGracePeriod() {
		this.gracePeriodTimeout = setTimeout(() => {
			this.isActivationGracePeriod = false;
			this.gracePeriodTimeout = null;
			logger.info("EditMonitor: Activation grace period ended (6s), detection now active");
		}, 6000);
	}

	private registerListeners() {
		this.disposables.push(vscode.workspace.onDidChangeTextDocument((e) => this.handleDocumentChange(e)));
	}

	private handleDocumentChange(e: vscode.TextDocumentChangeEvent) {
		if (!isMonitorableDocument(e.document)) {
			return;
		}

		if (this.isActivationGracePeriod) {
			logger.debug("Grace period: Skipping document change event", {
				file: e.document.fileName,
			});
			return;
		}

		if (e.reason === vscode.TextDocumentChangeReason.Undo || e.reason === vscode.TextDocumentChangeReason.Redo) {
			return;
		}

		// Compute burst state
		const burstState = this.deps.signalBridge.computeBurst(e.document, e.contentChanges);

		// Track line changes for behavioral metadata
		const { linesAdded, linesDeleted } = calculateLineDiff(e.contentChanges);
		if (linesAdded > 0 || linesDeleted > 0) {
			const workspaceId = vscode.workspace.workspaceFolders?.[0]?.uri.toString() || "default";
			const vitals = getWorkspaceVitalsSync(workspaceId);
			if (vitals) {
				vitals.recordEdit(linesAdded, linesDeleted);
			}
		}

		if (burstState.detected && burstState.velocity && burstState.filePath) {
			const riskScore = Math.min(100, Math.round(burstState.velocity * 10));
			void this.deps.prwManager?.handleSave(burstState.filePath, riskScore);

			// Trigger feedback
			try {
				const feedbackManager = FeedbackManager.getInstance();
				const detectionId = `burst-${Date.now()}-${burstState.filePath.split("/").pop()}`;
				const confidence = Math.min(1, burstState.velocity / 100);
				feedbackManager.handleDetection(detectionId, confidence);
			} catch (error) {
				logger.warn("FeedbackManager trigger failed", { error });
			}

			// Status bar animation
			if (this.deps.statusFlagManager) {
				void this.deps.statusFlagManager.showBurstDetectedSequence();
			}
		}

		// Detect AI tool usage
		const aiResult = this.deps.signalBridge.detectAI(e.document, e.contentChanges);
		if (aiResult.tool) {
			if (this.isDuplicateDetection(aiResult.tool, e.document.fileName)) {
				return;
			}

			this.lastDetection = {
				time: Date.now(),
				tool: aiResult.tool,
				file: e.document.fileName,
			};

			logger.info("[SB_STATUS] AI tool detected", {
				tool: aiResult.tool,
				method: aiResult.method,
			});

			if (this.deps.statusFlagManager) {
				void this.deps.statusFlagManager.showAIDetectedSequence(aiResult.tool);
			}

			if (this.deps.aiDetectionToast) {
				const signals: AISignal[] = [
					{
						type: aiResult.method || "paste",
						confidence: aiResult.confidence,
					},
				];
				void this.deps.aiDetectionToast.show(signals);
			}
		}
	}

	private isDuplicateDetection(tool: string, file: string): boolean {
		const now = Date.now();
		return (
			this.lastDetection.tool === tool &&
			this.lastDetection.file === file &&
			now - this.lastDetection.time < this.DETECTION_DEDUP_MS
		);
	}

	dispose() {
		if (this.gracePeriodTimeout) {
			clearTimeout(this.gracePeriodTimeout);
		}
		this.disposables.forEach((d) => d.dispose());
		this.disposables = [];
	}
}
