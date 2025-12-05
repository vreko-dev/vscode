#!/usr/bin/env node

/**
 * SnapBack Test Battery Runlist Executor
 * Version: 1.1
 * Agent: QODER
 */

const fs = require("node:fs");
const path = require("node:path");

console.log("Executing SnapBack Test Battery Runlist v1.1");
console.log("Agent: QODER");
console.log("");

// Check if required directories exist
const requiredDirs = [
	"test/setup",
	"test/fixtures",
	"test/unit",
	"test/integration",
	"test/perf",
	"test/stress",
	"test/env",
	"test/utils",
];

console.log("Verifying test directory structure...");
for (const dir of requiredDirs) {
	const fullPath = path.join(process.cwd(), dir);
	if (!fs.existsSync(fullPath)) {
		console.log(`❌ Missing directory: ${dir}`);
		process.exit(1);
	}
	console.log(`✅ Found: ${dir}`);
}

console.log("");
console.log("Test directory structure verified successfully.");
console.log("");

// Check if required files exist
const requiredFiles = [
	"test/setup/globals.ts",
	"test/utils/expect.ts",
	"test/unit/git-parsing.spec.ts",
	"test/unit/path-ops.spec.ts",
	"test/unit/config-validation.spec.ts",
	"test/unit/auth.spec.ts",
	"test/unit/serialization.spec.ts",
	"test/unit/utils.spec.ts",
	"test/unit/file-watcher-logic.spec.ts",
	"test/unit/errors.spec.ts",
	"test/unit/snapshot-algo.spec.ts",
	"test/unit/transactions.spec.ts",
	"test/integration/commands.spec.ts",
];

console.log("Verifying required test files...");
let allFilesExist = true;
for (const file of requiredFiles) {
	const fullPath = path.join(process.cwd(), file);
	if (!fs.existsSync(fullPath)) {
		console.log(`❌ Missing file: ${file}`);
		allFilesExist = false;
	} else {
		console.log(`✅ Found: ${file}`);
	}
}

if (!allFilesExist) {
	console.log("");
	console.log(
		"❌ Some required files are missing. Please run the setup first.",
	);
	process.exit(1);
}

console.log("");
console.log("✅ All required test files are present.");
console.log("");

// Check if package.json has the required scripts
const packageJsonPath = path.join(process.cwd(), "package.json");
if (fs.existsSync(packageJsonPath)) {
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
	const requiredScripts = ["test:unit", "test:int", "test:perf"];

	console.log("Verifying package.json test scripts...");
	let allScriptsExist = true;
	for (const script of requiredScripts) {
		if (!packageJson.scripts || !packageJson.scripts[script]) {
			console.log(`❌ Missing script: ${script}`);
			allScriptsExist = false;
		} else {
			console.log(`✅ Found script: ${script}`);
		}
	}

	if (!allScriptsExist) {
		console.log("");
		console.log("❌ Some required scripts are missing from package.json.");
		process.exit(1);
	}

	console.log("");
	console.log("✅ All required test scripts are present in package.json.");
} else {
	console.log("❌ package.json not found.");
	process.exit(1);
}

console.log("");
console.log("🎉 Runlist execution environment is ready!");
console.log("");
console.log("You can now run the tests using:");
console.log("  npm run test:unit    # Run unit tests");
console.log("  npm run test:int     # Run integration tests");
console.log("  npm run test:perf    # Run performance tests");
console.log("");

// Create a simple test execution plan
console.log("📋 Test Execution Plan:");
console.log("  S0: Test Harness & Fixtures (setup)");
console.log("  S1: Unit — Git Parsing + Path Ops");
console.log("  S2: Unit — Configuration Validation");
console.log("  S3: Unit — Auth + Serialization");
console.log("  S4: Unit — Utilities + File Watcher Logic");
console.log("  S5: Unit — Error Handling + Snapshot Algorithm");
console.log("  S6: Unit — Transactions");
console.log("  S7: Integration — Commands");
console.log("  ... (more packs to be implemented)");
console.log("");

console.log("🚀 Ready to execute test packs!");
