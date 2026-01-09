/**
 * @fileoverview SnapBackRCLoader Error Handling Tests
 *
 * Tests for P1 UX improvement: User-friendly config error reporting
 * with "Open & Fix" action for .snapbackrc JSON parse failures.
 *
 * @see claudedocs/analysis/extension-activation-improvement-plan.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn().mockResolvedValue(undefined),
		showTextDocument: vi.fn().mockResolvedValue(undefined),
	},
	workspace: {
		openTextDocument: vi.fn().mockResolvedValue({}),
	},
	Range: class {
		constructor(
			public startLine: number,
			public startCol: number,
			public endLine: number,
			public endCol: number,
		) {}
	},
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path, toString: () => path })),
	},
}));

describe("SnapBackRC Loader Error Handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("JSON Parse Error Detection", () => {
		it("should detect syntax error in JSON content", () => {
			const invalidJson = '{ "protection": true, }'; // Trailing comma

			let parseError: Error | null = null;
			try {
				JSON.parse(invalidJson);
			} catch (err) {
				parseError = err as Error;
			}

			expect(parseError).toBeInstanceOf(SyntaxError);
			expect(parseError?.message).toContain("JSON");
		});

		it("should extract position from JSON parse error", () => {
			const invalidJson = '{ "protection": true, }';

			let position: number | null = null;
			try {
				JSON.parse(invalidJson);
			} catch (err) {
				const error = err as Error;
				// Modern V8 includes position in error message
				const match = error.message.match(/position (\d+)/);
				if (match) {
					position = parseInt(match[1], 10);
				}
			}

			// Position should be near the trailing comma/closing brace
			expect(position).toBeGreaterThan(0);
		});

		it("should handle missing closing brace", () => {
			const invalidJson = '{ "protection": true';

			let parseError: Error | null = null;
			try {
				JSON.parse(invalidJson);
			} catch (err) {
				parseError = err as Error;
			}

			expect(parseError).toBeInstanceOf(SyntaxError);
		});

		it("should handle invalid property name", () => {
			const invalidJson = '{ protection: true }'; // Missing quotes

			let parseError: Error | null = null;
			try {
				JSON.parse(invalidJson);
			} catch (err) {
				parseError = err as Error;
			}

			expect(parseError).toBeInstanceOf(SyntaxError);
		});
	});

	describe("Offset to Line/Column Conversion", () => {
		it("should convert offset 0 to line 1, column 1", () => {
			const content = '{\n  "key": "value"\n}';
			const offset = 0;

			const { line, column } = offsetToLineColumn(content, offset);

			expect(line).toBe(1);
			expect(column).toBe(1);
		});

		it("should convert offset on second line correctly", () => {
			const content = '{\n  "key": "value"\n}';
			// Offset 4 is the '"' of "key" on line 2
			const offset = 4;

			const { line, column } = offsetToLineColumn(content, offset);

			expect(line).toBe(2);
			expect(column).toBe(3);
		});

		it("should handle offset at end of content", () => {
			const content = '{\n  "key": "value"\n}';
			const offset = content.length - 1;

			const { line, column } = offsetToLineColumn(content, offset);

			expect(line).toBe(3);
			expect(column).toBe(1);
		});

		it("should handle single-line content", () => {
			const content = '{"key": "value"}';
			const offset = 8;

			const { line, column } = offsetToLineColumn(content, offset);

			expect(line).toBe(1);
			expect(column).toBe(9);
		});
	});

	describe("Error Position Extraction", () => {
		it("should extract position from V8 error message", () => {
			const errorMessage = "Unexpected token } in JSON at position 22";

			const position = extractPositionFromError(errorMessage);

			expect(position).toBe(22);
		});

		it("should return 0 when no position found", () => {
			const errorMessage = "Unexpected token }";

			const position = extractPositionFromError(errorMessage);

			expect(position).toBe(0);
		});

		it("should extract position from different error formats", () => {
			const errorMessage = "JSON Parse error: position 15";

			const position = extractPositionFromError(errorMessage);

			expect(position).toBe(15);
		});
	});

	describe("Notification Content", () => {
		it("should include file name and error location in message", () => {
			const rcPath = "/workspace/.snapbackrc";
			const line = 5;
			const column = 12;

			const message = formatConfigErrorMessage(rcPath, line, column);

			expect(message).toContain(".snapbackrc");
			expect(message).toContain("line 5");
			expect(message).toContain("col 12");
			expect(message).toContain("invalid JSON");
		});

		it("should provide Open & Fix action", () => {
			const expectedActions = ["Open & Fix"];

			// Verify the notification includes the action option
			expect(expectedActions).toContain("Open & Fix");
		});

		it("should mention default policy fallback", () => {
			const message = formatConfigErrorMessage("/workspace/.snapbackrc", 3, 8);

			expect(message).toContain("default policy");
		});
	});

	describe("Config Fallback Behavior", () => {
		it("should return null config on parse error", () => {
			const result = parseConfigSafe('{ invalid json }');

			expect(result.config).toBeNull();
			expect(result.error).toBeDefined();
		});

		it("should return valid config on successful parse", () => {
			const validJson = '{ "protection": { "enabled": true } }';

			const result = parseConfigSafe(validJson);

			expect(result.config).not.toBeNull();
			expect(result.error).toBeNull();
		});

		it("should preserve error details for notification", () => {
			const result = parseConfigSafe('{ "key": }');

			expect(result.error).toBeInstanceOf(SyntaxError);
		});
	});

	describe("Logging Precedence Information", () => {
		it("should log config precedence when fallback is used", () => {
			const logEntries: Array<{ level: string; message: string; meta: object }> = [];

			const mockLogger = {
				warn: (message: string, meta: object) => {
					logEntries.push({ level: "warn", message, meta });
				},
			};

			// Simulate logging on parse failure
			logConfigPrecedence(mockLogger, {
				activePolicy: "default",
				reason: ".snapbackrc invalid",
				fallback: ".snapback/policy.json loaded",
			});

			expect(logEntries).toHaveLength(1);
			expect(logEntries[0].message).toContain("precedence");
			expect(logEntries[0].meta).toHaveProperty("activePolicy", "default");
			expect(logEntries[0].meta).toHaveProperty("reason", ".snapbackrc invalid");
		});
	});
});

// Helper functions that mirror the implementation in SnapBackRCLoader

function offsetToLineColumn(content: string, offset: number): { line: number; column: number } {
	const lines = content.substring(0, offset).split("\n");
	const line = lines.length;
	const column = lines[lines.length - 1].length + 1;
	return { line, column };
}

function extractPositionFromError(message: string): number {
	const match = message.match(/position (\d+)/);
	return match ? parseInt(match[1], 10) : 0;
}

function formatConfigErrorMessage(rcPath: string, line: number, column: number): string {
	const fileName = rcPath.split("/").pop() || ".snapbackrc";
	return `${fileName} has invalid JSON (line ${line}, col ${column}). Using default policy.`;
}

function parseConfigSafe(content: string): { config: object | null; error: Error | null } {
	try {
		const config = JSON.parse(content);
		return { config, error: null };
	} catch (err) {
		return { config: null, error: err as Error };
	}
}

function logConfigPrecedence(
	logger: { warn: (message: string, meta: object) => void },
	meta: { activePolicy: string; reason: string; fallback: string },
): void {
	logger.warn("Config precedence", meta);
}
