/**
 * StatusFlagManager - Flag-Map Based Status Bar Management
 *
 * Replaces FSM state machine with flat flag-map + precedence.
 * Each "state" is an independent flag with priority and optional expiry.
 * A 250ms coalesced render timer picks the highest-priority active flag.
 *
 * Features:
 * - No finite state machine - only precedence
 * - Independent flags with expiry
 * - 250ms coalesced render (no flicker)
 * - Debounced checkpoint counter
 *
 * @module signals/StatusFlagManager
 * @see docs/plans/vreko_signal_communicaton.md Section 1.1
 */

import * as vscode from "vscode";
import { formatDuration } from "../utils/format";
import type { SignalState } from "./SignalState";
import type { StatusFlag, StatusFlagKey, UserInfo } from "./types";

// ============================================================================
// Default Flags
// ============================================================================

/** Idle flag for new users (< 5 snapshots) */
const IDLE_NEW_FLAG: StatusFlag = {
	priority: 0,
	text: "Watching",
	codicon: "🦎", // Brand emoji per extension-branding-playbook.md Section "Brand Emoji Usage"
};

/** Idle flag for active/power users (5+ snapshots) */
const IDLE_ACTIVE_FLAG: StatusFlag = {
	priority: 0,
	text: "Protected",
	codicon: "🦎", // Brand emoji per extension-branding-playbook.md Section "Brand Emoji Usage"
};

// ============================================================================
// Flag Definitions (from spec Section 1.1)
// ============================================================================

/** Flag configurations by key */
const FLAG_CONFIGS: Record<StatusFlagKey, Omit<StatusFlag, "expiresAt"> & { defaultExpiry?: number }> = {
	idle: {
		priority: 0,
		text: "Protected",
		codicon: "🦎", // Brand emoji per extension-branding-playbook.md
	},
	checkpoint: {
		priority: 10,
		text: "Saved",
		codicon: "$(check)",
		defaultExpiry: 3000, // 3s
	},
	ai_session: {
		priority: 20,
		text: "AI active",
		codicon: "$(sparkle)",
		defaultExpiry: 5000, // 5s after last AI event
	},
	agent_active: {
		priority: 15,
		text: "active",
		codicon: "$(vreko-pulse)",
		defaultExpiry: 2000, // 2s flash on mcp.tool-called
	},
	pattern: {
		priority: 25,
		text: "Pattern learned",
		codicon: "$(link)",
		defaultExpiry: 5000, // 5s (3s for power users)
	},
	elevated: {
		priority: 30,
		text: "Elevated risk",
		codicon: "$(warning)",
		defaultExpiry: 8000, // 8s
	},
	recovery: {
		priority: 40,
		text: "Restored",
		codicon: "$(history)",
		defaultExpiry: 30000, // 30s or user click
	},
	degraded: {
		priority: 80,
		text: "Degraded",
		codicon: "$(sync~spin)",
		defaultExpiry: 30000, // 30s  -  prevents infinite spinner on cold-start failures
	},
	disconnected: {
		priority: 90,
		text: "Disconnected",
		codicon: "$(error)",
		// No expiry - until manual action
	},
	recommendation: {
		priority: 15,
		text: "Snapshot recommended",
		codicon: "🦎", // Brand emoji per extension-branding-playbook.md
	},
	vitals: {
		priority: 5,
		text: "Protected",
		codicon: "🦎", // Brand emoji per extension-branding-playbook.md
	},
	// Setup gate flags  -  cleared once each condition is resolved
	CLI_NOT_INSTALLED: {
		priority: 95,
		text: "Install Vreko CLI",
		codicon: "$(warning)",
		tooltipOverride: "Vreko CLI is required. Click to install.",
		background: "statusBarItem.warningBackground",
		command: "vreko.installCLI",
	},
	DAEMON_NOT_RUNNING: {
		priority: 85,
		text: "Starting Vreko...",
		codicon: "$(sync~spin)",
		tooltipOverride: "Vreko daemon is not running. Click to start.",
		background: undefined,
		command: "vreko.startDaemon",
	},
	NOT_AUTHENTICATED: {
		priority: 75,
		text: "Sign in to Vreko",
		codicon: "$(person)",
		tooltipOverride: "Sign in to enable cloud sync and Pro features.",
		background: "statusBarItem.warningBackground",
		command: "vreko.openAuth",
	},
	WORKSPACE_NOT_INIT: {
		priority: 65,
		text: "Initialize workspace",
		codicon: "$(folder)",
		tooltipOverride: "This workspace has not been initialized. Click to set up.",
		background: "statusBarItem.warningBackground",
		command: "vreko.initWorkspace",
	},
	MCP_NOT_CONFIGURED: {
		priority: 55,
		text: "Connect AI tool",
		codicon: "$(plug)",
		tooltipOverride: "Connect Vreko to your AI coding tool for agent briefings.",
		background: "statusBarItem.warningBackground",
		command: "vreko.mcp.configure",
	},
};

