import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProtectedFileEntry } from "../views/types.js";
import { logger } from "./logger.js";

export interface ProtectedSnapshotInput {
	files: string[];
	fileContents: Record<string, string>;
}

export async function buildProtectedSnapshotInput(
	entries: ProtectedFileEntry[],
	workspaceRoot: string,
): Promise<ProtectedSnapshotInput> {
	const files: string[] = [];
	const fileContents: Record<string, string> = {};

	for (const entry of entries) {
		const absolutePath = entry.path;
		const relativePath = path.relative(workspaceRoot, absolutePath);

		// Only include files within the workspace root
		if (relativePath.startsWith("..")) {
			logger.warn("Skipping protected file outside workspace", {
				filePath: absolutePath,
				workspaceRoot,
			});
			continue;
		}

		files.push(relativePath);

		try {
			const content = await fs.readFile(absolutePath, "utf-8");
			fileContents[relativePath] = content;
		} catch (error) {
			logger.warn("Failed to read protected file for snapshot", {
				filePath: absolutePath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { files, fileContents };
}
