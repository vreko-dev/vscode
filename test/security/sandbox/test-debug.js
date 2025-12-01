const path = require("node:path");

// Simple test to check if modules can be imported
async function test() {
	try {
		console.log("Testing module imports...");

		// Test importing the config modules
		const {
			executeSandboxedScript,
		} = require("./out/config/sandboxExecutor");
		console.log("Successfully imported sandboxExecutor");

		// Create a simple test file
		const fs = require("node:fs");
		const os = require("node:os");

		const tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "snapback-debug-")
		);
		const configPath = path.join(tempDir, "test.cjs");
		const testContent = `
      module.exports = {
        protection: [],
        ignore: []
      };
    `;

		await fs.promises.writeFile(configPath, testContent);

		console.log("Executing sandboxed script...");
		const result = await executeSandboxedScript(configPath);
		console.log("Result:", result);
	} catch (error) {
		console.error("Error:", error);
	}
}

test();
