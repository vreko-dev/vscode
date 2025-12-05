import * as vscode from "vscode";
import type { SnapshotQuickDiffProvider } from "../providers/SnapshotQuickDiffProvider.js";
import type { SessionCoordinator } from "../snapshot/SessionCoordinator.js";
import type { SnapshotManager } from "../snapshot/SnapshotManager.js";
import { detectAIPresence } from "../utils/AIPresenceDetector.js";
import { logger } from "../utils/logger.js";

/**
 * Debounce state for a file
 */
interface DebounceState {
	timeout: NodeJS.Timeout;
	pendingEditor?: vscode.TextEditor;
	lastAIDetection: number;
}

/**
 * PreSnapshotService - Orchestration service for "pre-AI" snapshot creation
 *
 * Automatically creates snapshots when AI presence is detected, with intelligent
 * debouncing and change analysis to distinguish AI-generated changes from manual edits.
 *
 * Architecture:
 * - Listens to: onDidChangeActiveTextEditor, onDidChangeTextDocument, onDidCloseTextDocument
 * - AI detection → debounce (500ms) → create snapshot → track in QuickDiff
 * - Manual edit detection → clear tracking (user has modified AI-generated code)
 * - Performance: <50ms snapshot creation (non-blocking)
 *
 * Change Analysis Heuristics:
 * - Large insertion (>50 chars) → Likely AI
 * - Multi-line insertion (>2 lines) → Likely AI
 * - Single character edit → Likely manual
 * - Deletion → Likely manual
 *
 * @example
 * ```typescript
 * const service = new PreSnapshotService(
 *   snapshotManager,
 *   quickDiffProvider,
 *   sessionCoordinator,
 * );
 *
 * // Service automatically handles:
 * // 1. AI detected in editor → schedule debounced snapshot
 * // 2. Manual edit → clear tracking
 * // 3. Document close → cancel pending snapshots
 * ```
 */
export class PreSnapshotService implements vscode.Disposable {
	private debounceState: Map<string, DebounceState> = new Map();
	private disposables: vscode.Disposable[] = [];
	private readonly debounceMs: number;
	private readonly enabled: boolean;

	constructor(
		private snapshotManager: SnapshotManager,
		private quickDiffProvider: SnapshotQuickDiffProvider,
		private sessionCoordinator: SessionCoordinator,
	) {
		// Load configuration
		const config = vscode.workspace.getConfiguration("snapback");
		this.debounceMs = config.get<number>("preSnapshot.debounceMs", 500);
		this.enabled = config.get<boolean>("preSnapshot.enabled", true);

		// Register event listeners
		if (this.enabled) {
			this.registerEventListeners();
		}
	}

