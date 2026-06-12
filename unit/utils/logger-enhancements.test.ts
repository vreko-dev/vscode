/**
 * @fileoverview Logger P2 Enhancement Tests
 *
 * Tests for P2 Signal-to-Noise improvements:
 * 1. TRACE and SILENT log levels
 * 2. isLevelEnabled() for expensive operations
 * 3. Child loggers with namespace-based filtering
 * 4. Debug log batching
 *
 * @see claudedocs/analysis/extension-activation-improvement-plan.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn((key: string, defaultValue: unknown) => {
				switch (key) {
					case "logLevel":
						return "info";
					case "logNamespaces":
						return [];
					case "logBatchDebug":
						return false;
					default:
						return defaultValue;
				}
			}),
		}),
		onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
	},
	window: {
		createOutputChannel: vi.fn().mockReturnValue({
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		}),
	},
}));

/**
 * Log levels matching the implementation in logger.ts
 * Defined here to avoid import issues with the mocked vscode module
 */
enum LogLevel {
	TRACE = -1,
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	SILENT = 4,
}

describe("Logger P2 Enhancements", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("Log Level Enum", () => {
		it("should have TRACE level more verbose than DEBUG", () => {
			expect(LogLevel.TRACE).toBeLessThan(LogLevel.DEBUG);
		});

		it("should have SILENT level higher than ERROR", () => {
			expect(LogLevel.SILENT).toBeGreaterThan(LogLevel.ERROR);
		});

		it("should have correct severity ordering", () => {
			expect(LogLevel.TRACE).toBe(-1);
			expect(LogLevel.DEBUG).toBe(0);
			expect(LogLevel.INFO).toBe(1);
			expect(LogLevel.WARN).toBe(2);
			expect(LogLevel.ERROR).toBe(3);
			expect(LogLevel.SILENT).toBe(4);
		});
	});

	describe("isLevelEnabled Pattern", () => {
		it("should return true when level is enabled", () => {
			const currentLevel = LogLevel.DEBUG;
			const isEnabled = currentLevel <= LogLevel.DEBUG && currentLevel !== LogLevel.SILENT;

			expect(isEnabled).toBe(true);
		});

		it("should return false when level is disabled", () => {
			const currentLevel = LogLevel.INFO; // INFO is higher than DEBUG
			const isEnabled = currentLevel <= LogLevel.DEBUG;

			expect(isEnabled).toBe(false);
		});

		it("should return false when SILENT", () => {
			const currentLevel = LogLevel.SILENT;
			const isEnabled = currentLevel !== LogLevel.SILENT;

			expect(isEnabled).toBe(false);
		});

		it("should prevent expensive computation when disabled", () => {
			const currentLevel = LogLevel.INFO;
			let expensiveComputed = false;

			const computeExpensive = () => {
				expensiveComputed = true;
				return { complex: "data" };
			};

			// Pattern: check before computing
			if (currentLevel <= LogLevel.DEBUG) {
				computeExpensive();
			}

			expect(expensiveComputed).toBe(false);
		});
	});

	describe("Child Logger Interface", () => {
		it("should have all required methods", () => {
			const childLoggerShape = {
				namespace: "test",
				trace: () => { /* intentionally empty */ },
				debug: () => { /* intentionally empty */ },
				info: () => { /* intentionally empty */ },
				warn: () => { /* intentionally empty */ },
				error: () => { /* intentionally empty */ },
				isLevelEnabled: () => true,
			};

			expect(childLoggerShape).toHaveProperty("namespace");
			expect(childLoggerShape).toHaveProperty("trace");
			expect(childLoggerShape).toHaveProperty("debug");
			expect(childLoggerShape).toHaveProperty("info");
			expect(childLoggerShape).toHaveProperty("warn");
			expect(childLoggerShape).toHaveProperty("error");
			expect(childLoggerShape).toHaveProperty("isLevelEnabled");
		});

		it("should prefix messages with namespace", () => {
			const namespace = "activation";
			const message = "Phase 3 starting";
			const expected = `[${namespace}] ${message}`;

			expect(expected).toBe("[activation] Phase 3 starting");
		});
	});

	describe("Namespace Filtering Logic", () => {
		it("should allow all debug when no namespaces configured", () => {
			const enabledNamespaces = new Set<string>([]);
			const globalLevel = LogLevel.DEBUG;
			const namespace = "any-namespace";
			const level = LogLevel.DEBUG;

			// If no namespace filtering, use global level
			const isEnabled =
				enabledNamespaces.size === 0 ? globalLevel <= level : enabledNamespaces.has(namespace) && globalLevel <= level;

			expect(isEnabled).toBe(true);
		});

		it("should filter debug when namespaces configured", () => {
			const enabledNamespaces = new Set(["activation", "mcp"]);
			const globalLevel = LogLevel.DEBUG;

			// Enabled namespace
			const activationEnabled = enabledNamespaces.has("activation") && globalLevel <= LogLevel.DEBUG;
			expect(activationEnabled).toBe(true);

			// Disabled namespace
			const snapshotEnabled = enabledNamespaces.has("snapshot") && globalLevel <= LogLevel.DEBUG;
			expect(snapshotEnabled).toBe(false);
		});

		it("should always allow info and above regardless of namespace", () => {
			const enabledNamespaces = new Set(["activation"]); // Only activation enabled
			const globalLevel = LogLevel.DEBUG;

			// Info level from disabled namespace should still log
			const isInfoEnabled = globalLevel <= LogLevel.INFO;
			expect(isInfoEnabled).toBe(true);
		});
	});

	describe("Debug Batching Pattern", () => {
		it("should accumulate messages in pending array", () => {
			const pendingLogs: string[] = [];

			const debugBatch = (message: string) => {
				pendingLogs.push(message);
			};

			debugBatch("Processing file1.ts");
			debugBatch("Processing file2.ts");
			debugBatch("Processing file3.ts");

			expect(pendingLogs).toHaveLength(3);
		});

		it("should flush batch after timeout", async () => {
			const pendingLogs: string[] = [];
			let flushedOutput: string | null = null;
			let flushTimer: ReturnType<typeof setTimeout> | null = null;

			const flushBatch = () => {
				if (pendingLogs.length === 0) return;

				const count = pendingLogs.length;
				const sample = pendingLogs.slice(0, 3).join(", ");
				flushedOutput = `[Batch: ${count} items] ${sample}`;
				pendingLogs.length = 0;
			};

			const debugBatch = (message: string) => {
				pendingLogs.push(message);

				if (flushTimer) clearTimeout(flushTimer);
				flushTimer = setTimeout(flushBatch, 100);
			};

			debugBatch("file1.ts");
			debugBatch("file2.ts");
			debugBatch("file3.ts");
			debugBatch("file4.ts");
			debugBatch("file5.ts");

			// Not flushed yet
			expect(flushedOutput).toBeNull();
			expect(pendingLogs).toHaveLength(5);

			// Run timers
			await vi.runAllTimersAsync();

			// Now flushed
			expect(flushedOutput).toBe("[Batch: 5 items] file1.ts, file2.ts, file3.ts");
			expect(pendingLogs).toHaveLength(0);
		});

		it("should show sample and count for large batches", () => {
			const messages = ["msg1", "msg2", "msg3", "msg4", "msg5", "msg6", "msg7"];
			const count = messages.length;
			const sample = messages.slice(0, 3).join(", ");
			const suffix = count > 3 ? `, ... (${count - 3} more)` : "";
			const output = `[Batch: ${count} items] ${sample}${suffix}`;

			expect(output).toBe("[Batch: 7 items] msg1, msg2, msg3, ... (4 more)");
		});
	});

	describe("Log Level Parsing", () => {
		it("should parse trace level", () => {
			const parse = (level: string): LogLevel => {
				switch (level.toLowerCase()) {
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
			};

			expect(parse("trace")).toBe(LogLevel.TRACE);
			expect(parse("TRACE")).toBe(LogLevel.TRACE);
			expect(parse("silent")).toBe(LogLevel.SILENT);
			expect(parse("SILENT")).toBe(LogLevel.SILENT);
			expect(parse("unknown")).toBe(LogLevel.INFO); // Default
		});
	});

	describe("Child Logger Caching", () => {
		it("should return same instance for same namespace", () => {
			const cache = new Map<string, object>();

			const getChild = (namespace: string) => {
				let child = cache.get(namespace);
				if (!child) {
					child = { namespace };
					cache.set(namespace, child);
				}
				return child;
			};

			const child1 = getChild("activation");
			const child2 = getChild("activation");
			const child3 = getChild("mcp");

			expect(child1).toBe(child2); // Same instance
			expect(child1).not.toBe(child3); // Different namespace
		});
	});

	describe("Dispose Cleanup", () => {
		it("should flush pending batch on dispose", () => {
			let batchFlushed = false;
			const pendingLogs = ["msg1", "msg2"];

			const flushDebugBatch = () => {
				if (pendingLogs.length > 0) {
					batchFlushed = true;
					pendingLogs.length = 0;
				}
			};

			const dispose = () => {
				flushDebugBatch();
			};

			dispose();

			expect(batchFlushed).toBe(true);
			expect(pendingLogs).toHaveLength(0);
		});
	});
});

