import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
	// Test files pattern - all compiled test files in out/test directory
	files: "out/test/**/*.test.js",

	// VS Code version to use for testing (matches engine requirement)
	version: "1.99.0",

	// Use the packaged VSIX extension instead of the source
	extensionDevelopmentPath: undefined,
	extensionTestsPath: undefined,

	// Point to the built VSIX package
	// Note: This assumes the VSIX has been built via `pnpm run package`
	useInstallation: {
		fromPath: "./snapback-vscode-1.2.9.vsix",
	},

	// Workspace folder for testing
	workspaceFolder: "./test-fixtures",

	// Launch arguments for VS Code instance
	launchArgs: [
		"--disable-workspace-trust", // Skip workspace trust dialog
		// Note: Not disabling extensions since we're testing the packaged extension
	],

	// Mocha test runner configuration
	mocha: {
		ui: "tdd", // Test-driven development style (suite/test)
		color: true, // Colored output
		timeout: 60000, // 60 second timeout for tests
	},
});
