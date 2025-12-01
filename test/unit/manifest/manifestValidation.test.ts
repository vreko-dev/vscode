import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Package Manifest Validation", () => {
	describe("Command Declaration Validation", () => {
		it("should declare all referenced commands in contributes.commands", async () => {
			// Read the package.json
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);

			// Get all declared commands
			const declaredCommands = new Set(
				(packageJson.contributes?.commands || []).map(
					(cmd: any) => cmd.command,
				),
			);

			// Get all referenced commands in menus
			const referencedCommands = new Set<string>();

			// Check menus for command references
			const menus = packageJson.contributes?.menus || {};
			for (const menuItems of Object.values(menus)) {
				if (Array.isArray(menuItems)) {
					for (const item of menuItems) {
						if (item.command) {
							referencedCommands.add(item.command);
						}
					}
				}
			}

			// Check commandPalette for when conditions that might reference commands
			const commandPalette =
				packageJson.contributes?.menus?.commandPalette || [];
			for (const item of commandPalette) {
				if (item.command) {
					referencedCommands.add(item.command);
				}
			}

			// Check walkthroughs for completionEvents
			const walkthroughs = packageJson.contributes?.walkthroughs || [];
			for (const walkthrough of walkthroughs) {
				if (walkthrough.steps) {
					for (const step of walkthrough.steps) {
						if (step.completionEvents) {
							for (const event of step.completionEvents) {
								// Extract command from events like "onCommand:snapback.protectFile"
								const commandMatch = event.match(/onCommand:(.+)/);
								if (commandMatch) {
									referencedCommands.add(commandMatch[1]);
								}
							}
						}
					}
				}
			}

			// Identify missing command declarations
			const missingCommands: string[] = [];
			for (const command of referencedCommands) {
				// Skip built-in VS Code commands - they don't need to be declared in our manifest
				if (command.startsWith("vscode.")) {
					continue;
				}
				// For extension commands, they should definitely be declared
				if (command.startsWith("snapback.") && !declaredCommands.has(command)) {
					missingCommands.push(command);
				}
			}

			// All referenced commands should be declared
			expect(missingCommands).toHaveLength(0);
			if (missingCommands.length > 0) {
				throw new Error(
					`The following commands are referenced but not declared in contributes.commands: ${missingCommands.join(
						", ",
					)}`,
				);
			}
		});

		it("should not have duplicate command declarations", async () => {
			// Read the package.json
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);

			// Get all declared commands
			const declaredCommands = packageJson.contributes?.commands || [];
			const commandIds = declaredCommands.map((cmd: any) => cmd.command);

			// Check for duplicates
			const uniqueCommands = new Set<string>();
			const duplicates: string[] = [];

			for (const commandId of commandIds) {
				if (uniqueCommands.has(commandId)) {
					duplicates.push(commandId);
				} else {
					uniqueCommands.add(commandId);
				}
			}

			expect(duplicates).toHaveLength(0);
			if (duplicates.length > 0) {
				throw new Error(
					`Duplicate command declarations found: ${duplicates.join(", ")}`,
				);
			}
		});
	});

	describe("Native Module Validation", () => {
		it("should list better-sqlite3 in dependencies", async () => {
			// Read the package.json
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);

			// Check that better-sqlite3 is listed in dependencies
			expect(packageJson.dependencies).toHaveProperty("better-sqlite3");
			expect(packageJson.devDependencies).toHaveProperty(
				"@types/better-sqlite3",
			);
		});

		it("should have packaging scripts that handle native modules", async () => {
			// Read the package.json
			const packageJsonPath = path.join(__dirname, "../../../package.json");
			const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
			const packageJson = JSON.parse(packageJsonContent);

			// Check that scripts exist for packaging with native module handling
			const scripts = packageJson.scripts || {};

			// Should have a package-vsce script
			expect(scripts).toHaveProperty("package-vsce");

			// Should have a package-vsce-no-deps script for CI
			expect(scripts).toHaveProperty("package-vsce-no-deps");

			// Should have packaging scripts
			expect(scripts).toHaveProperty("package-vsix");
		});
	});
});
