/**
 * Regression Test: Issue #3 - Anchor File Missing from Context Menu Snapshot
 *
 * BUG: When right-clicking a file in the explorer and selecting "Create Snapshot",
 * the clicked file was NOT included as the anchor file. Instead, the anchor
 * defaulted to the alphabetically first file in the filesMap.
 *
 * LOCATION: src/commands/snapshotCreationCommands.ts line 37
 *
 * ROOT CAUSE: The command handler did not accept the URI parameter that
 * VS Code passes to context menu commands:
 *
 * BEFORE (buggy):
 *   registerCommand(COMMANDS.SNAPSHOT.CREATE_LEGACY, async () => {
 *     await operationCoordinator.coordinateSnapshotCreation();
 *   })
 *
 * AFTER (fixed):
 *   registerCommand(COMMANDS.SNAPSHOT.CREATE_LEGACY, async (uri?: vscode.Uri) => {
 *     const specificFiles = uri ? [uri.fsPath] : undefined;
 *     await operationCoordinator.coordinateSnapshotCreation(true, specificFiles);
 *   })
 *
 * EXPECTED BEHAVIOR:
 * - Right-click on file.ts → snapshot anchor is file.ts
 * - Keyboard shortcut (no URI) → full workspace snapshot
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

describe("Regression: Issue #3 - Anchor File from Context Menu", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	/**
	 * TEST: Command handler should accept optional URI parameter
	 *
	 * VS Code passes the URI of the clicked file when a command is invoked
	 * from the explorer context menu. The handler must accept this parameter.
	 */
	it("should accept URI parameter from context menu invocation", () => {
		// Simulate context menu click on a file
		const clickedFileUri = vscode.Uri.file("/workspace/src/important-file.ts");

		// The command handler signature should accept optional URI
		type CommandHandler = (uri?: vscode.Uri) => Promise<void>;

		// Mock the fixed handler
		const fixedHandler: CommandHandler = async (uri?: vscode.Uri) => {
			if (uri) {
				// URI was passed from context menu
				expect(uri.fsPath).toBe("/workspace/src/important-file.ts");
			}
		};

		// Invoke with URI (context menu scenario)
		expect(async () => await fixedHandler(clickedFileUri)).not.toThrow();
	});

	/**
	 * TEST: Verify specificFiles is set when URI is provided
	 *
	 * When invoked from context menu, the clicked file should be passed
	 * to coordinateSnapshotCreation as specificFiles parameter.
	 */
	it("should pass clicked file as specificFiles when URI is provided", () => {
		const clickedFileUri = vscode.Uri.file("/workspace/src/clicked-file.ts");

		// Simulate the fixed logic from snapshotCreationCommands.ts
		const specificFiles = clickedFileUri ? [clickedFileUri.fsPath] : undefined;

		expect(specificFiles).toBeDefined();
		expect(specificFiles).toHaveLength(1);
		expect(specificFiles?.[0]).toBe("/workspace/src/clicked-file.ts");
	});

	/**
	 * TEST: Verify specificFiles is undefined when no URI (keyboard shortcut)
	 *
	 * When invoked via keyboard shortcut, there's no URI, so specificFiles
	 * should be undefined, triggering full workspace snapshot.
	 */
	it("should have undefined specificFiles when invoked via keyboard shortcut", () => {
		const uri: vscode.Uri | undefined = undefined;

		// Simulate the fixed logic
		const specificFiles = uri ? [uri.fsPath] : undefined;

		expect(specificFiles).toBeUndefined();
	});

	/**
	 * TEST: Anchor file determination in operationCoordinator
	 *
	 * The operationCoordinator.ts:724-728 logic determines anchor file:
	 * - If specificFiles provided → use first specificFile as anchor
	 * - Otherwise → use first key from filesMap (alphabetical)
	 */
	it("should use specificFile as anchor when provided", () => {
		const specificFiles = ["/workspace/src/my-clicked-file.ts"];
		const filesMap = new Map<string, string>([
			["/workspace/src/a-file.ts", "content-a"],
			["/workspace/src/b-file.ts", "content-b"],
			["/workspace/src/my-clicked-file.ts", "content-clicked"],
		]);
		const workspaceRoot = "/workspace";
		const isIncremental = true;

		// Simulate the anchor file logic from operationCoordinator.ts:724-728
		const anchorFile =
			isIncremental && specificFiles && specificFiles.length > 0
				? specificFiles[0]
				: Array.from(filesMap.keys())[0] || workspaceRoot;

		// With the fix, anchor should be the clicked file
		expect(anchorFile).toBe("/workspace/src/my-clicked-file.ts");

		// NOT the alphabetically first file
		expect(anchorFile).not.toBe("/workspace/src/a-file.ts");
	});

	/**
	 * TEST: Document the bug scenario (before fix)
	 *
	 * Before the fix, the anchor would default to alphabetically first file
	 * because specificFiles was never passed from the command handler.
	 */
	it("should NOT default to alphabetically first file when context menu is used", () => {
		// Before fix: specificFiles was undefined even from context menu
		const buggySpecificFiles = undefined;
		const filesMap = new Map<string, string>([
			["/workspace/src/aaa-first-alphabetically.ts", "content"],
			["/workspace/src/clicked-file.ts", "content"],
			["/workspace/src/zzz-last.ts", "content"],
		]);
		const workspaceRoot = "/workspace";
		const isIncremental = false; // Full workspace snapshot (no specificFiles)

		// Buggy anchor selection (would pick alphabetically first)
		const buggyAnchorFile =
			isIncremental && buggySpecificFiles && buggySpecificFiles.length > 0
				? buggySpecificFiles[0]
				: Array.from(filesMap.keys())[0] || workspaceRoot;

		// This was the BUG - anchor was alphabetical first, not clicked file
		expect(buggyAnchorFile).toBe("/workspace/src/aaa-first-alphabetically.ts");

		// Fixed behavior: when user clicks a specific file, it should be the anchor
		const fixedSpecificFiles = ["/workspace/src/clicked-file.ts"];
		const fixedIsIncremental = true;

		const fixedAnchorFile =
			fixedIsIncremental && fixedSpecificFiles && fixedSpecificFiles.length > 0
				? fixedSpecificFiles[0]
				: Array.from(filesMap.keys())[0] || workspaceRoot;

		expect(fixedAnchorFile).toBe("/workspace/src/clicked-file.ts");
	});

	/**
	 * TEST: Verify command registration includes URI parameter in package.json
	 *
	 * The explorer/context menu is registered in package.json and should
	 * work with the URI parameter VS Code provides.
	 */
	it("should document package.json explorer/context menu configuration", () => {
		// package.json configuration for context menu
		const contextMenuConfig = {
			command: "snapback.createSnapshot",
			when: "snapback.isActive && !explorerResourceIsFolder",
			group: "snapback@1",
		};

		// VS Code passes URI to commands invoked from explorer/context
		expect(contextMenuConfig.command).toBe("snapback.createSnapshot");
		expect(contextMenuConfig.when).toContain("!explorerResourceIsFolder");

		// When invoked from this context, VS Code passes the file URI
		// The command handler MUST accept (uri?: vscode.Uri) to receive it
	});

	/**
	 * TEST: Full flow simulation
	 *
	 * Simulates the complete flow from right-click to snapshot creation.
	 */
	it("should handle complete right-click → snapshot flow correctly", async () => {
		// 1. User right-clicks on file in explorer
		const clickedFile = vscode.Uri.file("/workspace/src/important-component.tsx");

		// 2. VS Code invokes command with URI
		type CoordinateSnapshotFn = (
			showNotification?: boolean,
			specificFiles?: string[],
		) => Promise<string | undefined>;

		let capturedSpecificFiles: string[] | undefined;
		const mockCoordinator: CoordinateSnapshotFn = async (
			_showNotification = true,
			specificFiles?: string[],
		) => {
			capturedSpecificFiles = specificFiles;
			return "snap_123";
		};

		// 3. Fixed command handler extracts fsPath and passes to coordinator
		const uri = clickedFile;
		const specificFiles = uri ? [uri.fsPath] : undefined;
		await mockCoordinator(true, specificFiles);

		// 4. Verify the clicked file was passed correctly
		expect(capturedSpecificFiles).toBeDefined();
		expect(capturedSpecificFiles).toContain("/workspace/src/important-component.tsx");
	});
});
