/**
 * Local threshold constants for VSCode extension
 *
 * @deprecated Use ThresholdClient from @vreko/core/config/thresholds instead
 * These are kept for backward compatibility during migration.
 */
export const THRESHOLDS = {
	session: {
		idleTimeout: 105000, // 105 seconds
		minSessionDuration: 5000, // 5 seconds
		maxSessionDuration: 3600000, // 1 hour
	},
	protection: {
		protectedCooldown: 600000, // 10 minutes
		otherCooldown: 300000, // 5 minutes
		debounceWindow: 5000, // 5 seconds
	},
	risk: {
		blockingThreshold: 8.0,
		highThreshold: 5.0,
	},
	resources: {
		snapshotMaxFileSize: 10 * 1024 * 1024, // 10MB
		snapshotMaxTotalSize: 500 * 1024 * 1024, // 500MB
		snapshotMaxFiles: 10000,
		dedupCacheSize: 500,
	},
} as const;

export type Thresholds = typeof THRESHOLDS;
