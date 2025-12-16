/**
 * Barrel export for all bridge implementations
 *
 * Bridges route operations between VS Code and @snapback/engine,
 * providing feature-flag based V1/V2 switching.
 */

export { EventBridge, type EventBridgeOptions } from "./EventBridge";
export { type AIDetectionResult, type BurstState, SignalBridge, type SignalBridgeOptions } from "./SignalBridge";
export { StorageBridge, type StorageBridgeConfig } from "./StorageBridge";
