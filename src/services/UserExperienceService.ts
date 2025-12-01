/**
 * User Experience Service
 *
 * Manages progressive disclosure of features based on user experience level.
 * Tracks user actions and adjusts UI complexity accordingly.
 *
 * Now uses SDK's ExperienceClassifier for consistent experience classification.
 */

import {
	ExperienceClassifier,
	type ExperienceTier,
	type IKeyValueStorage,
} from "@snapback/sdk";
import * as vscode from "vscode";
import { logger } from "../utils/logger.js";

/**
 * User experience levels for progressive disclosure
 * Maps to SDK's ExperienceTier but maintains VSCode-specific naming
 */
export enum ExperienceLevel {
	/** New user, show simplified UI (maps to 'explorer') */
	BEGINNER = "beginner",
	/** Familiar user, show standard UI (maps to 'intermediate') */
	INTERMEDIATE = "intermediate",
	/** Power user, show all features (maps to 'power') */
	ADVANCED = "advanced",
}

/**
 * VSCode GlobalState storage adapter for SDK's ExperienceClassifier
 */
class VSCodeStorageAdapter implements IKeyValueStorage {
	constructor(private globalState: vscode.Memento) {}

	async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
		if (defaultValue === undefined) {
			return this.globalState.get<T>(`snapback.experience.${key}`);
		}
		return this.globalState.get<T>(`snapback.experience.${key}`, defaultValue);
	}

	async set<T>(key: string, value: T): Promise<void> {
		await this.globalState.update(`snapback.experience.${key}`, value);
	}
}

/**
 * Service for managing user experience level and progressive disclosure
 * Now wraps SDK's ExperienceClassifier for consistent classification
 */
