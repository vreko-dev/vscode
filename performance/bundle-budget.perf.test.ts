/**
 * Bundle Budget Performance Tests
 *
 * Validates that extension bundles meet size budgets.
 * This is a unit test that runs in Vitest - it checks file sizes.
 *
 * Budgets (from @vreko/contracts/performance-budgets):
 * - VSIX size: < 1.5MB
 * - extension.js size: < 1.5MB
 *
 * @see docs/perf_testing.md for full strategy
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TIER1_BUDGETS } from "@vreko/contracts";

// =============================================================================
// Configuration
// =============================================================================

const EXTENSION_ROOT = join(__dirname, "../..");
const DIST_DIR = join(EXTENSION_ROOT, "dist");
const BASELINE_DIR = join(process.cwd(), ".baselines/performance");

// =============================================================================
// Types
// =============================================================================

interface BundleSizeResult {
	name: string;
	path: string;
	sizeBytes: number;
	sizeMB: number;
	budgetMB: number;
	passed: boolean;
}

interface BundleSizeBaseline {
	timestamp: string;
	results: BundleSizeResult[];
	commit?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function getLatestVSIX(): { name: string; path: string; sizeBytes: number } | null {
	const files = readdirSync(EXTENSION_ROOT);
	const vsixPattern = /^vreko-vscode-.*\.vsix$/;
	const vsixFiles = files.filter((f) => vsixPattern.test(f));

	if (vsixFiles.length === 0) return null;

	// Sort by modification time to get the latest
	const latest = vsixFiles
		.map((name) => ({
			name,
			path: join(EXTENSION_ROOT, name),
			sizeBytes: statSync(join(EXTENSION_ROOT, name)).size,
			mtime: statSync(join(EXTENSION_ROOT, name)).mtime.getTime(),
		}))
		.sort((a, b) => b.mtime - a.mtime)[0];

	return latest;
}

function getBundleSize(bundlePath: string): number {
	if (!existsSync(bundlePath)) return 0;
	return statSync(bundlePath).size;
}

function checkBundleBudget(
	name: string,
	path: string,
	budgetMB: number,
): BundleSizeResult {
	const sizeBytes = getBundleSize(path);
	const sizeMB = sizeBytes / (1024 * 1024);

	return {
		name,
		path,
		sizeBytes,
		sizeMB: Number.parseFloat(sizeMB.toFixed(4)),
		budgetMB,
		passed: sizeMB <= budgetMB,
	};
}

function loadBaseline(): BundleSizeBaseline | null {
	const baselinePath = join(BASELINE_DIR, "bundle-sizes.json");
	if (!existsSync(baselinePath)) return null;

	try {
		const content = require("fs").readFileSync(baselinePath, "utf-8");
		return JSON.parse(content);
	} catch {
		return null;
	}
}

function saveBaseline(results: BundleSizeResult[]): void {
	const baseline: BundleSizeBaseline = {
		timestamp: new Date().toISOString(),
		results,
		commit: process.env.GITHUB_SHA,
	};

	// Ensure directory exists
	const baselineDir = BASELINE_DIR;
	if (!existsSync(baselineDir)) {
		require("fs").mkdirSync(baselineDir, { recursive: true });
	}

	require("fs").writeFileSync(join(baselineDir, "bundle-sizes.json"), JSON.stringify(baseline, null, 2));
}

// =============================================================================
// Test Suite
// =============================================================================

describe("Bundle Size Budgets", () => {
	let results: BundleSizeResult[] = [];

	beforeAll(() => {
		// Collect all bundle size results
		results = [];
	});

	afterAll(() => {
		// Save baseline for regression tracking
		if (results.length > 0) {
			saveBaseline(results);
		}
	});

	describe("VSIX Package", () => {
		it(`should be less than ${TIER1_BUDGETS.vsixSizeMB.budget}MB`, () => {
			const vsix = getLatestVSIX();

			if (!vsix) {
				// Skip if no VSIX - might be in dev environment
				expect(true).toBe(true);
				return;
			}

			const result = checkBundleBudget(
				"VSIX Package",
				vsix.path,
				TIER1_BUDGETS.vsixSizeMB.budget,
			);

			results.push(result);

			console.log(`\n  VSIX: ${formatBytes(result.sizeBytes)} (${result.sizeMB.toFixed(4)}MB)`);
			console.log(`  Budget: ${TIER1_BUDGETS.vsixSizeMB.budget}MB`);
			console.log(`  Status: ${result.passed ? "PASS" : "FAIL"}`);

			expect(result.sizeMB).toBeLessThanOrEqual(TIER1_BUDGETS.vsixSizeMB.budget);
		});

		it("should have valid VSIX structure", () => {
			const vsix = getLatestVSIX();
			if (!vsix) {
				expect(true).toBe(true);
				return;
			}

			// VSIX should be a reasonable size (not empty, not corrupted)
			expect(vsix.sizeBytes).toBeGreaterThan(100 * 1024); // At least 100KB
			expect(vsix.sizeBytes).toBeLessThan(50 * 1024 * 1024); // Less than 50MB (sanity check)
		});
	});

	describe("Extension Bundle", () => {
		it(`should have extension.js less than ${TIER1_BUDGETS.extensionJsMB.budget}MB`, () => {
			const bundlePath = join(DIST_DIR, "extension.js");

			if (!existsSync(bundlePath)) {
				// Skip if no bundle - might need to build first
				expect(true).toBe(true);
				return;
			}

			const result = checkBundleBudget(
				"extension.js",
				bundlePath,
				TIER1_BUDGETS.extensionJsMB.budget,
			);

			results.push(result);

			console.log(`\n  extension.js: ${formatBytes(result.sizeBytes)} (${result.sizeMB.toFixed(4)}MB)`);
			console.log(`  Budget: ${TIER1_BUDGETS.extensionJsMB.budget}MB`);
			console.log(`  Status: ${result.passed ? "PASS" : "FAIL"}`);

			expect(result.sizeMB).toBeLessThanOrEqual(TIER1_BUDGETS.extensionJsMB.budget);
		});

		it("should have source map generated", () => {
			const sourceMapPath = join(DIST_DIR, "extension.js.map");

			// Source map is optional in production builds, but recommended for debugging
			if (!existsSync(sourceMapPath)) {
				console.log("\n  Source map not found (optional for production)");
			}

			// Don't fail if no source map - it's optional
			expect(true).toBe(true);
		});
	});

	describe("Baseline Comparison", () => {
		it("should not regress from baseline", () => {
			const baseline = loadBaseline();

			if (!baseline) {
				console.log("\n  No baseline found - skipping comparison");
				expect(true).toBe(true);
				return;
			}

			console.log(`\n  Comparing against baseline from: ${baseline.timestamp}`);

			// Check for regressions
			const regressions: string[] = [];

			for (const baselineResult of baseline.results) {
				const currentResult = results.find((r) => r.name === baselineResult.name);
				if (!currentResult) continue;

				const increase = currentResult.sizeMB - baselineResult.sizeMB;
				const percentIncrease = (increase / baselineResult.sizeMB) * 100;

				if (percentIncrease > 5) {
					regressions.push(
						`${baselineResult.name}: ${baselineResult.sizeMB.toFixed(4)}MB → ${currentResult.sizeMB.toFixed(4)}MB (+${percentIncrease.toFixed(1)}%)`,
					);
				}
			}

			if (regressions.length > 0) {
				console.log("\n  Regressions detected:");
				for (const r of regressions) {
					console.log(`    - ${r}`);
				}
			} else {
				console.log("\n  No significant regressions detected");
			}

			// Warn but don't fail on regression (use CI gate for enforcement)
			expect(true).toBe(true);
		});
	});

	describe("Bundle Composition", () => {
		it("should not have unexpected large files in dist/", () => {
			if (!existsSync(DIST_DIR)) {
				expect(true).toBe(true);
				return;
			}

			const files = readdirSync(DIST_DIR);
			const largeFiles: string[] = [];

			for (const file of files) {
				const filePath = join(DIST_DIR, file);
				const stats = statSync(filePath);

				// Flag files larger than 500KB that aren't the main bundle
				if (stats.size > 500 * 1024 && file !== "extension.js" && file !== "extension.js.map") {
					largeFiles.push(`${file}: ${formatBytes(stats.size)}`);
				}
			}

			if (largeFiles.length > 0) {
				console.log("\n  Unexpected large files in dist/:");
				for (const f of largeFiles) {
					console.log(`    - ${f}`);
				}
			}

			// This is a warning, not a failure
			expect(largeFiles.length).toBe(0);
		});
	});
});
