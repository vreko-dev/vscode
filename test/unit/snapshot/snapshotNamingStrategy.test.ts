import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type CheckpointInfo,
	CheckpointNamingStrategy,
	type FileChange,
} from "@/checkpoint/CheckpointNamingStrategy";

describe("CheckpointNamingStrategy - Multi-Tier Intelligent Naming", () => {
	let strategy: CheckpointNamingStrategy;
	let tempDir: string;

	beforeEach(async () => {
		// Create temporary workspace directory
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-naming-test-"));
		strategy = new CheckpointNamingStrategy(tempDir);
	});

	afterEach(async () => {
		// Clean up temporary directory
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("Tier 1: Git-Based Naming", () => {
		describe("Single File Operations", () => {
			it('should generate "Added auth.ts" for single file addition', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "src/auth.ts"),
							status: "added",
							linesAdded: 50,
							linesDeleted: 0,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Added auth.ts");
			});

			it('should generate "Modified login.ts" for single file modification', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "src/login.ts"),
							status: "modified",
							linesAdded: 10,
							linesDeleted: 5,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Modified login.ts");
			});

			it('should generate "Deleted config.ts" for single file deletion', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "src/config.ts"),
							status: "deleted",
							linesAdded: 0,
							linesDeleted: 30,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Deleted config.ts");
			});
		});

		describe("Multiple File Operations", () => {
			it('should generate "3A 2M 1D in src/auth" for multiple files in same directory', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "src/auth/login.ts"),
							status: "added",
							linesAdded: 50,
							linesDeleted: 0,
						},
						{
							path: path.join(tempDir, "src/auth/register.ts"),
							status: "added",
							linesAdded: 60,
							linesDeleted: 0,
						},
						{
							path: path.join(tempDir, "src/auth/password.ts"),
							status: "added",
							linesAdded: 40,
							linesDeleted: 0,
						},
						{
							path: path.join(tempDir, "src/auth/utils.ts"),
							status: "modified",
							linesAdded: 10,
							linesDeleted: 5,
						},
						{
							path: path.join(tempDir, "src/auth/types.ts"),
							status: "modified",
							linesAdded: 5,
							linesDeleted: 2,
						},
						{
							path: path.join(tempDir, "src/auth/legacy.ts"),
							status: "deleted",
							linesAdded: 0,
							linesDeleted: 100,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("3A 2M 1D in src/auth");
			});

			it('should generate "2A 1M in src" for files in different subdirectories', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "src/auth/login.ts"),
							status: "added",
							linesAdded: 50,
							linesDeleted: 0,
						},
						{
							path: path.join(tempDir, "src/users/profile.ts"),
							status: "added",
							linesAdded: 40,
							linesDeleted: 0,
						},
						{
							path: path.join(tempDir, "src/utils/helpers.ts"),
							status: "modified",
							linesAdded: 10,
							linesDeleted: 5,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("2A 1M in src");
			});

			it('should handle only additions "5A in components"', async () => {
				const files: FileChange[] = [];
				for (let i = 0; i < 5; i++) {
					files.push({
						path: path.join(tempDir, `components/Button${i}.tsx`),
						status: "added",
						linesAdded: 30,
						linesDeleted: 0,
					});
				}

				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files,
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("5A in components");
			});

			it('should handle only modifications "3M in api"', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "api/users.ts"),
							status: "modified",
							linesAdded: 10,
							linesDeleted: 5,
						},
						{
							path: path.join(tempDir, "api/auth.ts"),
							status: "modified",
							linesAdded: 15,
							linesDeleted: 8,
						},
						{
							path: path.join(tempDir, "api/posts.ts"),
							status: "modified",
							linesAdded: 20,
							linesDeleted: 10,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("3M in api");
			});

			it('should handle only deletions "2D in legacy"', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "legacy/old-api.ts"),
							status: "deleted",
							linesAdded: 0,
							linesDeleted: 100,
						},
						{
							path: path.join(tempDir, "legacy/deprecated.ts"),
							status: "deleted",
							linesAdded: 0,
							linesDeleted: 50,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("2D in legacy");
			});
		});

		describe("Git Command Failure Handling", () => {
			it("should fallback gracefully if git not installed", async () => {
				// Mock git command failure
				const info: CheckpointInfo = {
					workspaceRoot: "/tmp/not-a-git-repo",
					files: [
						{
							path: "/tmp/not-a-git-repo/file.ts",
							status: "added",
							linesAdded: 10,
							linesDeleted: 0,
						},
					],
				};

				const name = await strategy.generateName(info);
				// Should fallback to file operation or line count naming
				expect(name).toBeTruthy();
				expect(typeof name).toBe("string");
			});

			it("should fallback gracefully if not a git repository", async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "file.ts"),
							status: "modified",
							linesAdded: 5,
							linesDeleted: 2,
						},
					],
				};

				const name = await strategy.generateName(info);
				// Should fallback to file operation or line count naming
				expect(name).toBeTruthy();
				expect(typeof name).toBe("string");
			});

			it("should handle git command timeout gracefully", async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "file.ts"),
							status: "added",
							linesAdded: 10,
							linesDeleted: 0,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBeTruthy();
			});
		});
	});

	describe("Tier 2: File Operation Pattern Detection", () => {
		describe("Test File Detection", () => {
			it('should detect .test.ts files and generate "Updated 5 tests"', async () => {
				const files: FileChange[] = [];
				for (let i = 0; i < 5; i++) {
					files.push({
						path: path.join(tempDir, `test/unit/feature${i}.test.ts`),
						status: "modified",
						linesAdded: 20,
						linesDeleted: 10,
					});
				}

				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files,
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated 5 tests");
			});

			it('should detect .spec.ts files and generate "Updated 3 tests"', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "src/auth.spec.ts"),
							status: "modified",
							linesAdded: 15,
							linesDeleted: 5,
						},
						{
							path: path.join(tempDir, "src/login.spec.ts"),
							status: "modified",
							linesAdded: 10,
							linesDeleted: 8,
						},
						{
							path: path.join(tempDir, "src/register.spec.ts"),
							status: "added",
							linesAdded: 30,
							linesDeleted: 0,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated 3 tests");
			});

			it("should detect mixed test file extensions", async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "test/unit/auth.test.ts"),
							status: "modified",
							linesAdded: 10,
							linesDeleted: 5,
						},
						{
							path: path.join(tempDir, "test/integration/api.spec.ts"),
							status: "added",
							linesAdded: 20,
							linesDeleted: 0,
						},
						{
							path: path.join(tempDir, "__tests__/utils.test.js"),
							status: "modified",
							linesAdded: 5,
							linesDeleted: 2,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated 3 tests");
			});
		});

		describe("Dependency File Detection", () => {
			it('should detect package.json and generate "Updated dependencies"', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "package.json"),
							status: "modified",
							linesAdded: 5,
							linesDeleted: 2,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated dependencies");
			});

			it('should detect package-lock.json and generate "Updated dependencies"', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "package-lock.json"),
							status: "modified",
							linesAdded: 100,
							linesDeleted: 50,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated dependencies");
			});

			it('should detect pnpm-lock.yaml and generate "Updated dependencies"', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "pnpm-lock.yaml"),
							status: "modified",
							linesAdded: 80,
							linesDeleted: 40,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated dependencies");
			});

			it('should detect yarn.lock and generate "Updated dependencies"', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "yarn.lock"),
							status: "modified",
							linesAdded: 120,
							linesDeleted: 60,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated dependencies");
			});
		});

		describe("Config File Detection", () => {
			it('should detect .config.ts files and generate "Modified 2 configs"', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "vite.config.ts"),
							status: "modified",
							linesAdded: 10,
							linesDeleted: 5,
						},
						{
							path: path.join(tempDir, "tsconfig.json"),
							status: "modified",
							linesAdded: 3,
							linesDeleted: 1,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Modified 2 configs");
			});

			it('should detect .rc files and generate "Modified 3 configs"', async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, ".eslintrc.json"),
							status: "modified",
							linesAdded: 5,
							linesDeleted: 2,
						},
						{
							path: path.join(tempDir, ".prettierrc"),
							status: "modified",
							linesAdded: 3,
							linesDeleted: 1,
						},
						{
							path: path.join(tempDir, "babel.config.js"),
							status: "modified",
							linesAdded: 8,
							linesDeleted: 4,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Modified 3 configs");
			});

			it("should detect environment files as configs", async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, ".env"),
							status: "modified",
							linesAdded: 2,
							linesDeleted: 0,
						},
						{
							path: path.join(tempDir, ".env.local"),
							status: "added",
							linesAdded: 5,
							linesDeleted: 0,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Modified 2 configs");
			});
		});

		describe("Mixed File Types", () => {
			it("should prioritize test files over configs", async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "test/auth.test.ts"),
							status: "modified",
							linesAdded: 20,
							linesDeleted: 10,
						},
						{
							path: path.join(tempDir, "vite.config.ts"),
							status: "modified",
							linesAdded: 5,
							linesDeleted: 2,
						},
					],
				};

				const name = await strategy.generateName(info);
				// Should prioritize test file detection
				expect(name).toContain("test");
			});

			it("should prioritize dependencies over configs", async () => {
				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: path.join(tempDir, "package.json"),
							status: "modified",
							linesAdded: 5,
							linesDeleted: 2,
						},
						{
							path: path.join(tempDir, "tsconfig.json"),
							status: "modified",
							linesAdded: 3,
							linesDeleted: 1,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated dependencies");
			});
		});
	});

	describe("Tier 3: Content Analysis Naming", () => {
		describe("Import Change Detection", () => {
			it('should detect import changes and generate "Updated 3 imports"', async () => {
				const file1 = path.join(tempDir, "src/file1.ts");
				const file2 = path.join(tempDir, "src/file2.ts");

				await fs.mkdir(path.dirname(file1), { recursive: true });
				await fs.writeFile(
					file1,
					`import { Component } from 'react';\nimport { useState } from 'react';\nconst App = () => {};`,
				);
				await fs.writeFile(
					file2,
					`import { render } from '@testing-library/react';\nconst test = () => {};`,
				);

				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: file1,
							status: "modified",
							linesAdded: 2,
							linesDeleted: 0,
						},
						{
							path: file2,
							status: "modified",
							linesAdded: 1,
							linesDeleted: 0,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated 3 imports");
			});

			it("should detect require statements as imports", async () => {
				const file = path.join(tempDir, "src/file.js");

				await fs.mkdir(path.dirname(file), { recursive: true });
				await fs.writeFile(
					file,
					`const express = require('express');\nconst cors = require('cors');`,
				);

				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: file,
							status: "modified",
							linesAdded: 2,
							linesDeleted: 0,
						},
					],
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Updated 2 imports");
			});
		});

		describe("Structure Change Detection", () => {
			it('should detect function/class changes and generate "Refactored auth module (5 files)"', async () => {
				const files: string[] = [];
				for (let i = 0; i < 5; i++) {
					const file = path.join(tempDir, `src/auth/module${i}.ts`);
					files.push(file);
					await fs.mkdir(path.dirname(file), { recursive: true });
					await fs.writeFile(
						file,
						`function authenticate() {}\nclass User {}\nfunction validateToken() {}`,
					);
				}

				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: files.map((f) => ({
						path: f,
						status: "modified" as const,
						linesAdded: 3,
						linesDeleted: 0,
					})),
				};

				const name = await strategy.generateName(info);
				expect(name).toBe("Refactored auth module (5 files)");
			});

			it("should count arrow functions and class declarations", async () => {
				const file = path.join(tempDir, "src/utils.ts");

				await fs.mkdir(path.dirname(file), { recursive: true });
				await fs.writeFile(
					file,
					`const handleClick = () => {};\nconst handleSubmit = () => {};\nclass Validator {}`,
				);

				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: [
						{
							path: file,
							status: "modified",
							linesAdded: 3,
							linesDeleted: 0,
						},
					],
				};

				const name = await strategy.generateName(info);
				// Should detect structure changes
				expect(name).toContain("Refactored");
			});
		});

		describe("Module Detection", () => {
			it("should detect common directory name in module refactoring", async () => {
				const files: string[] = [];
				for (let i = 0; i < 3; i++) {
					const file = path.join(tempDir, `src/authentication/file${i}.ts`);
					files.push(file);
					await fs.mkdir(path.dirname(file), { recursive: true });
					await fs.writeFile(file, `function func${i}() {}`);
				}

				const info: CheckpointInfo = {
					workspaceRoot: tempDir,
					files: files.map((f) => ({
						path: f,
						status: "modified" as const,
						linesAdded: 1,
						linesDeleted: 0,
					})),
				};

				const name = await strategy.generateName(info);
				expect(name).toContain("authentication");
			});
		});
	});

	describe("Tier 4: Fallback Line Count Naming", () => {
		it('should fallback to "Modified 3 files (450 lines)" when no patterns match', async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "file1.txt"),
						status: "modified",
						linesAdded: 150,
						linesDeleted: 0,
					},
					{
						path: path.join(tempDir, "file2.txt"),
						status: "modified",
						linesAdded: 200,
						linesDeleted: 0,
					},
					{
						path: path.join(tempDir, "file3.txt"),
						status: "modified",
						linesAdded: 100,
						linesDeleted: 0,
					},
				],
			};

			const name = await strategy.generateName(info);
			expect(name).toBe("Modified 3 files (450 lines)");
		});

		it("should count both added and deleted lines", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "file1.txt"),
						status: "modified",
						linesAdded: 100,
						linesDeleted: 50,
					},
					{
						path: path.join(tempDir, "file2.txt"),
						status: "modified",
						linesAdded: 75,
						linesDeleted: 25,
					},
				],
			};

			const name = await strategy.generateName(info);
			expect(name).toBe("Modified 2 files (250 lines)");
		});

		it("should handle single file fallback", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "unknown.xyz"),
						status: "modified",
						linesAdded: 100,
						linesDeleted: 0,
					},
				],
			};

			const name = await strategy.generateName(info);
			expect(name).toBe("Modified 1 file (100 lines)");
		});
	});

	describe("Edge Cases", () => {
		it('should handle empty file list and return "No changes"', async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [],
			};

			const name = await strategy.generateName(info);
			expect(name).toBe("No changes");
		});

		it("should truncate very long file paths", async () => {
			const longPath = path.join(
				tempDir,
				"very/deep/nested/directory/structure/that/is/extremely/long",
				`${"a".repeat(100)}.ts`,
			);

			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: longPath,
						status: "added",
						linesAdded: 10,
						linesDeleted: 0,
					},
				],
			};

			const name = await strategy.generateName(info);
			// Should truncate but still be readable
			expect(name.length).toBeLessThan(100);
			expect(name).toBeTruthy();
		});

		it("should handle special characters in filenames", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "file-with-special_chars@#$.ts"),
						status: "added",
						linesAdded: 10,
						linesDeleted: 0,
					},
				],
			};

			const name = await strategy.generateName(info);
			expect(name).toBeTruthy();
			// Should sanitize or handle special characters gracefully
			expect(name).toMatch(/Added.*special.*chars/);
		});

		it("should handle unicode characters in filenames", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "файл.ts"), // Russian characters
						status: "added",
						linesAdded: 10,
						linesDeleted: 0,
					},
				],
			};

			const name = await strategy.generateName(info);
			expect(name).toBeTruthy();
		});

		it("should handle files with no extension", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "Dockerfile"),
						status: "modified",
						linesAdded: 5,
						linesDeleted: 2,
					},
				],
			};

			const name = await strategy.generateName(info);
			expect(name).toBe("Modified Dockerfile");
		});

		it("should handle dot files", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, ".gitignore"),
						status: "modified",
						linesAdded: 3,
						linesDeleted: 1,
					},
				],
			};

			const name = await strategy.generateName(info);
			expect(name).toContain("gitignore");
		});

		it("should handle files in root directory", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "README.md"),
						status: "modified",
						linesAdded: 10,
						linesDeleted: 0,
					},
				],
			};

			const name = await strategy.generateName(info);
			expect(name).toBe("Modified README.md");
		});

		it("should handle mixed status types with zero line changes", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "file1.ts"),
						status: "added",
						linesAdded: 0,
						linesDeleted: 0,
					},
					{
						path: path.join(tempDir, "file2.ts"),
						status: "deleted",
						linesAdded: 0,
						linesDeleted: 0,
					},
				],
			};

			const name = await strategy.generateName(info);
			expect(name).toBeTruthy();
		});
	});

	describe("Performance", () => {
		it("should generate name in under 50ms for single file", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "src/auth.ts"),
						status: "modified",
						linesAdded: 10,
						linesDeleted: 5,
					},
				],
			};

			const start = Date.now();
			await strategy.generateName(info);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(50);
		});

		it("should generate name in under 50ms for 10 files", async () => {
			const files: FileChange[] = [];
			for (let i = 0; i < 10; i++) {
				files.push({
					path: path.join(tempDir, `src/file${i}.ts`),
					status: "modified",
					linesAdded: 10,
					linesDeleted: 5,
				});
			}

			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files,
			};

			const start = Date.now();
			await strategy.generateName(info);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(50);
		});

		it("should generate name in under 100ms for 50 files", async () => {
			const files: FileChange[] = [];
			for (let i = 0; i < 50; i++) {
				files.push({
					path: path.join(tempDir, `src/file${i}.ts`),
					status: "modified",
					linesAdded: 20,
					linesDeleted: 10,
				});
			}

			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files,
			};

			const start = Date.now();
			await strategy.generateName(info);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(100);
		});

		it("should handle content analysis efficiently", async () => {
			const file = path.join(tempDir, "src/large.ts");
			await fs.mkdir(path.dirname(file), { recursive: true });

			// Create file with many imports and functions
			const content = Array.from(
				{ length: 50 },
				(_, i) =>
					`import { Item${i} } from 'module${i}';\nfunction func${i}() {}`,
			).join("\n");
			await fs.writeFile(file, content);

			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: file,
						status: "modified",
						linesAdded: 100,
						linesDeleted: 0,
					},
				],
			};

			const start = Date.now();
			await strategy.generateName(info);
			const elapsed = Date.now() - start;

			expect(elapsed).toBeLessThan(50);
		});
	});

	describe("Naming Tier Fallback Chain", () => {
		it("should attempt git naming first, then file operations, then content, then fallback", async () => {
			// Test that tiers are attempted in correct order
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "unknown.xyz"),
						status: "modified",
						linesAdded: 10,
						linesDeleted: 5,
					},
				],
			};

			const name = await strategy.generateName(info);
			// Should eventually reach fallback tier
			expect(name).toContain("file");
			expect(name).toContain("lines");
		});

		it("should use file operation tier when git tier fails", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "test/unit/auth.test.ts"),
						status: "modified",
						linesAdded: 20,
						linesDeleted: 10,
					},
				],
			};

			const name = await strategy.generateName(info);
			// Should detect test file even if git fails
			expect(name).toContain("test");
		});

		it("should prioritize higher tiers over lower tiers", async () => {
			const info: CheckpointInfo = {
				workspaceRoot: tempDir,
				files: [
					{
						path: path.join(tempDir, "src/auth.ts"),
						status: "added",
						linesAdded: 50,
						linesDeleted: 0,
					},
				],
			};

			const name = await strategy.generateName(info);
			// Should use git-style naming (Tier 1) over fallback
			expect(name).toBe("Added auth.ts");
		});
	});

	describe("Constructor Validation", () => {
		it("should accept valid workspace root", () => {
			expect(() => new CheckpointNamingStrategy(tempDir)).not.toThrow();
		});

		it("should handle empty workspace root gracefully", () => {
			// Constructor should handle this gracefully
			const strategy = new CheckpointNamingStrategy("");
			expect(strategy).toBeDefined();
		});
	});
});
