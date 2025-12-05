import { minimatch } from "minimatch";
import type { ProtectionRule, SnapBackRC } from "../types/snapbackrc.types";

type ProtectionLevel = "Watched" | "Warning" | "Protected";

// Protection level hierarchy (higher number = more restrictive)
const PROTECTION_LEVEL_PRIORITY: Record<ProtectionLevel, number> = {
	Watched: 1,
	Warning: 2,
	Protected: 3,
};

// Cache for compiled minimatch patterns to avoid recompilation
const patternCache = new Map<string, (filePath: string) => boolean>();
const MAX_PATTERN_CACHE_SIZE = 1000;

/**
 * Get a compiled minimatch pattern from cache or create new one
 * @param pattern Glob pattern to compile
 * @returns Compiled minimatch pattern function
 */
function getCachedPattern(pattern: string): (filePath: string) => boolean {
	if (patternCache.has(pattern)) {
		const cached = patternCache.get(pattern);
		if (cached === undefined) {
			throw new Error(`Pattern cache miss for pattern: ${pattern}`);
		}
		return cached;
	}

	const matcher = (filePath: string) =>
		minimatch(filePath, pattern, { dot: true });

	// Maintain cache size limit
	if (patternCache.size >= MAX_PATTERN_CACHE_SIZE) {
		// Remove oldest entries (simple FIFO)
		const firstKey = patternCache.keys().next().value;
		if (firstKey) {
			patternCache.delete(firstKey);
		}
	}

	patternCache.set(pattern, matcher);
	return matcher;
}

/**
 * Merge multiple SnapBackRC configurations with last-one-wins semantics
 * @param configs Configurations to merge, in order of precedence (later ones override earlier ones)
 * @returns Merged configuration
 */
export function mergeConfigs(...configs: SnapBackRC[]): SnapBackRC {
	if (configs.length === 0) {
		return {};
	}

	if (configs.length === 1) {
		return configs[0];
	}

	// Start with the base config
	const result: SnapBackRC = { ...configs[0] };

	// Apply each subsequent config as an override
	for (let i = 1; i < configs.length; i++) {
		const override = configs[i];

		// Merge protection rules (last-one-wins per pattern)
		if (override.protection) {
			if (!result.protection) {
				result.protection = [];
			}

			// Create a map of existing patterns for efficient lookup
			const protectionMap = new Map<string, ProtectionRule>();
			for (const rule of result.protection) {
				protectionMap.set(rule.pattern, rule);
			}

			// Apply override rules
			for (const rule of override.protection) {
				protectionMap.set(rule.pattern, { ...rule });
			}

			// Convert back to array
			result.protection = Array.from(protectionMap.values());
		}

		// Union and deduplicate ignore patterns
		if (override.ignore) {
			if (!result.ignore) {
				result.ignore = [];
			}

			// Create a set for deduplication
			const ignoreSet = new Set([...result.ignore, ...override.ignore]);
			result.ignore = Array.from(ignoreSet);
		}

		// Deep merge settings with more restrictive wins
		if (override.settings) {
			if (!result.settings) {
				result.settings = { ...override.settings };
			} else {
				result.settings = mergeSettings(
					result.settings as Record<string, unknown>,
					override.settings as Record<string, unknown>,
				);
			}
		}

		// Deep merge policies with more restrictive wins
		if (override.policies) {
			if (!result.policies) {
				result.policies = { ...override.policies };
			} else {
				result.policies = mergePolicies(
					result.policies as Record<string, unknown>,
					override.policies as Record<string, unknown>,
				);
			}
		}
	}

	return result;
}

/**
 * Merge settings with more restrictive wins
 */
function mergeSettings(
	base: Record<string, unknown>,
	override: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...base };

	for (const [key, value] of Object.entries(override)) {
		if (key === "defaultProtectionLevel" && base[key]) {
			// For protection levels, more restrictive wins
			const baseLevel = base[key] as ProtectionLevel;
			const overrideLevel = value as ProtectionLevel;
			const basePriority = PROTECTION_LEVEL_PRIORITY[baseLevel] || 0;
			const overridePriority = PROTECTION_LEVEL_PRIORITY[overrideLevel] || 0;

			if (overridePriority > basePriority) {
				result[key] = value;
			}
		} else if (
			key === "maxSnapshots" &&
			typeof base[key] === "number" &&
			typeof value === "number"
		) {
			// For numbers, lower values are more restrictive
			result[key] = Math.min(base[key] as number, value);
		} else if (typeof value === "boolean" && typeof base[key] === "boolean") {
			// For booleans, true is generally more restrictive
			result[key] = (base[key] as boolean) || value;
		} else {
			// Default: override wins
			result[key] = value;
		}
	}

	return result;
}

