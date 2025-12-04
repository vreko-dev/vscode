/**
 * Assumption 4: System Detection
 *
 * Test: Can we detect systems from convention-based monorepo structure?
 *
 * Success: Detects apps/*, packages/*, or similar structure
 * Failure: Finds nothing or incorrect boundaries
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import { type SpikeResult, timer } from "../utils";

interface DetectedSystem {
	name: string;
	path: string;
	type: "app" | "package" | "lib" | "unknown";
	method: "package-json" | "workspace-config" | "convention";
}

export async function runSystemDetection(
	workspace: string,
): Promise<SpikeResult> {
	const name = "system-detection";
	const description = "Detects systems from convention-based structure";

	const { elapsed, result: systems } = await timer(async () => {
		const detected: DetectedSystem[] = [];

		// Method 1: Look for pnpm-workspace.yaml patterns
		const pnpmWorkspace = path.join(workspace, "pnpm-workspace.yaml");
		if (fs.existsSync(pnpmWorkspace)) {
			const content = fs.readFileSync(pnpmWorkspace, "utf-8");
			const patterns = content
				.match(/- ['"]?([^'"]+)['"]?/g)
				?.map((m) => m.replace(/- ['"]?/, "").replace(/['"]$/, ""));
			if (patterns) {
				for (const pattern of patterns) {
					const matches = await glob(pattern.replace("**", "*"), {
						cwd: workspace,
					});
					for (const match of matches) {
						const pkgPath = path.join(workspace, match, "package.json");
						if (fs.existsSync(pkgPath)) {
							const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
							detected.push({
								name: pkg.name || match,
								path: path.join(workspace, match),
								type: match.startsWith("apps/") ? "app" : "package",
								method: "workspace-config",
							});
						}
					}
				}
			}
		}

		// Method 2: Convention-based (apps/*, packages/*)
		const conventionDirs = ["apps", "packages", "libs", "services"];
		for (const dir of conventionDirs) {
			const dirPath = path.join(workspace, dir);
			if (fs.existsSync(dirPath)) {
				const entries = fs.readdirSync(dirPath, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isDirectory()) {
						const pkgPath = path.join(dirPath, entry.name, "package.json");
						const hasPkg = fs.existsSync(pkgPath);
						if (
							hasPkg &&
							!detected.some((d) => d.path === path.join(dirPath, entry.name))
						) {
							const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
							detected.push({
								name: pkg.name || entry.name,
								path: path.join(dirPath, entry.name),
								type: dir === "apps" ? "app" : "package",
								method: "convention",
							});
						}
					}
				}
			}
		}

		return detected;
	});

	if (systems.length === 0) {
		return {
			name,
			description,
			status: "FAIL",
			critical: true,
			message: "No systems detected - check workspace structure",
			metrics: { elapsed, systems: [] },
		};
	}

	// Validate against known SnapBack structure
	const expectedApps = ["web", "vscode", "mcp-server", "cli"];
	const foundApps = systems.filter((s) =>
		expectedApps.includes(path.basename(s.path)),
	);

	return {
		name,
		description,
		status: foundApps.length >= 2 ? "PASS" : "WARN",
		critical: false,
		message: `Found ${systems.length} systems (${foundApps.length} expected) in ${elapsed}ms`,
		metrics: {
			elapsed,
			systemCount: systems.length,
			systems: systems.map((s) => ({
				name: s.name,
				type: s.type,
				method: s.method,
			})),
		},
	};
}
