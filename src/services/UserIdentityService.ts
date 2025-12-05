import { logger } from "../utils/logger";
import type { AnonymousIdManager } from "../auth/AnonymousIdManager";
import type { AuthService } from "../auth/AuthService";
import type { TelemetryProxy } from "./telemetry-proxy";

/**
 * UserIdentityService
 *
 * Single source of truth for "Who is the current user?" in VS Code.
 * Manages the lifecycle of Anonymous -> Authenticated identity promotion.
 */
export class UserIdentityService {
	constructor(
		private anonymousIdManager: AnonymousIdManager,
		private authService: AuthService,
		private telemetryProxy: TelemetryProxy,
	) {}

	/**
	 * Get the best available ID for the current user
	 * @returns Authenticated ID if logged in, otherwise Anonymous ID
	 */
	async getCurrentId(): Promise<string> {
		const user = await this.authService.getCurrentUser();
		if (user) {
			return user.id;
		}
		return await this.anonymousIdManager.getOrCreate();
	}

	/**
	 * Handle a user logging in
	 * Triggers identity merge (alias) in PostHog via Proxy
	 */
	async handleLogin(userId: string): Promise<void> {
		try {
			const anonymousId = await this.anonymousIdManager.get();
			logger.info("User logged in, merging identities", {
				userId,
				anonymousId,
			});

			if (anonymousId) {
				// Link Anon (previous) -> Auth (new master)
				await this.telemetryProxy.identify(userId, anonymousId);
			} else {
				// Just identify
				await this.telemetryProxy.identify(userId);
			}
		} catch (error) {
			logger.error("Failed to handle login identity merge", error as Error);
		}
	}

	/**
	 * Handle logout
	 * (Optional: resets state if needed)
	 */
	async handleLogout(): Promise<void> {
		// No-op for now, next event will pick up Anon ID
	}
}
