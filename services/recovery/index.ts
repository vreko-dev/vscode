/**
 * @fileoverview Recovery Services - Public API
 *
 * Barrel export for recovery service interfaces and types.
 * Import from this module for clean, consistent imports.
 *
 * @example
 * ```typescript
 * import {
 *   IRecoveryService,
 *   ISessionStatsProvider,
 *   type RecoverySnapshot
 * } from "@vscode/services/recovery";
 * ```
 *
 * @packageDocumentation
 */

export type {
	IRecoveryService,
	ISessionStatsProvider,
	RecoverySnapshot,
	SessionStats,
	SnapshotFilter,
} from "./interfaces";

export { RecoveryService } from "./RecoveryService";
