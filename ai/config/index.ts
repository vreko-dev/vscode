/**
 * @fileoverview AI Config Module Exports
 *
 * Agent config injection for AI assistants
 */

export { AgentConfigInjector, generateVrekoRulesContent } from "./AgentConfigInjector";
export { autoConfigureAgentRules, registerAgentRulesCommands } from "./auto-configure";
export { createNodeFileWriter, NodeConfigFileWriter } from "./NodeConfigFileWriter";
export type {
	AgentConfigFormat,
	AgentConfigMapping,
	IConfigFileWriter,
	InjectionOptions,
	InjectionResult,
	VrekoContextFile,
} from "./types";
export { AGENT_CONFIG_MAPPINGS, VREKO_INJECTION_MARKER } from "./types";
