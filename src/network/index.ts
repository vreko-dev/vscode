/**
 * @fileoverview Network Adapter Module
 *
 * Exports network adapter interface and implementations.
 *
 * Usage:
 * ```typescript
 * import { FetchNetworkAdapter } from './network';
 *
 * const adapter = new FetchNetworkAdapter();
 * const response = await adapter.get('https://api.snapback.dev/health');
 * ```
 */

export * from "./FetchNetworkAdapter.js";
export * from "./NetworkAdapter.js";
