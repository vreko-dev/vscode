import * as vscode from "vscode";
import type { PioneerProfile, Tier } from "./types";

const TIER_ORDER: readonly Tier[] = ["seedling", "grower", "cultivator", "guardian"];

export class PioneerGatekeeper implements vscode.Disposable {
	private static instance: PioneerGatekeeper;
	private currentProfile: PioneerProfile | null = null;
	private readonly _onDidChangeStatus = new vscode.EventEmitter<PioneerProfile | null>();

	/** Event fired when pioneer status changes */
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private constructor() {}

	static getInstance(): PioneerGatekeeper {
		if (!PioneerGatekeeper.instance) {
			PioneerGatekeeper.instance = new PioneerGatekeeper();
		}
		return PioneerGatekeeper.instance;
	}

	/** @internal For testing only - resets singleton instance */
	static resetInstance(): void {
		if (PioneerGatekeeper.instance) {
			PioneerGatekeeper.instance.dispose();
		}
		PioneerGatekeeper.instance = undefined as unknown as PioneerGatekeeper;
	}

	setProfile(profile: PioneerProfile | null): void {
		this.currentProfile = profile;
		this._onDidChangeStatus.fire(profile);
	}

	private get tierRank(): number {
		if (!this.currentProfile) {
			return -1;
		}
		return TIER_ORDER.indexOf(this.currentProfile.tier);
	}

	canUseFeature(feature: "clusters" | "co-change"): boolean {
		if (!this.currentProfile) {
			return false;
		}

		if (feature === "clusters") {
			return true; // All pioneers
		}
		if (feature === "co-change") {
			return this.tierRank >= 1; // Grower+
		}

		return false;
	}

	getUpsellMessage(feature: string): string {
		if (feature === "co-change" && this.tierRank < 1) {
			return "Reach Grower tier to unlock Co-Change Analysis";
		}
		return "";
	}

	/**
	 * Get current profile for status bar display
	 */
	getProfile(): PioneerProfile | null {
		return this.currentProfile;
	}

	/**
	 * Get emoji for tier - single source of truth for VS Code extension
	 */
	getTierEmoji(tier: Tier): string {
		const tierEmojis: Record<Tier, string> = {
			seedling: "🌱",
			grower: "🌿",
			cultivator: "🌳",
			guardian: "🌲",
		};
		return tierEmojis[tier] ?? "🌱";
	}

	dispose(): void {
		this._onDidChangeStatus.dispose();
	}
}
