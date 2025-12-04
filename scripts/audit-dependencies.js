#!/usr/bin/env node

/**
 * Audit dependencies for potential bundling issues in VS Code extensions
 *
 * Checks for:
 * - Native modules that can't be bundled
 * - Dynamic requires that esbuild can't resolve
 * - Worker thread dependencies
 * - Platform-specific dependencies
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const PROBLEMATIC_PATTERNS = {
	native_modules: [
		"better-sqlite3",
		"fsevents",
		"@parcel/watcher",
		"node-gyp",
		"esbuild",
		"@swc/core",
	],
	worker_threads: [
		"pino-pretty", // Uses worker threads for transports
		"thread-stream",
		"piscina",
		"worker-farm",
	],
	dynamic_requires: ["resolve-from", "import-from", "caller-path"],
	platform_specific: [
		"chokidar", // OK to bundle, but check for fsevents
		"keytar", // Secure credential storage
	],
};

console.log("🔍 Auditing VS Code extension dependencies...\n");

// Get all production dependencies
const pkg = require("../package.json");
const allDeps = { ...pkg.dependencies };

// Get workspace dependencies
const workspaceDeps = Object.keys(allDeps).filter((dep) =>
	dep.startsWith("@snapback/"),
);

console.log("📦 Workspace packages:", workspaceDeps.length);
workspaceDeps.forEach((dep) => {
	const depPath = path.join(
		__dirname,
		"../../../packages",
		dep.replace("@snapback/", ""),
		"package.json",
	);
	if (fs.existsSync(depPath)) {
		const depPkg = JSON.parse(fs.readFileSync(depPath, "utf8"));
		if (depPkg.dependencies) {
			Object.assign(allDeps, depPkg.dependencies);
		}
	}
});

console.log(
	"📊 Total dependencies (including transitive):",
	Object.keys(allDeps).length,
);
console.log("");

// Check for problematic dependencies
const findings = {
	native: [],
	workers: [],
	dynamic: [],
	platform: [],
	ok: [],
};

for (const [category, patterns] of Object.entries(PROBLEMATIC_PATTERNS)) {
	for (const pattern of patterns) {
		if (
			allDeps[pattern] ||
			Object.keys(allDeps).some((dep) => dep.includes(pattern))
		) {
			const key =
				category === "native_modules"
					? "native"
					: category === "worker_threads"
						? "workers"
						: category === "dynamic_requires"
							? "dynamic"
							: "platform";
			findings[key].push(pattern);
		}
	}
}

// Report findings
console.log("⚠️  PROBLEMATIC DEPENDENCIES:\n");

if (findings.native.length > 0) {
	console.log("🔴 Native modules (must be external):");
	findings.native.forEach((dep) => console.log(`  - ${dep}`));
	console.log("");
}

if (findings.workers.length > 0) {
	console.log("🟡 Worker thread dependencies (need stub or external):");
	findings.workers.forEach((dep) => console.log(`  - ${dep}`));
	console.log("");
}

if (findings.dynamic.length > 0) {
	console.log("🟠 Dynamic require dependencies (may fail bundling):");
	findings.dynamic.forEach((dep) => console.log(`  - ${dep}`));
	console.log("");
}

if (findings.platform.length > 0) {
	console.log("ℹ️  Platform-specific dependencies (check carefully):");
	findings.platform.forEach((dep) => console.log(`  - ${dep}`));
	console.log("");
}

// Check esbuild config
console.log("📝 Checking esbuild.config.cjs...\n");

const esbuildConfig = fs.readFileSync(
	path.join(__dirname, "../esbuild.config.cjs"),
	"utf8",
);

const externalDeps = [...findings.native, ...findings.workers];
const missingExternal = externalDeps.filter((dep) => {
	return !esbuildConfig.includes(dep) && !esbuildConfig.includes(`${dep}-stub`);
});

if (missingExternal.length > 0) {
	console.log("❌ Dependencies that should be external or stubbed but aren't:");
	missingExternal.forEach((dep) => console.log(`  - ${dep}`));
	console.log("");
	process.exit(1);
} else {
	console.log(
		"✅ All problematic dependencies are properly handled in esbuild.config.cjs",
	);
}

console.log("\n✨ Dependency audit complete!");
