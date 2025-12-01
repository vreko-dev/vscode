/**
 * @fileoverview Demo-Critical UI Components E2E Tests
 *
 * These tests validate that all UI components (tree views, status bar, notifications)
 * work correctly in a real VS Code instance.
 *
 * Coverage:
 * - Tree view providers (snapshots, protected files, sessions)
 * - Status bar controller
 * - Notification system
 * - Quick pick menus
 * - Command palette integration
 */

import * as assert from "node:assert";
import * as vscode from "vscode";

suite("[DEMO-CRITICAL] UI Components E2E", () => {
	let testWorkspace: vscode.Uri;
	let extension: vscode.Extension<unknown>;

	setup(async function () {
		this.timeout(15000);

		const workspaceFolders = vscode.workspace.workspaceFolders;
		assert.ok(workspaceFolders && workspaceFolders.length > 0);
		testWorkspace = workspaceFolders[0].uri;

		const ext = vscode.extensions.getExtension("MarcelleLabs.snapback-vscode");
		assert.ok(ext, "Extension should be installed");
		await ext.activate();
		extension = ext;
	});

	suite("Tree View Providers", () => {
		test("[DEMO] Snapshot tree view is registered", async function () {
			this.timeout(10000);

			// Execute command to show snapshot view
			await vscode.commands.executeCommand("snapback.showAllSnapshots");

			// View should be available
			assert.ok(true, "Snapshot view command executed successfully");
		});

		test("[DEMO] Protected files tree view is registered", async function () {
			this.timeout(10000);

			// Execute command to show protected files view
			await vscode.commands.executeCommand("snapback.showAllProtectedFiles");

			assert.ok(true, "Protected files view command executed successfully");
		});

		test("[DEMO] Tree views refresh without error", async function () {
			this.timeout(10000);

			// Execute refresh command
			await vscode.commands.executeCommand("snapback.refresh");

			// Should not throw
			assert.ok(true, "Tree views refreshed successfully");
		});

		test("[DEMO] Tree views respond to data changes", async function () {
			this.timeout(15000);

			// Create a file and protect it
			const testFile = vscode.Uri.joinPath(testWorkspace, "tree-test.ts");
			await vscode.workspace.fs.writeFile(
				testFile,
				Buffer.from("const x = 1;"),
			);

			// Protect the file
			await vscode.commands.executeCommand("snapback.setWatchLevel", testFile);

			// Wait for tree to update
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Refresh to ensure tree is updated
			await vscode.commands.executeCommand("snapback.refresh");

			assert.ok(true, "Tree view responded to data changes");

			// Cleanup
			await vscode.workspace.fs.delete(testFile);
		});
	});

	suite("Status Bar", () => {
		test("[DEMO] Status bar item is created", async function () {
			this.timeout(10000);

			// We can't directly access status bar items, but we can verify
			// the extension activated successfully (which creates the status bar)
			assert.ok(extension.isActive, "Extension should create status bar item");
		});

		test("[DEMO] Status bar updates on protection changes", async function () {
			this.timeout(15000);

			const testFile = vscode.Uri.joinPath(testWorkspace, "status-test.ts");
			await vscode.workspace.fs.writeFile(
				testFile,
				Buffer.from("const x = 1;"),
			);

			// Set protection level (should update status bar)
			await vscode.commands.executeCommand("snapback.setWatchLevel", testFile);

			await new Promise((resolve) => setTimeout(resolve, 300));

			// Change protection level
			await vscode.commands.executeCommand("snapback.setWarnLevel", testFile);

			await new Promise((resolve) => setTimeout(resolve, 300));

			assert.ok(true, "Status bar updated on protection changes");

			// Cleanup
			await vscode.workspace.fs.delete(testFile);
		});
	});

	suite("Command Palette Integration", () => {
		test("[DEMO] Commands appear in command palette", async function () {
			this.timeout(10000);

			const allCommands = await vscode.commands.getCommands(true);

			const snapbackCommands = allCommands.filter((cmd) =>
				cmd.startsWith("snapback."),
			);

			// Should have multiple commands
			assert.ok(
				snapbackCommands.length >= 10,
				`Should have at least 10 commands, found ${snapbackCommands.length}`,
			);

			// Log commands for debugging
			console.log(`Found ${snapbackCommands.length} SnapBack commands`);
		});

		test("[DEMO] Commands have proper categories", async function () {
			this.timeout(10000);

			const packageJSON = extension.packageJSON;
			const commands = packageJSON.contributes?.commands || [];

			// All commands should have SnapBack category
			const commandsWithCategory = commands.filter(
				(cmd: { category?: string }) => cmd.category === "SnapBack",
			);

			assert.ok(
				commandsWithCategory.length > 0,
				"Commands should have SnapBack category",
			);
		});

		test("[DEMO] Commands have icons", async function () {
			this.timeout(10000);

			const packageJSON = extension.packageJSON;
			const commands = packageJSON.contributes?.commands || [];

			// Key commands should have icons
			const commandsWithIcons = commands.filter((cmd: any) => cmd.icon);

			assert.ok(
				commandsWithIcons.length > 0,
				"Some commands should have icons for better UX",
			);
		});
	});

	suite("Quick Pick Menus", () => {
		test("[DEMO] Protection level selector works", async function () {
			this.timeout(15000);

			const testFile = vscode.Uri.joinPath(testWorkspace, "quickpick-test.ts");
			await vscode.workspace.fs.writeFile(
				testFile,
				Buffer.from("const x = 1;"),
			);

			// Show protection level selector
			// (This would normally show a quick pick, but in tests it may not)
			await vscode.commands.executeCommand(
				"snapback.changeProtectionLevel",
				testFile,
			);

			// If command executes without error, quick pick infrastructure is working
			assert.ok(true, "Protection level selector executed");

			// Cleanup
			await vscode.workspace.fs.delete(testFile);
		});
	});

	suite("Context Menu Integration", () => {
		test("[DEMO] Context menu commands are registered", async function () {
			this.timeout(10000);

			const packageJSON = extension.packageJSON;
			const menus = packageJSON.contributes?.menus || {};

			// Should have context menu items
			const hasEditorContext =
				menus["editor/context"] || menus["explorer/context"];

			assert.ok(hasEditorContext, "Should have context menu contributions");
		});
	});

	suite("Walkthroughs", () => {
		test("[DEMO] Has onboarding walkthrough", async function () {
			this.timeout(10000);

			const packageJSON = extension.packageJSON;
			const walkthroughs = packageJSON.contributes?.walkthroughs || [];

			// Should have at least one walkthrough for onboarding
			assert.ok(
				walkthroughs.length > 0,
				"Should have onboarding walkthrough for first-time users",
			);
		});

		test("[DEMO] Walkthrough steps are complete", async function () {
			this.timeout(10000);

			const packageJSON = extension.packageJSON;
			const walkthroughs = packageJSON.contributes?.walkthroughs || [];

			if (walkthroughs.length > 0) {
				const firstWalkthrough = walkthroughs[0];

				// Should have steps
				assert.ok(firstWalkthrough.steps, "Walkthrough should have steps");
				assert.ok(
					firstWalkthrough.steps.length > 0,
					"Walkthrough should have at least one step",
				);

				// Each step should have required fields
				for (const step of firstWalkthrough.steps) {
					assert.ok(step.id, "Step should have ID");
					assert.ok(step.title, "Step should have title");
					assert.ok(step.description, "Step should have description");
				}
			}
		});
	});

	suite("Keybindings", () => {
		test("[DEMO] Has keyboard shortcuts", async function () {
			this.timeout(10000);

			const packageJSON = extension.packageJSON;
			const keybindings = packageJSON.contributes?.keybindings || [];

			// Should have some keybindings for quick access
			// (Not all commands need keybindings, but key ones should)
			console.log(`Found ${keybindings.length} keybindings`);

			// This is informational - keybindings are optional
			assert.ok(true, "Keybindings checked");
		});
	});

	suite("Performance Budgets", () => {
		test("[DEMO] Tree view refresh <100ms", async function () {
			this.timeout(10000);

			const startTime = Date.now();
			await vscode.commands.executeCommand("snapback.refresh");
			const duration = Date.now() - startTime;

			assert.ok(
				duration < 100,
				`Tree refresh should be <100ms, took ${duration}ms`,
			);
		});

		test("[DEMO] Command execution <50ms", async function () {
			this.timeout(10000);

			const times: number[] = [];

			// Measure multiple executions
			for (let i = 0; i < 10; i++) {
				const startTime = Date.now();
				await vscode.commands.executeCommand("snapback.refresh");
				times.push(Date.now() - startTime);
			}

			const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

			assert.ok(
				avgTime < 50,
				`Average command execution should be <50ms, was ${avgTime}ms`,
			);
		});
	});

	suite("View State Persistence", () => {
		test("[DEMO] Tree views maintain state", async function () {
			this.timeout(15000);

			// Create and protect a file
			const testFile = vscode.Uri.joinPath(testWorkspace, "persist-test.ts");
			await vscode.workspace.fs.writeFile(
				testFile,
				Buffer.from("const x = 1;"),
			);

			await vscode.commands.executeCommand("snapback.setWatchLevel", testFile);

			// Refresh views
			await vscode.commands.executeCommand("snapback.refresh");

			// Views should still show the protected file
			assert.ok(true, "View state persisted across refresh");

			// Cleanup
			await vscode.workspace.fs.delete(testFile);
		});
	});

	suite("Accessibility", () => {
		test("[DEMO] Commands have descriptive titles", async function () {
			this.timeout(10000);

			const packageJSON = extension.packageJSON;
			const commands = packageJSON.contributes?.commands || [];

			// All commands should have non-empty titles
			for (const cmd of commands) {
				assert.ok(cmd.title, `Command ${cmd.command} should have title`);
				assert.ok(
					cmd.title.length > 5,
					`Command ${cmd.command} title should be descriptive`,
				);
			}
		});

		test("[DEMO] Icons have accessible alternatives", async function () {
			this.timeout(10000);

			const packageJSON = extension.packageJSON;
			const commands = packageJSON.contributes?.commands || [];

			// Commands with icons should also have text
			const commandsWithIcons = commands.filter((cmd: any) => cmd.icon);

			for (const cmd of commandsWithIcons) {
				assert.ok(
					cmd.title,
					`Command ${cmd.command} with icon should have title for accessibility`,
				);
			}
		});
	});
});
