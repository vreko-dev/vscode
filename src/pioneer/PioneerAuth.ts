import * as vscode from "vscode";
import type { PioneerProfile } from "./types";

export class PioneerAuth {
	async login(): Promise<vscode.AuthenticationSession | undefined> {
		try {
			const session = await vscode.authentication.getSession("github", ["read:user", "user:email"], {
				createIfNone: true,
			});
			if (session) {
				// PostHog telemetry would go here
				// posthog.capture('pioneer_signup_completed', { auth_method: 'github_vscode' });
			}
			return session;
		} catch (error) {
			// Re-throw to match test expectation
			throw error;
		}
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
