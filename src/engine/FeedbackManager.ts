import * as vscode from "vscode";
import { TelemetryService } from "../analytics/telemetry";
import { PointsTracker } from "../pioneer/PointsTracker";

interface DetectionContext {
	id: string;
	confidence: number;
	document: vscode.TextDocument;
	timestamp: number;
}

/**
 * FeedbackManager - Handles AI detection feedback from users
 *
 * Fixes:
 * 1. Self-heals document reference from active editor (no caller dependency)
 * 2. Only dismisses on significant edits (newlines or 5+ chars), preserving UX
 *
 * Features:
 * - Singleton pattern for global feedback coordination
 * - LRU cache to prevent duplicate reports
 * - Smart dismissal triggers (document changes, editor switch, timeout)
 * - Implicit acceptance tracking via telemetry
 * - Points reward system for user feedback
 */
export class FeedbackManager {
	private static instance: FeedbackManager;
	private statusBar: vscode.StatusBarItem;

	// State Management
	private currentDetection?: DetectionContext;
	private activeDisposables: vscode.Disposable[] = [];
	private activeTimeout: NodeJS.Timeout | undefined;

	// Cache: ID -> Timestamp (LRU)
	private handledDetections = new Map<string, number>();
	private readonly MAX_CACHE_SIZE = 1000;

	private constructor() {
		this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.statusBar.command = "snapback.feedback.reportFalsePositive";
	}

	public static getInstance(): FeedbackManager {
		if (!FeedbackManager.instance) {
			FeedbackManager.instance = new FeedbackManager();
		}
		return FeedbackManager.instance;
	}

	/**
	 * Triggered by BurstDetector when heuristic fires
	 *
	 * Fix #1: Self-heals document reference from active editor
	 */
	public handleDetection(detectionId: string, confidence: number) {
		// Fix #1: Self-heal the document reference from active editor
		const document = vscode.window.activeTextEditor?.document;
		if (!document) {
			return;
		}

		// 0. Clean up previous active detection
		if (this.currentDetection) {
			this.dismiss(false);
		}

		this.currentDetection = {
			id: detectionId,
			confidence,
			document,
			timestamp: Date.now(),
		};

		// 1. Configure Status Bar
		if (confidence > 0.8) {
			this.statusBar.text = "$(robot) AI Detected";
			this.statusBar.tooltip = "SnapBack is protecting this burst.\n\nIncorrect? Click to report (+50 pts)";
			this.statusBar.backgroundColor = undefined;
		} else {
			this.statusBar.text = "$(robot)? AI Uncertain";
			this.statusBar.tooltip = "Unsure detection. Help us verify (+20 pts)";
			this.statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
		}

		this.statusBar.show();

		// 2. Register Context-Aware Dismissal Triggers
		this.registerDismissalTriggers();

		// 3. Fallback Timeout
		// Note: TelemetryService.getInstance() is guarded in logImplicitAcceptance() with try/catch
		// to prevent race conditions when timer fires before initialization
		this.activeTimeout = setTimeout(() => {
			this.logImplicitAcceptance();
			this.dismiss(false);
		}, 30000);
	}

