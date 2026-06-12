/**
 * Observability Module
 *
 * Central export for observability features:
 * - Sentry error tracking
 * - Performance monitoring
 *
 * Note: ActivationHealthMonitor removed in Phase 2B (collapsed to DaemonBridge
 * health/ping as single health monitoring path).
 */

export {
	addBreadcrumb,
	captureException,
	captureMessage,
	closeSentry,
	flushSentry,
	initSentryExtension,
	isSentryInitialized,
	type SentryConfig,
	setUser,
	startTransaction,
	withErrorCapture,
} from "./sentry";
