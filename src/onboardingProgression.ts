import type { Memento } from "vscode";
import * as vscode from "vscode";

interface OnboardingPhase {
	phase: number;
	trigger: string;
	unlocks: string[];
	notification?: string;
	celebration?: string;
}

interface OnboardingState {
	currentPhase: number;
	snapshotsCreated: number;
	hasRestored: boolean;
	hasProtectedFiles: boolean;
	hasUsedBulkProtection: boolean;
	extensionActivatedAt: number;
	firstProtectedAt: number;
}

export class OnboardingProgression {
	private static readonly STORAGE_KEY = "snapback:onboarding-state";
	private static readonly PROGRESSION_PATH: OnboardingPhase[] = [
		{
			phase: 1, // First interaction
			trigger: "extension.activated",
			unlocks: ["basicProtection", "manualSnapshot"],
			notification:
				"\u{1f6e1} Welcome to SnapBack! Right-click any file to add protection.",
			celebration: "You're now protected!",
		},
		{
			phase: 2, // After first protection
			trigger: "files.protected.first",
			unlocks: ["contextualPrompts", "protectionLevels"],
			notification:
				"✨ Great! You've protected your first file. Try protecting your entire repository with one click.",
			celebration: "First file protected!",
		},
		{
			phase: 3, // After 3 snapshots
			trigger: "snapshots.count >= 3",
			unlocks: ["bulkProtection"],
			notification:
				"🚀 Pro tip: You can protect entire folders at once. Try the 'Protect Entire Repository' button!",
			celebration: "Snapshot master!",
		},
		{
			phase: 4, // After bulk protection
			trigger: "bulk.protection.used",
			unlocks: ["advancedSettings", "teamPolicies"],
			notification:
				"🎯 Excellent! You've used bulk protection. Share protection rules with your team using .snapbackprotected files.",
			celebration: "Repository protected!",
		},
		{
			phase: 5, // After first restore
			trigger: "restore.successful",
			unlocks: ["advancedRestore", "snapshotComparison"],
			notification:
				"🔄 Perfect! You've successfully restored from a snapshot. You're now a SnapBack pro!",
			celebration: "Restore champion!",
		},
	];

	private state: OnboardingState;

	constructor(private readonly globalState: Memento) {
		this.state = this.loadState();
	}

	/**
	 * Initialize onboarding state when extension is activated
	 */
	initialize(): void {
		if (this.state.extensionActivatedAt === 0) {
			this.state.extensionActivatedAt = Date.now();
			this.saveState();

			// Show initial notification
			const phase1 = OnboardingProgression.PROGRESSION_PATH[0];
			if (phase1.notification) {
				vscode.window.showInformationMessage(phase1.notification);
			}
		}
	}

	/**
	 * Track when a snapshot is created
	 */
	trackSnapshotCreated(): void {
		this.state.snapshotsCreated++;
		this.saveState();
		this.checkPhaseProgression();
	}

	/**
	 * Track when a restore operation is successful
	 */
	trackRestoreSuccessful(): void {
		this.state.hasRestored = true;
		this.saveState();
		this.checkPhaseProgression();
	}

	/**
	 * Track when files are protected
	 */
	trackFilesProtected(isBulkProtection = false): void {
		if (!this.state.hasProtectedFiles) {
			this.state.hasProtectedFiles = true;
			this.state.firstProtectedAt = Date.now();
		}

		if (isBulkProtection) {
			this.state.hasUsedBulkProtection = true;
		}

		this.saveState();
		this.checkPhaseProgression();
	}

	/**
	 * Check if a feature is unlocked based on current progression
	 */
	isFeatureUnlocked(feature: string): boolean {
		// Check all phases up to current phase
		for (const phase of OnboardingProgression.PROGRESSION_PATH) {
			if (
				phase.phase <= this.state.currentPhase &&
				phase.unlocks.includes(feature)
			) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Get current onboarding phase
	 */
	getCurrentPhase(): number {
		return this.state.currentPhase;
	}

	/**
	 * Get unlocked features for current phase
	 */
	getUnlockedFeatures(): string[] {
		const features: string[] = [];
		for (const phase of OnboardingProgression.PROGRESSION_PATH) {
			if (phase.phase <= this.state.currentPhase) {
				features.push(...phase.unlocks);
			}
		}
		return [...new Set(features)]; // Remove duplicates
	}

	/**
	 * Check if this is the user's first time protecting a file
	 */
	isFirstProtection(): boolean {
		return !this.state.hasProtectedFiles;
	}

	private checkPhaseProgression(): void {
		let phaseAdvanced = false;
		let advancedPhase: OnboardingPhase | null = null;

		// Check each phase to see if we should advance
		for (const phase of OnboardingProgression.PROGRESSION_PATH) {
			if (phase.phase > this.state.currentPhase) {
				if (this.shouldAdvanceToPhase(phase)) {
					this.state.currentPhase = phase.phase;
					phaseAdvanced = true;
					advancedPhase = phase;
					break; // Only advance one phase at a time
				}
			}
		}

		if (phaseAdvanced && advancedPhase) {
			this.saveState();

			// Show celebration and notification
			if (advancedPhase.celebration) {
				vscode.window.showInformationMessage(`🎉 ${advancedPhase.celebration}`);
			}

			if (advancedPhase.notification) {
				vscode.window.showInformationMessage(advancedPhase.notification);
			}
		}
	}

	private shouldAdvanceToPhase(phase: OnboardingPhase): boolean {
		switch (phase.trigger) {
			case "extension.activated":
				return this.state.extensionActivatedAt > 0;

			case "files.protected.first":
				return this.state.hasProtectedFiles && this.state.firstProtectedAt > 0;

			case "snapshots.count >= 3":
				return this.state.snapshotsCreated >= 3;

			case "bulk.protection.used":
				return this.state.hasUsedBulkProtection;

			case "restore.successful":
				return this.state.hasRestored;

			default:
				return false;
		}
	}

	private loadState(): OnboardingState {
		const savedState = this.globalState.get<OnboardingState>(
			OnboardingProgression.STORAGE_KEY,
		);
		if (savedState) {
			return savedState;
		}

		// Return default state
		return {
			currentPhase: 1,
			snapshotsCreated: 0,
			hasRestored: false,
			hasProtectedFiles: false,
			hasUsedBulkProtection: false,
			extensionActivatedAt: 0,
			firstProtectedAt: 0,
		};
	}

	private saveState(): void {
		this.globalState.update(OnboardingProgression.STORAGE_KEY, this.state);
	}
}
