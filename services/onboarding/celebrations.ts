/**
 * Unified Onboarding State Machine - Celebration Triggers
 *
 * Defines celebration moments aligned with state transitions.
 * Three strategic celebrations per the spec.
 */

import { BRAND_SIGNAGE } from "../../signage/constants";
import type { CelebrationConfig, CelebrationType } from "./types";

/**
 * Celebration configurations
 * Philosophy: "Invisible until needed, celebrate when beneficial"
 *
 * Three strategic moments:
 * 1. AI Detection (handled by AIDetectionToast)
 * 2. First Snapshot - builds trust
 * 3. Engagement (10 snapshots) - Pioneer funnel entry
 */
export const CELEBRATIONS: Record<CelebrationType, CelebrationConfig> = {
	// Celebration #1: AI Detection (AIDetectionToast handles this)
	ai_detected: {
		message: `${BRAND_SIGNAGE.logo} ${BRAND_SIGNAGE.shortLabel} detected {tool}. Protection active.`,
		telemetry: "celebration.ai_detected",
	},

	// Celebration #2: First Value (on entering 'value_demonstrated')
	first_snapshot: {
		message: `${BRAND_SIGNAGE.logo} ${BRAND_SIGNAGE.shortLabel}: Your first save is protected!`,
		detail: "🦎 Vreko is watching over your code.",
		telemetry: "celebration.first_snapshot",
	},

	// Celebration #3: Engagement (on entering 'engaged')
	engaged: {
		message: `${BRAND_SIGNAGE.logo} ${BRAND_SIGNAGE.shortLabel}: Protected 10 times!`,
		detail: "You're on a roll. Join the Pioneer Program to access Pro features.",
		telemetry: "celebration.engaged",
		action: {
			title: "Join Pioneer Program",
			command: "vreko.signIn",
		},
	},
};

/**
 * Get celebration config by type
 */
export function getCelebrationConfig(type: CelebrationType): CelebrationConfig {
	return CELEBRATIONS[type];
}

/**
 * Format celebration message with dynamic content
 */
export function formatCelebrationMessage(type: CelebrationType, context?: Record<string, string>): string {
	const config = CELEBRATIONS[type];
	let message = config.message;

	if (context) {
		Object.entries(context).forEach(([key, value]) => {
			message = message.replace(`{${key}}`, value);
		});
	}

	return message;
}

/**
 * Check if celebration should be shown based on cooldown
 * Prevents celebration spam
 */
export function shouldShowCelebration(
	type: CelebrationType,
	lastShown: Record<string, number>,
	cooldownMs = 60000, // 1 minute default
): boolean {
	const lastTime = lastShown[type] || 0;
	const timeSince = Date.now() - lastTime;

	return timeSince >= cooldownMs;
}

/**
 * Vreko branding constants - re-exported from signage for consistency
 * Use BRAND_SIGNAGE.logo and BRAND_SIGNAGE.shortLabel for consistent branding
 */
export const VREKO_ICON = BRAND_SIGNAGE.logo;
export const VREKO_PREFIX = `${BRAND_SIGNAGE.logo} ${BRAND_SIGNAGE.shortLabel}:`;
