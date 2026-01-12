#!/usr/bin/env node

/**
 * VS Code Extension Pre-Publish Validation
 *
 * Comprehensive validation before publishing to marketplace:
 * - Build verification
 * - Bundle size analysis
 * - Manifest validation
 * - Required files check
 * - Dependency audit
 * - Observability integration check
 *
 * Run: node scripts/pre-publish-validate.js
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

// ANSI colors
const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	bold: "\x1b[1m",
};

function log(message, color = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
	console.log(`\n${colors.bold}${colors.blue}${"=".repeat(60)}${colors.reset}`);
	console.log(`${colors.bold}${colors.blue}  ${message}${colors.reset}`);
	console.log(`${colors.bold}${colors.blue}${"=".repeat(60)}${colors.reset}\n`);
}

function pass(message) {
	console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function fail(message) {
	console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function warn(message) {
	console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

function info(message) {
	console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
}

// Configuration
const CONFIG = {
	// Bundle size limits (KB)
	maxExtensionSize: 3000, // 3MB - realistic for modern extension
	maxServerSize: 1500, // 1.5MB
	maxTotalSize: 5000, // 5MB total
	warnThreshold: 0.8, // Warn at 80% usage

	// Required files
	requiredFiles: [
		"package.json",
		"README.md",
		"CHANGELOG.md",
		"LICENSE",
		"dist/extension.js",
		"dist/server/index.js",
		"media/marketplace-icon-256.png",
	],

	// Required manifest fields
	requiredManifestFields: [
		"name",
		"publisher",
		"displayName",
		"description",
		"version",
		"engines",
		"main",
		"activationEvents",
		"contributes",
	],
};

class ValidationResult {
	constructor() {
		this.errors = [];
		this.warnings = [];
		this.passes = [];
	}

	addError(message) {
		this.errors.push(message);
		fail(message);
	}

	addWarning(message) {
		this.warnings.push(message);
		warn(message);
	}

	addPass(message) {
		this.passes.push(message);
		pass(message);
	}

	get isValid() {
		return this.errors.length === 0;
	}

	summary() {
		return {
			passed: this.passes.length,
			warnings: this.warnings.length,
			errors: this.errors.length,
			valid: this.isValid,
		};
	}
}

function formatBytes(bytes) {
	const kb = bytes / 1024;
	if (kb < 1024) {
		return `${kb.toFixed(1)} KB`;
	}
	return `${(kb / 1024).toFixed(2)} MB`;
}

function exec(command, options = {}) {
	try {
		return execSync(command, {
			encoding: "utf-8",
			stdio: options.silent ? "pipe" : "inherit",
			cwd: path.join(__dirname, ".."),
		});
	} catch (error) {
		if (options.throwOnError !== false) {
			throw error;
		}
		return "";
	}
}

// Validation Steps

function validateBuild(result) {
	header("1. Build Verification");

	// Check if dist exists
	const distPath = path.join(__dirname, "..", "dist");
	if (!fs.existsSync(distPath)) {
		result.addError("dist/ directory not found - run build first");
		return;
	}

	// Check extension bundle
	const extensionPath = path.join(distPath, "extension.js");
	if (fs.existsSync(extensionPath)) {
		const stats = fs.statSync(extensionPath);
		const sizeKB = stats.size / 1024;
		const usage = (sizeKB / CONFIG.maxExtensionSize) * 100;

		if (sizeKB > CONFIG.maxExtensionSize) {
			result.addError(`Extension bundle too large: ${formatBytes(stats.size)} (max: ${formatBytes(CONFIG.maxExtensionSize * 1024)})`);
		} else if (usage > CONFIG.warnThreshold * 100) {
			result.addWarning(`Extension bundle at ${usage.toFixed(1)}% capacity: ${formatBytes(stats.size)}`);
		} else {
			result.addPass(`Extension bundle: ${formatBytes(stats.size)} (${usage.toFixed(1)}% of limit)`);
		}
	} else {
		result.addError("Extension bundle not found: dist/extension.js");
	}

	// Check server bundle
	const serverPath = path.join(distPath, "server", "index.js");
	if (fs.existsSync(serverPath)) {
		const stats = fs.statSync(serverPath);
		const sizeKB = stats.size / 1024;
		const usage = (sizeKB / CONFIG.maxServerSize) * 100;

		if (sizeKB > CONFIG.maxServerSize) {
			result.addError(`Server bundle too large: ${formatBytes(stats.size)} (max: ${formatBytes(CONFIG.maxServerSize * 1024)})`);
		} else {
			result.addPass(`Server bundle: ${formatBytes(stats.size)} (${usage.toFixed(1)}% of limit)`);
		}
	} else {
		result.addWarning("Server bundle not found: dist/server/index.js");
	}

	// Check total size (only .js files in dist, excluding maps and analysis)
	let totalSize = 0;
	const walkDir = (dir) => {
		if (!fs.existsSync(dir)) return;
		const files = fs.readdirSync(dir);
		for (const file of files) {
			const filePath = path.join(dir, file);
			const stats = fs.statSync(filePath);
			if (stats.isDirectory()) {
				walkDir(filePath);
			} else if (file.endsWith(".js") && !file.endsWith(".map.js")) {
				// Only count .js files, not source maps or analysis HTML
				totalSize += stats.size;
			}
		}
	};
	walkDir(distPath);

	const totalKB = totalSize / 1024;
	if (totalKB > CONFIG.maxTotalSize) {
		result.addError(`Total bundle size too large: ${formatBytes(totalSize)} (max: ${formatBytes(CONFIG.maxTotalSize * 1024)})`);
	} else {
		result.addPass(`Total bundle size: ${formatBytes(totalSize)}`);
	}
}

function validateManifest(result) {
	header("2. Manifest Validation");

	const manifestPath = path.join(__dirname, "..", "package.json");

	let manifest;
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
	} catch (error) {
		result.addError(`Failed to parse package.json: ${error.message}`);
		return;
	}

	// Check required fields
	for (const field of CONFIG.requiredManifestFields) {
		if (manifest[field]) {
			result.addPass(`Field present: ${field}`);
		} else {
			result.addError(`Missing required field: ${field}`);
		}
	}

	// Check version format
	if (manifest.version) {
		const versionRegex = /^\d+\.\d+\.\d+$/;
		if (versionRegex.test(manifest.version)) {
			result.addPass(`Version format valid: ${manifest.version}`);
		} else {
			result.addWarning(`Version may not be semver: ${manifest.version}`);
		}
	}

	// Check VS Code engine
	if (manifest.engines?.vscode) {
		result.addPass(`VS Code engine: ${manifest.engines.vscode}`);
	} else {
		result.addError("Missing VS Code engine specification");
	}

	// Check commands have proper IDs
	if (manifest.contributes?.commands) {
		const commands = manifest.contributes.commands;
		const invalidCommands = commands.filter((c) => !c.command);
		if (invalidCommands.length > 0) {
			result.addError(`${invalidCommands.length} commands missing command ID`);
		} else {
			result.addPass(`All ${commands.length} commands have valid IDs`);
		}
	}

	// Check for icon
	if (manifest.icon) {
		const iconPath = path.join(__dirname, "..", manifest.icon);
		if (fs.existsSync(iconPath)) {
			result.addPass(`Icon exists: ${manifest.icon}`);
		} else {
			result.addError(`Icon file not found: ${manifest.icon}`);
		}
	} else {
		result.addWarning("No icon specified in manifest");
	}
}

function validateRequiredFiles(result) {
	header("3. Required Files Check");

	for (const file of CONFIG.requiredFiles) {
		const filePath = path.join(__dirname, "..", file);
		if (fs.existsSync(filePath)) {
			const stats = fs.statSync(filePath);
			if (stats.size === 0) {
				result.addWarning(`File is empty: ${file}`);
			} else {
				result.addPass(`File exists: ${file}`);
			}
		} else {
			// dist files are warnings since we may be validating before build
			if (file.startsWith("dist/")) {
				result.addWarning(`Build artifact not found: ${file}`);
			} else {
				result.addError(`Required file missing: ${file}`);
			}
		}
	}
}

function validateObservability(result) {
	header("4. Observability Integration");

	// Check Sentry integration exists
	const sentryPath = path.join(__dirname, "..", "src", "observability", "sentry.ts");
	if (fs.existsSync(sentryPath)) {
		result.addPass("Sentry integration file exists");

		// Check for key exports
		const content = fs.readFileSync(sentryPath, "utf-8");
		const requiredExports = ["initSentryExtension", "captureException", "closeSentry"];
		for (const exp of requiredExports) {
			if (content.includes(`export function ${exp}`) || content.includes(`export async function ${exp}`)) {
				result.addPass(`Sentry export found: ${exp}`);
			} else {
				result.addWarning(`Sentry export may be missing: ${exp}`);
			}
		}
	} else {
		result.addWarning("Sentry integration not found");
	}

	// Check health monitor exists
	const healthPath = path.join(__dirname, "..", "src", "observability", "ActivationHealthMonitor.ts");
	if (fs.existsSync(healthPath)) {
		result.addPass("Health monitor integration file exists");
	} else {
		result.addWarning("Health monitor not found");
	}
}

function validateDependencies(result) {
	header("5. Dependency Check");

	const manifestPath = path.join(__dirname, "..", "package.json");
	let manifest;
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
	} catch (error) {
		result.addError(`Failed to parse package.json: ${error.message}`);
		return;
	}

	// Check for problematic dependencies
	const problematicDeps = ["electron", "node-gyp", "better-sqlite3"];
	const allDeps = {
		...manifest.dependencies,
		...manifest.devDependencies,
	};

	for (const dep of problematicDeps) {
		if (allDeps[dep]) {
			result.addWarning(`Potentially problematic dependency: ${dep}`);
		}
	}

	// Check optional dependencies are marked correctly
	if (manifest.optionalDependencies) {
		const optDeps = Object.keys(manifest.optionalDependencies);
		if (optDeps.length > 0) {
			result.addPass(`Optional dependencies marked: ${optDeps.join(", ")}`);
		}
	}

	// Check for workspace dependencies
	const workspaceDeps = Object.entries(allDeps)
		.filter(([, version]) => version.startsWith("workspace:"))
		.map(([name]) => name);

	if (workspaceDeps.length > 0) {
		result.addPass(`Workspace dependencies: ${workspaceDeps.length} packages`);
	}
}

function validateTypeScript(result) {
	header("6. TypeScript Validation");

	try {
		info("Running type check (this may take a moment)...");
		exec("pnpm run type-check", { silent: true });
		result.addPass("TypeScript compilation successful");
	} catch (error) {
		result.addError("TypeScript compilation failed - run 'pnpm run type-check' for details");
	}
}

// Main execution
async function main() {
	console.log(`\n${colors.bold}${colors.cyan}🚀 SnapBack VS Code Extension Pre-Publish Validation${colors.reset}\n`);
	console.log(`Running at: ${new Date().toISOString()}`);

	const result = new ValidationResult();

	// Run all validations
	validateBuild(result);
	validateManifest(result);
	validateRequiredFiles(result);
	validateObservability(result);
	validateDependencies(result);

	// Optional: TypeScript check (slow)
	const args = process.argv.slice(2);
	if (args.includes("--full") || args.includes("-f")) {
		validateTypeScript(result);
	} else {
		info("Skipping TypeScript check (use --full to include)");
	}

	// Summary
	header("Validation Summary");

	const summary = result.summary();
	console.log(`  Passed:   ${colors.green}${summary.passed}${colors.reset}`);
	console.log(`  Warnings: ${colors.yellow}${summary.warnings}${colors.reset}`);
	console.log(`  Errors:   ${colors.red}${summary.errors}${colors.reset}`);

	if (summary.valid) {
		console.log(`\n${colors.bold}${colors.green}✅ VALIDATION PASSED - Ready for publish!${colors.reset}\n`);
		console.log("Next steps:");
		console.log("  1. Run: pnpm run package-vsix");
		console.log("  2. Test VSIX locally: code --install-extension snapback-vscode-*.vsix");
		console.log("  3. Publish: pnpm run deploy");
		process.exit(0);
	} else {
		console.log(`\n${colors.bold}${colors.red}❌ VALIDATION FAILED - Fix errors before publishing${colors.reset}\n`);
		console.log("Errors to fix:");
		for (const error of result.errors) {
			console.log(`  • ${error}`);
		}
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
	process.exit(1);
});