	public async reportFalsePositive() {
		if (!this.currentDetection) {
			return;
		}
		const { id, confidence } = this.currentDetection;

		if (this.handledDetections.has(id)) {
			vscode.window.showWarningMessage("You've already verified this detection!");
			return;
		}

		const reason = await vscode.window.showQuickPick(
			[
				{ label: "✍️ I wrote it manually", code: "manual" },
				{ label: "📄 Copied from documentation", code: "docs" },
				{ label: "♻️ Refactored existing code", code: "refactor" },
				{ label: "📋 Paste from StackOverflow", code: "clipboard" },
			],
			{ placeHolder: "Help us improve: What was the source?" },
		);

		if (!reason) {
			return;
		}

		this.addToHandledCache(id);

		try {
			// Guard: Check if TelemetryService is initialized before calling getInstance()
			// This prevents "TelemetryService not initialized" error
			if (!TelemetryService.isInitialized()) {
				console.warn("[FeedbackManager] TelemetryService not initialized, skipping feedback tracking");
				vscode.window.showInformationMessage("Thanks for your feedback!");
				this.dismiss(false);
				return;
			}

			const telemetry = TelemetryService.getInstance();
			await telemetry.track("feedback_submitted", {
				detection_id: id,
				verdict: "false_positive",
				reason: reason.code,
				model_confidence: confidence,
			});

			const pointsTracker = new PointsTracker();
			pointsTracker.addPoints("feedback", { type: "false_positive_report", detection_id: id });

			vscode.window.showInformationMessage("Thanks! +50 pts awarded.");
		} catch (error) {
			console.error("[FeedbackManager] Feedback tracking failed:", error);
			vscode.window.showInformationMessage("Thanks for your feedback!");
		}

		this.dismiss(false);
	}

	private registerDismissalTriggers() {
		// Fix #2: Only dismiss on "Significant" edits
		this.activeDisposables.push(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (!this.currentDetection || e.document !== this.currentDetection.document) {
					return;
				}

				// Check for "commitment" signals
				const hasNewline = e.contentChanges.some((c) => c.text.includes("\n"));
				const isSignificant = e.contentChanges.some((c) => c.text.length > 5);

				if (hasNewline || isSignificant) {
					this.dismiss(true); // User committed to the code = Implicit True Positive
				}
			}),
		);

		this.activeDisposables.push(vscode.window.onDidChangeActiveTextEditor(() => this.dismiss(false)));

		this.activeDisposables.push(
			vscode.workspace.onDidSaveTextDocument((doc) => {
				if (this.currentDetection && doc === this.currentDetection.document) {
					this.dismiss(true);
				}
			}),
		);
	}

	private dismiss(logImplicit: boolean) {
		if (logImplicit && this.currentDetection) {
			this.logImplicitAcceptance();
		}
		this.statusBar.hide();
		this.currentDetection = undefined;
		this.resetState();
	}

	/**
	 * Logs implicit acceptance when user doesn't report false positive.
	 * Guards against TelemetryService race condition - timer can fire before initialization.
	 */
	private logImplicitAcceptance() {
		if (!this.currentDetection) {
			return;
		}
		if (this.handledDetections.has(this.currentDetection.id)) {
			return;
		}

		try {
			// Guard: Check if TelemetryService is initialized before calling getInstance()
			// This prevents "TelemetryService not initialized" error when setTimeout fires early
			if (!TelemetryService.isInitialized()) {
				console.warn("[FeedbackManager] TelemetryService not initialized, skipping implicit acceptance log");
				return;
			}

			const telemetry = TelemetryService.getInstance();
			telemetry.track("feedback_ignored", {
				detection_id: this.currentDetection.id,
				confidence: this.currentDetection.confidence,
				verdict: "implicit_true_positive",
				duration_ms: Date.now() - this.currentDetection.timestamp,
			});
			this.addToHandledCache(this.currentDetection.id);
		} catch (e) {
			// Catch any remaining errors (network issues, etc.)
			console.error("[FeedbackManager] Failed to log implicit acceptance:", e);
		}
	}

	private addToHandledCache(id: string) {
		if (this.handledDetections.size >= this.MAX_CACHE_SIZE) {
			const oldest = this.handledDetections.keys().next().value as string;
			if (oldest) {
				this.handledDetections.delete(oldest);
			}
		}
		this.handledDetections.set(id, Date.now());
	}

	private resetState() {
		if (this.activeTimeout) {
			clearTimeout(this.activeTimeout);
			this.activeTimeout = undefined;
		}
		for (const d of this.activeDisposables) {
			d.dispose();
		}
		this.activeDisposables = [];
	}
}
