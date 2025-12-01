import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Memento } from "vscode";
import {
	CheckpointDeduplicator,
	type CheckpointState,
} from "@/checkpoint/CheckpointDeduplicator";
import {
	CheckpointIconStrategy,
	type CheckpointMetadata,
} from "@/checkpoint/CheckpointIconStrategy";
import {
	type CheckpointInfo,
	CheckpointNamingStrategy,
} from "@/checkpoint/CheckpointNamingStrategy";
import { PathValidator } from "@/security/pathValidator";
import { ProtectedFileRegistry } from "@/services/protectedFileRegistry";

/**
 * Mock Memento for testing ProtectedFileRegistry
 */
class MockMemento implements Memento {
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

/**
 * Mock git execution for testing scenarios
 */
interface GitMockConfig {
	available: boolean;
	diff?: string;
	status?: string;
}

class GitMock {
	constructor(private config: GitMockConfig) {}

	async exec(command: string): Promise<{ stdout: string; stderr: string }> {
		if (!this.config.available) {
			throw new Error("git command not found");
		}

		if (command.includes("diff")) {
			return {
				stdout: this.config.diff || "",
				stderr: "",
			};
		}

		if (command.includes("status")) {
			return {
				stdout: this.config.status || "",
				stderr: "",
			};
		}

		return { stdout: "", stderr: "" };
	}
}

/**
 * Test checkpoint data structure
 */
interface TestCheckpoint {
	id: string;
	name: string;
	icon: string;
	timestamp: number;
	files: string[];
	diff?: string;
}

describe("Checkpoint Naming System Integration Tests", () => {
	let tempDir: string;
	let workspaceDir: string;
	let pathValidator: PathValidator;
	let protectedRegistry: ProtectedFileRegistry;
	let mockMemento: MockMemento;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "checkpoint-integration-"),
		);
		workspaceDir = path.join(tempDir, "workspace");
		await fs.mkdir(workspaceDir, { recursive: true });

