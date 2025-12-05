const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { visualizer } = require("esbuild-visualizer");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * Copy sql.js WASM file to dist directory
 * The JS module is bundled, but the WASM binary needs to be available at runtime
 */
function copySqlJsWasm() {
	try {
		const sqlJsPath = require.resolve("sql.js");
		const sqlJsDir = path.dirname(sqlJsPath);
		const sqlJsDistDir = path.join(sqlJsDir, "..", "dist");

		// Create dist directory if it doesn't exist
		const destDir = "./dist";
		if (!fs.existsSync(destDir)) {
			fs.mkdirSync(destDir, { recursive: true });
		}

		// Copy only the WASM file (JS module is bundled by esbuild)
		const wasmSrc = path.join(sqlJsDistDir, "sql-wasm.wasm");
		const wasmDest = path.join(destDir, "sql-wasm.wasm");

		if (fs.existsSync(wasmSrc)) {
			fs.copyFileSync(wasmSrc, wasmDest);
			const sizeKB = Math.round(fs.statSync(wasmDest).size / 1024);
			console.log(`✅ Copied sql.js WASM file to ${wasmDest} (~${sizeKB}KB)`);
		} else {
			console.warn(`⚠️  WASM file not found at ${wasmSrc}`);
		}
	} catch (error) {
		console.warn(
			"⚠️  Failed to copy sql.js WASM file. Extension will attempt to locate it at runtime.",
			error instanceof Error ? error.message : String(error),
		);
	}
}

async function main() {
	const ctx = await esbuild.context({
		entryPoints: ["./src/extension.ts"],
		bundle: true,
		format: "cjs",
		platform: "node",
		target: "node20",
		outfile: "dist/extension.js",

		// External dependencies
		external: [
			"vscode",
			"better-sqlite3", // Native module
			"bindings", // Required by better-sqlite3 to load native addon
			// NOTE: sql.js JS module is bundled, but WASM files are copied manually to dist/sql.js/
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
			// Handle native modules and problematic dependencies
			{
				name: "native-module-handler",
				setup(build) {
					// Handle better-sqlite3 (native module)
					build.onResolve({ filter: /^better-sqlite3$/ }, (args) => {
						return { external: true, path: args.path };
					});

					build.onResolve({ filter: /^better-sqlite3\/.*/ }, (args) => {
						return { external: true, path: args.path };
					});

					// Handle bindings (required by better-sqlite3)
					build.onResolve({ filter: /^bindings$/ }, (args) => {
						return { external: true, path: args.path };
					});

					// Handle pino-pretty (pino transport that won't be used in production)
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
				},
			},
		],
	});

	if (watch) {
		await ctx.watch();
		console.log("👀 Watching for changes...");
		// Copy WASM in watch mode too
		copySqlJsWasm();
	} else {
		await ctx.rebuild();
		await ctx.dispose();

		// Copy sql.js WASM file after bundling
		copySqlJsWasm();

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
