/**
 * @fileoverview Agent Config Injector
 *
 * Detects AI agents and injects Vreko context rules into their config files
 * (.cursorrules, .clinerules, etc.) with Vreko taking precedence.
 *
 * @see stress_test_remediation.md - Push Architecture section
 */

import * as path from "node:path";
import matter from "gray-matter";
import {
	type IConfigFileWriter,
	type InjectionOptions,
	type InjectionResult,
	VREKO_INJECTION_MARKER,
	VREKO_RULES_VERSION,
	type VrekoRulesFrontmatter,
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
 * Generate Vreko rules content for injection
 * This content is placed at the TOP of config files for precedence
 */
export function generateVrekoRulesContent(): string {
	return `${VREKO_INJECTION_MARKER}
# Vreko Context Integration

> **CRITICAL**: Read \`.vreko/ctx/context.json\` at the start of every conversation.

## Context File Format

The file \`.vreko/ctx/context.json\` contains real-time workspace state:

| Section | Key Fields | Description |
|---------|------------|-------------|
| \`meta\` | \`id\`, \`type\` | Project name and type (nextjs, react, etc) |
| \`stack\` | \`framework\`, \`packageManager\`, \`testing\` | Detected tech stack |
| \`live.vitals\` | \`risk\`, \`temperature\`, \`health\` | Current risk level (L/M/H) |
| \`live.snapshots\` | \`today\`, \`total\`, \`lastCreated\` | Snapshot statistics |
| \`live.session\` | \`aiTool\`, \`filesChanged\` | Current AI session info |
| \`live.hotFiles\` | array of filenames | Files with frequent changes |

## Rules

1. **If \`live.vitals.risk\` = "H"** → Create snapshot before major changes
2. **If \`live.hotFiles\` contains files you're editing** → Extra caution
3. **Check \`stack\`** for framework-specific patterns to follow
4. **Review \`live.session.filesChanged\`** to understand current session scope

## Example Context

\`\`\`json
{
  "meta": { "id": "my-app", "type": "nextjs" },
  "stack": { "framework": "next14", "packageManager": "pnpm", "testing": "vitest" },
  "live": {
    "vitals": { "risk": "L", "temperature": "warm", "health": 85 },
    "snapshots": { "today": 3, "total": 42 },
    "hotFiles": ["src/auth.ts", "src/api/user.ts"]
  }
}
\`\`\`

---
<!-- Your project-specific rules below -->

`;
}

/**
 * Generate Vreko rules with modern .mdc format (YAML frontmatter)
 * Enables version tracking and conditional loading
 */
export function generateVrekoRulesWithFrontmatter(): string {
	const frontmatter: VrekoRulesFrontmatter = {
		description: "Vreko workspace context integration - DO NOT REMOVE",
		alwaysApply: true,
		vrekoVersion: VREKO_RULES_VERSION,
		marker: VREKO_INJECTION_MARKER,
	};

	const body = `# Vreko Context Integration

> **CRITICAL**: Read \`.vreko/ctx/context.json\` at the start of every conversation.

## Context File Format

The file \`.vreko/ctx/context.json\` contains real-time workspace state:

| Section | Key Fields | Description |
|---------|------------|-------------|
| \`meta\` | \`id\`, \`type\` | Project name and type (nextjs, react, etc) |
| \`stack\` | \`framework\`, \`packageManager\`, \`testing\` | Detected tech stack |
| \`live.vitals\` | \`risk\`, \`temperature\`, \`health\` | Current risk level (L/M/H) |
| \`live.snapshots\` | \`today\`, \`total\`, \`lastCreated\` | Snapshot statistics |
| \`live.session\` | \`aiTool\`, \`filesChanged\` | Current AI session info |
| \`live.hotFiles\` | array of filenames | Files with frequent changes |

## Rules

1. **If \`live.vitals.risk\` = "H"** → Create snapshot before major changes
2. **If \`live.hotFiles\` contains files you're editing** → Extra caution
3. **Check \`stack\`** for framework-specific patterns to follow
4. **Review \`live.session.filesChanged\`** to understand current session scope

## Example Context

\`\`\`json
{
  "meta": { "id": "my-app", "type": "nextjs" },
  "stack": { "framework": "next14", "packageManager": "pnpm", "testing": "vitest" },
  "live": {
    "vitals": { "risk": "L", "temperature": "warm", "health": 85 },
    "snapshots": { "today": 3, "total": 42 },
    "hotFiles": ["src/auth.ts", "src/api/user.ts"]
  }
}
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
	frontmatter: Record<string, unknown>;
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
 * AgentConfigInjector - Injects Vreko context into AI agent configs
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
	 * Check if file already has Vreko injection
	 */
	async hasVrekoInjection(filePath: string): Promise<{ hasInjection: boolean; version?: string }> {
		try {
			const exists = await this.fileWriter.exists(filePath);
			if (!exists) {
				return { hasInjection: false };
			}
			const content = await this.fileWriter.read(filePath);
			const { frontmatter } = parseAgentConfig(content);

			// Check modern frontmatter version
			if (frontmatter.vrekoVersion) {
				return {
					hasInjection: true,
					version: frontmatter.vrekoVersion as string,
				};
			}

			// Fallback: check legacy marker
			if (content.includes(VREKO_INJECTION_MARKER)) {
				return { hasInjection: true, version: "legacy" };
			}

			return { hasInjection: false };
		} catch {
			return { hasInjection: false };
		}
	}

	/**
	 * Inject Vreko context for a specific agent
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
			const vrekoContent = generateVrekoRulesWithFrontmatter(); // Use new frontmatter version

			// Check if already injected
			if (exists) {
				const { hasInjection, version } = await this.hasVrekoInjection(configPath);

				if (hasInjection) {
					// Skip if up-to-date and not forced
					if (version === VREKO_RULES_VERSION && !options.force) {
						return {
							success: true,
							configPath,
							agent,
							action: "skipped",
							version,
						};
					}

					// Outdated version detected
					if (version !== VREKO_RULES_VERSION && version !== "legacy") {
						// Update action for outdated versions
						const existingContent = await this.fileWriter.read(configPath);
						const cleanedContent = this.removeExistingInjection(existingContent);
						const newContent = vrekoContent + cleanedContent;

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
							version: VREKO_RULES_VERSION,
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
				// Prepend Vreko content (precedence)
				newContent = vrekoContent + cleanedContent;
			} else {
				newContent = vrekoContent;
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
	 * Remove existing Vreko injection from content
	 */
	private removeExistingInjection(content: string): string {
		// Find marker and remove everything up to "---" separator or end of injection block
		const markerIndex = content.indexOf(VREKO_INJECTION_MARKER);
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
		return content.replace(VREKO_INJECTION_MARKER, "").trimStart();
	}
}
