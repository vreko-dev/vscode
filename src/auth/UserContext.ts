/**
 * UserContext - Type-Safe User State
 *
 * Discriminated union for authenticated vs anonymous contexts.
 * Prevents mixing tier (authenticated only) with anonymous state.
 *
 * Reference: feedback.md §3.1 Issue 4 - Tier "anonymous" Type Pollution
 * TDD Status: GREEN (implementation)
 *
 * @package apps/vscode/src/auth
 */

/**
 * Authenticated user context
 *
 * When isAuthenticated: true, user has:
 * - userId: Unique identifier from auth provider
 * - tier: Subscription level (free | pro | enterprise)
 * - Can access tier-gated features
 * - Can sync across devices (with backend support)
 */
export interface AuthenticatedContext {
	readonly isAuthenticated: true;
	readonly userId: string;
	readonly email: string;
	readonly tier: "free" | "pro" | "enterprise";
	readonly name?: string;
}

/**
 * Anonymous user context
 *
 * When isAuthenticated: false, user has:
 * - anonymousId: UUID v4 for local analytics
 * - Can access anonymous-tier features (local protection, snapshots)
 * - Cannot sync across devices
 * - No cloud backup
 */
export interface AnonymousContext {
	readonly isAuthenticated: false;
	readonly anonymousId: string;
}

/**
 * Discriminated union for user context
 *
 * Usage:
 * ```ts
 * const context: UserContext = getContext();
 *
 * if (context.isAuthenticated) {
 *   // TypeScript narrows to AuthenticatedContext
 *   console.log(context.userId);        // ✅ OK
 *   console.log(context.tier);          // ✅ OK
 *   console.log(context.anonymousId);   // ❌ Compile error
 * } else {
 *   // TypeScript narrows to AnonymousContext
 *   console.log(context.anonymousId);   // ✅ OK
 *   console.log(context.tier);          // ❌ Compile error
 * }
 * ```
 */
export type UserContext = AuthenticatedContext | AnonymousContext;

/**
 * Type guard to check if context is authenticated
 *
 * @param context - User context to check
 * @returns true if context is AuthenticatedContext
 */
export function isAuthenticatedContext(
	context: UserContext,
): context is AuthenticatedContext {
	return context.isAuthenticated === true;
}

/**
 * Type guard to check if context is anonymous
 *
 * @param context - User context to check
 * @returns true if context is AnonymousContext
 */
export function isAnonymousContext(
	context: UserContext,
): context is AnonymousContext {
	return context.isAuthenticated === false;
}

/**
 * Feature access control based on context
 *
 * Example usage:
 * ```ts
 * const canBackup = canAccessFeature(context, 'cloud-backup');
 * const canSnapshot = canAccessFeature(context, 'snapshots');
 * ```
 */
export const ANONYMOUS_FEATURES = [
	"snapshots",
	"local-protection",
	"watch-mode",
	"ai-detection",
] as const;

export const TIER_FEATURES = {
	free: [
		"snapshots",
		"local-protection",
		"watch-mode",
		"ai-detection",
		"cloud-backup-limited", // 1 backup per week
		"team-view-readonly",
	] as const,
	pro: [
		"snapshots",
		"local-protection",
		"watch-mode",
		"ai-detection",
		"cloud-backup",
		"team-collaboration",
		"advanced-analytics",
	] as const,
	enterprise: [
		"snapshots",
		"local-protection",
		"watch-mode",
		"ai-detection",
		"cloud-backup",
		"team-collaboration",
		"advanced-analytics",
		"sso",
		"audit-logs",
	] as const,
} as const;

export type AnonymousFeature = (typeof ANONYMOUS_FEATURES)[number];
export type PaidFeature =
	(typeof TIER_FEATURES)[keyof typeof TIER_FEATURES][number];
export type Feature = AnonymousFeature | PaidFeature;

/**
 * Check if user can access a feature
 *
 * @param context - User context
 * @param feature - Feature to check
 * @returns true if user's tier/status allows feature access
 */
export function canAccessFeature(
	context: UserContext,
	feature: Feature,
): boolean {
	if (isAnonymousContext(context)) {
		return (ANONYMOUS_FEATURES as readonly string[]).includes(feature);
	}

	// Authenticated context
	const tierFeatures = TIER_FEATURES[context.tier];
	return (tierFeatures as readonly string[]).includes(feature);
}
