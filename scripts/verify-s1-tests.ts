#!/usr/bin/env tsx

/**
 * Script to verify S1 pack tests execution time
 *
 * This script runs the S1 pack tests (Git parsing and Path operations)
 * and verifies they complete within the 2-second requirement.
 */

import { spawn } from "node:child_process";

console.log("🔍 Verifying S1 Pack Tests Execution Time...");
console.log("=============================================\n");

const startTime = Date.now();

const vitest = spawn(
	"npx",
	[
		"vitest",
		"run",
		"test/unit/git.unit.test.ts",
		"test/unit/path.unit.test.ts",
		"--reporter=verbose",
	],
	{
		cwd: "/Users/user1/WebstormProjects/snapback-site/apps/vscode",
		stdio: "pipe",
	},
);

let _output = "";

vitest.stdout.on("data", (data) => {
	_output += data.toString();
	process.stdout.write(data);
});

vitest.stderr.on("data", (data) => {
	_output += data.toString();
	process.stderr.write(data);
});

vitest.on("close", (code) => {
	const endTime = Date.now();
	const duration = endTime - startTime;

	console.log("\n=============================================");
	console.log(`⏱️  Test Execution Time: ${duration}ms`);
	console.log(`🎯 Requirement: < 2000ms`);

	if (duration < 2000) {
		console.log("✅ S1 Pack Tests PASSED time requirement!");
		console.log(`   Time saved: ${2000 - duration}ms`);
	} else {
		console.log("❌ S1 Pack Tests FAILED time requirement!");
		console.log(`   Time exceeded by: ${duration - 2000}ms`);
	}

	console.log("=============================================\n");

	if (code === 0) {
		console.log("✅ All tests passed!");
		process.exit(0);
	} else {
		console.log("❌ Some tests failed!");
		process.exit(1);
	}
});
