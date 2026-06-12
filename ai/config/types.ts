/**
 * @fileoverview Agent Config Injection Types
 *
 * Types for auto-injecting Vreko context into AI agent config files
 * (.cursorrules, .clinerules, etc.) with Vreko precedence.
 */

import type { AIAssistantName } from "../../types/sdk";

/**
 * Supported AI agent config formats
 */
export type AgentConfigFormat = "cursorrules" | "clinerules" | "continue" | "windsurf" | "copilot";

/**
 * Mapping of AI assistant to their config file details
 */
export interface AgentConfigMapping {
	/** AI assistant name from SDK */
	assistant: AIAssistantName;
	/** Config file path relative to workspace root */
	configPath: string;
	/** Config format type */
	format: AgentConfigFormat;
	/** Human-readable display name */
	displayName: string;
}

/**
 * Result of config injection operation
 */
export interface InjectionResult {
	success: boolean;
	configPath: string;
	agent: string;
	/** Whether file was created or merged */
	action: "created" | "merged" | "skipped" | "updated";
	error?: string;
	/** Version that was injected/detected */
	version?: string;
}

/**
 * Options for injection behavior
 */
export interface InjectionOptions {
	/** Force re-injection even if already configured */
	force?: boolean;
	/** Dry run - return what would be done without writing */
	dryRun?: boolean;
	/** Workspace root path */
	workspaceRoot: string;
}

/**
 * Vreko context file format (.vreko/ctx/context.json)
 * Wire format for push architecture
 */
export interface VrekoContextFile {
	/** Risk level: L=Low, M=Medium, H=High */
	r: "L" | "M" | "H";
	/** Protection percentage (0-100) */
	p: number;
	/** Dirty files count */
	d: number;
	/** Learnings array */
	l: string[];
	/** Warnings array */
	w: string[];
	/** Hotspots (files with past violations) */
	h: string[];
	/** Errors array */
	e: string[];
	/** Constraints */
	c?: {
		/** Bundle size limit */
		b?: string;
	};
}

/**
 * Interface for config file writers
 * Dependency injection for testability
 */
export interface IConfigFileWriter {
	/** Check if file exists */
	exists(path: string): Promise<boolean>;
	/** Read file content */
	read(path: string): Promise<string>;
	/** Write file content */
	write(path: string, content: string): Promise<void>;
	/** Create directory if not exists */
	ensureDir(path: string): Promise<void>;
}

/**
 * Marker comment to identify Vreko-injected content
 */
export const VREKO_INJECTION_MARKER = "<!-- VREKO_CONTEXT_INJECTION_V1 -->";

/**
 * Current version of Vreko rules format
 */
export const VREKO_RULES_VERSION = "1.0.0";

/**
 * YAML frontmatter for modern .mdc format
 */
export interface VrekoRulesFrontmatter {
	/** Human-readable description */
	description: string;
	/** File patterns this rule applies to */
	globs?: string[];
	/** Always load this rule */
	alwaysApply: boolean;
	/** Vreko rules version for tracking updates */
	vrekoVersion: string;
	/** Marker for identifying injected content */
	marker: string;
}

/**
 * Agent config mappings - maps AI assistants to their config files
 */
export const AGENT_CONFIG_MAPPINGS: AgentConfigMapping[] = [
	{
		assistant: "continue",
		configPath: ".cursorrules",
		format: "cursorrules",
		displayName: "Cursor",
	},
	{
		assistant: "continue",
		configPath: ".clinerules",
		format: "clinerules",
		displayName: "Cline",
	},
	{
		assistant: "continue",
		configPath: ".continue/rules.md",
		format: "continue",
		displayName: "Continue",
	},
	{
		assistant: "windsurf",
		configPath: ".windsurf/rules.md",
		format: "windsurf",
		displayName: "Windsurf",
	},
];
