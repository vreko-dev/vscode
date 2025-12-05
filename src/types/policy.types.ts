/**
 * Policy types for .snapback/policy.json
 */

export type OverrideRationale =
	| "testing" // Temporary testing override
	| "temporary_fix" // Short-term workaround for bug
	| "legacy_compat" // Legacy system compatibility
	| "performance"; // Performance optimization

export interface PolicyOverride {
	/**
	 * Glob pattern to match files
	 */
	pattern: string;

	/**
	 * Overridden protection level
	 */
	level: "watch" | "warn" | "block" | "unprotected";

	/**
	 * Required rationale for override
	 */
	rationale: OverrideRationale;

	/**
	 * Optional description providing context
	 */
	description?: string;

	/**
	 * TTL as Unix timestamp (milliseconds)
	 * If not provided, override never expires
	 */
	ttl?: number;

	/**
	 * Metadata for tracking
	 */
	metadata?: {
		createdBy?: string;
		createdAt: number;
		ticket?: string; // Link to issue tracker
	};
}

export interface PolicyRule {
	/**
	 * Glob pattern to match files
	 */
	pattern: string;

	/**
	 * Protection level to apply
	 */
	level: "watch" | "warn" | "block";

	/**
	 * Optional reason for protection
	 */
	reason?: string;

	/**
	 * Whether to auto-create snapshots
	 */
	autoSnapshot?: boolean;

	/**
	 * Debounce time in milliseconds
	 */
	debounce?: number;

	/**
	 * Rule precedence (higher number = higher priority)
	 * Rules with the same precedence are resolved by order (later rules override earlier ones)
	 */
	precedence?: number;
}

export interface PolicyConfig {
	/**
	 * Version of the policy format
	 */
	version: "1.0";

	/**
	 * Policy rules to apply
	 */
	rules: PolicyRule[];

	/**
	 * Temporary overrides with expiration
	 */
	overrides?: PolicyOverride[];

	/**
	 * Patterns to ignore (never protect)
	 */
	ignore?: string[];

	/**
	 * Default settings
	 */
	settings?: {
		/**
		 * Default protection level for files not matching any rules
		 */
		defaultProtectionLevel?: "watch" | "warn" | "block" | "unprotected";

		/**
		 * Whether to require a message when creating snapshots
		 */
		requireSnapshotMessage?: boolean;

		/**
		 * Maximum number of snapshots to keep
		 */
		maxSnapshots?: number;

		/**
		 * Warning threshold before override expires (in days)
		 */
		overrideExpirationWarningDays?: number;
	};
}
