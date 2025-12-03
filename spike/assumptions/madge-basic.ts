/**
 * Assumption 1: madge Basic Analysis
 *
 * Test: Can madge analyze a real monorepo and return a dependency graph?
 *
 * Success: Graph returned with >0 nodes in <30 seconds
 * Failure: Timeout, error, or empty graph
 */

import madge from "madge";
import { type SpikeResult, timer } from "../utils";

export async function runMadgeBasic(workspace: string): Promise<SpikeResult> {
	const name = "madge-basic";
	const description = "madge can analyze monorepo structure";

	try {
		const { elapsed, result } = await timer(async () => {
			return madge(workspace, {
				fileExtensions: ["ts", "tsx", "js", "jsx"],
				excludeRegExp: [
					/node_modules/,
					/\.test\./,
					/\.spec\./,
					/dist/,
					/build/,
				],
				tsConfig: `${workspace}/tsconfig.json`,
			});
		});

		const graph = result.obj();
		const nodeCount = Object.keys(graph).length;

		if (nodeCount === 0) {
			return {
				name,
				description,
				status: "FAIL",
				critical: true,
				message: "Graph is empty - madge found no files",
				metrics: { elapsed, nodeCount },
			};
		}

		if (elapsed > 30_000) {
			return {
				name,
				description,
				status: "WARN",
				critical: false,
				message: `Slow: ${elapsed}ms (budget: 30,000ms)`,
				metrics: { elapsed, nodeCount },
			};
		}

		return {
			name,
			description,
			status: "PASS",
			critical: false,
			message: `Found ${nodeCount} nodes in ${elapsed}ms`,
			metrics: { elapsed, nodeCount },
		};
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			name,
			description,
			status: "FAIL",
			critical: true,
			message: `Error: ${errorMessage}`,
			metrics: {},
		};
	}
}
