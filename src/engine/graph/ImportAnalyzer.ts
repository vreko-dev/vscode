import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Analyzes module imports in TypeScript/JavaScript files to build dependency trees.
 * Supports both ES6 imports and CommonJS requires.
 *
 * Features:
 * - Parses ES6 imports and CommonJS requires
 * - Auto-detects file extensions (.ts, .tsx, .js, .jsx)
 * - Prevents circular dependencies
 * - Skips external packages (node_modules, @scoped)
 * - Supports file cache for testing
 *
 * @class ImportAnalyzer
 */
export class ImportAnalyzer {
	/**
	 * Parse import statements from file content.
	 * Extracts both ES6 imports and CommonJS requires.
	 *
	 * Matches patterns:
	 * - `import X from 'path'`
	 * - `require('path')`
	 *
	 * @param content - File content to parse
	 * @returns Array of import paths (relative or absolute)
	 */
	async parseImports(content: string): Promise<string[]> {
		const imports: string[] = [];

		// ES6 import: import X from 'path'
		const importRegex = /import\s+(?:[\w*\s{},]+)\s+from\s+['"]([^'"]+)['"]/g;
		let match;
		while ((match = importRegex.exec(content)) !== null) {
			imports.push(match[1]);
		}

		// CommonJS require: require('path')
		const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
		while ((match = requireRegex.exec(content)) !== null) {
			imports.push(match[1]);
		}

		return imports;
	}

	/**
	 * Resolve a relative import path to an absolute workspace path.
	 *
	 * Handles:
	 * - Relative paths (../, ./)
	 * - Absolute paths (/)
	 * - Missing file extensions (.ts/.tsx/.js/.jsx auto-detection)
	 * - Null/undefined paths (returns empty string)
	 * - Invalid path formats (normalizes using path.resolve)
	 *
	 * @param relativeImport - Import path from code (e.g., '../services/api' or null)
	 * @param currentFilePath - Current file's absolute path (or null)
	 * @returns Absolute file path with extension (empty string if invalid)
	 *
	 * @example
	 * ```typescript
	 * const resolved = analyzer.resolveImportPath(
	 *   '../services/api',
	 *   '/project/src/components/Login.ts'
	 * );
	 * // Returns: '/project/src/services/api.ts'
	 * ```
	 */
	resolveImportPath(relativeImport: string | null | undefined, currentFilePath: string | null | undefined): string {
		// Handle null/undefined inputs
		if (!relativeImport || !currentFilePath) {
			return "";
		}

		// Handle absolute imports (already absolute paths)
		if (relativeImport.startsWith("/")) {
			return relativeImport;
		}

		// Resolve relative to current file's directory
		const currentDir = path.dirname(currentFilePath);
		const resolvedPath = path.resolve(currentDir, relativeImport);

		// Auto-detect file extension if missing
		if (!path.extname(resolvedPath)) {
			const extensions = [".ts", ".tsx", ".js", ".jsx"];
			for (const ext of extensions) {
				const pathWithExt = resolvedPath + ext;
				if (fs.existsSync(pathWithExt)) {
					return pathWithExt;
				}
			}
			// Default to .ts for non-existent files (test support)
			return `${resolvedPath}.ts`;
		}

		return resolvedPath;
	}

	/**
	 * Build a dependency tree from an anchor file (up to 2 levels deep).
	 *
	 * Returns:
	 * - root: The anchor file path
	 * - depth1: Direct dependencies of root
	 * - depth2: Dependencies of depth1 files (transitive dependencies)
	 *
	 * Behavior:
	 * - Prevents circular dependencies using visited Set
	 * - Skips external packages (node_modules, @scope/package)
	 * - Returns gracefully for missing files
	 * - Supports file cache for unit testing
	 *
	 * @param anchorPath - Starting file path
	 * @param fileContents - Optional file cache (for testing)
	 * @param maxDepth - Maximum depth to traverse (default: 2)
	 * @returns Dependency tree structure with root, depth1, and depth2 files
	 *
	 * @example
	 * ```typescript
	 * const tree = await analyzer.buildDependencyTree('/project/src/core/engine.ts');
	 * // Returns:
	 * // {
	 * //   root: '/project/src/core/engine.ts',
	 * //   depth1: ['/project/src/services/api.ts', ...],
	 * //   depth2: ['/project/src/utils/logger.ts', ...]
	 * // }
	 * ```
	 */
	async buildDependencyTree(
		anchorPath: string,
		fileContents?: Map<string, string>,
		maxDepth = 2,
	): Promise<{ root: string; depth1: string[]; depth2: string[] }> {
		const result = {
			root: anchorPath,
			depth1: [] as string[],
			depth2: [] as string[],
		};

		// Track visited files to prevent circular dependency cycles (A→B→A)
		const visited = new Set<string>();
		visited.add(anchorPath);

		// Load root file content
		let rootContent: string;
		if (fileContents?.has(anchorPath)) {
			rootContent = fileContents.get(anchorPath) || "";
		} else {
			try {
				rootContent = fs.readFileSync(anchorPath, "utf-8");
			} catch {
				return result; // File doesn't exist - return empty tree
			}
		}

		// Parse and resolve depth1 (direct) imports
		const depth1Imports = await this.parseImports(rootContent || "");

		for (const imp of depth1Imports) {
			// Skip external packages (from node_modules or scoped imports)
			if ((imp.startsWith("@") && !imp.includes("/")) || imp.startsWith("node_modules")) {
				continue;
			}

			const resolvedPath = this.resolveImportPath(imp, anchorPath);

			// Skip if already visited (circular dependency prevention)
			if (!visited.has(resolvedPath)) {
				result.depth1.push(resolvedPath);
				visited.add(resolvedPath);
			}
		}

		// Parse and resolve depth2 (transitive) imports
		if (maxDepth >= 2) {
			for (const depth1File of result.depth1) {
				let depth1Content: string;
				if (fileContents?.has(depth1File)) {
					depth1Content = fileContents.get(depth1File) || "";
				} else {
					try {
						depth1Content = fs.readFileSync(depth1File, "utf-8");
					} catch {
						// File missing - skip this depth1 file
						continue;
					}
				}

				const depth2Imports = await this.parseImports(depth1Content || "");

				for (const imp of depth2Imports) {
					// Skip external packages
					if ((imp.startsWith("@") && !imp.includes("/")) || imp.startsWith("node_modules")) {
						continue;
					}

					const resolvedPath = this.resolveImportPath(imp, depth1File);

					// Skip if already visited (circular dependency prevention)
					if (!visited.has(resolvedPath)) {
						result.depth2.push(resolvedPath);
						visited.add(resolvedPath);
					}
				}
			}
		}

		return result;
	}
}