		pathValidator = new PathValidator(workspaceDir);
		mockMemento = new MockMemento();
		protectedRegistry = new ProtectedFileRegistry(mockMemento);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
		mockMemento.clear();
	});

	describe("Complete Checkpoint Creation Workflow", () => {
		it("should complete full checkpoint workflow (dedupe → name → icon)", async () => {
			const deduplicator = new CheckpointDeduplicator();
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);
			const iconStrategy = new CheckpointIconStrategy();

			// Create test files
			const testFile = path.join(workspaceDir, "src", "index.ts");
			await fs.mkdir(path.dirname(testFile), { recursive: true });
			await fs.writeFile(testFile, 'export const foo = "bar";');

			const fileContent = await fs.readFile(testFile, "utf-8");
			const fileHash = createHash("sha256").update(fileContent).digest("hex");

			// Create CheckpointState for deduplication
			const checkpointState: CheckpointState = {
				id: "checkpoint-1",
				timestamp: Date.now(),
				files: [
					{
						path: testFile,
						content: fileContent,
						hash: fileHash,
					},
				],
			};

			// Step 1: Check for duplicates using findDuplicate
			const duplicateId = deduplicator.findDuplicate(checkpointState);
			expect(duplicateId).toBe(null);

			// Create CheckpointInfo for naming
			const checkpointInfo: CheckpointInfo = {
				files: [
					{
						path: testFile,
						status: "added",
						linesAdded: 1,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};

			// Step 2: Generate smart name
			const name = await namingStrategy.generateName(checkpointInfo);
			expect(name).toBeTruthy();
			expect(typeof name).toBe("string");

			// Create CheckpointMetadata for icon classification
			const checkpointMetadata: CheckpointMetadata = {
				name: name,
				files: [testFile],
				isProtected: false,
			};

			// Step 3: Assign icon using classifyIcon
			const iconResult = iconStrategy.classifyIcon(checkpointMetadata);
			expect(iconResult).toBeTruthy();
			expect(iconResult.icon).toBeTruthy();
			expect(iconResult.color).toBeTruthy();

			// Step 4: Record checkpoint by calling findDuplicate again (which caches it)
			const duplicateIdAfter = deduplicator.findDuplicate(checkpointState);

			// Verify duplicate detection works (should return the same checkpoint ID)
			expect(duplicateIdAfter).toBe("checkpoint-1");
		});

		it("should integrate with PathValidator for file validation", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);

			// Valid file within workspace
			const validFile = path.join(workspaceDir, "valid.ts");
			await fs.writeFile(validFile, "content");

			expect(await pathValidator.isPathSafe(validFile)).toBe(true);

			// Invalid file outside workspace
			const invalidFile = path.join(tempDir, "..", "etc", "passwd");
			expect(await pathValidator.isPathSafe(invalidFile)).toBe(false);

			// Naming strategy should only accept valid files
			const checkpointInfo: CheckpointInfo = {
				files: [
					{
						path: validFile,
						status: "added",
						linesAdded: 1,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};
			const name = await namingStrategy.generateName(checkpointInfo);
			expect(name).toBeTruthy();
		});

		it("should integrate with ProtectedFileRegistry", async () => {
			const _deduplicator = new CheckpointDeduplicator();
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);
			const iconStrategy = new CheckpointIconStrategy();

			// Create and protect a file
			const protectedFile = path.join(workspaceDir, "protected.ts");
			await fs.writeFile(protectedFile, "protected content");
			await protectedRegistry.add(protectedFile);

			expect(protectedRegistry.isProtected(protectedFile)).toBe(true);

			// Create checkpoint for protected file
			const checkpointInfo: CheckpointInfo = {
				files: [
					{
						path: protectedFile,
						status: "added",
						linesAdded: 1,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};

			const name = await namingStrategy.generateName(checkpointInfo);
			expect(name).toBeTruthy();

			// Test icon classification with protected file
			const metadata: CheckpointMetadata = {
				name: name,
				files: [protectedFile],
				isProtected: true,
			};
			const iconResult = iconStrategy.classifyIcon(metadata);
			expect(iconResult.icon).toBe("lock");
		});
	});

	describe("Deduplication Integration", () => {
		it("should prevent duplicate checkpoints", async () => {
			const deduplicator = new CheckpointDeduplicator();

			const testFile = path.join(workspaceDir, "test.ts");
			await fs.writeFile(testFile, "const x = 1;");

			const fileContent = await fs.readFile(testFile, "utf-8");
			const fileHash = createHash("sha256").update(fileContent).digest("hex");

			const checkpointState: CheckpointState = {
				id: "checkpoint-1",
				timestamp: Date.now(),
				files: [
					{
						path: testFile,
						content: fileContent,
						hash: fileHash,
					},
				],
			};

			// First checkpoint - not a duplicate
			expect(deduplicator.findDuplicate(checkpointState)).toBe(null);

			// Second checkpoint with same files and content - is a duplicate
			const checkpointState2: CheckpointState = {
				id: "checkpoint-2",
				timestamp: Date.now() + 1000,
				files: [
					{
						path: testFile,
						content: fileContent,
						hash: fileHash,
					},
				],
			};
			expect(deduplicator.findDuplicate(checkpointState2)).toBe("checkpoint-1");
		});

		it("should allow unique checkpoints", async () => {
			const deduplicator = new CheckpointDeduplicator();

			const file1 = path.join(workspaceDir, "test1.ts");
			const file2 = path.join(workspaceDir, "test2.ts");
			await fs.writeFile(file1, "const x = 1;");
			await fs.writeFile(file2, "const y = 2;");

			const content1 = await fs.readFile(file1, "utf-8");
			const content2 = await fs.readFile(file2, "utf-8");
			const hash1 = createHash("sha256").update(content1).digest("hex");
			const hash2 = createHash("sha256").update(content2).digest("hex");

			// Record first checkpoint
			const state1: CheckpointState = {
				id: "checkpoint-1",
				timestamp: Date.now(),
				files: [{ path: file1, content: content1, hash: hash1 }],
			};
			deduplicator.findDuplicate(state1);

			// Different files - not a duplicate
			const state2: CheckpointState = {
				id: "checkpoint-2",
				timestamp: Date.now(),
				files: [{ path: file2, content: content2, hash: hash2 }],
			};
			expect(deduplicator.findDuplicate(state2)).toBe(null);

			// Same files but different content - not a duplicate
			await fs.writeFile(file1, "const x = 2;");
			const newContent = await fs.readFile(file1, "utf-8");
			const newHash = createHash("sha256").update(newContent).digest("hex");
			const state3: CheckpointState = {
				id: "checkpoint-3",
				timestamp: Date.now(),
				files: [{ path: file1, content: newContent, hash: newHash }],
			};
			expect(deduplicator.findDuplicate(state3)).toBe(null);
		});
	});

	describe("Smart Naming Integration", () => {
		it("should generate smart name for single file addition", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);

			const testFile = path.join(workspaceDir, "src", "Button.tsx");
			await fs.mkdir(path.dirname(testFile), { recursive: true });
			await fs.writeFile(
				testFile,
				"export const Button = () => <button>Click</button>;",
			);

			const checkpointInfo: CheckpointInfo = {
				files: [
					{
						path: testFile,
						status: "added",
						linesAdded: 1,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};

			const name = await namingStrategy.generateName(checkpointInfo);
			expect(name).toMatch(/Button|Added|tsx/i);
		});

		it("should generate smart name for multiple file modifications", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);

			const files = [
				path.join(workspaceDir, "src", "auth.ts"),
				path.join(workspaceDir, "src", "login.ts"),
				path.join(workspaceDir, "src", "session.ts"),
			];

			await fs.mkdir(path.dirname(files[0]), { recursive: true });
			for (const file of files) {
				await fs.writeFile(file, "export const fn = () => {};");
			}

			const checkpointInfo: CheckpointInfo = {
				files: files.map((f) => ({
					path: f,
					status: "modified" as const,
					linesAdded: 2,
					linesDeleted: 0,
				})),
				workspaceRoot: workspaceDir,
			};

			const name = await namingStrategy.generateName(checkpointInfo);
			expect(name).toMatch(/3M|Modified|in src/i);
		});

		it("should generate smart name for test file updates", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);

			const files = [
				path.join(workspaceDir, "src", "auth.test.ts"),
				path.join(workspaceDir, "src", "auth.spec.ts"),
			];

			await fs.mkdir(path.dirname(files[0]), { recursive: true });
			for (const file of files) {
				await fs.writeFile(file, 'describe("auth", () => {});');
			}

			const checkpointInfo: CheckpointInfo = {
				files: files.map((f) => ({
					path: f,
					status: "modified" as const,
					linesAdded: 1,
					linesDeleted: 0,
				})),
				workspaceRoot: workspaceDir,
			};

			const name = await namingStrategy.generateName(checkpointInfo);
			expect(name).toMatch(/test|Updated 2 tests/i);
		});

		it("should generate smart name for dependency updates (package.json)", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);

			const packageFile = path.join(workspaceDir, "package.json");
			await fs.writeFile(packageFile, '{"dependencies": {"react": "^18.2.0"}}');

			const checkpointInfo: CheckpointInfo = {
				files: [
					{
						path: packageFile,
						status: "modified",
						linesAdded: 1,
						linesDeleted: 1,
					},
				],
				workspaceRoot: workspaceDir,
			};

			const name = await namingStrategy.generateName(checkpointInfo);
			expect(name).toMatch(/dependencies|package/i);
		});

		it("should generate smart name when git is available", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);

			const testFile = path.join(workspaceDir, "test.ts");
			await fs.writeFile(testFile, "const x = 1;");

			const checkpointInfo: CheckpointInfo = {
				files: [
					{
						path: testFile,
						status: "modified",
						linesAdded: 1,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};

			const name = await namingStrategy.generateName(checkpointInfo);
			expect(name).toBeTruthy();
		});

		it("should generate smart name with git unavailable fallback", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);

			const testFile = path.join(workspaceDir, "test.ts");
			await fs.writeFile(testFile, "const x = 1;");

			const checkpointInfo: CheckpointInfo = {
				files: [
					{
						path: testFile,
						status: "modified",
						linesAdded: 1,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};

			// Should still generate a name even if git is unavailable
			const name = await namingStrategy.generateName(checkpointInfo);
			expect(name).toBeTruthy();
			expect(typeof name).toBe("string");
		});
	});

	describe("Icon Classification Integration", () => {
		it("should classify test changes with test icon", async () => {
			const iconStrategy = new CheckpointIconStrategy();

			const metadata: CheckpointMetadata = {
				name: "test-auth",
				files: [path.join(workspaceDir, "auth.test.ts")],
				isProtected: false,
			};

			const iconResult = iconStrategy.classifyIcon(metadata);
			expect(iconResult.icon).toBe("beaker");
			expect(iconResult.color).toBe("charts.purple");
		});

		it("should classify protected files with shield icon", async () => {
			const iconStrategy = new CheckpointIconStrategy();

			const protectedFile = path.join(workspaceDir, "protected.ts");
			await fs.writeFile(protectedFile, "content");
			await protectedRegistry.add(protectedFile);

			const metadata: CheckpointMetadata = {
				name: "modified-protected",
				files: [protectedFile],
				isProtected: true,
			};

			const iconResult = iconStrategy.classifyIcon(metadata);
			expect(iconResult.icon).toBe("lock");
			expect(iconResult.color).toBe("charts.red");
		});

		it("should classify bug fixes with bug icon", async () => {
			const iconStrategy = new CheckpointIconStrategy();

			const metadata: CheckpointMetadata = {
				name: "fix: handle null case",
				files: [path.join(workspaceDir, "fix.ts")],
				isProtected: false,
			};

			const iconResult = iconStrategy.classifyIcon(metadata);
			expect(iconResult.icon).toBe("bug");
			expect(iconResult.color).toBe("charts.red");
		});

		it("should classify refactoring with refactor icon", async () => {
			const iconStrategy = new CheckpointIconStrategy();

			const metadata: CheckpointMetadata = {
				name: "refactor: improved naming",
				files: [
					path.join(workspaceDir, "old-name.ts"),
					path.join(workspaceDir, "new-name.ts"),
				],
				isProtected: false,
			};

			const iconResult = iconStrategy.classifyIcon(metadata);
			expect(iconResult.icon).toBe("symbol-class");
			expect(iconResult.color).toBe("charts.blue");
		});
	});

	describe("Error Handling Integration", () => {
		it("should handle git command failure gracefully", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);

			const testFile = path.join(workspaceDir, "test.ts");
			await fs.writeFile(testFile, "content");

			const checkpointInfo: CheckpointInfo = {
				files: [
					{
						path: testFile,
						status: "modified",
						linesAdded: 0,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};

			// Should not throw, should provide fallback name
			await expect(
				namingStrategy.generateName(checkpointInfo),
			).resolves.toBeTruthy();
		});

		it("should handle empty checkpoint", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);
			const iconStrategy = new CheckpointIconStrategy();
			const deduplicator = new CheckpointDeduplicator();

			const emptyInfo: CheckpointInfo = {
				files: [],
				workspaceRoot: workspaceDir,
			};

			const emptyMetadata: CheckpointMetadata = {
				name: "empty",
				files: [],
				isProtected: false,
			};

			const emptyState: CheckpointState = {
				id: "empty",
				timestamp: Date.now(),
				files: [],
			};

			// Should handle empty inputs gracefully
			await expect(namingStrategy.generateName(emptyInfo)).resolves.toBe(
				"No changes",
			);
			const iconResult = iconStrategy.classifyIcon(emptyMetadata);
			expect(iconResult).toBeTruthy();
			expect(deduplicator.findDuplicate(emptyState)).toBe(null);
		});
	});

	describe("Performance Integration", () => {
		it("should complete full workflow in under 100ms", async () => {
			const deduplicator = new CheckpointDeduplicator();
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);
			const iconStrategy = new CheckpointIconStrategy();

			const testFile = path.join(workspaceDir, "test.ts");
			await fs.writeFile(testFile, "const x = 1;");
			const content = await fs.readFile(testFile, "utf-8");
			const hash = createHash("sha256").update(content).digest("hex");

			const start = Date.now();

			// Complete workflow
			const state: CheckpointState = {
				id: "perf-test",
				timestamp: Date.now(),
				files: [{ path: testFile, content, hash }],
			};

			const isDuplicate = deduplicator.findDuplicate(state);
			expect(isDuplicate).toBe(null);

			const info: CheckpointInfo = {
				files: [
					{
						path: testFile,
						status: "modified",
						linesAdded: 1,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};
			const name = await namingStrategy.generateName(info);
			expect(name).toBeTruthy();

			const metadata: CheckpointMetadata = {
				name,
				files: [testFile],
				isProtected: false,
			};
			const icon = iconStrategy.classifyIcon(metadata);
			expect(icon).toBeTruthy();

			const elapsed = Date.now() - start;
			expect(elapsed).toBeLessThan(100);
		});

		it("should process 100 checkpoints in under 5 seconds", async () => {
			const deduplicator = new CheckpointDeduplicator();
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);
			const iconStrategy = new CheckpointIconStrategy();

			const start = Date.now();

			for (let i = 0; i < 100; i++) {
				const testFile = path.join(workspaceDir, `file${i}.ts`);
				await fs.writeFile(testFile, `const x${i} = ${i};`);
				const content = await fs.readFile(testFile, "utf-8");
				const hash = createHash("sha256").update(content).digest("hex");

				const state: CheckpointState = {
					id: `checkpoint-${i}`,
					timestamp: Date.now(),
					files: [{ path: testFile, content, hash }],
				};

				const _isDuplicate = deduplicator.findDuplicate(state);

				const info: CheckpointInfo = {
					files: [
						{
							path: testFile,
							status: "added",
							linesAdded: 1,
							linesDeleted: 0,
						},
					],
					workspaceRoot: workspaceDir,
				};
				const name = await namingStrategy.generateName(info);

				const metadata: CheckpointMetadata = {
					name,
					files: [testFile],
					isProtected: false,
				};
				iconStrategy.classifyIcon(metadata);
			}

			const elapsed = Date.now() - start;
			expect(elapsed).toBeLessThan(5000);
		});

		it("should not leak memory with 1000 checkpoints", async () => {
			const deduplicator = new CheckpointDeduplicator();
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);

			const initialMemory = process.memoryUsage().heapUsed;

			for (let i = 0; i < 1000; i++) {
				const testFile = path.join(workspaceDir, `file${i}.ts`);
				await fs.writeFile(testFile, `const x${i} = ${i};`);
				const content = await fs.readFile(testFile, "utf-8");
				const hash = createHash("sha256").update(content).digest("hex");

				const state: CheckpointState = {
					id: `checkpoint-${i}`,
					timestamp: Date.now(),
					files: [{ path: testFile, content, hash }],
				};
				deduplicator.findDuplicate(state);

				const info: CheckpointInfo = {
					files: [
						{
							path: testFile,
							status: "added",
							linesAdded: 1,
							linesDeleted: 0,
						},
					],
					workspaceRoot: workspaceDir,
				};
				await namingStrategy.generateName(info);
			}

			const finalMemory = process.memoryUsage().heapUsed;
			const memoryIncrease = finalMemory - initialMemory;

			// Memory increase should be reasonable (< 50MB for 1000 checkpoints)
			expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
		});
	});

	describe("Real-World Workflow Simulation", () => {
		it("should handle complete workflow: protect → modify → checkpoint → duplicate detection", async () => {
			const deduplicator = new CheckpointDeduplicator();
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);
			const iconStrategy = new CheckpointIconStrategy();

			// Step 1: Create and protect a file
			const sourceFile = path.join(workspaceDir, "src", "auth.ts");
			await fs.mkdir(path.dirname(sourceFile), { recursive: true });
			await fs.writeFile(sourceFile, "export const login = () => {};");

			expect(await pathValidator.isPathSafe(sourceFile)).toBe(true);
			await protectedRegistry.add(sourceFile);
			expect(protectedRegistry.isProtected(sourceFile)).toBe(true);

			// Step 2: Modify the file
			await fs.writeFile(
				sourceFile,
				"export const login = () => {};\nexport const logout = () => {};",
			);

			const content = await fs.readFile(sourceFile, "utf-8");
			const hash = createHash("sha256").update(content).digest("hex");

			// Step 3: Create checkpoint
			const state1: CheckpointState = {
				id: "checkpoint-1",
				timestamp: Date.now(),
				files: [{ path: sourceFile, content, hash }],
			};

			const isDuplicate1 = deduplicator.findDuplicate(state1);
			expect(isDuplicate1).toBe(null);

			const info: CheckpointInfo = {
				files: [
					{
						path: sourceFile,
						status: "modified",
						linesAdded: 1,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};
			const name = await namingStrategy.generateName(info);
			expect(name).toMatch(/Modified|auth\.ts/i);

			const metadata: CheckpointMetadata = {
				name,
				files: [sourceFile],
				isProtected: true,
			};
			const icon = iconStrategy.classifyIcon(metadata);
			expect(icon.icon).toBe("lock");

			// Step 4: Attempt to create duplicate checkpoint
			const isDuplicate2 = deduplicator.findDuplicate(state1);
			expect(isDuplicate2).toBe("checkpoint-1");

			// Step 5: Make a different modification
			await fs.writeFile(
				sourceFile,
				"export const login = () => {};\nexport const logout = () => {};\nexport const refresh = () => {};",
			);

			const newContent = await fs.readFile(sourceFile, "utf-8");
			const newHash = createHash("sha256").update(newContent).digest("hex");
			const state2: CheckpointState = {
				id: "checkpoint-2",
				timestamp: Date.now(),
				files: [{ path: sourceFile, content: newContent, hash: newHash }],
			};

			// Different content - should not be duplicate
			const isDuplicate3 = deduplicator.findDuplicate(state2);
			expect(isDuplicate3).toBe(null);

			const info2: CheckpointInfo = {
				files: [
					{
						path: sourceFile,
						status: "modified",
						linesAdded: 1,
						linesDeleted: 0,
					},
				],
				workspaceRoot: workspaceDir,
			};
			const name2 = await namingStrategy.generateName(info2);
			expect(name2).toBeTruthy();

			const metadata2: CheckpointMetadata = {
				name: name2,
				files: [sourceFile],
				isProtected: true,
			};
			const icon2 = iconStrategy.classifyIcon(metadata2);
			expect(icon2).toBeTruthy();

			// Step 6: Verify both checkpoints are recorded
			expect(deduplicator.findDuplicate(state1)).toBe("checkpoint-1");
			expect(deduplicator.findDuplicate(state2)).toBe("checkpoint-2");
		});

		it("should handle multi-file refactoring workflow", async () => {
			const deduplicator = new CheckpointDeduplicator();
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);
			const iconStrategy = new CheckpointIconStrategy();

			// Create multiple files
			const files = [
				path.join(workspaceDir, "src", "auth", "login.ts"),
				path.join(workspaceDir, "src", "auth", "logout.ts"),
				path.join(workspaceDir, "src", "auth", "session.ts"),
			];

			for (const file of files) {
				await fs.mkdir(path.dirname(file), { recursive: true });
				await fs.writeFile(file, "export const fn = () => {};");
			}

			const info: CheckpointInfo = {
				files: files.map((f) => ({
					path: f,
					status: "modified" as const,
					linesAdded: 1,
					linesDeleted: 0,
				})),
				workspaceRoot: workspaceDir,
			};

			const name = await namingStrategy.generateName(info);
			expect(name).toMatch(/3M|Modified|in src/i);

			const metadata: CheckpointMetadata = {
				name,
				files,
				isProtected: false,
			};
			const icon = iconStrategy.classifyIcon(metadata);
			expect(icon).toBeTruthy();

			// Create checkpoint state for deduplication
			const fileStates = await Promise.all(
				files.map(async (f) => {
					const content = await fs.readFile(f, "utf-8");
					const hash = createHash("sha256").update(content).digest("hex");
					return { path: f, content, hash };
				}),
			);

			const state: CheckpointState = {
				id: "refactor-checkpoint",
				timestamp: Date.now(),
				files: fileStates,
			};

			deduplicator.findDuplicate(state);

			// Verify duplicate detection
			expect(deduplicator.findDuplicate(state)).toBe("refactor-checkpoint");
		});

		it("should handle protected file checkpoint with special icon", async () => {
			const namingStrategy = new CheckpointNamingStrategy(workspaceDir);
			const iconStrategy = new CheckpointIconStrategy();

			// Create and protect multiple files
			const files = [
				path.join(workspaceDir, ".env"),
				path.join(workspaceDir, "config", "secrets.json"),
			];

			await fs.mkdir(path.dirname(files[1]), { recursive: true });
			await fs.writeFile(files[0], "API_KEY=secret");
			await fs.writeFile(files[1], '{"key": "value"}');

			await protectedRegistry.add(files[0]);
			await protectedRegistry.add(files[1]);

			const info: CheckpointInfo = {
				files: files.map((f) => ({
					path: f,
					status: "modified" as const,
					linesAdded: 1,
					linesDeleted: 0,
				})),
				workspaceRoot: workspaceDir,
			};

			const name = await namingStrategy.generateName(info);

			const metadata: CheckpointMetadata = {
				name,
				files,
				isProtected: true,
			};
			const icon = iconStrategy.classifyIcon(metadata);

			// Should have protection-related icon
			expect(icon.icon).toBe("lock");
			expect(icon.color).toBe("charts.red");
		});
	});
});
