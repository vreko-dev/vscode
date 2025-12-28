/**
 * @fileoverview AgentConfigInjector Unit Tests
 *
 * TDD RED Phase: Tests for auto-injecting SnapBack context into AI agent configs
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	AgentConfigInjector,
	generateSnapBackRulesContent,
	generateSnapBackRulesWithFrontmatter,
	parseAgentConfig,
} from "../../../src/ai/config/AgentConfigInjector";
import {
	SNAPBACK_INJECTION_MARKER,
	SNAPBACK_RULES_VERSION,
	type IConfigFileWriter,
	type InjectionOptions,
} from "../../../src/ai/config/types";

// Mock file writer for testing
function createMockFileWriter(files: Record<string, string> = {}): IConfigFileWriter {
	const storage = new Map(Object.entries(files));
	return {
		exists: vi.fn(async (path: string) => storage.has(path)),
		read: vi.fn(async (path: string) => {
			const content = storage.get(path);
			if (!content) throw new Error(`File not found: ${path}`);
			return content;
		}),
		write: vi.fn(async (path: string, content: string) => {
			storage.set(path, content);
		}),
		ensureDir: vi.fn(async () => {}),
	};
}

describe("AgentConfigInjector", () => {
	let injector: AgentConfigInjector;
	let mockWriter: IConfigFileWriter;

	beforeEach(() => {
		mockWriter = createMockFileWriter();
		injector = new AgentConfigInjector(mockWriter);
	});

	describe("generateSnapBackRulesContent", () => {
		it("should generate content with injection marker", () => {
			const content = generateSnapBackRulesContent();
			expect(content).toContain(SNAPBACK_INJECTION_MARKER);
		});

		it("should include .snapback/ctx reference", () => {
			const content = generateSnapBackRulesContent();
			expect(content).toContain(".snapback/ctx");
		});

		it("should include context file format documentation", () => {
			const content = generateSnapBackRulesContent();
			expect(content).toContain("Risk level");
			expect(content).toContain("warnings");
			expect(content).toContain("hotspots");
		});

		it("should include precedence rules", () => {
			const content = generateSnapBackRulesContent();
			expect(content).toContain("CRITICAL");
			expect(content).toContain("before");
		});
	});

	describe("generateSnapBackRulesWithFrontmatter", () => {
		it("should generate YAML frontmatter with version", () => {
			const content = generateSnapBackRulesWithFrontmatter();
			expect(content).toContain("---");
			expect(content).toContain(`snapbackVersion: ${SNAPBACK_RULES_VERSION}`);
			expect(content).toContain("description:");
			expect(content).toContain("alwaysApply: true");
		});

		it("should include marker in frontmatter", () => {
			const content = generateSnapBackRulesWithFrontmatter();
			expect(content).toContain(SNAPBACK_INJECTION_MARKER);
		});

		it("should include markdown body after frontmatter", () => {
			const content = generateSnapBackRulesWithFrontmatter();
			const parts = content.split("---");
			expect(parts.length).toBeGreaterThan(2);
			expect(parts[2]).toContain("SnapBack Context Integration");
		});
	});

	describe("parseAgentConfig", () => {
		it("should parse YAML frontmatter", () => {
			const config = `---
description: Test
snapbackVersion: 1.0.0
alwaysApply: true
---
# Body`;
			const parsed = parseAgentConfig(config);
			expect(parsed.frontmatter.snapbackVersion).toBe("1.0.0");
			expect(parsed.body).toContain("# Body");
		});

		it("should return empty frontmatter for plain markdown", () => {
			const config = "# Plain markdown\nNo frontmatter";
			const parsed = parseAgentConfig(config);
			expect(parsed.frontmatter).toEqual({});
			expect(parsed.body).toBe(config);
		});
	});

	describe("injectForAgent", () => {
		it("should create new config file if none exists", async () => {
			const options: InjectionOptions = {
				workspaceRoot: "/test/workspace",
			};

			const result = await injector.injectForAgent("Cursor", options);

			expect(result.success).toBe(true);
			expect(result.action).toBe("created");
			expect(result.configPath).toContain(".cursorrules");
			expect(mockWriter.write).toHaveBeenCalled();
		});

		it("should merge with existing config file", async () => {
			mockWriter = createMockFileWriter({
				"/test/workspace/.cursorrules": "# Existing rules\n\nDo something",
			});
			injector = new AgentConfigInjector(mockWriter);

			const options: InjectionOptions = {
				workspaceRoot: "/test/workspace",
			};

			const result = await injector.injectForAgent("Cursor", options);

			expect(result.success).toBe(true);
			expect(result.action).toBe("merged");

			// Should preserve existing content
			const writeCall = vi.mocked(mockWriter.write).mock.calls[0];
			expect(writeCall[1]).toContain("Existing rules");
			expect(writeCall[1]).toContain(SNAPBACK_INJECTION_MARKER);
		});

		it("should skip if already injected and force=false", async () => {
			const configWithFrontmatter = `---
snapbackVersion: ${SNAPBACK_RULES_VERSION}
---
# Already configured`;
			mockWriter = createMockFileWriter({
				"/test/workspace/.cursorrules": configWithFrontmatter,
			});
			injector = new AgentConfigInjector(mockWriter);

			const options: InjectionOptions = {
				workspaceRoot: "/test/workspace",
				force: false,
			};

			const result = await injector.injectForAgent("Cursor", options);

			expect(result.success).toBe(true);
			expect(result.action).toBe("skipped");
			expect(result.version).toBe(SNAPBACK_RULES_VERSION);
			expect(mockWriter.write).not.toHaveBeenCalled();
		});

		it("should update if outdated version detected", async () => {
			const outdatedConfig = `---
snapbackVersion: 0.9.0
---
# Old version`;
			mockWriter = createMockFileWriter({
				"/test/workspace/.cursorrules": outdatedConfig,
			});
			injector = new AgentConfigInjector(mockWriter);

			const options: InjectionOptions = {
				workspaceRoot: "/test/workspace",
			};

			const result = await injector.injectForAgent("Cursor", options);

			expect(result.success).toBe(true);
			expect(result.action).toBe("updated");
			expect(result.version).toBe(SNAPBACK_RULES_VERSION);
			expect(mockWriter.write).toHaveBeenCalled();
		});

		it("should re-inject if force=true", async () => {
			mockWriter = createMockFileWriter({
				"/test/workspace/.cursorrules": `${SNAPBACK_INJECTION_MARKER}\n# Old version`,
			});
			injector = new AgentConfigInjector(mockWriter);

			const options: InjectionOptions = {
				workspaceRoot: "/test/workspace",
				force: true,
			};

			const result = await injector.injectForAgent("Cursor", options);

			expect(result.success).toBe(true);
			expect(result.action).toBe("merged");
			expect(mockWriter.write).toHaveBeenCalled();
		});

		it("should support dry run mode", async () => {
			const options: InjectionOptions = {
				workspaceRoot: "/test/workspace",
				dryRun: true,
			};

			const result = await injector.injectForAgent("Cursor", options);

			expect(result.success).toBe(true);
			expect(mockWriter.write).not.toHaveBeenCalled();
		});
	});

	describe("injectForDetectedAgents", () => {
		it("should inject for all detected agents", async () => {
			const detectedAgents = ["Cursor", "Cline"];
			const options: InjectionOptions = {
				workspaceRoot: "/test/workspace",
			};

			const results = await injector.injectForDetectedAgents(detectedAgents, options);

			expect(results).toHaveLength(2);
			expect(results.every((r) => r.success)).toBe(true);
		});

		it("should return partial results on failures", async () => {
			// Make write fail for specific path
			mockWriter.write = vi.fn(async (path: string) => {
				if (path.includes(".clinerules")) {
					throw new Error("Permission denied");
				}
			});
			injector = new AgentConfigInjector(mockWriter);

			const detectedAgents = ["Cursor", "Cline"];
			const options: InjectionOptions = {
				workspaceRoot: "/test/workspace",
			};

			const results = await injector.injectForDetectedAgents(detectedAgents, options);

			expect(results).toHaveLength(2);
			const cursorResult = results.find((r) => r.agent === "Cursor");
			const clineResult = results.find((r) => r.agent === "Cline");

			expect(cursorResult?.success).toBe(true);
			expect(clineResult?.success).toBe(false);
			expect(clineResult?.error).toContain("Permission denied");
		});
	});

	describe("hasSnapBackInjection", () => {
		it("should detect existing injection", async () => {
			mockWriter = createMockFileWriter({
				"/test/workspace/.cursorrules": `${SNAPBACK_INJECTION_MARKER}\n# Rules`,
			});
			injector = new AgentConfigInjector(mockWriter);

			const result = await injector.hasSnapBackInjection(
				"/test/workspace/.cursorrules",
			);

			expect(result.hasInjection).toBe(true);
			expect(result.version).toBe("legacy");
		});

		it("should return false for files without injection", async () => {
			mockWriter = createMockFileWriter({
				"/test/workspace/.cursorrules": "# Plain rules",
			});
			injector = new AgentConfigInjector(mockWriter);

			const result = await injector.hasSnapBackInjection(
				"/test/workspace/.cursorrules",
			);

			expect(result.hasInjection).toBe(false);
			expect(result.version).toBeUndefined();
		});

		it("should return false for non-existent files", async () => {
			const result = await injector.hasSnapBackInjection(
				"/test/workspace/.cursorrules",
			);

			expect(result.hasInjection).toBe(false);
			expect(result.version).toBeUndefined();
		});
	});

	describe("getConfigPathForAgent", () => {
		it("should return correct path for Cursor", () => {
			const path = injector.getConfigPathForAgent("Cursor", "/workspace");
			expect(path).toBe("/workspace/.cursorrules");
		});

		it("should return correct path for Cline", () => {
			const path = injector.getConfigPathForAgent("Cline", "/workspace");
			expect(path).toBe("/workspace/.clinerules");
		});

		it("should return correct path for Continue", () => {
			const path = injector.getConfigPathForAgent("Continue", "/workspace");
			expect(path).toBe("/workspace/.continue/rules.md");
		});

		it("should return correct path for Windsurf", () => {
			const path = injector.getConfigPathForAgent("Windsurf", "/workspace");
			expect(path).toBe("/workspace/.windsurf/rules.md");
		});

		it("should return null for unknown agents", () => {
			const path = injector.getConfigPathForAgent("Unknown", "/workspace");
			expect(path).toBeNull();
		});
	});
});
