/**
 * Timing Decorators - Automatic performance tracking for methods
 *
 * These decorators automatically track method execution time and memory usage
 * with minimal code changes. They integrate with the PerformanceMonitor class
 * to provide seamless performance monitoring.
 *
 * Features:
 * - Method timing decorator for automatic tracking
 * - Class timing decorator for tracking all methods
 * - Async method support
 * - Configurable operation names
 *
 * @example
 * ```typescript
 * // Track a single method
 * class MyClass {
 *   @timedMethod()
 *   async myMethod() {
 *     // ... method implementation ...
 *   }
 * }
 *
 * // Track all methods in a class
 * @timedClass()
 * class MyTimedClass {
 *   myMethod() {
 *     // ... automatically tracked ...
 *   }
 * }
 * ```
 */

import type { PerformanceMonitor } from "./PerformanceMonitor.js";

// Global performance monitor instance
let globalMonitor: PerformanceMonitor | null = null;

/**
 * Set the global performance monitor instance
 */
export function setPerformanceMonitor(
	monitor: PerformanceMonitor | null,
): void {
	globalMonitor = monitor;
}

/**
 * Get the global performance monitor instance
 */
export function getPerformanceMonitor(): PerformanceMonitor | null {
	return globalMonitor;
}

/**
 * Method decorator that automatically tracks execution time
 * @param operationName Optional custom operation name (defaults to className.methodName)
 */
export function timedMethod(operationName?: string) {
	return (
		target: object,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	) => {
		const originalMethod = descriptor.value;

		descriptor.value = function (...args: unknown[]) {
			if (!globalMonitor) {
				return originalMethod.apply(this, args);
			}

			const name = operationName || `${target.constructor.name}.${propertyKey}`;
			const operationId = globalMonitor.startOperation(name);

			try {
				const result = originalMethod.apply(this, args);

				// Handle both synchronous and asynchronous methods
				if (result instanceof Promise) {
					return result
						.then((resolvedResult) => {
							globalMonitor?.endOperation(operationId);
							return resolvedResult;
						})
						.catch((error) => {
							globalMonitor?.endOperation(operationId);
							throw error;
						});
				}
				globalMonitor?.endOperation(operationId);
				return result;
			} catch (error) {
				globalMonitor?.endOperation(operationId);
				throw error;
			}
		};

		return descriptor;
	};
}

/**
 * Class decorator that automatically tracks all methods
 * @param className Optional custom class name for operation naming
 */
export function timedClass(className?: string) {
	return (ctor: new (...args: unknown[]) => unknown) => {
		const proto = ctor.prototype;
		const classMethods = Object.getOwnPropertyNames(proto).filter(
			(name) => name !== "constructor" && typeof proto[name] === "function",
		);

		for (const methodName of classMethods) {
			const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
			if (descriptor && typeof descriptor.value === "function") {
				const name = `${className || ctor.name}.${methodName}`;
				Object.defineProperty(proto, methodName, {
					...descriptor,
					value: function (...args: unknown[]) {
						if (!globalMonitor) {
							return descriptor.value.apply(this, args);
						}

						const operationId = globalMonitor.startOperation(name);

						try {
							const result = descriptor.value.apply(this, args);

							// Handle both synchronous and asynchronous methods
							if (result instanceof Promise) {
								return result
									.then((resolvedResult) => {
										globalMonitor?.endOperation(operationId);
										return resolvedResult;
									})
									.catch((error) => {
										globalMonitor?.endOperation(operationId);
										throw error;
									});
							}
							globalMonitor?.endOperation(operationId);
							return result;
						} catch (error) {
							globalMonitor?.endOperation(operationId);
							throw error;
						}
					},
				});
			}
		}
	};
}
