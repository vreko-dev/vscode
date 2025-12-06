import { beforeEach, describe, expect, it, vi } from "vitest";
import { Logger, LogLevel } from "../../src/utils/logger";

// Mock VS Code API
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((_key: string, defaultValue: any) => defaultValue),
		})),
		onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
	},
	window: {
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		})),
	},
}));

describe("Logger", () => {
	let mockOutputChannel: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockOutputChannel = {
			appendLine: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		};
		(Logger as any).instance = undefined;
	});

	describe("Singleton Pattern", () => {
		it("should create singleton instance", () => {
			const instance1 = Logger.getInstance(mockOutputChannel as any);
			const instance2 = Logger.getInstance();

			expect(instance1).toBe(instance2);
		});

		it("should throw error if getInstance called without outputChannel before initialization", () => {
			// Force reset singleton (not normally done, but needed for test)
			(Logger as any).instance = undefined;

			expect(() => Logger.getInstance()).toThrow(
				"Logger not initialized. Call getInstance with outputChannel first.",
			);
		});
	});

	describe("Log Levels", () => {
		it("should log debug messages when level is DEBUG", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.DEBUG;

			logger.debug("Test debug message", { data: "test" });

			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				expect.stringContaining("[DEBUG] Test debug message"),
			);
		});

		it("should log info messages when level is INFO", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.INFO;

			logger.info("Test info message", { data: "test" });

			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				expect.stringContaining("[INFO] Test info message"),
			);
		});

		it("should log warn messages when level is WARN", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.WARN;

			logger.warn("Test warn message", { data: "test" });

			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				expect.stringContaining("[WARN] Test warn message"),
			);
		});

		it("should log error messages when level is ERROR", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.ERROR;

			const error = new Error("Test error");
			logger.error("Test error message", error, { data: "test" });

			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				expect.stringContaining("[ERROR] Test error message"),
			);
		});

		it("should not log debug when level is INFO", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.INFO;

			mockOutputChannel.appendLine.mockClear();
			logger.debug("Should not appear");

			expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
		});

		it("should not log info when level is WARN", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.WARN;

			mockOutputChannel.appendLine.mockClear();
			logger.info("Should not appear");

			expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
		});

		it("should not log warn when level is ERROR", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.ERROR;

			mockOutputChannel.appendLine.mockClear();
			logger.warn("Should not appear");

			expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
		});
	});

	describe("Structured Logging", () => {
		it("should serialize objects to JSON", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.INFO;

			logger.info("Test message", {
				key: "value",
				nested: { data: 123 },
			});

			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				expect.stringContaining('"key": "value"'),
			);
		});

		it("should handle null and undefined", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.INFO;

			logger.info("Test message", null, undefined);

			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				expect.stringContaining("null"),
			);
		});

		it("should handle Error objects", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.ERROR;

			const error = new Error("Test error message");
			error.stack = "Error: Test error message\n    at test.ts:1:1";

			logger.error("Operation failed", error);

			const call = mockOutputChannel.appendLine.mock.calls[0][0];
			expect(call).toContain("[ERROR] Operation failed");
			expect(call).toContain('"name": "Error"');
			expect(call).toContain('"message": "Test error message"');
		});

		it("should handle arrays", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.INFO;

			logger.info("Test message", [1, 2, 3]);

			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
				expect.stringContaining("["),
			);
		});
	});

	describe("Timestamp Formatting", () => {
		it("should include ISO timestamp in log messages", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			(logger as any).logLevel = LogLevel.INFO;

			logger.info("Test message");

			const call = mockOutputChannel.appendLine.mock.calls[0][0];
			// Check for ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
			expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
		});
	});

	describe("Utility Methods", () => {
		it("should show output channel", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);

			logger.show();

			expect(mockOutputChannel.show).toHaveBeenCalledWith(true);
		});

		it("should dispose output channel", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);

			logger.dispose();

			expect(mockOutputChannel.dispose).toHaveBeenCalled();
		});
	});

	describe("Log Level Parsing", () => {
		it('should parse "debug" to LogLevel.DEBUG', () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			const level = (logger as any).parseLogLevel("debug");

			expect(level).toBe(LogLevel.DEBUG);
		});

		it('should parse "info" to LogLevel.INFO', () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			const level = (logger as any).parseLogLevel("info");

			expect(level).toBe(LogLevel.INFO);
		});

		it('should parse "warn" to LogLevel.WARN', () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			const level = (logger as any).parseLogLevel("warn");

			expect(level).toBe(LogLevel.WARN);
		});

		it('should parse "error" to LogLevel.ERROR', () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			const level = (logger as any).parseLogLevel("error");

			expect(level).toBe(LogLevel.ERROR);
		});

		it("should default to INFO for unknown levels", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);
			const level = (logger as any).parseLogLevel("unknown");

			expect(level).toBe(LogLevel.INFO);
		});

		it("should be case insensitive", () => {
			const logger = Logger.getInstance(mockOutputChannel as any);

			expect((logger as any).parseLogLevel("DEBUG")).toBe(LogLevel.DEBUG);
			expect((logger as any).parseLogLevel("Info")).toBe(LogLevel.INFO);
			expect((logger as any).parseLogLevel("WARN")).toBe(LogLevel.WARN);
		});
	});
});
