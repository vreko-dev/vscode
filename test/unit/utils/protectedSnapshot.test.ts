import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProtectedFileEntry } from "../../../src/views/types.js";

vi.mock("../../../src/utils/logger", () => ({
	logger: {
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

describe("buildProtectedSnapshotInput", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "snapback-snapshot-test-"),
		);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("collects relative paths and file contents for protected files", async () => {
		const fileA = path.join(tempDir, "src", "alpha.ts");
		const fileB = path.join(tempDir, "config.json");

		await fs.mkdir(path.dirname(fileA), { recursive: true });
		await fs.writeFile(fileA, "export const alpha = 1;\n");
		await fs.writeFile(fileB, '{"config":true}\n');

		const entries: ProtectedFileEntry[] = [
			{
				id: fileA,
				label: "alpha.ts",
				path: fileA,
				protectionLevel: "watch",
			},
			{
				id: fileB,
				label: "config.json",
				path: fileB,
				protectionLevel: "warn",
			},
		];

		const { buildProtectedSnapshotInput } = await import(
			"../../../src/utils/protectedSnapshot"
		);
		const result = await buildProtectedSnapshotInput(entries, tempDir);

		expect(result.files).toEqual(["src/alpha.ts", "config.json"]);
		expect(result.fileContents["src/alpha.ts"]).toContain("alpha = 1");
		expect(result.fileContents["config.json"]).toContain("config");
	});

	it("skips missing files gracefully", async () => {
		const existingFile = path.join(tempDir, "exists.ts");
		await fs.writeFile(existingFile, "export const exists = true;\n");

		const missingFile = path.join(tempDir, "missing.ts");

		const entries: ProtectedFileEntry[] = [
			{ id: existingFile, label: "exists.ts", path: existingFile },
			{ id: missingFile, label: "missing.ts", path: missingFile },
		];

		const { buildProtectedSnapshotInput } = await import(
			"../../../src/utils/protectedSnapshot"
		);
		const result = await buildProtectedSnapshotInput(entries, tempDir);

		expect(result.files).toEqual(["exists.ts", "missing.ts"]);
		expect(result.fileContents["exists.ts"]).toContain("exists = true");
		expect(result.fileContents).not.toHaveProperty("missing.ts");
	});
});
