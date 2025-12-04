/**
 * Error Recovery Handlers for Welcome Panel
 *
 * Handles invalid state scenarios gracefully:
 * - Network errors during authentication
 * - Missing or corrupted panel state
 * - Timeout scenarios
 * - User interruption (cancellation)
 * - Fallback UI for partial failures
 *
 * Goal: Never leave the welcome panel in a broken state
 */

import { logger } from "@snapback/infrastructure";

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export interface ErrorState {
	code: string;
	message: string;
	severity: ErrorSeverity;
	recoverable: boolean;
	retryable: boolean;
	fallback?: string;
	cause?: Error;
	timestamp: number;
}

export interface RecoveryAction {
	type: "retry" | "fallback" | "reset" | "dismiss";
	delayMs: number;
	maxAttempts: number;
	currentAttempt: number;
}

/**
 * Error codes for welcome panel
 */
export const WELCOME_ERROR_CODES = {
	NETWORK_ERROR: "WELCOME_NETWORK_ERROR",
	AUTH_FAILED: "WELCOME_AUTH_FAILED",
	PANEL_LOAD_FAILED: "WELCOME_PANEL_LOAD_FAILED",
	STATE_CORRUPTION: "WELCOME_STATE_CORRUPTION",
	TIMEOUT: "WELCOME_TIMEOUT",
	USER_CANCELLED: "WELCOME_USER_CANCELLED",
	MISSING_CONTEXT: "WELCOME_MISSING_CONTEXT",
	INVALID_RESPONSE: "WELCOME_INVALID_RESPONSE",
} as const;

/**
 * Manages welcome panel error recovery
 */
export class WelcomeErrorRecovery {
	private errorHistory: ErrorState[] = [];
	private recoveryInProgress: Map<string, RecoveryAction> = new Map();
	private readonly MAX_RECOVERY_ATTEMPTS = 3;
	private readonly RETRY_DELAY_MS = 1000;
	private readonly FALLBACK_UI_KEY = "snapback.welcome.fallbackMode";

	constructor(
		private readonly globalState?: {
			get<T>(key: string, defaultValue?: T): T;
			update(key: string, value: unknown): Promise<void>;
		},
	) {}

	/**
	 * Handle authentication failure during welcome panel
	 */
	async handleAuthError(
		error: Error,
		userId?: string,
	): Promise<RecoveryAction> {
		const errorState: ErrorState = {
			code: WELCOME_ERROR_CODES.AUTH_FAILED,
			message: "Failed to authenticate during welcome setup",
			severity: "error",
			recoverable: true,
			retryable: true,
			cause: error,
			timestamp: Date.now(),
		};

		this.recordError(errorState);

		// Log for debugging
		logger.error("Welcome panel auth error", {
			userId,
			message: error.message,
			stack: error.stack,
		});

		// Determine recovery strategy
		return this.determineRecoveryAction(errorState);
	}

	/**
	 * Handle network errors during authentication
	 */
	async handleNetworkError(error: Error): Promise<RecoveryAction> {
		const errorState: ErrorState = {
			code: WELCOME_ERROR_CODES.NETWORK_ERROR,
			message: "Network error during authentication",
			severity: "warning",
			recoverable: true,
			retryable: true,
			cause: error,
			timestamp: Date.now(),
		};

		this.recordError(errorState);

		logger.warn("Welcome panel network error", {
			message: error.message,
		});

		return this.determineRecoveryAction(errorState);
	}

	/**
	 * Handle panel loading failure
	 */
	async handlePanelLoadError(error: Error): Promise<RecoveryAction> {
		const errorState: ErrorState = {
			code: WELCOME_ERROR_CODES.PANEL_LOAD_FAILED,
			message: "Failed to load welcome panel UI",
			severity: "critical",
			recoverable: true,
			retryable: true,
			fallback: "Show welcome modal dialog instead",
			cause: error,
			timestamp: Date.now(),
		};

		this.recordError(errorState);

		logger.error("Welcome panel load error", {
			message: error.message,
		});

		return this.determineRecoveryAction(errorState);
	}

	/**
	 * Handle corrupted or missing panel state
	 */
	async handleStateCorruption(
		missingFields: string[],
	): Promise<RecoveryAction> {
		const errorState: ErrorState = {
			code: WELCOME_ERROR_CODES.STATE_CORRUPTION,
			message: `Missing required state: ${missingFields.join(", ")}`,
			severity: "error",
			recoverable: true,
			retryable: false, // Don't retry - state is corrupted
			fallback: "Reset to default welcome state",
			timestamp: Date.now(),
		};

		this.recordError(errorState);

		logger.warn("Welcome panel state corruption detected", {
			missingFields,
		});

		return this.determineRecoveryAction(errorState);
	}

	/**
	 * Handle timeout during authentication
	 */
	async handleTimeout(timeoutMs: number): Promise<RecoveryAction> {
		const errorState: ErrorState = {
			code: WELCOME_ERROR_CODES.TIMEOUT,
			message: `Authentication timeout after ${timeoutMs}ms`,
			severity: "warning",
			recoverable: true,
			retryable: true,
			fallback: "Allow manual retry or skip",
			timestamp: Date.now(),
		};

		this.recordError(errorState);

		logger.warn("Welcome panel timeout", {
			timeoutMs,
		});

		return this.determineRecoveryAction(errorState);
	}