/**
 * Merge policies with more restrictive wins
 */
function mergePolicies(
	base: Record<string, unknown>,
	override: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...base };

	for (const [key, value] of Object.entries(override)) {
		if (key === "minimumProtectionLevel" && base[key]) {
			// For protection levels, more restrictive wins
			const baseLevel = base[key] as ProtectionLevel;
			const overrideLevel = value as ProtectionLevel;
			const basePriority = PROTECTION_LEVEL_PRIORITY[baseLevel] || 0;
			const overridePriority = PROTECTION_LEVEL_PRIORITY[overrideLevel] || 0;

			if (overridePriority > basePriority) {
				result[key] = value;
			}
		} else if (key === "enforceProtectionLevels" || key === "allowOverrides") {
			// For booleans, true is generally more restrictive for enforce, false for allow
			if (key === "enforceProtectionLevels") {
				result[key] = (base[key] as boolean) || value; // true wins
			} else {
				result[key] = (base[key] as boolean) && value; // false wins (more restrictive)
			}
		} else {
			// Default: override wins
			result[key] = value;
		}
	}

	return result;
}

/**
 * Get the effective protection level for a file path
 * Optimized for p95 <50ms performance target
 * @param config Merged configuration
 * @param filePath File path to check
 * @returns The highest protection level that matches the file, or null if ignored
 */
export function getProtectionLevelForFile(
	config: SnapBackRC,
	filePath: string,
): string | null {
	if (!config.protection || config.protection.length === 0) {
		return null;
	}

	// Check if file is ignored first (ignore takes precedence over protection)
	if (config.ignore && shouldIgnoreFile(config.ignore, filePath)) {
		return null;
	}

	// Find all matching rules
	const matchingRules: ProtectionRule[] = [];

	// MVP Note: Optimized for performance - early exit when highest level is found
	// Since Protected (level 3) is the highest, we can return immediately when found
	for (const rule of config.protection) {
		if (matchesPattern(filePath, rule.pattern)) {
			// Early exit optimization - if we find Protected level, return immediately
			if (rule.level === "Protected") {
				return rule.level;
			}
			matchingRules.push(rule);
		}
	}

	if (matchingRules.length === 0) {
		return null;
	}

	// Find the rule with the highest protection level
	let highestLevelRule = matchingRules[0];
	let highestPriority = PROTECTION_LEVEL_PRIORITY[highestLevelRule.level] || 0;

	// MVP Note: Optimized loop - break early when maximum priority is found
	for (let i = 1; i < matchingRules.length; i++) {
		const rule = matchingRules[i];
		const priority = PROTECTION_LEVEL_PRIORITY[rule.level] || 0;

		if (priority > highestPriority) {
			highestLevelRule = rule;
			highestPriority = priority;

			// Early exit optimization - if we reach maximum priority, return immediately
			if (priority === 3) {
				// Protected level
				break;
			}
		}
	}

	return highestLevelRule.level;
}

/**
 * Check if a file should be ignored based on ignore patterns
 * @param ignorePatterns Array of ignore patterns
 * @param filePath File path to check
 * @returns Whether the file should be ignored
 */
function shouldIgnoreFile(ignorePatterns: string[], filePath: string): boolean {
	// Process patterns in order, supporting negations
	let shouldIgnore = false;

	for (const pattern of ignorePatterns) {
		if (pattern.startsWith("!")) {
			// Negation pattern - if it matches, we should NOT ignore
			const positivePattern = pattern.substring(1);
			const matcher = getCachedPattern(positivePattern);
			if (matcher(filePath)) {
				shouldIgnore = false;
			}
		} else {
			// Regular pattern - if it matches, we should ignore
			const matcher = getCachedPattern(pattern);
			if (matcher(filePath)) {
				shouldIgnore = true;
			}
		}
	}

	return shouldIgnore;
}

/**
 * Pattern matching using minimatch for proper glob support
 * Optimized with caching for performance
 * @param filePath File path to check
 * @param pattern Glob pattern to match against
 * @returns Whether the file path matches the pattern
 */
function matchesPattern(filePath: string, pattern: string): boolean {
	const matcher = getCachedPattern(pattern);
	return matcher(filePath);
}
