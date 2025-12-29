/**
 * SDK Logger Adapter
 *
 * Adapts the VSCode extension logger to the @snapback-oss/sdk ILogger interface.
 * This allows SDK components to use VSCode's structured logging.
 */
import type { ILogger } from "@snapback-oss/sdk";
import { logger as vscodeLogger } from "./logger";

/**
 * VSCode Logger Adapter implementing SDK's ILogger interface
 *
 * @example
 * ```typescript
 * import { sdkLogger } from './utils/sdkLoggerAdapter';
 * import { SnapshotNamingStrategy } from '@snapback-oss/sdk';
 *
 * const strategy = new SnapshotNamingStrategy(workspaceRoot, {
 *   logger: sdkLogger
 * });
 * ```
 */
export const sdkLogger: ILogger = {
	debug(message: string, data?: unknown): void {
		vscodeLogger.debug(message, data as Record<string, unknown>);
	},

	info(message: string, data?: unknown): void {
		vscodeLogger.info(message, data as Record<string, unknown>);
	},

	error(message: string, error?: Error, data?: unknown): void {
		vscodeLogger.error(message, error, data as Record<string, unknown>);
	},
};
