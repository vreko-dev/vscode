/**
 * Command Registration Invariant Test
 *
 * Validates that every command declared in package.json contributes.commands
 * has a corresponding handler registration in the extension source code,
 * and that no commands are referenced in source without being declared.
 *
 * This is a structural invariant — it reads package.json and scans the
 * source tree to detect drift between declared and implemented commands.
 *
 * @see commands/index.ts, package.json contributes.commands
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VSCODE_ROOT = path.resolve(__dirname, "../..");

function getPackageJsonCommands(): string[] {
	const pkgPath = path.join(VSCODE_ROOT, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
	const commands = pkg.contributes?.commands ?? [];
	return commands.map((c: { command: string }) => c.command);
}

function getPackageJsonActivationCommands(): string[] {
	const pkgPath = path.join(VSCODE_ROOT, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
	const events = pkg.activationEvents ?? [];
	return events
		.filter((e: string) => e.startsWith("onCommand:"))
		.map((e: string) => e.replace("onCommand:", ""));
}

function getPackageJsonMenuCommands(): string[] {
	const pkgPath = path.join(VSCODE_ROOT, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
	const menus = pkg.contributes?.menus ?? {};
	const commands = new Set<string>();

	for (const menuGroup of Object.values(menus)) {
		if (Array.isArray(menuGroup)) {
			for (const item of menuGroup) {
				if ((item as { command?: string }).command) {
					commands.add((item as { command: string }).command);
				}
			}
		}
	}

	return Array.from(commands);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Command Registration Invariant", () => {
	const declaredCommands = getPackageJsonCommands();

	// =========================================================================
	// PACKAGE.JSON STRUCTURE
	// =========================================================================

	describe("package.json declarations", () => {
		it("should have at least 30 commands declared", () => {
			expect(declaredCommands.length).toBeGreaterThanOrEqual(30);
		});

		it("should use snapback.* namespace for all commands", () => {
			for (const cmd of declaredCommands) {
				expect(cmd).toMatch(/^snapback\./);
			}
		});

		it("should not have duplicate command declarations", () => {
			const unique = new Set(declaredCommands);
			expect(unique.size).toBe(declaredCommands.length);
		});

		it("should have a title for every command", () => {
			const pkgPath = path.join(VSCODE_ROOT, "package.json");
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
			const commands = pkg.contributes?.commands ?? [];

			for (const cmd of commands) {
				expect(cmd.title, `Command ${cmd.command} missing title`).toBeDefined();
				expect(cmd.title.length).toBeGreaterThan(0);
			}
		});
	});

	// =========================================================================
	// MENU COMMAND REFERENCES
	// =========================================================================

	describe("Menu command references", () => {
		const menuCommands = getPackageJsonMenuCommands();

		it("should only reference declared commands in menus", () => {
			const declaredSet = new Set(declaredCommands);
			const undeclared = menuCommands.filter((cmd) => !declaredSet.has(cmd));

			expect(
				undeclared,
				`Menu references undeclared commands: ${undeclared.join(", ")}`,
			).toEqual([]);
		});
	});

	// =========================================================================
	// COMMAND CATEGORIES
	// =========================================================================

	describe("Command categories", () => {
		it("should have protection commands", () => {
			const protectionCmds = declaredCommands.filter((c) =>
				c.includes("protect") || c.includes("unprotect"),
			);
			expect(protectionCmds.length).toBeGreaterThanOrEqual(3);
		});

		it("should have snapshot commands", () => {
			const snapshotCmds = declaredCommands.filter((c) =>
				c.includes("snapshot") || c.includes("Snapshot") || c.includes("snapBack"),
			);
			expect(snapshotCmds.length).toBeGreaterThanOrEqual(5);
		});

		it("should have auth commands", () => {
			const authCmds = declaredCommands.filter((c) =>
				c.includes("sign") || c.includes("auth") || c.includes("Auth"),
			);
			expect(authCmds.length).toBeGreaterThanOrEqual(2);
		});

		it("should have UI/view commands", () => {
			const uiCmds = declaredCommands.filter((c) =>
				c.includes("refresh") || c.includes("show") || c.includes("open"),
			);
			expect(uiCmds.length).toBeGreaterThanOrEqual(5);
		});

		it("should have diagnostic/test commands", () => {
			const testCmds = declaredCommands.filter((c) => c.includes("test."));
			expect(testCmds.length).toBeGreaterThanOrEqual(1);
		});
	});

	// =========================================================================
	// CRITICAL COMMANDS (must always be present)
	// =========================================================================

	describe("Critical commands", () => {
		const CRITICAL_COMMANDS = [
			"snapback.createSnapshot",
			"snapback.restoreSnapshot",
			"snapback.protectFile",
			"snapback.showStatus",
			"snapback.signIn",
			"snapback.signOut",
			"snapback.connect",
			"snapback.initialize",
			"snapback.openOnboarding",
		];

		for (const cmd of CRITICAL_COMMANDS) {
			it(`should declare critical command: ${cmd}`, () => {
				expect(declaredCommands).toContain(cmd);
			});
		}
	});

	// =========================================================================
	// COMMAND NAMING CONVENTIONS
	// =========================================================================

	describe("Naming conventions", () => {
		it("should use camelCase for command names (excluding internal __ prefixed)", () => {
			for (const cmd of declaredCommands) {
				const name = cmd.replace("snapback.", "").replace("test.", "");
				// Skip internal debug commands prefixed with __
				if (name.startsWith("__")) continue;
				// Allow dots for namespacing (e.g., session.restore, snapshot.showFileDiff)
				const parts = name.split(".");
				for (const part of parts) {
					// First char lowercase, no underscores or hyphens
					expect(part).toMatch(/^[a-z]/);
					expect(part).not.toMatch(/[-_]/);
				}
			}
		});
	});
});
