// apps/vscode/src/storage/utils/atomicWrite.ts

import * as vscode from "vscode";
import { randomId } from "./fileId";

/**
 * Atomically write content to a file using write-then-rename pattern.
 * This prevents corrupted files if the extension crashes mid-write.
 */
export async function atomicWriteFile(uri: vscode.Uri, content: string | Uint8Array): Promise<void> {
	const data = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

	// Create temp file path in same directory
	const tempUri = vscode.Uri.joinPath(vscode.Uri.joinPath(uri, ".."), `.tmp-${randomId(8)}`);

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
 * Result of reading a JSON file with recovery information
 */
export interface JsonRecoveryResult<T> {
	/** The parsed data, or null if parsing failed or file not found */
	data: T | null;
	/** Whether the file contained corrupted JSON */
	wasCorrupted: boolean;
	/** Path to the backup file if corruption was detected and backup succeeded */
	backupPath?: string;
	/** The parse error if JSON was corrupted */
	error?: SyntaxError;
	/** Whether the file was not found */
	fileNotFound?: boolean;
}

/**
 * Create a backup of a corrupted file
 * @returns The backup file path, or undefined if backup failed
 */
async function createCorruptedBackup(uri: vscode.Uri, content: Uint8Array): Promise<string | undefined> {
	try {
		const timestamp = Date.now();
		const backupUri = vscode.Uri.file(`${uri.fsPath}.corrupted.${timestamp}`);
		await vscode.workspace.fs.writeFile(backupUri, content);
		return backupUri.fsPath;
	} catch {
		// Backup failed silently - don't block the read operation
		return undefined;
	}
}

/**
 * Read JSON file with error handling and corruption recovery
 *
 * When JSON parsing fails:
 * 1. Creates a backup of the corrupted file with .corrupted.{timestamp} suffix
 * 2. Logs the corruption with structured logging
 * 3. Returns detailed recovery information
 */
export async function readJsonFileWithRecovery<T>(uri: vscode.Uri): Promise<JsonRecoveryResult<T>> {
	try {
		const data = await vscode.workspace.fs.readFile(uri);
		const content = Buffer.from(data).toString("utf-8");

		try {
			return {
				data: JSON.parse(content) as T,
				wasCorrupted: false,
			};
		} catch (parseError) {
			if (parseError instanceof SyntaxError) {
				// Create backup before returning null
				const backupPath = await createCorruptedBackup(uri, data);

				console.warn(
					`[Storage] Corrupted JSON file: ${uri.fsPath}${backupPath ? ` (backed up to ${backupPath})` : ""}`,
				);

				return {
					data: null,
					wasCorrupted: true,
					backupPath,
					error: parseError,
				};
			}
			throw parseError;
		}
	} catch (error) {
		if ((error as vscode.FileSystemError).code === "FileNotFound") {
			return {
				data: null,
				wasCorrupted: false,
				fileNotFound: true,
			};
		}
		throw error;
	}
}

/**
 * Read JSON file with error handling
 *
 * When JSON parsing fails:
 * 1. Creates a backup of the corrupted file with .corrupted.{timestamp} suffix
 * 2. Logs the corruption
 * 3. Returns null
 */
export async function readJsonFile<T>(uri: vscode.Uri): Promise<T | null> {
	const result = await readJsonFileWithRecovery<T>(uri);
	return result.data;
}

/**
 * Write JSON file atomically with pretty printing
 */
export async function writeJsonFile(uri: vscode.Uri, data: unknown): Promise<void> {
	await atomicWriteFile(uri, JSON.stringify(data, null, 2));
}
