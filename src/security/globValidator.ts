/**
 * GlobValidator - Safe Glob Pattern Validation with ReDoS Prevention
 *
 * This module provides validation for glob patterns to prevent security vulnerabilities
 * including ReDoS (Regular Expression Denial of Service) attacks, catastrophic backtracking,
 * and resource exhaustion through pattern complexity.
 *
 * ## Security Model
 *
 * The validator enforces strict limits on glob patterns to prevent:
 *
 * 1. **Length Attacks**: Patterns exceeding 1000 characters are rejected
 * 2. **Wildcard Explosion**: Patterns with more than 20 wildcards cause exponential matching
 * 3. **Brace Expansion**: Patterns with more than 10 brace pairs cause combinatorial explosion
 * 4. **ReDoS via Globstars**: 4+ consecutive globstars cause catastrophic backtracking
 * 5. **Nested Repetition**: Patterns like (a+)+ cause exponential time complexity
 *
 * ## Usage
 *
 * ```typescript
 * const validator = new GlobValidator();
 *
 * // Check if pattern is safe
 * if (validator.isGlobSafe('src/*.ts')) {
 *   // Use pattern safely
 * }
 *
 * // Sanitize and validate (throws on unsafe patterns)
 * const safePattern = validator.sanitizeGlobPattern('*.js');
 * ```
 *
 * @module security/globValidator
 */

export class GlobValidator {
	/**
	 * Maximum allowed pattern length to prevent buffer exhaustion and processing delays.
	 * Patterns exceeding this length are rejected as potentially malicious.
	 */
	private readonly MAX_PATTERN_LENGTH: number = 1000;

	/**
	 * Maximum allowed single wildcards (*) to prevent wildcard explosion.
	 * Each wildcard can match arbitrary strings, so excessive wildcards
	 * cause exponential matching attempts.
	 */
	private readonly MAX_WILDCARDS: number = 20;

	/**
	 * Maximum allowed brace pairs ({}) to prevent combinatorial explosion.
	 * Each brace pair expands into multiple patterns, so nested braces
	 * cause exponential pattern expansion.
	 */
	private readonly MAX_BRACES: number = 10;

	/**
	 * Regular expression to detect 4 or more consecutive globstar patterns.
	 *
	 * This pattern detects ReDoS attack vectors. The regex matches sequences
	 * where double-star-slash appears 4 or more times consecutively.
	 *
	 * Why this is dangerous:
	 * Multiple consecutive globstars create nested backtracking in glob engines,
	 * leading to exponential time complexity O(2^n) for pattern matching.
	 */
	private readonly CONSECUTIVE_GLOBSTARS_PATTERN: RegExp = /(\*\*\/){4,}/;

	/**
	 * Regular expression to detect nested repetition patterns.
	 *
	 * This pattern detects catastrophic backtracking vectors such as:
	 * - (a+)+ - Nested quantifiers
	 * - (.*)+ - Greedy wildcards with nested repetition
	 * - ([a-z]+)* - Character class repetition with outer repetition
	 *
	 * Why this is dangerous:
	 * Nested repetition creates exponential backtracking in regex engines.
	 * For input "aaaaaaaaaaaab", pattern (a+)+b can attempt 2^n matching
	 * combinations before failing, causing CPU exhaustion.
	 */
	private readonly NESTED_REPETITION_PATTERN: RegExp = /\(.*[+*].*\)[+*]/;

