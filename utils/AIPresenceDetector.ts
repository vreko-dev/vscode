/**
 * AI Presence Detector - Rich, adaptive, multi-assistant detection
 *
 * Enhancements over the original boolean-based detector:
 * 1. Tracks full installed set + deterministic primary selection
 * 2. Data-driven, extensible extension ID registry (local overrides via .vreko/ai-extensions.json)
 * 3. Distinguishes presence (installed) vs host (Cursor/Windsurf fork) vs activity (events)
 * 4. Cached detection with invalidation on extension change
 * 5. Meaningful confidence: high (known), medium (generic AI), low (host-only hints)
 * 6. Indicators include extension versions and host app
 *
 * @module utils/AIPresenceDetector
 */

import * as vscode from "vscode";
import type { AIAssistantName, AIPresenceInfo, ConfidenceLevel, HostApp, InstalledAssistant } from "../types/sdk";

// =============================================================================
// EXTENSION ID REGISTRY (data-driven, mergeable)
// =============================================================================

export interface AssistantEntry {
	/** Friendly key used throughout Vreko */
	name: AIAssistantName;
	/** All known extension IDs (official, forks, enterprise) */
	extensionIds: string[];
	/** Human-readable display name */
	displayName: string;
	/** Deterministic priority  -  lower wins primary selection */
	priority: number;
}

/**
 * Default built-in registry.  Ordered by priority (lower = preferred primary).
 *
 * Users can merge extra IDs at runtime via `.vreko/ai-extensions.json`.
 */
const DEFAULT_REGISTRY: AssistantEntry[] = [
	{
		name: "cursor",
		extensionIds: ["cursor.cursor-ai", "anysphere.cursor"],
		displayName: "Cursor",
		priority: 10,
	},
	{
		name: "windsurf",
		extensionIds: ["codeium.windsurf", "codeium.codeium"],
		displayName: "Windsurf",
		priority: 20,
	},
	{
		name: "copilot",
		extensionIds: ["github.copilot", "github.copilot-chat"],
		displayName: "GitHub Copilot",
		priority: 30,
	},
	{
		name: "claude",
		extensionIds: [
			"anthropic.claude-vscode",
			"anthropic.claude-code",
			"claude.claude",
			"saoudrizwan.claude-dev", // Cline (Claude-based)
		],
		displayName: "Claude",
		priority: 40,
	},
	{
		name: "continue",
		extensionIds: ["continue.continue"],
		displayName: "Continue",
		priority: 50,
	},
	{
		name: "codewhisperer",
		extensionIds: ["amazonwebservices.codewhisperer-for-command-line-companion"],
		displayName: "CodeWhisperer",
		priority: 60,
	},
	{
		name: "amazon-q",
		extensionIds: ["amazonwebservices.aws-toolkit-vscode", "amazonwebservices.amazon-q-vscode"],
		displayName: "Amazon Q",
		priority: 65,
	},
	{
		name: "tabnine",
		extensionIds: ["tabnine.tabnine-vscode"],
		displayName: "Tabnine",
		priority: 70,
	},
	{
		name: "codeium",
		extensionIds: ["codeium.codeium"],
		displayName: "Codeium",
		priority: 80,
	},
];

// =============================================================================
// HOST DETECTION
// =============================================================================

/**
 * Detect which IDE host we're running inside.
 * Cursor and Windsurf are VS Code forks  -  `vscode.env.appName` reveals them.
 */
function detectHost(): HostApp {
	const appName = (vscode.env.appName ?? "").toLowerCase();
	const appHost = (vscode.env.appHost ?? "").toLowerCase();

	if (appName.includes("cursor") || appHost.includes("cursor")) {
		return "cursor";
	}
	if (appName.includes("windsurf") || appHost.includes("windsurf")) {
		return "windsurf";
	}
	// Default to "vscode" for standard VS Code and unknown forks
	return "vscode";
}

// =============================================================================
// GENERIC AI EXTENSION HEURISTIC
// =============================================================================

/** Tags in extension metadata that suggest "this is an AI tool" */
const AI_CATEGORY_HINTS = ["ai", "copilot", "assistant", "code completion", "machine learning"];

/**
 * Scan extensions for unknown/generic AI tools not in our registry.
 */
