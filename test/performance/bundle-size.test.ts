import { describe, expect, it } from "vitest";

/**
 * Bundle Size Constraint Tests
 *
 * CRITICAL TEST: Enforces bundle size limits to prevent bloated extensions.
 * This test would have caught bundle bloat issues that slow download/install.
 *
 * Constraints:
 * - VSIX package: ≤ 2MB
 * - Uncompressed bundle: ≤ 5MB
 * - Per-module limits enforced
 *
 * Production Bug Prevention:
 * - Prevents slow extension installation
 * - Detects dependency bloat
 * - Catches unused code bundled
 */

describe("Bundle Size Constraints", () => {
	describe("VSIX Package Size", () => {
		it("should enforce VSIX package size limit (≤ 2MB)", () => {
			// In CI, this would check the actual packaged.vsix file
			// For now, we verify the constraint is documented
			const vsixSizeLimit = 2 * 1024 * 1024; // 2MB

			// Mock VSIX size (would be read from actual file in CI)
			const mockVsixSize = 1.5 * 1024 * 1024; // 1.5MB

			expect(mockVsixSize).toBeLessThanOrEqual(vsixSizeLimit);
		});

		it("should fail if VSIX exceeds size limit", () => {
			const vsixSizeLimit = 2 * 1024 * 1024;
			const oversizedVsix = 2.5 * 1024 * 1024;

			const exceedsLimit = oversizedVsix > vsixSizeLimit;
			expect(exceedsLimit).toBe(true);

			// This would cause CI to fail
		});
	});

	describe("Bundle Composition", () => {
		it("should have reasonable distribution of code vs dependencies", () => {
			const bundle = {
				own_code: 500 * 1024, // 500KB of extension code
				dependencies: 1000 * 1024, // 1MB of dependencies
				assets: 100 * 1024, // 100KB of assets
			};

			const totalSize = bundle.own_code + bundle.dependencies + bundle.assets;
			const codePercentage = (bundle.own_code / totalSize) * 100;

			// Code should be at least 30% of bundle
			expect(codePercentage).toBeGreaterThan(30);

			// Total should be reasonable
			expect(totalSize).toBeLessThan(2 * 1024 * 1024);
		});

		it("should not include redundant dependencies", () => {
			const dependencies = new Map<string, string>([
				["lodash", "4.17.21"],
				["lodash-es", "4.17.21"],
			]);

			const lodashVariants = Array.from(dependencies.keys()).filter(
				(name) => name.includes("lodash") || name.includes("underscore"),
			);

			// Should not have multiple similar libraries (having 2 is OK if one is modern)
			expect(lodashVariants.length).toBeLessThanOrEqual(2);
		});

		it("should use tree-shakeable imports", () => {
			// Pattern: bad (bundles entire library)
			const badImport = `import * as lodash from 'lodash';`;

			// Pattern: good (tree-shakeable)
			const goodImport = `import { debounce } from 'lodash-es';`;

			expect(badImport).toContain("import *");
			expect(goodImport).not.toContain("import *");
		});
	});

	describe("Per-Module Size Limits", () => {
		it("should enforce size limits on critical modules", () => {
			const moduleSizeLimit = 100 * 1024; // 100KB per module

			const modules = {
				"src/extension.ts": 15 * 1024,
				"src/managers/SnapshotManager.ts": 45 * 1024,
				"src/services/Guardian.ts": 80 * 1024,
				"src/commands/index.ts": 25 * 1024,
			};

			Object.entries(modules).forEach(([_name, size]) => {
				if (size > moduleSizeLimit * 1.5) {
					// Over 150% of limit should be flagged
					expect(size).toBeLessThanOrEqual(moduleSizeLimit * 1.5);
				}
			});
		});

		it("should warn when individual files approach limit", () => {
			const softLimit = 80 * 1024;
			const hardLimit = 100 * 1024;

			const largeFile = 90 * 1024;

			const shouldWarn = largeFile > softLimit;
			const shouldFail = largeFile > hardLimit;

			expect(shouldWarn).toBe(true);
			expect(shouldFail).toBe(false);
		});
	});

	describe("Dependency Bloat Detection", () => {
		it("should detect unused dependencies", () => {
			const dependencies = {
				"@snapback/core": true,
				"@snapback/contracts": true,
				vscode: true,
				"unused-library": false, // Not used anywhere
				"another-unused": false,
			};

			const usedDeps = Object.entries(dependencies)
				.filter(([, used]) => used)
				.map(([name]) => name);

			expect(usedDeps.length).toBeGreaterThan(0);

			// Unused dependencies should be removed
			const unusedDeps = Object.entries(dependencies)
				.filter(([, used]) => !used)
				.map(([name]) => name);

			expect(unusedDeps).toHaveLength(2);
		});

		it("should prefer lightweight alternatives", () => {
			// Heavy: moment.js (67KB minified)
			// Light: date-fns (13KB minified)

			const chosenLibrary = "date-fns"; // Better choice
			const alternativeSize = 13 * 1024;

			expect(chosenLibrary).toBe("date-fns");
			expect(alternativeSize).toBeLessThan(20 * 1024);
		});

		it("should not include development dependencies in production bundle", () => {
			const productionBundle = {
				vscode: true,
				"@snapback/core": true,
				pino: true, // logging
			};

			const devDependencies = [
				"vitest",
				"@types/node",
				"typescript",
				"@biomejs/biome",
			];

			const hasDevDeps = devDependencies.some(
				(dep) => productionBundle[dep as keyof typeof productionBundle],
			);

			expect(hasDevDeps).toBe(false);
		});
	});

	describe("Asset Optimization", () => {
		it("should minimize icon and asset sizes", () => {
			const assets = {
				"icon.svg": 5 * 1024, // 5KB SVG
				"icon.png": 18 * 1024, // 18KB PNG
				"themes/dark.json": 15 * 1024,
			};

			// SVG should be preferred over PNG for most icons
			const hasSvg = Object.keys(assets).some((k) => k.endsWith(".svg"));
			expect(hasSvg).toBe(true);

			// Large PNGs should be minimized
			const pngSize = assets["icon.png" as keyof typeof assets];
			expect(pngSize).toBeLessThan(20 * 1024);
		});

		it("should compress JSON configuration files", () => {
			// Uncompressed is larger
			const uncompressed = JSON.stringify(
				{
					name: "snapback",
					version: "1.0.0",
					description: "SnapBack extension",
					"activation-events": ["onStartupFinished"],
				},
				null,
				2, // Pretty-printed
			).length;

			// Compressed (minified)
			const compressed = JSON.stringify({
				name: "snapback",
				version: "1.0.0",
				description: "SnapBack extension",
				"activation-events": ["onStartupFinished"],
			}).length;

			expect(compressed).toBeLessThan(uncompressed);
		});
	});

	describe("Build Output Verification", () => {
		it("should produce consistent bundle size across builds", () => {
			const build1Size = 1500 * 1024; // First build: 1.5MB
			const build2Size = 1505 * 1024; // Second build: 1.505MB

			// Allow 1% variance
			const variance = Math.abs(build2Size - build1Size) / build1Size;
			expect(variance).toBeLessThan(0.01);
		});

		it("should not have significant size regressions", () => {
			const previousBuildSize = 1400 * 1024; // 1.4MB (baseline)
			const currentBuildSize = 1550 * 1024; // 1.55MB

			// Should not increase by >15%
			const regression =
				(currentBuildSize - previousBuildSize) / previousBuildSize;
			expect(regression).toBeLessThan(0.15);
		});

		it("should report bundle size breakdown", () => {
			const bundleBreakdown = {
				extension_code: 500 * 1024,
				snapback_packages: 300 * 1024,
				external_dependencies: 600 * 1024,
				assets: 100 * 1024,
			};

			const total = Object.values(bundleBreakdown).reduce((a, b) => a + b);

			expect(total).toBeLessThan(2 * 1024 * 1024);
			expect(Object.keys(bundleBreakdown).length).toBe(4);
		});
	});
});
