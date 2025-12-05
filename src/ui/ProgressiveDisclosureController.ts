/**
 * Progressive Disclosure Controller
 *
 * Manages UI complexity based on user experience level.
 * Provides simplified views for beginners and full features for advanced users.
 */

import * as vscode from "vscode";
import {
	ExperienceLevel,
	type UserExperienceService,
} from "../services/UserExperienceService.js";
import { logger } from "../utils/logger.js";

/**
 * Feature definitions with required experience levels
 */
interface FeatureDefinition {
	id: string;
	label: string;
	description: string;
	requiredLevel: ExperienceLevel;
	category: "protection" | "snapshot" | "session" | "advanced";
}

/**
 * Controller for progressive disclosure of features
 */
export class ProgressiveDisclosureController implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private statusBarItem: vscode.StatusBarItem | undefined;
	private hintQueue: string[] = [];
	private lastHintTime = 0;
	private readonly HINT_COOLDOWN_MS = 60000; // 1 minute between hints

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly userExperienceService: UserExperienceService,
	) {
		this.initializeController();
	}

	/**
	 * Initialize progressive disclosure controller
	 */
	private async initializeController(): Promise<void> {
		// Set initial context for when clauses
		const level = this.userExperienceService.getExperienceLevel();
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.experienceLevel",
			level,
		);
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.showAdvancedFeatures",
			this.userExperienceService.isAdvanced(),
		);

		// Create status bar item for beginners
		if (await this.userExperienceService.isBeginner()) {
			this.createStatusBarItem();
		}

		// Show welcome message for first-time users
		await this.showWelcomeMessageIfNeeded();

		// Register command to toggle advanced mode
		this.disposables.push(
			vscode.commands.registerCommand(
				"snapback.toggleAdvancedMode",
				async () => {
					await this.toggleAdvancedMode();
				},
			),
		);

		// Register command to show all features
		this.disposables.push(
			vscode.commands.registerCommand("snapback.showAllFeatures", async () => {
				await this.showAllFeatures();
			}),
		);

		// Register command to reset experience level
		this.disposables.push(
			vscode.commands.registerCommand(
				"snapback.resetExperienceLevel",
				async () => {
					await this.resetExperienceLevel();
				},
			),
		);

		logger.info("Progressive disclosure controller initialized", { level });
	}

	/**
	 * Show contextual hint to user
	 */
	async showHint(context: string, force = false): Promise<void> {
		// Don't show hints to advanced users unless forced
		const isAdvanced = await this.userExperienceService.isAdvanced();
		if (isAdvanced && !force) {
			return;
		}

		const hintValue =
			await this.userExperienceService.getContextualHint(context);
		if (!hintValue) {
			return;
		}

		// Respect cooldown period
		const now = Date.now();
		if (!force && now - this.lastHintTime < this.HINT_COOLDOWN_MS) {
			this.hintQueue.push(hintValue);
			return;
		}

		this.lastHintTime = now;

		// Show hint as information message with action
		const action = await vscode.window.showInformationMessage(
			hintValue,
			"Got it",
			"Don't show hints",
		);

		if (action === "Don't show hints") {
			// Upgrade user to intermediate level to disable hints
			await this.userExperienceService.setExperienceLevel(
				ExperienceLevel.INTERMEDIATE,
			);
			vscode.window.showInformationMessage(
				"Hints disabled. You can re-enable them in settings.",
			);
		}

		logger.debug("Contextual hint shown", { context, hint: hintValue });
	}

	/**
	 * Show recommended next action
	 */
	async showRecommendedAction(): Promise<void> {
		const recommendationValue =
			await this.userExperienceService.getRecommendedAction();
		if (!recommendationValue) {
			return;
		}

		const action = await vscode.window.showInformationMessage(
			recommendationValue,
			"Show me how",
			"Dismiss",
		);

		if (action === "Show me how") {
			// Open walkthrough
			vscode.commands.executeCommand("snapback.openWalkthrough");
		}

		logger.debug("Recommended action shown", {
			recommendation: recommendationValue,
		});
	}

	/**
	 * Get filtered commands based on experience level
	 */
	getVisibleCommands(): string[] {
		// Define command visibility by experience level
		const commandVisibility: Record<string, ExperienceLevel> = {
			// Beginner commands (always visible)
			"snapback.protectFile": ExperienceLevel.BEGINNER,
			"snapback.createSnapshot": ExperienceLevel.BEGINNER,
			"snapback.snapBack": ExperienceLevel.BEGINNER,
			"snapback.showStatus": ExperienceLevel.BEGINNER,

			// Intermediate commands
			"snapback.changeProtectionLevel": ExperienceLevel.INTERMEDIATE,
			"snapback.showAllSnapshots": ExperienceLevel.INTERMEDIATE,
			"snapback.compareWithSnapshot": ExperienceLevel.INTERMEDIATE,
			"snapback.deleteSnapshot": ExperienceLevel.INTERMEDIATE,

			// Advanced commands
			"snapback.deleteOlderSnapshots": ExperienceLevel.ADVANCED,
			"snapback.renameSnapshot": ExperienceLevel.ADVANCED,
			"snapback.protectSnapshot": ExperienceLevel.ADVANCED,
			"snapback.createPolicyOverride": ExperienceLevel.ADVANCED,
			"snapback.toggleOfflineMode": ExperienceLevel.ADVANCED,
			"snapback.updateConfiguration": ExperienceLevel.ADVANCED,
		};

		// Filter commands based on level
		return Object.entries(commandVisibility)
			.filter(([_cmd, requiredLevel]) => {
				return this.userExperienceService.shouldShowFeature(requiredLevel);
			})
			.map(([cmd]) => cmd);
	}

	/**
	 * Get feature groups for UI display
	 */
	getFeatureGroups(): Record<string, FeatureDefinition[]> {
		const allFeatures: FeatureDefinition[] = [
			// Protection features
			{
				id: "protectFile",
				label: "Protect Files",
				description: "Protect important files with snapshots",
				requiredLevel: ExperienceLevel.BEGINNER,
				category: "protection",
			},
			{
				id: "protectionLevels",
				label: "Protection Levels",
				description: "Watch, Warn, or Block file changes",
				requiredLevel: ExperienceLevel.INTERMEDIATE,
				category: "protection",
			},
			{
				id: "teamPolicies",
				label: "Team Policies",
				description: "Shared protection rules via .snapbackrc",
				requiredLevel: ExperienceLevel.ADVANCED,
				category: "protection",
			},

			// Snapshot features
			{
				id: "createSnapshot",
				label: "Create Snapshots",
				description: "Save file versions manually",
				requiredLevel: ExperienceLevel.BEGINNER,
				category: "snapshot",
			},
			{
				id: "restoreSnapshot",
				label: "Restore Snapshots",
				description: "Revert to previous file versions",
				requiredLevel: ExperienceLevel.BEGINNER,
				category: "snapshot",
			},
			{
				id: "compareSnapshots",
				label: "Compare Snapshots",
				description: "Side-by-side diff view",
				requiredLevel: ExperienceLevel.INTERMEDIATE,
				category: "snapshot",
			},
			{
				id: "manageSnapshots",
				label: "Manage Snapshots",
				description: "Rename, delete, protect snapshots",
				requiredLevel: ExperienceLevel.ADVANCED,
				category: "snapshot",
			},

			// Session features
			{
				id: "viewSessions",
				label: "View Sessions",
				description: "See grouped file changes",
				requiredLevel: ExperienceLevel.INTERMEDIATE,
				category: "session",
			},
			{
				id: "restoreSessions",
				label: "Restore Sessions",
				description: "Atomic multi-file rollback",
				requiredLevel: ExperienceLevel.INTERMEDIATE,
				category: "session",
			},

			// Advanced features
			{
				id: "offlineMode",
				label: "Offline Mode",
				description: "Work without backend API",
				requiredLevel: ExperienceLevel.ADVANCED,
				category: "advanced",
			},
			{
				id: "policyOverrides",
				label: "Policy Overrides",
				description: "Custom protection rules",
				requiredLevel: ExperienceLevel.ADVANCED,
				category: "advanced",
			},
		];

		// Filter features by experience level
		const visibleFeatures = allFeatures.filter((feature) =>
			this.userExperienceService.shouldShowFeature(feature.requiredLevel),
		);

		// Group by category
		const grouped: Record<string, FeatureDefinition[]> = {
			protection: [],
			snapshot: [],
			session: [],
			advanced: [],
		};

		for (const feature of visibleFeatures) {
			grouped[feature.category].push(feature);
		}

		return grouped;
	}

	/**
	 * Create status bar item for beginners
	 */
	private createStatusBarItem(): void {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100,
		);

		this.statusBarItem.text = "$(lightbulb) SnapBack Tips";
		this.statusBarItem.tooltip = "Click for helpful SnapBack tips";
		this.statusBarItem.command = "snapback.showRecommendedAction";

		this.statusBarItem.show();
		this.disposables.push(this.statusBarItem);

		logger.debug("Status bar item created for beginner mode");
	}

	/**
	 * Show welcome message for first-time users
	 */
	private async showWelcomeMessageIfNeeded(): Promise<void> {
		const hasShownWelcomeValue = await this.hasShownWelcome();
		const isBeginner = await this.userExperienceService.isBeginner();
		if (!hasShownWelcomeValue && isBeginner) {
			await this.showWelcomeMessage();
			await this.setHasShownWelcome(true);
		}
	}

	private async hasShownWelcome(): Promise<boolean> {
		return this.context.globalState.get<boolean>(
			"snapback.progressiveDisclosure.welcomeShown",
			false,
		);
	}

	private async showWelcomeMessage(): Promise<void> {
		const choice = await vscode.window.showInformationMessage(
			"Welcome to SnapBack! We'll start with the basics and unlock more features as you learn.",
			"Take Tour",
			"I'm Experienced",
		);

		if (choice === "Take Tour") {
			vscode.commands.executeCommand("snapback.openWalkthrough");
		} else if (choice === "I'm Experienced") {
			// Upgrade to intermediate
			await this.userExperienceService.setExperienceLevel(
				ExperienceLevel.INTERMEDIATE,
			);
			vscode.window.showInformationMessage(
				"Great! All intermediate features are now available. You can always access advanced features from settings.",
			);
		}

		logger.info("Welcome message shown to new user");
	}

	private async setHasShownWelcome(value: boolean): Promise<void> {
		await this.context.globalState.update(
			"snapback.progressiveDisclosure.welcomeShown",
			value,
		);
	}

	/**
	 * Toggle between beginner/intermediate and advanced modes
	 */
	private async toggleAdvancedMode(): Promise<void> {
		const currentLevel = await this.userExperienceService.getExperienceLevel();
		if (currentLevel === ExperienceLevel.ADVANCED) {
			// Downgrade to intermediate
			await this.userExperienceService.setExperienceLevel(
				ExperienceLevel.INTERMEDIATE,
			);
			vscode.window.showInformationMessage(
				"Switched to standard mode. Some advanced features are now hidden.",
			);
		} else {
			// Upgrade to advanced
			await this.userExperienceService.setExperienceLevel(
				ExperienceLevel.ADVANCED,
			);
			vscode.window.showInformationMessage(
				"Switched to advanced mode. All features are now available.",
			);
		}

		// Update context
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.showAdvancedFeatures",
			this.userExperienceService.isAdvanced(),
		);

		logger.info("Advanced mode toggled", {
			newLevel: this.userExperienceService.getExperienceLevel(),
		});
	}

	/**
	 * Show all features (upgrade to advanced)
	 */
	private async showAllFeatures(): Promise<void> {
		await this.userExperienceService.setExperienceLevel(
			ExperienceLevel.ADVANCED,
		);
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.showAdvancedFeatures",
			true,
		);
		vscode.window.showInformationMessage(
			"All features are now visible. You can hide advanced features from settings.",
		);

		logger.info("All features shown (upgraded to advanced)");
	}

	/**
	 * Reset experience level (for testing)
	 */
	private async resetExperienceLevel(): Promise<void> {
		const confirmed = await vscode.window.showWarningMessage(
			"This will reset your experience level and show beginner UI. Continue?",
			{ modal: true },
			"Reset",
		);

		if (confirmed === "Reset") {
			await this.userExperienceService.resetExperience();
			vscode.window.showInformationMessage(
				"Experience level reset. Restart VSCode to see changes.",
			);

			logger.info("Experience level reset by user");
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}
