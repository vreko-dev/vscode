/**
 * VSCode Error Helpers
 *
 * This module provides error handling utilities for the VSCode extension,
 * including re-exports from @vreko/sdk and extension-specific helpers.
 *
 * @module errorHelpers
 */

export { toError } from "./error";

/**
 * Check if an error originates from Vreko extension code.
 *
 * Used to filter errors in global error handlers so we only log/report
 * errors from our code, not from other extensions sharing the host.
 *
 * @param stack - Error stack trace string
 * @returns true if the error appears to originate from Vreko code
 */
export function isVrekoError(stack: string | undefined): boolean {
	if (!stack) {
		return false;
	}
	// Check if error originates from Vreko extension code
	return stack.includes("/vreko/") || stack.includes("\\vreko\\") || stack.includes("@vreko");
}
