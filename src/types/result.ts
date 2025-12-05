/**
 * Result type for operations that can fail
 *
 * Provides type-safe error handling without exceptions, inspired by Rust's Result type.
 * Use this pattern for operations where errors are expected and should be handled explicitly.
 *
 * @example
 * ```typescript
 * function divideNumbers(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return Err('Division by zero');
 *   }
 *   return Ok(a / b);
 * }
 *
 * const result = divideNumbers(10, 2);
 * if (isOk(result)) {
 *   console.log('Result:', result.value);
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 */
export type Result<T, E = Error> =
	| { success: true; value: T }
	| { success: false; error: E };

/**
 * Creates a successful result
 *
 * @param value - The successful value to wrap
 * @returns A successful Result containing the value
 *
 * @example
 * ```typescript
 * const result = Ok(42);
 * // result: { success: true, value: 42 }
 * ```
 */
export function Ok<T>(value: T): Result<T, never> {
	return { success: true, value };
}

/**
 * Creates a failed result
 *
 * @param error - The error to wrap
 * @returns A failed Result containing the error
 *
 * @example
 * ```typescript
 * const result = Err(new Error('Something went wrong'));
 * // result: { success: false, error: Error('Something went wrong') }
 * ```
 */
export function Err<E = Error>(error: E): Result<never, E> {
	return { success: false, error };
}

/**
 * Type guard for successful results
 *
 * @param result - The result to check
 * @returns True if the result is successful, with proper type narrowing
 *
 * @example
 * ```typescript
 * const result = divideNumbers(10, 2);
 * if (isOk(result)) {
 *   // TypeScript knows result.value is available here
 *   console.log(result.value);
 * }
 * ```
 */
export function isOk<T, E>(
	result: Result<T, E>,
): result is { success: true; value: T } {
	return result.success === true;
}

/**
 * Type guard for failed results
 *
 * @param result - The result to check
 * @returns True if the result is failed, with proper type narrowing
 *
 * @example
 * ```typescript
 * const result = divideNumbers(10, 0);
 * if (isErr(result)) {
 *   // TypeScript knows result.error is available here
 *   console.error(result.error);
 * }
 * ```
 */
export function isErr<T, E>(
	result: Result<T, E>,
): result is { success: false; error: E } {
	return result.success === false;
}

/**
 * Unwraps a successful result or throws the error
 *
 * @param result - The result to unwrap
 * @returns The successful value
 * @throws The error if the result is failed
 *
 * @example
 * ```typescript
 * const result = divideNumbers(10, 2);
 * const value = unwrap(result); // 5
 *
 * const failedResult = divideNumbers(10, 0);
 * unwrap(failedResult); // Throws error
 * ```
 */
export function unwrap<T, E>(result: Result<T, E>): T {
	if (isOk(result)) {
		return result.value;
	}
	if (result.error instanceof Error) {
		throw result.error;
	}
	throw new Error(String(result.error));
}

/**
 * Unwraps a successful result or returns a default value
 *
 * @param result - The result to unwrap
 * @param defaultValue - The value to return if the result is failed
 * @returns The successful value or the default value
 *
 * @example
 * ```typescript
 * const result = divideNumbers(10, 0);
 * const value = unwrapOr(result, 0); // 0
 *
 * const successResult = divideNumbers(10, 2);
 * const value2 = unwrapOr(successResult, 0); // 5
 * ```
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
	if (isOk(result)) {
		return result.value;
	}
	return defaultValue;
}

/**
 * Unwraps a successful result or computes a default value from the error
 *
 * @param result - The result to unwrap
 * @param fn - Function to compute default value from error
 * @returns The successful value or the computed default value
 *
 * @example
 * ```typescript
 * const result = divideNumbers(10, 0);
 * const value = unwrapOrElse(result, (err) => {
 *   console.error('Error occurred:', err);
 *   return 0;
 * }); // Logs error and returns 0
 * ```
 */
export function unwrapOrElse<T, E>(
	result: Result<T, E>,
	fn: (error: E) => T,
): T {
	if (isOk(result)) {
		return result.value;
	}
	return fn(result.error);
}

/**
 * Maps a successful result value to a new value
 *
 * @param result - The result to map
 * @param fn - Function to transform the successful value
 * @returns A new result with the transformed value, or the original error
 *
 * @example
 * ```typescript
 * const result = divideNumbers(10, 2);
 * const doubled = map(result, (value) => value * 2);
 * // doubled: Ok(10)
 * ```
 */
export function map<T, U, E>(
	result: Result<T, E>,
	fn: (value: T) => U,
): Result<U, E> {
	if (isOk(result)) {
		return Ok(fn(result.value));
	}
	return result;
}

/**
 * Maps a failed result error to a new error
 *
 * @param result - The result to map
 * @param fn - Function to transform the error
 * @returns A new result with the transformed error, or the original value
 *
 * @example
 * ```typescript
 * const result = divideNumbers(10, 0);
 * const wrappedError = mapErr(result, (err) => new CustomError(err));
 * ```
 */
