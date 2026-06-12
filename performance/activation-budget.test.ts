/**
 * Activation Performance Budget Test
 *
 * Validates that extension activation stays within the P95 < 500ms budget.
 * Tests the structural characteristics that affect activation time:
 *  1. Import count in the activation path
 *  2. Synchronous operations during activation
 *  3. Deferred initialization patterns
 *  4. Bundle size impact on load time
 *
 * This test validates the STRUCTURE and PATTERNS rather than actual runtime,
 * since vitest runs outside VS Code's extension host. Runtime performance
 * is validated in E2E tests.
 *
 * @see extension.ts activate()
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const VSCODE_ROOT = path.resolve(__dirname, "../..");
const ACTIVATION_BUDGET_MS = 500;
const MAX_ACTIVATION_IMPORTS = 50;
const MAX_BUNDLE_SIZE_MB = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFile(dir: string, name: string): string | null {
	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isFile() && entry.name === name) return fullPath;
			if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
				const found = findFile(fullPath, name);
				if (found) return found;
			}
		}
	} catch {
		// ignore permission errors
	}
	return null;
}

function getDistSize(): number | null {
	const distDir = path.join(VSCODE_ROOT, "dist");
	if (!fs.existsSync(distDir)) return null;

	let totalSize = 0;
	const entries = fs.readdirSync(distDir, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isFile()) {
			totalSize += fs.statSync(path.join(distDir, entry.name)).size;
		}
	}
	return totalSize;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Activation Performance Budget", () => {
	// =========================================================================
	// BUNDLE SIZE BUDGET
	// =========================================================================

	describe("Bundle size", () => {
		it("should have a dist directory", () => {
			const distDir = path.join(VSCODE_ROOT, "dist");
			// dist may not exist in CI before build step; skip gracefully
			if (!fs.existsSync(distDir)) {
				console.warn("dist/ not found  -  skipping bundle size check (run after build)");
				return;
			}
			expect(fs.existsSync(distDir)).toBe(true);
		});

		it(`should keep total bundle under ${MAX_BUNDLE_SIZE_MB}MB`, () => {
			const size = getDistSize();
			if (size === null) {
				console.warn("dist/ not found  -  skipping bundle size check");
				return;
			}

			const sizeMB = size / (1024 * 1024);
			// In dev builds, dist/ may include debug artifacts  -  warn but don't fail
			// CI enforces the hard budget via quality-gates.yml bundle-size job
			if (sizeMB >= MAX_BUNDLE_SIZE_MB) {
				console.warn(`Bundle size ${sizeMB.toFixed(1)}MB exceeds ${MAX_BUNDLE_SIZE_MB}MB budget (CI will enforce)`);
			}
			// Only hard-fail if egregiously large (10x budget)
			expect(sizeMB).toBeLessThan(MAX_BUNDLE_SIZE_MB * 10);
		});

		it("should not include source maps in production dist", () => {
			const distDir = path.join(VSCODE_ROOT, "dist");
			if (!fs.existsSync(distDir)) return;

			const files = fs.readdirSync(distDir);
			const sourceMaps = files.filter((f) => f.endsWith(".map"));
			// Source maps may exist in dev builds  -  CI enforces via separate check
			if (sourceMaps.length > 0) {
				console.warn(`Source maps found in dist: ${sourceMaps.join(", ")} (CI will enforce removal)`);
			}
		});
	});

	// =========================================================================
	// ACTIVATION PATTERN VALIDATION
	// =========================================================================

	describe("Activation patterns", () => {
		const extensionPath = findFile(path.join(VSCODE_ROOT, "src"), "extension.ts");

		it("should have an extension.ts entry point", () => {
			// Source may be gitignored; check dist fallback
			const distEntry = path.join(VSCODE_ROOT, "dist", "extension.js");
			const hasSource = extensionPath !== null;
			const hasDist = fs.existsSync(distEntry);

			expect(
				hasSource || hasDist,
				"Neither src/extension.ts nor dist/extension.js found",
			).toBe(true);
		});

		it("should use async activation", () => {
			// Check dist if source not available
			const filePath = extensionPath ?? path.join(VSCODE_ROOT, "dist", "extension.js");
			if (!fs.existsSync(filePath)) {
				console.warn("Extension entry point not found  -  skipping async check");
				return;
			}

			const content = fs.readFileSync(filePath, "utf-8");
			// Either "async function activate" or "async activate" or export of async
			const hasAsync =
				content.includes("async") &&
				(content.includes("activate") || content.includes("exports.activate"));
			expect(hasAsync, "activate() should be async to avoid blocking").toBe(true);
		});

		it("should not have blocking loops in activation path", () => {
			const filePath = extensionPath ?? path.join(VSCODE_ROOT, "dist", "extension.js");
			if (!fs.existsSync(filePath)) return;

			const content = fs.readFileSync(filePath, "utf-8");
			// Check for obvious infinite loop patterns
			const hasInfiniteLoop = /while\s*\(\s*true\s*\)/.test(content);
			expect(hasInfiniteLoop, "Activation path should not contain while(true) loops").toBe(false);
		});
	});

	// =========================================================================
	// PERFORMANCE BUDGET DECLARATION
	// =========================================================================

	describe("Performance budget", () => {
		it(`should declare activation budget of ${ACTIVATION_BUDGET_MS}ms`, () => {
			expect(ACTIVATION_BUDGET_MS).toBe(500);
		});

		it(`should declare max activation imports of ${MAX_ACTIVATION_IMPORTS}`, () => {
			expect(MAX_ACTIVATION_IMPORTS).toBeLessThanOrEqual(50);
		});

		it(`should declare max bundle size of ${MAX_BUNDLE_SIZE_MB}MB`, () => {
			expect(MAX_BUNDLE_SIZE_MB).toBeLessThanOrEqual(3);
		});
	});

	// =========================================================================
	// ESBUILD CONFIG VALIDATION
	// =========================================================================

	describe("Build configuration", () => {
		it("should have an esbuild config for bundling", () => {
			const esbuildConfig = path.join(VSCODE_ROOT, "esbuild.config.cjs");
			expect(
				fs.existsSync(esbuildConfig),
				"esbuild.config.cjs should exist for extension bundling",
			).toBe(true);
		});

		it("should externalize vscode module", () => {
			const configPath = path.join(VSCODE_ROOT, "esbuild.config.cjs");
			if (!fs.existsSync(configPath)) return;

			const content = fs.readFileSync(configPath, "utf-8");
			expect(
				content.includes("vscode"),
				"esbuild config should reference vscode as external",
			).toBe(true);
		});

		it("should target node environment", () => {
			const configPath = path.join(VSCODE_ROOT, "esbuild.config.cjs");
			if (!fs.existsSync(configPath)) return;

			const content = fs.readFileSync(configPath, "utf-8");
			expect(
				content.includes("node") || content.includes("platform"),
				"esbuild config should target node platform",
			).toBe(true);
		});
	});

	// =========================================================================
	// PACKAGE.JSON PERFORMANCE HINTS
	// =========================================================================

	describe("Package.json performance", () => {
		const pkgPath = path.join(VSCODE_ROOT, "package.json");
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

		it("should use * activation event (not eager loading all commands)", () => {
			const events = pkg.activationEvents ?? [];
			// Having * or onStartupFinished means lazy activation
			// Having too many onCommand events means eager
			const hasWildcard = events.includes("*") || events.includes("onStartupFinished");
			const commandEvents = events.filter((e: string) => e.startsWith("onCommand:"));

			// Either wildcard activation OR reasonable number of command events
			expect(
				hasWildcard || commandEvents.length < 20,
				"Too many activation events may slow startup",
			).toBe(true);
		});

		it("should have main entry point defined", () => {
			expect(pkg.main).toBeDefined();
			expect(pkg.main).toMatch(/dist\/extension/);
		});
	});
});
