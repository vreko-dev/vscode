/**
 * @fileoverview VS Code File Writer for Agent Config Injection
 *
 * Implements IConfigFileWriter using VS Code's workspace APIs
 */

import * as fs from "node:fs/promises";
import type { IConfigFileWriter } from "./types";

/**
 * Node.js filesystem-based config file writer
 * Used by both VS Code extension and CLI
 */
export class NodeConfigFileWriter implements IConfigFileWriter {
	async exists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	async read(filePath: string): Promise<string> {
		return fs.readFile(filePath, "utf-8");
	}

	async write(filePath: string, content: string): Promise<void> {
		await fs.writeFile(filePath, content, "utf-8");
	}

	async ensureDir(dirPath: string): Promise<void> {
		await fs.mkdir(dirPath, { recursive: true });
	}
}

/**
 * Creates a Node.js file writer instance
 */
export function createNodeFileWriter(): IConfigFileWriter {
	return new NodeConfigFileWriter();
}
