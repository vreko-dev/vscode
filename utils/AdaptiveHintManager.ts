/**
 * @fileoverview Adaptive Hint Manager - Provides experience-tiered hints
 *
 * This module provides utilities for delivering adaptive hints based on the
 * user's experience tier. It ensures that users receive appropriate guidance
 * based on their familiarity with Vreko.
 */

import * as vscode from "vscode";
import { COMMANDS } from "../constants/index";
import type { ExperienceTier } from "./ExperienceClassifier";
import { logger } from "./logger";

/**
 * Hint categories
 */
export type HintCategory =
	| "getting-started" // Basic usage hints for new users
	| "intermediate-features" // Features for regular users
	| "power-user" // Advanced features for expert users
	| "ai-assisted" // Hints related to AI-assisted coding
	| "sessions" // Hints related to session management
	| "policies" // Hints related to policy management
	| "troubleshooting" // Troubleshooting hints
	| string; // Allow custom categories

/**
 * Hint priority levels
 */
export type HintPriority =
	| "low" // Low priority, show occasionally
	| "medium" // Medium priority, show regularly
	| "high"; // High priority, show frequently

/**
 * Structure for a hint
 */
export interface Hint {
	/** Unique identifier for the hint */
	id: string;

	/** Title of the hint */
	title: string;

	/** Content of the hint */
	content: string;

	/** Category of the hint */
	category: HintCategory;

	/** Priority level */
	priority: HintPriority;

	/** Experience tiers this hint is appropriate for */
	appropriateTiers: ExperienceTier[];

	/** Whether this hint is related to AI features */
	isAIHint: boolean;

	/** Command to execute when hint is clicked (optional) */
	command?: string;

	/** URL for more information (optional) */
	url?: string;

	/** Whether this hint has been shown to the user */
	shown?: boolean;

	/** Timestamp when hint was last shown */
	lastShown?: number;
}

/**
 * Hint templates for different experience tiers
 */
