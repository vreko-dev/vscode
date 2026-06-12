/**
 * Adapters Module
 *
 * Exports all adapter implementations for the VS Code extension.
 * Adapters provide interface translations between different parts of the system.
 *
 * @module adapters
 */

export { DaemonSnapshotAdapter } from "./DaemonSnapshotAdapter";
export { GlobalStateStorageAdapter } from "./GlobalStateStorageAdapter";
export { VscodeEventEmitterAdapter } from "./VscodeEventEmitterAdapter";
