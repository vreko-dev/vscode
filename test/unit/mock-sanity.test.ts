import { describe, it, expect } from "vitest";
import * as vscode from "vscode";

/**
 * Global Mock Sanity Tests
 *
 * These tests verify that the global mock in setup.ts provides
 * all required VS Code APIs with proper structures.
 *
 * If these tests fail, the setup.ts mock needs to be enhanced.
 * Do NOT add vi.mock("vscode") to this file - it should use the global mock.
 */
describe("Global Mock Sanity", () => {
	describe("workspace API", () => {
		it("workspace.getConfiguration returns proper mock", () => {
			const config = vscode.workspace.getConfiguration("snapback");
			expect(config.get).toBeDefined();
			expect(typeof config.get).toBe("function");
			expect(config.get("someKey", "default")).toBe("default");
		});

		it("workspace.fs.stat returns proper structure with type", async () => {
			const uri = vscode.Uri.file("/test/path");
			const stat = await vscode.workspace.fs.stat(uri);
			expect(stat).toBeDefined();
			expect(stat.type).toBe(1); // FileType.File
			expect(stat.size).toBeDefined();
		});

		it("workspace.workspaceFolders is defined", () => {
			expect(vscode.workspace.workspaceFolders).toBeDefined();
			expect(Array.isArray(vscode.workspace.workspaceFolders)).toBe(true);
		});
	});

	describe("extensions API", () => {
		it("extensions.getExtension returns proper mock", () => {
			const ext = vscode.extensions.getExtension("snapback.snapback");
			expect(ext).toBeDefined();
			expect(ext?.packageJSON.version).toBe("1.0.0-test");
		});
	});

	describe("Uri API", () => {
		it("Uri.file returns proper structure", () => {
			const uri = vscode.Uri.file("/test/path");
			expect(uri.fsPath).toBe("/test/path");
			expect(uri.scheme).toBe("file");
		});

		it("Uri.joinPath works correctly", () => {
			const base = vscode.Uri.file("/base");
			const joined = vscode.Uri.joinPath(base, "subdir", "file.ts");
			expect(joined.fsPath).toBe("/base/subdir/file.ts");
		});
	});

	describe("window API", () => {
		it("window.createStatusBarItem returns proper mock", () => {
			const item = vscode.window.createStatusBarItem();
			expect(item.show).toBeDefined();
			expect(typeof item.show).toBe("function");
			expect(item.text).toBe("");
		});

		it("window.withProgress executes callback", async () => {
			let callbackExecuted = false;
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification },
				async (progress) => {
					callbackExecuted = true;
					expect(progress.report).toBeDefined();
					return "result";
				},
			);
			expect(callbackExecuted).toBe(true);
		});

		it("window.createQuickPick returns proper mock", () => {
			const quickPick = vscode.window.createQuickPick();
			expect(quickPick.show).toBeDefined();
			expect(quickPick.onDidAccept).toBeDefined();
			expect(quickPick.items).toBeDefined();
		});

		it("window.tabGroups is defined", () => {
			expect(vscode.window.tabGroups).toBeDefined();
			expect(vscode.window.tabGroups.all).toBeDefined();
		});
	});

	describe("class exports", () => {
		it("MarkdownString class works correctly", () => {
			const md = new vscode.MarkdownString("initial");
			expect(md.value).toBe("initial");
			md.appendText(" more");
			expect(md.value).toBe("initial more");
			md.appendMarkdown("**bold**");
			expect(md.value).toContain("**bold**");
		});

		it("TreeItem class is constructable", () => {
			const item = new vscode.TreeItem("label", vscode.TreeItemCollapsibleState.Collapsed);
			expect(item.label).toBe("label");
			expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
		});

		it("EventEmitter class is constructable", () => {
			const emitter = new vscode.EventEmitter();
			expect(emitter.fire).toBeDefined();
			expect(emitter.dispose).toBeDefined();
		});

		it("Position class is constructable", () => {
			const pos = new vscode.Position(10, 5);
			expect(pos.line).toBe(10);
			expect(pos.character).toBe(5);
		});

		it("Range class is constructable", () => {
			const start = new vscode.Position(0, 0);
			const end = new vscode.Position(10, 20);
			const range = new vscode.Range(start, end);
			expect(range.start).toBe(start);
			expect(range.end).toBe(end);
		});
	});

	describe("enums", () => {
		it("FileType enum values are correct", () => {
			expect(vscode.FileType.File).toBe(1);
			expect(vscode.FileType.Directory).toBe(2);
		});

		it("TreeItemCollapsibleState enum values are correct", () => {
			expect(vscode.TreeItemCollapsibleState.None).toBe(0);
			expect(vscode.TreeItemCollapsibleState.Collapsed).toBe(1);
			expect(vscode.TreeItemCollapsibleState.Expanded).toBe(2);
		});

		it("ProgressLocation enum values are correct", () => {
			expect(vscode.ProgressLocation.Notification).toBe(15);
		});
	});

	describe("authentication API", () => {
		it("authentication.registerAuthenticationProvider is defined", () => {
			expect(vscode.authentication.registerAuthenticationProvider).toBeDefined();
		});
	});
});
