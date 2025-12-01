import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// Constants for sandbox limits
const SANDBOX_TIMEOUT_MS = 250;
const _SANDBOX_HEAP_LIMIT_MB = 32;

interface SandboxMessage {
	type: "result" | "error";
	data?: unknown;
	message?: string;
	code?: string;
}

/**
 * Execute a JavaScript/TypeScript file in a secure sandboxed environment
 *
 * Security features:
 * - Hard timeout limit (250ms)
 * - Memory limit (~32MB heap)
 * - Forbidden API blocking (fs, net, child_process, process)
 * - Only POJO results allowed
 * - Enforces Node exec flags: --disallow-code-generation-from-strings, --frozen-intrinsics
 *
 * @param filePath Path to the JavaScript/TypeScript file to execute
 * @returns Promise resolving to the sandbox result
 */
export async function executeSandboxedScript(
	filePath: string,
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const scriptPath = path.resolve(filePath);
		const sandboxScriptPath = path.join(__dirname, "sandboxScript.js");

		// Verify sandbox script exists
		if (!fs.existsSync(sandboxScriptPath)) {
			reject(new Error("Sandbox script not found"));
			return;
		}

		// Create Node.js process with strict limits and security flags
		const nodePath = process.execPath;
		const nodeArgs = [
			"--no-warnings",
			`--max-old-space-size=${_SANDBOX_HEAP_LIMIT_MB}`,
			"--disallow-code-generation-from-strings",
			"--frozen-intrinsics",
			sandboxScriptPath,
			scriptPath,
		];

		// Spawn child process with timeout
		const child: ChildProcess = spawn(nodePath, nodeArgs, {
			stdio: ["pipe", "pipe", "pipe", "ipc"],
			cwd: path.dirname(scriptPath),
			env: {
				NODE_ENV: "production",
				// Minimal environment variables
				PATH: process.env.PATH,
				HOME: process.env.HOME,
			},
		});

		let timeoutId: NodeJS.Timeout;

		// Set up timeout
		timeoutId = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error("Script execution timed out (ERR_SB_TIMEOUT)"));
		}, SANDBOX_TIMEOUT_MS);

		// Handle messages from child process
		child.on("message", (message: unknown) => {
			const msg = message as SandboxMessage;
			if (msg && msg.type === "result") {
				clearTimeout(timeoutId);
				resolve(msg.data);
			} else if (msg && msg.type === "error") {
				clearTimeout(timeoutId);
				// Pass through the error code from the child process
				if (msg.code) {
					reject(new Error(`${msg.message} (${msg.code})`));
				} else {
					reject(new Error(msg.message));
				}
			}
		});

		// Handle process exit
		child.on("exit", (code, signal) => {
			clearTimeout(timeoutId);

			if (signal === "SIGABRT" || signal === "SIGKILL") {
				// If we get SIGABRT, it's likely due to memory limit being exceeded
				// If we get SIGKILL, it's likely due to timeout
				reject(
					new Error(
						"Script killed due to memory limit or timeout (ERR_SB_MEMORY or ERR_SB_TIMEOUT)",
					),
				);
			} else if (code !== 0) {
				// If we get here and haven't received an error message, it's likely a script error
				reject(new Error(`Script exited with code ${code}`));
			}
		});

		// Handle spawn errors
		child.on("error", (error) => {
			clearTimeout(timeoutId);
			reject(new Error(`Failed to spawn child process: ${error.message}`));
		});
	});
}