const HINT_TEMPLATES: Record<ExperienceTier, Hint[]> = {
	new: [
		{
			id: "new-welcome",
			title: "Welcome to 🦎 Vreko",
			content: "🦎 Vreko helps you track and protect your code changes. Start by exploring the 🦎 Vreko sidebar.",
			category: "getting-started",
			priority: "high",
			appropriateTiers: ["new"],
			isAIHint: false,
			command: "workbench.view.extension.vreko",
		},
	],

	beginner: [
		{
			id: "beginner-first-snapshot",
			title: "Create Your First Snapshot",
			content: "Try creating a snapshot manually to see how 🦎 Vreko captures your code changes.",
			category: "getting-started",
			priority: "high",
			appropriateTiers: ["beginner"],
			isAIHint: false,
			command: "vreko.createSnapshot",
		},
	],

	explorer: [
		{
			id: "explorer-getting-started",
			title: "Getting Started with 🦎 Vreko",
			content:
				"Protect your first file by right-clicking it in the Explorer and selecting '🦎 Vreko: Protect File'. This will enable automatic snapshots whenever you save.",
			category: "getting-started",
			priority: "high",
			appropriateTiers: ["explorer"],
			isAIHint: false,
			command: "vreko.protectFile",
		},
		{
			id: "explorer-protection-levels",
			title: "Understanding Protection Levels",
			content:
				"🦎 Vreko has three protection levels: Watch (silent snapshots), Warn (confirmation prompts), and Block (required notes). Start with Watch level for most files.",
			category: "getting-started",
			priority: "high",
			appropriateTiers: ["explorer"],
			isAIHint: false,
			url: "https://docs.vreko.dev/how-it-works#protection-levels",
		},
		{
			id: "explorer-view-snapshots",
			title: "Viewing Your Snapshots",
			content:
				"Run `vreko list` in your terminal to see all snapshots. Use `vreko restore <id>` to restore any snapshot.",
			category: "getting-started",
			priority: "medium",
			appropriateTiers: ["explorer"],
			isAIHint: false,
			command: "workbench.view.extension.vreko",
		},
		{
			id: "explorer-ai-intro",
			title: "AI-Assisted Coding with 🦎 Vreko",
			content:
				"🦎 Vreko automatically detects when you're using AI coding assistants like GitHub Copilot and can create snapshots during AI-assisted sessions.",
			category: "ai-assisted",
			priority: "medium",
			appropriateTiers: ["explorer"],
			isAIHint: true,
			url: "https://docs.vreko.dev/mcp",
		},
	],

	intermediate: [
		{
			id: "intermediate-session-management",
			title: "Working with Sessions",
			content:
				"🦎 Vreko automatically groups related snapshots into sessions. View sessions in the Sessions panel to see your coding activity over time.",
			category: "sessions",
			priority: "high",
			appropriateTiers: ["intermediate"],
			isAIHint: false,
			command: COMMANDS.HINTS.SHOW_SESSIONS,
		},
		{
			id: "intermediate-policy-overrides",
			title: "Creating Policy Overrides",
			content:
				"Need to bypass a protection rule? Use 'Vreko: Create Policy Override' to document why you're making an exception.",
			category: "policies",
			priority: "medium",
			appropriateTiers: ["intermediate"],
			isAIHint: false,
			command: COMMANDS.PROTECTION.CHANGE_LEVEL,
		},
		{
			id: "intermediate-ai-checkpoints",
			title: "AI Snapshots",
			content:
				"Enable automatic snapshots for AI-assisted coding sessions in the 🦎 Vreko settings. This helps you track AI contributions to your code.",
			category: "ai-assisted",
			priority: "high",
			appropriateTiers: ["intermediate"],
			isAIHint: true,
			command: COMMANDS.UTILITY.OPEN_SETTINGS,
		},
		{
			id: "intermediate-compare-snapshots",
			title: "Comparing Snapshots",
			content:
				"Right-click any file and select 'Vreko: Compare with Snapshot' to see exactly what changed between versions.",
			category: "intermediate-features",
			priority: "medium",
			appropriateTiers: ["intermediate"],
			isAIHint: false,
			command: COMMANDS.SNAPSHOT.COMPARE,
		},
	],

	advanced: [
		{
			id: "advanced-workspace-policies",
			title: "Workspace Policies",
			content: "Configure workspace-specific protection policies to customize 🦎 Vreko for your team's needs.",
			category: "policies",
			priority: "high",
			appropriateTiers: ["advanced"],
			isAIHint: false,
			command: COMMANDS.UTILITY.OPEN_SETTINGS,
		},
	],

	expert: [
		{
			id: "expert-automation",
			title: "Advanced Automation",
			content: "You're a 🦎 Vreko expert! Explore advanced automation and integration features.",
			category: "power-user",
			priority: "medium",
			appropriateTiers: ["expert"],
			isAIHint: false,
		},
	],

	power: [
		{
			id: "power-custom-policies",
			title: "Custom Protection Policies",
			content:
				"Create team-wide protection policies using .vrekorc files. Share consistent protection levels across your entire team.",
			category: "policies",
			priority: "high",
			appropriateTiers: ["power"],
			isAIHint: false,
			url: "https://docs.vreko.dev/configuration#protection",
		},
		{
			id: "power-session-analysis",
			title: "Session Analysis",
			content: "Run `vreko status` in your terminal to see AI-assisted coding patterns and session insights.",
			category: "sessions",
			priority: "high",
			appropriateTiers: ["power"],
			isAIHint: true,
			command: COMMANDS.HINTS.ANALYZE_SESSIONS,
		},
		{
			id: "power-advanced-restore",
			title: "Advanced Restore Options",
			content:
				"Run `vreko restore --interactive` in your terminal to access advanced restore options including partial file restoration.",
			category: "power-user",
			priority: "medium",
			appropriateTiers: ["power"],
			isAIHint: false,
			command: COMMANDS.HINTS.ADVANCED_RESTORE,
		},
		{
			id: "power-performance-monitoring",
			title: "Performance Monitoring",
			content:
				"Monitor Vreko's performance impact on your workflow. Use the built-in profiler to identify any bottlenecks.",
			category: "power-user",
			priority: "low",
			appropriateTiers: ["power"],
			isAIHint: false,
			command: COMMANDS.HINTS.PROFILE_PERFORMANCE,
		},
	],
};

/**
 * Adaptive Hint Manager - Provides experience-tiered hints
 */
export class AdaptiveHintManager {
	/** Current experience tier */
	private currentTier: ExperienceTier;

	/** Whether AI features are enabled */
	private aiEnabled: boolean;

	/**
	 * Creates a new Adaptive Hint Manager
	 */
	constructor() {
		this.currentTier = "beginner";
		this.aiEnabled = false;
	}

	/**
	 * Sets the current experience tier
	 *
	 * @param tier - Experience tier
	 */
	setExperienceTier(tier: ExperienceTier): void {
		this.currentTier = tier;
		logger.debug("Experience tier set for hint manager", { tier });
	}

