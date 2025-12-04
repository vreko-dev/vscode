/**
 * Regex-based import extraction fallback
 * Used when madge times out or fails
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

export async function getBasicImportGraph(
	workspace: string,
): Promise<Record<string, string[]>> {
	const graph: Record<string, string[]> = {};

	// Find all TypeScript files
	const files = await glob("**/*.{ts,tsx}", {
		cwd: workspace,
		ignore: [
			"**/node_modules/**",
			"**/*.test.*",
			"**/*.spec.*",
			"**/dist/**",
			"**/build/**",
		],
		absolute: true,
	});

	for (const file of files) {
		const content = fs.readFileSync(file, "utf-8");
		const imports = extractImports(content, file, workspace);

		if (imports.length > 0) {
			graph[file] = imports;
		}
	}

	return graph;
}

function extractImports(
	content: string,
	filePath: string,
	workspace: string,
): string[] {
	const imports: string[] = [];

	// Match import statements
	const importRegex =
		/import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
	const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

	let match;

	// Extract ES6 imports
	while ((match = importRegex.exec(content)) !== null) {
		const importPath = match[1];
		if (importPath.startsWith(".")) {
			// Resolve relative imports
			const resolved = resolveImport(importPath, filePath, workspace);
			if (resolved) imports.push(resolved);
		}
	}

	// Extract CommonJS requires
	while ((match = requireRegex.exec(content)) !== null) {
		const requirePath = match[1];
		if (requirePath.startsWith(".")) {
			const resolved = resolveImport(requirePath, filePath, workspace);
			if (resolved) imports.push(resolved);
		}
	}

	return imports;
}

function resolveImport(
	importPath: string,
	fromFile: string,
	_workspace: string,
): string | null {
	const dir = path.dirname(fromFile);

	// Try with various extensions
	const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

	for (const ext of extensions) {
		const resolved = path.resolve(dir, importPath + ext);
		if (fs.existsSync(resolved)) {
			return resolved;
		}
	}

	// If no extension matches, return the resolved path anyway
	return path.resolve(dir, importPath);
}
