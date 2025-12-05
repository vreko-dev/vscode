import { executeSandboxedScript } from "./sandboxExecutor.js";

// Constants for sandbox limits
// const _SANDBOX_TIMEOUT_MS = 250;
// const _SANDBOX_HEAP_LIMIT_MB = 32;

/**
 * Result from executing a sandboxed script
 */
export interface SandboxResult {
	result: unknown;
	stdout: string;
	stderr: string;
	executionTime: number;
}

/**
 * Error thrown when sandbox limits are exceeded
 */
export class SandboxError extends Error {
	constructor(
		message: string,
		public readonly code:
			| "ERR_SB_TIMEOUT"
			| "ERR_SB_MEMORY"
			| "ERR_SB_CODEGEN"
			| "ERR_SB_MODULE_LOAD"
			| "ERR_SB_ENV"
			| "ERR_NON_POJO_RETURN"
			| "ERR_EXECUTION_ERROR",
	) {
		super(message);
		this.name = "SandboxError";
	}
}

/**
 * Execute a JavaScript/TypeScript file in a secure sandboxed environment
 *
 * Security features:
 * - Hard timeout limit (250ms)
 * - Memory limit (~32MB heap)
 * - Forbidden API blocking (fs, net, child_process, process)
 * - Only POJO results allowed
 *
 * @param filePath Path to the JavaScript/TypeScript file to execute
 * @returns Promise resolving to the sandbox result
 */
export async function executeSandboxedScriptWrapper(
	filePath: string,
): Promise<SandboxResult> {
	const startTime = Date.now();

	try {
		const result = await executeSandboxedScript(filePath);
		const executionTime = Date.now() - startTime;

		return {
			result,
			stdout: "",
			stderr: "",
			executionTime,
		};
	} catch (error: unknown) {
		const err = error as Error;
		// const _executionTime = Date.now() - startTime;

		// Map error types to sandbox error codes
		let code:
			| "ERR_SB_TIMEOUT"
			| "ERR_SB_MEMORY"
			| "ERR_SB_CODEGEN"
			| "ERR_SB_MODULE_LOAD"
			| "ERR_SB_ENV"
			| "ERR_NON_POJO_RETURN"
			| "ERR_EXECUTION_ERROR" = "ERR_EXECUTION_ERROR";

		if (
			err.message.includes("timeout") ||
			err.message.includes("ERR_SB_TIMEOUT")
		) {
			code = "ERR_SB_TIMEOUT";
		} else if (
			err.message.includes("memory") ||
			err.message.includes("ERR_SB_MEMORY")
		) {
			code = "ERR_SB_MEMORY";
		} else if (
			err.message.includes("codegen") ||
			err.message.includes("eval") ||
			err.message.includes("Function") ||
			err.message.includes("ERR_SB_CODEGEN")
		) {
			code = "ERR_SB_CODEGEN";
		} else if (
			err.message.includes("module") ||
			err.message.includes("_load") ||
			err.message.includes("ERR_SB_MODULE_LOAD")
		) {
			code = "ERR_SB_MODULE_LOAD";
		} else if (
			err.message.includes("env") ||
			err.message.includes("argv") ||
			err.message.includes("ERR_SB_ENV")
		) {
			code = "ERR_SB_ENV";
		} else if (
			err.message.includes("POJO") ||
			err.message.includes("function") ||
			err.message.includes("getter") ||
			err.message.includes("proxy") ||
			err.message.includes("symbol") ||
			err.message.includes("circular") ||
			err.message.includes("ERR_NON_POJO_RETURN")
		) {
			code = "ERR_NON_POJO_RETURN";
		}

		throw new SandboxError(err.message, code);
	}
}
