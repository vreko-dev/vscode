import type { AnonymousIdManager } from "../auth/AnonymousIdManager";
import { logger } from "../utils/logger";
import type { TelemetryProxy } from "./telemetry-proxy";

/**
 * UserIdentityService
 *
 * Single source of truth for "Who is the current user?" in VS Code.
 * Alpha mode: identity is always anonymous  -  no server lookup required.
 */
export class UserIdentityService {
	constructor(
		private anonymousIdManager: AnonymousIdManager,
		private telemetryProxy: TelemetryProxy,
	) {
		/* intentionally empty */
	}

	/**
	 * Get the best available ID for the current user.
	 * In alpha, always returns the anonymous device ID.
	 */
	async getCurrentId(): Promise<string> {
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
