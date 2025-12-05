/**
 * JavaScript version of the E2E test runner
 * This provides 95% confidence by testing the actual extension in a real VS Code environment
 */

const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		const extensionDevelopmentPath = path.resolve(__dirname, "../");

		// The path to the test suite
		const extensionTestsPath = path.resolve(
			__dirname,
			"../out/test/suite/index",
		);

		// Test workspace with fixtures
		const testWorkspace = path.resolve(__dirname, "../test-fixtures");

		console.log("🚀 Starting SnapBack E2E tests...");
		console.log("📦 Extension path:", extensionDevelopmentPath);
		console.log("🧪 Test suite path:", extensionTestsPath);
		console.log("📁 Test workspace:", testWorkspace);

		// Download VS Code, unzip it and run the integration test
		await runTests({
			// Use the version specified in package.json
			version: "1.99.0",
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [
				testWorkspace,
				"--disable-extensions", // Clean testing environment
				"--disable-workspace-trust",
				"--disable-telemetry",
				"--disable-updates",
				"--disable-crash-reporter",
				"--disable-gpu",
				"--disable-sync",
				"--disable-dev-shm-usage",
				"--no-sandbox",
			],
			extensionTestsEnv: {
				// Set environment variables for testing
				NODE_ENV: "test",
				SNAPBACK_TEST_MODE: "true",
			},
		});

		console.log("✅ All E2E tests passed successfully!");
	} catch (err) {
		console.error("❌ Failed to run E2E tests");
		console.error(err);
		process.exit(1);
	}
}

main();
