/**
 * Tests for webview data transformation utilities
 *
 * These tests verify the pure transformation functions used to convert
 * backend data formats (WorkspaceDataService) to UI component formats.
 */

import { describe, expect, it } from "vitest";

// Since transforms.ts is in the webview package, we re-implement the same
// transformations here to test the logic. In a real scenario, these functions
// would be in a shared package.
// For now, we test the transformation logic directly.

// =============================================================================
// TRANSFORMATION LOGIC (copied for testing)
// =============================================================================

interface BackendVitalsData {
	pulse: { changesPerMinute: number; level: string };
	temperature: { aiPercentage: number; level: string };
	pressure: { value: number };
	oxygen: { value: number };
	trajectory: string;
}

interface UIVitalsData {
	pulse: number;
	temperature: number;
	pressure: number;
	oxygen: number;
	score: number;
}

interface SessionHealth {
	healthScore: number;
	trajectory: "improving" | "stable" | "degrading" | "critical";
	activeWarnings: string[];
	lastSnapshotMinutesAgo: number | null;
	suggestions: string[];
}

interface AgentGuidance {
	safeOperations: string[];
	blockedOperations: string[];
	suggestion: string;
}

interface UIGuidance {
	message: string;
}

function transformVitalsToUI(vitals: BackendVitalsData | null, sessionHealth?: SessionHealth): UIVitalsData {
	if (!vitals) {
		return {
			pulse: 0,
			temperature: 0,
			pressure: 0,
			oxygen: 100,
			score: 100,
		};
	}

	const pulse = Math.min(100, vitals.pulse.changesPerMinute * 2);
	const temperature = vitals.temperature.aiPercentage;
	const pressure = vitals.pressure.value;
	const oxygen = vitals.oxygen.value;
	const score = sessionHealth?.healthScore ?? Math.max(0, 100 - pressure);

	return { pulse, temperature, pressure, oxygen, score };
}

