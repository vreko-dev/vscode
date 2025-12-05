#!/usr/bin/env node

/**
 * Bundle Size Checker
 * Verifies that the extension bundle does not exceed size limits
 */

const fs = require("node:fs");
const path = require("node:path");

// Configuration
const MAX_SIZE_MB = 1.0;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const BUNDLE_PATH = path.join(__dirname, "../dist/extension.js");

// ANSI color codes for cross-platform output
const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
};

function formatBytes(bytes) {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function checkBundleSize() {
	console.log(`\n${colors.cyan}Bundle Size Check${colors.reset}`);
	console.log("=".repeat(50));

	// Check if bundle exists
	if (!fs.existsSync(BUNDLE_PATH)) {
		console.error(
			`${colors.red}ERROR: Bundle not found at ${BUNDLE_PATH}${colors.reset}`,
		);
		console.error(
			`${colors.yellow}Run 'pnpm run compile' or 'pnpm run package' first${colors.reset}`,
		);
		process.exit(1);
	}

	// Get file stats
	const stats = fs.statSync(BUNDLE_PATH);
	const sizeBytes = stats.size;
	const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
	const percentUsed = ((sizeBytes / MAX_SIZE_BYTES) * 100).toFixed(1);

	// Display results
	console.log(
		`File: ${colors.cyan}${path.basename(BUNDLE_PATH)}${colors.reset}`,
	);
	console.log(`Size: ${formatBytes(sizeBytes)} (${sizeMB} MB)`);
	console.log(`Limit: ${formatBytes(MAX_SIZE_BYTES)} (${MAX_SIZE_MB} MB)`);
	console.log(`Usage: ${percentUsed}%`);

	// Determine status
	const withinLimit = sizeBytes <= MAX_SIZE_BYTES;

	if (withinLimit) {
		const remaining = MAX_SIZE_BYTES - sizeBytes;
		console.log(
			`\n${colors.green}✓ PASS${colors.reset} - Bundle size is within limits`,
		);
		console.log(
			`Remaining budget: ${formatBytes(remaining)} (${(
				(remaining / MAX_SIZE_BYTES) * 100
			).toFixed(1)}%)`,
		);

		// Warning if approaching limit (>80%)
		if (percentUsed > 80) {
			console.log(
				`\n${colors.yellow}WARNING: Bundle is using ${percentUsed}% of the limit${colors.reset}`,
			);
			console.log(
				`${colors.yellow}Consider optimizing to maintain headroom${colors.reset}`,
			);
		}

		console.log("=".repeat(50));
		process.exit(0);
	} else {
		const overage = sizeBytes - MAX_SIZE_BYTES;
		console.log(
			`\n${colors.red}✗ FAIL${colors.reset} - Bundle size exceeds limit`,
		);
		console.log(
			`${colors.red}Overage: ${formatBytes(overage)} (${(
				(overage / MAX_SIZE_BYTES) * 100
			).toFixed(1)}%)${colors.reset}`,
		);

		console.log(`\n${colors.yellow}Optimization suggestions:${colors.reset}`);
		console.log("  • Remove unused dependencies");
		console.log("  • Enable tree-shaking in esbuild config");
		console.log("  • Use dynamic imports for large modules");
		console.log("  • Minify and compress code");
		console.log("  • Check for duplicate dependencies");

		console.log("=".repeat(50));
		process.exit(1);
	}
}

// Run the check
try {
	checkBundleSize();
} catch (error) {
	console.error(`${colors.red}ERROR: ${error.message}${colors.reset}`);
	process.exit(1);
}
