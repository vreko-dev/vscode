import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Build Dependencies Validation Test
 *
 * Validates that the VSCode extension:
 * 1. Does NOT depend on better-sqlite3 (removed during file-based storage migration)
 * 2. Only includes 'vscode' as external dependency
 * 3. Has correct build configuration
 *
 * Purpose: Prevent regression where SQLite dependencies are accidentally re-added
 */
describe("Build Dependencies Validation", () => {
	const pkgPath = join(__dirname, "../../package.json");
	const esbuildPath = join(__dirname, "../../esbuild.config.cjs");

	// Happy Path
	it("should NOT have better-sqlite3 in package.json dependencies", () => {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

		expect(pkg.dependencies).toBeDefined();
		expect(pkg.dependencies["better-sqlite3"]).toBeUndefined();
		expect(pkg.devDependencies?.["better-sqlite3"]).toBeUndefined();
	});

	it("should only have 'vscode' as external dependency in esbuild config", () => {
		expect(existsSync(esbuildPath)).toBe(true);

		const esbuildConfig = readFileSync(esbuildPath, "utf-8");

		// Extract external array
		const externalMatch = esbuildConfig.match(/external:\s*\[(.*?)\]/s);
		expect(externalMatch).toBeTruthy();

		const externals = externalMatch?.[1]
			?.split("\n")
			.filter((line) => !line.trim().startsWith("//")) // Remove comment lines
			.join("")
			.split(",")
			.map((e) => e.trim().replace(/['"]/g, ""))
			.filter((e) => e.length > 0) || [];

		expect(externals).toEqual(["vscode"]);
	});

	// Sad Path
	it("should confirm better-sqlite3 is mentioned ONLY in historical comments", () => {
		const esbuildConfig = readFileSync(esbuildPath, "utf-8");

		// Find all mentions of better-sqlite3
		const mentions = esbuildConfig.match(/better-sqlite3/gi) || [];

		// All mentions should be in comments (lines starting with // or inside /* */)
		const lines = esbuildConfig.split("\n");
		const sqliteMentionLines = lines
			.map((line, idx) => ({ line, idx }))
			.filter(({ line }) => /better-sqlite3/i.test(line));

		for (const { line, idx } of sqliteMentionLines) {
			const trimmed = line.trim();
			const isComment = trimmed.startsWith("//") || trimmed.startsWith("*");
			expect(isComment).toBe(true);
		}

		expect(mentions.length).toBeGreaterThan(0); // Historical comments exist
	});

	// Edge Case
	it("should have correct monorepo package dependencies", () => {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

		// Verify workspace protocol for internal packages
		expect(pkg.dependencies["@snapback/core"]).toBe("workspace:*");
		expect(pkg.dependencies["@snapback/events"]).toBe("workspace:*");
		expect(pkg.dependencies["@snapback/infrastructure"]).toBe("workspace:*");
		expect(pkg.dependencies["@snapback/sdk"]).toBe("workspace:*");
	});

	// Error Case
	it("should fail if sql.js is accidentally added", () => {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

		expect(pkg.dependencies?.["sql.js"]).toBeUndefined();
		expect(pkg.devDependencies?.["sql.js"]).toBeUndefined();
	});
});