	/**
	 * Handle user cancellation
	 */
	async handleUserCancellation(): Promise<RecoveryAction> {
		const errorState: ErrorState = {
			code: WELCOME_ERROR_CODES.USER_CANCELLED,
			message: "User cancelled welcome setup",
			severity: "info",
			recoverable: true,
			retryable: true,
			fallback: "Show welcome as optional modal",
			timestamp: Date.now(),
		};

		this.recordError(errorState);

		logger.info("Welcome panel cancelled by user");

		return {
			type: "dismiss",
			delayMs: 0,
			maxAttempts: 1,
			currentAttempt: 1,
		};
	}

	/**
	 * Handle invalid response from server
	 */
	async handleInvalidResponse(response: unknown): Promise<RecoveryAction> {
		const errorState: ErrorState = {
			code: WELCOME_ERROR_CODES.INVALID_RESPONSE,
			message: "Received invalid response from authentication server",
			severity: "error",
			recoverable: true,
			retryable: true,
			fallback: "Use cached welcome data if available",
			timestamp: Date.now(),
		};

		this.recordError(errorState);

		logger.error("Welcome panel invalid response", {
			response: JSON.stringify(response),
		});

		return this.determineRecoveryAction(errorState);
	}

	/**
	 * Determine best recovery action for error
	 */
	private determineRecoveryAction(errorState: ErrorState): RecoveryAction {
		const errorKey = errorState.code;
		let recovery = this.recoveryInProgress.get(errorKey);

		if (!recovery) {
			recovery = {
				type: errorState.retryable ? "retry" : "fallback",
				delayMs: this.RETRY_DELAY_MS,
				maxAttempts: this.MAX_RECOVERY_ATTEMPTS,
				currentAttempt: 1,
			};
			this.recoveryInProgress.set(errorKey, recovery);
		} else {
			recovery.currentAttempt++;
		}

		// Switch to fallback if max retries exceeded
		if (
			recovery.currentAttempt >= recovery.maxAttempts &&
			errorState.recoverable
		) {
			recovery.type = "fallback";
			logger.info("Switching to fallback UI after max retries", {
				errorCode: errorState.code,
				attempts: recovery.currentAttempt,
			});
		}

		return recovery;
	}

	/**
	 * Execute retry with exponential backoff
	 */
	async executeRetry<T>(
		action: () => Promise<T>,
		errorCode: string,
	): Promise<T | null> {
		let recovery = this.recoveryInProgress.get(errorCode);

		if (!recovery) {
			recovery = {
				type: "retry",
				delayMs: this.RETRY_DELAY_MS,
				maxAttempts: this.MAX_RECOVERY_ATTEMPTS,
				currentAttempt: 1,
			};
		}

		while (recovery.currentAttempt <= recovery.maxAttempts) {
			try {
				logger.debug("Attempting retry", {
					errorCode,
					attempt: recovery.currentAttempt,
					delayMs: recovery.delayMs,
				});

				// Wait before retry (with exponential backoff)
				await this.delay(recovery.delayMs);

				// Execute action
				const result = await action();
				this.recoveryInProgress.delete(errorCode);
				return result;
			} catch (error) {
				recovery.currentAttempt++;
				recovery.delayMs *= 2; // Exponential backoff
				logger.warn("Retry failed", {
					errorCode,
					attempt: recovery.currentAttempt,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// All retries exhausted
		this.recoveryInProgress.set(errorCode, recovery);
		return null;
	}

	/**
	 * Reset welcome panel to clean state
	 */
	async resetWelcomeState(): Promise<void> {
		try {
			if (this.globalState) {
				await this.globalState.update("snapback.welcomePanelState", {
					shown: false,
					skipped: false,
					completedSteps: [],
					lastError: null,
				});
			}

			this.recoveryInProgress.clear();
			this.errorHistory = [];

			logger.info("Welcome panel state reset to clean state");
		} catch (error) {
			logger.error("Failed to reset welcome state", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Enable fallback UI mode
	 */
	async enableFallbackMode(): Promise<void> {
		try {
			if (this.globalState) {
				await this.globalState.update(this.FALLBACK_UI_KEY, true);
			}

			logger.warn("Welcome panel fallback mode enabled");
		} catch (error) {
			logger.error("Failed to enable fallback mode", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Disable fallback UI mode
	 */
	async disableFallbackMode(): Promise<void> {
		try {
			if (this.globalState) {
				await this.globalState.update(this.FALLBACK_UI_KEY, false);
			}

			logger.info("Welcome panel fallback mode disabled");
		} catch (error) {
			logger.error("Failed to disable fallback mode", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Get error history for debugging
	 */
	getErrorHistory(): ErrorState[] {
		return [...this.errorHistory];
	}

	/**
	 * Get recovery status
	 */
	getRecoveryStatus(): Map<string, RecoveryAction> {
		return new Map(this.recoveryInProgress);
	}

	/**
	 * Record error in history
	 */
	private recordError(errorState: ErrorState): void {
		this.errorHistory.push(errorState);

		// Keep only last 20 errors
		if (this.errorHistory.length > 20) {
			this.errorHistory = this.errorHistory.slice(-20);
		}
	}

	/**
	 * Helper: delay for specified milliseconds
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