function detectGenericAIExtensions(installedIds: Set<string>, knownIds: Set<string>): string[] {
	const generic: string[] = [];
	for (const ext of vscode.extensions.all) {
		const id = ext.id.toLowerCase();
		if (knownIds.has(id)) {
			continue; // already matched
		}
		if (installedIds.has(id)) {
			// Check categories / keywords from package.json
			const pkg = ext.packageJSON;
			const cats: string[] = [...(pkg?.categories ?? []), ...(pkg?.keywords ?? [])];
			const lower = cats.map((c: string) => c.toLowerCase());
			if (AI_CATEGORY_HINTS.some((hint) => lower.some((l) => l.includes(hint)))) {
				generic.push(ext.id);
			}
		}
	}
	return generic;
}

// =============================================================================
// EXTENSION ID CACHE (invalidated on vscode.extensions.onDidChange)
// =============================================================================

let cachedSnapshot: AIPresenceInfo | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 s hard TTL as safety net

// Invalidate on extension install/uninstall when API is available
try {
	if (vscode.extensions.onDidChange) {
		vscode.extensions.onDidChange(() => {
			cachedSnapshot = null;
		});
	}
} catch {
	// onDidChange may not exist in all hosts  -  safe to ignore
}

// =============================================================================
// REGISTRY MERGING (user overrides)
// =============================================================================

let mergedRegistry: AssistantEntry[] | null = null;

/**
 * Load user overrides from workspace `.vreko/ai-extensions.json`.
 *
 * Format:
 * ```json
 * [{ "name": "claude", "extensionIds": ["my-org.claude-enterprise"], "displayName": "Claude (Org)", "priority": 40 }]
 * ```
 *
 * Entries with existing names merge their extensionIds. New names are appended.
 */
async function loadUserOverrides(): Promise<AssistantEntry[]> {
	if (mergedRegistry) {
		return mergedRegistry;
	}

	const base = [...DEFAULT_REGISTRY];

	try {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders?.length) {
			mergedRegistry = base;
			return base;
		}
		const overridePath = vscode.Uri.joinPath(folders[0].uri, ".vreko", "ai-extensions.json");
		const raw = await vscode.workspace.fs.readFile(overridePath);
		const overrides: AssistantEntry[] = JSON.parse(Buffer.from(raw).toString("utf-8"));

		for (const override of overrides) {
			const existing = base.find((e) => e.name === override.name);
			if (existing) {
				// Merge extension IDs
				const merged = new Set([...existing.extensionIds, ...override.extensionIds]);
				existing.extensionIds = [...merged];
				if (override.displayName) {
					existing.displayName = override.displayName;
				}
				if (override.priority !== undefined) {
					existing.priority = override.priority;
				}
			} else {
				base.push(override);
			}
		}
	} catch {
		// No override file or invalid JSON  -  use defaults
	}

	mergedRegistry = base;
	return base;
}

// Invalidate merged registry when workspace files change
try {
	const watcher = vscode.workspace.createFileSystemWatcher("**/.vreko/ai-extensions.json");
	watcher.onDidChange(() => {
		mergedRegistry = null;
		cachedSnapshot = null;
	});
	watcher.onDidCreate(() => {
		mergedRegistry = null;
		cachedSnapshot = null;
	});
	watcher.onDidDelete(() => {
		mergedRegistry = null;
		cachedSnapshot = null;
	});
} catch {
	// Safe to ignore in test contexts
}

// =============================================================================
// PRIMARY SELECTION STRATEGY
// =============================================================================

/**
 * Select the primary assistant:
 * 1. User-configured preference (setting `vreko.ai.primaryAssistant`)
 * 2. If host is Cursor/Windsurf, that's the primary
 * 3. Deterministic priority order from registry
 */
function selectPrimary(
	installed: InstalledAssistant[],
	host: HostApp,
	registry: AssistantEntry[],
): AIAssistantName | undefined {
	if (installed.length === 0) {
		return undefined;
	}

	// 1. User preference
	const config = vscode.workspace.getConfiguration("vreko.ai");
	const preferred = config.get<string>("primaryAssistant");
	if (preferred && installed.some((a) => a.name === preferred)) {
		return preferred as AIAssistantName;
	}

	// 2. Host match
	if (host === "cursor" && installed.some((a) => a.name === "cursor")) {
		return "cursor";
	}
	if (host === "windsurf" && installed.some((a) => a.name === "windsurf")) {
		return "windsurf";
	}

	// 3. Priority order
	const priorityMap = new Map(registry.map((e) => [e.name, e.priority]));
	const sorted = [...installed].sort((a, b) => (priorityMap.get(a.name) ?? 999) - (priorityMap.get(b.name) ?? 999));
	return sorted[0]?.name;
}

