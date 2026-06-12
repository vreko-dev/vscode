/**
 * MCP Config Types & Stubs - Local definitions for thin client architecture
 *
 * Replaces @vreko/mcp-config imports with local stub implementations.
 * In thin client mode, MCP configuration is handled by the daemon.
 */

// =============================================================================
// AI CLIENT TYPES
// =============================================================================

export interface AIClientConfig {
	name: string;
	displayName: string;
	configPath: string;
	exists: boolean;
	hasVreko: boolean;
	format?: string;
	version?: string;
}

export interface ValidationIssue {
	severity: "error" | "warning" | "info";
	message: string;
	path?: string;
}

export interface ValidationResult {
	valid: boolean;
	isValid: boolean;
	issues: ValidationIssue[];
	errors: string[];
	warnings: string[];
}

export interface WorkspaceConfig {
	hasConfig: boolean;
	configPath?: string;
	clients: AIClientConfig[];
}

// =============================================================================
// DETECTION RESULT TYPES
// =============================================================================

export interface DetectionResult {
	clients: AIClientConfig[];
	detected: AIClientConfig[];
	needsSetup: AIClientConfig[];
}

export interface WorkspaceConfigResult {
	type?: string;
	hasConfig: boolean;
	configPath?: string;
}

// =============================================================================
// DETECTION STUBS (synchronous  -  callers do NOT await)
// =============================================================================

export function detectAIClients(_options?: { cwd?: string }): DetectionResult {
	// Thin client stub - return empty detection result
	return { clients: [], detected: [], needsSetup: [] };
}

export function detectWorkspaceConfig(_workspacePath?: string): WorkspaceConfigResult | null {
	// Thin client stub - no workspace config detected
	return null;
}

// =============================================================================
// CONFIG MANAGEMENT STUBS
// =============================================================================

export interface VrekoMCPConfig {
	command: string;
	args: string[];
	env?: Record<string, string>;
}

export function getVrekoMCPConfig(_options?: Record<string, unknown>): VrekoMCPConfig {
	return {
		command: "npx",
		args: ["@vreko/cli", "mcp", "--stdio"],
	};
}

export interface WriteConfigResult {
	success: boolean;
	error?: string;
}

export function writeClientConfig(_client: AIClientConfig, _config: VrekoMCPConfig): WriteConfigResult {
	// Thin client stub - return success
	return { success: true };
}

export function removeVrekoConfig(_client: AIClientConfig): { success: boolean; error?: string } {
	// Thin client stub - return success
	return { success: true };
}

export function validateClientConfig(_client: AIClientConfig): ValidationResult {
	return { valid: true, isValid: true, issues: [], errors: [], warnings: [] };
}

export function repairClientConfig(_client: AIClientConfig): { success: boolean; error?: string } {
	// Thin client stub - return success
	return { success: true };
}
