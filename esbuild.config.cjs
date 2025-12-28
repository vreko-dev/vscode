const esbuild = require("esbuild");
const fs = require("node:fs");
const _path = require("node:path");
const { visualizer } = require("esbuild-visualizer");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
	// Build extension (thin client)
	const extensionCtx = await esbuild.context({
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
			// Native modules from @snapback/intelligence (semantic search)
			// These are optional peer deps that use native .node modules
			// They MUST be installed in the extension's node_modules at runtime
			"onnxruntime-node",
			"onnxruntime-common",
			"onnxruntime-web",
			"@huggingface/transformers", // Uses onnxruntime-node for local inference
			"sql.js",                     // Uses WASM, optional for SemanticRetriever
			// Large dependencies externalized (lazy-loaded at runtime)
			"simple-git",                 // ~200KB - lazy-loaded via git-lazy.ts
			"chokidar",                   // ~400KB - only used in agent watcher
			// Externalize heavy packages to language server
			"@snapback/intelligence",     // Moved to language server
			"@snapback/engine",           // Moved to language server (if needed)
			// Optional template engines from @vue/compiler-sfc's consolidate.js
			"velocityjs", "dustjs-linkedin", "atpl", "liquor", "twig", "ejs", "eco",
			"jazz", "jqtpl", "hamljs", "hamlet", "whiskers", "haml-coffee", "hogan.js",
			"templayed", "handlebars", "underscore", "lodash", "walrus", "mustache",
			"just", "ect", "mote", "toffee", "dot", "bracket-template", "ractive",
			"nunjucks", "htmling", "babel-core", "plates", "react-dom/server", "react",
			"arc-templates", "vash", "slm", "marko", "teacup/lib/express", "teacup",
			"coffee-script", "squirrelly", "twing",
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

	// Build language server (heavy packages)
	const serverCtx = await esbuild.context({
		entryPoints: ["./server/index.ts"],
		bundle: true,
		format: "cjs",
		platform: "node",
		target: "node20",
		outfile: "dist/server/index.js",

		// External - keep native modules external
		external: [
			"onnxruntime-node",
			"onnxruntime-common",
			"onnxruntime-web",
			"@huggingface/transformers",
			"sql.js",
			// Optional template engines from @vue/compiler-sfc's consolidate.js
			"velocityjs", "dustjs-linkedin", "atpl", "liquor", "twig", "ejs", "eco",
			"jazz", "jqtpl", "hamljs", "hamlet", "whiskers", "haml-coffee", "hogan.js",
			"templayed", "handlebars", "underscore", "lodash", "walrus", "mustache",
			"just", "ect", "mote", "toffee", "dot", "bracket-template", "ractive",
			"nunjucks", "htmling", "babel-core", "plates", "react-dom/server", "react",
			"arc-templates", "vash", "slm", "marko", "teacup/lib/express", "teacup",
			"coffee-script", "squirrelly", "twing",
		],

		// Minification (production only)
		minify: production,
		minifyWhitespace: production,
		minifyIdentifiers: false,
		minifySyntax: production,

		// Tree-shaking
		treeShaking: true,

		// Source maps (dev only)
		sourcemap: !production,

		// Logging
		logLevel: "info",

		// Environment
		define: {
			"process.env.NODE_ENV": production ? '"production"' : '"development"',
		},
	});

	if (watch) {
		await extensionCtx.watch();
		await serverCtx.watch();
		console.log("👀 Watching extension and server for changes...");
	} else {
		await extensionCtx.rebuild();
		await serverCtx.rebuild();
		await extensionCtx.dispose();
		await serverCtx.dispose();

		// Log bundle sizes
		const extensionStats = fs.statSync("./dist/extension.js");
		const serverStats = fs.statSync("./dist/server/index.js");
		console.log("✅ Bundled successfully");
		console.log("📦 Extension: dist/extension.js");
		console.log(`📊 Extension size: ${Math.round(extensionStats.size / 1024)}KB`);
		console.log("📦 Server: dist/server/index.js");
		console.log(`📊 Server size: ${Math.round(serverStats.size / 1024)}KB`);
		console.log(`📊 Total: ${Math.round((extensionStats.size + serverStats.size) / 1024)}KB`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
