import * as vscode from "vscode";
import { captureException } from "../observability/sentry";
import { isVrekoError } from "./errorHelpers";
import { logger } from "./logger";

/**
 * Installs global error handlers to prevent extension host crashes.
 * Only processes errors that originate from the Vreko extension.
 */
export function installGlobalErrorHandlers(): void {
	process.on("unhandledRejection", (reason, promise) => {
		const error = reason instanceof Error ? reason : new Error(String(reason));
		const errorStack = error.stack;

		if (!isVrekoError(errorStack)) {
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
			"Vreko encountered an unexpected error. Some features may be unavailable. Check Output → Vreko for details.",
		);
	});

	process.on("uncaughtException", (error) => {
		if (!isVrekoError(error.stack)) {
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
			"Vreko encountered a critical error. Extension may be unstable. Please reload VS Code.",
		);
	});
}
