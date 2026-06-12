/**
 * Connection Manager
 *
 * Manages daemon connection lifecycle:
 * - Socket connection management
 * - Daemon auto-start and spawning
 * - Reconnection with exponential backoff
 * - Circuit breaker pattern for CLI not found
 *
 * @module daemon-bridge/ConnectionManager
 */

import { type ChildProcess, spawn } from "node:child_process";
import { chmodSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, sep } from "node:path";
import { getDefaultSocketPath } from "@vreko/local-service-client";
import * as vscode from "vscode";
import { logger } from "../../utils/logger";

const IS_WINDOWS = platform() === "win32";
const MIN_RECONNECT_INTERVAL_MS = 1000;
const MAX_RECONNECT_INTERVAL_MS = 30000;
const DAEMON_START_TIMEOUT_MS = 30000;
const DAEMON_START_WAIT_MS = 2000;
const _MIN_POLL_BEFORE_PID_CHECK_MS = 3000;
/** Stale spawn-counter TTL: if last attempt was older than this, reset counter (cross-session cleanup) */
const SPAWN_COUNTER_TTL_MS = 5 * 60 * 1000; // 5 minutes
/** After exhausting maxReconnectAttempts, wait this long before resetting state and retrying once more */
const LONG_RETRY_DELAY_MS = 60_000; // 1 minute
const _CLIENT_ID = `vscode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const _LOG_PREFIX = "[ConnectionManager]";

/** Socket path for Unix or named pipe for Windows
 * P1-C: Re-export from canonical location in @vreko/local-service-client
 */
export function getSocketPath(): string {
	return getDefaultSocketPath();
}

/** PID file path */
export function getPidPath(): string {
	const home = homedir();
	// Fallback to /tmp if homedir() returns undefined (e.g., in test environments)
	const basePath = home ?? "/tmp";
	return join(basePath, ".vreko", "service.pid");
}

/** Daemon log file path */
export function getDaemonLogPath(): string {
	const home = homedir();
	const basePath = home ?? "/tmp";
	return join(basePath, ".vreko", "daemon", "daemon.log");
}

/**
 * Read the last N lines from the daemon log file for error diagnosis
 * Returns null if the file doesn't exist or cannot be read
 */
export function readDaemonLogLines(maxLines = 50): string[] {
	try {
		const logPath = getDaemonLogPath();
		if (!existsSync(logPath)) {
			return [];
		}

		const content = readFileSync(logPath, "utf-8");
		const lines = content.split("\n").filter((line) => line.trim());
		// Return last maxLines lines
		return lines.slice(-maxLines);
	} catch (error) {
		logger.warn("Failed to read daemon log file", { error: String(error) });
		return [];
	}
}

/**
 * Circuit breaker to prevent retry spam when CLI is not installed or spawns keep failing.
 */
export interface CircuitBreakerState {
	cliNotFound: boolean;
	lastError: string | null;
	notificationShown: boolean;
	/** Count of consecutive spawn failures (any type, not just ENOENT) */
	spawnFailCount: number;
	/** Tripped when spawn failures exceed MAX_SPAWN_FAILURES */
	spawnFailed: boolean;
}

/** Number of consecutive spawn failures before circuit breaker trips */
const MAX_SPAWN_FAILURES = 3;

export const circuitBreaker: CircuitBreakerState = {
	cliNotFound: false,
	lastError: null,
	notificationShown: false,
	spawnFailCount: 0,
	spawnFailed: false,
};

// =============================================================================
// MULTI-WINDOW SPAWN COORDINATION
// =============================================================================

/** Storage keys for cross-window spawn state */
const SPAWN_STATE_KEYS = {
	ATTEMPTS: "vreko.daemon.spawnAttempts",
	LAST_ATTEMPT: "vreko.daemon.lastSpawnAttempt",
} as const;

/**
 * Shared spawn state manager for cross-window coordination.
 * Uses globalState to prevent multiple VS Code windows from spawning daemons simultaneously.
 */
class DaemonSpawnStateManager {
	private globalState: vscode.Memento | null = null;

	/**
	 * Initialize with VS Code globalState (shared across all windows)
	 */
	initialize(globalState: vscode.Memento): void {
		this.globalState = globalState;
	}

	/**
	 * Get total spawn attempts across all windows
	 */
	getAttempts(): number {
		return this.globalState?.get<number>(SPAWN_STATE_KEYS.ATTEMPTS, 0) ?? 0;
	}

	/**
	 * Increment spawn attempts counter
	 */
	incrementAttempts(): void {
		const current = this.getAttempts();
		this.globalState?.update(SPAWN_STATE_KEYS.ATTEMPTS, current + 1);
	}

	/**
	 * Get timestamp of last spawn attempt (any window)
	 */
	getLastAttempt(): number | null {
		return this.globalState?.get<number | null>(SPAWN_STATE_KEYS.LAST_ATTEMPT, null) ?? null;
	}

	/**
	 * Update last spawn attempt timestamp
	 */
	setLastAttempt(timestamp: number): void {
		this.globalState?.update(SPAWN_STATE_KEYS.LAST_ATTEMPT, timestamp);
	}

	/**
	 * Reset spawn state (called when daemon starts successfully)
	 */
	reset(): void {
		this.globalState?.update(SPAWN_STATE_KEYS.ATTEMPTS, 0);
		this.globalState?.update(SPAWN_STATE_KEYS.LAST_ATTEMPT, null);
	}

	/**
	 * Reset spawn state if the counter is stale (last attempt was too long ago).
	 * Prevents spawn counters from a previous VS Code session from permanently
	 * blocking daemon auto-start in a new session.
	 *
	 * Called at the start of every autoStartDaemon() attempt.
	 */
	resetIfStale(): void {
		const lastAttempt = this.getLastAttempt();
		if (lastAttempt === null) {
			return; // No previous attempt recorded  -  nothing to reset
		}
		const timeSince = Date.now() - lastAttempt;
		if (timeSince > SPAWN_COUNTER_TTL_MS) {
			logger.info("Daemon spawn counter stale  -  resetting for new session", {
				timeSinceLastAttemptMs: timeSince,
				ttlMs: SPAWN_COUNTER_TTL_MS,
			});
			this.reset();
		}
	}
}

/** Global spawn state manager instance */
export const spawnStateManager = new DaemonSpawnStateManager();

export function resetCircuitBreaker(): void {
	circuitBreaker.cliNotFound = false;
	circuitBreaker.lastError = null;
	circuitBreaker.notificationShown = false;
	circuitBreaker.spawnFailCount = 0;
	circuitBreaker.spawnFailed = false;
	logger.info("Daemon circuit breaker reset");
}

/**
 * Find the vreko CLI executable path.
 *
 * Priority:
 * 1. VREKO_CLI_PATH env var (for development/testing)
 * 2. Local development CLI in workspace (apps/cli/dist/index.js)
 * 3. Globally installed vreko binary
 * 4. Local local-service directly (apps/local-service/dist/main.js)
 * 5. Fallback to "vreko" in PATH
 */
export function getCliPath(): string | null {
	try {
		// Priority 1: Environment variable override (for development)
		const envCliPath = process.env.VREKO_CLI_PATH;
		if (envCliPath) {
			if (existsSync(envCliPath)) {
				logger.info("Using CLI from VREKO_CLI_PATH env var", { path: envCliPath });
				return envCliPath;
			}
			logger.warn("VREKO_CLI_PATH set but path does not exist", { path: envCliPath });
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			for (const folder of workspaceFolders) {
				const localCliPath = join(folder.uri.fsPath, "apps", "cli", "dist", "index.js");
				if (existsSync(localCliPath)) {
					logger.info("Using local development CLI", { path: localCliPath });
					return localCliPath;
				}
			}
		}

		const possiblePaths = [
			join(homedir(), ".npm-global", "bin", IS_WINDOWS ? "vreko.cmd" : "vreko"),
			join(homedir(), ".npm", "_npx", "*", "node_modules", ".bin", IS_WINDOWS ? "vreko.cmd" : "vreko"),
			join(homedir(), ".local", "share", "pnpm", IS_WINDOWS ? "vreko.cmd" : "vreko"),
			"/usr/local/bin/vreko",
			"/opt/homebrew/bin/vreko",
		];

		for (const p of possiblePaths) {
			if (existsSync(p)) {
				return p;
			}
		}

		if (workspaceFolders && workspaceFolders.length > 0) {
			for (const folder of workspaceFolders) {
				const localServicePath = join(folder.uri.fsPath, "apps", "local-service", "dist", "main.js");
				if (existsSync(localServicePath)) {
					logger.info("Using local-service directly (CLI not available)", { path: localServicePath });
					return localServicePath;
				}
			}
		}

		return IS_WINDOWS ? "vreko.cmd" : "vreko";
	} catch {
		return null;
	}
}

export interface ConnectionManagerConfig {
	maxReconnectAttempts?: number;
	maxDaemonSpawnAttempts?: number;
	daemonSpawnCooldown?: number;
}

export class ConnectionManager {
	private reconnectDelay = MIN_RECONNECT_INTERVAL_MS;
	private reconnectAttempts = 0;
	private maxReconnectAttempts: number;
	private reconnectTimer: NodeJS.Timeout | null = null;

	private daemonSpawnAttempts = 0;
	private readonly maxDaemonSpawnAttempts: number;
	private readonly daemonSpawnCooldown: number;
	private isStartingDaemon = false;

	constructor(config: ConnectionManagerConfig = {}) {
		this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
		this.maxDaemonSpawnAttempts = config.maxDaemonSpawnAttempts ?? 3;
		this.daemonSpawnCooldown = config.daemonSpawnCooldown ?? 10000;
	}

	/**
	 * Check if daemon process is running (without connecting)
	 */
	isDaemonRunning(): boolean {
		try {
			const pidPath = getPidPath();
			if (!existsSync(pidPath)) {
				return false;
			}

			const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
			if (Number.isNaN(pid)) {
				return false;
			}

			try {
				process.kill(pid, 0);
				return true;
			} catch (error) {
				logger.debug("Daemon process not running", { pid, error: String(error) });
				return false;
			}
		} catch (error) {
			logger.debug("Failed to check daemon PID file", { error: String(error) });
			return false;
		}
	}

	/**
	 * Get daemon PID from PID file
	 */
	getDaemonPID(): number | null {
		try {
			const pidPath = getPidPath();
			if (!existsSync(pidPath)) {
				return null;
			}

			const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
			if (Number.isNaN(pid)) {
				return null;
			}

			return pid;
		} catch (error) {
			logger.debug("Failed to read daemon PID file", { error: String(error) });
			return null;
		}
	}

	/**
	 * Get daemon spawn status for UI integration
	 */
	getDaemonSpawnStatus(): {
		attempts: number;
		maxAttempts: number;
		isSpawning: boolean;
		cooldownRemaining: number;
		exhausted: boolean;
	} {
		// Use shared spawn state for cross-window coordination
		const sharedAttempts = spawnStateManager.getAttempts();
		const sharedLastAttempt = spawnStateManager.getLastAttempt();
		const cooldownRemaining =
			sharedLastAttempt !== null ? Math.max(0, this.daemonSpawnCooldown - (Date.now() - sharedLastAttempt)) : 0;

		return {
			attempts: sharedAttempts,
			maxAttempts: this.maxDaemonSpawnAttempts,
			isSpawning: this.isStartingDaemon,
			cooldownRemaining,
			exhausted: this.daemonSpawnAttempts >= this.maxDaemonSpawnAttempts,
		};
	}

	/**
	 * Reset daemon spawn attempts
	 */
	resetDaemonSpawnAttempts(): void {
		// Reset shared spawn state (cross-window coordination)
		spawnStateManager.reset();
		logger.info("Daemon spawn attempts reset");
	}

	/**
	 * Get current reconnection attempt count
	 */
	getReconnectAttempt(): number {
		return this.reconnectAttempts;
	}

	/**
	 * Get maximum reconnection attempts
	 */
	getMaxReconnectAttempts(): number {
		return this.maxReconnectAttempts;
	}

	/**
	 * Calculate next reconnect delay with exponential backoff
	 */
	getNextReconnectDelay(): number {
		return Math.min(this.reconnectDelay * 2, MAX_RECONNECT_INTERVAL_MS);
	}

	/**
	 * Increment reconnect attempt and update delay
	 */
	incrementReconnectAttempt(): void {
		this.reconnectAttempts++;
		this.reconnectDelay = this.getNextReconnectDelay();
	}

	/**
	 * Reset reconnect state on successful connection
	 */
	resetReconnectState(): void {
		this.reconnectAttempts = 0;
		this.reconnectDelay = MIN_RECONNECT_INTERVAL_MS;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	/**
	 * Schedule a reconnect attempt
	 */
	scheduleReconnect(callback: () => void): void {
		if (this.reconnectTimer) {
			return;
		}

		this.incrementReconnectAttempt();

		if (this.reconnectAttempts > this.maxReconnectAttempts) {
			logger.warn("Max reconnection attempts reached  -  scheduling long-delay retry", {
				attempts: this.reconnectAttempts,
				retryInMs: LONG_RETRY_DELAY_MS,
			});
			this.reconnectTimer = setTimeout(() => {
				this.reconnectTimer = null;
				this.reconnectAttempts = 0;
				this.reconnectDelay = MIN_RECONNECT_INTERVAL_MS;
				spawnStateManager.reset();
				callback();
			}, LONG_RETRY_DELAY_MS);
			return;
		}

		logger.info(
			`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`,
		);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			callback();
		}, this.reconnectDelay);
	}

	/**
	 * Auto-start the daemon if not running
	 * @param verifyCallback - Optional callback to verify daemon is healthy (e.g., ping)
	 */
	async autoStartDaemon(verifyCallback?: () => Promise<boolean>): Promise<boolean> {
		const socketPath = getSocketPath();
		const pidPath = getPidPath();
		const socketExists = existsSync(socketPath);
		const pidExists = existsSync(pidPath);

		// Reset stale spawn counter (from a previous VS Code session) before checking limits
		spawnStateManager.resetIfStale();

		// Use shared spawn state for cross-window coordination
		const sharedAttempts = spawnStateManager.getAttempts();
		const sharedLastAttempt = spawnStateManager.getLastAttempt();

		logger.debug("[DAEMON] autoStartDaemon called", {
			socketPath,
			socketExists,
			pidPath,
			pidExists,
			isStarting: this.isStartingDaemon,
			spawnAttempts: sharedAttempts,
			maxAttempts: this.maxDaemonSpawnAttempts,
		});

		if (this.isDaemonRunning()) {
			logger.info("[DAEMON] Daemon already running (PID check passed)");
			// Reset shared spawn state on successful detection
			spawnStateManager.reset();
			return true;
		}

		if (this.isStartingDaemon) {
			logger.debug("Daemon auto-start skipped: spawn already in progress");
			return false;
		}

		// Check shared spawn attempts (cross-window coordination)
		if (sharedAttempts >= this.maxDaemonSpawnAttempts) {
			logger.warn("Daemon auto-start skipped: max spawn attempts reached (shared)", {
				attempts: sharedAttempts,
				maxAttempts: this.maxDaemonSpawnAttempts,
			});
			return false;
		}

		// Check shared cooldown (cross-window coordination)
		if (sharedLastAttempt !== null) {
			const timeSinceLastAttempt = Date.now() - sharedLastAttempt;
			if (timeSinceLastAttempt < this.daemonSpawnCooldown) {
				logger.debug("Daemon auto-start skipped: cooldown active (shared)", {
					remainingMs: this.daemonSpawnCooldown - timeSinceLastAttempt,
				});
				return false;
			}
		}

		if (circuitBreaker.cliNotFound) {
			logger.debug("Daemon auto-start skipped: local-service binary not found (circuit breaker active)");
			return false;
		}

		if (circuitBreaker.spawnFailed) {
			logger.debug("Daemon auto-start skipped: spawn circuit breaker active after repeated failures", {
				failCount: circuitBreaker.spawnFailCount,
				lastError: circuitBreaker.lastError,
			});
			return false;
		}

		const cliPath = getCliPath();
		if (!cliPath) {
			logger.warn("Cannot auto-start daemon: vreko CLI not found");
			return false;
		}

		logger.info("Auto-starting Vreko daemon...", { cliPath });

		this.isStartingDaemon = true;
		// Update shared spawn state (cross-window coordination)
		spawnStateManager.incrementAttempts();
		spawnStateManager.setLastAttempt(Date.now());

		return new Promise((resolve) => {
			const startTime = Date.now();
			let resolved = false;

			const cleanupSpawnState = () => {
				this.isStartingDaemon = false;
			};

			try {
				const isJsFile = cliPath.endsWith(".js");
				const isLocalServiceDirect = cliPath.endsWith("main.js") && cliPath.includes("local-service");
				let spawnCommand: string;
				let spawnArgs: string[];

				if (isLocalServiceDirect) {
					// Use system Node instead of process.execPath (which is Electron in VS Code/Qoder)
					spawnCommand = "node";
					spawnArgs = [cliPath];
				} else if (isJsFile) {
					// cli/dist/index.js -> ../../local-service/dist/main.js
					// Go up from cli/dist to apps/, then into local-service/dist
					const localServicePath = join(dirname(cliPath), "..", "..", "local-service", "dist", "main.js");
					// Use system Node instead of process.execPath (which is Electron in VS Code/Qoder)
					spawnCommand = "node";
					spawnArgs = [localServicePath];
				} else {
					spawnCommand = cliPath;
					spawnArgs = ["service", "start", "--daemon"];
				}

				const isBareCommand = !isJsFile && !spawnCommand.includes(sep) && !spawnCommand.startsWith(".");
				const binaryToCheck = isJsFile ? spawnArgs[0] : spawnCommand;
				const binaryExists = isBareCommand ? true : existsSync(binaryToCheck);

				if (!binaryExists) {
					logger.warn("Binary path does not exist", { path: binaryToCheck });
					cleanupSpawnState();
					resolve(false);
					return;
				}

				function ensurePathIncludes(currentPath: string, dir: string): string {
					const paths = currentPath.split(":");
					if (!paths.includes(dir)) {
						paths.unshift(dir);
					}
					return paths.join(":");
				}

				const child: ChildProcess = spawn(spawnCommand, spawnArgs, {
					detached: true,
					stdio: ["ignore", "pipe", "pipe"],
					// SECURITY: Never use shell - prevents command injection via workspace paths
					// On Windows, we must avoid shell:true even for bare commands
					// The CLI and local-service executables are direct Node.js scripts
					shell: false,
					windowsHide: true,
					// Set working directory to the local-service folder so relative paths work
					cwd: dirname(spawnArgs[0]),
					// Inject config values that were baked into the extension bundle at build time
					// via esbuild define:. The daemon (local-service) only needs POSTHOG_API_KEY
					// and VREKO_API_URL  -  no DATABASE_URL / REDIS_URL (those are API server secrets).
					env: {
						...process.env,
						PATH: ensurePathIncludes(process.env.PATH ?? "", dirname(cliPath)),
						// PostHog key for feature flags  -  write-only analytics key, safe to bundle.
						// Baked in by esbuild define: process.env.DAEMON_POSTHOG_API_KEY at build time.
						...(process.env.DAEMON_POSTHOG_API_KEY
							? { POSTHOG_API_KEY: process.env.DAEMON_POSTHOG_API_KEY }
							: {}),
						// API endpoint  -  public URL, hardcoded default is correct for production.
						// Baked in by esbuild define: process.env.DAEMON_VREKO_API_URL at build time.
						VREKO_API_URL: process.env.DAEMON_VREKO_API_URL || "https://api.vreko.dev",
						// Suppress pretty-printing in the daemon  -  it's a background process.
						DISABLE_PRETTY_LOGS: "true",
					},
				});

				// Capture stdout (daemon logs) for debugging
				if (child.stdout) {
					const stdoutChunks: Buffer[] = [];
					child.stdout.on("data", (chunk) => {
						stdoutChunks.push(Buffer.from(chunk));
					});
					child.stdout.on("end", () => {
						const stdoutOutput = Buffer.concat(stdoutChunks).toString("utf-8").trim();
						if (stdoutOutput) {
							logger.info("Daemon stdout output during startup", {
								pid: child.pid,
								stdout: stdoutOutput.slice(0, 2000), // Limit to first 2KB
							});
						}
					});
				}

				if (child.stderr) {
					const stderrChunks: Buffer[] = [];
					child.stderr.on("data", (chunk) => {
						stderrChunks.push(Buffer.from(chunk));
					});
					child.stderr.on("end", () => {
						const stderrOutput = Buffer.concat(stderrChunks).toString("utf-8").trim();
						if (stderrOutput) {
							logger.warn("Daemon stderr output during startup", {
								pid: child.pid,
								stderr: stderrOutput,
							});
						}
					});
				}

				child.unref();

				const daemonPid = child.pid;
				logger.info("Daemon process spawned", {
					pid: daemonPid,
					command: spawnCommand,
					args: spawnArgs,
					socketPath: getSocketPath(),
				});

				child.on("error", (err) => {
					if (resolved) {
						return;
					}
					resolved = true;

					const errorMsg = err.message;
					circuitBreaker.lastError = errorMsg;
					circuitBreaker.spawnFailCount++;

					// Read daemon log to surface crash reason
					const daemonLogLines = readDaemonLogLines(20);
					const recentErrors = daemonLogLines.filter(
						(line) => line.toLowerCase().includes("error") || line.toLowerCase().includes("failed"),
					);

					if ((err as NodeJS.ErrnoException).code === "ENOENT" || errorMsg.includes("ENOENT")) {
						const cliExists = existsSync(cliPath);
						if (!cliExists) {
							circuitBreaker.cliNotFound = true;
							logger.error(`Daemon spawn failed: CLI binary not found at ${cliPath}`);
						} else {
							circuitBreaker.cliNotFound = false; // Do NOT mark CLI as missing
							logger.error(
								`CLI found at ${cliPath} but spawn failed (ENOENT). ` +
									`This usually means 'node' is not in the extension host PATH. ` +
									`Current PATH: ${process.env.PATH}`,
							);
							void vscode.window
								.showWarningMessage(
									"Vreko found the CLI but cannot start it. " +
										"Try launching VS Code from your terminal: 'code .'  -  " +
										"or set 'vreko.cliPath' in settings.",
									"Open Settings",
								)
								.then((choice) => {
									if (choice === "Open Settings") {
										void vscode.commands.executeCommand(
											"workbench.action.openSettings",
											"vreko.cliPath",
										);
									}
								});
						}
					} else {
						logger.warn("Daemon spawn failed", {
							error: errorMsg,
							failCount: circuitBreaker.spawnFailCount,
							daemonLogSample: recentErrors.length > 0 ? recentErrors : daemonLogLines.slice(-5),
						});
					}

					// Trip circuit breaker after MAX_SPAWN_FAILURES consecutive failures
					if (circuitBreaker.spawnFailCount >= MAX_SPAWN_FAILURES) {
						circuitBreaker.spawnFailed = true;
						logger.error("Daemon spawn circuit breaker tripped after repeated failures", {
							failCount: circuitBreaker.spawnFailCount,
							lastError: errorMsg,
							daemonLogSample: recentErrors.length > 0 ? recentErrors : daemonLogLines.slice(-5),
						});
					}

					cleanupSpawnState();
					resolve(false);
				});

				// Poll for daemon readiness
				let pollInterval = 200;
				let pollCount = 0;
				const checkDaemon = async () => {
					if (resolved) {
						return;
					}

					const elapsed = Date.now() - startTime;
					pollCount++;

					if (elapsed > DAEMON_START_TIMEOUT_MS) {
						if (resolved) {
							return;
						}
						resolved = true;

						// Track timeout as spawn failure
						circuitBreaker.spawnFailCount++;
						circuitBreaker.lastError = "Daemon spawn timed out";
						if (circuitBreaker.spawnFailCount >= MAX_SPAWN_FAILURES) {
							circuitBreaker.spawnFailed = true;
							logger.error("Daemon spawn circuit breaker tripped after repeated timeouts", {
								failCount: circuitBreaker.spawnFailCount,
							});
						}

						// Read daemon log to surface crash reason
						const daemonLogLines = readDaemonLogLines(20);
						const recentErrors = daemonLogLines.filter(
							(line) => line.toLowerCase().includes("error") || line.toLowerCase().includes("failed"),
						);

						cleanupSpawnState();
						logger.warn("[DAEMON] Spawn polling timed out", {
							elapsedMs: elapsed,
							pollCount,
							socketPath: getSocketPath(),
							socketExists: existsSync(getSocketPath()),
							pid: child.pid,
							failCount: circuitBreaker.spawnFailCount,
							daemonLogSample: recentErrors.length > 0 ? recentErrors : daemonLogLines.slice(-5),
						});
						resolve(false);
						return;
					}

					const socketPath = getSocketPath();
					if (existsSync(socketPath)) {
						// Restrict socket to owner-only access (0600) on Unix
						if (process.platform !== "win32") {
							try {
								chmodSync(socketPath, 0o600);
							} catch {
								// Non-fatal  -  daemon may have already restricted it
							}
						}
						logger.debug("[DAEMON] Socket file detected, verifying...", {
							elapsedMs: elapsed,
							pollCount,
							socketPath,
						});
						// Socket exists - optionally verify with ping
						if (verifyCallback) {
							try {
								const healthy = await verifyCallback();
								if (!healthy) {
									// Socket exists but ping failed - keep polling
									logger.debug("[DAEMON] Socket exists but ping failed, continuing to poll", {
										elapsedMs: elapsed,
										pollCount,
									});
									pollInterval = Math.min(pollInterval * 1.5, 1000);
									setTimeout(checkDaemon, pollInterval);
									return;
								}
							} catch (pingErr) {
								// Ping failed - keep polling
								logger.debug("[DAEMON] Ping threw error, continuing to poll", {
									elapsedMs: elapsed,
									pollCount,
									error: pingErr instanceof Error ? pingErr.message : String(pingErr),
								});
								pollInterval = Math.min(pollInterval * 1.5, 1000);
								setTimeout(checkDaemon, pollInterval);
								return;
							}
						}

						if (resolved) {
							return;
						}
						resolved = true;
						// Reset shared spawn state on successful spawn (cross-window coordination)
						spawnStateManager.reset();
						// Reset spawn fail tracking on success
						circuitBreaker.spawnFailCount = 0;
						circuitBreaker.spawnFailed = false;
						cleanupSpawnState();
						logger.info("[DAEMON] Spawn successful - daemon ready", {
							elapsedMs: elapsed,
							pollCount,
							socketPath,
							pid: child.pid,
						});
						resolve(true);
						return;
					}

					// Log every 5th poll attempt to avoid noise
					if (pollCount % 5 === 0) {
						logger.debug("[DAEMON] Waiting for socket...", {
							elapsedMs: elapsed,
							pollCount,
							socketPath,
						});
					}

					pollInterval = Math.min(pollInterval * 1.5, 1000);
					setTimeout(checkDaemon, pollInterval);
				};

				setTimeout(checkDaemon, DAEMON_START_WAIT_MS);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				if (errorMsg.includes("ENOENT")) {
					circuitBreaker.cliNotFound = true;
					circuitBreaker.lastError = errorMsg;
				}
				cleanupSpawnState();
				resolve(false);
			}
		});
	}

	/**
	 * Kill daemon process
	 */
	async killDaemon(): Promise<void> {
		const pid = this.getDaemonPID();
		if (pid) {
			try {
				process.kill(pid, "SIGTERM");
				await new Promise((resolve) => setTimeout(resolve, 200));
			} catch (error) {
				logger.debug("Failed to kill daemon process", { error: String(error) });
			}
		}

		// Clean up stale socket file
		try {
			const socketPath = getSocketPath();
			if (existsSync(socketPath)) {
				unlinkSync(socketPath);
			}
		} catch (error) {
			logger.debug("Failed to cleanup socket file", { error: String(error) });
		}
	}

	/**
	 * Dispose resources
	 * Idempotent - safe to call multiple times
	 */
	dispose(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		// Reset spawn state
		this.isStartingDaemon = false;
		this.daemonSpawnAttempts = 0;
	}
}
