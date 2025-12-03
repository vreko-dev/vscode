/**
 * Architecture Validation Spike
 *
 * Run with: npx tsx apps/vscode/spike/index.ts [--workspace=/path/to/test]
 *
 * Tests all core assumptions and reports PASS/FAIL with metrics.
 * Total runtime should be <90 minutes.
 */

import { runBabelRecovery } from "./assumptions/babel-recovery";
import { runMadgeBasic } from "./assumptions/madge-basic";
import { runMadgeTimeout } from "./assumptions/madge-timeout";
import { runMappingPerf } from "./assumptions/mapping-perf";
import { runMoveDetection } from "./assumptions/move-detection";
import { runSystemDetection } from "./assumptions/system-detect";
import { formatReport, type SpikeResult } from "./utils/reporter";

async function main() {
	const workspace =
		process.argv.find((a) => a.startsWith("--workspace="))?.split("=")[1] ||
		process.cwd();

	console.log(`\n🔬 Architecture Validation Spike`);
	console.log(`   Workspace: ${workspace}`);
	console.log(`   Started: ${new Date().toISOString()}\n`);

	const results: SpikeResult[] = [];

	// Run each assumption test
	console.log("Running assumption tests...\n");

	console.log("1/6 Testing madge basic analysis...");
	results.push(await runMadgeBasic(workspace));

	console.log("2/6 Testing madge timeout + fallback...");
	results.push(await runMadgeTimeout(workspace));

	console.log("3/6 Testing Babel error recovery...");
	results.push(await runBabelRecovery());

	console.log("4/6 Testing system detection...");
	results.push(await runSystemDetection(workspace));

	console.log("5/6 Testing mapping performance...");
	results.push(await runMappingPerf(workspace));

	console.log("6/6 Testing move detection...");
	results.push(await runMoveDetection());

	// Generate report
	console.log(formatReport(results));

	// Exit with error if any critical failures
	const criticalFailures = results.filter(
		(r) => r.status === "FAIL" && r.critical,
	);
	if (criticalFailures.length > 0) {
		console.error(
			`\n❌ ${criticalFailures.length} CRITICAL FAILURE(S) - Architecture needs adjustment`,
		);
		process.exit(1);
	}

	console.log(`\n✅ Spike complete. Proceed with Phase 1.`);
}

main().catch((error) => {
	console.error("\n❌ Spike failed with error:", error);
	process.exit(1);
});
