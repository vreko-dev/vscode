/**
 * State Pattern UI Mapping (2026 Best Practices)
 *
 * Maps ConnectionState (internal FSM) to UserFacingState (progressive disclosure UI).
 * Implements state transition validation to catch invalid state flows from DaemonBridge.
 *
 * ## Design Principles
 * 1. **No Technical Terms**: Users see "Protected", not "service connected"
 * 2. **Progressive Disclosure**: Icon → tooltip → click actions
 * 3. **FSM Validation**: Prevent impossible state transitions (e.g., cli_missing → connected)
 *
 * Pattern Source: Intelligence Layer FSM patterns + 2026 UX best practices
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import type { ConnectionState } from "../services/DaemonBridge";

/**
 * User-Facing State Configuration
 *
 * Defines the complete UI presentation for each internal connection state.
 */
export interface UserFacingState {
	/** Status bar label (concise, 2-4 chars + icon) */
	label: string;
	/** User-friendly meaning (no technical terms) */
	meaning: string;
	/** Action hint for tooltip */
	action: string | null;
	/** Theme color */
	color: vscode.ThemeColor | undefined;
	/** Background color */
	backgroundColor: vscode.ThemeColor | undefined;
}

/**
 * Connection State → User-Facing State Map
 *
 * IMPORTANT: Never expose technical terms like "service", "MCP", "socket", "ENOENT"
 * Users care about protection state, not implementation details.
 */
export const CONNECTION_STATE_MAP: Record<ConnectionState, UserFacingState> = {
	connected: {
		label: "VR ✓",
		meaning: "Protected",
		action: null,
		color: new vscode.ThemeColor("testing.iconPassed"),
		backgroundColor: undefined,
	},
	disconnected: {
		label: "VR ✗",
		meaning: "Not Protected",
		action: "Click to fix",
		color: undefined,
		backgroundColor: new vscode.ThemeColor("statusBarItem.errorBackground"),
	},
	reconnecting: {
		label: "VR $(sync~spin)",
		meaning: "Reconnecting",
		action: null,
		color: undefined,
		backgroundColor: undefined,
	},
	cli_missing: {
		label: "VR ↓",
		meaning: "Setup needed",
		action: "Click to install (one step)",
		color: undefined,
		backgroundColor: new vscode.ThemeColor("statusBarItem.errorBackground"),
	},
	degraded: {
		label: "VR ⚠",
		meaning: "Limited protection",
		action: "Click to speed up recovery",
		color: undefined,
		backgroundColor: new vscode.ThemeColor("statusBarItem.warningBackground"),
	},
};

/**
 * Valid State Transitions
 *
 * Prevents invalid state flows (e.g., cli_missing → connected without reconnecting).
 * Catches bugs where DaemonBridge emits impossible sequences.
 */
export const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
	connected: ["disconnected", "degraded"],
	disconnected: ["reconnecting", "cli_missing"],
	reconnecting: ["connected", "disconnected"],
	cli_missing: ["reconnecting"], // Must reconnect, can't jump to connected
	degraded: ["connected", "disconnected"],
};

/**
 * Validates state transition is allowed
 *
 * @returns true if transition is valid, false otherwise
 */
export function canTransition(from: ConnectionState, to: ConnectionState): boolean {
	return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
