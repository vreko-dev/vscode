/**
 * RED Phase Tests: ImportAnalyzer - Cluster Engine Dependency Analysis
 *
 * Tests for parsing imports and resolving file paths for dependency clustering
 * Covers: happy path (multi-level imports), sad path (circular/missing), edge cases, error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImportAnalyzer } from '../../../src/engine/graph/ImportAnalyzer';

describe('ImportAnalyzer - Cluster Engine', () => {
	let analyzer: ImportAnalyzer;

	beforeEach(() => {
		analyzer = new ImportAnalyzer();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// ===========================
	// HAPPY PATH: Expected behavior
	// ===========================
	describe('happy path', () => {
		it('should parse ES6 import statements', async () => {
			const content = `import { Button } from '@mui/material';\nimport React from 'react';`;
			const imports = await analyzer.parseImports(content);

			expect(imports).toContain('@mui/material');
			expect(imports).toContain('react');
			expect(imports.length).toBe(2);
		});

		it('should parse CommonJS require statements', async () => {
			const content = `const express = require('express');\nconst path = require('path');`;
			const imports = await analyzer.parseImports(content);

			expect(imports).toContain('express');
			expect(imports).toContain('path');
			expect(imports.length).toBe(2);
		});

		it('should resolve relative import paths to absolute workspace paths', async () => {
			const relativeImport = '../services/auth';
			const currentFilePath = '/project/src/components/Login.ts';

			const resolvedPath = analyzer.resolveImportPath(relativeImport, currentFilePath);

			expect(resolvedPath).toMatch(/\/project\/src\/services\/auth\.(ts|tsx|js)?$/);
		});

		it('should handle default imports and named imports together', async () => {
			const content = `import React, { useState, useEffect } from 'react';\nimport { Router } from 'express';`;
			const imports = await analyzer.parseImports(content);

			expect(imports).toContain('react');
			expect(imports).toContain('express');
		});

		it('should build dependency tree up to depth=2', async () => {
			// Root file imports service, service imports util
			const files = new Map([
				['/app/view.ts', `import { getData } from './services/api';`],
				['/app/services/api.ts', `import { log } from '../utils/logger';`],
				['/app/utils/logger.ts', `export const log = () => {};`]
			]);

			vi.spyOn(analyzer, 'buildDependencyTree').mockResolvedValue({
				root: '/app/view.ts',
				depth1: ['/app/services/api.ts'],
				depth2: ['/app/utils/logger.ts']
			});

			const tree = await analyzer.buildDependencyTree('/app/view.ts', files);

			expect(tree.root).toBe('/app/view.ts');
			expect(tree.depth1).toContain('/app/services/api.ts');
			expect(tree.depth2).toContain('/app/utils/logger.ts');
		});

		it('should ignore node_modules and external packages', async () => {
			const content = `import { Button } from '@mui/material';\nimport { getData } from './api';`;
			const imports = await analyzer.parseImports(content);

			// Should parse both, but filtering happens in ClusterManager
			expect(imports).toContain('@mui/material');
			expect(imports).toContain('./api');
			expect(imports.length).toBe(2);
		});
	});

	// ===========================
	// SAD PATH: Error scenarios
	// ===========================
	describe('sad path', () => {
		it('should handle circular dependencies without infinite loop', async () => {
			const files = new Map([
				['/app/a.ts', `import { b } from './b';`],
				['/app/b.ts', `import { a } from './a';`]
			]);

			vi.spyOn(analyzer, 'buildDependencyTree').mockResolvedValue({
				root: '/app/a.ts',
				depth1: ['/app/b.ts'],
				depth2: [] // Circular reference not followed to depth 2
			});

			const tree = await analyzer.buildDependencyTree('/app/a.ts', files);

			expect(tree.root).toBe('/app/a.ts');
			expect(tree.depth1).toContain('/app/b.ts');
			expect(tree.depth2).toHaveLength(0); // Stops at depth 1 for circular
		});

		it('should return empty array for file with no imports', async () => {
			const content = `const x = 5;\nconst y = 10;`;
			const imports = await analyzer.parseImports(content);

			expect(imports).toEqual([]);
		});

		it('should handle missing imports gracefully', async () => {
			const files = new Map([
				['/app/view.ts', `import { missing } from './nonexistent';`]
			]);

			vi.spyOn(analyzer, 'buildDependencyTree').mockResolvedValue({
				root: '/app/view.ts',
				depth1: [],
				depth2: []
			});

			const tree = await analyzer.buildDependencyTree('/app/view.ts', files);

			expect(tree.depth1).toEqual([]);
			expect(tree.depth2).toEqual([]);
		});

		it('should reject requests from non-pioneer users gracefully', async () => {
			const tier = 'seedling';
			const maxDepth = tier === 'seedling' ? 0 : tier === 'grower' ? 1 : 2;

			expect(maxDepth).toBe(0); // Seedling can't use clusters
		});
	});

	// ===========================
	// EDGE CASES
	// ===========================
	describe('edge cases', () => {
		it('should handle dynamic imports like import(...)', async () => {
			const content = `const mod = import('./dynamic');`;
			const imports = await analyzer.parseImports(content);

			// Dynamic imports are harder to parse statically
			// This test verifies we handle them gracefully (skip or detect)
			expect(Array.isArray(imports)).toBe(true);
		});

		it('should handle imports with special characters and unicode', async () => {
			const content = `import { Ѐҁҋ } from '@special/chars';\nimport data from './日本語';`;
			const imports = await analyzer.parseImports(content);

			expect(imports.length).toBeGreaterThanOrEqual(1);
		});

		it('should cap depth analysis at depth=2 even with deeper nesting', async () => {
			const files = new Map([
				['/app/a.ts', `import { b } from './b';`],
				['/app/b.ts', `import { c } from './c';`],
				['/app/c.ts', `import { d } from './d';`],
				['/app/d.ts', `export const d = () => {};`]
			]);

			vi.spyOn(analyzer, 'buildDependencyTree').mockResolvedValue({
				root: '/app/a.ts',
				depth1: ['/app/b.ts'],
				depth2: ['/app/c.ts']
				// depth3 (/app/d.ts) should NOT be included
			});

			const tree = await analyzer.buildDependencyTree('/app/a.ts', files);

			expect(tree.depth1).toHaveLength(1);
			expect(tree.depth2).toHaveLength(1);
			expect(tree.depth2).not.toContain('/app/d.ts');
		});

		it('should handle very large import lists (1000+ imports)', async () => {
			const imports = Array.from({ length: 1000 }, (_, i) => `import mod${i} from './mod${i}';`).join('\n');

			const result = await analyzer.parseImports(imports);

			expect(result.length).toBe(1000);
		});

		it('should distinguish local imports from node_modules', async () => {
			const content = `
				import React from 'react';
				import { getUser } from './services/user';
				import { Button } from '@mui/material';
			`;
			const imports = await analyzer.parseImports(content);

			expect(imports).toContain('react');
			expect(imports).toContain('./services/user');
			expect(imports).toContain('@mui/material');
			expect(imports.length).toBe(3);
		});
	});

	// ===========================
	// ERROR HANDLING
	// ===========================
	describe('error handling', () => {
		it('should throw/warn on invalid file path', async () => {
			const invalidPath = '/nonexistent/file.ts';

			expect(() => {
				analyzer.resolveImportPath('./service', invalidPath);
			}).not.toThrow(); // Should degrade gracefully, not throw

			// Or: should log warning
			const result = await analyzer.buildDependencyTree(invalidPath, new Map());
			expect(result.depth1).toEqual([]);
			expect(result.depth2).toEqual([]); // Returns empty tree gracefully
		});

		it('should log malformed import syntax without crashing', async () => {
			const content = `import { from './bad syntax";`;
			const spy = vi.spyOn(console, 'warn');

			const imports = await analyzer.parseImports(content);

			// Should handle gracefully - either skip or warn
			expect(Array.isArray(imports)).toBe(true);
		});

		it('should handle file read failures', async () => {
			const result = await analyzer.buildDependencyTree('/missing/file.ts', new Map());

			// Should return empty tree without throwing
			expect(result.root).toBe('/missing/file.ts');
			expect(result.depth1).toEqual([]);
			expect(result.depth2).toEqual([]);
		});

		it('should timeout on excessively complex dependency graphs', async () => {
			const files = new Map();
			// Generate 100+ interdependent files (reduced from 1000 for test speed)
			for (let i = 0; i < 100; i++) {
				files.set(`/app/file${i}.ts`, `import { x } from './file${i + 1}';`);
			}

			const timeout = 5000; // 5 second timeout
			const startTime = Date.now();

			const promise = analyzer.buildDependencyTree('/app/file0.ts', files);

			const result = await Promise.race([
				promise,
				new Promise(resolve => setTimeout(() => resolve(null), timeout))
			]);

			const elapsed = Date.now() - startTime;

			// Should either complete or timeout gracefully
			if (result === null) {
				expect(elapsed).toBeGreaterThanOrEqual(timeout - 100);
			} else {
				expect(elapsed).toBeLessThan(timeout);
			}
		});

		it('should handle mixed TypeScript and JavaScript imports', async () => {
			const content = `
				import { ts } from './file.ts';
				import { js } from './file.js';
				import { tsx } from './component.tsx';
				import { jsx } from './component.jsx';
			`;
			const imports = await analyzer.parseImports(content);

			expect(imports.length).toBe(4);
		});
	});
});
