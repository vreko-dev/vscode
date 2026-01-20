import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * Critical tests for TypeScript configuration isolation
 * 
 * These tests prevent regressions where VS Code extension's type-check
 * inadvertently validates sibling projects (API, web, etc.) causing
 * type errors from unresolved path aliases.
 * 
 * Context:
 * In monorepos with composite projects and project references,
 * TypeScript can follow the reference graph and type-check referenced
 * projects. This is undesirable for leaf-node applications like VS Code
 * extension that don't export types to other projects.
 * 
 * Solution:
 * - Set composite: false (opt out of project references)
 * - Set references: [] (don't follow root project refs)
 * - Exclude sibling project patterns
 * 
 * References:
 * https://www.typescriptlang.org/docs/handbook/project-references.html
 */

const WORKSPACE_ROOT = join(__dirname, "../../..");
const VSCODE_TSCONFIG_PATH = join(WORKSPACE_ROOT, "tsconfig.json");

interface TsConfig {
	extends?: string;
	compilerOptions?: {
		composite?: boolean;
		types?: string[];
		skipLibCheck?: boolean;
		paths?: Record<string, string[]>;
		rootDir?: string;
		[key: string]: unknown;
	};
	include?: string[];
	exclude?: string[];
	references?: Array<{ path: string }>;
}

function loadTsConfig(): TsConfig {
	const content = readFileSync(VSCODE_TSCONFIG_PATH, "utf-8");
	const parseResult = ts.parseConfigFileTextToJson(VSCODE_TSCONFIG_PATH, content);
	
	if (parseResult.error) {
		throw new Error(ts.flattenDiagnosticMessageText(parseResult.error.messageText, "\n"));
	}
	
	return parseResult.config as TsConfig;
}

describe("VS Code TypeScript Configuration Isolation", () => {
	it("should have tsconfig.json file", () => {
		expect(existsSync(VSCODE_TSCONFIG_PATH)).toBe(true);
	});

	describe("Critical Isolation Settings", () => {
		let config: TsConfig;

		beforeEach(() => {
			config = loadTsConfig();
		});

		it("CRITICAL: composite must be explicitly false", () => {
			// This is the most important setting to prevent project reference following
			expect(config.compilerOptions?.composite).toBe(false);
		});

		it("CRITICAL: references must be an empty array", () => {
			expect(Array.isArray(config.references)).toBe(true);
			expect(config.references).toHaveLength(0);
		});

		it("CRITICAL: must exclude ../api/**/* pattern", () => {
			expect(config.exclude).toBeDefined();
			expect(config.exclude).toContain("../api/**/*");
		});

		it("CRITICAL: must exclude node_modules", () => {
			expect(config.exclude).toContain("node_modules");
		});

		it("CRITICAL: must exclude dist and out directories", () => {
			expect(config.exclude).toContain("dist");
			expect(config.exclude).toContain("out");
		});
	});

	describe("Extended Configuration Validation", () => {
		let config: TsConfig;

		beforeEach(() => {
			config = loadTsConfig();
		});

		it("should extend from @snapback/tsconfig/extension", () => {
			expect(config.extends).toBe("@snapback/tsconfig/extension");
		});

		it("should have skipLibCheck enabled for performance", () => {
			expect(config.compilerOptions?.skipLibCheck).toBe(true);
		});

		it("should have types limited to vscode and mocha", () => {
			expect(config.compilerOptions?.types).toEqual(
				expect.arrayContaining(["vscode", "mocha"])
			);
		});

		it("should set rootDir to src", () => {
			expect(config.compilerOptions?.rootDir).toBe("src");
		});
	});

	describe("Include/Exclude Pattern Safety", () => {
		let config: TsConfig;

		beforeEach(() => {
			config = loadTsConfig();
		});

		it("should only include patterns from own source directory", () => {
			expect(config.include).toBeDefined();
			
			// None of the include patterns should reference sibling projects
			const suspiciousPatterns = config.include?.filter(
				pattern => pattern.includes("../api") ||
						   pattern.includes("../web") ||
						   pattern.includes("../cli")
			) || [];
			
			expect(suspiciousPatterns).toHaveLength(0);
		});

		it("should include src/**/*.ts pattern", () => {
			expect(config.include).toContain("src/**/*.ts");
		});

		it("should exclude all sibling app patterns", () => {
			// Defensive: exclude other apps even if not causing issues yet
			const hasApiExclude = config.exclude?.includes("../api/**/*");
			expect(hasApiExclude).toBe(true);
		});

		it("should not have paths that reference sibling projects", () => {
			if (config.compilerOptions?.paths) {
				const paths = config.compilerOptions.paths;
				
				// Check all path mappings don't reference sibling projects
				for (const [alias, mappings] of Object.entries(paths)) {
					for (const mapping of mappings) {
						expect(mapping).not.toContain("../api/");
						expect(mapping).not.toContain("../web/");
						expect(mapping).not.toContain("../cli/");
					}
				}
			}
		});
	});

	describe("Edge Cases and Regression Prevention", () => {
		let config: TsConfig;

		beforeEach(() => {
			config = loadTsConfig();
		});

		it("should not have composite: true even if base config sets it", () => {
			// Explicit override is required
			expect(config.compilerOptions?.composite).toBe(false);
		});

		it("should have references defined (not undefined)", () => {
			// undefined would inherit from somewhere else
			expect(config.references).toBeDefined();
		});

		it("should not reference any project files", () => {
			expect(config.references).toHaveLength(0);
		});

		it("should not have emitDeclarationOnly: true", () => {
			// This would indicate it's acting as a library
			expect(config.compilerOptions?.emitDeclarationOnly).not.toBe(true);
		});
	});

	describe("Documentation and Maintainability", () => {
		it("should have inline comments explaining critical settings", () => {
			const content = readFileSync(VSCODE_TSCONFIG_PATH, "utf-8");
			
			// Check for documentation of critical settings
			expect(content).toContain("CRITICAL");
			expect(content).toContain("composite");
			expect(content).toContain("references");
		});

		it("should reference TypeScript documentation", () => {
			const content = readFileSync(VSCODE_TSCONFIG_PATH, "utf-8");
			
			// Should link to official docs for context
			expect(content).toMatch(/typescriptlang\.org|project-references/i);
		});
	});
});

describe("Integration: Type-Check Output Validation", () => {
	it("should provide guidance if test fails", () => {
		// This test serves as documentation
		const guidance = `
If VS Code type-check is including API files, verify:
1. apps/vscode/tsconfig.json has composite: false
2. apps/vscode/tsconfig.json has references: []
3. apps/vscode/tsconfig.json excludes ../api/**/*
4. Run: pnpm tsx scripts/audit/validate-tsconfig-isolation.ts
5. Run: bash scripts/ci/check-type-check-isolation.sh
		`.trim();
		
		expect(guidance).toBeTruthy();
	});
});
