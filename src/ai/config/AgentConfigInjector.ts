/**
 * @fileoverview Agent Config Injector
 *
 * Detects AI agents and injects SnapBack context rules into their config files
 * (.cursorrules, .clinerules, etc.) with SnapBack taking precedence.
 *
 * @see stress_test_remediation.md - Push Architecture section
 */

import * as path from "node:path";
import matter from "gray-matter";
import {
	type IConfigFileWriter,
	type InjectionOptions,
	type InjectionResult,
	SNAPBACK_INJECTION_MARKER,
	SNAPBACK_RULES_VERSION,
	type SnapBackRulesFrontmatter,
} from "./types";

/**
 * Agent to config file path mapping
 */
const AGENT_CONFIG_PATHS: Record<string, string> = {
	Cursor: ".cursorrules",
	Cline: ".clinerules",
	Continue: ".continue/rules.md",
	Windsurf: ".windsurf/rules.md",
};

/**
 * Generate SnapBack rules content for injection
 * This content is placed at the TOP of config files for precedence
 */
export function generateSnapBackRulesContent(): string {
	return `${SNAPBACK_INJECTION_MARKER}
# SnapBack Context Integration

> **CRITICAL**: Read \`.snapback/ctx\` at the start of every conversation.

## Context File Format

The file \`.snapback/ctx\` contains real-time workspace state (JSON):

| Field | Description |
|-------|-------------|
| \`r\` | Risk level: L=Low, M=Medium, H=High |
| \`p\` | Protection percentage (0-100) |
| \`d\` | Dirty files count (unsnapshot changes) |
| \`l\` | Learnings array (patterns to follow) |
| \`w\` | Warnings array (address these FIRST) |
| \`h\` | Hotspots (files with past violations) |
| \`e\` | Errors array |

## Rules

1. **If \`w\` (warnings) has items** → Address warnings before implementing changes
2. **If \`h\` (hotspots) contains files** → Extra caution on those files
3. **If \`r\` = "H" (High risk)** → Create snapshot before major changes
4. **Check learnings (\`l\`)** for workspace-specific patterns

## Example Context

\`\`\`json
{"r":"L","p":100,"d":3,"l":["Use Result<T,E> pattern"],"w":[],"h":["src/auth.ts"],"e":[]}
\`\`\`

---
<!-- Your project-specific rules below -->

`;
}

/**
 * Generate SnapBack rules with modern .mdc format (YAML frontmatter)
 * Enables version tracking and conditional loading
 */
export function generateSnapBackRulesWithFrontmatter(): string {
	const frontmatter: SnapBackRulesFrontmatter = {
		description: "SnapBack workspace context integration - DO NOT REMOVE",
		alwaysApply: true,
		snapbackVersion: SNAPBACK_RULES_VERSION,
		marker: SNAPBACK_INJECTION_MARKER,
	};

	const body = `# SnapBack Context Integration

> **CRITICAL**: Read \`.snapback/ctx\` at the start of every conversation.

## Context File Format

The file \`.snapback/ctx\` contains real-time workspace state (JSON):

| Field | Description |
|-------|-------------|
| \`r\` | Risk level: L=Low, M=Medium, H=High |
| \`p\` | Protection percentage (0-100) |
| \`d\` | Dirty files count (unsnapshot changes) |
| \`l\` | Learnings array (patterns to follow) |
| \`w\` | Warnings array (address these FIRST) |
| \`h\` | Hotspots (files with past violations) |
| \`e\` | Errors array |

## Rules

1. **If \`w\` (warnings) has items** → Address warnings before implementing changes
2. **If \`h\` (hotspots) contains files** → Extra caution on those files
3. **If \`r\` = "H" (High risk)** → Create snapshot before major changes
4. **Check learnings (\`l\`)** for workspace-specific patterns

## Example Context

\`\`\`json
{"r":"L","p":100,"d":3,"l":["Use Result<T,E> pattern"],"w":[],"h":["src/auth.ts"],"e":[]}
\`\`\`

---
<!-- Your project-specific rules below -->
`;

	return matter.stringify(body, frontmatter);
}

/**
 * Parse agent config file (supports both plain markdown and YAML frontmatter)
 */
export function parseAgentConfig(content: string): {
	frontmatter: Record<string, any>;
	body: string;
} {
	try {
		const parsed = matter(content);
		return {
			frontmatter: parsed.data,
			body: parsed.content,
		};
	} catch {
		// Fallback for invalid YAML or plain markdown
		return {
			frontmatter: {},
			body: content,
		};
	}
}

/**
 * AgentConfigInjector - Injects SnapBack context into AI agent configs
 *
 * Uses dependency injection for file operations (testability).
 *
 * @example
 * ```typescript
 * const injector = new AgentConfigInjector(nodeFileWriter);
 * await injector.injectForAgent("Cursor", { workspaceRoot: "/project" });
 * ```
 */
export class AgentConfigInjector {
	private fileWriter: IConfigFileWriter;

	constructor(fileWriter: IConfigFileWriter) {
		this.fileWriter = fileWriter;
	}