// ============================================================================
// StatusFlagManager
// ============================================================================

/**
 * StatusFlagManager - Flag-map based status bar with coalesced render
 */
export class StatusFlagManager implements vscode.Disposable {
	private activeFlags = new Map<StatusFlagKey | string, StatusFlag>();
	private statusBarItem: vscode.StatusBarItem;
	private renderTimer: NodeJS.Timeout | undefined;
	private expiryTimers = new Map<string, NodeJS.Timeout>();
	private signalState: SignalState;

	// Debounce tracking
	private checkpointCount = 0;
	private lastCheckpointTime = 0;
	private readonly CHECKPOINT_DEBOUNCE_MS = 3000;

	// AI session tracking
	private readonly AI_SESSION_EXTENSION_MS = 5000;

	// Elevated risk tracking
	private lastElevatedTime = 0;
	private readonly ELEVATED_COOLDOWN_MS = 60000; // 60s minimum

	// Guard health tracking (SB-CONSOLIDATE-001)
	private guardHealthSummary: {
		passCount: number;
		warnCount: number;
		failCount: number;
		total: number;
		lastChecked?: number;
	} = { passCount: 0, warnCount: 0, failCount: 0, total: 0 };

	/**
	 * Create a new StatusFlagManager
	 */
	constructor(signalState: SignalState) {
		this.signalState = signalState;

		// Create status bar item (Left alignment, high priority)
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			999, // Just after primary items
		);
		this.statusBarItem.command = "vreko.showQuickActions";
		this.statusBarItem.show();

