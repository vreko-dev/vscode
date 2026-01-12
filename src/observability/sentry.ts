/**
 * Sentry Integration for VS Code Extension (Sentry v8 compatible)
 *
 * CRITICAL: VS Code extensions run in a shared environment where multiple
 * extensions may use Sentry. Using Sentry.init() would pollute the global state.
 *
 * This implementation follows Sentry's best practices for shared environments:
 * - Creates an isolated client/scope (no global state pollution)
 * - Uses proper Sentry v8 API with transport and stackParser
 * - Provides breadcrumb trail for debugging
 * - Scrubs sensitive data before sending
 *
 * @see https://docs.sentry.io/platforms/javascript/best-practices/shared-environments/
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

// Lazy-loaded Sentry modules
let SentryNode: typeof import("@sentry/node") | null = null;
let sentryClient: InstanceType<typeof import("@sentry/node").NodeClient> | null = null;
let sentryScope: InstanceType<typeof import("@sentry/node").Scope> | null = null;
let sentryInitialized = false;

/**
 * Sentry configuration options
 */
export interface SentryConfig {
	dsn?: string;
	environment?: string;
	release?: string;
	enabled?: boolean;
	tracesSampleRate?: number;
	debug?: boolean;
}

/**
 * Load Sentry modules dynamically to avoid bundling issues
 */
