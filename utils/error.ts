/**
 * Local error utilities for VSCode extension
 *
 * These utilities are now re-exported from @vreko/contracts/errors
 * for consistency across all Vreko packages.
 *
 * @deprecated Import directly from @vreko/contracts/errors instead
 */

// Re-export unified utilities from contracts
export {
	ensureError,
	extractErrorMessage as getErrorMessage,
	getErrorStack,
	isErrorWithCode,
	toError,
} from "@vreko/contracts/errors";
