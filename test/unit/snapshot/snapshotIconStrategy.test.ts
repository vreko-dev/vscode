import { beforeEach, describe, expect, it } from "vitest";
import { CheckpointIconStrategy } from "@/checkpoint/CheckpointIconStrategy";

describe("CheckpointIconStrategy - Icon Classification", () => {
	let strategy: CheckpointIconStrategy;

	beforeEach(() => {
		strategy = new CheckpointIconStrategy();
	});

	describe("Protected Checkpoint Icons", () => {
		it("should use lock icon for protected checkpoints", () => {
			const metadata = {
				name: "Important feature",
				files: ["src/app.ts", "src/utils.ts"],
				isProtected: true,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("lock");
			expect(result.color).toBeDefined();
		});

		it("should prioritize lock icon over other classifications when protected", () => {
			const metadata = {
				name: "Added test files",
				files: ["src/app.test.ts"],
				isProtected: true,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("lock");
		});

		it("should use lock icon for protected checkpoints with multiple file types", () => {
			const metadata = {
				name: "Refactored auth system",
				files: ["src/auth.ts", "docs/auth.md", "tests/auth.test.ts"],
				isProtected: true,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("lock");
		});
	});

	describe("Test File Icons", () => {
		it("should use beaker icon for .test.ts files", () => {
			const metadata = {
				name: "Test changes",
				files: ["src/app.test.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("beaker");
			expect(result.color).toBe("charts.purple");
		});

		it("should use beaker icon for .spec.ts files", () => {
			const metadata = {
				name: "Spec changes",
				files: ["src/app.spec.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("beaker");
			expect(result.color).toBe("charts.purple");
		});

		it("should use beaker icon for .test.js files", () => {
			const metadata = {
				name: "Test changes",
				files: ["src/app.test.js"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("beaker");
		});

		it("should use beaker icon for .spec.js files", () => {
			const metadata = {
				name: "Spec changes",
				files: ["src/app.spec.js"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("beaker");
		});

		it("should use beaker icon when multiple test files present", () => {
			const metadata = {
				name: "Test updates",
				files: ["src/app.test.ts", "src/utils.test.ts", "src/auth.spec.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("beaker");
		});

		it("should use beaker icon for __tests__ directory files", () => {
			const metadata = {
				name: "Test updates",
				files: ["__tests__/app.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("beaker");
		});
	});

	describe("Package Dependency Icons", () => {
		it("should use package icon for package.json", () => {
			const metadata = {
				name: "Updated dependencies",
				files: ["package.json"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("package");
			expect(result.color).toBe("charts.yellow");
		});

		it("should use package icon for package-lock.json", () => {
			const metadata = {
				name: "Lock file update",
				files: ["package-lock.json"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("package");
		});

		it("should use package icon for yarn.lock", () => {
			const metadata = {
				name: "Yarn lock update",
				files: ["yarn.lock"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("package");
		});

		it("should use package icon for pnpm-lock.yaml", () => {
			const metadata = {
				name: "PNPM lock update",
				files: ["pnpm-lock.yaml"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("package");
		});

		it('should use package icon when name contains "update-deps"', () => {
			const metadata = {
				name: "update-deps: Upgraded React",
				files: ["src/app.tsx"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("package");
		});

		it('should use package icon when name contains "dependencies"', () => {
			const metadata = {
				name: "Updated dependencies to latest",
				files: ["src/app.tsx"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("package");
		});
	});

	describe("Configuration File Icons", () => {
		it("should use settings-gear icon for .config.ts files", () => {
			const metadata = {
				name: "Config update",
				files: ["vite.config.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("settings-gear");
			expect(result.color).toBe("debugConsole.warningForeground");
		});

		it("should use settings-gear icon for .eslintrc files", () => {
			const metadata = {
				name: "ESLint config",
				files: [".eslintrc.json"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("settings-gear");
		});

		it("should use settings-gear icon for .prettierrc files", () => {
			const metadata = {
				name: "Prettier config",
				files: [".prettierrc"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("settings-gear");
		});

		it("should use settings-gear icon for tsconfig.json", () => {
			const metadata = {
				name: "TypeScript config",
				files: ["tsconfig.json"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("settings-gear");
		});

		it("should use settings-gear icon for .env files", () => {
			const metadata = {
				name: "Environment config",
				files: [".env.local"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("settings-gear");
		});

		it('should use settings-gear icon when name contains "config-change"', () => {
			const metadata = {
				name: "config-change: Updated build settings",
				files: ["src/app.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("settings-gear");
		});
	});

	describe("Bug Fix Icons", () => {
		it('should use bug icon when name contains "fix-bug"', () => {
			const metadata = {
				name: "fix-bug: Resolved authentication issue",
				files: ["src/auth.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("bug");
			expect(result.color).toBe("charts.red");
		});

		it('should use bug icon when name contains "fix" keyword', () => {
			const metadata = {
				name: "Fix login validation error",
				files: ["src/login.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("bug");
		});

		it('should use bug icon when name contains "bugfix"', () => {
			const metadata = {
				name: "Bugfix: null pointer exception",
				files: ["src/utils.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("bug");
		});

		it("should match fix keyword case-insensitively", () => {
			const metadata = {
				name: "FIX: memory leak in component",
				files: ["src/component.tsx"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("bug");
		});
	});

	describe("Refactor Icons", () => {
		it('should use symbol-class icon when name contains "refactor"', () => {
			const metadata = {
				name: "refactor: Improved code structure",
				files: ["src/app.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("symbol-class");
			expect(result.color).toBe("charts.blue");
		});

		it("should match refactor keyword case-insensitively", () => {
			const metadata = {
				name: "REFACTOR: Clean up legacy code",
				files: ["src/legacy.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("symbol-class");
		});
	});

	describe("File Addition Icons", () => {
		it('should use file-add icon when name contains "Added"', () => {
			const metadata = {
				name: "Added new feature",
				files: ["src/feature.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("file-add");
			expect(result.color).toBe("charts.green");
		});

		it('should use file-add icon when name contains "file-add"', () => {
			const metadata = {
				name: "file-add: New authentication module",
				files: ["src/auth.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("file-add");
		});

		it('should use file-add icon when name contains "Created"', () => {
			const metadata = {
				name: "Created initial setup",
				files: ["src/setup.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("file-add");
		});

		it("should match addition keywords case-insensitively", () => {
			const metadata = {
				name: "ADDED: New API endpoint",
				files: ["src/api.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("file-add");
		});
	});

	describe("File Deletion Icons", () => {
		it('should use trash icon when name contains "Deleted"', () => {
			const metadata = {
				name: "Deleted obsolete code",
				files: ["src/old.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("trash");
			expect(result.color).toBe("charts.red");
		});

		it('should use trash icon when name contains "file-delete"', () => {
			const metadata = {
				name: "file-delete: Removed legacy module",
				files: ["src/legacy.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("trash");
		});

		it('should use trash icon when name contains "Removed"', () => {
			const metadata = {
				name: "Removed unused dependencies",
				files: ["package.json"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("trash");
		});

		it("should match deletion keywords case-insensitively", () => {
			const metadata = {
				name: "DELETED: Old test files",
				files: ["tests/old.test.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("trash");
		});
	});

	describe("Documentation Icons", () => {
		it("should use book icon for .md files", () => {
			const metadata = {
				name: "Documentation update",
				files: ["README.md"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("book");
			expect(result.color).toBe("charts.blue");
		});

		it("should use book icon for .mdx files", () => {
			const metadata = {
				name: "MDX documentation",
				files: ["docs/guide.mdx"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("book");
		});

		it('should use book icon when name contains "docs-update"', () => {
			const metadata = {
				name: "docs-update: API reference",
				files: ["src/api.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("book");
		});

		it('should use book icon when name contains "documentation"', () => {
			const metadata = {
				name: "Updated documentation for auth",
				files: ["src/auth.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("book");
		});

		it("should use book icon for files in docs/ directory", () => {
			const metadata = {
				name: "Guide updates",
				files: ["docs/getting-started.txt"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("book");
		});
	});

	describe("Style/CSS Icons", () => {
		it("should use paintcan icon for .css files", () => {
			const metadata = {
				name: "Style changes",
				files: ["src/app.css"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("paintcan");
			expect(result.color).toBe("charts.pink");
		});

		it("should use paintcan icon for .scss files", () => {
			const metadata = {
				name: "SCSS updates",
				files: ["src/styles.scss"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("paintcan");
		});

		it("should use paintcan icon for .less files", () => {
			const metadata = {
				name: "LESS updates",
				files: ["src/theme.less"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("paintcan");
		});

		it('should use paintcan icon when name contains "style-changes"', () => {
			const metadata = {
				name: "style-changes: Updated button colors",
				files: ["src/button.tsx"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("paintcan");
		});

		it('should use paintcan icon when name contains "styling"', () => {
			const metadata = {
				name: "Improved styling for cards",
				files: ["src/card.tsx"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("paintcan");
		});
	});

	describe("API Icons", () => {
		it('should use server icon when name contains "api-changes"', () => {
			const metadata = {
				name: "api-changes: New endpoints",
				files: ["src/api.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("server");
			expect(result.color).toBe("charts.yellow");
		});

		it("should use server icon for .api. pattern in files", () => {
			const metadata = {
				name: "API updates",
				files: ["src/users.api.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("server");
		});

		it('should use server icon when name contains "endpoint"', () => {
			const metadata = {
				name: "Added new endpoint for users",
				files: ["src/routes.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("server");
		});

		it("should use server icon for files in api/ directory", () => {
			const metadata = {
				name: "Route updates",
				files: ["api/users.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("server");
		});
	});

	describe("Database Icons", () => {
		it('should use database icon when name contains "database"', () => {
			const metadata = {
				name: "database: Schema migration",
				files: ["src/schema.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("database");
			expect(result.color).toBe("charts.orange");
		});

		it("should use database icon for migration files", () => {
			const metadata = {
				name: "Migration update",
				files: ["migrations/001_initial.sql"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("database");
		});

		it("should use database icon for .sql files", () => {
			const metadata = {
				name: "Query updates",
				files: ["queries/users.sql"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("database");
		});

		it('should use database icon when name contains "migration"', () => {
			const metadata = {
				name: "Migration: Add user roles",
				files: ["src/db.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("database");
		});

		it("should use database icon for schema files", () => {
			const metadata = {
				name: "Schema updates",
				files: ["prisma/schema.prisma"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("database");
		});
	});

	describe("Fallback Icons", () => {
		it("should use file-code icon for unknown file types", () => {
			const metadata = {
				name: "General changes",
				files: ["src/utils.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("file-code");
			expect(result.color).toBeDefined();
		});

		it("should use file-code icon when no patterns match", () => {
			const metadata = {
				name: "Updated implementation",
				files: ["src/random.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("file-code");
		});

		it("should provide a default color for fallback icon", () => {
			const metadata = {
				name: "Changes",
				files: ["src/app.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.color).toBeDefined();
			expect(typeof result.color).toBe("string");
		});
	});

	describe("Priority and Multi-File Scenarios", () => {
		it("should prioritize test files over regular files", () => {
			const metadata = {
				name: "Multiple changes",
				files: ["src/app.ts", "src/app.test.ts", "src/utils.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("beaker");
		});

		it("should prioritize package files over config files", () => {
			const metadata = {
				name: "Build updates",
				files: ["package.json", "tsconfig.json"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("package");
		});

		it("should prioritize bug fix over addition when both keywords present", () => {
			const metadata = {
				name: "fix: Added validation check",
				files: ["src/validation.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("bug");
		});

		it("should prioritize deletion over addition when both keywords present", () => {
			const metadata = {
				name: "Deleted and Added files",
				files: ["src/old.ts", "src/new.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("trash");
		});

		it("should handle mixed file types with intelligent priority", () => {
			const metadata = {
				name: "Complex update",
				files: [
					"src/app.ts",
					"src/app.css",
					"README.md",
					"package.json",
					"src/app.test.ts",
				],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			// Should prioritize test files in this mix
			expect(result.icon).toBe("beaker");
		});

		it("should prioritize name-based keywords over file extensions", () => {
			const metadata = {
				name: "fix-bug: Test file correction",
				files: ["src/app.test.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			// Bug fix has higher priority than test files
			expect(result.icon).toBe("bug");
		});
	});

	describe("Case Sensitivity", () => {
		it("should match keywords case-insensitively in name", () => {
			const metadata = {
				name: "REFACTOR: Updated structure",
				files: ["src/app.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("symbol-class");
		});

		it("should match file extensions case-insensitively", () => {
			const metadata = {
				name: "Test updates",
				files: ["src/app.TEST.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("beaker");
		});

		it("should match mixed case keywords", () => {
			const metadata = {
				name: "FiX: Bug in validation",
				files: ["src/validation.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("bug");
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty files array gracefully", () => {
			const metadata = {
				name: "Some changes",
				files: [],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBeDefined();
			expect(result.color).toBeDefined();
		});

		it("should handle empty name gracefully", () => {
			const metadata = {
				name: "",
				files: ["src/app.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBeDefined();
			expect(result.color).toBeDefined();
		});

		it("should handle files with no extensions", () => {
			const metadata = {
				name: "Config update",
				files: ["Dockerfile", "Makefile"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBeDefined();
			expect(result.color).toBeDefined();
		});

		it("should handle deeply nested file paths", () => {
			const metadata = {
				name: "Deep changes",
				files: ["src/modules/auth/services/validation/rules.test.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBe("beaker");
		});

		it("should handle files with multiple dots in name", () => {
			const metadata = {
				name: "Config changes",
				files: ["src/app.config.test.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			// Should match test pattern over config pattern
			expect(result.icon).toBe("beaker");
		});

		it("should handle special characters in file names", () => {
			const metadata = {
				name: "Special files",
				files: ["src/@types/index.ts", "src/$utils.ts"],
				isProtected: false,
			};

			const result = strategy.classifyIcon(metadata);

			expect(result.icon).toBeDefined();
			expect(result.color).toBeDefined();
		});
	});

	describe("Performance", () => {
		it("should classify icon in under 1ms", () => {
			const metadata = {
				name: "Performance test",
				files: ["src/app.ts"],
				isProtected: false,
			};

			const startTime = performance.now();
			strategy.classifyIcon(metadata);
			const duration = performance.now() - startTime;

			expect(duration).toBeLessThan(1);
		});

		it("should handle 10000 classifications in under 100ms", () => {
			const metadata = {
				name: "fix-bug: Performance issue",
				files: ["src/app.test.ts", "package.json", "README.md"],
				isProtected: false,
			};

			const startTime = performance.now();

			for (let i = 0; i < 10000; i++) {
				strategy.classifyIcon(metadata);
			}

			const duration = performance.now() - startTime;

			expect(duration).toBeLessThan(100);
		});

		it("should perform consistently with large file arrays", () => {
			const files = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`);
			const metadata = {
				name: "Large change",
				files,
				isProtected: false,
			};

			const startTime = performance.now();
			strategy.classifyIcon(metadata);
			const duration = performance.now() - startTime;

			expect(duration).toBeLessThan(5);
		});

		it("should perform consistently with long file paths", () => {
			const metadata = {
				name: "Deep nesting",
				files: [
					"src/modules/deeply/nested/path/to/file/in/many/directories/component.test.ts",
				],
				isProtected: false,
			};

			const startTime = performance.now();
			strategy.classifyIcon(metadata);
			const duration = performance.now() - startTime;

			expect(duration).toBeLessThan(1);
		});
	});
});
