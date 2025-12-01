/**
 * @fileoverview Demo-Critical Settings Management Integration Tests
 *
 * These tests validate VS Code configuration and .snapbackrc file management
 * with real file system operations.
 *
 * Coverage:
 * - VS Code settings read/write
 * - .snapbackrc pattern management
 * - Offline mode configuration
 * - Settings persistence
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigFileManager } from "../../../src/protection/ConfigFileManager";

describe("[DEMO-CRITICAL] Settings Management Integration", () => {
	let testWorkspace: string;
	let configManager: ConfigFileManager;

	beforeEach(async () => {
		// Create temporary workspace
		testWorkspace = path.join(
			os.tmpdir(),
			`snapback-settings-test-${Date.now()}`,
		);
		await fs.mkdir(testWorkspace, { recursive: true });

		configManager = new ConfigFileManager(testWorkspace);
	});

	afterEach(async () => {
		// Clean up workspace
		await fs.rm(testWorkspace, { recursive: true, force: true });
	});

	describe(".snapbackrc File Management", () => {
		it("[DEMO] reads empty config when file doesn't exist", async () => {
			const patterns = await configManager.readConfig("protected");

			expect(patterns).toEqual([]);
		});

		it("[DEMO] writes and reads patterns", async () => {
			const testPatterns = [
				"**/*.ts",
				"**/*.critical.js",
				"src/**/*.important.*",
			];

			await configManager.writeConfig("protected", testPatterns);

			const readPatterns = await configManager.readConfig("protected");

			expect(readPatterns).toEqual(testPatterns);
		});

		it("[DEMO] adds pattern without duplicates", async () => {
			await configManager.addPattern("protected", "**/*.ts");
			await configManager.addPattern("protected", "**/*.js");
			await configManager.addPattern("protected", "**/*.ts"); // Duplicate

			const patterns = await configManager.readConfig("protected");

			expect(patterns).toEqual(["**/*.ts", "**/*.js"]);
		});

		it("[DEMO] removes patterns correctly", async () => {
			await configManager.writeConfig("protected", [
				"**/*.ts",
				"**/*.js",
				"**/*.json",
			]);

			await configManager.removePattern("protected", "**/*.js");

			const patterns = await configManager.readConfig("protected");

			expect(patterns).toEqual(["**/*.ts", "**/*.json"]);
		});

		it("[DEMO] checks pattern existence", async () => {
			await configManager.addPattern("protected", "**/*.critical.ts");

			const exists = await configManager.hasPattern(
				"protected",
				"**/*.critical.ts",
			);
			const notExists = await configManager.hasPattern(
				"protected",
				"**/*.missing.ts",
			);

			expect(exists).toBe(true);
			expect(notExists).toBe(false);
		});

		it("[DEMO] matches file paths against patterns", async () => {
			await configManager.writeConfig("protected", [
				"**/*.critical.ts",
				"src/core/**/*.ts",
			]);

			const criticalFile = path.join(testWorkspace, "src/auth.critical.ts");
			const coreFile = path.join(testWorkspace, "src/core/security.ts");
			const normalFile = path.join(testWorkspace, "src/utils.ts");

			const matchesCritical = await configManager.matchesConfig(
				"protected",
				criticalFile,
			);
			const matchesCore = await configManager.matchesConfig(
				"protected",
				coreFile,
			);
			const matchesNormal = await configManager.matchesConfig(
				"protected",
				normalFile,
			);

			expect(matchesCritical).toBe(true);
			expect(matchesCore).toBe(true);
			expect(matchesNormal).toBe(false);
		});

		it("[DEMO] ignores comments and empty lines", async () => {
			const configContent = `
# This is a comment
**/*.ts

# Another comment
**/*.js

`;
			const configPath = path.join(testWorkspace, ".snapbackrc");
			await fs.writeFile(configPath, configContent);

			const patterns = await configManager.readConfig("protected");

			expect(patterns).toEqual(["**/*.ts", "**/*.js"]);
		});

		it("[DEMO] creates default config if missing", async () => {
			const defaults = ["**/*.env", "**/*.key", "package.json"];

			await configManager.ensureConfigExists("protected", defaults);

			const patterns = await configManager.readConfig("protected");

			expect(patterns).toEqual(defaults);
		});

		it("[DEMO] doesn't overwrite existing config", async () => {
			const existing = ["**/*.critical.ts"];
			await configManager.writeConfig("protected", existing);

			const defaults = ["**/*.env", "**/*.key"];
			await configManager.ensureConfigExists("protected", defaults);

			const patterns = await configManager.readConfig("protected");

			// Should keep existing patterns
			expect(patterns).toEqual(existing);
		});
	});

	describe("Pattern Validation", () => {
		it("[DEMO] accepts valid glob patterns", async () => {
			const validPatterns = [
				"**/*.ts",
				"src/**/*.critical.*",
				"**/package.json",
				"test/**/*.test.{ts,js}",
			];

			for (const pattern of validPatterns) {
				await expect(
					configManager.addPatternWithValidation("protected", pattern),
				).resolves.not.toThrow();
			}

			const patterns = await configManager.readConfig("protected");
			expect(patterns).toEqual(validPatterns);
		});

		it("[DEMO] rejects invalid patterns", async () => {
			const invalidPatterns = [
				"", // Empty
				"*".repeat(513), // Too long (>512 chars)
				`${"{".repeat(10)}}`, // Too much nesting
			];

			for (const pattern of invalidPatterns) {
				await expect(
					configManager.addPatternWithValidation("protected", pattern),
				).rejects.toThrow();
			}
		});

		it("[DEMO] sanitizes patterns when reading config", async () => {
			// Manually write config with invalid patterns
			const configPath = path.join(testWorkspace, ".snapbackrc");
			const content = `
**/*.ts
${"*".repeat(600)}
**/*.js
`;
			await fs.writeFile(configPath, content);

			const patterns = await configManager.readConfig("protected");

			// Invalid pattern should be filtered out
			expect(patterns).toEqual(["**/*.ts", "**/*.js"]);
		});
	});

	describe("Performance", () => {
		it("[DEMO] reads config in <10ms", async () => {
			await configManager.writeConfig("protected", [
				"**/*.ts",
				"**/*.js",
				"**/*.json",
			]);

			const startTime = performance.now();
			await configManager.readConfig("protected");
			const duration = performance.now() - startTime;

			expect(duration).toBeLessThan(10);
		});

		it("[DEMO] matches patterns in <5ms", async () => {
			await configManager.writeConfig("protected", [
				"**/*.critical.ts",
				"src/core/**/*.ts",
				"**/*.secret.*",
			]);

			const testFile = path.join(testWorkspace, "src/auth.critical.ts");

			const startTime = performance.now();
			await configManager.matchesConfig("protected", testFile);
			const duration = performance.now() - startTime;

			expect(duration).toBeLessThan(5);
		});
	});
});