	/**
	 * Sets whether AI features are enabled
	 *
	 * @param enabled - Whether AI features are enabled
	 */
	setAIEnabled(enabled: boolean): void {
		this.aiEnabled = enabled;
		logger.debug("AI enabled status set for hint manager", { enabled });
	}

	/**
	 * Gets all hints appropriate for the current tier
	 *
	 * @returns Array of appropriate hints
	 */
	getAppropriateHints(): Hint[] {
		const tierHints = HINT_TEMPLATES[this.currentTier] || [];

		// Filter hints based on AI enablement
		const filteredHints = tierHints.filter((hint) => {
			// If hint is AI-related, only show if AI is enabled
			if (hint.isAIHint && !this.aiEnabled) {
				return false;
			}

			// If hint is not AI-related, always show
			if (!hint.isAIHint) {
				return true;
			}

			// For AI hints, show them if AI is enabled
			return this.aiEnabled;
		});

		return filteredHints;
	}

	/**
	 * Gets a random hint appropriate for the current tier
	 *
	 * @param category - Optional category to filter by
	 * @param priority - Optional priority to filter by
	 * @returns Random appropriate hint or undefined if none available
	 */
	getRandomHint(category?: HintCategory, priority?: HintPriority): Hint | undefined {
		let hints = this.getAppropriateHints();

		// Filter by category if specified
		if (category) {
			hints = hints.filter((hint) => hint.category === category);
		}

		// Filter by priority if specified
		if (priority) {
			hints = hints.filter((hint) => hint.priority === priority);
		}

		// Return random hint
		if (hints.length > 0) {
			const randomIndex = Math.floor(Math.random() * hints.length);
			return hints[randomIndex];
		}

		return undefined;
	}

	/**
	 * Shows a hint to the user
	 *
	 * @param hint - Hint to show
	 * @returns Promise that resolves when hint is shown
	 */
	async showHint(hint: Hint): Promise<void> {
		const buttons: string[] = [];

		if (hint.command) {
			buttons.push("Show Me");
		}

		if (hint.url) {
			buttons.push("Learn More");
		}

		buttons.push("Got It");

		const selection = await vscode.window.showInformationMessage(`${hint.title}: ${hint.content}`, ...buttons);

		// Handle user selection
		switch (selection) {
			case "Show Me":
				if (hint.command) {
					vscode.commands.executeCommand(hint.command).then(
						() => {
							logger.debug("Hint command executed", { command: hint.command });
						},
						(error) => {
							logger.error(
								"Failed to execute hint command",
								new Error(
									`Command: ${hint.command}, Error: ${error instanceof Error ? error.message : String(error)}`,
								),
							);
						},
					);
				}
				break;
			case "Learn More":
				if (hint.url) {
					vscode.env.openExternal(vscode.Uri.parse(hint.url)).then(
						() => {
							logger.debug("Hint URL opened", { url: hint.url });
						},
						(error) => {
							logger.error(
								"Failed to open hint URL",
								new Error(
									`URL: ${hint.url}, Error: ${error instanceof Error ? error.message : String(error)}`,
								),
							);
						},
					);
				}
				break;
			default:
				// User acknowledged the hint or closed the dialog
				logger.debug("Hint acknowledged", { hintId: hint.id });
				break;
		}

		// Mark hint as shown
		hint.shown = true;
		hint.lastShown = Date.now();
	}

	/**
	 * Gets hint statistics
	 *
	 * @returns Statistics about hints
	 */
	getHintStatistics(): {
		totalHints: number;
		appropriateHints: number;
		shownHints: number;
		aiHintsAvailable: number;
	} {
		const allHints = Object.values(HINT_TEMPLATES).flat();
		const appropriateHints = this.getAppropriateHints();
		const shownHints = appropriateHints.filter((hint) => hint.shown).length;
		const aiHints = appropriateHints.filter((hint) => hint.isAIHint).length;

		return {
			totalHints: allHints.length,
			appropriateHints: appropriateHints.length,
			shownHints,
			aiHintsAvailable: aiHints,
		};
	}

	/**
	 * Resets hint tracking data (for testing)
	 */
	resetHintData(): void {
		// Reset shown status and last shown timestamps for all hints
		for (const tier of Object.keys(HINT_TEMPLATES)) {
			const hints = HINT_TEMPLATES[tier as ExperienceTier];
			if (hints) {
				for (const hint of hints) {
					hint.shown = false;
					hint.lastShown = undefined;
				}
			}
		}

		logger.info("Hint tracking data reset");
	}
}
