/**
 * Custom assertion helpers for SnapBack extension testing
 * Provides domain-specific assertions for better test readability and maintainability
 */

import { expect, type vi } from "vitest";

/**
 * Custom matchers for VS Code extension testing
 */
export const customMatchers = {
	/**
	 * Assert that a VS Code command was registered
	 */
	toHaveRegisteredCommand(_received: unknown, command: string) {
		const vscode = require("vscode");
		const registerCommandCalls = vscode.commands.registerCommand.mock.calls;

		const commandCall = registerCommandCalls.find(
			(call: unknown[]) => call[0] === command,
		);

		if (commandCall) {
			return {
				message: () => `expected command ${command} not to be registered`,
				pass: true,
			};
		}

		return {
			message: () => `expected command ${command} to be registered`,
			pass: false,
		};
	},

	/**
	 * Assert that a tree view was created with specific properties
	 */
	toHaveCreatedTreeView(_received: unknown, viewId: string, options?: unknown) {
		const vscode = require("vscode");
		const createTreeViewCalls = vscode.window.createTreeView.mock.calls;

		const viewCall = createTreeViewCalls.find(
			(call: unknown[]) => call[0] === viewId,
		);

		if (viewCall) {
			if (options) {
				// Compare options if provided
				const actualOptions = viewCall[1];
				const optionsMatch =
					JSON.stringify(actualOptions) === JSON.stringify(options);
				return {
					message: () =>
						`expected tree view ${viewId} not to be created with options ${JSON.stringify(
							options,
						)}`,
					pass: optionsMatch,
				};
			}
			return {
				message: () => `expected tree view ${viewId} not to be created`,
				pass: true,
			};
		}

		return {
			message: () => `expected tree view ${viewId} to be created`,
			pass: false,
		};
	},

	/**
	 * Assert that a notification was shown with specific message
	 */
	toHaveShownNotification(
		_received: unknown,
		type: "info" | "warning" | "error",
		message?: string,
	) {
		const vscode = require("vscode");
		let mockFunction: (...args: unknown[]) => unknown;

		switch (type) {
			case "info":
				mockFunction = vscode.window.showInformationMessage;
				break;
			case "warning":
				mockFunction = vscode.window.showWarningMessage;
				break;
			case "error":
				mockFunction = vscode.window.showErrorMessage;
				break;
		}

		const calls = (mockFunction as ReturnType<typeof vi.fn>).mock.calls;
		const matchingCall = calls.find(
			(call: unknown[]) => !message || call[0] === message,
		);

		if (matchingCall) {
			return {
				message: () =>
					`expected ${type} notification ${
						message ? `with message "${message}" ` : ""
					}not to be shown`,
				pass: true,
			};
		}

		return {
			message: () =>
				`expected ${type} notification ${
					message ? `with message "${message}" ` : ""
				}to be shown`,
			pass: false,
		};
	},

	/**
	 * Assert that workspace state was updated
	 */
	toHaveUpdatedWorkspaceState(received: unknown, key: string, value?: unknown) {
		if (
			!received ||
			!(received as { workspaceState: unknown }).workspaceState
		) {
			return {
				message: () => "expected object with workspaceState property",
				pass: false,
			};
		}

		const updateCalls = (
			(
				received as {
					workspaceState: { update: (...args: unknown[]) => unknown };
				}
			).workspaceState.update as ReturnType<typeof vi.fn>
		).mock.calls;
		const matchingCall = updateCalls.find(
			(call: unknown[]) => call[0] === key && (!value || call[1] === value),
		);

		if (matchingCall) {
			return {
				message: () =>
					`expected workspace state key "${key}" ${
						value ? `with value "${value}" ` : ""
					}not to be updated`,
				pass: true,
			};
		}

		return {
			message: () =>
				`expected workspace state key "${key}" ${
					value ? `with value "${value}" ` : ""
				}to be updated`,
			pass: false,
		};
	},

	/**
	 * Assert that performance is within threshold
	 */
	toBeWithinPerformanceThreshold(received: number, threshold: number) {
		const pass = received <= threshold;

		return {
			message: () =>
				pass
					? `Expected ${received}ms not to be within threshold of ${threshold}ms`
					: `Expected ${received}ms to be within threshold of ${threshold}ms`,
			pass,
		};
	},

	/**
	 * Assert that memory usage is within limits
	 */
	toBeWithinMemoryLimit(received: NodeJS.MemoryUsage, limitMB: number) {
		const heapUsedMB = received.heapUsed / (1024 * 1024);
		const pass = heapUsedMB <= limitMB;

		return {
			message: () =>
				pass
					? `Expected memory usage ${heapUsedMB.toFixed(
							2,
						)}MB not to be within limit of ${limitMB}MB`
					: `Expected memory usage ${heapUsedMB.toFixed(
							2,
						)}MB to be within limit of ${limitMB}MB`,
			pass,
		};
	},
};

