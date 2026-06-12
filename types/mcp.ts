/**
 * MCP Types - Local definitions for thin client architecture
 *
 * Replaces @vreko/mcp type imports.
 */

export type AlertCategory =
	| "protection"
	| "session"
	| "ai"
	| "system"
	| "performance"
	| "pressure_threshold"
	| "violation_recurrence"
	| "critical_file_touch"
	| "high_risk_file";

export interface ProactiveAlert {
	id: string;
	category: AlertCategory;
	severity: "info" | "warning" | "error" | "critical";
	title?: string;
	message?: string;
	summary: string;
	details?: string;
	suggested_action?: string;
	confidence: number;
	dismissible: boolean;
	learning_id?: string;
	timestamp: number;
	actions?: Array<{ label: string; command: string }>;
}