async function loadSentry(): Promise<typeof import("@sentry/node") | null> {
	if (SentryNode) {
		return SentryNode;
	}

	// Check if explicitly disabled
	const config = vscode.workspace.getConfiguration("snapback");
	if (config.get<boolean>("disableSentry") === true) {
		logger.debug("Sentry disabled via configuration");
		return null;
	}

	try {
		SentryNode = await import("@sentry/node");
		return SentryNode;
	} catch (error) {
		logger.warn("Failed to load @sentry/node - error tracking disabled", {
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

/**
 * Initialize Sentry for VS Code extension
 *
 * Uses isolated client/scope pattern for shared environment compatibility
 */
export async function initSentryExtension(context: vscode.ExtensionContext, config?: SentryConfig): Promise<void> {
	if (sentryInitialized) {
		return;
	}

	// Check if disabled
	if (config?.enabled === false) {
		logger.info("Sentry disabled via config");
		return;
	}

	const dsn = config?.dsn || process.env.SENTRY_DSN;
	if (!dsn) {
		logger.debug("SENTRY_DSN not configured - error tracking disabled");
		return;
	}

	const Sentry = await loadSentry();
	if (!Sentry) {
		return;
	}

	try {
		const extensionVersion = context.extension.packageJSON.version;
		const release = config?.release || `snapback-vscode@${extensionVersion}`;
		const environment = config?.environment || process.env.NODE_ENV || "production";

		// Create isolated client with Sentry v8 API
		// NodeClient requires transport and stackParser in v8
		const integrations = Sentry.getDefaultIntegrations({}).filter((integration) => {
			// These integrations use global state and conflict with VS Code
			const excludeList = ["OnUncaughtException", "OnUnhandledRejection", "Http"];
			return !excludeList.includes(integration.name);
		});

		sentryClient = new Sentry.NodeClient({
			dsn,
			release,
			environment,
			tracesSampleRate: config?.tracesSampleRate ?? (environment === "production" ? 0.1 : 1.0),
			debug: config?.debug ?? false,
			integrations,
			// Required in Sentry v8
			transport: Sentry.makeNodeTransport,
			stackParser: Sentry.defaultStackParser,
			// Scrub sensitive data
			beforeSend: (event) => {
				// Scrub file paths (could reveal user directory structure)
				if (event.exception?.values) {
					for (const exception of event.exception.values) {
						if (exception.stacktrace?.frames) {
							for (const frame of exception.stacktrace.frames) {
								if (frame.filename) {
									// Replace full paths with relative paths
									frame.filename = frame.filename.replace(
										/.*[/\\](apps|packages|node_modules)[/\\]/g,
										"$1/",
									);
								}
							}
						}
					}
				}

				// Scrub sensitive headers/data
				if (event.request?.headers) {
					delete event.request.headers.authorization;
					delete event.request.headers.cookie;
					delete event.request.headers["x-api-key"];
				}

				// Add extension context
				event.tags = {
					...event.tags,
					"vscode.version": vscode.version,
					"extension.version": extensionVersion,
					platform: process.platform,
				};

				return event;
			},
		});

		// Create isolated scope
		sentryScope = new Sentry.Scope();
		sentryScope.setClient(sentryClient);

		// Initialize the client
		sentryClient.init();

		// Set initial context
		sentryScope.setTag("extension.id", context.extension.id);
		sentryScope.setContext("vscode", {
			version: vscode.version,
			appName: vscode.env.appName,
			language: vscode.env.language,
			remoteName: vscode.env.remoteName || "local",
			shell: vscode.env.shell,
		});

		sentryInitialized = true;
		logger.info("✅ Sentry initialized for extension error tracking", {
			release,
			environment,
		});
	} catch (error) {
		logger.error("Failed to initialize Sentry", error as Error);
	}
}

/**
 * Capture an exception with context
 */
export function captureException(
	error: Error,
	context?: {
		tags?: Record<string, string>;
		extra?: Record<string, unknown>;
		level?: "fatal" | "error" | "warning" | "info" | "debug";
		fingerprint?: string[];
	},
): string | undefined {
	if (!sentryInitialized || !sentryScope || !SentryNode) {
		// Log locally if Sentry not available
		logger.error("Exception occurred (Sentry not initialized)", error);
		return undefined;
	}

	try {
		sentryScope.setLevel(context?.level || "error");

		if (context?.tags) {
			Object.entries(context.tags).forEach(([key, value]) => {
				sentryScope?.setTag(key, value);
			});
		}

		if (context?.extra) {
			sentryScope.setContext("extra", context.extra);
		}

		if (context?.fingerprint) {
			sentryScope.setFingerprint(context.fingerprint);
		}

		const eventId = sentryScope.captureException(error);
		logger.debug("Exception captured in Sentry", { eventId });
		return eventId;
	} catch (captureError) {
		logger.error("Failed to capture exception in Sentry", captureError as Error);
		return undefined;
	}
}

/**
 * Capture a message with context
 */
export function captureMessage(
	message: string,
	level: "fatal" | "error" | "warning" | "info" | "debug" = "info",
	context?: Record<string, unknown>,
): string | undefined {
	if (!sentryInitialized || !sentryScope) {
		return undefined;
	}

	try {
		sentryScope.setLevel(level);
		if (context) {
			sentryScope.setContext("message_context", context);
		}

		return sentryScope.captureMessage(message);
	} catch (error) {
		logger.error("Failed to capture message in Sentry", error as Error);
		return undefined;
	}
}

/**
 * Add breadcrumb for debugging trail
 */
export function addBreadcrumb(
	message: string,
	category: string,
	data?: Record<string, unknown>,
	level: "fatal" | "error" | "warning" | "info" | "debug" = "info",
): void {
	if (!sentryInitialized || !sentryScope || !SentryNode) {
		return;
	}

	try {
		sentryScope.addBreadcrumb({
			message,
			category,
			data,
			level,
			timestamp: Date.now() / 1000,
		});
	} catch (_error) {
		// Silently fail - breadcrumbs are not critical
	}
}

/**
 * Set user context (for authenticated users)
 */
export function setUser(user: { id: string; email?: string; subscription?: string } | null): void {
	if (!sentryInitialized || !sentryScope) {
		return;
	}

	if (user) {
		sentryScope.setUser({
			id: user.id,
			// Don't send email unless explicitly allowed
			subscription: user.subscription,
		});
	} else {
		sentryScope.setUser(null);
	}
}

/**
 * Start a performance span (Sentry v8 API - transactions replaced with spans)
 */
export function startSpan(
	name: string,
	op: string,
): { finish: () => void; setTag: (key: string, value: string) => void } | null {
	if (!sentryInitialized || !SentryNode) {
		return null;
	}

	// In Sentry v8, startTransaction is replaced with startSpan
	// For extension context, we use a simple span wrapper
	try {
		const startTime = Date.now();
		const tags: Record<string, string> = {};

		return {
			finish: () => {
				// Log performance data locally since we can't use startTransaction
				const duration = Date.now() - startTime;
				logger.debug(`[Sentry Span] ${op}:${name} completed in ${duration}ms`, tags);
			},
			setTag: (key: string, value: string) => {
				tags[key] = value;
			},
		};
	} catch (_error) {
		return null;
	}
}

// Alias for backward compatibility
export const startTransaction = startSpan;

/**
 * Flush pending events before shutdown
 */
export async function flushSentry(timeout = 2000): Promise<void> {
	if (!sentryInitialized || !sentryClient) {
		return;
	}

	try {
		await sentryClient.flush(timeout);
		logger.debug("Sentry events flushed");
	} catch (error) {
		logger.warn("Failed to flush Sentry events", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Close Sentry client on extension deactivation
 */
export async function closeSentry(): Promise<void> {
	if (!sentryInitialized || !sentryClient) {
		return;
	}

	try {
		await flushSentry();
		await sentryClient.close();
		sentryInitialized = false;
		sentryClient = null;
		sentryScope = null;
		SentryNode = null;
		logger.debug("Sentry client closed");
	} catch (error) {
		logger.warn("Error closing Sentry client", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Create a wrapper function that captures errors
 */
export function withErrorCapture<T extends (...args: unknown[]) => unknown>(
	fn: T,
	context?: { operation?: string; tags?: Record<string, string> },
): T {
	return ((...args: unknown[]) => {
		try {
			const result = fn(...args);

			// Handle async functions
			if (result instanceof Promise) {
				return result.catch((error) => {
					captureException(error instanceof Error ? error : new Error(String(error)), {
						tags: {
							operation: context?.operation || fn.name || "unknown",
							...context?.tags,
						},
					});
					throw error;
				});
			}

			return result;
		} catch (error) {
			captureException(error instanceof Error ? error : new Error(String(error)), {
				tags: {
					operation: context?.operation || fn.name || "unknown",
					...context?.tags,
				},
			});
			throw error;
		}
	}) as T;
}

/**
 * Check if Sentry is initialized
 */
export function isSentryInitialized(): boolean {
	return sentryInitialized;
}
