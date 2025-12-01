#!/usr/bin/env node

/**
 * Script to test if the timeline API is properly configured
 * This script checks if the timeline API proposal is enabled and accessible
 */

const fs = require("node:fs");
const path = require("node:path");

// Check if we're in the correct directory
const packageJsonPath = path.join(__dirname, "..", "package.json");

if (!fs.existsSync(packageJsonPath)) {
	console.error(
		"Error: This script must be run from the VS Code extension root directory"
	);
	process.exit(1);
}

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

// Check if timeline API proposal is enabled
const enabledApiProposals = packageJson.enabledApiProposals || [];
const timelineEnabled = enabledApiProposals.includes("timeline");

console.log("Timeline API Test Results:");
console.log("========================");

console.log(
	`Timeline API Proposal Enabled: ${timelineEnabled ? "✅ Yes" : "❌ No"}`
);

if (timelineEnabled) {
	console.log("\n✅ Timeline API is properly configured in package.json");
	console.log(
		"   The extension should be able to register timeline providers"
	);
} else {
	console.log("\n❌ Timeline API is not enabled");
	console.log(
		'   Add "timeline" to the enabledApiProposals array in package.json'
	);
}

// Check if proposed API types are downloaded
const proposedApiPath = path.join(
	__dirname,
	"..",
	"vscode.proposed.timeline.d.ts"
);
const typesDownloaded = fs.existsSync(proposedApiPath);

console.log(
	`\nProposed API Types Downloaded: ${typesDownloaded ? "✅ Yes" : "❌ No"}`
);

if (typesDownloaded) {
	console.log(
		"\n✅ Timeline API types are available for TypeScript compilation"
	);
} else {
	console.log("\n❌ Timeline API types are missing");
	console.log(
		'   Run "npx @vscode/dts dev" to download the proposed API types'
	);
}

// Summary
console.log("\nSummary:");
console.log("========");
if (timelineEnabled && typesDownloaded) {
	console.log("✅ Timeline API is fully configured and ready to use");
	console.log("   You can now test the extension with timeline integration");
} else {
	console.log("❌ Timeline API is not fully configured");
	console.log("   Please follow the setup instructions above");
}

process.exit(0);
