import * as vscode from "vscode";
import { PolicyManager } from "../policy/PolicyManager.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import { logger } from "../utils/logger.js";
import type { ProtectionLevelMetadata } from "../views/types.js";
import { PROTECTION_LEVELS } from "../views/types.js";

export class ProtectionDecorationProvider
	implements vscode.FileDecorationProvider
{
	private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<
		vscode.Uri | vscode.Uri[]
	>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

	/**
	 * Debounce timer to prevent decoration thrashing on rapid file changes
	 * Delays decoration updates by 200ms to batch multiple rapid changes
	 */
	private debounceTimer: NodeJS.Timeout | undefined;
	private pendingUris: vscode.Uri[] = [];
	private policyManager: PolicyManager;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private registry: ProtectedFileRegistry,
		workspaceRoot: string,
	) {
		// REQUIRED: Listen to registry changes for decoration updates
		this.disposables.push(
			registry.onProtectionChanged((uris) => {
				logger.info(
					"[SnapBack] Decoration provider received onProtectionChanged event for URIs:",
					uris,
				);

				// Debounce decoration updates to prevent UI thrashing
				this.debounceDecorationUpdate(uris);
			}),
		);

		// Initialize policy manager for override checks
		this.policyManager = new PolicyManager(workspaceRoot);
		this.policyManager.initialize().catch((error) => {
			logger.error(
				"Failed to initialize policy manager for decorations",
				error,
			);
		});
	}

	/**
	 * Debounces decoration updates to prevent UI thrashing on rapid changes
	 * Batches multiple rapid changes into a single update after 200ms
	 */
	private debounceDecorationUpdate(uris: vscode.Uri[]): void {
		// Add new URIs to pending queue
		this.pendingUris.push(...uris);

		// Clear existing timer
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		// Set new timer to fire decoration update after 200ms
		this.debounceTimer = setTimeout(() => {
			if (this.pendingUris.length > 0) {
				logger.info(
					`[SnapBack] Firing debounced decoration update for ${this.pendingUris.length} URIs`,
				);
				this._onDidChangeFileDecorations.fire(this.pendingUris);
				this.pendingUris = [];
			}
			this.debounceTimer = undefined;
		}, 200);
	}

	provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
		const isProtected = this.registry.isProtected(uri.fsPath);

		if (isProtected) {
			// Get protection level from registry
			const protectionLevel =
				this.registry.getProtectionLevel(uri.fsPath) || "Watched";
			const levelMetadata: ProtectionLevelMetadata =
				PROTECTION_LEVELS[protectionLevel];

			// Check if file has an active override
			const activeOverride = this.policyManager.getActiveOverride(uri.fsPath);
			let badge = levelMetadata.icon;
			let tooltip = `Protected by SnapBack (${levelMetadata.label})`;

			// If file has an active override, modify the decoration
			if (activeOverride) {
				badge = "⚡"; // Use lightning bolt to indicate override
				tooltip = `Overridden by SnapBack (${levelMetadata.label}) - ${activeOverride.rationale}`;
			}

			// Only log protected files at debug level
			logger.debug(
				`[SnapBack] Decorated protected file: ${uri.fsPath} (${levelMetadata.label})`,
			);

			return new vscode.FileDecoration(
				badge,
				tooltip,
				new vscode.ThemeColor(levelMetadata.themeColor),
			);
		}

		return undefined;
	}

	dispose(): void {
		// Clear any pending debounce timer
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
		}
		this._onDidChangeFileDecorations.dispose();
		this.policyManager.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
