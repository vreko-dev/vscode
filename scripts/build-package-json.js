#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

// Read the existing package.json which is already consolidated
const packagePath = path.join(__dirname, "../package.json");
const packageData = JSON.parse(fs.readFileSync(packagePath, "utf8"));

// Update the scripts section to remove the build:package script
// since we're no longer using the package-contributes directory
packageData.scripts["vscode:prepublish"] = "pnpm run package";

// Write the updated package.json
fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

console.log(
	"✅ package.json updated successfully - no longer uses package-contributes directory",
);