	/**
	 * Register VSCode event listeners
	 */
	private registerEventListeners(): void {
		// Listen to active editor changes
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor) {
					this.handleEditorChange(editor).catch((error) => {
						logger.error(
							"Failed to handle editor change",
							error instanceof Error ? error : undefined,
						);
					});
				}
			}),
		);

		// Listen to document changes (for manual edit detection)
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				this.handleTextDocumentChange(event).catch((error) => {
					logger.error(
						"Failed to handle text document change",
						error instanceof Error ? error : undefined,
					);
				});
			}),
		);

		// Listen to document close (cleanup)
		this.disposables.push(
			vscode.workspace.onDidCloseTextDocument((document) => {
				this.handleDocumentClose(document);
			}),
		);

		logger.debug("PreSnapshotService: Event listeners registered", {
			debounceMs: this.debounceMs,
		});
	}

	/**
	 * Handle editor change (potential AI activation)
	 *
	 * Called when user switches to a different editor. Checks for AI presence
	 * and schedules debounced snapshot creation if AI is active.
	 *
	 * @param editor - Active text editor
	 */
	public async handleEditorChange(editor: vscode.TextEditor): Promise<void> {
		if (!this.enabled) {
			return;
		}

		// Check if AI is active
		const aiPresence = detectAIPresence();
		if (!aiPresence.hasAI) {
			return;
		}

		// Get file URI key
		const fileKey = editor.document.uri.toString();

		// Cancel previous timeout if exists
		const existingState = this.debounceState.get(fileKey);
		if (existingState) {
			clearTimeout(existingState.timeout);
		}

		// Schedule debounced snapshot
		const timeout = setTimeout(() => {
			this.createPreSnapshot(editor.document.uri, editor).catch((error) => {
				logger.error(
					"Failed to create pre-snapshot",
					error instanceof Error ? error : undefined,
					{ fileUri: editor.document.uri.toString() },
				);
			});
			// Remove debounce state after execution
			this.debounceState.delete(fileKey);
		}, this.debounceMs);

		// Store debounce state
		this.debounceState.set(fileKey, {
			timeout,
			pendingEditor: editor,
			lastAIDetection: Date.now(),
		});

		logger.debug("PreSnapshotService: Scheduled debounced snapshot", {
			fileUri: editor.document.uri.toString(),
			debounceMs: this.debounceMs,
		});
	}

	/**
	 * Handle text document change (manual edit detection)
	 *
	 * Analyzes document changes to detect manual edits. If manual edit is detected,
	 * clears QuickDiff tracking (user has modified AI-generated code).
	 *
	 * @param event - Text document change event
	 */
	public async handleTextDocumentChange(
		event: vscode.TextDocumentChangeEvent,
	): Promise<void> {
		if (!this.enabled) {
			return;
		}

		// Analyze all changes
		for (const change of event.contentChanges) {
			const analysis = this.analyzeChange(change);

			// If manual edit detected, clear tracking
			if (analysis.likelyManual) {
				this.quickDiffProvider.clearTracking(event.document.uri);
				logger.debug(
					"PreSnapshotService: Manual edit detected, cleared tracking",
					{
						fileUri: event.document.uri.toString(),
						changeLength: change.text.length,
					},
				);
				break; // Only need to clear once
			}
		}
	}

	/**
	 * Handle document close (cleanup)
	 *
	 * Clears tracking and cancels pending snapshots for closed documents.
	 *
	 * @param document - Closed text document
	 */
	public handleDocumentClose(document: vscode.TextDocument): void {
		// Clear tracking
		this.quickDiffProvider.clearTracking(document.uri);

		// Cancel pending snapshot
		const fileKey = document.uri.toString();
		const state = this.debounceState.get(fileKey);
		if (state) {
			clearTimeout(state.timeout);
			this.debounceState.delete(fileKey);
		}

		logger.debug("PreSnapshotService: Document closed, cleaned up", {
			fileUri: document.uri.toString(),
		});
	}

	/**
	 * Create "pre-AI" snapshot for a file
	 *
	 * Creates snapshot with "Pre-AI" description, adds to session coordinator,
	 * and tracks in QuickDiff provider.
	 *
	 * Performance target: <50ms
	 *
	 * @param uri - File URI
	 * @param editor - Text editor (for content access)
	 */
	private async createPreSnapshot(
		uri: vscode.Uri,
		editor: vscode.TextEditor,
	): Promise<void> {
		try {
			const startTime = performance.now();

			// Read current file content
			const content = editor.document.getText();
			const relativePath = vscode.workspace.asRelativePath(uri, false);

			// Create snapshot
			const snapshot = await this.snapshotManager.createSnapshot(
				[
					{
						path: relativePath,
						content,
						action: "modify",
					},
				],
				{
					description: `Pre-AI: ${relativePath}`,
					protected: false,
				},
			);

			// Track in QuickDiff provider
			this.quickDiffProvider.trackSnapshot(uri, snapshot.id);

			// Add to session coordinator
			if (this.sessionCoordinator) {
				const stats = {
					added: content.split("\n").length,
					deleted: 0,
				};
				this.sessionCoordinator.addCandidate(
					uri.toString(),
					snapshot.id,
					stats,
				);
			}

			const duration = performance.now() - startTime;
			logger.info("PreSnapshotService: Created pre-AI snapshot", {
				snapshotId: snapshot.id,
				fileUri: uri.toString(),
				durationMs: Math.round(duration),
			});

			// Performance warning if exceeds budget
			if (duration > 50) {
				logger.warn("PreSnapshotService: Snapshot creation exceeded budget", {
					durationMs: Math.round(duration),
					budget: 50,
				});
			}
		} catch (error) {
			// Don't track on error
			logger.error(
				"PreSnapshotService: Failed to create snapshot",
				error instanceof Error ? error : undefined,
				{ fileUri: uri.toString() },
			);
		}
	}

	/**
	 * Analyze change to determine if AI-generated or manual
	 *
	 * Heuristics:
	 * - Large insertion (>50 chars) → AI
	 * - Multi-line (>2 lines) → AI
	 * - Single char → Manual
	 * - Deletion → Manual
	 *
	 * @param change - Text document content change
	 * @returns Analysis result with likelyAI and likelyManual flags
	 */
	private analyzeChange(change: vscode.TextDocumentContentChangeEvent): {
		likelyAI: boolean;
		likelyManual: boolean;
	} {
		const insertedText = change.text;
		const deletedLength = change.rangeLength;

		// Deletion → Manual
		if (deletedLength > 0 && insertedText.length === 0) {
			return { likelyAI: false, likelyManual: true };
		}

		// Single character insertion → Manual
		if (insertedText.length === 1) {
			return { likelyAI: false, likelyManual: true };
		}

		// Large insertion (>50 chars) → AI
		if (insertedText.length > 50) {
			return { likelyAI: true, likelyManual: false };
		}

		// Multi-line insertion (>2 lines) → AI
		const lineCount = insertedText.split("\n").length;
		if (lineCount > 2) {
			return { likelyAI: true, likelyManual: false };
		}

		// Default: ambiguous (don't take action)
		return { likelyAI: false, likelyManual: false };
	}

	/**
	 * Dispose service and clean up resources
	 */
	dispose(): void {
		// Cancel all pending timeouts
		for (const state of this.debounceState.values()) {
			clearTimeout(state.timeout);
		}
		this.debounceState.clear();

		// Dispose event listeners
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];

		logger.debug("PreSnapshotService: Disposed");
	}
}
