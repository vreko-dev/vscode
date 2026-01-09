/**
 * Data Transformation Utilities
 *
 * Transforms backend data formats (from WorkspaceDataService) to UI component formats.
 *
 * @packageDocumentation
 */

import type { AgentGuidance, BackendVitalsData, SessionHealth, UIGuidance, UIVitalsData } from "./types";

// =============================================================================
// VITALS TRANSFORMATIONS
// =============================================================================

/**
 * Transform backend vitals data to UI component format
 *
 * Backend format (WorkspaceDataService.VitalsData):
 * - pulse: { changesPerMinute, level }
 * - temperature: { aiPercentage, level }
 * - pressure: { value }
 * - oxygen: { value }
 * - trajectory: string
 *
 * UI format (@snapback/ui WorkspaceVitals):
 * - pulse: number (0-100)
 * - temperature: number (0-100)
 * - pressure: number (0-100)
 * - oxygen: number (0-100)
 * - score: number (0-100)
 *
 * @param vitals - Backend vitals data
 * @param sessionHealth - Session health for score calculation
 * @returns UI-formatted vitals data
 */
export function transformVitalsToUI(vitals: BackendVitalsData | null, sessionHealth?: SessionHealth): UIVitalsData {
	if (!vitals) {
		return getDefaultUIVitals();
	}

	// Normalize pulse (changesPerMinute typically 0-60+, cap at 100 for display)
	const pulse = Math.min(100, vitals.pulse.changesPerMinute * 2);

	// Temperature is already 0-100 (aiPercentage)
	const temperature = vitals.temperature.aiPercentage;

	// Pressure is already 0-100
	const pressure = vitals.pressure.value;

	// Oxygen is already 0-100
	const oxygen = vitals.oxygen.value;

	// Score is health score (inverse of pressure-based risk)
	// Use sessionHealth if available, otherwise derive from pressure
	const score = sessionHealth?.healthScore ?? Math.max(0, 100 - pressure);

	return { pulse, temperature, pressure, oxygen, score };
}

/**
 * Get default vitals when no data is available
 */
export function getDefaultUIVitals(): UIVitalsData {
	return {
		pulse: 0,
		temperature: 0,
		pressure: 0,
		oxygen: 100,
		score: 100,
	};
}

// =============================================================================
// GUIDANCE TRANSFORMATIONS
// =============================================================================

/**
 * Transform backend guidance to UI component format
 *
 * Backend format (WorkspaceDataService.AgentGuidance):
 * - safeOperations: string[]
 * - blockedOperations: string[]
 * - suggestion: string
 *
 * UI format (@snapback/ui WorkspaceVitals):
 * - message: string
 *
 * @param guidance - Backend guidance data
 * @returns UI-formatted guidance
 */
export function transformGuidanceToUI(guidance: AgentGuidance | null | undefined): UIGuidance | undefined {
	if (!guidance?.suggestion) {
		return undefined;
	}

	return {
		message: guidance.suggestion,
	};
}

// =============================================================================
// TIME FORMATTING
// =============================================================================

/**
 * Format timestamp to relative time string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string (e.g., "2 min ago", "1 hour ago", "Yesterday")
 */
export function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) {
		return "Just now";
	}
	if (minutes < 60) {
		return `${minutes} min ago`;
	}
	if (hours < 24) {
		return `${hours} hour${hours > 1 ? "s" : ""} ago`;
	}
	if (days === 1) {
		return "Yesterday";
	}
	if (days < 7) {
		return `${days} days ago`;
	}

	// For older events, return the date
	return new Date(timestamp).toLocaleDateString();
}

/**
 * Format timestamp to time-of-day string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string (e.g., "2:30 PM")
 */
export function formatTimeOfDay(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}

// =============================================================================
// EVENT TYPE ICONS
// =============================================================================

/**
 * Activity event type icon mapping
 * Matches ActivityEvent.type values
 */
export const EVENT_TYPE_ICONS: Record<string, string> = {
	"ai-edit": "✨",
	"manual-snapshot": "💾",
	"auto-snapshot": "🔄",
	restore: "↩️",
} as const;

/**
 * Get icon for activity event type
 *
 * @param type - Event type
 * @returns Emoji icon
 */
export function getEventIcon(type: string): string {
	return EVENT_TYPE_ICONS[type] || "📌";
}

// =============================================================================
// VIOLATION STATUS
// =============================================================================

/**
 * Violation promotion status icons
 */
export const VIOLATION_STATUS_ICONS: Record<string, string> = {
	tracking: "📍",
	ready_for_promotion: "⚠️",
	promoted: "📋",
	automated: "🤖",
} as const;

/**
 * Get icon for violation promotion status
 *
 * @param status - Promotion status
 * @returns Emoji icon
 */
export function getViolationStatusIcon(status: string): string {
	return VIOLATION_STATUS_ICONS[status] || "📍";
}

// =============================================================================
// LEARNING TYPE ICONS
// =============================================================================

/**
 * Learning type icons
 */
export const LEARNING_TYPE_ICONS: Record<string, string> = {
	pattern: "📐",
	pitfall: "⚠️",
	efficiency: "⚡",
	discovery: "💡",
	workflow: "🔄",
} as const;

/**
 * Get icon for learning type
 *
 * @param type - Learning type
 * @returns Emoji icon
 */
export function getLearningTypeIcon(type: string): string {
	return LEARNING_TYPE_ICONS[type] || "📝";
}
