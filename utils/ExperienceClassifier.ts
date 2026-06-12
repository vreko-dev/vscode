/**
 * VSCode ExperienceClassifier - Local stub for thin client architecture
 *
 * @module ExperienceClassifier
 */

import type * as vscode from "vscode";
import { GlobalStateStorageAdapter } from "../adapters/GlobalStateStorageAdapter";
import type { ExperienceMetrics, ExperienceTier, IKeyValueStorage } from "../types/sdk";
import { logger } from "./logger";

interface ExperienceClassifierOptions {
	storage: IKeyValueStorage;
	logger?: unknown;
}

/**
 * ExperienceClassifier - Local stub replacing SDK ExperienceClassifier
 */
export class ExperienceClassifier {
	private storage: IKeyValueStorage;

	constructor(contextOrOptions: vscode.ExtensionContext | ExperienceClassifierOptions) {
		if ("globalState" in contextOrOptions) {
			this.storage = new GlobalStateStorageAdapter(contextOrOptions.globalState);
		} else {
			this.storage = contextOrOptions.storage;
		}
	}

	async getExperienceTier(): Promise<ExperienceTier> {
		const tier = await this.storage.get<ExperienceTier>("experienceTier");
		return tier ?? "beginner";
	}

	async getExperienceMetrics(): Promise<ExperienceMetrics> {
		const metrics = await this.storage.get<ExperienceMetrics>("experienceMetrics");
		return (
			metrics ?? {
				totalSessions: 0,
				totalSnapshots: 0,
				totalRestores: 0,
				daysSinceFirstUse: 0,
				snapshotsCreated: 0,
				sessionsRecorded: 0,
				protectedFiles: 0,
				manualRestores: 0,
				aiAssistedSessions: 0,
			}
		);
	}

	async updateExperienceMetrics(activity: keyof ExperienceMetrics, count = 1): Promise<void> {
		const metrics = await this.getExperienceMetrics();
		const current = (metrics[activity] as number) ?? 0;
		(metrics as Record<string, number>)[activity] = current + count;
		await this.storage.set("experienceMetrics", metrics);
	}

	async recordCommandUsage(command: string): Promise<void> {
		logger.debug("Command usage recorded", { command });
	}

	async setExperienceTier(tier: ExperienceTier): Promise<void> {
		await this.storage.set("experienceTier", tier);
	}

	async resetExperienceTier(): Promise<void> {
		await this.storage.set("experienceTier", "beginner");
	}

	async getExperienceTierDescription(): Promise<string> {
		const tier = await this.getExperienceTier();
		const descriptions: Record<ExperienceTier, string> = {
			new: "Welcome! Let's get started.",
			beginner: "Learning the basics.",
			intermediate: "Getting comfortable with Vreko.",
			advanced: "Power user - all features unlocked.",
			expert: "Vreko expert.",
			explorer: "Exploring Vreko features.",
			power: "Power user - mastering advanced features.",
		};
		return descriptions[tier] ?? descriptions.beginner;
	}
}

// Re-export types for backward compatibility
export type { ExperienceMetrics, ExperienceTier };
