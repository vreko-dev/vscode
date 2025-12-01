import * as vscode from "vscode";

/**
 * Log levels in order of severity
 */
export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

/**
 * Structured logging utility for SnapBack extension
 *
 * Features:
 * - Singleton pattern for consistent logging across extension
 * - Configurable log levels via VS Code settings
 * - Structured data serialization
 * - Timestamp formatting
 * - VS Code Output Channel integration
 * - Type-safe error logging
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger.js';
 *
 * logger.info('File protected', { filePath: '/path/to/file' });
 * logger.error('Operation failed', error, { operation: 'snapshot' });
 * logger.debug('Debug info', { data: complexObject });
 * ```
 */
export class Logger {
	private static instance: Logger;
	private outputChannel: vscode.OutputChannel;
	private logLevel: LogLevel;
	private config: vscode.WorkspaceConfiguration;

	private constructor(outputChannel: vscode.OutputChannel) {
		this.outputChannel = outputChannel;
		this.config = vscode.workspace.getConfiguration("snapback");
		this.logLevel = this.parseLogLevel(
			this.config.get<string>("logLevel", "info"),
		);

		// Listen for configuration changes
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("snapback.logLevel")) {
				this.config = vscode.workspace.getConfiguration("snapback");
				this.logLevel = this.parseLogLevel(
					this.config.get<string>("logLevel", "info"),
				);
				this.info("Log level changed", {
					newLevel: LogLevel[this.logLevel],
				});
			}
		});
	}

	/**
	 * Get or create the singleton Logger instance.
	 *
	 * Uses singleton pattern to ensure consistent logging configuration across
	 * the extension. Must be called with outputChannel on first initialization.
	 *
	 * @param outputChannel - VS Code output channel for log output
	 *   Required on first call; optional on subsequent calls (returns existing instance)
	 *
	 * @returns Singleton Logger instance
	 *
	 * @throws Error if called without outputChannel on first initialization
	 *
	 * @example
	 * ```typescript
	 * // First call: initialize with output channel
	 * const logger = Logger.getInstance(vscode.window.createOutputChannel('SnapBack'));
	 *
	 * // Subsequent calls: returns same instance (parameter is ignored)
	 * const same = Logger.getInstance();
	 * ```
	 *
	 * @see {@link logger} exported singleton instance
	 */
	static getInstance(outputChannel?: vscode.OutputChannel): Logger {
		if (!Logger.instance) {
			if (!outputChannel) {
				throw new Error(
					"Logger not initialized. Call getInstance with outputChannel first.",
				);
			}
			Logger.instance = new Logger(outputChannel);
		}
		return Logger.instance;
	}

	/**
	 * Log debug message (only shown when log level is DEBUG or lower).
	 *
	 * Use for low-level diagnostic information useful during development
	 * or troubleshooting. These messages are typically hidden in production.
	 *
	 * @param message - Primary log message describing the event
	 * @param args - Optional structured data to include in log
	 *   Can be objects, arrays, or primitives (auto-serialized to JSON)
	 *
	 * @returns void (logged as side effect)
	 *
	 * @example
	 * ```typescript
	 * logger.debug("File protection registry loaded", {
	 *   fileCount: 42,
	 *   loadTimeMs: 123
	 * });
	 * ```
	 *
	 * @see {@link LogLevel.DEBUG} for visibility control
	 */
	debug(message: string, ...args: unknown[]): void {
		if (this.logLevel <= LogLevel.DEBUG) {
			this.log("DEBUG", message, ...args);
		}
	}

	/**
	 * Log informational message (default log level).
	 *
	 * Use for significant events in extension lifecycle: activation, snapshot
	 * creation, session finalization, configuration changes, etc.
	 *
	 * @param message - Primary log message describing the event
	 * @param args - Optional structured data to include in log
	 *   Examples: operation results, counts, IDs, configuration state
	 *
	 * @returns void (logged as side effect)
	 *
	 * @example
	 * ```typescript
	 * logger.info("Session finalized", {
	 *   sessionId: "sess-123",
	 *   fileCount: 5,
	 *   duration: 125
	 * });
	 * ```
	 *
	 * @see {@link LogLevel.INFO} for visibility control
	 */
	info(message: string, ...args: unknown[]): void {
		if (this.logLevel <= LogLevel.INFO) {
			this.log("INFO", message, ...args);
		}
	}

	/**
	 * Log warning message for recoverable issues.
	 *
	 * Use when operations encounter issues but can continue. Examples:
	 * snapshot not found, protection registry update with partial failures, etc.
	 *
	 * @param message - Primary warning message
	 * @param context - Optional error context or additional details
	 * @param args - Optional structured data to include in log
	 *
	 * @returns void (logged as side effect)
	 *
	 * @example
	 * ```typescript
	 * logger.warn("Snapshot not found", undefined, {
	 *   snapshotId: "snap-123",
	 *   filePath: "/path/to/file"
	 * });
	 * ```
	 *
	 * @see {@link LogLevel.WARN} for visibility control
	 */
	warn(message: string, ...args: unknown[]): void {
		if (this.logLevel <= LogLevel.WARN) {
			this.log("WARN", message, ...args);
		}
	}

	/**
	 * Log error message with optional Error object and context.
	 *
	 * Use when operations fail completely. Automatically extracts and formats
	 * error details (name, message, stack trace) for structured logging.
	 *
	 * @param message - Primary error message describing what failed
	 * @param error - Optional Error object for structured error details
	 *   Stack trace and error properties are automatically extracted
	 * @param args - Optional structured data to include in log
	 *   Useful for context about the operation that failed
	 *
	 * @returns void (logged as side effect)
	 *
	 * @throws No exceptions thrown; errors are logged and ignored
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   await snapshot.restore();
	 * } catch (error) {
	 *   logger.error(
	 *     "Failed to restore snapshot",
	 *     error instanceof Error ? error : undefined,
	 *     { snapshotId: "snap-123", filePath: "/path/to/file" }
	 *   );
	 * }
	 * ```
	 *
	 * @see {@link LogLevel.ERROR} for visibility control
	 */
	error(message: string, error?: Error, ...args: unknown[]): void {
		if (this.logLevel <= LogLevel.ERROR) {
			const errorData = error
				? {
						name: error.name,
						message: error.message,
						stack: error.stack,
					}
				: undefined;

			this.log("ERROR", message, errorData, ...args);
		}
	}

	/**
	 * Reveal the output channel in VS Code editor.
	 *
	 * Opens the "SnapBack" output channel for user inspection. Does not steal
	 * focus from other panels (preserveFocus = true).
	 *
	 * @returns void (side effect: shows output panel)
	 *
	 * @example
	 * ```typescript
	 * // User clicks "Show Logs" button
	 * logger.show();
	 * ```
	 *
	 * @see {@link vscode.window.showInformationMessage} for user-facing messages
	 */
	show(): void {
		this.outputChannel.show(true); // true = preserveFocus
	}

	/**
	 * Dispose the logger and clean up resources.
	 *
	 * Should be called during extension deactivation to properly release
	 * the output channel resources.
	 *
	 * @returns void (side effect: disposes output channel)
	 *
	 * @example
	 * ```typescript
	 * // In extension.ts deactivate() hook
	 * logger.dispose();
	 * ```
	 *
	 * @see {@link vscode.ExtensionContext.subscriptions} for automatic cleanup
	 */
	dispose(): void {
		this.outputChannel.dispose();
	}

	/**
	 * Internal logging method
	 */
	private log(level: string, message: string, ...args: unknown[]): void {
		const timestamp = new Date().toISOString();
		const formattedMessage = `[${timestamp}] [${level}] ${message}`;

		// Serialize additional arguments
		const serializedArgs =
			args.length > 0
				? ` ${args.map((arg) => this.serialize(arg)).join(" ")}`
				: "";

		this.outputChannel.appendLine(formattedMessage + serializedArgs);
	}

	/**
	 * Serialize data for logging
	 */
	private serialize(data: unknown): string {
		if (data === null || data === undefined) {
			return String(data);
		}

		if (typeof data === "string") {
			return data;
		}

		if (typeof data === "number" || typeof data === "boolean") {
			return String(data);
		}

		try {
			// Handle objects and arrays
			return JSON.stringify(data, null, 2);
		} catch (_error) {
			// Fallback for circular references or non-serializable objects
			return String(data);
		}
	}

	/**
	 * Parse log level from string
	 */
	private parseLogLevel(level: string): LogLevel {
		const normalized = level.toLowerCase();
		switch (normalized) {
			case "debug":
				return LogLevel.DEBUG;
			case "info":
				return LogLevel.INFO;
			case "warn":
				return LogLevel.WARN;
			case "error":
				return LogLevel.ERROR;
			default:
				return LogLevel.INFO;
		}
	}
}

/**
 * Singleton logger instance
 * Must be initialized with outputChannel before use
 */
export const logger = {
	getInstance: Logger.getInstance.bind(Logger),
	debug: (...args: Parameters<Logger["debug"]>) =>
		Logger.getInstance().debug(...args),
	info: (...args: Parameters<Logger["info"]>) =>
		Logger.getInstance().info(...args),
	warn: (...args: Parameters<Logger["warn"]>) =>
		Logger.getInstance().warn(...args),
	error: (...args: Parameters<Logger["error"]>) =>
		Logger.getInstance().error(...args),
	show: () => Logger.getInstance().show(),
	dispose: () => Logger.getInstance().dispose(),
};
