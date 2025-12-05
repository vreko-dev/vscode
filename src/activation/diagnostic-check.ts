/**
 * Deprecated: SQLite diagnostic checks
 *
 * This module is no longer used during extension activation.
 * The SnapBack extension uses file-based storage exclusively.
 *
 * Kept for reference only. Can be removed in future versions.
 */

import { logger } from "../utils/logger.js";

/**
 * @deprecated Not used in current activation flow
 */
export class DiagnosticCheck {
	/**
	 * @deprecated Not used
	 */
	static async checkSqlJsWasm(): Promise<{
		available: boolean;
		wasmPath?: string;
		error?: string;
	}> {
		logger.warn("[DiagnosticCheck] checkSqlJsWasm is deprecated and not used");
		return { available: false, error: "Deprecated method" };
	}

	/**
	 * @deprecated Not used
	 */
	static async checkBetterSqlite3(): Promise<{
		available: boolean;
		error?: string;
	}> {
		logger.warn(
			"[DiagnosticCheck] checkBetterSqlite3 is deprecated and not used",
		);
		return { available: false, error: "Deprecated method" };
	}

	/**
	 * @deprecated Not used
	 */
	static async runAll(): Promise<{
		sqliteImplementationAvailable: boolean;
		checks: {
			betterSqlite3: { available: boolean; error?: string };
			sqlJsWasm: {
				available: boolean;
				wasmPath?: string;
				error?: string;
			};
		};
		summary: string;
	}> {
		logger.warn("[DiagnosticCheck] runAll is deprecated and not used");
		return {
			sqliteImplementationAvailable: false,
			checks: {
				betterSqlite3: { available: false, error: "Deprecated" },
				sqlJsWasm: { available: false, error: "Deprecated" },
			},
			summary: "DiagnosticCheck is deprecated",
		};
	}
}
