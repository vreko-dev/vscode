/**
 * Observability Module
 *
 * Central export for all observability features:
 * - Sentry error tracking
 * - Performance monitoring
 * - Health checks
 *
 * This module provides proactive monitoring to catch issues
 * before they impact users.
 */

export {
	ActivationHealthMonitor,
	type ActivationHealthReport,
	type ComponentHealthResult,
	createDefaultHealthChecks,
	disposeHealthMonitor,
	getHealthMonitor,
	initializeHealthMonitor,
} from "./ActivationHealthMonitor";
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
