/**
 * Barrel export for all bridge implementations
 *
 * Bridges route operations between VS Code and @snapback/engine,
 * providing feature-flag based V1/V2 switching.
 */

export { EventBridge, type EventBridgeOptions } from "./EventBridge";
export {
	type AnalysisResultInput,
	disposeIntelligenceBridge,
	getIntelligenceBridge,
	IntelligenceBridge,
	type IntelligenceBridgeOptions,
	initializeIntelligenceBridge,
	type SessionMetadata,
	type UserBehaviorInput,
} from "./IntelligenceBridge";
export {
	disposeMCPBridge,
	getMCPBridge,
	MCPBridge,
	type MCPBridgeConfig,
	type MCPFileChange,
	type MCPObservation,
} from "./MCPBridge";
export { type AIDetectionResult, type BurstState, SignalBridge, type SignalBridgeOptions } from "./SignalBridge";
export {
	disposeSignalOrchestrator,
	type FileForSignals,
	getSignalOrchestrator,
	SignalOrchestrator,
	type SignalOrchestratorResult,
} from "./SignalOrchestrator";
export { StorageBridge, type StorageBridgeConfig } from "./StorageBridge";