		// Initial render
		this.scheduleRender();
	}

	// =========================================================================
	// Flag Management
	// =========================================================================

	/**
	 * Set a flag (creates or updates)
	 */
	setFlag(key: StatusFlagKey, flag?: Partial<StatusFlag>): void {
		const config = FLAG_CONFIGS[key];

		// Special handling for checkpoint counter
		if (key === "checkpoint") {
			this.handleCheckpointFlag();
			return;
		}

		// Special handling for AI session timer extension
		if (key === "ai_session") {
			this.handleAISessionFlag(flag);
			return;
		}

		// Special handling for elevated cooldown
		if (key === "elevated") {
			if (!this.canShowElevated()) {
				return;
			}
			this.lastElevatedTime = Date.now();
		}

		// Special handling for pattern tier-based expiry (§2.2)
		// Power users: 3s, others: 5s
		const patternExpiry =
			key === "pattern" ? (this.signalState.tier === "power" ? 3000 : 5000) : config.defaultExpiry;

		const newFlag: StatusFlag = {
			priority: flag?.priority ?? config.priority,
			text: flag?.text ?? config.text,
			codicon: flag?.codicon ?? config.codicon,
			tooltipOverride: flag?.tooltipOverride ?? config.tooltipOverride,
			expiresAt: flag?.expiresAt ?? (patternExpiry ? Date.now() + patternExpiry : undefined),
		};

		this.activeFlags.set(key, newFlag);

		// Start (or restart) an expiry timer so the status bar recovers even when
		// no subsequent flag changes fire (e.g. degraded with no reconnect event).
		const existingTimer = this.expiryTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
			this.expiryTimers.delete(key);
		}
		if (patternExpiry) {
			this.expiryTimers.set(
				key,
				setTimeout(() => {
					this.expiryTimers.delete(key);
					this.clearFlag(key);
				}, patternExpiry),
			);
		}

		this.scheduleRender();
	}

	/**
	 * Clear a flag
	 */
	clearFlag(key: StatusFlagKey | string): void {
		// Cancel any pending expiry timer for this flag
		const timer = this.expiryTimers.get(key);
		if (timer) {
			clearTimeout(timer);
			this.expiryTimers.delete(key);
		}
		this.activeFlags.delete(key);
		this.scheduleRender();
	}

	/**
	 * Check if a flag is active
	 */
	hasFlag(key: StatusFlagKey | string): boolean {
		return this.activeFlags.has(key);
	}

	/**
	 * Get active flag count
	 */
	getActiveFlagCount(): number {
		return this.activeFlags.size;
	}

	// =========================================================================
	// Special Flag Handlers
	// =========================================================================

	/**
	 * Handle checkpoint flag with counter debounce
	 */
	private handleCheckpointFlag(): void {
		const now = Date.now();
		const config = FLAG_CONFIGS.checkpoint;

		// If checkpoint flag is already active, increment counter
		if (this.activeFlags.has("checkpoint") && now - this.lastCheckpointTime < this.CHECKPOINT_DEBOUNCE_MS) {
			this.checkpointCount++;
		} else {
			// Reset counter
			this.checkpointCount = 1;
		}

		this.lastCheckpointTime = now;

		const text = this.checkpointCount > 1 ? `Saved (×${this.checkpointCount})` : "Saved";

		this.activeFlags.set("checkpoint", {
			priority: config.priority,
			text,
			codicon: config.codicon,
			expiresAt: now + config.defaultExpiry!,
		});

		// Register (or restart) an expiry timer so the flag clears even when no
		// other events fire after the checkpoint  -  consistent with setFlag() behaviour.
		const existingTimer = this.expiryTimers.get("checkpoint");
		if (existingTimer) {
			clearTimeout(existingTimer);
		}
		this.expiryTimers.set(
			"checkpoint",
			setTimeout(() => {
				this.expiryTimers.delete("checkpoint");
				this.clearFlag("checkpoint");
			}, config.defaultExpiry!),
		);

		this.scheduleRender();
	}

	/**
	 * Handle AI session flag with timer extension
	 */
	private handleAISessionFlag(flag?: Partial<StatusFlag>): void {
		const now = Date.now();
		const config = FLAG_CONFIGS.ai_session;

		// Extend expiry on each AI event
		this.activeFlags.set("ai_session", {
			priority: config.priority,
			text: flag?.text ?? config.text,
			codicon: config.codicon,
			tooltipOverride: flag?.tooltipOverride,
			expiresAt: now + this.AI_SESSION_EXTENSION_MS,
		});

		// Register (or restart) expiry timer  -  each AI event extends the window by
		// AI_SESSION_EXTENSION_MS from now, matching the expiresAt above.
		const existingTimer = this.expiryTimers.get("ai_session");
		if (existingTimer) {
			clearTimeout(existingTimer);
		}
		this.expiryTimers.set(
			"ai_session",
			setTimeout(() => {
				this.expiryTimers.delete("ai_session");
				this.clearFlag("ai_session");
			}, this.AI_SESSION_EXTENSION_MS),
		);

		this.scheduleRender();
	}

	/**
	 * Check if elevated risk can be shown (60s cooldown)
	 */
	private canShowElevated(): boolean {
		return Date.now() - this.lastElevatedTime >= this.ELEVATED_COOLDOWN_MS;
	}

	// =========================================================================
	// Rendering
	// =========================================================================

	/**
	 * Schedule a render (coalesced to 250ms)
	 */
	private scheduleRender(): void {
		if (this.renderTimer) {
			return; // Already scheduled
		}

		this.renderTimer = setTimeout(() => {
			this.renderTimer = undefined;
			this.render();
		}, 250);
	}

	/**
	 * Render the status bar
	 */
	private render(): void {
		const now = Date.now();

		// Expire stale flags and cancel their timers
		for (const [key, flag] of this.activeFlags) {
			if (flag.expiresAt && flag.expiresAt <= now) {
				this.activeFlags.delete(key);
				// Cancel any pending expiry timer to avoid a redundant clearFlag() call
				const timer = this.expiryTimers.get(key);
				if (timer) {
					clearTimeout(timer);
					this.expiryTimers.delete(key);
				}
			}
		}

		// Pick highest priority flag
		const winner = this.pickWinner();

		// Update status bar
		this.statusBarItem.text = `${winner.codicon} ${winner.text}`;
		this.statusBarItem.tooltip = this.renderTooltip(winner);

		// Apply background from flag field
		if (winner.background) {
			this.statusBarItem.backgroundColor = new vscode.ThemeColor(winner.background);
		} else {
			this.statusBarItem.backgroundColor = undefined;
		}

		// Apply click command from flag field
		if (winner.command) {
			this.statusBarItem.command = winner.command;
		} else {
			this.statusBarItem.command = "vreko.showQuickActions";
		}
	}

	/**
	 * Pick the winning flag (highest priority)
	 */
	private pickWinner(): StatusFlag {
		const flags = [...this.activeFlags.values()];

		if (flags.length === 0) {
			// Return idle flag based on tier
			return this.signalState.tier === "new" ? IDLE_NEW_FLAG : IDLE_ACTIVE_FLAG;
		}

		// Sort by priority (highest first)
		flags.sort((a, b) => b.priority - a.priority);
		return flags[0]!;
	}

	/**
	 * Render tooltip from SignalState
	 */
	private renderTooltip(activeFlag: StatusFlag): vscode.MarkdownString {
		const state = this.signalState;
		const md = new vscode.MarkdownString("", true);
		md.isTrusted = true;

		// Header (from active flag)
		const header = activeFlag.tooltipOverride ?? (state.tier === "new" ? "Watching" : "Protected");
		md.appendMarkdown(`**Vreko  -  ${header}**\n\n`);

		// Account block (if authenticated)
		if (state.userInfo) {
			const tierDisplay = state.getTierDisplayText();
			md.appendMarkdown(`👤 ${state.userInfo.username} · ${tierDisplay}\n\n`);
		}

		// Session block
		if (state.sessionName) {
			md.appendMarkdown(`Session: ${state.sessionName}\n\n`);
			md.appendMarkdown(`${state.snapshotCountSession} snapshots · ${formatDuration(state.sessionDuration)}`);
			if (state.aiToolsDetected.length > 0) {
				md.appendMarkdown(` · ${state.aiToolsDetected.join(", ")} detected`);
			}
			if (state.fragileFileCount > 0) {
				md.appendMarkdown(` · ${state.fragileFileCount} fragile in scope`);
			}
			md.appendMarkdown("\n\n");
		}

		// Intelligence block (Active and Power tiers only)
		if (state.tier !== "new") {
			md.appendMarkdown("Intelligence:\n\n");
			md.appendMarkdown(
				`${state.learningCount} learnings · ${state.fragileFileCount} fragile files · ${state.patternCount} patterns\n\n`,
			);
		}

		// Risk detail (Power tier only)
		if (state.tier === "power" && state.currentRiskLevel !== "normal") {
			md.appendMarkdown(`Risk: ${state.currentRiskLevel}  -  ${state.riskReason}\n\n`);
		}

		// Last event (always, 1 most recent from ring buffer)
		const lastEvent = state.recentEvents.peek();
		if (lastEvent) {
			md.appendMarkdown(`Last: ${lastEvent.description} (${this.formatTimeAgo(lastEvent.timestamp)})`);
		}

		// Guard health summary (SB-CONSOLIDATE-001)  -  shown when data is available
		if (this.guardHealthSummary.total > 0) {
			const { passCount, warnCount, failCount } = this.guardHealthSummary;
			const parts: string[] = [];
			if (passCount > 0) {
				parts.push(`✅ ${passCount} passing`);
			}
			if (warnCount > 0) {
				parts.push(`⚠️ ${warnCount} warning`);
			}
			if (failCount > 0) {
				parts.push(`❌ ${failCount} failing`);
			}
			md.appendMarkdown(`\n\nGuard Health: ${parts.join(" | ")}`);
		}

		return md;
	}

	/**
	 * Update guard health status (SB-CONSOLIDATE-001)
	 *
	 * Mirror of StatusBarManager.updateGuardHealth()  -  ensures guard health data is
	 * surfaced in the StatusFlagManager tooltip regardless of which system renders.
	 *
	 * When guard failures are detected, automatically raises the "elevated" flag so
	 * the status bar visually indicates an issue until the flag expires.
	 *
	 * @param guards - Array of guard results from health/workspace checks
	 */
	updateGuardHealth(
		guards: Array<{
			guard: string;
			status: "pass" | "warn" | "fail";
			files: Array<{ path: string; line?: number; message: string }>;
			durationMs: number;
		}>,
	): void {
		this.guardHealthSummary = {
			passCount: guards.filter((g) => g.status === "pass").length,
			warnCount: guards.filter((g) => g.status === "warn").length,
			failCount: guards.filter((g) => g.status === "fail").length,
			total: guards.length,
			lastChecked: Date.now(),
		};

		// Raise elevated flag when guards are failing  -  clears on cooldown
		if (this.guardHealthSummary.failCount > 0) {
			const failCount = this.guardHealthSummary.failCount;
			this.setFlag("elevated", {
				tooltipOverride: `${failCount} guard${failCount > 1 ? "s" : ""} failing`,
			});
		}

		this.scheduleRender();
	}

	// =========================================================================
	// Formatting Helpers
	// =========================================================================

	/**
	 * Format duration in human-readable form
	 */
	/**
	 * Format time ago
	 */
	private formatTimeAgo(timestamp: number): string {
		const diff = Date.now() - timestamp;
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);

		if (minutes < 1) {
			return "just now";
		}
		if (minutes === 1) {
			return "1 min ago";
		}
		if (minutes < 60) {
			return `${minutes} mins ago`;
		}
		return `${Math.floor(minutes / 60)}h ago`;
	}

	// =========================================================================
	// Compatibility Shims (replaces deprecated StatusBarManager API)
	// =========================================================================

	/**
	 * Compatibility shim: replaces StatusBarManager.enqueueMessage()
	 * Sets a custom flag with optional expiry. Returns the key for later removal.
	 */
	enqueueMessage(msg: {
		id: string;
		text: string;
		priority?: string;
		duration?: number;
		command?: string;
		tooltip?: string;
		backgroundColor?: string;
	}): string {
		const flagKey = msg.id;
		this.activeFlags.set(flagKey, {
			priority:
				msg.priority === "critical" ? 85 : msg.priority === "high" ? 35 : msg.priority === "medium" ? 25 : 5,
			text: msg.text,
			codicon: "🦎", // Brand emoji per extension-branding-playbook.md
			expiresAt: msg.duration && msg.duration > 0 ? Date.now() + msg.duration : undefined,
		});
		if (msg.duration && msg.duration > 0) {
			const timer = setTimeout(() => {
				this.expiryTimers.delete(flagKey);
				this.clearFlag(flagKey);
			}, msg.duration);
			this.expiryTimers.set(flagKey, timer);
		}
		this.scheduleRender();
		return flagKey;
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.dequeueMessage()
	 */
	dequeueMessage(id: string | null): void {
		if (id) {
			this.clearFlag(id);
		}
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.showRecommendation()
	 */
	showRecommendation(urgency: "low" | "medium" | "high" | "critical", message: string): void {
		const priority = urgency === "critical" ? 85 : urgency === "high" ? 35 : urgency === "medium" ? 25 : 15;
		this.activeFlags.set("recommendation", {
			priority,
			text: message,
			codicon: "$(warning)",
			expiresAt: Date.now() + 30000,
		});
		this.scheduleRender();
	}

	/**
	 * Compatibility shim: clears the recommendation flag
	 */
	clearRecommendation(): void {
		this.clearFlag("recommendation");
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.showCheckpointCreated()
	 */
	showCheckpointCreated(): void {
		this.setFlag("checkpoint");
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.showBurstDetectedSequence()
	 */
	async showBurstDetectedSequence(): Promise<void> {
		this.setFlag("elevated", { text: "Burst detected", tooltipOverride: "Rapid edits detected" });
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.showAIDetectedSequence()
	 */
	async showAIDetectedSequence(tool?: string): Promise<void> {
		this.setFlag("ai_session", { text: tool ? `${tool} active` : "AI active" });
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.updateSessionHealth()
	 * No-op  -  StatusFlagManager derives display from SignalState directly.
	 */
	updateSessionHealth(_level: string, _trajectory?: string): void {
		// StatusFlagManager renders health from SignalState  -  no explicit update needed
		this.scheduleRender();
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.showIdle()
	 */
	showIdle(): void {
		this.clearFlag("recommendation");
		this.scheduleRender();
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.showVitals()
	 */
	showVitals(_data: unknown): void {
		// StatusFlagManager renders vitals from SignalState tooltip  -  no explicit update needed
		this.scheduleRender();
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.setVitalsEnabled()
	 */
	setVitalsEnabled(_enabled: boolean): void {
		// StatusFlagManager always renders vitals when available via SignalState
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.showActivitySequenceByType()
	 */
	async showActivitySequenceByType(_type: string): Promise<void> {
		this.setFlag("elevated", { text: "Auto-protecting", tooltipOverride: "Health declining" });
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.initializeSnapshotCount()
	 * No-op  -  StatusFlagManager manages checkpoint flags, not counters.
	 */
	initializeSnapshotCount(_count: number): void {
		// StatusFlagManager uses flag-map approach, not counters
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.incrementSnapshotCount()
	 */
	incrementSnapshotCount(): void {
		this.setFlag("checkpoint");
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.updateIntegrationHealth()
	 * No-op  -  StatusFlagManager tooltip is driven by SignalState.
	 */
	updateIntegrationHealth(_health: unknown): void {
		// StatusFlagManager tooltip is driven by SignalState  -  no explicit integration health needed
	}

	/**
	 * Override the status bar tooltip with a MarkdownString.
	 *
	 * Used by VitalsUIIntegration to surface pulse/temperature/tool data
	 * on hover (VSUI-05). The override replaces the default SignalState
	 * tooltip until the next render cycle clears it or it is overridden again.
	 */
	setTooltipOverride(tooltip: vscode.MarkdownString): void {
		this.statusBarItem.tooltip = tooltip;
	}

	/**
	 * Compatibility shim: replaces StatusBarManager.updateUserInfo()
	 * Updates SignalState.userInfo which is used in the tooltip.
	 */
	updateUserInfo(info: { username: string; subscriptionTier: string } | undefined): void {
		if (!info) {
			this.signalState.userInfo = undefined;
		} else {
			this.signalState.userInfo = {
				username: info.username,
				subscriptionTier: info.subscriptionTier as UserInfo["subscriptionTier"],
			};
		}
		this.scheduleRender();
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Force immediate render
	 */
	refresh(): void {
		if (this.renderTimer) {
			clearTimeout(this.renderTimer);
			this.renderTimer = undefined;
		}
		this.render();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.renderTimer) {
			clearTimeout(this.renderTimer);
			this.renderTimer = undefined;
		}
		for (const timer of this.expiryTimers.values()) {
			clearTimeout(timer);
		}
		this.expiryTimers.clear();
		this.statusBarItem.dispose();
	}
}
