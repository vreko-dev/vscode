#!/usr/bin/env node

/**
 * Performance Budget Enforcer
 * Enforces performance budgets and alerts when limits are exceeded
 */

const fs = require("node:fs");
const path = require("node:path");

// Configuration
const PERFORMANCE_BUDGETS = {
	vsixSizeMB: 2.0,
	bundleSizeMB: 1.0,
	loadTimeMs: 500,
	activationTimeMs: 300,
};

const METRICS_DIR = path.join(__dirname, "../metrics");
const LOAD_TIME_METRICS_FILE = path.join(METRICS_DIR, "load-times.json");
const BUNDLE_PATH = path.join(__dirname, "../dist/extension.js");
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

function checkVSIXBudget() {
	const latestVSIX = findLatestVSIX();

	if (!latestVSIX) {
		return {
			name: "VSIX Size",
			value: 0,
			limit: PERFORMANCE_BUDGETS.vsixSizeMB * 1024 * 1024,
			unit: "bytes",
			passed: false,
			error: "No VSIX file found",
		};
	}

	const sizeBytes = latestVSIX.stats.size;
	const limitBytes = PERFORMANCE_BUDGETS.vsixSizeMB * 1024 * 1024;

	return {
		name: "VSIX Size",
		value: sizeBytes,
		limit: limitBytes,
		unit: "bytes",
		passed: sizeBytes <= limitBytes,
		formattedValue: formatBytes(sizeBytes),
		formattedLimit: formatBytes(limitBytes),
		percentage: ((sizeBytes / limitBytes) * 100).toFixed(1),
	};
}

function checkBundleBudget() {
	if (!fs.existsSync(BUNDLE_PATH)) {
		return {
			name: "Bundle Size",
			value: 0,
			limit: PERFORMANCE_BUDGETS.bundleSizeMB * 1024 * 1024,
			unit: "bytes",
			passed: false,
			error: "Bundle not found",
		};
	}

	const stats = fs.statSync(BUNDLE_PATH);
	const sizeBytes = stats.size;
	const limitBytes = PERFORMANCE_BUDGETS.bundleSizeMB * 1024 * 1024;

	return {
		name: "Bundle Size",
		value: sizeBytes,
		limit: limitBytes,
		unit: "bytes",
		passed: sizeBytes <= limitBytes,
		formattedValue: formatBytes(sizeBytes),
		formattedLimit: formatBytes(limitBytes),
		percentage: ((sizeBytes / limitBytes) * 100).toFixed(1),
	};
}

function checkLoadTimeBudget() {
	if (!fs.existsSync(LOAD_TIME_METRICS_FILE)) {
		return {
			name: "Load Time",
			value: 0,
			limit: PERFORMANCE_BUDGETS.loadTimeMs,
			unit: "ms",
			passed: false,
			error: "No load time metrics found",
		};
	}

	const metricsData = fs.readFileSync(LOAD_TIME_METRICS_FILE, "utf8");
	const metrics = JSON.parse(metricsData);

	if (metrics.length === 0) {
		return {
			name: "Load Time",
			value: 0,
			limit: PERFORMANCE_BUDGETS.loadTimeMs,
			unit: "ms",
			passed: false,
			error: "No load time metrics available",
		};
	}

	// Get the latest metric
	const latestMetric = metrics[metrics.length - 1];
	const loadTimeMs = latestMetric.loadTimeMs;

	return {
		name: "Load Time",
		value: loadTimeMs,
		limit: PERFORMANCE_BUDGETS.loadTimeMs,
		unit: "ms",
		passed: loadTimeMs <= PERFORMANCE_BUDGETS.loadTimeMs,
		percentage: ((loadTimeMs / PERFORMANCE_BUDGETS.loadTimeMs) * 100).toFixed(
			1,
		),
	};
}

function displayBudgetResult(result) {
	if (result.error) {
		console.log(
			`${colors.red}✗ ${result.name}: ${result.error}${colors.reset}`,
		);
		return;
	}

	const statusColor = result.passed ? colors.green : colors.red;
	const statusSymbol = result.passed ? "✓" : "✗";

	console.log(`${statusColor}${statusSymbol} ${result.name}:${colors.reset}`);

	if (result.formattedValue) {
		console.log(`  Value: ${result.formattedValue}`);
		console.log(`  Limit: ${result.formattedLimit}`);
	} else {
		console.log(`  Value: ${result.value}${result.unit}`);
		console.log(`  Limit: ${result.limit}${result.unit}`);
	}

	console.log(`  Usage: ${result.percentage}%`);

	if (!result.passed) {
		const overage = result.value - result.limit;
		if (result.unit === "bytes") {
			console.log(
				`  ${colors.red}Overage: ${formatBytes(overage)}${colors.reset}`,
			);
		} else {
			console.log(
				`  ${colors.red}Overage: ${overage}${result.unit}${colors.reset}`,
			);
		}
	}
}

function enforcePerformanceBudgets() {
	console.log(`${colors.cyan}Performance Budget Enforcement${colors.reset}`);
	console.log("=".repeat(50));

	const budgets = [
		checkVSIXBudget(),
		checkBundleBudget(),
		checkLoadTimeBudget(),
	];

	let allPassed = true;

	for (const budget of budgets) {
		displayBudgetResult(budget);
		if (!budget.passed) {
			allPassed = false;
		}
		console.log("");
	}

	if (allPassed) {
		console.log(`${colors.green}✓ ALL BUDGETS PASSED${colors.reset}`);
		process.exit(0);
	} else {
		console.log(`${colors.red}✗ SOME BUDGETS EXCEEDED${colors.reset}`);
		console.log(
			`${colors.yellow}Action required to meet performance targets${colors.reset}`,
		);
		process.exit(1);
	}
}

// Run the enforcement
if (require.main === module) {
	enforcePerformanceBudgets();
}

module.exports = {
	enforcePerformanceBudgets,
	checkVSIXBudget,
	checkBundleBudget,
	checkLoadTimeBudget,
};
