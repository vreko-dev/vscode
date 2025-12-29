/**
 * Path Sanitizer for Special Characters
 *
 * Implements J2-E08: Special characters in filename
 *
 * Handles Windows-incompatible characters, reserved names,
 * and creates URL-safe storage keys.
 *
 * @module utils/PathSanitizer
 */

import * as path from "node:path";

/**
 * Path sanitizer for cross-platform filename safety
 *
 * Handles:
 * - Windows-incompatible characters (< > : " | ? * and control chars)
 * - Windows reserved names (CON, PRN, AUX, etc.)
 * - URL-safe storage key generation
 */
export class PathSanitizer {
	// Characters that need escaping or special handling (Windows-incompatible)
	// < > : " | ? * and control chars (0x00-0x1F)
	// Use 'g' flag for replace operations
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters needed for Windows-incompatible chars
	private static readonly PROBLEMATIC_CHARS_REPLACE = /[<>:"|?*\x00-\x1f]/g;
	// No 'g' flag for test operations (avoids lastIndex state issues)
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Control characters needed for Windows-incompatible chars
	private static readonly PROBLEMATIC_CHARS_TEST = /[<>:"|?*\x00-\x1f]/;
	private static readonly RESERVED_NAMES = [
		"CON",
		"PRN",
		"AUX",
		"NUL",
		"COM1",
		"COM2",
		"COM3",
		"COM4",
		"LPT1",
		"LPT2",
		"LPT3",
		"LPT4",
	];

	/**
	 * Check if path has problematic characters
	 */
	hasProblematicChars(filePath: string): boolean {
		const filename = path.basename(filePath);
		return PathSanitizer.PROBLEMATIC_CHARS_TEST.test(filename);
	}

	/**
	 * Check if filename is Windows reserved name
	 */
	isReservedName(filePath: string): boolean {
		const filename = path.basename(filePath, path.extname(filePath)).toUpperCase();
		return PathSanitizer.RESERVED_NAMES.includes(filename);
	}

	/**
	 * Sanitize path for safe storage
	 */
	sanitize(filePath: string): string {
		const dirname = path.dirname(filePath);
		let filename = path.basename(filePath);

		// Replace problematic characters with underscores
		filename = filename.replace(PathSanitizer.PROBLEMATIC_CHARS_REPLACE, "_");

		// Handle reserved names by adding suffix
		const ext = path.extname(filename);
		const base = path.basename(filename, ext);
		if (PathSanitizer.RESERVED_NAMES.includes(base.toUpperCase())) {
			filename = `${base}_file${ext}`;
		}

		return path.join(dirname, filename);
	}

	/**
	 * Create storage key from path (URL-safe)
	 */
	createStorageKey(filePath: string): string {
		return Buffer.from(filePath).toString("base64url");
	}

	/**
	 * Decode storage key back to path
	 */
	decodeStorageKey(key: string): string {
		return Buffer.from(key, "base64url").toString("utf-8");
	}
}
