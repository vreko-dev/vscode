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

		// External dependencies - ONLY vscode API and native modules
		// Per VS Code best practices: bundle everything except vscode and native .node modules
		external: [
			"vscode",
			// Native modules that contain .node binaries - CANNOT be bundled
			"onnxruntime-node",
			"onnxruntime-common",
			"onnxruntime-web",
			"@huggingface/transformers", // Uses onnxruntime-node for local inference
			"@xenova/transformers", // Alternative name for Hugging Face Transformers.js
			"sharp", // Native .node binaries
			"sql.js", // Uses WASM
			"@sentry/node", // Error tracking - external for shared environment safety
			"@sentry/core",
			"@sentry/types",
			// Heavy third-party packages NOT needed for extension runtime
			"posthog-node", // Using local telemetry client
			"@typescript-eslint/*", // From SDK/contracts if pulled in
			"drizzle-orm", // Database ORM from platform - not needed locally
			"drizzle-orm/*",
			"@aws-sdk/*", // AWS S3 client - not needed for local extension
			// Static analysis tools - not needed at runtime
			"madge",
			"typescript",
			"dependency-tree",
			"precinct",
			"filing-cabinet",
			"requirejs",
			"gonzales-pe",
			"detective-*",
			"esprima",
			// Template engines (optional deps from consolidate.js)
			"velocityjs",
			"dustjs-linkedin",
			"atpl",
			"liquor",
			"twig",
			"ejs",
			"eco",
			"jazz",
			"jqtpl",
			"hamljs",
			"hamlet",
			"whiskers",
			"haml-coffee",
			"hogan.js",
			"templayed",
			"handlebars",
			"underscore",
			"lodash",
			"walrus",
			"mustache",
			"just",
			"ect",
			"mote",
			"toffee",
			"dot",
			"bracket-template",
			"ractive",
			"nunjucks",
			"htmling",
			"babel-core",
			"plates",
			"react-dom/server",
			"react",
			"arc-templates",
			"vash",
			"slm",
			"marko",
			"teacup/lib/express",
			"teacup",
			"coffee-script",
			"squirrelly",
			"twing",
			"@vue/compiler-sfc",
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
			// Externalize native modules that contain .node binaries
			{
				name: "native-module-externals",
				setup(build) {
					// Intercept @sentry/* packages (external for shared environment safety)
					build.onResolve({ filter: /^@sentry\// }, (args) => {
						return { path: args.path, external: true };
					});

					// Intercept @xenova/transformers (has sharp as dependency with native .node files)
					build.onResolve({ filter: /^@xenova\/transformers/ }, (args) => {
						return { path: args.path, external: true };
					});

					// Intercept sharp directly (native .node binaries)
					build.onResolve({ filter: /^sharp/ }, (args) => {
						return { path: args.path, external: true };
					});

					// Intercept better-sqlite3 (native module)
					build.onResolve({ filter: /^better-sqlite3/ }, (args) => {
						return { path: args.path, external: true };
					});

					// Intercept all .node files as a fallback safety net
					build.onResolve({ filter: /\.node$/ }, (args) => {
						console.warn(`[esbuild] Externalizing native module: ${args.path}`);
						return { path: args.path, external: true };
					});
				},
			},
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
							"var __filename = __filename || '';",
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
			"@xenova/transformers", // Has sharp dependency with native .node files
			"sharp", // Native .node binaries
			"better-sqlite3", // Native module
			"sql.js",
			// Optional template engines from @vue/compiler-sfc's consolidate.js
			"velocityjs",
			"dustjs-linkedin",
			"atpl",
			"liquor",
			"twig",
			"ejs",
			"eco",
			"jazz",
			"jqtpl",
			"hamljs",
			"hamlet",
			"whiskers",
			"haml-coffee",
			"hogan.js",
			"templayed",
			"handlebars",
			"underscore",
			"lodash",
			"walrus",
			"mustache",
			"just",
			"ect",
			"mote",
			"toffee",
			"dot",
			"bracket-template",
			"ractive",
			"nunjucks",
			"htmling",
			"babel-core",
			"plates",
			"react-dom/server",
			"react",
			"arc-templates",
			"vash",
			"slm",
			"marko",
			"teacup/lib/express",
			"teacup",
			"coffee-script",
			"squirrelly",
			"twing",
		],

		// Plugins - same native module handling as extension
		plugins: [
			{
				name: "server-workspace-externals",
				setup(build) {
					// Intercept @xenova/transformers (has sharp as dependency with native .node files)
					build.onResolve({ filter: /^@xenova\/transformers/ }, (args) => {
						return {
							path: args.path,
							external: true,
						};
					});

					// Intercept sharp directly (native .node binaries)
					build.onResolve({ filter: /^sharp/ }, (args) => {
						return {
							path: args.path,
							external: true,
						};
					});

					// Intercept better-sqlite3 (native module)
					build.onResolve({ filter: /^better-sqlite3/ }, (args) => {
						return {
							path: args.path,
							external: true,
						};
					});

					// Intercept all .node files as a fallback safety net
					build.onResolve({ filter: /\.node$/ }, (args) => {
						return {
							path: args.path,
							external: true,
						};
					});
				},
			},
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
