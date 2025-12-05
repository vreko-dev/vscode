import { createTwoFilesPatch, parsePatch } from "diff";
import * as vscode from "vscode";
import type { SnapshotStorage } from "../storage/types";
import { logger } from "../utils/logger.js";

/**
 * SnapshotDecorations provides inline annotations for files showing changes since the last snapshot
 *
 * This class adds gutter markers and hover information to show users which lines have changed
 * since the last snapshot, similar to GitLens functionality.
 */
export class SnapshotDecorations {
	private decorationType: vscode.TextEditorDecorationType;
	private hoverProvider: vscode.Disposable | null = null;
	private disposables: vscode.Disposable[] = [];
	private storage: SnapshotStorage | undefined;

	// Throttling and caching mechanisms
	private updateTimeout: NodeJS.Timeout | null = null;
	private lastUpdateTimestamp = 0;
	private updateCache: Map<
		string,
		{ ranges: vscode.Range[]; timestamp: number }
	> = new Map();
	private readonly CACHE_DURATION = 30000; // 30 seconds cache
	private readonly MIN_UPDATE_INTERVAL = 1000; // Minimum 1 second between updates

	constructor(storage?: SnapshotStorage) {
		this.storage = storage;

		// Create decoration type for changed lines
		// Remove gutterIconPath as it doesn't work with ThemeIcon
		this.decorationType = vscode.window.createTextEditorDecorationType({
			// Use overview ruler for visual indication instead of gutter icon
			overviewRulerLane: vscode.OverviewRulerLane.Right,
			overviewRulerColor: new vscode.ThemeColor("editorGutter.addedBackground"),
			light: {
				overviewRulerColor: "rgba(0, 128, 0, 0.6)",
			},
			dark: {
				overviewRulerColor: "rgba(0, 128, 0, 0.6)",
			},
		});

		this.disposables.push(this.decorationType);
	}

