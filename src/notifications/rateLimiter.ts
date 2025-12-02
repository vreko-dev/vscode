/**
 * @fileoverview Notification Rate Limiter
 *
 * Prevents notification spam by enforcing minimum intervals between repeated notifications.
 * Uses a simple time-based approach with automatic cleanup of expired entries.
 */

/**
 * Simple rate limiter for notifications.
 * Prevents the same notification from firing multiple times rapidly.
 */
export class NotificationRateLimiter {
	private readonly recentNotifications = new Map<string, number>();
	private readonly cleanupInterval: NodeJS.Timeout;

	constructor(
		private readonly minIntervalMs: number = 5000, // 5 seconds default
		private readonly maxEntries: number = 100,
	) {
		// Cleanup old entries every minute
		this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
	}

	/**
	 * Check if a notification should be shown based on rate limiting.
	 * @param notificationKey Unique key for the notification (e.g., "protection:file.ts:warn")
	 * @returns true if notification should be shown, false if rate-limited
	 */
	shouldShow(notificationKey: string): boolean {
		const now = Date.now();
		const lastShown = this.recentNotifications.get(notificationKey);

		if (lastShown && now - lastShown < this.minIntervalMs) {
			return false; // Too soon, rate-limited
		}

		return true;
	}

	/**
	 * Mark a notification as shown (call after showing).
	 */
	markShown(notificationKey: string): void {
		// Enforce max entries to prevent memory leak
		if (this.recentNotifications.size >= this.maxEntries) {
			this.cleanup();
		}

		this.recentNotifications.set(notificationKey, Date.now());
	}

	/**
	 * Convenience method: check and mark in one call.
	 * @returns true if notification was shown, false if rate-limited
	 */
	tryShow(notificationKey: string): boolean {
		if (this.shouldShow(notificationKey)) {
			this.markShown(notificationKey);
			return true;
		}
		return false;
	}

	/**
	 * Reset rate limiting for a specific notification.
	 */
	reset(notificationKey: string): void {
		this.recentNotifications.delete(notificationKey);
	}

	/**
	 * Clear all rate limiting state.
	 */
	resetAll(): void {
		this.recentNotifications.clear();
	}

	/**
	 * Dispose of the rate limiter (stop cleanup interval).
	 */
	dispose(): void {
		clearInterval(this.cleanupInterval);
		this.recentNotifications.clear();
	}

	private cleanup(): void {
		const now = Date.now();
		const expireTime = this.minIntervalMs * 2; // Keep for 2x the interval

		for (const [key, timestamp] of this.recentNotifications) {
			if (now - timestamp > expireTime) {
				this.recentNotifications.delete(key);
			}
		}
	}
}

// Singleton instance for easy access
let rateLimiterInstance: NotificationRateLimiter | null = null;

export function getNotificationRateLimiter(): NotificationRateLimiter {
	if (!rateLimiterInstance) {
		rateLimiterInstance = new NotificationRateLimiter();
	}
	return rateLimiterInstance;
}

export function disposeNotificationRateLimiter(): void {
	rateLimiterInstance?.dispose();
	rateLimiterInstance = null;
}
