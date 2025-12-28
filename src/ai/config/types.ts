/**
 * @fileoverview Agent Config Injection Types
 *
 * Types for auto-injecting SnapBack context into AI agent config files
 * (.cursorrules, .clinerules, etc.) with SnapBack precedence.
 */

import type { AIAssistantName } from "@snapback/sdk";

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
 * SnapBack context file format (.snapback/ctx)
 * Wire format for push architecture
 */
export interface SnapBackContextFile {
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
 * Marker comment to identify SnapBack-injected content
 */
export const SNAPBACK_INJECTION_MARKER = "<!-- SNAPBACK_CONTEXT_INJECTION_V1 -->";

/**
 * Current version of SnapBack rules format
 */
export const SNAPBACK_RULES_VERSION = "1.0.0";

/**
 * YAML frontmatter for modern .mdc format
 */
export interface SnapBackRulesFrontmatter {
	/** Human-readable description */
	description: string;
	/** File patterns this rule applies to */
	globs?: string[];
	/** Always load this rule */
	alwaysApply: boolean;
	/** SnapBack rules version for tracking updates */
	snapbackVersion: string;
	/** Marker for identifying injected content */
	marker: string;
}

/**
 * Agent config mappings - maps AI assistants to their config files
 */
export const AGENT_CONFIG_MAPPINGS: AgentConfigMapping[] = [
	{
		assistant: "CONTINUE",
		configPath: ".cursorrules",
		format: "cursorrules",
		displayName: "Cursor",
	},
	{
		assistant: "CONTINUE",
		configPath: ".clinerules",
		format: "clinerules",
		displayName: "Cline",
	},
	{
		assistant: "CONTINUE",
		configPath: ".continue/rules.md",
		format: "continue",
		displayName: "Continue",
	},
	{
		assistant: "WINDSURF",
		configPath: ".windsurf/rules.md",
		format: "windsurf",
		displayName: "Windsurf",
	},
];
