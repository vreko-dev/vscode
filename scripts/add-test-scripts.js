const fs = require("node:fs");
const path = require("node:path");

// Read the package.json file
const packagePath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

// Add the test scripts
packageJson.scripts = {
	...packageJson.scripts,
	"test:unit": "mocha -r ts-node/register test/unit/**/*.spec.ts",
	"test:int": "mocha -r ts-node/register test/integration/**/*.spec.ts",
	"test:perf": "mocha -r ts-node/register test/{perf,stress}/**/*.spec.ts",
	"execute-runlist": "ts-node scripts/execute-runlist.ts",
};

// Write the updated package.json file
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

console.log("Test scripts added to package.json");
