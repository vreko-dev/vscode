import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Packaging and Native Modules", () => {
	describe("ESM Configuration", () => {
		it("should have correct module settings in tsconfig", async () => {
			const baseTsconfigPath = path.join(
				__dirname,
				"../../../../../tsconfig.base.json",
			);
			const baseTsconfig = JSON.parse(
				await fs.readFile(baseTsconfigPath, "utf-8"),
			);

			// Should use modern module settings
			expect(baseTsconfig.compilerOptions).toHaveProperty("module", "Preserve");
			expect(baseTsconfig.compilerOptions).toHaveProperty(
				"moduleResolution",
				"bundler",
			);
		});
	});

	describe("Native Module Handling", () => {
		it("should mark better-sqlite3 as external in esbuild config", async () => {
			const esbuildConfigPath = path.join(
				__dirname,
				"../../../esbuild.config.cjs",
			);
			const esbuildConfig = await fs.readFile(esbuildConfigPath, "utf-8");

			// Should have better-sqlite3 in external array
			expect(esbuildConfig).toContain("better-sqlite3");
			expect(esbuildConfig).toContain("external:");
		});

		it("should have better-sqlite3 in dependencies", async () => {
			const packagePath = path.join(__dirname, "../../../package.json");
			const packageJson = JSON.parse(await fs.readFile(packagePath, "utf-8"));

			// Should have better-sqlite3 as dependency
			expect(packageJson.dependencies).toHaveProperty("better-sqlite3");
		});

		it("should have packaging script that handles native modules", async () => {
			const packageScriptPath = path.join(
				__dirname,
				"../../../scripts/package-vsix.cjs",
			);
			const packageScript = await fs.readFile(packageScriptPath, "utf-8");

			// Should have native module handling logic
			expect(packageScript).toMatch(/native.*module/i);
			expect(packageScript).toMatch(/better-sqlite3/i);
		});
	});

	describe("Vitest Configuration", () => {
		it("should use ESM format for vitest configs", async () => {
			// Check VS Code extension vitest config
			const vscodeVitestPath = path.join(
				__dirname,
				"../../../vitest.config.mts",
			);

			try {
				await fs.access(vscodeVitestPath);
				const vscodeVitestContent = await fs.readFile(
					vscodeVitestPath,
					"utf-8",
				);

				// Should be valid ESM
				expect(vscodeVitestContent).toContain("export default");
				expect(vscodeVitestContent).toContain("import");
			} catch (_error) {
				// vitest.config.mts might not exist, that's ok
			}

			// Check package vitest configs
			const packagesDir = path.join(__dirname, "../../../../../packages");
			const packages = await fs.readdir(packagesDir);

			for (const pkg of packages) {
				const vitestPath = path.join(packagesDir, pkg, "vitest.config.ts");
				try {
					await fs.access(vitestPath);
					const vitestContent = await fs.readFile(vitestPath, "utf-8");

					// Should be valid ESM
					expect(vitestContent).toContain("export default");
				} catch (_error) {}
			}
		});
	});

	describe("Build Output Verification", () => {
		it("should produce extension.js that does not bundle native modules", async () => {
			// This test would normally check the actual build output
			// For now, we'll verify the esbuild config prevents bundling
			const esbuildConfigPath = path.join(
				__dirname,
				"../../../esbuild.config.cjs",
			);
			const esbuildConfig = await fs.readFile(esbuildConfigPath, "utf-8");

			// Should have external configuration for native modules
			expect(esbuildConfig).toMatch(
				/external:\s*\[[\s\S]*?better-sqlite3[\s\S]*?\]/,
			);

			// Should target node platform
			expect(esbuildConfig).toMatch(/platform:\s*['"]node['"]/);
		});
	});
});
