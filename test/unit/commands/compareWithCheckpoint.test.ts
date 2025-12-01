/**
 * @fileoverview Tests for Compare With Checkpoint Command
 *
 * These tests verify the implementation of the "Compare with Checkpoint" feature
 * that allows users to compare the current file with its most recent checkpoint
 * directly from the Explorer context menu and Command Palette.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

// Mock the specific functions we need
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: undefined as any,
		asRelativePath: vi.fn(),
	},
	window: {
		activeTextEditor: undefined as any,
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		tabGroups: {
			onDidChangeTabs: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			all: [],
		},
	},
	commands: {
		executeCommand: vi.fn(),
	},
	Uri: {
		parse: vi.fn().mockImplementation((str) => ({
			scheme: "snapback-checkpoint",
			path: str.replace("snapback-checkpoint:", ""),
		})),
		file: vi
			.fn()
			.mockImplementation((uriPath: string) => ({ fsPath: uriPath })),
	},
	TabInputTextDiff: class {},
}));

describe("Compare With Checkpoint Command", () => {
	// Import the function after mocking
	let compareWithCheckpoint: typeof import("../../../src/commands/compareWithCheckpoint").compareWithCheckpoint;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.mocked(vscode.workspace.asRelativePath).mockReset();

		// Dynamically import our function after mocks are set up
		const module = await import("../../../src/commands/compareWithCheckpoint");
		compareWithCheckpoint = module.compareWithCheckpoint;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("compareWithCheckpoint", () => {
		it("should show error message when no workspace folder is open", async () => {
			// Mock no workspace folders
			Object.defineProperty(vscode.workspace, "workspaceFolders", {
				value: undefined,
				writable: true,
			});

			await compareWithCheckpoint();

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"No workspace folder open",
			);
		});

		const setWorkspaceRoot = (rootPath: string) => {
			Object.defineProperty(vscode.workspace, "workspaceFolders", {
				value: [{ uri: { fsPath: rootPath }, name: "test", index: 0 }] as any,
				writable: true,
			});
			vi.mocked(vscode.workspace.asRelativePath).mockImplementation(
				(input: any) => {
					const fsPath = typeof input === "string" ? input : input.fsPath;
					return fsPath.startsWith(rootPath)
						? fsPath.slice(rootPath.length + 1)
						: fsPath;
				},
			);
		};

		it("should show error message when no file is selected", async () => {
			// Mock workspace folders but no active editor or selected file
			setWorkspaceRoot("/test/workspace");

			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: undefined,
				writable: true,
			});

			await compareWithCheckpoint();

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"No file selected",
			);
		});

		it("should show error message when no checkpoints exist for file", async () => {
			// Mock workspace folders and a selected file
			setWorkspaceRoot("/test/workspace");

			// Mock window.activeTextEditor to return a file
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: {
						uri: { fsPath: "/test/workspace/src/test.ts" },
					},
				} as any,
				writable: true,
			});

			// Mock storage to return no checkpoints
			const mockStorage = {
				list: vi.fn().mockResolvedValue([]),
			};

			await compareWithCheckpoint(mockStorage as any);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"No snapshots found for this file",
			);
		});

		it("should open diff editor with most recent checkpoint", async () => {
			// Mock workspace folders and a selected file
			setWorkspaceRoot("/test/workspace");

			// Mock window.activeTextEditor to return a file
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: {
						uri: { fsPath: "/test/workspace/src/test.ts" },
					},
				} as any,
				writable: true,
			});

			// Mock storage to return checkpoints
			const mockStorage = {
				list: vi.fn().mockResolvedValue([
					{
						id: "cp-1",
						timestamp: 1000,
						fileContents: { "src/test.ts": "checkpoint content" },
					},
					{
						id: "cp-2",
						timestamp: 2000,
						fileContents: {
							"src/test.ts": "newer checkpoint content",
						},
					},
				]),
			};

			// Mock CheckpointDocumentProvider
			const mockProvider = {
				setCheckpointContent: vi.fn(),
				clearContent: vi.fn(),
			};

			// Mock vscode.commands.executeCommand
			(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

			await compareWithCheckpoint(mockStorage as any, mockProvider as any);

			// Verify that Uri.parse was called correctly
			expect(vscode.Uri.parse).toHaveBeenCalledWith(
				"snapback-checkpoint:src/test.ts",
			);

			// Verify that the diff editor was opened with correct arguments
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vscode.diff",
				expect.objectContaining({
					path: "snapback-checkpoint:src/test.ts",
				}),
				expect.objectContaining({
					fsPath: "/test/workspace/src/test.ts",
				}),
				"Snapshot ← test.ts → Current",
			);

			// Verify that checkpoint content was set
			expect(mockProvider.setCheckpointContent).toHaveBeenCalledWith(
				"src/test.ts",
				"newer checkpoint content",
			);
		});

		it("should handle file path resolution correctly", async () => {
			// Mock workspace folders and a selected file with complex path
			setWorkspaceRoot("/test/workspace");

			// Mock window.activeTextEditor to return a file with nested path
			Object.defineProperty(vscode.window, "activeTextEditor", {
				value: {
					document: {
						uri: {
							fsPath: "/test/workspace/src/components/utils/helper.ts",
						},
					},
				} as any,
				writable: true,
			});

			// Mock storage to return checkpoints
			const mockStorage = {
				list: vi.fn().mockResolvedValue([
					{
						id: "cp-1",
						timestamp: 1000,
						fileContents: {
							"src/components/utils/helper.ts": "checkpoint content",
						},
					},
				]),
			};

			// Mock CheckpointDocumentProvider
			const mockProvider = {
				setCheckpointContent: vi.fn(),
				clearContent: vi.fn(),
			};

			// Mock vscode.commands.executeCommand
			(vscode.commands.executeCommand as any).mockResolvedValue(undefined);

			await compareWithCheckpoint(mockStorage as any, mockProvider as any);

			// Verify that Uri.parse was called correctly
			expect(vscode.Uri.parse).toHaveBeenCalledWith(
				"snapback-checkpoint:src/components/utils/helper.ts",
			);

			// Verify that the diff editor was opened with correct arguments
			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"vscode.diff",
				expect.objectContaining({
					path: "snapback-checkpoint:src/components/utils/helper.ts",
				}),
				expect.objectContaining({
					fsPath: "/test/workspace/src/components/utils/helper.ts",
				}),
				"Snapshot ← helper.ts → Current",
			);

			// Verify that checkpoint content was set with correct path
			expect(mockProvider.setCheckpointContent).toHaveBeenCalledWith(
				"src/components/utils/helper.ts",
				"checkpoint content",
			);
		});
	});
});
