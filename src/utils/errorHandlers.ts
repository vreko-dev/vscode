import * as vscode from "vscode";
import { logger } from "./logger";
import { captureException } from "../observability/sentry";
import { isSnapBackError } from "./errorHelpers";

/**
 * Installs global error handlers to prevent extension host crashes.
 * Only processes errors that originate from the SnapBack extension.
 */
export function installGlobalErrorHandlers(): void {
	process.on("unhandledRejection", (reason, promise) => {
		const error = reason instanceof Error ? reason : new Error(String(reason));
		const errorStack = error.stack;

		if (!isSnapBackError(errorStack)) {
			return;
		}

		logger.error("CRITICAL: Unhandled Promise Rejection", error, {
			promise: String(promise),
			errorStack,
		});

		captureException(error, {
			tags: { source: "unhandledRejection", phase: "runtime" },
			level: "fatal",
		});

		vscode.window.showErrorMessage(
			"SnapBack encountered an unexpected error. Some features may be unavailable. Check Output → SnapBack for details.",
		);
	});

	process.on("uncaughtException", (error) => {
		if (!isSnapBackError(error.stack)) {
			return;
		}

		logger.error("CRITICAL: Uncaught Exception", error, {
			errorName: error.name,
		});

		captureException(error, {
			tags: { source: "uncaughtException", phase: "runtime" },
			level: "fatal",
		});

		vscode.window.showErrorMessage(
			"SnapBack encountered a critical error. Extension may be unstable. Please reload VS Code.",
		);
	});
}
