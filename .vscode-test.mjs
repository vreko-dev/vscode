import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
	// Test files pattern - all compiled test files in out/test directory
	files: "out/test/**/*.test.js",

	// VS Code version to use for testing (matches engine requirement)
	version: "1.99.0",

	// Workspace folder for testing
	workspaceFolder: "./test-fixtures",

	// Launch arguments for VS Code instance
	launchArgs: [
		"--disable-extensions", // Don't load other extensions
		"--disable-workspace-trust", // Skip workspace trust dialog
	],

	// Mocha test runner configuration
	mocha: {
		ui: "tdd", // Test-driven development style (suite/test)
		color: true, // Colored output
		timeout: 60000, // 60 second timeout for tests
	},
});