	/**
	 * Activate the snapshot decorations
	 */
	activate(context: vscode.ExtensionContext): void {
		// Register event listeners
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor) {
					this.throttledUpdateDecorations(editor);
				}
			}),
		);

		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				const editor = vscode.window.activeTextEditor;
				if (editor && event.document === editor.document) {
					this.throttledUpdateDecorations(editor);
				}
			}),
		);

		// Register hover provider for snapshot information
		this.hoverProvider = vscode.languages.registerHoverProvider(
			{ scheme: "file" },
			{
				provideHover: async (document, position) => {
					return this.provideHover(document, position);
				},
			},
		);

		if (this.hoverProvider) {
			this.disposables.push(this.hoverProvider);
		}

		// Update decorations for the currently active editor
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			this.throttledUpdateDecorations(editor);
		}

		// Add disposables to extension context
		context.subscriptions.push(...this.disposables);
	}

	/**
	 * Deactivate and clean up resources
	 */
	deactivate(): void {
		this.clearAllDecorations();
		this.disposables.forEach((disposable) => {
			disposable.dispose();
		});

		// Clear any pending timeouts
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
			this.updateTimeout = null;
		}

		// Clear cache
		this.updateCache.clear();
	}

	/**
	 * Throttled update decorations with caching
	 */
	private throttledUpdateDecorations(editor: vscode.TextEditor): void {
		// Clear any existing timeout
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}

		// Check if enough time has passed since last update
		const now = Date.now();
		const timeSinceLastUpdate = now - this.lastUpdateTimestamp;

		if (timeSinceLastUpdate >= this.MIN_UPDATE_INTERVAL) {
			// Update immediately if enough time has passed
			this.updateDecorations(editor);
			this.lastUpdateTimestamp = now;
		} else {
			// Schedule update for later
			const delay = this.MIN_UPDATE_INTERVAL - timeSinceLastUpdate;
			this.updateTimeout = setTimeout(() => {
				this.updateDecorations(editor);
				this.lastUpdateTimestamp = Date.now();
				this.updateTimeout = null;
			}, delay);
		}
	}

	/**
	 * Update decorations for a specific editor with caching
	 */
	private async updateDecorations(editor: vscode.TextEditor): Promise<void> {
		try {
			// Check if feature is enabled
			const config = vscode.workspace.getConfiguration("snapback");
			const enabled = config.get<boolean>("snapshotDecorations.enabled", true);

			if (!enabled || !this.storage) {
				this.clearDecorations(editor);
				return;
			}

			const document = editor.document;
			const workspaceFolders = vscode.workspace.workspaceFolders;

			if (!workspaceFolders || workspaceFolders.length === 0) {
				this.clearDecorations(editor);
				return;
			}

			// Get relative file path using proper path normalization
			const relativePath = vscode.workspace.asRelativePath(document.fileName);

			// Check cache first
			const cacheKey = `${relativePath}-${document.version}`;
			const cached = this.updateCache.get(cacheKey);
			const now = Date.now();

			if (cached && now - cached.timestamp < this.CACHE_DURATION) {
				// Use cached results
				editor.setDecorations(this.decorationType, cached.ranges);
				return;
			}

			// Clean up old cache entries
			this.cleanupCache();

			// Get all snapshots for this file
			const snapshots = await this.storage.listSnapshots();
			const fileSnapshots = snapshots
				.filter(
					(snapshot) =>
						snapshot.files && snapshot.files[relativePath] !== undefined,
				)
				.sort((a, b) => b.timestamp - a.timestamp);

			if (fileSnapshots.length === 0) {
				this.clearDecorations(editor);
				// Cache the empty result
				this.updateCache.set(cacheKey, { ranges: [], timestamp: now });
				return;
			}

			// Get the most recent snapshot
			const latestSnapshot = fileSnapshots[0];
			const snapshotData = await this.storage.getSnapshot(latestSnapshot.id);

			if (
				!snapshotData ||
				!snapshotData.contents ||
				snapshotData.contents[relativePath] === undefined
			) {
				this.clearDecorations(editor);
				// Cache the empty result
				this.updateCache.set(cacheKey, { ranges: [], timestamp: now });
				return;
			}

			// Get snapshot content
			const snapshotContent = snapshotData.contents[relativePath];
			const currentContent = document.getText();

			// Generate diff to identify changed lines
			const diffResult = createTwoFilesPatch(
				"snapshot",
				"current",
				snapshotContent,
				currentContent,
				undefined,
				undefined,
				{ context: 0 },
			);

			// Parse diff to find changed line ranges
			const changedRanges = this.parseDiff(diffResult, document);

			// Apply decorations
			editor.setDecorations(this.decorationType, changedRanges);

			// Cache the results
			this.updateCache.set(cacheKey, {
				ranges: changedRanges,
				timestamp: now,
			});
		} catch (error) {
			logger.error(
				"Error updating snapshot decorations:",
				error instanceof Error ? error : undefined,
			);
			this.clearDecorations(editor);
		}
	}

	/**
	 * Cleanup old cache entries
	 */
	private cleanupCache(): void {
		const now = Date.now();
		for (const [key, value] of this.updateCache.entries()) {
			if (now - value.timestamp >= this.CACHE_DURATION) {
				this.updateCache.delete(key);
			}
		}
	}

	/**
	 * Parse diff output to extract changed line ranges
	 */
	private parseDiff(
		diffText: string,
		_document: vscode.TextDocument,
	): vscode.Range[] {
		const ranges: vscode.Range[] = [];

		try {
			// Parse the diff using the diff library
			const patches = parsePatch(diffText);

			for (const patch of patches) {
				for (const hunk of patch.hunks || []) {
					let currentLine = hunk.newStart - 1; // Convert to 0-based

					for (const line of hunk.lines) {
						if (line.startsWith("+")) {
							// Added line in current file
							const position = new vscode.Position(currentLine, 0);
							const range = new vscode.Range(position, position);
							ranges.push(range);
							currentLine++;
						} else if (line.startsWith("-")) {
							// Removed line - don't increment currentLine
							// We only decorate lines that exist in the current file
						} else if (line.startsWith(" ")) {
							// Unchanged line
							currentLine++;
						} else {
							// Other line types (context, etc.)
							currentLine++;
						}
					}
				}
			}
		} catch (error) {
			logger.error(
				"Error parsing diff:",
				error instanceof Error ? error : undefined,
			);
		}

		return ranges;
	}

	/**
	 * Provide hover information for snapshot changes
	 */
	private async provideHover(
		document: vscode.TextDocument,
		_position: vscode.Position,
	): Promise<vscode.Hover | undefined> {
		try {
			if (!this.storage) {
				return undefined;
			}

			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return undefined;
			}

			// Get relative file path using proper path normalization
			const relativePath = vscode.workspace.asRelativePath(document.fileName);

			// Get all snapshots for this file
			const snapshots = await this.storage.listSnapshots();
			const fileSnapshots = snapshots
				.filter(
					(snapshot) =>
						snapshot.files && snapshot.files[relativePath] !== undefined,
				)
				.sort((a, b) => b.timestamp - a.timestamp);

			if (fileSnapshots.length === 0) {
				return undefined;
			}

			// Get the most recent snapshot
			const latestSnapshot = fileSnapshots[0];
			const snapshotData = await this.storage.getSnapshot(latestSnapshot.id);

			if (
				!snapshotData ||
				!snapshotData.contents ||
				snapshotData.contents[relativePath] === undefined
			) {
				return undefined;
			}

			// For now, return a simple hover message
			// In a more advanced implementation, we could show the actual snapshot content
			const hoverText = new vscode.MarkdownString(
				"$(history) This line has changed since the last snapshot\n\n" +
					`**Snapshot:** ${latestSnapshot.id.substring(0, 8)}\n` +
					`**Time:** ${new Date(latestSnapshot.timestamp).toLocaleString()}`,
			);
			hoverText.isTrusted = true;

			return new vscode.Hover(hoverText);
		} catch (error) {
			logger.error(
				"Error providing snapshot hover:",
				error instanceof Error ? error : undefined,
			);
			return undefined;
		}
	}

	/**
	 * Clear decorations from a specific editor
	 */
	private clearDecorations(editor: vscode.TextEditor): void {
		editor.setDecorations(this.decorationType, []);
	}

	/**
	 * Clear decorations from all visible editors
	 */
	private clearAllDecorations(): void {
		const editors = vscode.window.visibleTextEditors;
		for (const editor of editors) {
			this.clearDecorations(editor);
		}
	}
}
