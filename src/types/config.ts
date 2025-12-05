/**
 * Base configuration file interface
 */
export interface ConfigFile {
	path: string;
	type: ConfigFileType;
	language: SupportedLanguage;
	critical: boolean;
	baseline?: FileBaseline;
}

/**
 * File baseline information for config files
 */
export interface FileBaseline {
	path: string;
	hash: string;
	timestamp: number;
	size: number;
}

/**
 * Configuration file types
 */
export type ConfigFileType =
	| "package"
	| "typescript"
	| "linting"
	| "build"
	| "environment"
	| "testing"
	| "framework";

/**
 * Supported programming languages
 */
export type SupportedLanguage = "javascript" | "python" | "universal";

/**
 * Configuration file interface for config detector
 */
export interface DetectedConfigFile {
	type: string;
	path: string;
	name: string;
}

/**
 * Result of parsing a config file
 */
export interface ConfigParseResult {
	content: unknown;
	valid: boolean;
	error?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Result of validating a config file
 */
export interface ConfigValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Change in a config file
 */
export interface ConfigChange {
	type: "added" | "modified" | "deleted";
	file: string;
	timestamp: number;
}
