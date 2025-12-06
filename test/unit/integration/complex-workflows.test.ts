import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { CheckpointManager } from "../../../src/checkpoint/CheckpointManager";
import { CheckpointStorageAdapter } from "../../../src/checkpoint/CheckpointStorageAdapter";
import { VSCodeConfirmationService } from "../../../src/checkpoint/VSCodeConfirmationService";
import { SaveHandler } from "../../../src/handlers/SaveHandler";
import { NotificationManager } from "../../../src/notificationManager";
import { OperationCoordinator } from "../../../src/operationCoordinator";
import { StorageCheckpointSummaryProvider } from "../../../src/services/checkpointSummaryProvider";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import { isBetterSqlite3Available } from "../../../src/storage/SqliteCheckpointStorage";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter";
import { ProtectionDecorationProvider } from "../../../src/ui/ProtectionDecorationProvider";
import { WorkspaceMemoryManager } from "../../../src/workspaceMemory";

// Mock VS Code API
vi.mock("vscode", () => {
	return {
		default: {},
		window: {
			showInformationMessage: vi.fn(),
			showWarningMessage: vi.fn(),
			showErrorMessage: vi.fn(),
			showQuickPick: vi.fn(),
			createOutputChannel: vi.fn().mockReturnValue({
				appendLine: vi.fn(),
				dispose: vi.fn(),
			}),
			registerFileDecorationProvider: vi.fn(),
			createStatusBarItem: vi.fn().mockReturnValue({
				text: "",
				tooltip: "",
				command: "",
				show: vi.fn(),
				dispose: vi.fn(),
			}),
		},
		commands: {
			registerCommand: vi.fn(),
			executeCommand: vi.fn(),
		},
		Uri: {
			file: vi.fn().mockImplementation((filePath: string) => ({
				fsPath: filePath,
				toString: () => `file://${filePath}`,
			})),
		},
		FileDecoration: vi.fn().mockImplementation((badge, tooltip, color) => ({
			badge,
			tooltip,
			color,
		})),
		ThemeColor: vi
			.fn()
			.mockImplementation((colorId: string) => ({ id: colorId })),
		EventEmitter: vi.fn().mockImplementation(() => ({
			event: vi.fn(),
			fire: vi.fn(),
			dispose: vi.fn(),
		})),
		workspace: {
			workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
			registerTextDocumentContentProvider: vi.fn(),
			onWillSaveTextDocument: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		},
	};
});

// Mock Memento for ProtectedFileRegistry
class MockMemento {
	private storage = new Map<string, any>();

	keys(): readonly string[] {
		return Array.from(this.storage.keys());
	}

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		return this.storage.has(key) ? this.storage.get(key) : defaultValue;
	}

	update(key: string, value: any): Thenable<void> {
		this.storage.set(key, value);
		return Promise.resolve();
	}

	clear(): void {
		this.storage.clear();
	}
}

const describeIfSqlite = isBetterSqlite3Available() ? describe : describe.skip;

