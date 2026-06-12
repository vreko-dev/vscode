/**
 * Degraded State Management
 *
 * Provides graceful degradation when components fail.
 * Instead of silent failures, we track what's broken and inform users.
 *
 * P0 Fix: Replaces empty catch {} blocks with meaningful state tracking.
 *
 * @example
 * ```typescript
 * // Instead of:
 * } catch { }  // Silent failure
 *
 * // Use:
 * } catch (error) {
 *   degradedState.markDegraded('daemon', 'Connection failed', error);
 * }
 * ```
 */

import { logger } from "./logger";

export type DegradedComponent =
	| "daemon"
	| "storage"
	| "mcp_bridge"
	| "api_client"
	| "learning_retrieval"
	| "snapshot_service"
	| "telemetry"
	| "file_watcher"
	| "critical_ui";

export interface DegradedInfo {
	component: DegradedComponent;
	reason: string;
	error?: Error;
	timestamp: number;
	recoveryAttempts: number;
	lastRecoveryAttempt?: number;
	suggestion?: string;
}

/**
 * Centralized degraded state manager
 *
 * Tracks which components are degraded and provides recovery suggestions.
 */
class DegradedStateManager {
	private degraded = new Map<DegradedComponent, DegradedInfo>();
	private listeners = new Set<(component: DegradedComponent, info: DegradedInfo | null) => void>();

	/**
	 * Mark a component as degraded
	 *
	 * @param component - Which component failed
	 * @param reason - Human-readable reason
	 * @param error - Optional error object
	 * @param suggestion - Recovery suggestion for user
	 */
	markDegraded(component: DegradedComponent, reason: string, error?: unknown, suggestion?: string): void {
		const existing = this.degraded.get(component);
		const errorObj = error instanceof Error ? error : error ? new Error(String(error)) : undefined;

		const info: DegradedInfo = {
			component,
			reason,
			error: errorObj,
			timestamp: Date.now(),
			recoveryAttempts: existing ? existing.recoveryAttempts : 0,
			suggestion: suggestion ?? this.getDefaultSuggestion(component, reason),
		};

		this.degraded.set(component, info);

		// Log with context - NOT silently
		logger.warn(`Component degraded: ${component}`, {
			reason,
			error: errorObj?.message,
			suggestion: info.suggestion,
		});

		// Notify listeners
		this.notifyListeners(component, info);
	}

	/**
	 * Mark a component as recovered
	 */
	markRecovered(component: DegradedComponent): void {
		if (this.degraded.has(component)) {
			this.degraded.delete(component);
			logger.info(`Component recovered: ${component}`);
			this.notifyListeners(component, null);
		}
	}

	/**
	 * Record a recovery attempt
	 */
	recordRecoveryAttempt(component: DegradedComponent): void {
		const info = this.degraded.get(component);
		if (info) {
			info.recoveryAttempts++;
			info.lastRecoveryAttempt = Date.now();
		}
	}

	/**
	 * Check if a component is degraded
	 */
	isDegraded(component: DegradedComponent): boolean {
		return this.degraded.has(component);
	}

	/**
	 * Get degraded info for a component
	 */
	getDegradedInfo(component: DegradedComponent): DegradedInfo | undefined {
		return this.degraded.get(component);
	}

	/**
	 * Get all degraded components
	 */
	getAllDegraded(): Map<DegradedComponent, DegradedInfo> {
		return new Map(this.degraded);
	}

	/**
	 * Get a summary of degraded state for display
	 */
	getSummary(): string {
		if (this.degraded.size === 0) {
			return "All systems operational";
		}

		const components = Array.from(this.degraded.values())
			.map((info) => `${info.component}: ${info.reason}`)
			.join("; ");

		return `Degraded: ${components}`;
	}

