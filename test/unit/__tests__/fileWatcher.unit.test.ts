import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as vscode from "vscode";
import { FileSystemWatcher } from "@vscode/protection/FileSystemWatcher";
import { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";

describe("File System Watcher Tests", () => {
	let registry: ProtectedFileRegistry;
	let fileWatcher: FileSystemWatcher;
	let testFileUri: vscode.Uri;
	let mockStorage: Map<string, any>;

	beforeEach(async () => {
		// Create a proper storage mock that actually stores data
		mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		registry = new ProtectedFileRegistry(mockState as any);
		// IMPORTANT: Create the file system watcher to handle file deletions
		fileWatcher = new FileSystemWatcher(registry);

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		testFileUri = vscode.Uri.joinPath(workspaceFolder.uri, "test-watch.ts");

		await vscode.workspace.fs.writeFile(
			testFileUri,
			Buffer.from('console.log("test");'),
		);
	});

	afterEach(async () => {
		try {
			await vscode.workspace.fs.delete(testFileUri);
		} catch {
			// Ignore
		}
		fileWatcher.dispose();
		await registry.clearAll();
	});

	it("Should initialize file watcher without errors", () => {
		// Just verify the watcher was created successfully
		expect(fileWatcher).toBeDefined();
	});

	it("Should not crash when disposed", () => {
		// Verify disposal works
		expect(() => fileWatcher.dispose()).not.toThrow();
	});

	it("Should allow registry to remove protected files", async () => {
		// Protect file
		await registry.add(testFileUri.fsPath);

		// Verify it's protected
		expect(registry.isProtected(testFileUri.fsPath)).toBe(true);

		// Manually remove from registry (simulating what the watcher does)
		await registry.remove(testFileUri.fsPath);

		// Verify it's removed from registry
		expect(registry.isProtected(testFileUri.fsPath)).toBe(false);
	});

	// Note: Testing the actual file system events would require a real VS Code environment
	// These tests verify the watcher can be created and disposed properly
	// Integration tests in a real VS Code extension host would test the event handling
});
