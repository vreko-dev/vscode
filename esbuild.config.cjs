const esbuild = require("esbuild");
const fs = require("node:fs");
const _path = require("node:path");
const { visualizer } = require("esbuild-visualizer");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
	const ctx = await esbuild.context({
		entryPoints: ["./src/extension.ts"],
		bundle: true,
		format: "cjs",
		platform: "node",
		target: "node20",
		outfile: "dist/extension.js",

		// External dependencies - only vscode API is truly external
		// All other dependencies are bundled into extension.js
		external: [
			"vscode",
			// NOTE: sql.js and better-sqlite3 are no longer used (file-based storage now)
		],

		// Minification (production only)
		minify: production,
		minifyWhitespace: production,
		minifyIdentifiers: false, // Keep identifier names for better debugging
		minifySyntax: production,

		// Tree-shaking
		treeShaking: true,

		// Mangling (production only) - DISABLED to prevent "X.oo is not a function" errors
		// mangleProps must be a RegExp object, not a boolean
		// Set to null/false to disable completely
		mangleProps: undefined, // Completely disable property mangling
		reserveProps: undefined, // Don't reserve any properties

		// Source maps (dev only)
		sourcemap: !production, // No sourcemaps in production to reduce bundle size

		// Drop console/debugger in production - DISABLED to preserve important logs
		drop: [], // Don't drop console/debugger statements

		// Legal comments
		legalComments: "none",

		// Logging
		logLevel: "info",

		// Main fields for resolution
		mainFields: ["module", "main"],

		// Environment
		define: {
			"process.env.NODE_ENV": production ? '"production"' : '"development"',
			"process.env.VSCODE_EXTENSION": '"true"',
		},

		// Enable metafile for bundle analysis
		metafile: production,

		// Add plugins to handle native modules and problematic dependencies
		plugins: [
			// esbuild-visualizer for bundle analysis
			{
				name: "visualizer",
				setup(build) {
					build.onEnd(async (result) => {
						if (production && result.metafile) {
							try {
								const html = await visualizer(result.metafile, {
									title: "SnapBack VSCode Bundle Analysis",
									template: "treemap",
								});
								fs.writeFileSync("dist/bundle-analysis.html", html);
								console.log("📊 Bundle analysis: dist/bundle-analysis.html");
							} catch (err) {
								console.warn("⚠️  Failed to generate bundle analysis", err);
							}
						}
					});
				},
			},
			// Handle problematic dependencies
			{
				name: "native-module-handler",
				setup(build) {
					// NOTE: better-sqlite3 and bindings are no longer used
					// (Extension now uses file-based storage instead of SQLite)

					// Handle pino-pretty (pino transport that won't be used in extension)
					// This prevents "unable to determine transport target" errors
					build.onResolve({ filter: /^pino-pretty$/ }, (args) => {
						return {
							path: args.path,
							namespace: "worker-stub",
						};
					});

					// Handle piscina (worker thread pool, not used in extension)
					build.onResolve({ filter: /^piscina$/ }, (args) => {
						return {
							path: args.path,
							namespace: "worker-stub",
						};
					});

					// Provide stub for worker thread dependencies
					build.onLoad({ filter: /.*/, namespace: "worker-stub" }, () => {
						return {
							contents: "module.exports = {}",
							loader: "js",
						};
					});

					// Handle import.meta.url polyfill for @snapback/engine package
					// The engine package uses import.meta.url which becomes undefined in CommonJS bundles
					build.onLoad({ filter: /packages\/engine\/dist\/index\.js$/ }, async (args) => {
						const contents = await fs.promises.readFile(args.path, "utf8");
						// Replace fileURLToPath(import.meta.url) with safe fallback
						// This prevents "Received undefined" errors during extension loading
						const transformed = contents.replace(
							/var __filename = fileURLToPath\(import\.meta\.url\);/g,
							"var __filename = __filename || '';"
						);
						return { contents: transformed, loader: "js" };
					});
				},
			},
		],
	});

	if (watch) {
		await ctx.watch();
		console.log("👀 Watching for changes...");
	} else {
		await ctx.rebuild();
		await ctx.dispose();

		// Log bundle size
		const stats = fs.statSync("./dist/extension.js");
		console.log("✅ Bundled successfully");
		console.log("📦 Output: dist/extension.js");
		console.log(`📊 Bundle size: ${Math.round(stats.size / 1024)}KB`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
