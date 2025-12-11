export type Tier = "seedling" | "grower" | "cultivator" | "guardian";

export interface PioneerProfile {
	id: string;
	username: string;
	tier: Tier;
	totalPoints: number;
	joinedAt: string;
	referralCode: string;
	githubStarred: boolean;
}
