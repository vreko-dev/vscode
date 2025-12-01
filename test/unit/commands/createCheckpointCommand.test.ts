import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Create checkpoint command", () => {
	it("should collect protected file snapshot data before creating a checkpoint", async () => {
		const extensionPath = path.join(__dirname, "../../../src/extension.ts");
		const extensionContent = await fs.readFile(extensionPath, "utf-8");

		expect(extensionContent).toContain("buildProtectedSnapshotInput");
		expect(extensionContent).toContain(
			"snapshotData.files.length > 0\n\t\t\t\t\t\t\t? snapshotData.files",
		);
	});
});
