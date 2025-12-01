const path = require("node:path");
const fs = require("node:fs");

// Create a simple test config
const testConfig = `
module.exports = {
  protection: [
    { pattern: '**/*.secret', level: 'block' }
  ],
  ignore: [
    'node_modules/**'
  ]
};
`;

// Write test config to a temporary file
const testConfigPath = path.join(__dirname, "test-config.cjs");
fs.writeFileSync(testConfigPath, testConfig);

console.log("Test config written to:", testConfigPath);

// Test the sandbox executor directly
async function testSandboxExecutor() {
	try {
		// Import the sandbox executor
		const {
			executeSandboxedScript,
		} = require("./src/config/sandboxExecutor");

		console.log("Executing sandboxed script...");
		const result = await executeSandboxedScript(testConfigPath);
		console.log(
			"Sandbox execution result:",
			JSON.stringify(result, null, 2)
		);

		// Test with a config that should fail
		const badConfig = `
      module.exports = {
        protection: [],
        ignore: [],
        // Function should be rejected
        testFunction: function() { return 'test'; }
      };
    `;

		const badConfigPath = path.join(__dirname, "bad-config.cjs");
		fs.writeFileSync(badConfigPath, badConfig);

		console.log("\\nTesting with bad config (function)...");
		try {
			await executeSandboxedScript(badConfigPath);
			console.log("ERROR: Should have failed but did not");
		} catch (error) {
			console.log("Correctly caught error:", error.message);
		}

		// Clean up
		fs.unlinkSync(badConfigPath);
	} catch (error) {
		console.error("Sandbox execution error:", error);
	} finally {
		// Clean up
		try {
			fs.unlinkSync(testConfigPath);
		} catch (_err) {
			// Ignore
		}
	}
}

testSandboxExecutor();
