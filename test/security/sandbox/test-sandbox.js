const { executeSandboxedScript } = require("./dist/extension");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

async function testSandbox() {
	try {
		console.log("Testing sandbox execution...");

		// Create a temporary directory
		const tempDir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "snapback-sandbox-test-")
		);
		console.log("Created temp directory:", tempDir);

		// Create a simple test config file
		const configPath = path.join(tempDir, "test-config.cjs");
		const configContent = `
      module.exports = {
        protection: [
          { pattern: '**/*.secret', level: 'block' }
        ],
        ignore: [
          'node_modules/**'
        ]
      };
    `;

		await fs.promises.writeFile(configPath, configContent);
		console.log("Created test config file:", configPath);

		// Test the sandbox execution
		console.log("Executing sandboxed script...");
		// Note: We're using a relative path from the dist directory
		const sandboxScriptPath = path.join(
			__dirname,
			"dist",
			"config",
			"sandboxScript.js"
		);
		console.log("Sandbox script path:", sandboxScriptPath);

		// Check if the sandbox script exists
		try {
			await fs.promises.access(sandboxScriptPath);
			console.log("Sandbox script exists");
		} catch (_err) {
			console.log("Sandbox script does not exist at:", sandboxScriptPath);
			// Try to find it
			const possiblePaths = [
				path.join(__dirname, "src", "config", "sandboxScript.js"),
				path.join(
					__dirname,
					"dist",
					"src",
					"config",
					"sandboxScript.js"
				),
				path.join(__dirname, "config", "sandboxScript.js"),
			];

			for (const possiblePath of possiblePaths) {
				try {
					await fs.promises.access(possiblePath);
					console.log("Found sandbox script at:", possiblePath);
					break;
				} catch (_err) {
					console.log("Not found at:", possiblePath);
				}
			}
		}
	} catch (error) {
		console.error("Error in testSandbox:", error);
	}
}

testSandbox();
