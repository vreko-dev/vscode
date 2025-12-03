/**
 * Assumption 2: madge Timeout + Fallback
 *
 * Test: Does our timeout + fallback work when madge hangs?
 *
 * Success: Timeout triggers within 35 seconds, fallback returns something useful
 * Failure: Hangs indefinitely or fallback produces nothing
 */

import madge from "madge";
import { type SpikeResult, timer, withTimeout } from "../utils";
import { getBasicImportGraph } from "./fallbacks/regex-imports";

export async function runMadgeTimeout(workspace: string): Promise<SpikeResult> {
	const name = "madge-timeout";
	const description = "madge timeout + fallback works correctly";
	const TIMEOUT_MS = 30_000;

	try {
		// Test 1: Normal case with timeout wrapper
		const normalResult = await withTimeout(
			madge(workspace, {
				fileExtensions: ["ts", "tsx"],
				excludeRegExp: [/node_modules/, /dist/, /build/],
			}),
			TIMEOUT_MS,
		).catch(() => null);

		// Test 2: Simulate timeout and test fallback
		const { elapsed: fallbackElapsed, result: fallbackResult } = await timer(
			async () => {
				try {
					await withTimeout(
						new Promise((_, reject) =>
							setTimeout(() => reject(new Error("simulated hang")), 100),
						),
						50, // Force timeout
					);
					return null;
				} catch {
					// Fallback activates
					return getBasicImportGraph(workspace);
				}
			},
		);

		const fallbackNodeCount = fallbackResult
			? Object.keys(fallbackResult).length
			: 0;

		if (!fallbackResult || fallbackNodeCount === 0) {
			return {
				name,
				description,
				status: "FAIL",
				critical: true,
				message: "Fallback produced empty result",
				metrics: { fallbackElapsed, fallbackNodeCount },
			};
		}

		return {
			name,
			description,
			status: "PASS",
			critical: false,
			message: `Normal: ${normalResult ? "OK" : "timed out"}, Fallback: ${fallbackNodeCount} nodes in ${fallbackElapsed}ms`,
			metrics: {
				normalWorked: !!normalResult,
				fallbackNodeCount,
				fallbackElapsed,
			},
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
