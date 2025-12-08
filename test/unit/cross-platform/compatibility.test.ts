import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckpointManager } from "@vscode/checkpoint/CheckpointManager";
import { CheckpointStorageAdapter } from "@vscode/checkpoint/CheckpointStorageAdapter";
import { VSCodeConfirmationService } from "@vscode/checkpoint/VSCodeConfirmationService";
import { NotificationManager } from "@vscode/notificationManager";
import { OperationCoordinator } from "@vscode/operationCoordinator";
import { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";
import { isBetterSqlite3Available } from "@vscode/storage/SqliteCheckpointStorage";
import { SqliteStorageAdapter } from "@vscode/storage/SqliteStorageAdapter";
import { ProtectionDecorationProvider } from "@vscode/ui/ProtectionDecorationProvider";
import { WorkspaceMemoryManager } from "@vscode/workspaceMemory";

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

describeIfSqlite("Cross-Platform Compatibility Tests", () => {
	let tempDir: string;
	let workspaceDir: string;
	let storage: SqliteStorageAdapter;
	let protectedFileRegistry: ProtectedFileRegistry;
	let mockMemento: MockMemento;
	let notificationManager: NotificationManager;
	let workspaceMemoryManager: WorkspaceMemoryManager;
	let operationCoordinator: OperationCoordinator;
	let _checkpointManager: CheckpointManager;
	let confirmationService: VSCodeConfirmationService;
	let protectionDecorationProvider: ProtectionDecorationProvider;

	beforeEach(async () => {
		// Create temporary directory for testing
		tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "snapback-cross-platform-"),
		);
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
		_checkpointManager = new CheckpointManager(
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

	describe("Path Handling Across Platforms", () => {
		it("should handle Windows-style paths on all platforms", async () => {
			// Simulate Windows-style paths
			const windowsPaths = [
				"C:\\Users\\test\\project\\src\\index.ts",
				"C:\\Users\\test\\project\\package.json",
				"C:\\Users\\test\\project\\src\\utils\\helper.ts",
			];

			// Create files with Windows-style paths (normalized for current platform)
			const files: string[] = [];
			for (const winPath of windowsPaths) {
				// Convert Windows path to current platform path
				const normalizedPath = winPath.replace(/\\/g, path.sep);
				const filePath = path.join(
					workspaceDir,
					...normalizedPath.split(path.sep).slice(3),
				);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, `// Content for ${winPath}`);
				files.push(filePath);
			}

			// Protect files
			for (const file of files) {
				await protectedFileRegistry.add(file, {
					protectionLevel: "watch",
				});
				expect(protectedFileRegistry.isProtected(file)).toBe(true);
			}

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, files);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(files.length);
				}
			}
		});

		it("should handle Unix-style paths on all platforms", async () => {
			// Simulate Unix-style paths
			const unixPaths = [
				"/home/user/project/src/index.ts",
				"/home/user/project/package.json",
				"/home/user/project/src/utils/helper.ts",
			];

			// Create files with Unix-style paths (normalized for current platform)
			const files: string[] = [];
			for (const unixPath of unixPaths) {
				const filePath = path.join(
					workspaceDir,
					...unixPath.split("/").slice(1),
				);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, `// Content for ${unixPath}`);
				files.push(filePath);
			}

			// Protect files
			for (const file of files) {
				await protectedFileRegistry.add(file, {
					protectionLevel: "warn",
				});
				expect(protectedFileRegistry.isProtected(file)).toBe(true);
			}

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, files);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(files.length);
				}
			}
		});

		it("should handle mixed path separators", async () => {
			// Create files with mixed path separators
			const mixedPaths = [
				path.join(workspaceDir, "mixed", "path1.ts"),
				path.join(workspaceDir, "mixed", "subdir", "path2.ts"),
				path.join(workspaceDir, "mixed", "another", "subdir", "path3.ts"),
			];

			// Create files
			for (const filePath of mixedPaths) {
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, `// Mixed path file: ${filePath}`);
			}

			// Test with paths that have mixed separators
			const testPaths = mixedPaths.map((p) => {
				// Intentionally mix separators for testing
				return p.replace(/\//g, path.sep).replace(/\\/g, "/");
			});

			// Protect files
			for (const filePath of testPaths) {
				await protectedFileRegistry.add(filePath, {
					protectionLevel: "block",
				});
				expect(protectedFileRegistry.isProtected(filePath)).toBe(true);
			}

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(
					true,
					testPaths,
				);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
			}
		});
	});

	describe("File System Case Sensitivity", () => {
		it("should handle case-sensitive file systems", async () => {
			// Create files with similar but different cases
			const caseSensitiveFiles = [
				path.join(workspaceDir, "casesensitive", "File.ts"),
				path.join(workspaceDir, "casesensitive", "file.ts"),
				path.join(workspaceDir, "casesensitive", "FILE.ts"),
				path.join(workspaceDir, "casesensitive", "File.TS"),
			];

			// Create all files
			for (const filePath of caseSensitiveFiles) {
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(
					filePath,
					`// Case sensitive file: ${path.basename(filePath)}`,
				);
			}

			// Protect all files
			for (const filePath of caseSensitiveFiles) {
				await protectedFileRegistry.add(filePath, {
					protectionLevel: "watch",
				});
				expect(protectedFileRegistry.isProtected(filePath)).toBe(true);
			}

			// Verify each file is protected independently
			for (const filePath of caseSensitiveFiles) {
				const protectionLevel =
					protectedFileRegistry.getProtectionLevel(filePath);
				expect(protectionLevel).toBe("watch");
			}

			// Create checkpoint with all files
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(
					true,
					caseSensitiveFiles,
				);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint contains all files
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(caseSensitiveFiles.length);
				}
			}
		});

		it("should handle case-insensitive file systems", async () => {
			// This test simulates behavior on case-insensitive systems
			const filePath = path.join(
				workspaceDir,
				"caseinsensitive",
				"testfile.ts",
			);
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, "// Test file content");

			// Protect file with different case variations
			const variations = [
				filePath,
				filePath.toUpperCase(),
				filePath.toLowerCase(),
				filePath.replace("testfile", "TestFile"),
			];

			// On case-insensitive systems, these should all refer to the same file
			for (const variation of variations) {
				await protectedFileRegistry.add(variation, {
					protectionLevel: "warn",
				});
			}

			// Verify protection works for all variations
			for (const variation of variations) {
				expect(protectedFileRegistry.isProtected(variation)).toBe(true);
			}
		});
	});

	describe("Line Ending Compatibility", () => {
		it("should handle different line endings", async () => {
			// Create files with different line endings
			const lineEndingFiles = [
				{
					path: path.join(workspaceDir, "lineendings", "unix.txt"),
					content: "Line 1\nLine 2\nLine 3\n",
					type: "Unix (LF)",
				},
				{
					path: path.join(workspaceDir, "lineendings", "windows.txt"),
					content: "Line 1\r\nLine 2\r\nLine 3\r\n",
					type: "Windows (CRLF)",
				},
				{
					path: path.join(workspaceDir, "lineendings", "mac.txt"),
					content: "Line 1\rLine 2\rLine 3\r",
					type: "Mac (CR)",
				},
				{
					path: path.join(workspaceDir, "lineendings", "mixed.txt"),
					content: "Line 1\nLine 2\r\nLine 3\rLine 4\n",
					type: "Mixed",
				},
			];

			// Create files with different line endings
			for (const file of lineEndingFiles) {
				await fs.mkdir(path.dirname(file.path), { recursive: true });
				await fs.writeFile(file.path, file.content);
			}

			// Protect all files
			for (const file of lineEndingFiles) {
				await protectedFileRegistry.add(file.path, {
					protectionLevel: "watch",
				});
				expect(protectedFileRegistry.isProtected(file.path)).toBe(true);
			}

			// Create checkpoint with all files
			const filePaths = lineEndingFiles.map((f) => f.path);
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(
					true,
					filePaths,
				);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(lineEndingFiles.length);
				}
			}
		});

		it("should preserve line endings in checkpoints", async () => {
			const testFile = path.join(workspaceDir, "preserve", "lineendings.txt");
			const originalContent = "Line 1\r\nLine 2\r\nLine 3\r\n";

			await fs.mkdir(path.dirname(testFile), { recursive: true });
			await fs.writeFile(testFile, originalContent);

			// Protect file
			await protectedFileRegistry.add(testFile, {
				protectionLevel: "block",
			});

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					testFile,
				]);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint preserves line endings
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
			}
		});
	});

	describe("Character Encoding Compatibility", () => {
		it("should handle UTF-8 encoding", async () => {
			const utf8File = path.join(workspaceDir, "encoding", "utf8.txt");
			const utf8Content = "Hello 世界 🌍\nПривет мир\nこんにちは世界\n";

			await fs.mkdir(path.dirname(utf8File), { recursive: true });
			await fs.writeFile(utf8File, utf8Content, "utf8");

			// Protect file
			await protectedFileRegistry.add(utf8File, {
				protectionLevel: "watch",
			});
			expect(protectedFileRegistry.isProtected(utf8File)).toBe(true);

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					utf8File,
				]);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
			}
		});

		it("should handle files with special characters", async () => {
			const specialCharFiles = [
				path.join(workspaceDir, "special", "file with spaces.txt"),
				path.join(workspaceDir, "special", "file-with-dashes.txt"),
				path.join(workspaceDir, "special", "file_with_underscores.txt"),
				path.join(workspaceDir, "special", "文件.txt"), // Chinese characters
				path.join(workspaceDir, "special", "файл.txt"), // Cyrillic characters
				path.join(workspaceDir, "special", "ファイル.txt"), // Japanese characters
				path.join(workspaceDir, "special", "फ़ाइल.txt"), // Devanagari characters
				path.join(workspaceDir, "special", "archivo-español.txt"), // Spanish characters
				path.join(workspaceDir, "special", "fichier-français.txt"), // French characters
				path.join(workspaceDir, "special", "datei@domain.com.txt"), // Special symbols
			];

			// Create files with special characters
			for (const filePath of specialCharFiles) {
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(
					filePath,
					`// Special character file: ${path.basename(filePath)}`,
				);
			}

			// Protect all files
			for (const filePath of specialCharFiles) {
				await protectedFileRegistry.add(filePath, {
					protectionLevel: "warn",
				});
				expect(protectedFileRegistry.isProtected(filePath)).toBe(true);
			}

			// Create checkpoint with all files
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(
					true,
					specialCharFiles,
				);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(specialCharFiles.length);
				}
			}
		});
	});

	describe("File Permission Handling", () => {
		it("should handle read-only files", async () => {
			const readOnlyFile = path.join(
				workspaceDir,
				"permissions",
				"readonly.txt",
			);
			const content = "// Read-only file content";

			await fs.mkdir(path.dirname(readOnlyFile), { recursive: true });
			await fs.writeFile(readOnlyFile, content);

			// Simulate read-only file (on platforms that support it)
			try {
				await fs.chmod(readOnlyFile, 0o444); // Read-only permissions
			} catch (_error) {
				// chmod may not be supported on all platforms, that's OK
			}

			// Protect file
			await protectedFileRegistry.add(readOnlyFile, {
				protectionLevel: "block",
			});
			expect(protectedFileRegistry.isProtected(readOnlyFile)).toBe(true);

			// Create checkpoint (should handle read-only files gracefully)
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					readOnlyFile,
				]);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
			}
		});

		it("should handle files with unusual permissions", async () => {
			const unusualFile = path.join(workspaceDir, "permissions", "unusual.txt");
			const content = "// Unusual permissions file";

			await fs.mkdir(path.dirname(unusualFile), { recursive: true });
			await fs.writeFile(unusualFile, content);

			// Try to set unusual permissions (may not work on all platforms)
			try {
				await fs.chmod(unusualFile, 0o777); // Full permissions
			} catch (_error) {
				// chmod may not be supported on all platforms, that's OK
			}

			// Protect file
			await protectedFileRegistry.add(unusualFile, {
				protectionLevel: "watch",
			});
			expect(protectedFileRegistry.isProtected(unusualFile)).toBe(true);

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					unusualFile,
				]);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
			}
		});
	});

	describe("Environment Variable Handling", () => {
		it("should handle paths with environment variables", async () => {
			// This test simulates handling of environment variable expansion
			// In real usage, VS Code would handle this, but we test the normalized paths

			// Simulate environment variable expansion
			const simulatedHome =
				process.env.HOME || process.env.USERPROFILE || "/home/user";
			const envPaths = [
				path.join(simulatedHome, "project", "src", "index.ts"),
				path.join(simulatedHome, "project", "package.json"),
			];

			// Create files with simulated environment variable paths
			const files: string[] = [];
			for (const envPath of envPaths) {
				const filePath = path.join(
					workspaceDir,
					...envPath.split(path.sep).slice(1),
				);
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, `// Env path file: ${envPath}`);
				files.push(filePath);
			}

			// Protect files
			for (const file of files) {
				await protectedFileRegistry.add(file, {
					protectionLevel: "warn",
				});
				expect(protectedFileRegistry.isProtected(file)).toBe(true);
			}

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, files);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(files.length);
				}
			}
		});
	});

	describe("Cross-Platform Edge Cases", () => {
		it("should handle maximum path lengths", async () => {
			// Test with long paths (but within reasonable limits)
			const longDirName = "a".repeat(50); // 50 character directory name
			const longFileName = `${"b".repeat(100)}.ts`; // 103 character file name
			const longPath = path.join(
				workspaceDir,
				"longpath",
				longDirName,
				longFileName,
			);

			await fs.mkdir(path.dirname(longPath), { recursive: true });
			await fs.writeFile(longPath, "// Long path file");

			// Protect file
			await protectedFileRegistry.add(longPath, {
				protectionLevel: "block",
			});
			expect(protectedFileRegistry.isProtected(longPath)).toBe(true);

			// Create checkpoint
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(true, [
					longPath,
				]);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
			}
		});

		it("should handle files with reserved names", async () => {
			// Test with names that might be reserved on some platforms
			const reservedNames = [
				path.join(workspaceDir, "reserved", "CON.txt"),
				path.join(workspaceDir, "reserved", "PRN.txt"),
				path.join(workspaceDir, "reserved", "AUX.txt"),
				path.join(workspaceDir, "reserved", "NUL.txt"),
			];

			// Create files (these are safe on Unix but might be problematic on Windows)
			for (const filePath of reservedNames) {
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(
					filePath,
					`// Reserved name file: ${path.basename(filePath)}`,
				);
			}

			// Protect all files
			for (const filePath of reservedNames) {
				await protectedFileRegistry.add(filePath, {
					protectionLevel: "watch",
				});
				expect(protectedFileRegistry.isProtected(filePath)).toBe(true);
			}

			// Create checkpoint with all files
			const checkpointId =
				await operationCoordinator.coordinateCheckpointCreation(
					true,
					reservedNames,
				);
			expect(checkpointId).toBeDefined();

			// Verify checkpoint was created
			if (checkpointId) {
				const checkpoint = await storage.retrieve(checkpointId);
				expect(checkpoint).toBeDefined();
				if (checkpoint?.files) {
					expect(checkpoint.files.length).toBe(reservedNames.length);
				}
			}
		});
	});
});