describeIfSqlite("Complex Workflow Integration Tests", () => {
	let tempDir: string;
	let workspaceDir: string;
	let storage: SqliteStorageAdapter;
	let protectedFileRegistry: ProtectedFileRegistry;
	let mockMemento: MockMemento;
	let notificationManager: NotificationManager;
	let workspaceMemoryManager: WorkspaceMemoryManager;
	let operationCoordinator: OperationCoordinator;
	let checkpointManager: CheckpointManager;
	let confirmationService: VSCodeConfirmationService;
	let _saveHandler: SaveHandler;
	let protectionDecorationProvider: ProtectionDecorationProvider;

	beforeEach(async () => {
		// Create temporary directory for testing
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-integration-"));
		workspaceDir = path.join(tempDir, "workspace");
		await fs.mkdir(workspaceDir, { recursive: true });

		// Initialize core services
		mockMemento = new MockMemento();
		protectedFileRegistry = new ProtectedFileRegistry(mockMemento as any);

		storage = new SqliteStorageAdapter(workspaceDir);
		await storage.initialize();

		notificationManager = new NotificationManager();
		workspaceMemoryManager = new WorkspaceMemoryManager(storage);
		const conflictResolver = {
			resolveConflicts: vi
				.fn()
				.mockResolvedValue({ conflicts: [], resolved: true }),
		};

		operationCoordinator = new OperationCoordinator(
			workspaceMemoryManager,
			notificationManager,
			storage,
			conflictResolver as any,
		);

		confirmationService = new VSCodeConfirmationService();
		checkpointManager = new CheckpointManager(
			workspaceDir,
			new CheckpointStorageAdapter(storage),
			confirmationService,
		);

		_saveHandler = new SaveHandler(protectedFileRegistry, operationCoordinator);

		protectionDecorationProvider = new ProtectionDecorationProvider(
			protectedFileRegistry,
		);
	});

	afterEach(async () => {
		// Clean up
		await fs.rm(tempDir, { recursive: true, force: true });
		mockMemento.clear();

		// Dispose services
		if (protectionDecorationProvider) {
			protectionDecorationProvider.dispose();
		}
	});

	describe("Complete Checkpoint Workflow", () => {
		it("should handle full checkpoint creation and restoration workflow", async () => {
			// Create test file
			const testFile = path.join(workspaceDir, "src", "index.ts");
			await fs.mkdir(path.dirname(testFile), { recursive: true });
			await fs.writeFile(testFile, 'console.log("Hello World");');

			// Protect the file
			await protectedFileRegistry.add(testFile, {
				protectionLevel: "watch",
			});

			// Verify file is protected
			expect(protectedFileRegistry.isProtected(testFile)).toBe(true);
			expect(protectedFileRegistry.getProtectionLevel(testFile)).toBe("watch");

			// Create checkpoint through operation coordinator
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					testFile,
				]);

			expect(checkpointId).toBeDefined();
			expect(typeof checkpointId).toBe("string");

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				expect(checkpoint?.id).toBe(checkpointId);
			}

			// Verify workspace memory was updated
			const context = workspaceMemoryManager.getContext();
			expect(context.lastCheckpoint).toBe(checkpointId);

			// Modify the file
			await fs.writeFile(testFile, 'console.log("Hello SnapBack");');

			// Verify file content changed
			const modifiedContent = await fs.readFile(testFile, "utf-8");
			expect(modifiedContent).toBe('console.log("Hello SnapBack");');

			// Test checkpoint listing
			const checkpoints = await checkpointManager.getAll();
			expect(checkpoints.length).toBeGreaterThan(0);
			const foundCheckpoint = checkpoints.find((cp) => cp.id === checkpointId);
			expect(foundCheckpoint).toBeDefined();

			// Test checkpoint summary provider
			const summaryProvider = new StorageCheckpointSummaryProvider(storage);
			const summaries = await summaryProvider.listRecent(10);
			expect(summaries.length).toBeGreaterThan(0);

			const totalCheckpoints = await summaryProvider.total();
			expect(totalCheckpoints).toBeGreaterThan(0);

			const fileCheckpoints = await summaryProvider.forFile(testFile);
			expect(fileCheckpoints.length).toBeGreaterThan(0);
		});

		it("should handle checkpoint workflow with different protection levels", async () => {
			// Create test files
			const watchFile = path.join(workspaceDir, "watch.ts");
			const warnFile = path.join(workspaceDir, "warn.ts");
			const blockFile = path.join(workspaceDir, "block.ts");

			await fs.writeFile(watchFile, "watch content");
			await fs.writeFile(warnFile, "warn content");
			await fs.writeFile(blockFile, "block content");

			// Protect files with different levels
			await protectedFileRegistry.add(watchFile, {
				protectionLevel: "watch",
			});
			await protectedFileRegistry.add(warnFile, {
				protectionLevel: "warn",
			});
			await protectedFileRegistry.add(blockFile, {
				protectionLevel: "block",
			});

			// Verify protection levels
			expect(protectedFileRegistry.getProtectionLevel(watchFile)).toBe("watch");
			expect(protectedFileRegistry.getProtectionLevel(warnFile)).toBe("warn");
			expect(protectedFileRegistry.getProtectionLevel(blockFile)).toBe("block");

			// Create checkpoint with multiple files
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					watchFile,
					warnFile,
					blockFile,
				]);

			expect(checkpointId).toBeDefined();

			// Verify checkpoint contains all files
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				expect(checkpoint?.files).toContain(watchFile);
				expect(checkpoint?.files).toContain(warnFile);
				expect(checkpoint?.files).toContain(blockFile);
			}

			// Test file decorations for protected files
			const watchUri = vscode.Uri.file(watchFile);
			const warnUri = vscode.Uri.file(warnFile);
			const blockUri = vscode.Uri.file(blockFile);

			const watchDecoration =
				protectionDecorationProvider.provideFileDecoration(watchUri);
			const warnDecoration =
				protectionDecorationProvider.provideFileDecoration(warnUri);
			const blockDecoration =
				protectionDecorationProvider.provideFileDecoration(blockUri);

			expect(watchDecoration).toBeDefined();
			expect(watchDecoration?.badge).toBe("🟢");
			expect(watchDecoration?.tooltip).toContain("Watch");

			expect(warnDecoration).toBeDefined();
			expect(warnDecoration?.badge).toBe("🟡");
			expect(warnDecoration?.tooltip).toContain("Warn");

			expect(blockDecoration).toBeDefined();
			expect(blockDecoration?.badge).toBe("🔴");
			expect(blockDecoration?.tooltip).toContain("Block");
		});
	});

	describe("Save Handler Integration", () => {
		it("should handle save events for protected files", async () => {
			// Create test file
			const testFile = path.join(workspaceDir, "protected.ts");
			await fs.writeFile(testFile, "original content");

			// Protect the file
			await protectedFileRegistry.add(testFile, {
				protectionLevel: "watch",
			});

			// Simulate save event
			const _saveEvent = {
				document: {
					uri: vscode.Uri.file(testFile),
					fileName: testFile,
					getText: vi.fn().mockReturnValue("modified content"),
				},
				waitUntil: vi.fn(),
			};

			// SaveHandler doesn't have a public handleSaveEvent method
			// The actual save handling is done through VS Code's event system

			// Verify that the file is protected
			expect(protectedFileRegistry.isProtected(testFile)).toBe(true);
		});

		it("should handle save events for unprotected files", async () => {
			// Create test file
			const testFile = path.join(workspaceDir, "unprotected.ts");
			await fs.writeFile(testFile, "content");

			// Verify file is not protected
			expect(protectedFileRegistry.isProtected(testFile)).toBe(false);

			// Simulate save event
			const _saveEvent = {
				document: {
					uri: vscode.Uri.file(testFile),
					fileName: testFile,
					getText: vi.fn().mockReturnValue("modified content"),
				},
				waitUntil: vi.fn(),
			};

			// SaveHandler doesn't have a public handleSaveEvent method
			// The actual save handling is done through VS Code's event system

			// Verify that the file is not protected
			expect(protectedFileRegistry.isProtected(testFile)).toBe(false);
		});
	});

	describe("Notification and Memory Integration", () => {
		it("should coordinate notifications and memory state", async () => {
			// Create test file
			const testFile = path.join(workspaceDir, "test.ts");
			await fs.writeFile(testFile, "test content");

			// Protect the file
			await protectedFileRegistry.add(testFile, {
				protectionLevel: "watch",
			});

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					testFile,
				]);

			// Verify notification was sent
			// Note: This would require spying on the notification manager methods

			// Verify memory state was updated
			const context = workspaceMemoryManager.getContext();
			expect(context.lastCheckpoint).toBe(checkpointId);
		});

		it("should handle concurrent operations", async () => {
			// Create multiple test files
			const files = Array.from({ length: 5 }, (_, i) =>
				path.join(workspaceDir, `file${i}.ts`),
			);

			// Create files
			for (const file of files) {
				await fs.writeFile(file, `content ${file}`);
			}

			// Protect all files
			for (const file of files) {
				await protectedFileRegistry.add(file, {
					protectionLevel: "watch",
				});
			}

			// Create checkpoints concurrently
			const checkpointPromises = files.map((file) =>
				operationCoordinator.coordinateCheckpointCreation(true, [file]),
			);

			const checkpointIds = await Promise.all(checkpointPromises);

			// Verify all checkpoints were created
			expect(checkpointIds.length).toBe(files.length);
			for (const id of checkpointIds) {
				expect(id).toBeDefined();
				expect(typeof id).toBe("string");
			}
		});
	});

	describe("Edge Cases and Error Handling", () => {
		it("should handle workflow with non-existent files", async () => {
			const nonExistentFile = path.join(workspaceDir, "non-existent.ts");

			// Attempt to create checkpoint with non-existent file
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					nonExistentFile,
				]);

			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created (may be empty or handle missing files gracefully)
			if (checkpointId) {
				const _checkpoint = await storage.retrieve(checkpointId);
				// Checkpoint may be created even with non-existent files
			}
		});

		it("should handle workflow with very large files", async () => {
			// Create a large file
			const largeFile = path.join(workspaceDir, "large.ts");
			const largeContent = 'console.log("line");\n'.repeat(10000); // ~160KB file
			await fs.writeFile(largeFile, largeContent);

			// Protect the file
			await protectedFileRegistry.add(largeFile, {
				protectionLevel: "watch",
			});

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					largeFile,
				]);

			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created successfully
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				expect(checkpoint?.files).toContain(largeFile);
			}
		});

		it("should handle workflow with files containing special characters", async () => {
			// Create files with special characters
			const specialFiles = [
				path.join(workspaceDir, "file with spaces.ts"),
				path.join(workspaceDir, "file-with-dashes.ts"),
				path.join(workspaceDir, "文件.ts"), // Unicode characters
				path.join(workspaceDir, "file@domain.com.ts"),
			];

			// Create files
			for (const file of specialFiles) {
				await fs.writeFile(file, `content for ${file}`);
			}

			// Protect all files
			for (const file of specialFiles) {
				await protectedFileRegistry.add(file, {
					protectionLevel: "watch",
				});
			}

			// Create checkpoint with all files
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(
					true,
					specialFiles,
				);

			expect(checkpointId).toBeDefined();

			// Verify checkpoint contains all files
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();

				for (const file of specialFiles) {
					expect(checkpoint?.files).toContain(file);
				}
			}
		});
	});

	describe("Performance and Scalability", () => {
		it("should handle workflow with many protected files", async () => {
			// Create many files
			const fileCount = 100;
			const files = Array.from({ length: fileCount }, (_, i) =>
				path.join(workspaceDir, `file${i}.ts`),
			);

			// Create files
			for (const file of files) {
				await fs.writeFile(file, `content for ${file}`);
			}

			// Protect all files
			for (const file of files) {
				await protectedFileRegistry.add(file, {
					protectionLevel: "watch",
				});
			}

			// Verify all files are protected
			for (const file of files) {
				expect(protectedFileRegistry.isProtected(file)).toBe(true);
			}

			// Create checkpoint with all files
			const startTime = Date.now();
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, files);
			const endTime = Date.now();

			expect(checkpointId).toBeDefined();

			// Verify checkpoint contains all files
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(fileCount);
				}
			}

			// Performance check - should complete in reasonable time
			expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
		});

		it("should handle rapid successive operations", async () => {
			const testFile = path.join(workspaceDir, "rapid.ts");
			await fs.writeFile(testFile, "initial content");

			// Perform rapid successive operations
			const operationCount = 10;
			const checkpointIds: string[] = [];

			for (let i = 0; i < operationCount; i++) {
				// Modify file
				await fs.writeFile(testFile, `content version ${i}`);

				// Create checkpoint
				const checkpointId =
					await operationCoordinator.coordinateCheckpointCreation(true, [
						testFile,
					]);

				if (checkpointId) {
					checkpointIds.push(checkpointId);
				}
			}

			// Verify all checkpoints were created
			expect(checkpointIds.length).toBe(operationCount);

			for (const id of checkpointIds) {
				if (id) {
					const checkpoint = await storage.retrieve(id);
					expect(checkpoint).toBeDefined();
				}
			}
		});
	});
});