/**
 * Assert that a notification has required structure
 */
export function assertNotificationStructure(notification: unknown) {
	expect(notification).toBeDefined();
	expect(notification).toHaveProperty("id");
	expect(notification).toHaveProperty("message");
	expect(notification).toHaveProperty("type");
	expect(notification).toHaveProperty("timestamp");
	expect(notification).toHaveProperty("actions");

	// Validate notification type
	expect(["info", "warning", "error", "progress"]).toContain(
		(notification as { type: string }).type,
	);

	// Validate actions array
	expect(Array.isArray((notification as { actions: unknown }).actions)).toBe(
		true,
	);
}

/**
 * Assert that workspace context has valid structure
 */
export function assertWorkspaceContext(context: unknown) {
	expect(context).toBeDefined();
	expect(context).toHaveProperty("workspaceUri");
	expect(context).toHaveProperty("protectedFiles");
	expect(context).toHaveProperty("recentCheckpoints");
	expect(context).toHaveProperty("riskAssessment");
	expect(context).toHaveProperty("settings");

	// Validate arrays
	expect(
		Array.isArray((context as { protectedFiles: unknown }).protectedFiles),
	).toBe(true);
	expect(
		Array.isArray(
			(context as { recentCheckpoints: unknown }).recentCheckpoints,
		),
	).toBe(true);

	// Validate risk assessment structure
	expect(
		(context as { riskAssessment: unknown }).riskAssessment,
	).toHaveProperty("overallRisk");
	expect(
		(context as { riskAssessment: unknown }).riskAssessment,
	).toHaveProperty("factors");
	expect(
		Array.isArray(
			(context as { riskAssessment: { factors: unknown } }).riskAssessment
				.factors,
		),
	).toBe(true);
}

/**
 * Assert that workflow suggestion has valid structure
 */
export function assertWorkflowSuggestion(suggestion: unknown) {
	expect(suggestion).toBeDefined();
	expect(suggestion).toHaveProperty("id");
	expect(suggestion).toHaveProperty("title");
	expect(suggestion).toHaveProperty("description");
	expect(suggestion).toHaveProperty("actions");
	expect(suggestion).toHaveProperty("priority");
	expect(suggestion).toHaveProperty("category");

	// Validate priority
	expect(["low", "medium", "high"]).toContain(
		(suggestion as { priority: string }).priority,
	);

	// Validate category
	expect(["protection", "optimization", "maintenance", "recovery"]).toContain(
		(suggestion as { category: string }).category,
	);

	// Validate actions
	expect(Array.isArray((suggestion as { actions: unknown }).actions)).toBe(
		true,
	);
	for (const action of (suggestion as { actions: unknown[] }).actions) {
		expect(action).toHaveProperty("command");
		expect(action).toHaveProperty("title");
	}
}

/**
 * Assert that operation coordinator state is valid
 */
export function assertOperationCoordinatorState(state: unknown) {
	expect(state).toBeDefined();
	expect(state).toHaveProperty("activeOperations");
	expect(state).toHaveProperty("completedOperations");
	expect(state).toHaveProperty("failedOperations");
	expect(state).toHaveProperty("operationHistory");

	// Validate operation arrays
	expect(
		Array.isArray((state as { activeOperations: unknown }).activeOperations),
	).toBe(true);
	expect(
		Array.isArray(
			(state as { completedOperations: unknown }).completedOperations,
		),
	).toBe(true);
	expect(
		Array.isArray((state as { failedOperations: unknown }).failedOperations),
	).toBe(true);
	expect(
		Array.isArray((state as { operationHistory: unknown }).operationHistory),
	).toBe(true);

	// Validate active operations don't exceed limit
	expect(
		(state as { activeOperations: unknown[] }).activeOperations.length,
	).toBeLessThanOrEqual(5);
}

/**
 * Assert that smart context analysis is valid
 */
