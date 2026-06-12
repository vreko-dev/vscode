/**
 * State Pattern UI Mapping Tests
 *
 * Validates that all ConnectionState values have user-friendly mappings
 * with no technical terms exposed to users.
 *
 * Pattern: Intelligence Layer test patterns with exhaustiveness checks
 */

import { describe, expect, it } from "vitest";

// Import types from actual implementation
type ConnectionState = "connected" | "disconnected" | "reconnecting" | "cli_missing" | "degraded";

// Define the structure we expect from CONNECTION_STATE_MAP
interface StateMapping {
	label: string;
	meaning: string;
	icon: string;
	action?: string;
}

// Mock CONNECTION_STATE_MAP for testing (will be replaced with actual import after Phase 2)
// This validates the contract that Phase 2 must implement
const CONNECTION_STATE_MAP: Record<ConnectionState, StateMapping> = {
	connected: {
		label: "Protected",
		meaning: "Your code is being protected",
		icon: "$(shield-check)",
		action: undefined, // No action needed when protected
	},
	disconnected: {
		label: "Not Protected",
		meaning: "Protection is currently unavailable",
		icon: "$(shield-x)",
		action: "Click to fix",
	},
	reconnecting: {
		label: "Reconnecting",
		meaning: "Attempting to restore protection",
		icon: "$(sync~spin)",
		action: undefined, // Auto-recovering, no user action needed
	},
	cli_missing: {
		label: "Setup Needed",
		meaning: "One-step install required",
		icon: "$(warning)",
		action: "Click to install (one step)",
	},
	degraded: {
		label: "Slow Response",
		meaning: "Protection active but responding slowly",
		icon: "$(shield-check)",
		action: "Click to speed up recovery",
	},
};

// State transition validation map (VALID_TRANSITIONS from plan)
// Maps from-state to array of valid to-states
const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
	disconnected: ["reconnecting", "cli_missing"],
	reconnecting: ["connected", "disconnected", "degraded"],
	connected: ["disconnected", "degraded"],
	degraded: ["connected", "disconnected"],
	cli_missing: ["reconnecting"], // Must install first, then reconnect
};

/**
 * Check if a state transition is valid
 */
function canTransition(from: ConnectionState, to: ConnectionState): boolean {
	const allowedTransitions = VALID_TRANSITIONS[from];
	return allowedTransitions.includes(to);
}

describe("CONNECTION_STATE_MAP", () => {
	it("should have mappings for all connection states", () => {
		const states: ConnectionState[] = ["connected", "disconnected", "reconnecting", "cli_missing", "degraded"];

		for (const state of states) {
			expect(CONNECTION_STATE_MAP[state]).toBeDefined();
			expect(CONNECTION_STATE_MAP[state]).toHaveProperty("label");
			expect(CONNECTION_STATE_MAP[state]).toHaveProperty("meaning");
			expect(CONNECTION_STATE_MAP[state]).toHaveProperty("icon");
		}
	});

	it("should not expose technical terms to users", () => {
		// Technical terms that should NEVER appear in user-facing text
		const technicalTerms = ["daemon", "mcp", "socket", "ENOENT", "circuit breaker", "IPC", "RPC"];

		for (const stateConfig of Object.values(CONNECTION_STATE_MAP)) {
			const text = `${stateConfig.label} ${stateConfig.meaning} ${stateConfig.action || ""}`.toLowerCase();

			for (const term of technicalTerms) {
				expect(text).not.toContain(term.toLowerCase());
			}
		}
	});

	it("should provide actions for actionable states", () => {
		// States that require user action
		expect(CONNECTION_STATE_MAP.cli_missing.action).toBeTruthy();
		expect(CONNECTION_STATE_MAP.disconnected.action).toBeTruthy();
		expect(CONNECTION_STATE_MAP.degraded.action).toBeTruthy();

		// States that don't require user action
		expect(CONNECTION_STATE_MAP.connected.action).toBeUndefined();
		expect(CONNECTION_STATE_MAP.reconnecting.action).toBeUndefined();
	});

	it("should handle all ConnectionState enum values (exhaustiveness check)", () => {
		// If a new state is added but not mapped, this catches it
		const allStates: ConnectionState[] = ["connected", "disconnected", "reconnecting", "cli_missing", "degraded"];

		for (const state of allStates) {
			expect(CONNECTION_STATE_MAP[state]).toBeDefined();
			expect(CONNECTION_STATE_MAP[state].label).toBeTruthy();
			expect(CONNECTION_STATE_MAP[state].meaning).toBeTruthy();
			expect(CONNECTION_STATE_MAP[state].icon).toBeTruthy();
		}

		// Verify no extra states in map
		const mapStates = Object.keys(CONNECTION_STATE_MAP) as ConnectionState[];
		expect(mapStates.sort()).toEqual(allStates.sort());
	});

	it("should validate state transitions", () => {
		// Valid transitions
		expect(canTransition("disconnected", "reconnecting")).toBe(true);
		expect(canTransition("reconnecting", "connected")).toBe(true);
		expect(canTransition("connected", "disconnected")).toBe(true);
		expect(canTransition("connected", "degraded")).toBe(true);
		expect(canTransition("degraded", "connected")).toBe(true);

		// Invalid transitions - user must follow proper flow
		expect(canTransition("cli_missing", "connected")).toBe(false); // Must go through reconnecting
		expect(canTransition("connected", "cli_missing")).toBe(false); // Can't lose CLI while connected
		expect(canTransition("degraded", "cli_missing")).toBe(false); // Invalid state flow
	});

	it("should use consistent terminology across all states", () => {
		const labels = Object.values(CONNECTION_STATE_MAP).map((s) => s.label);

		// Verify consistent capitalization
		for (const label of labels) {
			expect(label[0]).toMatch(/[A-Z]/); // First letter capitalized
		}

		// Verify concise labels (progressive disclosure - icon → tooltip → click)
		for (const label of labels) {
			expect(label.length).toBeLessThan(20); // Max 20 chars for status bar
		}
	});
});
