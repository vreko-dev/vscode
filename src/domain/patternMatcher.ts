/**
 * Pattern Matcher Utility
 *
 * Supports glob pattern matching for file protection rules:
 * - Exact matches: "package.json"
 * - Extension patterns: "*.ts", "*.json"
 * - Prefix patterns: ".env*" (matches .env, .env.local, etc.)
 * - Directory patterns: "node_modules/**", "dist/**"
 *
 * This is used to match files against alwaysProtectPatterns and neverProtectPatterns.
 */

export interface PatternMatcher {
	matches(filePath: string): boolean;
}

/**
 * Create a pattern matcher from a glob pattern string
 *
 * @param pattern - Glob pattern (e.g., "*.ts", "node_modules/**", ".env*")
 * @returns PatternMatcher for the given pattern
 * @throws Error if pattern is invalid
 */
export function createPatternMatcher(pattern: string): PatternMatcher {
	if (!pattern) {
		throw new Error("Pattern cannot be empty");
	}

	// Handle negation patterns (e.g., "!node_modules/**")
	const isNegation = pattern.startsWith("!");
	const normalizedPattern = isNegation ? pattern.slice(1) : pattern;

	// Pattern: directory with recursive wildcard (e.g., "dist/**")
	if (normalizedPattern.endsWith("/**")) {
		const dirName = normalizedPattern.slice(0, -3); // Remove "/**"
		return {
			matches: (filePath: string): boolean => {
				const matches = filePath.startsWith(`${dirName}/`);
				return isNegation ? !matches : matches;
			},
		};
	}

	// Pattern: prefix wildcard (e.g., ".env*" matches .env, .env.local, but not .environment)
	if (normalizedPattern.endsWith("*") && !normalizedPattern.includes("/")) {
		// Check if this is ONLY a prefix pattern (no directory separators)
		const starCount = (normalizedPattern.match(/\*/g) || []).length;
		if (starCount === 1) {
			const prefix = normalizedPattern.slice(0, -1); // Remove trailing "*"
			return {
				matches: (filePath: string): boolean => {
					const fileName = filePath.split("/").pop() || "";
					// .env* should match .env, .env.local, .env.production
					// but NOT .environment (doesn't have dot after prefix) or .env.ts (not at root)
					const matches =
						fileName === prefix || fileName.startsWith(`${prefix}.`);
					return isNegation ? !matches : matches;
				},
			};
		}
	}

	// Pattern: extension wildcard (e.g., "*.ts", "*.config.js")
	if (normalizedPattern.startsWith("*")) {
		const suffix = normalizedPattern; // "*.ts" -> match endsWith ".ts"
		return {
			matches: (filePath: string): boolean => {
				const extension = suffix.slice(1); // Remove "*"
				const matches = filePath.endsWith(extension);
				return isNegation ? !matches : matches;
			},
		};
	}

	// Pattern: exact filename match (e.g., "package.json", "tsconfig.json")
	return {
		matches: (filePath: string): boolean => {
			const fileName = filePath.split("/").pop() || "";
			const matches =
				fileName === normalizedPattern || filePath === normalizedPattern;
			return isNegation ? !matches : matches;
		},
	};
}

/**
 * Match a file path against an array of patterns
 *
 * @param filePath - File path to test
 * @param patterns - Array of glob patterns
 * @returns true if filePath matches any pattern in the array
 */
export function matchesAnyPattern(
	filePath: string,
	patterns: string[],
): boolean {
	if (!filePath || !patterns || patterns.length === 0) {
		return false;
	}

	return patterns.some((pattern) => {
		try {
			const matcher = createPatternMatcher(pattern);
			return matcher.matches(filePath);
		} catch {
			// Invalid pattern, skip it
			return false;
		}
	});
}

/**
 * Check if a file should be protected based on pattern lists
 *
 * Rules:
 * 1. If file matches neverProtectPatterns, return false (don't protect)
 * 2. If file matches alwaysProtectPatterns, return true (protect)
 * 3. Otherwise, return false (don't protect by default)
 *
 * @param filePath - File path to check
 * @param alwaysProtect - Patterns that always trigger protection
 * @param neverProtect - Patterns that always prevent protection
 * @returns true if file should be protected
 */
export function shouldProtectFile(
	filePath: string,
	alwaysProtect: string[],
	neverProtect: string[],
): boolean {
	// Never-protect takes precedence
	if (matchesAnyPattern(filePath, neverProtect)) {
		return false;
	}

	// Check always-protect
	if (matchesAnyPattern(filePath, alwaysProtect)) {
		return true;
	}

	// Default: don't protect
	return false;
}

/**
 * Filter a list of files to only those that should be protected
 *
 * @param filePaths - List of file paths
 * @param alwaysProtect - Patterns that always trigger protection
 * @param neverProtect - Patterns that always prevent protection
 * @returns Filtered list of files that should be protected
 */
export function filterProtectedFiles(
	filePaths: string[],
	alwaysProtect: string[],
	neverProtect: string[],
): string[] {
	return filePaths.filter((filePath) =>
		shouldProtectFile(filePath, alwaysProtect, neverProtect),
	);
}

/**
 * Count how many files in a list match always-protect or never-protect patterns
 *
 * @param filePaths - List of file paths
 * @param alwaysProtect - Patterns that always trigger protection
 * @param neverProtect - Patterns that always prevent protection
 * @returns Object with counts
 */
export function countPatternMatches(
	filePaths: string[],
	alwaysProtect: string[],
	neverProtect: string[],
): { alwaysProtected: number; neverProtected: number; neutral: number } {
	let alwaysProtected = 0;
	let neverProtected = 0;
	let neutral = 0;

	filePaths.forEach((filePath) => {
		if (matchesAnyPattern(filePath, neverProtect)) {
			neverProtected++;
		} else if (matchesAnyPattern(filePath, alwaysProtect)) {
			alwaysProtected++;
		} else {
			neutral++;
		}
	});

	return { alwaysProtected, neverProtected, neutral };
}