export function assertSmartContextAnalysis(analysis: unknown) {
	expect(analysis).toBeDefined();
	expect(analysis).toHaveProperty("contextSignals");
	expect(analysis).toHaveProperty("riskFactors");
	expect(analysis).toHaveProperty("recommendations");
	expect(analysis).toHaveProperty("confidence");

	// Validate context signals
	expect(
		Array.isArray((analysis as { contextSignals: unknown }).contextSignals),
	).toBe(true);

	// Validate confidence score
	expect(
		(analysis as { confidence: number }).confidence,
	).toBeGreaterThanOrEqual(0);
	expect((analysis as { confidence: number }).confidence).toBeLessThanOrEqual(
		1,
	);

	// Validate recommendations
	expect(
		Array.isArray((analysis as { recommendations: unknown }).recommendations),
	).toBe(true);
}

/**
 * Tree view testing utilities
 */
export function simulateItemExpansion(provider: unknown, item: unknown) {
	return (provider as { getChildren: (item?: unknown) => unknown }).getChildren(
		item,
	);
}

/**
 * Validate tree structure consistency
 */
export function validateTreeStructure(
	provider: { getTreeItem: (item: unknown) => unknown },
	items: unknown[],
) {
	for (const item of items) {
		// Check that each item can be converted to TreeItem
		const treeItem = provider.getTreeItem(item);
		expect(treeItem).toBeDefined();

		// Validate required properties
		expect(treeItem).toHaveProperty("label");
		expect(
			typeof (treeItem as { label: unknown }).label === "string" ||
				typeof (treeItem as { label: unknown }).label === "object",
		).toBe(true);
	}
}

/**
 * Assert tree refresh behavior
 */
export async function assertRefreshBehavior(
	provider: {
		onDidChangeTreeData: unknown;
		refresh: () => void;
		getChildren?: () => Promise<unknown[]>;
	},
	expectedItemCount?: number,
) {
	const onDidChangeTreeDataHandler = provider.onDidChangeTreeData;
	expect(onDidChangeTreeDataHandler).toBeDefined();

	// Trigger refresh
	provider.refresh();

	// If expected count provided, validate
	if (expectedItemCount !== undefined && provider.getChildren) {
		const items = await provider.getChildren();
		expect(items).toHaveLength(expectedItemCount);
	}
}

/**
 * Performance assertion utilities
 */
export const PerformanceAssertions = {
	/**
	 * Assert that an operation completed within a time limit
	 * @param operation - Async operation to time
	 * @param maxTimeMs - Maximum allowed time in milliseconds
	 * @param operationName - Name of the operation for error messages
	 */
	assertTiming: async <T>(
		operation: () => Promise<T>,
		maxTimeMs: number,
		operationName: string,
	): Promise<T> => {
		const startTime = performance.now();
		const result = await operation();
		const endTime = performance.now();
		const duration = endTime - startTime;

		if (duration > maxTimeMs) {
			throw new Error(
				`Operation '${operationName}' took ${duration.toFixed(
					2,
				)}ms, exceeding limit of ${maxTimeMs}ms`,
			);
		}

		return result;
	},

	/**
	 * Assert that memory usage is within limits after an operation
	 * @param operation - Operation to perform
	 * @param maxMemoryMB - Maximum allowed memory usage in MB
	 * @param operationName - Name of the operation for error messages
	 */
	assertMemoryUsage: async <T>(
		operation: () => Promise<T>,
		maxMemoryMB: number,
		operationName: string,
	): Promise<T> => {
		// Force garbage collection if available (Node.js only)
		if (global.gc) {
			global.gc();
		}

		const startMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB
		const result = await operation();

		// Force garbage collection again
		if (global.gc) {
			global.gc();
		}

		const endMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB
		const memoryUsed = endMemory - startMemory;

		if (memoryUsed > maxMemoryMB) {
			throw new Error(
				`Operation '${operationName}' used ${memoryUsed.toFixed(
					2,
				)}MB, exceeding limit of ${maxMemoryMB}MB`,
			);
		}

		return result;
	},

	/**
	 * Assert that CPU usage is within limits during an operation
	 * @param operation - Operation to perform
	 * @param maxCpuPercent - Maximum allowed CPU percentage
	 * @param operationName - Name of the operation for error messages
	 * @param durationMs - Duration to monitor CPU usage (default: 1000ms)
	 */
	assertCpuUsage: async <T>(
		operation: () => Promise<T>,
		maxCpuPercent: number,
		operationName: string,
		durationMs = 1000,
	): Promise<T> => {
		// Start monitoring CPU usage
		let cpuUsage = 0;
		const interval = setInterval(() => {
			const usage = process.cpuUsage();
			cpuUsage = (usage.user + usage.system) / 1000 / durationMs; // Convert to percentage
		}, 100);

		const result = await operation();
		clearInterval(interval);

		if (cpuUsage > maxCpuPercent) {
			throw new Error(
				`Operation '${operationName}' used ${cpuUsage.toFixed(
					2,
				)}% CPU, exceeding limit of ${maxCpuPercent}%`,
			);
		}

		return result;
	},
};

