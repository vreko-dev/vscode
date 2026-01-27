/**
 * Result type for operations that can fail
 *
 * Re-exports from @snapback/contracts (canonical source per ADR-004).
 * Provides type-safe error handling without exceptions, inspired by Rust's Result type.
 * Use this pattern for operations where errors are expected and should be handled explicitly.
 *
 * @example
 * ```typescript
 * function divideNumbers(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return err('Division by zero');
 *   }
 *   return ok(a / b);
 * }
 *
 * const result = divideNumbers(10, 2);
 * if (isOk(result)) {
 *   console.log('Result:', result.value);
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 *
 * @module
 */

// Re-export everything from the canonical source
export type { Result } from "@snapback/contracts";
export {
	all,
	allOrErrors,
	andThen,
	err,
	fromPromise,
	fromPromiseWith,
	isErr,
	isOk,
	map,
	mapErr,
	match,
	ok,
	sequence,
	tap,
	tapErr,
	toPromise,
	tryAll,
	tryCatch,
	tryCatchAsync,
	unwrap,
	unwrapOr,
	unwrapOrElse,
} from "@snapback/contracts";

// Uppercase aliases for backward compatibility (deprecated)
import { err as _err, ok as _ok } from "@snapback/contracts";

/** @deprecated Use lowercase ok() instead */
export const Ok = _ok;
/** @deprecated Use lowercase err() instead */
export const Err = _err;