export function mapErr<T, E, F>(
	result: Result<T, E>,
	fn: (error: E) => F,
): Result<T, F> {
	if (isErr(result)) {
		return Err(fn(result.error));
	}
	return result;
}

/**
 * Chains result-returning operations
 *
 * @param result - The result to chain from
 * @param fn - Function that takes the successful value and returns a new Result
 * @returns The new result, or the original error
 *
 * @example
 * ```typescript
 * const result = divideNumbers(10, 2);
 * const chained = andThen(result, (value) => divideNumbers(value, 2));
 * // chained: Ok(2.5)
 * ```
 */
export function andThen<T, U, E>(
	result: Result<T, E>,
	fn: (value: T) => Result<U, E>,
): Result<U, E> {
	if (isOk(result)) {
		return fn(result.value);
	}
	return result;
}

/**
 * Converts a Promise to a Result
 *
 * @param promise - The promise to convert
 * @returns A promise that resolves to a Result
 *
 * @example
 * ```typescript
 * const result = await fromPromise(fetch('https://api.example.com/data'));
 * if (isOk(result)) {
 *   const data = await result.value.json();
 * } else {
 *   console.error('Fetch failed:', result.error);
 * }
 * ```
 */
export async function fromPromise<T>(
	promise: Promise<T>,
): Promise<Result<T, Error>> {
	try {
		const value = await promise;
		return Ok(value);
	} catch (error) {
		return Err(error instanceof Error ? error : new Error(String(error)));
	}
}

/**
 * Converts a Result to a Promise
 *
 * @param result - The result to convert
 * @returns A promise that resolves to the value or rejects with the error
 *
 * @example
 * ```typescript
 * const result = divideNumbers(10, 2);
 * const value = await toPromise(result); // 5
 *
 * const failedResult = divideNumbers(10, 0);
 * await toPromise(failedResult); // Rejects with error
 * ```
 */
export function toPromise<T, E>(result: Result<T, E>): Promise<T> {
	if (isOk(result)) {
		return Promise.resolve(result.value);
	}
	if (result.error instanceof Error) {
		return Promise.reject(result.error);
	}
	return Promise.reject(new Error(String(result.error)));
}

/**
 * Combines multiple results into a single result
 * Returns Ok with array of values if all are successful, or the first error
 *
 * @param results - Array of results to combine
 * @returns A result containing all values or the first error
 *
 * @example
 * ```typescript
 * const results = [Ok(1), Ok(2), Ok(3)];
 * const combined = all(results);
 * // combined: Ok([1, 2, 3])
 *
 * const mixedResults = [Ok(1), Err('failed'), Ok(3)];
 * const failed = all(mixedResults);
 * // failed: Err('failed')
 * ```
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
	const values: T[] = [];
	for (const result of results) {
		if (isErr(result)) {
			return result;
		}
		values.push(result.value);
	}
	return Ok(values);
}

/**
 * Combines multiple results, collecting all errors or all values
 *
 * @param results - Array of results to combine
 * @returns A result containing all values or all errors
 *
 * @example
 * ```typescript
 * const results = [Ok(1), Err('error1'), Ok(3), Err('error2')];
 * const combined = allOrErrors(results);
 * // combined: Err(['error1', 'error2'])
 *
 * const successResults = [Ok(1), Ok(2), Ok(3)];
 * const allSuccess = allOrErrors(successResults);
 * // allSuccess: Ok([1, 2, 3])
 * ```
 */
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
		return Err(errors);
	}
	return Ok(values);
}

/**
 * Wraps a function to return a Result instead of throwing
 *
 * @param fn - Function to wrap
 * @returns A new function that returns a Result
 *
 * @example
 * ```typescript
 * const safeParseInt = tryCatch((str: string) => {
 *   const num = parseInt(str, 10);
 *   if (isNaN(num)) throw new Error('Not a number');
 *   return num;
 * });
 *
 * const result = safeParseInt('42'); // Ok(42)
 * const failed = safeParseInt('abc'); // Err(Error('Not a number'))
 * ```
 */
export function tryCatch<T, Args extends unknown[]>(
	fn: (...args: Args) => T,
): (...args: Args) => Result<T, Error> {
	return (...args: Args): Result<T, Error> => {
		try {
			return Ok(fn(...args));
		} catch (error) {
			return Err(error instanceof Error ? error : new Error(String(error)));
		}
	};
}

/**
 * Async version of tryCatch
 *
 * @param fn - Async function to wrap
 * @returns A new async function that returns a Result
 *
 * @example
 * ```typescript
 * const safeFetch = tryCatchAsync(async (url: string) => {
 *   const response = await fetch(url);
 *   return await response.json();
 * });
 *
 * const result = await safeFetch('https://api.example.com/data');
 * ```
 */
export function tryCatchAsync<T, Args extends unknown[]>(
	fn: (...args: Args) => Promise<T>,
): (...args: Args) => Promise<Result<T, Error>> {
	return async (...args: Args): Promise<Result<T, Error>> => {
		try {
			const value = await fn(...args);
			return Ok(value);
		} catch (error) {
			return Err(error instanceof Error ? error : new Error(String(error)));
		}
	};
}
