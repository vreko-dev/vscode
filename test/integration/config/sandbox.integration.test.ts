import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	executeSandboxedScript,
	SandboxError,
} from "../../../src/config/secureChildProcess";

describe("Sandbox Integration Tests", () => {
	let tempDir: string;
	let validConfigPath: string;
	let infiniteLoopConfigPath: string;
	let forbiddenApiConfigPath: string;
	let invalidResultConfigPath: string;
	let heapOverflowConfigPath: string;

	beforeAll(async () => {
		// Create temporary directory for test configs
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-sandbox-"));

		// Valid config that returns a plain object
		validConfigPath = path.join(tempDir, "valid-config.cjs");
		await fs.writeFile(
			validConfigPath,
			`
      module.exports = {
        protection: [
          { pattern: '**/*.env', level: 'block' }
        ],
        ignore: ['node_modules/**']
      };
    `,
		);

		// Config with infinite loop
		infiniteLoopConfigPath = path.join(tempDir, "infinite-loop.cjs");
		await fs.writeFile(
			infiniteLoopConfigPath,
			`
      while(true) {} // Infinite loop
      module.exports = { protection: [] };
    `,
		);

		// Config that tries to access forbidden APIs
		forbiddenApiConfigPath = path.join(tempDir, "forbidden-api.cjs");
		await fs.writeFile(
			forbiddenApiConfigPath,
			`
      // Try to access forbidden APIs
      const fs = require('fs');
      const net = require('net');
      module.exports = { protection: [] };
    `,
		);

		// Config that returns invalid result (function)
		invalidResultConfigPath = path.join(tempDir, "invalid-result.cjs");
		await fs.writeFile(
			invalidResultConfigPath,
			`
      module.exports = function() { return { protection: [] }; };
    `,
		);

		// Config that tries to use excessive memory
		heapOverflowConfigPath = path.join(tempDir, "heap-overflow.cjs");
		await fs.writeFile(
			heapOverflowConfigPath,
			`
      // Create a large array to consume memory
      const arr = new Array(10000000).fill('a');
      module.exports = { protection: [] };
    `,
		);
	});

	afterAll(async () => {
		// Clean up temporary files
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should execute valid config within timeout and memory limits", async () => {
		const result = await executeSandboxedScript(validConfigPath);

		expect(result.result).toBeDefined();
		expect(result.result.protection).toBeDefined();
		expect(result.result.protection).toHaveLength(1);
		expect(result.result.protection[0].pattern).toBe("**/*.env");
		expect(result.result.protection[0].level).toBe("block");
		expect(result.result.ignore).toBeDefined();
		expect(result.result.ignore).toContain("node_modules/**");
		expect(result.executionTime).toBeLessThan(250); // Should be well under timeout
	});

	it("should kill process on infinite loop and throw timeout error", async () => {
		await expect(
			executeSandboxedScript(infiniteLoopConfigPath),
		).rejects.toThrow(SandboxError);

		try {
			await executeSandboxedScript(infiniteLoopConfigPath);
		} catch (error) {
			expect(error).toBeInstanceOf(SandboxError);
			if (error instanceof SandboxError) {
				expect(error.code).toBe("TIMEOUT");
				expect(error.message).toContain("timed out");
			}
		}
	});

	it("should prevent access to forbidden APIs", async () => {
		await expect(
			executeSandboxedScript(forbiddenApiConfigPath),
		).rejects.toThrow(SandboxError);

		try {
			await executeSandboxedScript(forbiddenApiConfigPath);
		} catch (error) {
			expect(error).toBeInstanceOf(SandboxError);
			if (error instanceof SandboxError) {
				expect(error.code).toBe("EXECUTION_ERROR");
				expect(error.message).toContain("forbidden");
			}
		}
	});

	it("should reject non-POJO results", async () => {
		await expect(
			executeSandboxedScript(invalidResultConfigPath),
		).rejects.toThrow(SandboxError);

		try {
			await executeSandboxedScript(invalidResultConfigPath);
		} catch (error) {
			expect(error).toBeInstanceOf(SandboxError);
			if (error instanceof SandboxError) {
				expect(error.code).toBe("INVALID_RESULT");
				expect(error.message).toContain("plain object");
			}
		}
	});

	it("should enforce memory limits", async () => {
		await expect(
			executeSandboxedScript(heapOverflowConfigPath),
		).rejects.toThrow(SandboxError);

		try {
			await executeSandboxedScript(heapOverflowConfigPath);
		} catch (error) {
			expect(error).toBeInstanceOf(SandboxError);
			if (error instanceof SandboxError) {
				// Could be either timeout or memory error depending on how Node.js handles it
				expect(["TIMEOUT", "MEMORY", "EXECUTION_ERROR"]).toContain(error.code);
			}
		}
	});
});
