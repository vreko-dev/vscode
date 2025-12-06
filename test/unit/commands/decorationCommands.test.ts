import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { registerDecorationCommands } from "../../../src/commands/decorationCommands";
import { FileHealthDecorationProvider } from "../../../src/decorations/FileHealthDecorationProvider";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";

describe("Decoration Commands", () => {
	let context: vscode.ExtensionContext;
	let decorationProvider: FileHealthDecorationProvider;
	let registry: ProtectedFileRegistry;
	let disposables: vscode.Disposable[];

	beforeEach(() => {
		// Create mock context
		context = {
			subscriptions: [],
		} as any;

		// Create decoration provider and registry
		decorationProvider = new FileHealthDecorationProvider();
		registry = new ProtectedFileRegistry({} as any);

		// Register commands
		const commandContext = {
			fileHealthDecorationProvider: decorationProvider,
			protectedFileRegistry: registry,
		} as any;

		disposables = registerDecorationCommands(context, commandContext);
	});

	afterEach(() => {
		// Dispose of commands
		disposables.forEach((d) => d.dispose());
		decorationProvider.dispose();
	});

	it("should clear all file health decorations", async () => {
		const clearAllSpy = vi.spyOn(decorationProvider, "clearAll");

		// Execute command
		await vscode.commands.executeCommand("snapback.clearFileHealthDecorations");

		// Verify clearAll was called
		expect(clearAllSpy).toHaveBeenCalled();
	});

	it("should refresh file health decorations", async () => {
		const clearAllSpy = vi.spyOn(decorationProvider, "clearAll");
		const listSpy = vi.spyOn(registry, "list").mockResolvedValue([]);

		// Execute command
		await vscode.commands.executeCommand(
			"snapback.refreshFileHealthDecorations",
		);

		// Verify clearAll was called
		expect(clearAllSpy).toHaveBeenCalled();
		expect(listSpy).toHaveBeenCalled();
	});

	it("should show file health status for active editor", async () => {
		const getFileHealthSpy = vi
			.spyOn(decorationProvider, "getFileHealth")
			.mockReturnValue(undefined);

		// Mock active editor
		Object.defineProperty(vscode.window, "activeTextEditor", {
			value: {
				document: {
					uri: vscode.Uri.file("/test/file.ts"),
				},
			},
			writable: true,
		});

		// Execute command
		await vscode.commands.executeCommand("snapback.showFileHealthStatus");

		// Verify getFileHealth was called
		expect(getFileHealthSpy).toHaveBeenCalledWith(
			vscode.Uri.file("/test/file.ts"),
		);
	});
});
