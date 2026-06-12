/**
 * Process Exit Guard
 *
 * Prevents bundled code (like CLI modules) from calling process.exit()
 * which would crash the VS Code extension host.
 *
 * CRITICAL: This guard must be installed early in activation, before
 * any imports that might call process.exit() as part of their error handling.
 */

import { logger } from "./logger";

/**
 * Install a guard that prevents process.exit() from terminating the extension host.
 *
 * Instead of exiting, it logs the attempt and continues execution.
 * This is necessary because some dependencies may call process.exit()
 * as part of their normal error handling, but in the VS Code extension
 * context, this would crash the host.
 */
export function installProcessExitGuard(): void {
	process.exit = ((code?: number) => {
		const stack = new Error().stack;
		logger.warn("BLOCKED: process.exit() call prevented", {
			exitCode: code,
			stack: stack?.split("\n").slice(0, 3).join("\n"), // First 3 stack frames
		});
		// Return without exiting or throwing - just log and continue
		return undefined as never;
	}) as typeof process.exit;

	logger.info("process.exit() guard installed - extension is protected from unexpected exits");
}
