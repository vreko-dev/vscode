import * as vscode from "vscode";

interface PioneerProfile {
	id: string;
	username: string;
	tier: "seedling" | "grower" | "cultivator" | "guardian";
	totalPoints: number;
	joinedAt: string;
	referralCode: string;
	githubStarred: boolean;
}

export class PioneerAuth {
	async login(): Promise<vscode.AuthenticationSession | undefined> {
		const session = await vscode.authentication.getSession("github", ["read:user", "user:email"], {
			createIfNone: true,
		});
		if (session) {
			// PostHog telemetry would go here
			// posthog.capture('pioneer_signup_completed', { auth_method: 'github_vscode' });
		}
		return session;
	}

	async getProfile(): Promise<PioneerProfile | null> {
		const session = await vscode.authentication.getSession("github", ["read:user", "user:email"], {
			createIfNone: false,
		});
		if (!session) {
			return null;
		}

		// Stub backend fetch
		return {
			id: session.account.id,
			username: session.account.label,
			tier: "seedling",
			totalPoints: 0,
			joinedAt: new Date().toISOString(),
			referralCode: "PENDING",
			githubStarred: false,
		};
	}
}