export class UserExperienceService {
	private context: vscode.ExtensionContext;
	private classifier: ExperienceClassifier;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Initialize SDK's ExperienceClassifier
		this.classifier = new ExperienceClassifier({
			storage: new VSCodeStorageAdapter(context.globalState),
			logger: logger,
		});
	}

	/**
	 * Maps SDK's ExperienceTier to VSCode's ExperienceLevel
	 */
	private tierToLevel(tier: ExperienceTier): ExperienceLevel {
		switch (tier) {
			case "explorer":
				return ExperienceLevel.BEGINNER;
			case "intermediate":
				return ExperienceLevel.INTERMEDIATE;
			case "power":
				return ExperienceLevel.ADVANCED;
			default:
				return ExperienceLevel.BEGINNER;
		}
	}

	/**
	 * Maps VSCode's ExperienceLevel to SDK's ExperienceTier
	 */
	private levelToTier(level: ExperienceLevel): ExperienceTier {
		switch (level) {
			case ExperienceLevel.BEGINNER:
				return "explorer";
			case ExperienceLevel.INTERMEDIATE:
				return "intermediate";
			case ExperienceLevel.ADVANCED:
				return "power";
		}
	}

	/**
	 * Get current user experience level
	 */
	async getExperienceLevel(): Promise<ExperienceLevel> {
		const tier = await this.classifier.getExperienceTier();
		return this.tierToLevel(tier);
	}

	/**
	 * Check if user is at beginner level
	 */
	async isBeginner(): Promise<boolean> {
		const level = await this.getExperienceLevel();
		return level === ExperienceLevel.BEGINNER;
	}

	/**
	 * Check if user is at intermediate level
	 */
	async isIntermediate(): Promise<boolean> {
		const level = await this.getExperienceLevel();
		return level === ExperienceLevel.INTERMEDIATE;
	}

	/**
	 * Check if user is at advanced level
	 */
	async isAdvanced(): Promise<boolean> {
		const level = await this.getExperienceLevel();
		return level === ExperienceLevel.ADVANCED;
	}

	/**
	 * Check if a feature should be shown based on experience level
	 */
	async shouldShowFeature(requiredLevel: ExperienceLevel): Promise<boolean> {
		const levelOrder = [
			ExperienceLevel.BEGINNER,
			ExperienceLevel.INTERMEDIATE,
			ExperienceLevel.ADVANCED,
		];

		const currentLevel = await this.getExperienceLevel();
		const currentIndex = levelOrder.indexOf(currentLevel);
		const requiredIndex = levelOrder.indexOf(requiredLevel);

		return currentIndex >= requiredIndex;
	}

	/**
	 * Track user action and update experience level
	 */
	async trackAction(
		action:
			| "snapshotCreated"
			| "snapshotRestored"
			| "protectionChanged"
			| "sessionFinalized"
			| "commandExecuted",
	): Promise<void> {
		const previousLevel = await this.getExperienceLevel();

		// Update metrics using SDK classifier
		switch (action) {
			case "snapshotCreated":
				await this.classifier.updateExperienceMetrics("snapshotsCreated");
				break;
			case "snapshotRestored":
				await this.classifier.updateExperienceMetrics("manualRestores");
				break;
			case "protectionChanged":
				await this.classifier.updateExperienceMetrics("protectedFiles");
				break;
			case "sessionFinalized":
				await this.classifier.updateExperienceMetrics("sessionsRecorded");
				break;
			case "commandExecuted":
				// Command diversity is tracked separately via recordCommandUsage
				break;
		}

		// Recalculate experience level
		const newLevel = await this.getExperienceLevel();

		// Notify if level changed
		if (previousLevel !== newLevel) {
			await this.onLevelChanged(previousLevel, newLevel);
		}

		logger.debug("User action tracked", {
			action,
			previousLevel,
			newLevel,
		});
	}

	/**
	 * Track command usage for diversity metric
	 */
	async trackCommand(command: string): Promise<void> {
		await this.classifier.recordCommandUsage(command);
	}

	/**
	 * Manually set experience level (for testing or user preference)
	 */
	async setExperienceLevel(level: ExperienceLevel): Promise<void> {
		const previousLevel = await this.getExperienceLevel();
		const tier = this.levelToTier(level);

		await this.classifier.setExperienceTier(tier);

		// Update context for when clauses
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.experienceLevel",
			level,
		);

		if (previousLevel !== level) {
			await this.onLevelChanged(previousLevel, level);
		}
	}

	/**
	 * Get contextual hint for current user action
	 */
	async getContextualHint(context: string): Promise<string | undefined> {
		if (await this.isAdvanced()) {
			return undefined; // Advanced users don't need hints
		}

		const hints: Record<string, string> = {
			firstSnapshot:
				"💡 Tip: SnapBack automatically creates snapshots when you save protected files",
			firstProtection:
				"💡 Tip: Use 🟢 Watch for silent snapshots, 🟡 Warn for confirmations, 🔴 Block for required notes",
			firstRestore:
				"💡 Tip: You can compare snapshots side-by-side before restoring",
			firstSession:
				"💡 Tip: Sessions group related changes together for atomic rollback",
			commandPalette:
				"💡 Tip: Press Ctrl+Shift+P (Cmd+Shift+P on Mac) to see all SnapBack commands",
			treeView:
				"💡 Tip: Click the SnapBack icon in the activity bar to see all your snapshots",
		};

		return hints[context];
	}

	/**
	 * Get recommended next action based on experience level
	 */
	async getRecommendedAction(): Promise<string | undefined> {
		const metrics = await this.classifier.getExperienceMetrics();

		if (await this.isBeginner()) {
			if (metrics.snapshotsCreated === 0) {
				return "Try protecting your first file! Right-click any file and select 'SnapBack: Protect File'";
			}
			if (metrics.protectedFiles === 0) {
				return "Explore protection levels! Right-click a protected file and try different protection levels";
			}
		}

		if (await this.isIntermediate()) {
			if (metrics.manualRestores === 0) {
				return "Learn how to restore snapshots! Open the SnapBack view and try restoring a previous version";
			}
			if (metrics.sessionsRecorded === 0) {
				return "Discover sessions! Make multiple file changes to see them grouped into a session";
			}
		}

		return undefined;
	}

	/**
	 * Handle experience level change
	 */
	private async onLevelChanged(
		previousLevel: ExperienceLevel,
		newLevel: ExperienceLevel,
	): Promise<void> {
		logger.info("User experience level changed", { previousLevel, newLevel });

		// Update VSCode context for when clauses
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.experienceLevel",
			newLevel,
		);

		// Show congratulations message
		const messages: Record<ExperienceLevel, string> = {
			[ExperienceLevel.BEGINNER]: "", // No message for beginner
			[ExperienceLevel.INTERMEDIATE]:
				"🎉 You're now an intermediate SnapBack user! More features are now available.",
			[ExperienceLevel.ADVANCED]:
				"🚀 You're now a SnapBack power user! All advanced features are unlocked.",
		};

		const message = messages[newLevel];
		if (message) {
			vscode.window
				.showInformationMessage(message, "Learn More")
				.then((choice) => {
					if (choice === "Learn More") {
						vscode.commands.executeCommand("snapback.openWalkthrough");
					}
				});
		}
	}

	/**
	 * Reset user experience tracking (for testing)
	 */
	async resetExperience(): Promise<void> {
		// Reset the SDK classifier
		await this.classifier.resetExperienceTier();

		// Reset all metrics to zero
		const metrics: (keyof import("@snapback/sdk").ExperienceMetrics)[] = [
			"snapshotsCreated",
			"sessionsRecorded",
			"protectedFiles",
			"manualRestores",
			"aiAssistedSessions",
		];

		const storage = new VSCodeStorageAdapter(this.context.globalState);
		for (const metric of metrics) {
			await storage.set(metric, 0);
		}
		await storage.set("commandsUsed", {});
		await storage.set("firstUseTimestamp", Date.now());

		// Update VSCode context
		await vscode.commands.executeCommand(
			"setContext",
			"snapback.experienceLevel",
			ExperienceLevel.BEGINNER,
		);

		logger.info("User experience reset to beginner");
	}
}