	/**
	 * Subscribe to degraded state changes
	 */
	onStateChange(callback: (component: DegradedComponent, info: DegradedInfo | null) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private notifyListeners(component: DegradedComponent, info: DegradedInfo | null): void {
		for (const listener of this.listeners) {
			try {
				listener(component, info);
			} catch {
				// Don't let listener errors propagate
			}
		}
	}

	private getDefaultSuggestion(component: DegradedComponent, _reason: string): string {
		const suggestions: Record<DegradedComponent, string> = {
			daemon: "Try restarting the Vreko daemon with 'Vreko: Restart Daemon'",
			storage: "Check disk space and file permissions in .vreko/ directory",
			mcp_bridge: "Restart your AI assistant or check MCP configuration",
			api_client: "Check your network connection and API key in settings",
			learning_retrieval: "Learnings may be temporarily unavailable. This won't affect core functionality.",
			snapshot_service: "Try running 'Vreko: Clear Cache' and creating a new snapshot",
			telemetry: "Analytics unavailable. This won't affect functionality.",
			file_watcher: "File change detection may be delayed. Try reloading the window.",
			critical_ui: "Critical UI components failed. Try reloading VS Code window",
		};

		return suggestions[component] ?? "Try reloading VS Code window";
	}

	/**
	 * Reset all degraded state (e.g., on extension restart)
	 */
	reset(): void {
		this.degraded.clear();
		logger.debug("Degraded state manager reset");
	}
}

// Singleton instance
export const degradedState = new DegradedStateManager();

/**
 * Wrapper for try-catch that logs errors and marks degraded state
 *
 * @param component - Component to mark degraded on failure
 * @param fn - Function to execute
 * @param fallback - Value to return on failure
 * @returns The function result or fallback
 *
 * @example
 * ```typescript
 * // Instead of:
 * try { ... } catch { return null; }
 *
 * // Use:
 * return withDegradedFallback('daemon', () => connectToDaemon(), null);
 * ```
 */
export async function withDegradedFallback<T>(
	component: DegradedComponent,
	fn: () => Promise<T>,
	fallback: T,
	options?: { reason?: string; suggestion?: string },
): Promise<T> {
	try {
		const result = await fn();
		// If we succeed and were previously degraded, mark recovered
		if (degradedState.isDegraded(component)) {
			degradedState.markRecovered(component);
		}
		return result;
	} catch (error) {
		degradedState.markDegraded(component, options?.reason ?? "Operation failed", error, options?.suggestion);
		return fallback;
	}
}

/**
 * Sync version of withDegradedFallback
 */
export function withDegradedFallbackSync<T>(
	component: DegradedComponent,
	fn: () => T,
	fallback: T,
	options?: { reason?: string; suggestion?: string },
): T {
	try {
		const result = fn();
		if (degradedState.isDegraded(component)) {
			degradedState.markRecovered(component);
		}
		return result;
	} catch (error) {
		degradedState.markDegraded(component, options?.reason ?? "Operation failed", error, options?.suggestion);
		return fallback;
	}
}

/**
 * Timeout wrapper that marks degraded on timeout
 *
 * P2 Fix: Activation timeout wrappers
 *
 * @example
 * ```typescript
 * await withTimeout(initializePhase2Storage(appContext), {
 *   timeout: 5000,
 *   component: 'storage',
 *   onTimeout: 'entering degraded mode',
 * });
 * ```
 */
export async function withTimeout<T>(
	promise: Promise<T>,
	options: {
		timeout: number;
		component: DegradedComponent;
		reason?: string;
		fallback?: T;
	},
): Promise<T | undefined> {
	const { timeout, component, reason, fallback } = options;

	let timeoutId: NodeJS.Timeout;

	const timeoutPromise = new Promise<T | undefined>((resolve) => {
		timeoutId = setTimeout(() => {
			degradedState.markDegraded(
				component,
				reason ?? `Operation timed out after ${timeout}ms`,
				undefined,
				`The ${component} component is taking too long. Some features may be unavailable.`,
			);
			resolve(fallback);
		}, timeout);
	});

	try {
		const result = await Promise.race([promise, timeoutPromise]);
		clearTimeout(timeoutId!);

		if (result !== fallback && degradedState.isDegraded(component)) {
			degradedState.markRecovered(component);
		}

		return result;
	} catch (error) {
		clearTimeout(timeoutId!);
		degradedState.markDegraded(component, reason ?? "Operation failed", error);
		return fallback;
	}
}