	/**
	 * Get config file path for an agent
	 */
	getConfigPathForAgent(agent: string, workspaceRoot: string): string | null {
		const relativePath = AGENT_CONFIG_PATHS[agent];
		if (!relativePath) {
			return null;
		}
		return path.join(workspaceRoot, relativePath);
	}

	/**
	 * Check if file already has SnapBack injection
	 */
	async hasSnapBackInjection(filePath: string): Promise<{ hasInjection: boolean; version?: string }> {
		try {
			const exists = await this.fileWriter.exists(filePath);
			if (!exists) {
				return { hasInjection: false };
			}
			const content = await this.fileWriter.read(filePath);
			const { frontmatter } = parseAgentConfig(content);

			// Check modern frontmatter version
			if (frontmatter.snapbackVersion) {
				return {
					hasInjection: true,
					version: frontmatter.snapbackVersion as string,
				};
			}

			// Fallback: check legacy marker
			if (content.includes(SNAPBACK_INJECTION_MARKER)) {
				return { hasInjection: true, version: "legacy" };
			}

			return { hasInjection: false };
		} catch {
			return { hasInjection: false };
		}
	}

	/**
	 * Inject SnapBack context for a specific agent
	 */
	async injectForAgent(agent: string, options: InjectionOptions): Promise<InjectionResult> {
		const configPath = this.getConfigPathForAgent(agent, options.workspaceRoot);

		if (!configPath) {
			return {
				success: false,
				configPath: "",
				agent,
				action: "skipped",
				error: `Unknown agent: ${agent}`,
			};
		}

		try {
			const exists = await this.fileWriter.exists(configPath);
			const snapBackContent = generateSnapBackRulesWithFrontmatter(); // Use new frontmatter version

			// Check if already injected
			if (exists) {
				const { hasInjection, version } = await this.hasSnapBackInjection(configPath);

				if (hasInjection) {
					// Skip if up-to-date and not forced
					if (version === SNAPBACK_RULES_VERSION && !options.force) {
						return {
							success: true,
							configPath,
							agent,
							action: "skipped",
							version,
						};
					}

					// Outdated version detected
					if (version !== SNAPBACK_RULES_VERSION && version !== "legacy") {
						// Update action for outdated versions
						const existingContent = await this.fileWriter.read(configPath);
						const cleanedContent = this.removeExistingInjection(existingContent);
						const newContent = snapBackContent + cleanedContent;

						if (!options.dryRun) {
							const dir = path.dirname(configPath);
							await this.fileWriter.ensureDir(dir);
							await this.fileWriter.write(configPath, newContent);
						}

						return {
							success: true,
							configPath,
							agent,
							action: "updated",
							version: SNAPBACK_RULES_VERSION,
						};
					}
				}
			}

			// Determine action
			const action: InjectionResult["action"] = exists ? "merged" : "created";

			// Build new content
			let newContent: string;
			if (exists) {
				const existingContent = await this.fileWriter.read(configPath);
				// Remove old injection if present (for force re-inject)
				const cleanedContent = this.removeExistingInjection(existingContent);
				// Prepend SnapBack content (precedence)
				newContent = snapBackContent + cleanedContent;
			} else {
				newContent = snapBackContent;
			}

			// Write unless dry run
			if (!options.dryRun) {
				// Ensure directory exists for nested paths
				const dir = path.dirname(configPath);
				await this.fileWriter.ensureDir(dir);
				await this.fileWriter.write(configPath, newContent);
			}

			return {
				success: true,
				configPath,
				agent,
				action,
			};
		} catch (error) {
			return {
				success: false,
				configPath,
				agent,
				action: "skipped",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Inject for all detected agents
	 */
	async injectForDetectedAgents(agents: string[], options: InjectionOptions): Promise<InjectionResult[]> {
		const results: InjectionResult[] = [];

		for (const agent of agents) {
			const result = await this.injectForAgent(agent, options);
			results.push(result);
		}

		return results;
	}

	/**
	 * Remove existing SnapBack injection from content
	 */
	private removeExistingInjection(content: string): string {
		// Find marker and remove everything up to "---" separator or end of injection block
		const markerIndex = content.indexOf(SNAPBACK_INJECTION_MARKER);
		if (markerIndex === -1) {
			return content;
		}

		// Find the end of injection (marked by "---" followed by user content marker)
		const endMarker = "<!-- Your project-specific rules below -->";
		const endIndex = content.indexOf(endMarker, markerIndex);

		if (endIndex !== -1) {
			// Remove injection block + the end marker + newlines
			const afterEnd = content.indexOf("\n", endIndex + endMarker.length);
			if (afterEnd !== -1) {
				return content.substring(afterEnd + 1).trimStart();
			}
			return content.substring(endIndex + endMarker.length).trimStart();
		}

		// Fallback: remove up to first "---" separator
		const separatorIndex = content.indexOf("\n---\n", markerIndex);
		if (separatorIndex !== -1) {
			return content.substring(separatorIndex + 5).trimStart();
		}

		// Last resort: just remove the marker line
		return content.replace(SNAPBACK_INJECTION_MARKER, "").trimStart();
	}
}
