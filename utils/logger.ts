import * as vscode from "vscode";

/**
 * Log levels in order of severity (Pino-compatible ordering)
 *
 * P2 Enhancement: Added TRACE (more verbose than DEBUG) and SILENT (disable all)
 */
export enum LogLevel {
	TRACE = -1,
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	SILENT = 4,
}

/**
 * Child logger interface for namespace-based filtering
 *
 * P2 Enhancement: Allows focused debugging of specific subsystems
 * without flooding logs with unrelated debug output.
 *
 * @example
 * ```typescript
 * const log = logger.child('activation');
 * log.debug('Phase 3 starting...'); // Only shown if 'activation' in namespaces
 * ```
 */
export interface ChildLogger {
	readonly namespace: string;
	trace(message: string, ...args: unknown[]): void;
	debug(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, errorOrContext?: Error | Record<string, unknown>, ...args: unknown[]): void;
	isLevelEnabled(level: LogLevel): boolean;
}

/**
 * Structured logging utility for Vreko extension
 *
 * Features:
 * - Singleton pattern for consistent logging across extension
 * - Configurable log levels via VS Code settings
 * - Structured data serialization
 * - Uses VS Code's native LogOutputChannel for proper log levels
 * - Logs appear in Output panel (not dev console as ERR)
 * - Type-safe error logging
 *
 * P2 Enhancements (Signal-to-Noise Improvements):
 * - Namespace-based filtering via child loggers
 * - isLevelEnabled() for expensive operation optimization
 * - Debug log batching for high-frequency operations
 * - TRACE level for ultra-verbose debugging
 * - SILENT level to disable all logging
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger';
 *
 * logger.info('File protected', { filePath: '/path/to/file' });
 * logger.error('Operation failed', error, { operation: 'snapshot' });
 * logger.debug('Debug info', { data: complexObject });
 *
 * // P2: Namespace-based logging
 * const log = logger.child('activation');
 * log.debug('Phase started'); // Only shown if 'activation' in namespaces setting
 *
 * // P2: Check before expensive operations
 * if (logger.isLevelEnabled(LogLevel.DEBUG)) {
 *   logger.debug('Expensive data', computeExpensiveData());
 * }
 * ```
 */
export class Logger {
	private static instance: Logger;
	private outputChannel: vscode.LogOutputChannel;
	private logLevel: LogLevel;
	private config: vscode.WorkspaceConfiguration;
	private enabledNamespaces: Set<string>;
	private childLoggers: Map<string, ChildLogger>;

	// Debug batching state
	private pendingDebugLogs: string[] = [];
	private batchFlushTimer: ReturnType<typeof setTimeout> | null = null;
	private batchingEnabled: boolean;

	// Config change listener disposable
	private configChangeListener: vscode.Disposable | undefined;

	private constructor(outputChannel: vscode.LogOutputChannel) {
		this.outputChannel = outputChannel;
		this.config = vscode.workspace.getConfiguration("vreko");
		this.logLevel = this.parseLogLevel(this.config.get<string>("logLevel", "info"));
		this.enabledNamespaces = new Set(this.config.get<string[]>("logNamespaces", []));
		this.batchingEnabled = this.config.get<boolean>("logBatchDebug", false);
		this.childLoggers = new Map();

		// Listen for configuration changes
		this.configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("vreko.logLevel")) {
				this.config = vscode.workspace.getConfiguration("vreko");
				this.logLevel = this.parseLogLevel(this.config.get<string>("logLevel", "info"));
				this.info("Log level changed", {
					newLevel: LogLevel[this.logLevel],
				});
			}

			if (e.affectsConfiguration("vreko.logNamespaces")) {
				this.config = vscode.workspace.getConfiguration("vreko");
				this.enabledNamespaces = new Set(this.config.get<string[]>("logNamespaces", []));
				this.info("Log namespaces changed", {
					namespaces: Array.from(this.enabledNamespaces),
				});
			}

