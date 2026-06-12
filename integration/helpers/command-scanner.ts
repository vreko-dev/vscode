/**
 * Helper utility to scan codebase for executeCommand calls and validate
 * all referenced commands are registered
 *
 * USAGE: Run as part of integration tests to catch missing command registrations
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Find all vscode.commands.executeCommand("snapback.*") calls
 * and check if they have registered handlers
 */
export async function findUnregisteredCommands(
	srcDir: string,
	registeredCommands: Set<string>
): Promise<string[]> {
	const commandReferences = await scanForCommandReferences(srcDir);
	const unregistered: string[] = [];

	for (const command of commandReferences) {
		if (!registeredCommands.has(command)) {
			unregistered.push(command);
		}
	}

	return unregistered;
}

/**
 * Recursively scan directory for executeCommand calls
 */
async function scanForCommandReferences(dir: string): Promise<Set<string>> {
	const commands = new Set<string>();
	const files = await fs.readdir(dir, { withFileTypes: true });

	for (const file of files) {
		const fullPath = path.join(dir, file.name);

		if (file.isDirectory()) {
			// Recursively scan subdirectories
			const subCommands = await scanForCommandReferences(fullPath);
			subCommands.forEach((cmd) => commands.add(cmd));
		} else if (file.name.endsWith(".ts") && !file.name.endsWith(".test.ts")) {
			// Scan TypeScript files (excluding tests)
			const fileCommands = await extractCommandsFromFile(fullPath);
			fileCommands.forEach((cmd) => commands.add(cmd));
		}
	}

	return commands;
}

/**
 * Extract all snapback.* commands from a file
 */
async function extractCommandsFromFile(filePath: string): Promise<string[]> {
	const content = await fs.readFile(filePath, "utf-8");
	const commands: string[] = [];

	// Regex patterns to match executeCommand calls
	const patterns = [
		// vscode.commands.executeCommand("snapback.xxx")
		/vscode\.commands\.executeCommand\(\s*["'](snapback\.\w+)["']/g,
		// executeCommand("snapback.xxx") (imported)
		/executeCommand\(\s*["'](snapback\.\w+)["']/g,
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(content)) !== null) {
			commands.push(match[1]);
		}
	}

	return commands;
}

/**
 * Generate a report of command references vs registrations
 */
export interface CommandAuditReport {
	totalReferences: number;
	totalRegistrations: number;
	unregistered: string[];
	unused: string[];
}

export async function auditCommands(
	srcDir: string,
	registeredCommands: Set<string>
): Promise<CommandAuditReport> {
	const references = await scanForCommandReferences(srcDir);
	const unregistered = Array.from(references).filter((cmd) => !registeredCommands.has(cmd));
	const unused = Array.from(registeredCommands).filter((cmd) => !references.has(cmd));

	return {
		totalReferences: references.size,
		totalRegistrations: registeredCommands.size,
		unregistered,
		unused,
	};
}
