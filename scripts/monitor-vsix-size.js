#!/usr/bin/env node

/**
 * VSIX Size Monitor
 * Monitors the size of the VSIX file and alerts when it exceeds limits
 */

const fs = require("node:fs");
const path = require("node:path");

// Configuration
const MAX_VSIX_SIZE_MB = 2.0;
const MAX_VSIX_SIZE_BYTES = MAX_VSIX_SIZE_MB * 1024 * 1024;
const VSIX_PATTERN = /^snapback-vscode-.*\.vsix$/;

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

function findLatestVSIX() {
	const extensionRoot = path.join(__dirname, "..");

	// Find all VSIX files
	const files = fs.readdirSync(extensionRoot);
	const vsixFiles = files.filter((file) => VSIX_PATTERN.test(file));

	if (vsixFiles.length === 0) {
		return null;
	}

	// Sort by modification time to get the latest
	const latestVSIX = vsixFiles
		.map((file) => ({
			name: file,
			path: path.join(extensionRoot, file),
			stats: fs.statSync(path.join(extensionRoot, file)),
		}))
		.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())[0];

	return latestVSIX;
}

function checkVSIXSize() {
	console.log(`\n${colors.cyan}VSIX Size Check${colors.reset}`);
	console.log("=".repeat(50));

	const latestVSIX = findLatestVSIX();

	if (!latestVSIX) {
		console.error(`${colors.red}ERROR: No VSIX files found${colors.reset}`);
		console.error(
			`${colors.yellow}Run 'pnpm run package-vsix' first${colors.reset}`,
		);
		process.exit(1);
	}

	// Get file stats
	const sizeBytes = latestVSIX.stats.size;
	const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
	const percentUsed = ((sizeBytes / MAX_VSIX_SIZE_BYTES) * 100).toFixed(1);

	// Display results
	console.log(`File: ${colors.cyan}${latestVSIX.name}${colors.reset}`);
	console.log(`Size: ${formatBytes(sizeBytes)} (${sizeMB} MB)`);
	console.log(
		`Limit: ${formatBytes(MAX_VSIX_SIZE_BYTES)} (${MAX_VSIX_SIZE_MB} MB)`,
	);
	console.log(`Usage: ${percentUsed}%`);

	// Determine status
	const withinLimit = sizeBytes <= MAX_VSIX_SIZE_BYTES;

	if (withinLimit) {
		const remaining = MAX_VSIX_SIZE_BYTES - sizeBytes;
		console.log(
			`\n${colors.green}✓ PASS${colors.reset} - VSIX size is within limits`,
		);
		console.log(
			`Remaining budget: ${formatBytes(remaining)} (${(
				(remaining / MAX_VSIX_SIZE_BYTES) * 100
			).toFixed(1)}%)`,
		);

		// Warning if approaching limit (>80%)
		if (percentUsed > 80) {
			console.log(
				`\n${colors.yellow}WARNING: VSIX is using ${percentUsed}% of the limit${colors.reset}`,
			);
			console.log(
				`${colors.yellow}Consider optimizing to maintain headroom${colors.reset}`,
			);
		}

		console.log("=".repeat(50));
		process.exit(0);
	} else {
		const overage = sizeBytes - MAX_VSIX_SIZE_BYTES;
		console.log(
			`\n${colors.red}✗ FAIL${colors.reset} - VSIX size exceeds limit`,
		);
		console.log(
			`${colors.red}Overage: ${formatBytes(overage)} (${(
				(overage / MAX_VSIX_SIZE_BYTES) * 100
			).toFixed(1)}%)${colors.reset}`,
		);

		console.log(`\n${colors.yellow}Optimization suggestions:${colors.reset}`);
		console.log("  • Remove unused dependencies");
		console.log("  • Use dynamic imports for large modules");
		console.log("  • Optimize media assets");
		console.log("  • Check for duplicate dependencies");
		console.log("  • Consider code splitting");

		console.log("=".repeat(50));
		process.exit(1);
	}
}

// Run the check
try {
	checkVSIXSize();
} catch (error) {
	console.error(`${colors.red}ERROR: ${error.message}${colors.reset}`);
	process.exit(1);
}
