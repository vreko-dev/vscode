// apps/vscode/src/storage/utils/atomicWrite.ts

import * as vscode from "vscode";
import { randomId } from "./fileId";

/**
 * Atomically write content to a file using write-then-rename pattern.
 * This prevents corrupted files if the extension crashes mid-write.
 */
export async function atomicWriteFile(
	uri: vscode.Uri,
	content: string | Uint8Array,
): Promise<void> {
	const data =
		typeof content === "string" ? Buffer.from(content, "utf-8") : content;

	// Create temp file path in same directory
	const tempUri = vscode.Uri.joinPath(
		vscode.Uri.joinPath(uri, ".."),
		`.tmp-${randomId(8)}`,
	);

	try {
		// 1. Write to temp file
		await vscode.workspace.fs.writeFile(tempUri, data);

		// 2. Atomic rename (OS guarantees atomicity)
		await vscode.workspace.fs.rename(tempUri, uri, { overwrite: true });
	} catch (error) {
		// Clean up temp file on failure
		try {
			await vscode.workspace.fs.delete(tempUri);
		} catch {
			// Ignore cleanup errors
		}
		throw error;
	}
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export async function ensureDirectory(uri: vscode.Uri): Promise<void> {
	try {
		const stat = await vscode.workspace.fs.stat(uri);
		if (stat.type !== vscode.FileType.Directory) {
			throw new Error(`Path exists but is not a directory: ${uri.fsPath}`);
		}
	} catch (error) {
		if ((error as vscode.FileSystemError).code === "FileNotFound") {
			await vscode.workspace.fs.createDirectory(uri);
		} else {
			throw error;
		}
	}
}

/**
 * Check if a file exists
 */
export async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read JSON file with error handling
 */
export async function readJsonFile<T>(uri: vscode.Uri): Promise<T | null> {
	try {
		const data = await vscode.workspace.fs.readFile(uri);
		const content = Buffer.from(data).toString("utf-8");

		try {
			return JSON.parse(content) as T;
		} catch (parseError) {
			if (parseError instanceof SyntaxError) {
				console.warn(`[Storage] Corrupted JSON file: ${uri.fsPath}`);
				return null;
			}
			throw parseError;
		}
	} catch (error) {
		if ((error as vscode.FileSystemError).code === "FileNotFound") {
			return null;
		}
		throw error;
	}
}

/**
 * Write JSON file atomically with pretty printing
 */
export async function writeJsonFile(
	uri: vscode.Uri,
	data: unknown,
): Promise<void> {
	await atomicWriteFile(uri, JSON.stringify(data, null, 2));
}
