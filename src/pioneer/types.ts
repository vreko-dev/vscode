export type Tier = "seedling" | "grower" | "cultivator" | "guardian";

/**
 * Pioneer profile - single source of truth for VS Code extension
 * Matches API response from /api/pioneer/me
 */
export interface PioneerProfile {
	id: string;
	username: string;
	tier: Tier;
	totalPoints: number;
	joinedAt: string;
	referralCode: string;
	githubStarred: boolean;
	leaderboardVisibility?: "public" | "anonymous" | "hidden";
}

/** Valid tier values for type guards */
export const VALID_TIERS: readonly Tier[] = ["seedling", "grower", "cultivator", "guardian"] as const;

/** Type guard for tier validation */
export function isValidTier(value: string): value is Tier {
	return VALID_TIERS.includes(value as Tier);
}
