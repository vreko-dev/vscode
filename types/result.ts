/**
 * Result type for operations that can fail
 *
 * @deprecated This file is deprecated. Import from '@vreko/contracts' instead.
 * Will be removed after 2 releases. See ADR-004 for details.
 *
 * LOCAL implementation for thin client architecture.
 * Provides type-safe error handling without exceptions, inspired by Rust's Result type.
 *
 * Migration:
 *   // Before
 *   import { Result, ok, err } from '../types/result'
 *   // After
 *   import { Result, ok, err } from '@vreko/contracts'
 *
 * @module
 */

// =============================================================================
// RESULT TYPE DEFINITION
// =============================================================================

export type Result<T, E = Error> = { success: true; value: T } | { success: false; error: E };

// =============================================================================
// CONSTRUCTORS
// =============================================================================

export function ok<T>(value: T): Result<T, never> {
	return { success: true, value };
}

export function err<E>(error: E): Result<never, E> {
	return { success: false, error };
}

// Uppercase aliases for backward compatibility (deprecated)
/** @deprecated Use lowercase ok() instead */
export const Ok = ok;
/** @deprecated Use lowercase err() instead */
export const Err = err;

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isOk<T, E>(result: Result<T, E>): result is { success: true; value: T } {
	return result.success === true;
}

export function isErr<T, E>(result: Result<T, E>): result is { success: false; error: E } {
	return result.success === false;
}

// =============================================================================
// TRANSFORMATIONS
// =============================================================================

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
	if (isOk(result)) {
		return ok(fn(result.value));
	}
	return result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
	if (isErr(result)) {
		return err(fn(result.error));
	}
	return result;
}

export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
	if (isOk(result)) {
		return fn(result.value);
	}
	return result;
}

export function unwrap<T, E>(result: Result<T, E>): T {
	if (isOk(result)) {
		return result.value;
	}
	if (result.error instanceof Error) {
		throw result.error;
	}
	throw new Error(String(result.error));
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
	if (isOk(result)) {
		return result.value;
	}
	return defaultValue;
}

export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
	if (isOk(result)) {
		return result.value;
	}
	return fn(result.error);
}

// =============================================================================
// PROMISE INTEGRATION
// =============================================================================

export function toPromise<T, E>(result: Result<T, E>): Promise<T> {
	if (isOk(result)) {
		return Promise.resolve(result.value);
	}
	if (result.error instanceof Error) {
		return Promise.reject(result.error);
	}
	return Promise.reject(new Error(String(result.error)));
}

export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
	try {
		const value = await promise;
		return ok(value);
	} catch (error) {
		return err(error instanceof Error ? error : new Error(String(error)));
	}
}

export async function fromPromiseWith<T, E>(promise: Promise<T>, mapError: (e: unknown) => E): Promise<Result<T, E>> {
	try {
		const value = await promise;
		return ok(value);
	} catch (error) {
		return err(mapError(error));
	}
}

// =============================================================================
// COLLECTION OPERATIONS
// =============================================================================

export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
	const values: T[] = [];
	for (const result of results) {
		if (isErr(result)) {
			return result;
		}
		values.push(result.value);
	}
	return ok(values);
}

export function allOrErrors<T, E>(results: Result<T, E>[]): Result<T[], E[]> {
	const values: T[] = [];
	const errors: E[] = [];
	for (const result of results) {
		if (isOk(result)) {
			values.push(result.value);
		} else {
			errors.push(result.error);
		}
	}
	if (errors.length > 0) {
		return err(errors);
	}
	return ok(values);
}

export function sequence<T, E>(results: Result<T, E>[]): Result<T[], E> {
	return all(results);
}

export function tryAll<T, E>(results: Result<T, E>[]): { successes: T[]; failures: E[] } {
	const successes: T[] = [];
	const failures: E[] = [];
	for (const result of results) {
		if (isOk(result)) {
			successes.push(result.value);
		} else {
			failures.push(result.error);
		}
	}
	return { successes, failures };
}

// =============================================================================
// PATTERN MATCHING
// =============================================================================

export function match<T, E, R>(result: Result<T, E>, handlers: { ok: (value: T) => R; err: (error: E) => R }): R {
	if (isOk(result)) {
		return handlers.ok(result.value);
	}
	return handlers.err(result.error);
}

// =============================================================================
// SIDE EFFECTS
// =============================================================================

export function tap<T, E>(result: Result<T, E>, fn: (value: T) => void): Result<T, E> {
	if (isOk(result)) {
		fn(result.value);
	}
	return result;
}

export function tapErr<T, E>(result: Result<T, E>, fn: (error: E) => void): Result<T, E> {
	if (isErr(result)) {
		fn(result.error);
	}
	return result;
}

// =============================================================================
// TRY/CATCH WRAPPERS
// =============================================================================

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}
	return new Error(String(error));
}

export function tryCatch<T, Args extends unknown[]>(fn: (...args: Args) => T): (...args: Args) => Result<T, Error> {
	return (...args: Args): Result<T, Error> => {
		try {
			return ok(fn(...args));
		} catch (error) {
			return err(toError(error));
		}
	};
}

export function tryCatchAsync<T, Args extends unknown[]>(
	fn: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<Result<T, Error>> {
	return async (...args: Args): Promise<Result<T, Error>> => {
		try {
			const value = await fn(...args);
			return ok(value);
		} catch (error) {
			return err(toError(error));
		}
	};
}
