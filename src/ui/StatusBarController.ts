/**
 * StatusBarController - Coordinates status bar state management
 *
 * This controller manages the UnifiedStatusBar state based on various inputs:
 * - Extension enabled/disabled
 * - AI detection recording status
 * - Snapshot counts
 * - Attention needs
 *
 * Reference: Status Bar Consolidation Spec
 *
 * STATE PRIORITY (highest first):
 * 1. DISABLED - Extension error or user disabled
 * 2. ATTENTION - Needs user action
 * 3. RECORDING - Active session (temporary state)
 * 4. ACTIVITY - Has recent activity to report
 * 5. PROTECTED - Default fallback
 *
 * @packageDocumentation
 */

import type * as vscode from "vscode";
import { AIDetectionToast, type AISignal } from "../notifications/AIDetectionToast";
import { type StateOptions, StatusBarState, UnifiedStatusBar } from "./UnifiedStatusBar";

/**
 * StatusBarController - Manages unified status bar state
 *
 * Design principles:
 * - Single source of truth for status bar state
 * - Clear priority order for state resolution
 * - Handles AI detection via toast (not status bar)
 */
export class StatusBarController implements vscode.Disposable {
	private readonly statusBar: UnifiedStatusBar;
	private readonly aiToast: AIDetectionToast;

	// State inputs
	private extensionEnabled = true;
	private needsAttention = false;
	private isRecording = false;
	private snapshotCount = 0;

	constructor() {
		this.statusBar = new UnifiedStatusBar();
		this.aiToast = new AIDetectionToast();
	}

	/**
	 * Set extension enabled/disabled state
	 */
	setExtensionEnabled(enabled: boolean): void {
		this.extensionEnabled = enabled;
		this.updateStatusBar();
	}

	/**
	 * Set whether something needs user attention
	 */
	setNeedsAttention(attention: boolean): void {
		this.needsAttention = attention;
		this.updateStatusBar();
	}

	/**
	 * Set recording state (active AI session)
	 */
	setRecording(recording: boolean): void {
		this.isRecording = recording;
		this.updateStatusBar();
	}

	/**
	 * Set snapshot count for today
	 */
	setSnapshotCount(count: number): void {
		this.snapshotCount = count;
		this.updateStatusBar();
	}

	/**
	 * Handle AI detection (shows toast, not status bar)
	 */
	async handleAIDetection(signals: AISignal[]): Promise<void> {
		await this.aiToast.show(signals);
	}

	/**
	 * Reset session state
	 * Call when starting a new work session
	 */
	resetSession(): void {
		this.aiToast.resetSession();
		this.isRecording = false;
		this.needsAttention = false;
		this.updateStatusBar();
	}

	/**
	 * Get the resolved state based on current inputs
	 * Priority: DISABLED > ATTENTION > RECORDING > ACTIVITY > PROTECTED
	 */
	getResolvedState(): StatusBarState {
		if (!this.extensionEnabled) {
			return StatusBarState.DISABLED;
		}
		if (this.needsAttention) {
			return StatusBarState.ATTENTION;
		}
		if (this.isRecording) {
			return StatusBarState.RECORDING;
		}
		if (this.snapshotCount > 0) {
			return StatusBarState.ACTIVITY;
		}
		return StatusBarState.PROTECTED;
	}

	/**
	 * Get state options for the current state
	 */
	getStateOptions(): StateOptions {
		return { count: this.snapshotCount };
	}

	/**
	 * Update the status bar based on current state
	 */
	private updateStatusBar(): void {
		const state = this.getResolvedState();
		const options = this.getStateOptions();
		this.statusBar.setState(state, options);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.statusBar.dispose();
	}
}
