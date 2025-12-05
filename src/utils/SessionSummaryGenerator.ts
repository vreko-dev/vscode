/**
 * @fileoverview Session Summary Generator (VSCode Wrapper)
 *
 * This module wraps the SDK SessionSummaryGenerator and provides VSCode-specific
 * snapshot provider integration.
 */

import type { Snapshot } from "@snapback/contracts";
import {
	type ISnapshotProvider,
	SessionSummaryGenerator as SDKSessionSummaryGenerator,
	type SessionManifest,
} from "@snapback/sdk";
import type { SnapshotManager } from "../snapshot/SnapshotManager.js";
import { logger } from "./logger.js";

/**
 * VSCode-specific snapshot provider adapter
 */
class VscodeSnapshotProvider implements ISnapshotProvider {
	constructor(private snapshotManager: SnapshotManager) {}

	async get(id: string): Promise<Snapshot | null> {
		try {
			const result = await this.snapshotManager.get(id);
			return result || null;
		} catch (error) {
			logger.error("Failed to retrieve snapshot for summary", error as Error, {
				id,
			});
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
	snapshotManager?: SnapshotManager,
): Promise<string> {
	const generator = new SDKSessionSummaryGenerator({
		snapshotProvider: snapshotManager
			? new VscodeSnapshotProvider(snapshotManager)
			: undefined,
		logger: {
			debug: (message: string, data?: unknown) => logger.debug(message, data),
			info: (message: string, data?: unknown) => logger.info(message, data),
			error: (message: string, error?: Error, data?: unknown) =>
				logger.error(message, error, data),
		},
	});

	return generator.generateSummary(session);
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
export async function extractTopIdentifiers(
	content: string,
	filePath: string,
): Promise<string[]> {
	const generator = new SDKSessionSummaryGenerator();
	return generator.extractTopIdentifiers(content, filePath);
}

/**
 * Checks if an identifier is a common keyword that should be excluded
 *
 * @param identifier Identifier to check
 * @returns True if it's a common keyword
 */
export function isCommonKeyword(identifier: string): boolean {
	const generator = new SDKSessionSummaryGenerator();
	return generator.isCommonKeyword(identifier);
}