// =============================================================================
// CORE DETECTION
// =============================================================================

async function detectImpl(): Promise<AIPresenceInfo> {
	const registry = await loadUserOverrides();
	const host = detectHost();

	// Build a lookup of all installed extension IDs (lowercase)
	const installedIds = new Set(vscode.extensions.all.map((ext) => ext.id.toLowerCase()));

	// Collect all known extension IDs for generic fallback later
	const allKnownIds = new Set<string>();
	for (const entry of registry) {
		for (const id of entry.extensionIds) {
			allKnownIds.add(id.toLowerCase());
		}
	}

	const installed: InstalledAssistant[] = [];
	const indicators: string[] = [];

	// Match known assistants
	for (const entry of registry) {
		for (const extId of entry.extensionIds) {
			if (installedIds.has(extId.toLowerCase())) {
				// Avoid duplicate assistant names (e.g. copilot matched via copilot + copilot-chat)
				if (!installed.some((a) => a.name === entry.name)) {
					// Get version from extension metadata
					const ext = vscode.extensions.all.find((e) => e.id.toLowerCase() === extId.toLowerCase());
					const version = ext?.packageJSON?.version as string | undefined;
					installed.push({
						name: entry.name,
						extensionId: extId,
						version,
						displayName: entry.displayName,
					});
					indicators.push(version ? `${entry.name}: ${extId}@${version}` : `${entry.name}: ${extId}`);
				}
				break; // One match per entry is enough
			}
		}
	}

	// Detect generic/unknown AI extensions
	const genericAI = detectGenericAIExtensions(installedIds, allKnownIds);
	for (const gid of genericAI) {
		const ext = vscode.extensions.all.find((e) => e.id.toLowerCase() === gid.toLowerCase());
		const version = ext?.packageJSON?.version as string | undefined;
		installed.push({
			name: "unknown",
			extensionId: gid,
			version,
			displayName: ext?.packageJSON?.displayName ?? gid,
		});
		indicators.push(version ? `unknown: ${gid}@${version}` : `unknown: ${gid}`);
	}

	// Add host indicator
	indicators.push(`host: ${host} (${vscode.env.appName})`);

	// Confidence
	const knownCount = installed.filter((a) => a.name !== "unknown").length;
	const unknownCount = installed.filter((a) => a.name === "unknown").length;
	let confidence: ConfidenceLevel;
	if (knownCount > 0) {
		confidence = "high";
	} else if (unknownCount > 0) {
		confidence = "medium";
	} else if (host !== "vscode") {
		// In Cursor/Windsurf host but no extension detected  -  still a hint
		confidence = "low";
	} else {
		confidence = "none";
	}

	// If host is Cursor/Windsurf and that assistant isn't in installed, add it as heuristic
	if (host === "cursor" && !installed.some((a) => a.name === "cursor")) {
		installed.push({ name: "cursor", extensionId: "(host-detected)", displayName: "Cursor", version: undefined });
		indicators.push("cursor: host-detected (no extension found)");
		if (confidence === "none") {
			confidence = "low";
		}
	}
	if (host === "windsurf" && !installed.some((a) => a.name === "windsurf")) {
		installed.push({
			name: "windsurf",
			extensionId: "(host-detected)",
			displayName: "Windsurf",
			version: undefined,
		});
		indicators.push("windsurf: host-detected (no extension found)");
		if (confidence === "none") {
			confidence = "low";
		}
	}

	const names = installed.map((a) => a.name);
	const primary = selectPrimary(installed, host, registry);
	const anyDetected = installed.length > 0;

	return {
		// New rich fields
		installed: names,
		primary,
		confidence,
		indicators,
		host,
		assistantDetails: installed,

		// Backward compat
		detected: anyDetected,
		hasAI: anyDetected,
		tool: primary,
		detectedAssistants: names,
	};
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Detect AI assistants, host, and build a rich presence snapshot.
 * Results are cached and invalidated when extensions or config change.
 */
export async function detectAIPresenceAsync(): Promise<AIPresenceInfo> {
	const now = Date.now();
	if (cachedSnapshot && now - cacheTimestamp < CACHE_TTL_MS) {
		return cachedSnapshot;
	}
	const result = await detectImpl();
	cachedSnapshot = result;
	cacheTimestamp = now;
	return result;
}

/**
 * Synchronous version  -  returns the cached snapshot or builds one eagerly.
 * Preferred for hot paths where async isn't practical (event handlers, getters).
 */
export function detectAIPresence(): AIPresenceInfo {
	if (cachedSnapshot && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
		return cachedSnapshot;
	}
	// Kick off async refresh, return stale or empty placeholder
	detectAIPresenceAsync().catch(() => {
		/* swallow  -  cache will update */
	});

	if (cachedSnapshot) {
		return cachedSnapshot;
	}

	// Cold start: build a synchronous-safe minimal snapshot
	return buildSyncSnapshot();
}

/** Fast synchronous fallback (no user-override merging, no generic scan) */
function buildSyncSnapshot(): AIPresenceInfo {
	const host = detectHost();
	const installedIds = new Set(vscode.extensions.all.map((ext) => ext.id.toLowerCase()));
	const installed: InstalledAssistant[] = [];
	const indicators: string[] = [];

	for (const entry of DEFAULT_REGISTRY) {
		for (const extId of entry.extensionIds) {
			if (installedIds.has(extId.toLowerCase())) {
				if (!installed.some((a) => a.name === entry.name)) {
					const ext = vscode.extensions.all.find((e) => e.id.toLowerCase() === extId.toLowerCase());
					const version = ext?.packageJSON?.version as string | undefined;
					installed.push({ name: entry.name, extensionId: extId, version, displayName: entry.displayName });
					indicators.push(version ? `${entry.name}: ${extId}@${version}` : `${entry.name}: ${extId}`);
				}
				break;
			}
		}
	}

	indicators.push(`host: ${host} (${vscode.env.appName})`);

	const knownCount = installed.filter((a) => a.name !== "unknown").length;
	const confidence: ConfidenceLevel = knownCount > 0 ? "high" : host !== "vscode" ? "low" : "none";
	const names = installed.map((a) => a.name);
	const primary = selectPrimary(installed, host, DEFAULT_REGISTRY);
	const anyDetected = installed.length > 0;

	const result: AIPresenceInfo = {
		installed: names,
		primary,
		confidence,
		indicators,
		host,
		assistantDetails: installed,
		detected: anyDetected,
		hasAI: anyDetected,
		tool: primary,
		detectedAssistants: names,
	};

	cachedSnapshot = result;
	cacheTimestamp = Date.now();
	return result;
}

/** Force cache invalidation (e.g. after user changes settings) */
export function invalidatePresenceCache(): void {
	cachedSnapshot = null;
	mergedRegistry = null;
}

// --- Convenience helpers (backward-compat surface) ---

export function isAIAssistantInstalled(assistantName: AIAssistantName): boolean {
	return detectAIPresence().installed.includes(assistantName);
}

export function getInstalledAIAssistants(): AIAssistantName[] {
	return detectAIPresence().installed;
}

// Re-export types for consumers
export type { AIAssistantName, AIPresenceInfo, ConfidenceLevel, HostApp, InstalledAssistant };

// =============================================================================
// ACTIVITY TRACKING (unchanged  -  fires on known AI interactions)
// =============================================================================

export interface AIActivityChange {
	isActive: boolean;
	assistant?: AIAssistantName;
	timestamp: number;
}

export interface AIPresenceDetectorInstance {
	readonly onActivityChange: vscode.Event<AIActivityChange>;
	readonly isAnyActive: boolean;
}

const _onActivityChange = new vscode.EventEmitter<AIActivityChange>();

export function getAIPresenceDetector(): AIPresenceDetectorInstance {
	return {
		onActivityChange: _onActivityChange.event,
		get isAnyActive() {
			return detectAIPresence().detected;
		},
	};
}

export function fireAIActivityChange(change: AIActivityChange): void {
	_onActivityChange.fire(change);
}

// =============================================================================
// LEGACY COMPAT: AI_EXTENSION_IDS export
// =============================================================================

/** @deprecated Use the registry-based detection instead */
export const AI_EXTENSION_IDS: Record<AIAssistantName, string[]> = {
	cursor: ["cursor.cursor-ai", "anysphere.cursor"],
	copilot: ["github.copilot", "github.copilot-chat"],
	claude: ["anthropic.claude-vscode", "anthropic.claude-code", "claude.claude"],
	codewhisperer: ["amazonwebservices.codewhisperer-for-command-line-companion"],
	windsurf: ["codeium.windsurf", "codeium.codeium"],
	continue: ["continue.continue"],
	tabnine: ["tabnine.tabnine-vscode"],
	codeium: ["codeium.codeium"],
	"amazon-q": ["amazonwebservices.aws-toolkit-vscode", "amazonwebservices.amazon-q-vscode"],
	unknown: [],
};
