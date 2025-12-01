// Test to see how memory bomb detection works
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

// Create a test config that tries to allocate a large array
const testConfig = `
// Try to allocate a large array to exceed memory limit
const largeArray = new Array(1e8).fill('x');
module.exports = {
  protection: [],
  ignore: []
};
`;

// Write test config to a temporary file
const testConfigPath = path.join(__dirname, "memory-bomb-test.cjs");
fs.writeFileSync(testConfigPath, testConfig);

console.log("Test config written to:", testConfigPath);

// Try to run the sandbox script with the security flags
const sandboxScriptPath = path.join(
	__dirname,
	"src",
	"config",
	"sandboxScript.js"
);

const child = spawn(
	process.execPath,
	[
		"--no-warnings",
		"--max-old-space-size=32",
		"--disallow-code-generation-from-strings",
		"--frozen-intrinsics",
		sandboxScriptPath,
		testConfigPath,
	],
	{
		stdio: ["pipe", "pipe", "pipe", "ipc"],
	}
);

child.on("message", (message) => {
	console.log("Received message from child:", message);

	// Clean up and exit
	fs.unlinkSync(testConfigPath);
	process.exit(0);
});

child.stdout.on("data", (data) => {
	console.log("Child stdout:", data.toString());
});

child.stderr.on("data", (data) => {
	console.error("Child stderr:", data.toString());
});

child.on("error", (error) => {
	console.error("Child process error:", error);
});

child.on("exit", (code, signal) => {
	console.log("Child process exited with code:", code, "signal:", signal);

	// Clean up
	try {
		fs.unlinkSync(testConfigPath);
	} catch (_err) {
		// Ignore
	}
});
