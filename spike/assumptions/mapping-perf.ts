/**
 * Assumption 5: Mapping Performance
 *
 * Test: Is file → system mapping fast enough for real-time use?
 *
 * Success: <10ms for 50,000 lookups (simulated)
 * Failure: >100ms indicates need for caching layer
 */

import { type SpikeResult, timer } from "../utils";

interface SystemMapping {
	systems: Map<string, { name: string; basePath: string }>;
	fileCache: Map<string, string>; // filePath → systemName
}

export async function runMappingPerf(workspace: string): Promise<SpikeResult> {
	const name = "mapping-perf";
	const description = "File → system mapping is fast (<10ms for 50k lookups)";

	// Simulate realistic file paths
	const testPaths = generateTestPaths(50_000, workspace);

	// Build system mapping
	const mapping: SystemMapping = {
		systems: new Map([
			["@snapback/web", { name: "web", basePath: `${workspace}/apps/web` }],
			[
				"@snapback/vscode",
				{ name: "vscode", basePath: `${workspace}/apps/vscode` },
			],
			[
				"@snapback/core",
				{ name: "core", basePath: `${workspace}/packages/core` },
			],
			["@snapback/sdk", { name: "sdk", basePath: `${workspace}/packages/sdk` }],
			[
				"@snapback/platform",
				{ name: "platform", basePath: `${workspace}/packages/platform` },
			],
		]),
		fileCache: new Map(),
	};

	// Test: Uncached lookups (worst case)
	const { elapsed: uncachedElapsed } = await timer(async () => {
		for (const filePath of testPaths) {
			getSystemForFile(filePath, mapping, false);
		}
	});

	// Test: Cached lookups (best case)
	const { elapsed: cachedElapsed } = await timer(async () => {
		for (const filePath of testPaths) {
			getSystemForFile(filePath, mapping, true);
		}
	});

	const opsPerMs = Math.round(50_000 / uncachedElapsed);

	if (uncachedElapsed > 100) {
		return {
			name,
			description,
			status: "FAIL",
			critical: true,
			message: `Uncached: ${uncachedElapsed}ms (need <100ms), ${opsPerMs} ops/ms`,
			metrics: { uncachedElapsed, cachedElapsed, opsPerMs },
		};
	}

	if (uncachedElapsed > 10) {
		return {
			name,
			description,
			status: "WARN",
			critical: false,
			message: `Uncached: ${uncachedElapsed}ms (target: <10ms), caching essential`,
			metrics: { uncachedElapsed, cachedElapsed, opsPerMs },
		};
	}

	return {
		name,
		description,
		status: "PASS",
		critical: false,
		message: `Uncached: ${uncachedElapsed}ms, Cached: ${cachedElapsed}ms, ${opsPerMs} ops/ms`,
		metrics: { uncachedElapsed, cachedElapsed, opsPerMs },
	};
}

function getSystemForFile(
	filePath: string,
	mapping: SystemMapping,
	useCache: boolean,
): string | null {
	if (useCache && mapping.fileCache.has(filePath)) {
		return mapping.fileCache.get(filePath)!;
	}

	for (const [_name, system] of mapping.systems) {
		if (filePath.startsWith(system.basePath)) {
			if (useCache) mapping.fileCache.set(filePath, system.name);
			return system.name;
		}
	}

	return null;
}

function generateTestPaths(count: number, workspace: string): string[] {
	const bases = [
		`${workspace}/apps/web/src/components`,
		`${workspace}/apps/vscode/src/handlers`,
		`${workspace}/packages/core/src/utils`,
		`${workspace}/packages/sdk/src/storage`,
		`${workspace}/packages/platform/src/db`,
	];

	const paths: string[] = [];
	for (let i = 0; i < count; i++) {
		const base = bases[i % bases.length];
		paths.push(`${base}/file-${i}.ts`);
	}
	return paths;
}
