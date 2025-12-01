import { logger } from "../utils/logger.js";

/**
 * Pre-flight diagnostic checks for critical dependencies
 * Runs during activation to verify sql.js/sqlite availability
 */
export class DiagnosticCheck {
	/**
	 * Check if sql.js WASM binary is accessible
	 */
	static async checkSqlJsWasm(): Promise<{
		available: boolean;
		wasmPath?: string;
		error?: string;
	}> {
		try {
			// Try to locate sql.js
			let wasmPath: string | undefined;

			try {
				const sqlJsModulePath = require.resolve("sql.js");
				const pathModule = await import("path");
				const sqlJsDir = pathModule.dirname(sqlJsModulePath);
				const candidatePath = pathModule.join(sqlJsDir, "sql-wasm.wasm");

				const fsModule = await import("fs");
				if (fsModule.existsSync(candidatePath)) {
					wasmPath = candidatePath;
				}
			} catch {
				// Fallback: try to load sql.js module itself
				try {
					// @ts-ignore sql.js types not available in this environment
					const sqlJsModule = await import("sql.js");
					if (sqlJsModule && typeof sqlJsModule === "object") {
						logger.debug(
							"[DiagnosticCheck] sql.js module found but WASM path detection failed",
						);
						return {
							available: true,
							error: "sql.js found but WASM path could not be determined",
						};
					}
				} catch (innerErr) {
					return {
						available: false,
						error: `sql.js module not found: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
					};
				}
			}

			return {
				available: !!wasmPath,
				wasmPath,
				error: wasmPath ? undefined : "sql-wasm.wasm file not found",
			};
		} catch (error) {
			return {
				available: false,
				error: `Unexpected error during WASM check: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Check if better-sqlite3 is available
	 */
	static async checkBetterSqlite3(): Promise<{
		available: boolean;
		error?: string;
	}> {
		try {
			const betterSqlite3 = await import("better-sqlite3");
			if (betterSqlite3) {
				return { available: true };
			}
			return { available: false, error: "better-sqlite3 module exported nothing" };
		} catch (error) {
			return {
				available: false,
				error: `better-sqlite3 not available: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Run all diagnostic checks and return summary
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
		const betterSqlite3Check = await this.checkBetterSqlite3();
		const sqlJsWasmCheck = await this.checkSqlJsWasm();

		const sqliteImplementationAvailable =
			betterSqlite3Check.available || sqlJsWasmCheck.available;

		let summary = "";
		if (sqliteImplementationAvailable) {
			const available: string[] = [];
			if (betterSqlite3Check.available) available.push("better-sqlite3 (native)");
			if (sqlJsWasmCheck.available) available.push("sql.js (WASM)");
			summary = `SQLite implementation available: ${available.join(", ")}`;
		} else {
			const errors: string[] = [];
			if (betterSqlite3Check.error) errors.push(`better-sqlite3: ${betterSqlite3Check.error}`);
			if (sqlJsWasmCheck.error) errors.push(`sql.js: ${sqlJsWasmCheck.error}`);
			summary = `No SQLite implementation available. ${errors.join(" | ")}`;
		}

		logger.info("[DiagnosticCheck] " + summary);

		return {
			sqliteImplementationAvailable,
			checks: {
				betterSqlite3: betterSqlite3Check,
				sqlJsWasm: sqlJsWasmCheck,
			},
			summary,
		};
	}
}
