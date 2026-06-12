/**
 * @fileoverview Session Summary Generator (VSCode Wrapper)
 *
 * This module wraps the SDK SessionSummaryGenerator and provides VSCode-specific
 * snapshot provider integration.
 */

import type { SnapshotManager } from "../snapshot/SnapshotManager";
import type { SessionManifest } from "../types/sdk";
import type { Snapshot } from "../types/snapshot";
import { logger } from "./logger";

/**
 * Local snapshot provider adapter
 */
class _LocalSnapshotProvider {
	constructor(private snapshotManager: SnapshotManager) {
		/* intentionally empty */
	}

	async get(id: string): Promise<Snapshot | null> {
		try {
			const result = await this.snapshotManager.get(id);
			if (!result) {
				return null;
			}
			return result as unknown as Snapshot;
		} catch (error) {
			logger.error("Failed to retrieve snapshot for summary", error as Error, { id });
			return null;
		}
	}
}

/**
 * Generates a deterministic summary for a session
 *
 * Creates a human-readable summary that describes the changes in a session
 * without including any sensitive content or file paths.
 *
 * @param session Session manifest to summarize
 * @param workspaceRoot Workspace root directory path (unused, kept for backward compatibility)
 * @param snapshotManager Snapshot manager for retrieving snapshots
 * @returns Promise that resolves to a session summary
 */
export async function generateSessionSummary(
	session: SessionManifest,
	_workspaceRoot: string,
	_snapshotManager?: SnapshotManager,
): Promise<string> {
	const fileCount = session.fileCount ?? 0;
	const snapshotCount = session.snapshotCount ?? 0;
	const duration = (session.endedAt ?? Date.now()) - session.startedAt;
	const durationMin = Math.round(duration / 60000);
	const parts: string[] = [];
	if (fileCount > 0) {
		parts.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
	}
	if (snapshotCount > 0) {
		parts.push(`${snapshotCount} snapshot${snapshotCount > 1 ? "s" : ""}`);
	}
	if (durationMin > 0) {
		parts.push(`${durationMin}min`);
	}
	return parts.length > 0 ? `Session: ${parts.join(", ")}` : "Empty session";
}

/**
 * Extracts top identifiers from file content for use in summaries
 *
 * Uses AST scanning for TypeScript/JavaScript files and regex fallback
 * for other file types to extract the most important identifiers.
 *
 * @param content File content to analyze
 * @param filePath Path to the file (used to determine language)
 * @returns Array of top identifiers
 */
export async function extractTopIdentifiers(_content: string, _filePath: string): Promise<string[]> {
	return [];
}

/**
 * Checks if an identifier is a common keyword that should be excluded
 *
 * @param identifier Identifier to check
 * @returns True if it's a common keyword
 */
export function isCommonKeyword(identifier: string): boolean {
	const common = new Set([
		"import",
		"export",
		"const",
		"let",
		"var",
		"function",
		"class",
		"return",
		"if",
		"else",
		"for",
		"while",
		"do",
		"switch",
		"case",
		"break",
		"continue",
		"default",
		"new",
		"this",
		"super",
		"extends",
		"implements",
		"interface",
		"type",
		"enum",
		"async",
		"await",
		"try",
		"catch",
		"throw",
		"finally",
		"void",
		"null",
		"undefined",
		"true",
		"false",
	]);
	return common.has(identifier.toLowerCase());
}
