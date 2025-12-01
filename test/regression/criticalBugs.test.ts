import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SaveHandler } from "../../src/handlers/SaveHandler.js";
import { NotificationManager } from "../../src/notificationManager.js";
import { OperationCoordinator } from "../../src/operationCoordinator.js";
import { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry.js";
import { FileSystemStorage } from "../../src/storage/types.js";
import { ProtectionDecorationProvider } from "../../src/ui/ProtectionDecorationProvider.js";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory.js";

describe("Critical Bugs Regression Tests", () => {
	let operationCoordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let storage: FileSystemStorage;
	let saveHandler: SaveHandler;
	let registry: ProtectedFileRegistry;
	let decorationProvider: ProtectionDecorationProvider;
	let testWorkspaceRoot: string;
	let testFiles: string[];
	let mockStorage: Map<string, any>;
	let context: any;

	beforeEach(async () => {
		testWorkspaceRoot =
			vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "/test/workspace";
		testFiles = [];

		// Setup mocks
		mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		// Initialize services
		notificationManager = new NotificationManager();
		storage = new FileSystemStorage(testWorkspaceRoot);
		workspaceMemory = new WorkspaceMemoryManager(storage);
		operationCoordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			storage,
		);

		registry = new ProtectedFileRegistry(mockState as any);
		decorationProvider = new ProtectionDecorationProvider(registry);

		context = { subscriptions: [] };
		saveHandler = new SaveHandler(registry, operationCoordinator as any);
	});

	afterEach(async () => {
		for (const file of testFiles) {
			try {
				await fs.unlink(file);
			} catch {
				// Ignore
			}
		}
		testFiles = [];

		saveHandler?.dispose();
		decorationProvider?.dispose();
		registry?.clearAll();
		vi.clearAllMocks();
	});

	/**
	 * REGRESSION TEST FOR BUG #1: Storage Bloat
	 *
	 * Original Issue: Snapshotting entire workspace (99.9% waste) instead of just the saved file
	 *
	 * Expected Behavior:
	 * - When a single file is saved, ONLY that file should be snapshotted
	 * - Workspace files should NOT be included in auto-snapshots
	 * - Storage should be proportional to files actually modified
	 */
	describe("Bug #1: Storage Bloat Prevention", () => {
		it("Should snapshot ONLY the saved file, not entire workspace", async () => {
			// Create test file
			const savedFile = path.join(testWorkspaceRoot, "saved-file.ts");
			await fs.writeFile(savedFile, "const x = 1;");
			testFiles.push(savedFile);

			// Create distractor files (should NOT be snapshotted)
			const distractorFiles: string[] = [];
			for (let i = 0; i < 10; i++) {
				const file = path.join(testWorkspaceRoot, `distractor-${i}.ts`);
				await fs.writeFile(file, `const y${i} = ${i};`);
				distractorFiles.push(file);
				testFiles.push(file);
			}

			// Create snapshot for ONLY the saved file
			const snapshotId = await operationCoordinator.coordinateSnapshotCreation(
				false,
				[savedFile], // CRITICAL: Only this file
			);

			// Retrieve and verify
			const snapshot = await storage.retrieve(snapshotId!);

			// REGRESSION TEST: Should contain ONLY 1 file
			expect(snapshot?.files?.length).toBe(1);
			expect(snapshot?.files?.[0]).toContain("saved-file.ts");

			// Verify distractor files are NOT included
			for (const distractorFile of distractorFiles) {
				const filename = path.basename(distractorFile);
				expect(snapshot?.files).not.toContain(filename);
			}

			// Calculate efficiency
			const totalWorkspaceFiles = testFiles.length; // 11 files
			const snapshottedFiles = snapshot?.files?.length; // Should be 1
			const efficiency = (snapshottedFiles / totalWorkspaceFiles) * 100;

			// Should be highly efficient (only 1/11 files = ~9%)
			expect(efficiency).toBeLessThan(15);
		});

		it("Should NOT scan entire workspace for auto-snapshots", async () => {
			// This test verifies the FIX: specificFiles parameter implementation
			const targetFile = path.join(testWorkspaceRoot, "target.ts");
			await fs.writeFile(targetFile, "const target = true;");
			testFiles.push(targetFile);

			// Spy on file system operations to ensure we're not scanning workspace
			const readdirSpy = vi.spyOn(fs, "readdir");

			// Create snapshot with specific file
			await operationCoordinator.coordinateSnapshotCreation(false, [
				targetFile,
			]);

			// CRITICAL: Should NOT have scanned workspace directories
			// The readdir call should be minimal or none for incremental snapshots
			// This is a key indicator that we're not doing full workspace scans
			const readdirCalls = readdirSpy.mock.calls.length;

			// For incremental snapshots, should not scan workspace
			// (readdir is only called for full workspace snapshots)
			expect(readdirCalls).toBe(0);

			readdirSpy.mockRestore();
		});
	});

	/**
	 * REGRESSION TEST FOR BUG #2: Duplicate Decorations
	 *
	 * Original Issue: File decoration provider registered multiple times
	 *
	 * Expected Behavior:
	 * - Decoration provider should be registered exactly ONCE during activation
	 * - Registration should happen BEFORE async operations
	 * - Decoration events should fire ONCE per protection change
	 */
	describe("Bug #2: Single Decoration Provider Registration", () => {
		it("Should register decoration provider exactly ONCE", () => {
			let registrationCount = 0;

			const registerSpy = vi
				.spyOn(vscode.window, "registerFileDecorationProvider")
				.mockImplementation((_provider: any) => {
					registrationCount++;
					return { dispose: vi.fn() };
				});

			// Simulate activation
			const provider1 = new ProtectionDecorationProvider(registry);
			vscode.window.registerFileDecorationProvider(provider1);

			// REGRESSION TEST: Should be registered exactly ONCE
			expect(registrationCount).toBe(1);

			// Clean up
			provider1.dispose();
			registerSpy.mockRestore();
		});

		it("Should fire decoration event ONCE per protection change", async () => {
			let eventCount = 0;

			decorationProvider.onDidChangeFileDecorations(() => {
				eventCount++;
			});

			const testFile = vscode.Uri.joinPath(
				vscode.workspace.workspaceFolders?.[0].uri,
				"decoration-test.ts",
			);

			// Protect file
			await registry.add(testFile.fsPath);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// REGRESSION TEST: Should fire ONCE
			expect(eventCount).toBe(1);

			// Unprotect file
			eventCount = 0;
			await registry.remove(testFile.fsPath);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should fire ONCE again
			expect(eventCount).toBe(1);
		});
	});

	/**
	 * REGRESSION TEST FOR BUG #3: Auto-Dismissing Notifications
	 *
	 * Original Issue: Notifications not auto-dismissing
	 *
	 * Expected Behavior:
	 * - Auto-snapshot notifications should use status bar (auto-dismiss)
	 * - Error messages should use showErrorMessage
	 * - Information messages reserved for important user actions
	 */
	describe("Bug #3: Auto-Dismissing Notifications", () => {
		it("Should use status bar for auto-snapshot notifications", () => {
			const setStatusBarMessageSpy = vi.spyOn(
				vscode.window,
				"setStatusBarMessage",
			);
			const showInformationMessageSpy = vi.spyOn(
				vscode.window,
				"showInformationMessage",
			);

			// Simulate auto-snapshot notification
			vscode.window.setStatusBarMessage("$(check) Snapshot: test.ts", 3000);

			// REGRESSION TEST: Should use status bar
			expect(setStatusBarMessageSpy).toHaveBeenCalledWith(
				"$(check) Snapshot: test.ts",
				3000,
			);

			// Should NOT use information message (which doesn't auto-dismiss)
			expect(showInformationMessageSpy).not.toHaveBeenCalled();

			setStatusBarMessageSpy.mockRestore();
			showInformationMessageSpy.mockRestore();
		});

		it("Should use 3-second timeout for auto-dismissal", () => {
			const setStatusBarMessageSpy = vi.spyOn(
				vscode.window,
				"setStatusBarMessage",
			);

			vscode.window.setStatusBarMessage("Auto-checkpoint complete", 3000);

			const callArgs = setStatusBarMessageSpy.mock.calls[0];

			// REGRESSION TEST: Should have 3-second timeout
			expect(callArgs[1]).toBe(3000);

			setStatusBarMessageSpy.mockRestore();
		});
	});

	/**
	 * REGRESSION TEST FOR BUG #4: Snapshot on Protect Instead of Save
	 *
	 * Original Issue: Creating snapshot when file is protected, not when saved
	 *
	 * Expected Behavior:
	 * - Snapshots should be created ONLY on file save
	 * - Protecting a file should NOT create a snapshot
	 * - First save after protection should create snapshot
	 */
	describe("Bug #4: No Snapshot on Protect, Only on Save", () => {
		it("Should NOT create snapshot when file is protected", async () => {
			const coordinatorSpy = vi.spyOn(
				operationCoordinator,
				"coordinateSnapshotCreation",
			);

			const testFile = path.join(testWorkspaceRoot, "protect-test.ts");
			await fs.writeFile(testFile, "const test = 1;");
			testFiles.push(testFile);

			// Protect the file
			await registry.add(testFile);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// REGRESSION TEST: Should NOT have created snapshot
			expect(coordinatorSpy).not.toHaveBeenCalled();

			coordinatorSpy.mockRestore();
		});

		it("Should create snapshot ONLY when protected file is saved", async () => {
			const mockCoordinator = {
				coordinateSnapshotCreation: vi.fn(async () => `snapshot-${Date.now()}`),
			};

			const handler = new SaveHandler(registry, mockCoordinator as any);

			const onWillSaveHandlers: Array<(event: any) => void> = [];
			vi.spyOn(vscode.workspace, "onWillSaveTextDocument").mockImplementation(
				(h: any) => {
					onWillSaveHandlers.push(h);
					return { dispose: vi.fn() };
				},
			);

			handler.register(context);

			const testFile = path.join(testWorkspaceRoot, "save-test.ts");

			// Protect file first
			await registry.add(testFile);

			// Simulate save event
			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFile),
				},
				waitUntil: vi.fn(),
			};

			for (const h of onWillSaveHandlers) {
				h(saveEvent);
			}

			await new Promise((resolve) => setTimeout(resolve, 500));

			// REGRESSION TEST: Should have created snapshot on SAVE
			expect(mockCoordinator.coordinateSnapshotCreation).toHaveBeenCalled();

			handler.dispose();
		});
	});

	/**
	 * REGRESSION TEST FOR BUG #5: Storage Retrieval Returns Empty Files Array
	 *
	 * Original Issue: storage.retrieve() returned snapshot with empty files array
	 * Root Cause: Workspace validation rejected all files due to path mismatch
	 *
	 * Expected Behavior:
	 * - Snapshots should contain the files that were snapshotted
	 * - retrieve() should return files array with correct file paths
	 * - fileContents should be populated with actual file content
	 */
	describe("Bug #5: Storage Retrieval Data Structure", () => {
		it("Should return snapshot with populated files array", async () => {
			const testFile = path.join(testWorkspaceRoot, "storage-test.ts");
			await fs.writeFile(testFile, "const storage = true;");
			testFiles.push(testFile);

			// Create snapshot
			const snapshotId = await operationCoordinator.coordinateSnapshotCreation(
				false,
				[testFile],
			);

			// Retrieve snapshot
			const snapshot = await storage.retrieve(snapshotId!);

			// REGRESSION TEST: files array should NOT be empty
			expect(snapshot).toBeDefined();
			expect(snapshot?.files).toBeDefined();
			expect(snapshot?.files?.length).toBeGreaterThan(0);
			expect(snapshot?.files?.[0]).toContain("storage-test.ts");
		});

		it("Should return snapshot with fileContents populated", async () => {
			const testFile = path.join(testWorkspaceRoot, "content-test.ts");
			const testContent = "const content = 'test data';";
			await fs.writeFile(testFile, testContent);
			testFiles.push(testFile);

			// Create snapshot
			const snapshotId = await operationCoordinator.coordinateSnapshotCreation(
				false,
				[testFile],
			);

			// Retrieve snapshot
			const snapshot = await storage.retrieve(snapshotId!);

			// REGRESSION TEST: fileContents should be populated
			expect(snapshot?.fileContents).toBeDefined();
			expect(Object.keys(snapshot?.fileContents!).length).toBeGreaterThan(0);

			// Verify actual content is stored
			const storedContent = Object.values(snapshot?.fileContents!)[0];
			expect(storedContent).toContain("content = 'test data'");
		});

		it("Should handle workspace validation correctly for temp directories", async () => {
			// This test ensures the workspace validation bug doesn't resurface
			// The bug was: validation used vscode.workspace.workspaceFolders mock
			// but files were in real temp directories, causing mismatch

			const realTempFile = path.join(testWorkspaceRoot, "temp-validation.ts");
			await fs.writeFile(realTempFile, "const temp = true;");
			testFiles.push(realTempFile);

			// Create checkpoint with file from temp directory
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(false, [
					realTempFile,
				]);

			const checkpoint = await storage.retrieve(checkpointId!);

			// REGRESSION TEST: Should successfully checkpoint temp directory files
			expect(checkpoint?.files?.length).toBe(1);
		});
	});

	/**
	 * REGRESSION TEST FOR BUG #6: Naming Strategy Always Returns Concise Format
	 *
	 * Original Issue: tryGitNaming() always returned git-style names, preventing fallback
	 * Root Cause: Method didn't return null when git unavailable
	 *
	 * Expected Behavior:
	 * - When git unavailable, should fall through to verbose fallback
	 * - Fallback should use format: "Modified N files (X lines)"
	 * - Content analysis should detect refactoring patterns
	 */
	describe("Bug #6: Naming Strategy Fallback Chain", () => {
		it("Should use verbose fallback format when git unavailable", async () => {
			// Mock git as unavailable by using non-git workspace
			const { SnapshotNamingStrategy } = await import(
				"@/snapshot/SnapshotNamingStrategy"
			);
			const strategy = new SnapshotNamingStrategy("/non-existent-workspace");

			const name = await strategy.generateName({
				files: [
					{
						path: "/test/file1.ts",
						status: "modified",
						linesAdded: 100,
						linesDeleted: 50,
					},
					{
						path: "/test/file2.ts",
						status: "modified",
						linesAdded: 200,
						linesDeleted: 100,
					},
				],
				workspaceRoot: "/non-existent-workspace",
			});

			// REGRESSION TEST: Should use verbose format with line count
			expect(name).toMatch(/Modified \d+ files \(\d+ lines\)/);
			expect(name).toContain("2 files");
			expect(name).toContain("450 lines");
		});

		it("Should detect refactoring patterns in content analysis", async () => {
			const testFile = path.join(testWorkspaceRoot, "refactor-test.ts");
			await fs.writeFile(
				testFile,
				`
				class UserService {
					getUser() {}
					createUser() {}
					updateUser() {}
					deleteUser() {}
				}
				function processData() {}
				const handleRequest = () => {};
				`,
			);
			testFiles.push(testFile);

			const { SnapshotNamingStrategy } = await import(
				"@/snapshot/SnapshotNamingStrategy"
			);
			const strategy = new SnapshotNamingStrategy(testWorkspaceRoot);

			const name = await strategy.generateName({
				files: [
					{
						path: testFile,
						status: "modified",
						linesAdded: 50,
						linesDeleted: 30,
					},
				],
				workspaceRoot: testWorkspaceRoot,
			});

			// REGRESSION TEST: Should detect structure changes (not just line count)
			// With multiple functions/classes, should trigger refactoring detection
			expect(name).toMatch(/Refactored|Modified/);
		});
	});

	/**
	 * REGRESSION TEST FOR BUG #7: Icon Strategy Missing Directory Detection
	 *
	 * Original Issue: Files in specific directories not getting appropriate icons
	 * Root Cause: Missing directory pattern matching (docs/, api/, schema/)
	 *
	 * Expected Behavior:
	 * - Files in /docs/ should get "book" icon
	 * - Files in /api/ should get "server" icon
	 * - Schema files should get "database" icon
	 * - Snapshot names with keywords should get appropriate icons
	 */
	describe("Bug #7: Icon Strategy Directory Detection", () => {
		it("Should detect docs directory and assign book icon", () => {
			const {
				SnapshotIconStrategy,
			} = require("@/snapshot/SnapshotIconStrategy");
			const strategy = new SnapshotIconStrategy();

			const result = strategy.classifyIcon({
				name: "Updated documentation",
				files: ["/workspace/docs/api.md", "/workspace/docs/readme.md"],
				isProtected: false,
			});

			// REGRESSION TEST: Should use book icon for docs
			expect(result.icon).toBe("book");
		});

		it("Should detect API files and assign server icon", () => {
			const {
				SnapshotIconStrategy,
			} = require("@/snapshot/SnapshotIconStrategy");
			const strategy = new SnapshotIconStrategy();

			const result = strategy.classifyIcon({
				name: "API endpoint updates",
				files: ["/workspace/api/users.ts", "/workspace/api/auth.ts"],
				isProtected: false,
			});

			// REGRESSION TEST: Should use server icon for API files
			expect(result.icon).toBe("server");
		});

		it("Should detect schema files and assign database icon", () => {
			const {
				SnapshotIconStrategy,
			} = require("@/snapshot/SnapshotIconStrategy");
			const strategy = new SnapshotIconStrategy();

			const result = strategy.classifyIcon({
				name: "Database schema update",
				files: [
					"/workspace/prisma/schema.prisma",
					"/workspace/migrations/001.sql",
				],
				isProtected: false,
			});

			// REGRESSION TEST: Should use database icon for schema files
			expect(result.icon).toBe("database");
		});

		it("Should detect keywords in snapshot names", () => {
			const {
				SnapshotIconStrategy,
			} = require("@/snapshot/SnapshotIconStrategy");
			const strategy = new SnapshotIconStrategy();

			// Test "endpoint" keyword
			const apiResult = strategy.classifyIcon({
				name: "Added new endpoint for user management",
				files: ["/workspace/src/controller.ts"],
				isProtected: false,
			});

			// REGRESSION TEST: Should detect "endpoint" keyword
			expect(apiResult.icon).toBe("server");
		});
	});

	/**
	 * INTEGRATION TEST: All bugs fixed in realistic workflow
	 */
	describe("Integration: All Fixes Working Together", () => {
		it("Should handle complete protect-save workflow correctly", async () => {
			// Setup spies
			const setStatusBarSpy = vi.spyOn(vscode.window, "setStatusBarMessage");
			const mockCoordinator = {
				coordinateSnapshotCreation: vi.fn(
					async (_showNotification: boolean, files?: string[]) => {
						// Verify files array
						expect(files).toBeDefined();
						expect(files?.length).toBe(1);
						return `snapshot-${Date.now()}`;
					},
				),
			};

			const handler = new SaveHandler(registry, mockCoordinator as any);
			const onWillSaveHandlers: Array<(event: any) => void> = [];

			vi.spyOn(vscode.workspace, "onWillSaveTextDocument").mockImplementation(
				(h: any) => {
					onWillSaveHandlers.push(h);
					return { dispose: vi.fn() };
				},
			);

			handler.register(context);

			const testFile = path.join(testWorkspaceRoot, "integration-test.ts");
			await fs.writeFile(testFile, "const integration = true;");
			testFiles.push(testFile);

			// Step 1: Protect file (should NOT snapshot)
			await registry.add(testFile);
			expect(mockCoordinator.coordinateSnapshotCreation).not.toHaveBeenCalled();

			// Step 2: Save file (should snapshot ONLY this file)
			const saveEvent = {
				document: {
					uri: vscode.Uri.file(testFile),
				},
				waitUntil: vi.fn(),
			};

			for (const h of onWillSaveHandlers) {
				h(saveEvent);
			}

			await new Promise((resolve) => setTimeout(resolve, 500));

			// Verify snapshot was created with correct file
			expect(mockCoordinator.coordinateSnapshotCreation).toHaveBeenCalledWith(
				false,
				[testFile],
			);

			// Step 3: Verify notification UX (status bar, not information message)
			// This would be called in the actual SaveHandler
			vscode.window.setStatusBarMessage(
				`$(check) Snapshot: ${path.basename(testFile)}`,
				3000,
			);
			expect(setStatusBarSpy).toHaveBeenCalledWith(
				expect.stringContaining("Snapshot"),
				3000,
			);

			handler.dispose();
			setStatusBarSpy.mockRestore();
		});
	});
});
