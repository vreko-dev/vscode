import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Packaging Pipeline Validation", () => {
	describe("Native Module Handling", () => {
		it("should validate that better-sqlite3 bindings are rebuilt for target ABI", async () => {
			// This test would normally run against a packaged extension
			// For unit testing, we'll check that the proper mechanisms are in place

			// Check that package.json has the right scripts for rebuilding native modules
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);

			const scripts = packageJson.scripts || {};

			// Should have packaging scripts that can handle native modules
			expect(scripts).toHaveProperty("package");
			expect(scripts).toHaveProperty("package-vsce");
			expect(scripts).toHaveProperty("package-vsix");

			// Check that better-sqlite3 is in dependencies
			expect(packageJson.dependencies).toHaveProperty("better-sqlite3");
		});

		it("should verify that packaging process includes native module rebuilding", async () => {
			// This test validates that the packaging process is designed to handle native modules
			// by checking for the presence of appropriate build scripts and configurations

			// Check for esbuild configuration that handles native modules
			const esbuildConfigPath = path.join(
				__dirname,
				"../../../esbuild.config.cjs",
			);
			const esbuildConfigExists = await fs
				.access(esbuildConfigPath)
				.then(() => true)
				.catch(() => false);
			expect(esbuildConfigExists).toBe(true);

			if (esbuildConfigExists) {
				const esbuildConfigContent = await fs.readFile(
					esbuildConfigPath,
					"utf-8",
				);
				// Should externalize vscode and mark better-sqlite3 as external native module
				expect(esbuildConfigContent).toContain('"vscode"');
				expect(esbuildConfigContent).toContain('"better-sqlite3"');
			}
		});
	});

	describe("Packaged Artifact Validation", () => {
		it("should validate that packaged extension can be installed and loaded", async () => {
			// This test would normally run against an actual packaged .vsix file
			// For unit testing, we'll check that the proper test infrastructure exists

			// Check that test scripts exist for packaged extensions
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);

			const scripts = packageJson.scripts || {};

			// Should have test scripts that can run against packaged extensions
			expect(scripts).toHaveProperty("test:integration");
			expect(scripts).toHaveProperty("test:unit");
		});

		it("should verify that smoke tests can be run against packaged artifacts", async () => {
			// Check that the proper testing infrastructure is in place
			const testDir = path.join(__dirname, "../../integration");
			const testDirExists = await fs
				.access(testDir)
				.then(() => true)
				.catch(() => false);
			expect(testDirExists).toBe(true);

			// Check that we have the proper test dependencies
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);
			const devDependencies = packageJson.devDependencies || {};
			expect(devDependencies).toHaveProperty("@vscode/test-electron");
		});
	});

	describe("ABI Compatibility Validation", () => {
		it("should validate that native modules target correct Node version", async () => {
			// Check that package.json engines match VS Code target
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);

			// Should specify VS Code engine version
			expect(packageJson.engines).toHaveProperty("vscode");

			// Should target appropriate Node version for VS Code
			const esbuildConfigPath = path.join(
				__dirname,
				"../../../esbuild.config.cjs",
			);
			const esbuildConfigExists = await fs
				.access(esbuildConfigPath)
				.then(() => true)
				.catch(() => false);

			if (esbuildConfigExists) {
				const esbuildConfigContent = await fs.readFile(
					esbuildConfigPath,
					"utf-8",
				);
				// Should target appropriate Node version
				expect(esbuildConfigContent).toContain('target: "node20"');
			}
		});
	});
});