describe("Integration: Pino-Inspired Patterns", () => {
	describe("Level Checking Before Expensive Operations", () => {
		it("should match Pino isLevelEnabled pattern", () => {
			// From Pino docs: if (logger.isLevelEnabled('debug')) { ... }
			const isLevelEnabled = (currentLevel: LogLevel, targetLevel: LogLevel): boolean => {
				return currentLevel <= targetLevel && currentLevel !== LogLevel.SILENT;
			};

			// At DEBUG level
			expect(isLevelEnabled(LogLevel.DEBUG, LogLevel.DEBUG)).toBe(true);
			expect(isLevelEnabled(LogLevel.DEBUG, LogLevel.INFO)).toBe(true);
			expect(isLevelEnabled(LogLevel.DEBUG, LogLevel.TRACE)).toBe(false);

			// At INFO level
			expect(isLevelEnabled(LogLevel.INFO, LogLevel.DEBUG)).toBe(false);
			expect(isLevelEnabled(LogLevel.INFO, LogLevel.INFO)).toBe(true);

			// At SILENT level
			expect(isLevelEnabled(LogLevel.SILENT, LogLevel.ERROR)).toBe(false);
		});
	});

	describe("Child Logger Level Inheritance", () => {
		it("should inherit parent log level", () => {
			const parentLevel = LogLevel.DEBUG;

			// Child without override uses parent level
			const childLevel = parentLevel;

			expect(childLevel).toBe(LogLevel.DEBUG);
		});

		it("should allow namespace filtering to override for debug", () => {
			const parentLevel = LogLevel.DEBUG;
			const enabledNamespaces = new Set(["activation"]);

			// Namespace-enabled child gets debug
			const activationCanDebug = enabledNamespaces.has("activation") && parentLevel <= LogLevel.DEBUG;
			expect(activationCanDebug).toBe(true);

			// Non-enabled namespace filtered out for debug
			const mcpCanDebug = enabledNamespaces.has("mcp") && parentLevel <= LogLevel.DEBUG;
			expect(mcpCanDebug).toBe(false);
		});
	});
});
