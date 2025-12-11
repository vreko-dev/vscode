import { EventEmitter } from "events";
import type { PioneerProfile, Tier } from "./types";

export class PioneerGatekeeper {
	private static instance: PioneerGatekeeper;
	private currentProfile: PioneerProfile | null = null;
	private _onDidChangePioneerStatus = new EventEmitter();

	private constructor() {}

	static getInstance(): PioneerGatekeeper {
		if (!PioneerGatekeeper.instance) {
			PioneerGatekeeper.instance = new PioneerGatekeeper();
		}
		return PioneerGatekeeper.instance;
	}

	setProfile(profile: PioneerProfile | null) {
		this.currentProfile = profile;
		this._onDidChangePioneerStatus.emit("change", profile);
	}

	private get tierRank(): number {
		if (!this.currentProfile) return -1;
		const tiers: Tier[] = ["seedling", "grower", "cultivator", "guardian"];
		return tiers.indexOf(this.currentProfile.tier);
	}

	canUseFeature(feature: "clusters" | "co-change"): boolean {
		if (!this.currentProfile) return false;

		if (feature === "clusters") return true; // All pioneers
		if (feature === "co-change") return this.tierRank >= 1; // Grower+

		return false;
	}

	getUpsellMessage(feature: string): string {
		if (feature === "co-change" && this.tierRank < 1) {
			return "Reach Grower tier to unlock Co-Change Analysis";
		}
		return "";
	}

	get onDidChangePioneerStatus() {
		return this._onDidChangePioneerStatus;
	}
}
