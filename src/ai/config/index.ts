/**
 * @fileoverview AI Config Module Exports
 *
 * Agent config injection for AI assistants
 */

export { AgentConfigInjector, generateSnapBackRulesContent } from "./AgentConfigInjector";
export { autoConfigureAgentRules, registerAgentRulesCommands } from "./auto-configure";
export { createNodeFileWriter, NodeConfigFileWriter } from "./NodeConfigFileWriter";
export type {
	AgentConfigFormat,
	AgentConfigMapping,
	IConfigFileWriter,
	InjectionOptions,
	InjectionResult,
	SnapBackContextFile,
} from "./types";
export { AGENT_CONFIG_MAPPINGS, SNAPBACK_INJECTION_MARKER } from "./types";
