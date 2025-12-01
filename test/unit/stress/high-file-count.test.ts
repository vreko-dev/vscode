import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckpointManager } from "../../../src/checkpoint/CheckpointManager.js";
import { CheckpointStorageAdapter } from "../../../src/checkpoint/CheckpointStorageAdapter.js";
import { VSCodeConfirmationService } from "../../../src/checkpoint/VSCodeConfirmationService.js";
import { NotificationManager } from "../../../src/notificationManager.js";
import { OperationCoordinator } from "../../../src/operationCoordinator.js";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry.js";
import { isBetterSqlite3Available } from "../../../src/storage/SqliteCheckpointStorage.js";
import { SqliteStorageAdapter } from "../../../src/storage/SqliteStorageAdapter.js";
import { ProtectionDecorationProvider } from "../../../src/ui/ProtectionDecorationProvider.js";
import { WorkspaceMemoryManager } from "../../../src/workspaceMemory.js";

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
			withProgress: vi
				.fn()
				.mockImplementation((_options, task) => task({ report: vi.fn() })),
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

describeIfSqlite("High File Count Stress Tests", () => {
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
	let protectionDecorationProvider: ProtectionDecorationProvider;

	beforeEach(async () => {
		// Create temporary directory for testing
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-stress-"));
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

	describe("Large Scale Checkpoint Operations", () => {
		it("should handle 1000 files in a single checkpoint", async () => {
			const fileCount = 1000;
			const files: string[] = [];

			// Create 1000 files
			for (let i = 0; i < fileCount; i++) {
				const fileName = `file${i.toString().padStart(4, "0")}.ts`;
				const filePath = path.join(workspaceDir, "src", fileName);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(
					filePath,
					`// Content of file ${i}\nexport const value${i} = ${i};`,
				);
				files.push(filePath);
			}

			// Time the checkpoint creation
			const startTime = Date.now();
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, files);
			const endTime = Date.now();

			expect(checkpointId).toBeDefined();
			expect(endTime - startTime).toBeLessThan(30000); // Should complete within 30 seconds

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(fileCount);
				}
			}

			// Verify checkpoint manager can list it
			const checkpoints = await checkpointManager.getAll();
			expect(checkpoints.length).toBeGreaterThan(0);
		}, 60000); // 60 second timeout

		it("should handle 5000 files with varying content sizes", async () => {
			const fileCount = 5000;
			const files: string[] = [];

			// Create files with varying sizes
			for (let i = 0; i < fileCount; i++) {
				const fileName = `file${i.toString().padStart(5, "0")}.txt`;
				const filePath = path.join(workspaceDir, "data", fileName);
				await fs.mkdir(path.dirname(filePath), { recursive: true });

				// Vary content size: small (1 line), medium (100 lines), large (1000 lines)
				let content = "";
				const sizeCategory = i % 3;
				switch (sizeCategory) {
					case 0: // Small
						content = `Small file ${i}`;
						break;
					case 1: // Medium
						content = `Medium file ${i}\n`.repeat(100);
						break;
					case 2: // Large
						content = `Large file ${i}\n`.repeat(1000);
						break;
				}

				await fs.writeFile(filePath, content);
				files.push(filePath);
			}

			// Time the checkpoint creation
			const startTime = Date.now();
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, files);
			const endTime = Date.now();

			expect(checkpointId).toBeDefined();
			expect(endTime - startTime).toBeLessThan(60000); // Should complete within 60 seconds

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(fileCount);
				}
			}
		}, 120000); // 2 minute timeout

		it("should handle 10000 small files efficiently", async () => {
			const fileCount = 10000;
			const files: string[] = [];

			// Create 10000 small files
			for (let i = 0; i < fileCount; i++) {
				const fileName = `small${i.toString().padStart(5, "0")}.js`;
				const filePath = path.join(workspaceDir, "lib", fileName);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, `console.log('File ${i}');`);
				files.push(filePath);
			}

			// Time the checkpoint creation
			const startTime = Date.now();
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, files);
			const endTime = Date.now();

			expect(checkpointId).toBeDefined();
			expect(endTime - startTime).toBeLessThan(45000); // Should complete within 45 seconds

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(fileCount);
				}
			}
		}, 90000); // 90 second timeout
	});

	describe("Protected File Registry Stress", () => {
		it("should handle adding/removing 5000 protected files", async () => {
			const fileCount = 5000;
			const files: string[] = [];

			// Create files
			for (let i = 0; i < fileCount; i++) {
				const fileName = `protected${i.toString().padStart(4, "0")}.ts`;
				const filePath = path.join(workspaceDir, "protected", fileName);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, `// Protected file ${i}`);
				files.push(filePath);
			}

			// Add all files to protection registry
			const addStartTime = Date.now();
			for (const file of files) {
				await protectedFileRegistry.add(file, {
					protectionLevel: "watch",
				});
			}
			const addEndTime = Date.now();

			// Verify all files are protected
			for (const file of files) {
				expect(protectedFileRegistry.isProtected(file)).toBe(true);
			}

			expect(addEndTime - addStartTime).toBeLessThan(10000); // Should complete within 10 seconds

			// Test listing performance
			const listStartTime = Date.now();
			const protectedFiles = await protectedFileRegistry.list();
			const listEndTime = Date.now();

			expect(protectedFiles.length).toBe(fileCount);
			expect(listEndTime - listStartTime).toBeLessThan(1000); // Should be very fast

			// Remove all files from protection registry
			const removeStartTime = Date.now();
			for (const file of files) {
				await protectedFileRegistry.remove(file);
			}
			const removeEndTime = Date.now();

			// Verify all files are no longer protected
			for (const file of files) {
				expect(protectedFileRegistry.isProtected(file)).toBe(false);
			}

			expect(removeEndTime - removeStartTime).toBeLessThan(10000); // Should complete within 10 seconds
		}, 60000); // 60 second timeout

		it("should handle rapid protection level updates", async () => {
			const fileCount = 1000;
			const files: string[] = [];

			// Create and protect files
			for (let i = 0; i < fileCount; i++) {
				const fileName = `rapid${i.toString().padStart(4, "0")}.ts`;
				const filePath = path.join(workspaceDir, "rapid", fileName);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, `// Rapid file ${i}`);
				files.push(filePath);
				await protectedFileRegistry.add(filePath, {
					protectionLevel: "watch",
				});
			}

			// Rapidly update protection levels
			const updateStartTime = Date.now();
			for (let i = 0; i < fileCount; i++) {
				const level = i % 3 === 0 ? "watch" : i % 3 === 1 ? "warn" : "block";
				await protectedFileRegistry.updateProtectionLevel(files[i], level);
			}
			const updateEndTime = Date.now();

			// Verify all levels were updated
			for (let i = 0; i < fileCount; i++) {
				const expectedLevel =
					i % 3 === 0 ? "watch" : i % 3 === 1 ? "warn" : "block";
				expect(protectedFileRegistry.getProtectionLevel(files[i])).toBe(
					expectedLevel,
				);
			}

			expect(updateEndTime - updateStartTime).toBeLessThan(5000); // Should complete within 5 seconds
		}, 30000); // 30 second timeout
	});

	describe("Memory and Performance Stress", () => {
		it("should maintain stable memory usage with large checkpoints", async () => {
			// This test focuses on ensuring memory doesn't grow unbounded
			const fileCount = 2000;
			const files: string[] = [];

			// Create large files (10KB each)
			for (let i = 0; i < fileCount; i++) {
				const fileName = `large${i.toString().padStart(4, "0")}.txt`;
				const filePath = path.join(workspaceDir, "large", fileName);
				await fs.mkdir(path.dirname(filePath), { recursive: true });

				// Create 10KB of content
				const content = "A".repeat(10000);
				await fs.writeFile(filePath, content);
				files.push(filePath);
			}

			// Monitor memory before checkpoint
			const memoryBefore = process.memoryUsage();

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, files);

			// Monitor memory after checkpoint
			const memoryAfter = process.memoryUsage();

			expect(checkpointId).toBeDefined();

			// Memory usage should not increase dramatically
			const memoryIncrease = memoryAfter.heapUsed - memoryBefore.heapUsed;
			expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
			}
		}, 120000); // 2 minute timeout

		it("should handle concurrent checkpoint operations", async () => {
			const fileGroups = [
				Array.from({ length: 500 }, (_, i) =>
					path.join(workspaceDir, "group1", `file${i}.ts`),
				),
				Array.from({ length: 500 }, (_, i) =>
					path.join(workspaceDir, "group2", `file${i}.ts`),
				),
				Array.from({ length: 500 }, (_, i) =>
					path.join(workspaceDir, "group3", `file${i}.ts`),
				),
			];

			// Create all files
			for (const group of fileGroups) {
				for (const file of group) {
					await fs.mkdir(path.dirname(file), { recursive: true });
					await fs.writeFile(file, `// Content for ${file}`);
				}
			}

			// Start concurrent checkpoint operations
			const startTime = Date.now();
			const checkpointPromises = fileGroups.map((files, _index) =>
				operationCoordinator.coordinateCheckpointCreation(true, files),
			);

			const checkpointIds = await Promise.all(checkpointPromises);
			const endTime = Date.now();

			// Verify all checkpoints were created
			expect(checkpointIds.length).toBe(3);
			for (const id of checkpointIds) {
				expect(id).toBeDefined();
			}

			// Should complete within reasonable time
			expect(endTime - startTime).toBeLessThan(45000); // 45 seconds

			// Verify all checkpoints exist
			for (const id of checkpointIds) {
				if (id) {
					const checkpoint = await storage.retrieve(id);
					expect(checkpoint).toBeDefined();
					if (checkpoint?.files) {
						expect(checkpoint.files.length).toBe(500);
					}
				}
			}
		}, 90000); // 90 second timeout
	});

	describe("Edge Case Stress Tests", () => {
		it("should handle files with very long paths", async () => {
			const fileCount = 100;
			const files: string[] = [];

			// Create files with very long paths
			for (let i = 0; i < fileCount; i++) {
				// Create a path with many directory levels
				let dirPath = workspaceDir;
				for (let j = 0; j < 20; j++) {
					dirPath = path.join(dirPath, `level${j.toString().padStart(2, "0")}`);
				}

				const fileName = `longpath${i.toString().padStart(3, "0")}.ts`;
				const filePath = path.join(dirPath, fileName);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, `// Long path file ${i}`);
				files.push(filePath);
			}

			// Create checkpoint with long path files
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, files);

			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(fileCount);
				}
			}
		}, 60000); // 60 second timeout

		it("should handle files with special characters in names", async () => {
			const specialFiles = [
				path.join(workspaceDir, "special", "file with spaces.ts"),
				path.join(workspaceDir, "special", "file-with-dashes.ts"),
				path.join(workspaceDir, "special", "file_with_underscores.ts"),
				path.join(workspaceDir, "special", "文件.ts"), // Unicode
				path.join(workspaceDir, "special", "file@domain.com.ts"),
				path.join(workspaceDir, "special", "file#1.ts"),
				path.join(workspaceDir, "special", "file$2.ts"),
				path.join(workspaceDir, "special", "file%3.ts"),
				path.join(workspaceDir, "special", "file^4.ts"),
				path.join(workspaceDir, "special", "file&5.ts"),
			];

			// Create files with special characters
			for (const file of specialFiles) {
				await fs.mkdir(path.dirname(file), { recursive: true });
				await fs.writeFile(file, `// Special file: ${path.basename(file)}`);
			}

			// Create checkpoint with special character files
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(
					true,
					specialFiles,
				);

			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(specialFiles.length);
				}
			}

			// Test protection registry with special characters
			for (const file of specialFiles) {
				await protectedFileRegistry.add(file, {
					protectionLevel: "watch",
				});
				expect(protectedFileRegistry.isProtected(file)).toBe(true);
			}
		}, 30000); // 30 second timeout
	});
});
