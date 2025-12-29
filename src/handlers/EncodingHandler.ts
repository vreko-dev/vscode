/**
 * File Encoding Detection and Conversion Handler
 *
 * Implements J2-E13: Non-UTF8 encoding support
 *
 * Detects file encoding from BOM signatures and heuristics,
 * converts to UTF-8 for consistent processing.
 *
 * @module handlers/EncodingHandler
 */

import * as fs from "node:fs/promises";

/**
 * Encoding detection result
 */
export interface EncodingInfo {
	encoding: string;
	confidence: number;
	hasBOM: boolean;
	isUTF8: boolean;
	needsConversion: boolean;
}

/**
 * File encoding detector and converter
 *
 * Supports BOM-based detection for UTF-8/16/32 variants
 * and heuristic-based detection for legacy encodings.
 */
export class EncodingHandler {
	// Common BOM (Byte Order Mark) signatures
	private static readonly BOM_SIGNATURES: Record<string, number[]> = {
		"utf-8": [0xef, 0xbb, 0xbf],
		"utf-16-be": [0xfe, 0xff],
		"utf-16-le": [0xff, 0xfe],
		"utf-32-be": [0x00, 0x00, 0xfe, 0xff],
		"utf-32-le": [0xff, 0xfe, 0x00, 0x00],
	};

	/**
	 * Detect encoding from buffer
	 */
	detectEncoding(buffer: Buffer): EncodingInfo {
		// Check for BOM first
		const bomResult = this.detectBOM(buffer);
		if (bomResult) {
			return {
				encoding: bomResult,
				confidence: 1.0,
				hasBOM: true,
				isUTF8: bomResult === "utf-8",
				needsConversion: bomResult !== "utf-8",
			};
		}

		// Try to detect UTF-8
		if (this.isValidUTF8(buffer)) {
			return {
				encoding: "utf-8",
				confidence: 0.9,
				hasBOM: false,
				isUTF8: true,
				needsConversion: false,
			};
		}

		// Check for common encodings by heuristics
		const detectedEncoding = this.detectByHeuristics(buffer);

		return {
			encoding: detectedEncoding,
			confidence: 0.7,
			hasBOM: false,
			isUTF8: false,
			needsConversion: true,
		};
	}

	/**
	 * Detect BOM signature
	 */
	private detectBOM(buffer: Buffer): string | null {
		// Check UTF-32 first (longer signatures)
		if (
			buffer.length >= 4 &&
			buffer[0] === 0x00 &&
			buffer[1] === 0x00 &&
			buffer[2] === 0xfe &&
			buffer[3] === 0xff
		) {
			return "utf-32-be";
		}
		if (
			buffer.length >= 4 &&
			buffer[0] === 0xff &&
			buffer[1] === 0xfe &&
			buffer[2] === 0x00 &&
			buffer[3] === 0x00
		) {
			return "utf-32-le";
		}

		// Check UTF-8 BOM
		if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
			return "utf-8";
		}

		// Check UTF-16
		if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
			return "utf-16-be";
		}
		if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
			return "utf-16-le";
		}

		return null;
	}

	/**
	 * Check if buffer is valid UTF-8
	 */
	private isValidUTF8(buffer: Buffer): boolean {
		let i = 0;
		while (i < buffer.length) {
			const byte = buffer[i];

			// ASCII (0x00-0x7F)
			if (byte <= 0x7f) {
				i++;
				continue;
			}

			// Determine number of bytes in sequence
			let bytesNeeded: number;
			if ((byte & 0xe0) === 0xc0) {
				bytesNeeded = 2;
			} else if ((byte & 0xf0) === 0xe0) {
				bytesNeeded = 3;
			} else if ((byte & 0xf8) === 0xf0) {
				bytesNeeded = 4;
			} else {
				return false; // Invalid UTF-8 start byte
			}

			// Check we have enough bytes
			if (i + bytesNeeded > buffer.length) {
				return false;
			}

			// Check continuation bytes
			for (let j = 1; j < bytesNeeded; j++) {
				if ((buffer[i + j] & 0xc0) !== 0x80) {
					return false;
				}
			}

			i += bytesNeeded;
		}

		return true;
	}

	/**
	 * Detect encoding by heuristics
	 */
	private detectByHeuristics(buffer: Buffer): string {
		// Check for high byte frequency patterns
		let highByteCount = 0;
		let nullByteCount = 0;

		for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
			if (buffer[i] === 0) nullByteCount++;
			if (buffer[i] > 127) highByteCount++;
		}

		// If many null bytes, likely UTF-16
		if (nullByteCount > buffer.length * 0.1) {
			return "utf-16-le";
		}

		// If many high bytes, likely Latin-1 or Windows-1252
		if (highByteCount > buffer.length * 0.1) {
			return "windows-1252";
		}

		// Default to Latin-1 (ISO-8859-1) for unknown
		return "iso-8859-1";
	}

	/**
	 * Convert buffer to UTF-8 string
	 */
	convertToUTF8(buffer: Buffer, sourceEncoding: string): string {
		const normalizedEncoding = sourceEncoding.toLowerCase();

		// Handle UTF-16 LE manually for Node.js compatibility
		if (normalizedEncoding === "utf-16-le" || normalizedEncoding === "utf-16le") {
			let result = "";
			for (let i = 0; i < buffer.length - 1; i += 2) {
				const charCode = buffer[i] | (buffer[i + 1] << 8);
				result += String.fromCharCode(charCode);
			}
			return result;
		}

		// Handle UTF-16 BE manually
		if (normalizedEncoding === "utf-16-be" || normalizedEncoding === "utf-16be") {
			let result = "";
			for (let i = 0; i < buffer.length - 1; i += 2) {
				const charCode = (buffer[i] << 8) | buffer[i + 1];
				result += String.fromCharCode(charCode);
			}
			return result;
		}

		// For ISO-8859-1 and similar, each byte maps to Unicode codepoint
		if (normalizedEncoding === "iso-8859-1" || normalizedEncoding === "latin1") {
			let result = "";
			for (let i = 0; i < buffer.length; i++) {
				result += String.fromCharCode(buffer[i]);
			}
			return result;
		}

		// Default: try to decode as UTF-8
		return buffer.toString("utf-8");
	}

	/**
	 * Strip BOM from string if present
	 */
	stripBOM(content: string): string {
		if (content.charCodeAt(0) === 0xfeff) {
			return content.slice(1);
		}
		return content;
	}

	/**
	 * Read file with automatic encoding detection and conversion
	 */
	async readFileWithEncoding(filePath: string): Promise<{
		content: string;
		encoding: EncodingInfo;
	}> {
		const buffer = await fs.readFile(filePath);
		const encoding = this.detectEncoding(buffer);

		let content: string;
		if (encoding.needsConversion) {
			content = this.convertToUTF8(buffer, encoding.encoding);
		} else {
			content = buffer.toString("utf-8");
		}

		// Strip BOM if present
		content = this.stripBOM(content);

		return { content, encoding };
	}
}
