/**
 * UnifiedStatusBar - Single consolidated status bar item
 *
 * This replaces the complex StatusBarManager with a simple 5-state indicator.
 * All other UI details live in the webview dashboard.
 *
 * Reference: Status Bar Consolidation Spec
 *
 * STATES:
 * - PROTECTED: Default idle state ("🧢 Protected")
 * - RECORDING: Active AI session detected ("🧢 Recording...")
 * - ACTIVITY: Recent snapshots to report ("🧢 X saved")
 * - ATTENTION: Something needs review ("🧢 Review")
 * - DISABLED: Extension disabled/error ("🧢 Disabled")
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";

/**
 * Status bar states - ordered by priority (highest first for resolution)
 */
export enum StatusBarState {
	PROTECTED = "protected",
	RECORDING = "recording",
	ACTIVITY = "activity",
	ATTENTION = "attention",
	DISABLED = "disabled",
}

/**
 * Configuration for each status bar state
 */
interface StatusBarStateConfig {
	text: string;
	tooltip: string;
	backgroundColor?: vscode.ThemeColor;
}

/**
 * Options for state-specific data
 */
export interface StateOptions {
	count?: number;
}

/**
 * UnifiedStatusBar - Single consolidated status bar for SnapBack
 *
 * Design principles:
 * - One status bar item (no duplicates)
 * - Simple 5-state model
 * - Click always opens dashboard
 * - Minimal, glanceable information
 */
export class UnifiedStatusBar implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private currentState: StatusBarState = StatusBarState.PROTECTED;

	constructor() {
		// Use high priority (1000) with stable ID to appear left of other items
		// Adjacent priorities keep SnapBack items together: primary=1000, secondary=999
		this.statusBarItem = vscode.window.createStatusBarItem(
			"snapback.primary",
			vscode.StatusBarAlignment.Left,
			1000,
		);

		this.statusBarItem.command = "snapback.openDashboard";
		this.setState(StatusBarState.PROTECTED);
		this.statusBarItem.show();
	}

	/**
	 * Set the current state with optional data
	 */
	setState(state: StatusBarState, options?: StateOptions): void {
		this.currentState = state;
		const config = this.getStateConfig(state, options);

		this.statusBarItem.text = config.text;
		this.statusBarItem.tooltip = config.tooltip;
		this.statusBarItem.backgroundColor = config.backgroundColor;
	}

	/**
	 * Get the current state
	 */
	getState(): StatusBarState {
		return this.currentState;
	}

	/**
	 * Get configuration for a specific state
	 */
	private getStateConfig(state: StatusBarState, options?: StateOptions): StatusBarStateConfig {
		switch (state) {
			case StatusBarState.PROTECTED:
				return {
					text: "🧢 Protected",
					tooltip: "SnapBack: All systems nominal. Click to open dashboard.",
					backgroundColor: undefined,
				};

			case StatusBarState.RECORDING:
				return {
					text: "🧢 Recording...",
					tooltip: "SnapBack: Monitoring AI activity. Click to open dashboard.",
					backgroundColor: new vscode.ThemeColor("statusBarItem.warningBackground"),
				};

			case StatusBarState.ACTIVITY: {
				const count = options?.count ?? 0;
				return {
					text: `🧢 ${count} saved`,
					tooltip: `SnapBack: ${count} snapshots today. Click to open dashboard.`,
					backgroundColor: undefined,
				};
			}

			case StatusBarState.ATTENTION:
				return {
					text: "🧢 Review",
					tooltip: "SnapBack: Action recommended. Click to open dashboard.",
					backgroundColor: new vscode.ThemeColor("statusBarItem.errorBackground"),
				};

			case StatusBarState.DISABLED:
				return {
					text: "🧢 Disabled",
					tooltip: "SnapBack: Protection disabled. Click to configure.",
					backgroundColor: undefined,
				};
		}
	}

	/**
	 * Dispose the status bar item
	 */
	dispose(): void {
		this.statusBarItem.dispose();
	}
}
