/**
 * ConnectionManager Tests
 *
 * Comprehensive test suite for ConnectionManager covering:
 * - Daemon running detection
 * - PID retrieval
 * - Auto-start daemon with spawn logic
 * - Reconnection with exponential backoff
 * - Circuit breaker pattern
 * - Kill daemon functionality
 * - Error handling
 *
 * @module daemon-bridge/__tests__/ConnectionManager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOCKET_FILENAME } from "@vreko/local-service-client";
import * as fs from "node:fs";
import * as childProcess from "node:child_process";
import * as os from "node:os";
import {
	ConnectionManager,
	circuitBreaker,
	getCliPath,
	getDaemonLogPath,
	getPidPath,
	getSocketPath,
	readDaemonLogLines,
	resetCircuitBreaker,
	spawnStateManager,
} from "../../../src/services/daemon-bridge/ConnectionManager";

// Mock node modules
vi.mock("node:fs", () => ({
	existsSync: vi.fn().mockReturnValue(false),
	readFileSync: vi.fn().mockReturnValue("12345"),
	unlinkSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

vi.mock("node:os", () => ({
	homedir: vi.fn().mockReturnValue("/home/testuser"),
	platform: vi.fn().mockReturnValue("darwin"),
}));

// Mock vscode
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/workspace/test" } }],
	},
}));

// Mock logger
vi.mock("../../../utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("ConnectionManager", () => {
	let manager: ConnectionManager;

	beforeEach(() => {
		// Reset mock return values
		(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("12345");
		(os.homedir as ReturnType<typeof vi.fn>).mockReturnValue("/home/testuser");
		(os.platform as ReturnType<typeof vi.fn>).mockReturnValue("darwin");

		manager = new ConnectionManager();
		resetCircuitBreaker();
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		manager.dispose();
	});

	describe("utility functions", () => {
		describe("getSocketPath", () => {
			it("should return Unix socket path on non-Windows", () => {
				(os.platform as ReturnType<typeof vi.fn>).mockReturnValue("darwin");

				const path = getSocketPath();
				expect(path).toContain(SOCKET_FILENAME);
				expect(path).not.toContain("pipe");
			});

			it("should return named pipe on Windows", () => {
				(os.platform as ReturnType<typeof vi.fn>).mockReturnValue("win32");

				const path = getSocketPath();
				expect(path).toContain("pipe");
			});
		});

		describe("getPidPath", () => {
			it("should return PID file path in .vreko directory", () => {
				const path = getPidPath();
				expect(path).toContain(".vreko");
				expect(path).toContain("service.pid");
			});
		});

		describe("getDaemonLogPath", () => {
			it("should return daemon log file path", () => {
				const path = getDaemonLogPath();
				expect(path).toContain(".vreko");
				expect(path).toContain("daemon");
				expect(path).toContain("daemon.log");
			});
		});

		describe("readDaemonLogLines", () => {
			it("should return empty array when log file does not exist", () => {
				(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

				const lines = readDaemonLogLines(10);
				expect(lines).toEqual([]);
			});

			it("should return last N lines from log file", () => {
				(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
				(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("line1\nline2\nline3\nline4\nline5\n");

				const lines = readDaemonLogLines(3);
				expect(lines).toEqual(["line3", "line4", "line5"]);
			});

			it("should return empty array on read error", () => {
				(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
				(fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
					throw new Error("Permission denied");
				});

				const lines = readDaemonLogLines(10);
				expect(lines).toEqual([]);
			});

			it("should filter empty lines", () => {
				(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
				(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("line1\n\nline2\n   \nline3");

				const lines = readDaemonLogLines(10);
				expect(lines).toEqual(["line1", "line2", "line3"]);
			});
		});

		describe("getCliPath", () => {
			it("should return local CLI path when available", () => {
				(fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) =>
					path.includes("apps/cli/dist/index.js"),
				);

				const path = getCliPath();
				expect(path).toContain("apps/cli/dist/index.js");
			});

			it("should return local-service path when CLI not available", () => {
				(fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) =>
					path.includes("local-service/dist/main.js"),
				);

				const path = getCliPath();
				expect(path).toContain("local-service/dist/main.js");
			});

			it("should return fallback command when nothing found", () => {
				(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

				const path = getCliPath();
				expect(path).toBe("vreko");
			});

			it("should return null on error", () => {
				(fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
					throw new Error("FS error");
				});

				const path = getCliPath();
				expect(path).toBeNull();
			});
		});

		describe("resetCircuitBreaker", () => {
			it("should reset circuit breaker state", () => {
				circuitBreaker.cliNotFound = true;
				circuitBreaker.lastError = "test error";
				circuitBreaker.notificationShown = true;

				resetCircuitBreaker();

				expect(circuitBreaker.cliNotFound).toBe(false);
				expect(circuitBreaker.lastError).toBeNull();
				expect(circuitBreaker.notificationShown).toBe(false);
			});
		});
	});

	describe("isDaemonRunning", () => {
		it("should return false when PID file does not exist", () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

			expect(manager.isDaemonRunning()).toBe(false);
		});

		it("should return false when PID file has invalid content", () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("invalid");

			expect(manager.isDaemonRunning()).toBe(false);
		});

		it("should return true when process is running", () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("12345");

			// process.kill with signal 0 checks if process exists
			const originalKill = process.kill;
			process.kill = vi.fn().mockReturnValue(true) as any;

			expect(manager.isDaemonRunning()).toBe(true);

			process.kill = originalKill;
		});

		it("should return false when process is not running", () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("12345");

			const originalKill = process.kill;
			process.kill = vi.fn().mockImplementation(() => {
				throw new Error("ESRCH");
			}) as any;

			expect(manager.isDaemonRunning()).toBe(false);

			process.kill = originalKill;
		});
	});

	describe("getDaemonPID", () => {
		it("should return PID when file exists and valid", () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("12345");

			expect(manager.getDaemonPID()).toBe(12345);
		});

		it("should return null when PID file does not exist", () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

			expect(manager.getDaemonPID()).toBeNull();
		});

		it("should return null when PID is invalid", () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("invalid");

			expect(manager.getDaemonPID()).toBeNull();
		});

		it("should return null on error", () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error("FS error");
			});

			expect(manager.getDaemonPID()).toBeNull();
		});
	});

	describe("getDaemonSpawnStatus", () => {
		it("should return initial status", () => {
			const status = manager.getDaemonSpawnStatus();

			expect(status).toHaveProperty("attempts");
			expect(status).toHaveProperty("maxAttempts");
			expect(status).toHaveProperty("isSpawning");
			expect(status).toHaveProperty("cooldownRemaining");
			expect(status).toHaveProperty("exhausted");
		});

		it("should show exhausted when max attempts reached", async () => {
			const mockChild = {
				unref: vi.fn(),
				pid: 12345,
				on: vi.fn(),
				stderr: null,
			};
			(childProcess.spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

			// Attempt to spawn multiple times - use spawnStateManager mock
			vi.spyOn(spawnStateManager, "getAttempts").mockReturnValue(3);

			const status = manager.getDaemonSpawnStatus();
			expect(status.exhausted).toBe(true);
		});
	});

	describe("resetDaemonSpawnAttempts", () => {
		it("should reset spawn attempts", () => {
			const resetSpy = vi.spyOn(spawnStateManager, "reset").mockImplementation(() => {
				// After reset, getAttempts should return 0
				vi.spyOn(spawnStateManager, "getAttempts").mockReturnValue(0);
				vi.spyOn(spawnStateManager, "getLastAttempt").mockReturnValue(null);
			});

			manager.resetDaemonSpawnAttempts();

			expect(resetSpy).toHaveBeenCalled();
			expect(manager.getDaemonSpawnStatus().attempts).toBe(0);
			expect(manager.getDaemonSpawnStatus().cooldownRemaining).toBe(0);
		});
	});

	describe("reconnection logic", () => {
		describe("getReconnectAttempt", () => {
			it("should return current attempt count", () => {
				expect(manager.getReconnectAttempt()).toBe(0);
			});
		});

		describe("getMaxReconnectAttempts", () => {
			it("should return max attempts from config", () => {
				expect(manager.getMaxReconnectAttempts()).toBe(5);
			});

			it("should return custom max attempts", () => {
				const customManager = new ConnectionManager({ maxReconnectAttempts: 10 });
				expect(customManager.getMaxReconnectAttempts()).toBe(10);
			});
		});

		describe("getNextReconnectDelay", () => {
			it("should return delay with exponential backoff", () => {
				const delay1 = manager["getNextReconnectDelay"]();
				expect(delay1).toBeGreaterThan(0);

				manager["reconnectDelay"] = delay1;
				const delay2 = manager["getNextReconnectDelay"]();
				expect(delay2).toBeGreaterThanOrEqual(delay1);
			});

			it("should cap delay at maximum", () => {
				manager["reconnectDelay"] = 60000;
				const delay = manager["getNextReconnectDelay"]();
				expect(delay).toBeLessThanOrEqual(30000);
			});
		});

		describe("incrementReconnectAttempt", () => {
			it("should increment attempt counter", () => {
				manager["incrementReconnectAttempt"]();
				expect(manager.getReconnectAttempt()).toBe(1);
			});

			it("should increase delay exponentially", () => {
				const initialDelay = manager["reconnectDelay"];
				manager["incrementReconnectAttempt"]();
				expect(manager["reconnectDelay"]).toBeGreaterThan(initialDelay);
			});
		});

		describe("resetReconnectState", () => {
			it("should reset attempt counter", () => {
				manager["incrementReconnectAttempt"]();
				manager["resetReconnectState"]();
				expect(manager.getReconnectAttempt()).toBe(0);
			});

			it("should reset delay to minimum", () => {
				manager["reconnectDelay"] = 30000;
				manager["resetReconnectState"]();
				expect(manager["reconnectDelay"]).toBe(1000);
			});

			it("should clear reconnect timer", () => {
				manager["reconnectTimer"] = setTimeout(() => { /* intentionally empty */ }, 1000);
				manager["resetReconnectState"]();
				expect(manager["reconnectTimer"]).toBeNull();
			});
		});

		describe("scheduleReconnect", () => {
			it("should schedule reconnect callback", () => {
				const callback = vi.fn();
				manager["scheduleReconnect"](callback);

				expect(manager.getReconnectAttempt()).toBe(1);
			});

			it("should not schedule if timer already exists", () => {
				const callback = vi.fn();
				manager["scheduleReconnect"](callback);
				const attemptCount = manager.getReconnectAttempt();

				manager["scheduleReconnect"](callback);
				expect(manager.getReconnectAttempt()).toBe(attemptCount);
			});

			// REGRESSION TEST: BUG-2 - scheduleReconnect permanent halt on max attempts
			// Previously: bare return with no retry, leaving reconnect permanently dead
			// Fixed: 60s long-retry timer that resets state and fires callback
			describe("long-retry on max attempts (BUG-2 regression)", () => {
				it("should schedule long-delay retry when max attempts exceeded", () => {
					const callback = vi.fn();
					// Set reconnectAttempts above max (default 5)
					manager["reconnectAttempts"] = 6;

					manager["scheduleReconnect"](callback);

					// Should have scheduled a timer (not a bare return)
					expect(manager["reconnectTimer"]).not.toBeNull();
				});

				it("should fire callback after LONG_RETRY_DELAY_MS (60s)", async () => {
					const callback = vi.fn();
					manager["reconnectAttempts"] = 6;

					manager["scheduleReconnect"](callback);

					// Callback should NOT fire immediately
					expect(callback).not.toHaveBeenCalled();

					// Advance time by 59s - still not fired
					vi.advanceTimersByTime(59_000);
					expect(callback).not.toHaveBeenCalled();

					// Advance past 60s threshold
					vi.advanceTimersByTime(2_000);
					expect(callback).toHaveBeenCalledTimes(1);
				});

				it("should reset reconnectAttempts to 0 after long-retry fires", async () => {
					const callback = vi.fn();
					manager["reconnectAttempts"] = 6;

					manager["scheduleReconnect"](callback);

					// Before timer fires
					expect(manager["reconnectAttempts"]).toBe(7); // incremented by scheduleReconnect

					// Advance past 60s
					vi.advanceTimersByTime(61_000);

					// After timer fires
					expect(manager["reconnectAttempts"]).toBe(0);
				});

				it("should reset reconnectDelay to MIN_RECONNECT_INTERVAL_MS after long-retry", async () => {
					const callback = vi.fn();
					manager["reconnectAttempts"] = 6;
					manager["reconnectDelay"] = 30_000; // Elevated delay

					manager["scheduleReconnect"](callback);

					// Advance past 60s
					vi.advanceTimersByTime(61_000);

					// Delay should be reset to minimum
					expect(manager["reconnectDelay"]).toBe(1000);
				});

				it("should call spawnStateManager.reset() before callback on long-retry", async () => {
					const callback = vi.fn();
					const resetSpy = vi.spyOn(spawnStateManager, "reset");
					manager["reconnectAttempts"] = 6;

					manager["scheduleReconnect"](callback);

					// Advance past 60s
					vi.advanceTimersByTime(61_000);

					// spawnStateManager.reset should be called before callback
					expect(resetSpy).toHaveBeenCalled();
					expect(callback).toHaveBeenCalled();
				});

				it("should clear reconnectTimer after long-retry fires", async () => {
					const callback = vi.fn();
					manager["reconnectAttempts"] = 6;

					manager["scheduleReconnect"](callback);
					expect(manager["reconnectTimer"]).not.toBeNull();

					// Advance past 60s
					vi.advanceTimersByTime(61_000);

					// Timer should be cleared
					expect(manager["reconnectTimer"]).toBeNull();
				});
			});
		});
	});

	describe("autoStartDaemon", () => {
		it("should return true if daemon already running", async () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("12345");

			const originalKill = process.kill;
			process.kill = vi.fn().mockReturnValue(true) as any;

			const result = await manager.autoStartDaemon();
			expect(result).toBe(true);

			process.kill = originalKill;
		});

		it("should return false if already spawning", async () => {
			manager["isStartingDaemon"] = true;

			const result = await manager.autoStartDaemon();
			expect(result).toBe(false);
		});

		it("should return false if max spawn attempts reached", async () => {
			vi.spyOn(spawnStateManager, "getAttempts").mockReturnValue(3);

			const result = await manager.autoStartDaemon();
			expect(result).toBe(false);
		});

		it("should return false if cooldown active", async () => {
			vi.spyOn(spawnStateManager, "getLastAttempt").mockReturnValue(Date.now());

			const result = await manager.autoStartDaemon();
			expect(result).toBe(false);
		});

		it("should return false if circuit breaker active", async () => {
			circuitBreaker.cliNotFound = true;

			const result = await manager.autoStartDaemon();
			expect(result).toBe(false);
		});

		it("should return false if CLI not found", async () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

			const result = await manager.autoStartDaemon();
			expect(result).toBe(false);
		});

		it("should spawn daemon successfully", async () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
				return path.includes(SOCKET_FILENAME) || path.includes("index.js");
			});

			const mockChild = {
				unref: vi.fn(),
				pid: 12345,
				on: vi.fn((event: string, handler: Function) => {
					if (event === "error") {
						// Don't trigger error
					}
				}),
				stderr: null,
			};
			(childProcess.spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

			const resultPromise = manager.autoStartDaemon();

			// Fast-forward past the wait time
			vi.advanceTimersByTime(3000);

			const result = await resultPromise;
			expect(childProcess.spawn).toHaveBeenCalled();
		});

		it("should handle spawn error with ENOENT", async () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

			const mockChild = {
				unref: vi.fn(),
				pid: 12345,
				on: vi.fn((event: string, handler: Function) => {
					if (event === "error") {
						const err = new Error("spawn vreko ENOENT") as NodeJS.ErrnoException;
						err.code = "ENOENT";
						setTimeout(() => handler(err), 0);
					}
				}),
				stderr: null,
			};
			(childProcess.spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

			const result = await manager.autoStartDaemon();
			expect(result).toBe(false);
			expect(circuitBreaker.cliNotFound).toBe(true);
		});

		it("should handle spawn timeout", async () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

			const mockChild = {
				unref: vi.fn(),
				pid: 12345,
				on: vi.fn(),
				stderr: null,
			};
			(childProcess.spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockChild);

			const resultPromise = manager.autoStartDaemon();

			// Fast-forward past timeout
			vi.advanceTimersByTime(35000);

			const result = await resultPromise;
			expect(result).toBe(false);
		});
	});

	describe("killDaemon", () => {
		it("should kill daemon process", async () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("12345");

			const originalKill = process.kill;
			process.kill = vi.fn().mockReturnValue(true) as any;

			await manager.killDaemon();

			expect(process.kill).toHaveBeenCalledWith(12345, "SIGTERM");

			process.kill = originalKill;
		});

		it("should clean up socket file", async () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

			const originalKill = process.kill;
			process.kill = vi.fn().mockReturnValue(true) as any;

			await manager.killDaemon();

			expect(fs.unlinkSync).toHaveBeenCalled();

			process.kill = originalKill;
		});

		it("should handle errors gracefully", async () => {
			(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

			const originalKill = process.kill;
			process.kill = vi.fn().mockImplementation(() => {
				throw new Error("Kill failed");
			}) as any;

			// Should not throw
			await expect(manager.killDaemon()).resolves.not.toThrow();

			process.kill = originalKill;
		});
	});

	describe("dispose", () => {
		it("should clear reconnect timer", () => {
			manager["reconnectTimer"] = setTimeout(() => { /* intentionally empty */ }, 1000);
			manager.dispose();
			expect(manager["reconnectTimer"]).toBeNull();
		});

		it("should be safe to call multiple times", () => {
			expect(() => {
				manager.dispose();
				manager.dispose();
			}).not.toThrow();
		});
	});

	describe("configuration", () => {
		it("should use default config when not provided", () => {
			const defaultManager = new ConnectionManager();
			expect(defaultManager.getMaxReconnectAttempts()).toBe(5);
		});

		it("should use custom maxReconnectAttempts", () => {
			const customManager = new ConnectionManager({ maxReconnectAttempts: 10 });
			expect(customManager.getMaxReconnectAttempts()).toBe(10);
		});

		it("should use custom maxDaemonSpawnAttempts", () => {
			const customManager = new ConnectionManager({ maxDaemonSpawnAttempts: 5 });
			expect(customManager["maxDaemonSpawnAttempts"]).toBe(5);
		});

		it("should use custom daemonSpawnCooldown", () => {
			const customManager = new ConnectionManager({ daemonSpawnCooldown: 20000 });
			expect(customManager["daemonSpawnCooldown"]).toBe(20000);
		});
	});
});