/**
 * Error testing utilities
 */
export const ErrorTestUtils = {
	/**
	 * Create a mock error with specific properties
	 * @param message - Error message
	 * @param code - Error code (for Node.js errors)
	 * @param errno - Error number (for system errors)
	 * @returns Mock error object
	 */
	createMockError: (
		message: string,
		code?: string,
		errno?: number,
	): Error & { code?: string; errno?: number } => {
		const error = new Error(message) as Error & {
			code?: string;
			errno?: number;
		};
		if (code !== undefined) error.code = code;
		if (errno !== undefined) error.errno = errno;
		return error;
	},

	/**
	 * Create a timeout error
	 * @returns Timeout error
	 */
	createTimeoutError: (): Error => {
		const error = new Error("Operation timed out");
		(error as any).code = "ETIMEDOUT";
		return error;
	},

	/**
	 * Create a network error
	 * @param message - Error message
	 * @returns Network error
	 */
	createNetworkError: (message = "Network error"): Error => {
		const error = new Error(message);
		(error as any).code = "ENETUNREACH";
		return error;
	},

	/**
	 * Create a file system error
	 * @param code - Error code (ENOENT, EACCES, etc.)
	 * @param path - Path that caused the error
	 * @returns File system error
	 */
	createFileSystemError: (
		code: string,
		path: string,
	): Error & { code: string; path: string } => {
		const error = new Error(`${code}: ${path}`) as Error & {
			code: string;
			path: string;
		};
		error.code = code;
		error.path = path;
		return error;
	},

	/**
	 * Create a validation error
	 * @param field - Field that failed validation
	 * @param value - Value that failed validation
	 * @param reason - Reason for validation failure
	 * @returns Validation error
	 */
	createValidationError: (
		field: string,
		value: unknown,
		reason: string,
	): Error => {
		return new Error(
			`Validation failed for ${field}: ${reason} (value: ${String(value)})`,
		);
	},

	/**
	 * Assert that an async function throws a specific error
	 * @param fn - Async function to test
	 * @param expectedError - Expected error message or pattern
	 * @param errorMessage - Custom error message for assertion failure
	 */
	assertThrowsAsync: async <T>(
		fn: () => Promise<T>,
		expectedError: string | RegExp,
		errorMessage?: string,
	): Promise<void> => {
		try {
			await fn();
			throw new Error(
				errorMessage || `Expected function to throw, but it didn't`,
			);
		} catch (error) {
			const errorString =
				error instanceof Error ? error.message : String(error);
			if (expectedError instanceof RegExp) {
				if (!expectedError.test(errorString)) {
					throw new Error(
						errorMessage ||
							`Expected error to match ${expectedError}, but got: ${errorString}`,
					);
				}
			} else {
				if (!errorString.includes(expectedError)) {
					throw new Error(
						errorMessage ||
							`Expected error to include "${expectedError}", but got: ${errorString}`,
					);
				}
			}
		}
	},

	/**
	 * Assert that an async function throws an error with a specific code
	 * @param fn - Async function to test
	 * @param expectedCode - Expected error code
	 * @param errorMessage - Custom error message for assertion failure
	 */
	assertThrowsWithCodeAsync: async <T>(
		fn: () => Promise<T>,
		expectedCode: string,
		errorMessage?: string,
	): Promise<void> => {
		try {
			await fn();
			throw new Error(
				errorMessage || `Expected function to throw, but it didn't`,
			);
		} catch (error) {
			const errorCode = (error as any).code;
			if (errorCode !== expectedCode) {
				throw new Error(
					errorMessage ||
						`Expected error code "${expectedCode}", but got: ${String(
							errorCode,
						)}`,
				);
			}
		}
	},
};

// All utilities are already exported inline with their declarations above