	/**
	 * Validates if a glob pattern is safe to use.
	 *
	 * Performs comprehensive security checks including:
	 * - Null/undefined/type validation
	 * - Empty or whitespace-only pattern rejection
	 * - Pattern length limits (≤1000 characters)
	 * - Wildcard count limits (≤20 wildcards)
	 * - Brace pair count limits (≤10 pairs)
	 * - Consecutive globstar detection (≤3 consecutive)
	 * - Nested repetition pattern detection
	 *
	 * @param pattern - The glob pattern to validate
	 * @returns `true` if the pattern is safe for use, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * validator.isGlobSafe('*.ts') // true - safe simple pattern
	 * validator.isGlobSafe('src/*.js') // true - safe path pattern
	 * validator.isGlobSafe('a'.repeat(1001)) // false - length attack
	 * validator.isGlobSafe('(a+)+b') // false - nested repetition
	 * ```
	 */
	public isGlobSafe(pattern: string | null | undefined): boolean {
		// Step 1: Handle null/undefined inputs
		if (pattern == null) {
			return false;
		}

		// Step 2: Type validation (ensure string type)
		if (typeof pattern !== "string") {
			return false;
		}

		// Step 3: Reject empty or whitespace-only patterns
		// These provide no value and could indicate injection attempts
		if (pattern.trim().length === 0) {
			return false;
		}

		// Step 4: Enforce maximum pattern length
		// Long patterns can cause processing delays or buffer issues
		if (pattern.length > this.MAX_PATTERN_LENGTH) {
			return false;
		}

		// Step 5: Count and limit wildcards
		// Excessive wildcards cause exponential matching attempts
		const wildcardCount = this.countWildcards(pattern);
		if (wildcardCount > this.MAX_WILDCARDS) {
			return false;
		}

		// Step 6: Count and limit brace pairs
		// Brace expansion creates combinatorial explosion
		const braceCount = this.countBracePairs(pattern);
		if (braceCount > this.MAX_BRACES) {
			return false;
		}

		// Step 7: Detect consecutive globstars (ReDoS attack vector)
		// Sequential globstars cause catastrophic backtracking
		if (this.hasConsecutiveGlobstars(pattern)) {
			return false;
		}

		// Step 8: Detect nested repetition patterns
		// Nested quantifiers cause exponential time complexity
		if (this.NESTED_REPETITION_PATTERN.test(pattern)) {
			return false;
		}

		// All security checks passed
		return true;
	}

	/**
	 * Sanitizes and validates a glob pattern, throwing an error if unsafe.
	 *
	 * This method performs the same validation as `isGlobSafe()` but throws
	 * an error instead of returning false, making it suitable for use in
	 * pipelines where exceptions are preferred for error handling.
	 *
	 * @param pattern - The glob pattern to sanitize and validate
	 * @returns The original pattern unchanged if validation passes
	 * @throws {Error} If the pattern fails any security validation check
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   const safe = validator.sanitizeGlobPattern('*.ts');
	 *   // Use safe pattern
	 * } catch (error) {
	 *   // Handle unsafe pattern
	 * }
	 * ```
	 */
	public sanitizeGlobPattern(pattern: string): string {
		if (!this.isGlobSafe(pattern)) {
			throw new Error(
				"Unsafe glob pattern detected: Pattern violates security constraints",
			);
		}
		return pattern;
	}

	/**
	 * Counts single wildcards (*) in a pattern, excluding globstars.
	 *
	 * This method accurately counts wildcards by:
	 * 1. Temporarily replacing globstars (double-star) with placeholders
	 * 2. Counting remaining single wildcards
	 *
	 * This prevents double-counting, as double-star would otherwise be counted as two wildcards.
	 *
	 * @param pattern - The glob pattern to analyze
	 * @returns The number of single wildcards in the pattern
	 *
	 * @example
	 * ```typescript
	 * countWildcards('*.ts') // 1 (one wildcard)
	 * countWildcards('src/*.ts') // 1 (one wildcard)
	 * ```
	 */
	private countWildcards(pattern: string): number {
		// Replace globstars with placeholders to prevent double-counting
		const withoutGlobstars = pattern.replace(/\*\*/g, "##");

		// Count remaining single wildcards
		const matches = withoutGlobstars.match(/\*/g);
		return matches ? matches.length : 0;
	}

	/**
	 * Counts opening braces in a pattern to estimate brace pair depth.
	 *
	 * This method counts opening braces as a proxy for brace pairs.
	 * While not perfect (unmatched braces), it provides effective protection
	 * against brace expansion attacks with minimal overhead.
	 *
	 * @param pattern - The glob pattern to analyze
	 * @returns The number of opening braces in the pattern
	 *
	 * @example
	 * ```typescript
	 * countBracePairs('*.{ts,js}') // 1 (one brace pair)
	 * countBracePairs('{a,{b,c}}') // 2 (two nested brace pairs)
	 * ```
	 */
	private countBracePairs(pattern: string): number {
		const matches = pattern.match(/\{/g);
		return matches ? matches.length : 0;
	}

	/**
	 * Checks if the pattern contains 4 or more consecutive globstars.
	 *
	 * This method detects ReDoS attack vectors caused by consecutive globstar
	 * patterns. Such patterns create nested backtracking in glob matching engines,
	 * leading to exponential time complexity.
	 *
	 * @param pattern - The glob pattern to check
	 * @returns `true` if pattern contains 4+ consecutive globstars, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * hasConsecutiveGlobstars('src/*.ts') // false (only 1 globstar)
	 * ```
	 */
	private hasConsecutiveGlobstars(pattern: string): boolean {
		return this.CONSECUTIVE_GLOBSTARS_PATTERN.test(pattern);
	}
}