			if (e.affectsConfiguration("vreko.logBatchDebug")) {
				this.config = vscode.workspace.getConfiguration("vreko");
				this.batchingEnabled = this.config.get<boolean>("logBatchDebug", false);
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
	 * const logger = Logger.getInstance(vscode.window.createOutputChannel('Vreko'));
	 *
	 * // Subsequent calls: returns same instance (parameter is ignored)
	 * const same = Logger.getInstance();
	 * ```
	 *
	 * @see {@link logger} exported singleton instance
	 */
	static getInstance(outputChannel?: vscode.LogOutputChannel): Logger {
		if (!Logger.instance) {
			if (!outputChannel) {
				throw new Error("Logger not initialized. Call getInstance with LogOutputChannel first.");
			}
			Logger.instance = new Logger(outputChannel);
		}
		return Logger.instance;
	}

	/**
	 * P2 Enhancement: Check if a log level is enabled.
	 *
	 * Use this before expensive operations to avoid computing debug data
	 * when it won't be logged. Pattern from Pino best practices.
	 *
	 * @param level - The log level to check
	 * @returns true if messages at this level will be logged
	 *
	 * @example
	 * ```typescript
	 * if (logger.isLevelEnabled(LogLevel.DEBUG)) {
	 *   const expensiveData = computeExpensiveDebugInfo();
	 *   logger.debug('Debug info', { data: expensiveData });
	 * }
	 * ```
	 */
	isLevelEnabled(level: LogLevel): boolean {
		return this.logLevel <= level && this.logLevel !== LogLevel.SILENT;
	}

	/**
	 * P2 Enhancement: Create a child logger with namespace.
	 *
	 * Child loggers allow filtering logs by subsystem. When `vreko.logNamespaces`
	 * is set, only those namespaces will log at debug level; others are info+.
	 *
	 * @param namespace - The namespace for this logger (e.g., 'activation', 'mcp', 'snapshot')
	 * @returns A ChildLogger instance with the same API as the main logger
	 *
	 * @example
	 * ```typescript
	 * const log = logger.child('activation');
	 * log.debug('Phase 3 starting...'); // Only shown if 'activation' in namespaces
	 * log.info('Activation complete'); // Always shown at info level
	 * ```
	 */
	child(namespace: string): ChildLogger {
		// Return cached child logger if exists
		const cached = this.childLoggers.get(namespace);
		if (cached) {
			return cached;
		}

		// Create new child logger
		const childLogger: ChildLogger = {
			namespace,
			trace: (message: string, ...args: unknown[]) => this.logWithNamespace("TRACE", namespace, message, ...args),
			debug: (message: string, ...args: unknown[]) => this.logWithNamespace("DEBUG", namespace, message, ...args),
			info: (message: string, ...args: unknown[]) => this.logWithNamespace("INFO", namespace, message, ...args),
			warn: (message: string, ...args: unknown[]) => this.logWithNamespace("WARN", namespace, message, ...args),
			error: (message: string, errorOrContext?: Error | Record<string, unknown>, ...args: unknown[]) => {
				let errorData: unknown;
				if (errorOrContext instanceof Error) {
					errorData = {
						name: errorOrContext.name,
						message: errorOrContext.message,
						stack: errorOrContext.stack,
					};
				} else if (errorOrContext) {
					errorData = errorOrContext;
				}
				this.logWithNamespace("ERROR", namespace, message, errorData, ...args);
			},
			isLevelEnabled: (level: LogLevel) => this.isNamespaceLevelEnabled(namespace, level),
		};

		this.childLoggers.set(namespace, childLogger);
		return childLogger;
	}

	/**
	 * P2 Enhancement: Log trace message (most verbose level).
	 *
	 * Use for extremely detailed diagnostic information, such as
	 * function entry/exit, loop iterations, or data transformations.
	 * Even more verbose than debug - use sparingly.
	 *
	 * @param message - Primary log message
	 * @param args - Optional structured data
	 */
	trace(message: string, ...args: unknown[]): void {
		if (this.logLevel <= LogLevel.TRACE) {
			this.log("TRACE", message, ...args);
		}
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
	 * P2 Enhancement: Batched debug logging for high-frequency operations.
	 *
	 * Collects debug messages for 100ms, then logs a summary with count
	 * and sample messages. Reduces log noise from rapid operations.
	 *
	 * @param message - Debug message to batch
	 *
	 * @example
	 * ```typescript
	 * // In a loop processing many files
	 * for (const file of files) {
	 *   logger.debugBatch(`Processing ${file}`);
	 * }
	 * // Logs: "[Batch: 42 items] Processing file1.ts, Processing file2.ts, ..."
	 * ```
	 */
	debugBatch(message: string): void {
		if (this.logLevel > LogLevel.DEBUG) {
			return; // Don't batch if debug is disabled
		}

		if (!this.batchingEnabled) {
			// Batching disabled - log directly
			this.debug(message);
			return;
		}

		this.pendingDebugLogs.push(message);

		// Schedule flush after 100ms of quiet
		if (this.batchFlushTimer) {
			clearTimeout(this.batchFlushTimer);
		}
		this.batchFlushTimer = setTimeout(() => this.flushDebugBatch(), 100);
	}

	/**
	 * Flush pending batched debug logs
	 */
	private flushDebugBatch(): void {
		if (this.pendingDebugLogs.length === 0) {
			return;
		}

		const count = this.pendingDebugLogs.length;
		const sample = this.pendingDebugLogs.slice(0, 3).join(", ");
		const suffix = count > 3 ? `, ... (${count - 3} more)` : "";

		this.debug(`[Batch: ${count} items] ${sample}${suffix}`);
		this.pendingDebugLogs = [];
		this.batchFlushTimer = null;
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
	 * Log error message with optional Error object or context.
	 *
	 * Use when operations fail completely. Automatically extracts and formats
	 * error details (name, message, stack trace) for structured logging.
	 *
	 * @param message - Primary error message describing what failed
	 * @param errorOrContext - Optional Error object or context object
	 *   If Error: stack trace and error properties are extracted
	 *   If object: treated as context data (compatible with infrastructure logger)
	 * @param args - Optional structured data to include in log
	 *   Useful for context about the operation that failed
	 *
	 * @returns void (logged as side effect)
	 *
	 * @throws No exceptions thrown; errors are logged and ignored
	 *
	 * @example
	 * ```typescript
	 * // With Error object
	 * logger.error("Failed to restore snapshot", error as Error);
	 *
	 * // With context object (infrastructure logger compatible)
	 * logger.error("Failed to initialize", { error: error.message });
	 * ```
	 *
	 * @see {@link LogLevel.ERROR} for visibility control
	 */
	error(message: string, errorOrContext?: Error | Record<string, unknown>, ...args: unknown[]): void {
		if (this.logLevel <= LogLevel.ERROR) {
			let errorData: unknown;
			if (errorOrContext instanceof Error) {
				errorData = {
					name: errorOrContext.name,
					message: errorOrContext.message,
					stack: errorOrContext.stack,
				};
			} else if (errorOrContext) {
				// Handle context object (infrastructure logger compatibility)
				errorData = errorOrContext;
			}

			this.log("ERROR", message, errorData, ...args);
		}
	}

	/**
	 * Reveal the output channel in VS Code editor.
	 *
	 * Opens the "Vreko" output channel for user inspection. Does not steal
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
		// Flush any pending batched logs
		if (this.batchFlushTimer) {
			clearTimeout(this.batchFlushTimer);
			this.flushDebugBatch();
		}
		// Dispose config change listener
		if (this.configChangeListener) {
			this.configChangeListener.dispose();
			this.configChangeListener = undefined;
		}
		this.outputChannel.dispose();
	}

	/**
	 * Check if a namespace should log at debug level.
	 *
	 * If no namespaces are configured, all namespaces log at the global level.
	 * If namespaces are configured, only those namespaces get debug output.
	 */
	private isNamespaceLevelEnabled(namespace: string, level: LogLevel): boolean {
		if (this.logLevel === LogLevel.SILENT) {
			return false;
		}

		// If no namespace filtering, use global level
		if (this.enabledNamespaces.size === 0) {
			return this.logLevel <= level;
		}

		// For debug/trace, check if namespace is enabled
		if (level <= LogLevel.DEBUG) {
			return this.enabledNamespaces.has(namespace) && this.logLevel <= level;
		}

		// Info and above always pass (subject to global level)
		return this.logLevel <= level;
	}

	/**
	 * Log with namespace prefix and filtering
	 */
	private logWithNamespace(level: string, namespace: string, message: string, ...args: unknown[]): void {
		const levelEnum = this.parseLevelString(level);

		if (!this.isNamespaceLevelEnabled(namespace, levelEnum)) {
			return;
		}

		// Add namespace prefix to message
		const prefixedMessage = `[${namespace}] ${message}`;
		this.log(level, prefixedMessage, ...args);
	}

	/**
	 * Parse level string to enum
	 */
	private parseLevelString(level: string): LogLevel {
		switch (level) {
			case "TRACE":
				return LogLevel.TRACE;
			case "DEBUG":
				return LogLevel.DEBUG;
			case "INFO":
				return LogLevel.INFO;
			case "WARN":
				return LogLevel.WARN;
			case "ERROR":
				return LogLevel.ERROR;
			default:
				return LogLevel.INFO;
		}
	}

	/**
	 * Internal logging method using native LogOutputChannel methods.
	 * Logs appear in Output panel with proper levels (not as ERR in dev console).
	 */
	private log(level: string, message: string, ...args: unknown[]): void {
		// Serialize additional arguments for structured logging
		const serializedArgs = args.length > 0 ? ` ${args.map((arg) => this.serialize(arg)).join(" ")}` : "";
		const fullMessage = message + serializedArgs;

		// Use native LogOutputChannel methods for proper log level display
		switch (level) {
			case "TRACE":
				this.outputChannel.trace(fullMessage);
				break;
			case "DEBUG":
				this.outputChannel.debug(fullMessage);
				break;
			case "INFO":
				this.outputChannel.info(fullMessage);
				break;
			case "WARN":
				this.outputChannel.warn(fullMessage);
				break;
			case "ERROR":
				this.outputChannel.error(fullMessage);
				break;
			default:
				this.outputChannel.info(fullMessage);
		}
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
			case "trace":
				return LogLevel.TRACE;
			case "debug":
				return LogLevel.DEBUG;
			case "info":
				return LogLevel.INFO;
			case "warn":
				return LogLevel.WARN;
			case "error":
				return LogLevel.ERROR;
			case "silent":
				return LogLevel.SILENT;
			default:
				return LogLevel.INFO;
		}
	}
}

/**
 * Singleton logger instance
 * Must be initialized with outputChannel before use
 *
 * P2 Enhancement: Added child(), isLevelEnabled(), trace(), debugBatch()
 */
export const logger = {
	getInstance: Logger.getInstance.bind(Logger),
	child: (namespace: string) => Logger.getInstance().child(namespace),
	isLevelEnabled: (level: LogLevel) => Logger.getInstance().isLevelEnabled(level),
	trace: (message: string, ...args: unknown[]) => Logger.getInstance().trace(message, ...args),
	debug: (message: string, ...args: unknown[]) => Logger.getInstance().debug(message, ...args),
	debugBatch: (message: string) => Logger.getInstance().debugBatch(message),
	info: (message: string, ...args: unknown[]) => Logger.getInstance().info(message, ...args),
	warn: (message: string, ...args: unknown[]) => Logger.getInstance().warn(message, ...args),
	error: (message: string, errorOrContext?: Error | Record<string, unknown>, ...args: unknown[]) =>
		Logger.getInstance().error(message, errorOrContext, ...args),
	show: () => Logger.getInstance().show(),
	dispose: () => Logger.getInstance().dispose(),
};
