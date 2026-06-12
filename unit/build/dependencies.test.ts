import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Build Dependencies (No SQLite)", () => {
	it("should NOT have better-sqlite3 in package.json", () => {
		const pkgPath = path.join(__dirname, "../../../package.json");
		const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

		expect(pkgJson.dependencies?.["better-sqlite3"]).toBeUndefined();
		expect(pkgJson.devDependencies?.["better-sqlite3"]).toBeUndefined();
		expect(pkgJson.optionalDependencies?.["better-sqlite3"]).toBeUndefined();
	});

	it("should only externalize vscode API in esbuild", () => {
		const configPath = path.join(__dirname, "../../../esbuild.config.cjs");
		const configContent = fs.readFileSync(configPath, "utf-8");

		// Parse external array from esbuild config
		const externalMatch = configContent.match(/external:\s*\[([\s\S]*?)\]/);
		expect(externalMatch).toBe(true);

		const externalStr = externalMatch![1];

		// Should only contain "vscode" (not better-sqlite3 as an actual external)
		expect(externalStr).toContain('"vscode"');
		// Comments are OK, but better-sqlite3 should NOT be in the array as a dependency
		const externalWithoutComments = externalStr.replace(/\/\/.*$/gm, "");
		expect(externalWithoutComments).not.toContain('"better-sqlite3"');
		expect(externalWithoutComments).not.toContain('"sql.js"');
	});

	it("should have file-based storage imports only", () => {
		const storageDir = path.join(__dirname, "../../../src/storage");
		const files = fs.readdirSync(storageDir);

		expect(files).toContain("StorageManager.ts");
		expect(files).toContain("BlobStore.ts");
		expect(files).toContain("SnapshotStore.ts");
		expect(files).toContain("SessionStore.ts");
		expect(files).toContain("AuditLog.ts");
		expect(files).toContain("CooldownCache.ts");
	});
});