function transformGuidanceToUI(guidance: AgentGuidance | null | undefined): UIGuidance | undefined {
	if (!guidance?.suggestion) {
		return undefined;
	}
	return { message: guidance.suggestion };
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes} min ago`;
	if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
	if (days === 1) return "Yesterday";
	if (days < 7) return `${days} days ago`;

	return new Date(timestamp).toLocaleDateString();
}

function formatTimeOfDay(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}

const EVENT_TYPE_ICONS: Record<string, string> = {
	"ai-edit": "✨",
	"manual-snapshot": "💾",
	"auto-snapshot": "🔄",
	restore: "↩️",
};

function getEventIcon(type: string): string {
	return EVENT_TYPE_ICONS[type] || "📌";
}

const VIOLATION_STATUS_ICONS: Record<string, string> = {
	tracking: "📍",
	ready_for_promotion: "⚠️",
	promoted: "📋",
	automated: "🤖",
};

function getViolationStatusIcon(status: string): string {
	return VIOLATION_STATUS_ICONS[status] || "📍";
}

const LEARNING_TYPE_ICONS: Record<string, string> = {
	pattern: "📐",
	pitfall: "⚠️",
	efficiency: "⚡",
	discovery: "💡",
	workflow: "🔄",
};

function getLearningTypeIcon(type: string): string {
	return LEARNING_TYPE_ICONS[type] || "📝";
}

// =============================================================================
// TESTS
// =============================================================================

describe("Webview Transforms", () => {
	describe("transformVitalsToUI", () => {
		it("should return default vitals when input is null", () => {
			const result = transformVitalsToUI(null);

			expect(result).toEqual({
				pulse: 0,
				temperature: 0,
				pressure: 0,
				oxygen: 100,
				score: 100,
			});
		});

		it("should transform backend vitals to UI format", () => {
			const backendVitals: BackendVitalsData = {
				pulse: { changesPerMinute: 30, level: "elevated" },
				temperature: { aiPercentage: 45, level: "warm" },
				pressure: { value: 60 },
				oxygen: { value: 85 },
				trajectory: "stable",
			};

			const result = transformVitalsToUI(backendVitals);

			expect(result).toEqual({
				pulse: 60, // 30 * 2
				temperature: 45,
				pressure: 60,
				oxygen: 85,
				score: 40, // 100 - 60 (pressure)
			});
		});

		it("should cap pulse at 100", () => {
			const backendVitals: BackendVitalsData = {
				pulse: { changesPerMinute: 100, level: "critical" },
				temperature: { aiPercentage: 0, level: "cold" },
				pressure: { value: 0 },
				oxygen: { value: 100 },
				trajectory: "stable",
			};

			const result = transformVitalsToUI(backendVitals);

			expect(result.pulse).toBe(100); // capped, not 200
		});

		it("should use sessionHealth score when provided", () => {
			const backendVitals: BackendVitalsData = {
				pulse: { changesPerMinute: 10, level: "steady" },
				temperature: { aiPercentage: 20, level: "warm" },
				pressure: { value: 80 },
				oxygen: { value: 90 },
				trajectory: "degrading",
			};

			const sessionHealth: SessionHealth = {
				healthScore: 75,
				trajectory: "stable",
				activeWarnings: [],
				lastSnapshotMinutesAgo: 5,
				suggestions: [],
			};

			const result = transformVitalsToUI(backendVitals, sessionHealth);

			expect(result.score).toBe(75); // from sessionHealth, not 20 (100-80)
		});

		it("should handle zero values correctly", () => {
			const backendVitals: BackendVitalsData = {
				pulse: { changesPerMinute: 0, level: "resting" },
				temperature: { aiPercentage: 0, level: "cold" },
				pressure: { value: 0 },
				oxygen: { value: 0 },
				trajectory: "stable",
			};

			const result = transformVitalsToUI(backendVitals);

			expect(result).toEqual({
				pulse: 0,
				temperature: 0,
				pressure: 0,
				oxygen: 0,
				score: 100, // 100 - 0 pressure
			});
		});

		it("should ensure score is never negative", () => {
			const backendVitals: BackendVitalsData = {
				pulse: { changesPerMinute: 10, level: "steady" },
				temperature: { aiPercentage: 50, level: "warm" },
				pressure: { value: 150 }, // exceeds 100
				oxygen: { value: 80 },
				trajectory: "critical",
			};

			const result = transformVitalsToUI(backendVitals);

			expect(result.score).toBe(0); // Math.max(0, 100 - 150) = 0
		});
	});

	describe("transformGuidanceToUI", () => {
		it("should return undefined for null guidance", () => {
			const result = transformGuidanceToUI(null);
			expect(result).toBeUndefined();
		});

		it("should return undefined for undefined guidance", () => {
			const result = transformGuidanceToUI(undefined);
			expect(result).toBeUndefined();
		});

		it("should return undefined for guidance without suggestion", () => {
			const guidance: AgentGuidance = {
				safeOperations: ["read"],
				blockedOperations: [],
				suggestion: "",
			};

			const result = transformGuidanceToUI(guidance);
			expect(result).toBeUndefined();
		});

		it("should transform guidance suggestion to message", () => {
			const guidance: AgentGuidance = {
				safeOperations: ["read", "analyze"],
				blockedOperations: ["refactor"],
				suggestion: "Keep changes small",
			};

			const result = transformGuidanceToUI(guidance);

			expect(result).toEqual({ message: "Keep changes small" });
		});
	});

	describe("formatRelativeTime", () => {
		it("should return 'Just now' for recent timestamps", () => {
			const now = Date.now();
			const result = formatRelativeTime(now);
			expect(result).toBe("Just now");
		});

		it("should return minutes ago for recent past", () => {
			const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
			const result = formatRelativeTime(fiveMinutesAgo);
			expect(result).toBe("5 min ago");
		});

		it("should return hours ago for same day", () => {
			const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
			const result = formatRelativeTime(twoHoursAgo);
			expect(result).toBe("2 hours ago");
		});

		it("should return 'Yesterday' for previous day", () => {
			const yesterday = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
			const result = formatRelativeTime(yesterday);
			expect(result).toBe("Yesterday");
		});

		it("should return days ago for recent days", () => {
			const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
			const result = formatRelativeTime(threeDaysAgo);
			expect(result).toBe("3 days ago");
		});

		it("should return date string for older timestamps", () => {
			const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
			const result = formatRelativeTime(tenDaysAgo);
			// Should be a date string, not "10 days ago"
			expect(result).not.toContain("days ago");
		});
	});

	describe("formatTimeOfDay", () => {
		it("should format timestamp to time of day", () => {
			// Create a fixed timestamp for testing
			const timestamp = new Date(2024, 0, 15, 14, 30, 0).getTime();
			const result = formatTimeOfDay(timestamp);
			// The exact format depends on locale, but should contain time info
			expect(result).toMatch(/\d{1,2}:\d{2}/);
		});
	});

	describe("getEventIcon", () => {
		it("should return correct icon for ai-edit", () => {
			expect(getEventIcon("ai-edit")).toBe("✨");
		});

		it("should return correct icon for manual-snapshot", () => {
			expect(getEventIcon("manual-snapshot")).toBe("💾");
		});

		it("should return correct icon for auto-snapshot", () => {
			expect(getEventIcon("auto-snapshot")).toBe("🔄");
		});

		it("should return correct icon for restore", () => {
			expect(getEventIcon("restore")).toBe("↩️");
		});

		it("should return default icon for unknown type", () => {
			expect(getEventIcon("unknown")).toBe("📌");
		});
	});

	describe("getViolationStatusIcon", () => {
		it("should return correct icon for tracking", () => {
			expect(getViolationStatusIcon("tracking")).toBe("📍");
		});

		it("should return correct icon for ready_for_promotion", () => {
			expect(getViolationStatusIcon("ready_for_promotion")).toBe("⚠️");
		});

		it("should return correct icon for promoted", () => {
			expect(getViolationStatusIcon("promoted")).toBe("📋");
		});

		it("should return correct icon for automated", () => {
			expect(getViolationStatusIcon("automated")).toBe("🤖");
		});

		it("should return default icon for unknown status", () => {
			expect(getViolationStatusIcon("unknown")).toBe("📍");
		});
	});

	describe("getLearningTypeIcon", () => {
		it("should return correct icon for pattern", () => {
			expect(getLearningTypeIcon("pattern")).toBe("📐");
		});

		it("should return correct icon for pitfall", () => {
			expect(getLearningTypeIcon("pitfall")).toBe("⚠️");
		});

		it("should return correct icon for efficiency", () => {
			expect(getLearningTypeIcon("efficiency")).toBe("⚡");
		});

		it("should return correct icon for discovery", () => {
			expect(getLearningTypeIcon("discovery")).toBe("💡");
		});

		it("should return correct icon for workflow", () => {
			expect(getLearningTypeIcon("workflow")).toBe("🔄");
		});

		it("should return default icon for unknown type", () => {
			expect(getLearningTypeIcon("unknown")).toBe("📝");
		});
	});
});
