import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		const extensionDevelopmentPath = path.resolve(__dirname, "../../");

		// The path to the test suite
		const extensionTestsPath = path.resolve(
			__dirname,
			"../../out/test/suite/index",
		);

		// Download VS Code, unzip it and run the integration test
		await runTests({
			version: "1.99.0", // Match your engine requirement
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [
				// Create a clean workspace for testing
				path.resolve(__dirname, "../../test-fixtures"),
				"--disable-extensions", // Disable other extensions for clean testing
				"--disable-workspace-trust",
				"--disable-telemetry",
				"--disable-updates",
				"--disable-crash-reporter",
				"--disable-gpu",
			],
		});
	} catch (_err) {
		console.error("Failed to run tests");
		process.exit(1);
	}
}

main();
