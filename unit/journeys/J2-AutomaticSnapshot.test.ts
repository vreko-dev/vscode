/**
 * J2 Automatic Snapshot Creation Journey Tests
 *
 * Spec Reference: unified_ux_spec_UPDATED.md §3.3
 *
 * Edge Cases Covered:
 *   - J2-E13: Non-UTF8 encoding (Gap → Implementing)
 *   - J2-E04: File >10MB (Partial)
 *   - J2-E07: Symbolic link saved (Partial)
 *   - J2-E08: Special characters in filename (Partial)
 *
 * TDD Approach: RED → GREEN → REFACTOR
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import { EncodingHandler, type EncodingInfo } from "../../../src/handlers/EncodingHandler";
import { LargeFileHandler, type FileSizeCheck } from "../../../src/handlers/LargeFileHandler";
import { PathSanitizer } from "../../../src/utils/PathSanitizer";

// Mock fs/promises module
vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	stat: vi.fn(),
}));

// Import after mock
import * as fs from "node:fs/promises";

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {
		fs: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			stat: vi.fn(),
		},
	},
	Uri: {
		file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("J2 Automatic Snapshot Creation Journey", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("J2-E13: Non-UTF8 encoding detection and conversion", () => {
		let encodingHandler: EncodingHandler;

		beforeEach(() => {
			encodingHandler = new EncodingHandler();
		});

		it("should detect UTF-8 BOM", () => {
			const buffer = Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);

			const result = encodingHandler.detectEncoding(buffer);

			expect(result.encoding).toBe("utf-8");
			expect(result.hasBOM).toBe(true);
			expect(result.isUTF8).toBe(true);
			expect(result.needsConversion).toBe(false);
			expect(result.confidence).toBe(1.0);
		});

		it("should detect UTF-16 LE BOM", () => {
			const buffer = Buffer.from([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);

			const result = encodingHandler.detectEncoding(buffer);

			expect(result.encoding).toBe("utf-16-le");
			expect(result.hasBOM).toBe(true);
			expect(result.isUTF8).toBe(false);
			expect(result.needsConversion).toBe(true);
		});

		it("should detect UTF-16 BE BOM", () => {
			const buffer = Buffer.from([0xfe, 0xff, 0x00, 0x48, 0x00, 0x69]);

			const result = encodingHandler.detectEncoding(buffer);

			expect(result.encoding).toBe("utf-16-be");
			expect(result.hasBOM).toBe(true);
			expect(result.needsConversion).toBe(true);
		});

		it("should detect valid UTF-8 without BOM", () => {
			const buffer = Buffer.from("Hello, 世界!");

			const result = encodingHandler.detectEncoding(buffer);

			expect(result.encoding).toBe("utf-8");
			expect(result.hasBOM).toBe(false);
			expect(result.isUTF8).toBe(true);
			expect(result.needsConversion).toBe(false);
		});

		it("should detect invalid UTF-8 as different encoding", () => {
			// Invalid UTF-8 sequence (ISO-8859-1 encoded "café")
			const buffer = Buffer.from([0x63, 0x61, 0x66, 0xe9]);

			const result = encodingHandler.detectEncoding(buffer);

			expect(result.isUTF8).toBe(false);
			expect(result.needsConversion).toBe(true);
		});

		it("should convert UTF-16 LE to UTF-8", () => {
			// "Hi" in UTF-16 LE
			const buffer = Buffer.from([0x48, 0x00, 0x69, 0x00]);

			const result = encodingHandler.convertToUTF8(buffer, "utf-16-le");

			expect(result).toBe("Hi");
		});

		it("should convert ISO-8859-1 to UTF-8", () => {
			// "café" in ISO-8859-1
			const buffer = Buffer.from([0x63, 0x61, 0x66, 0xe9]);

			const result = encodingHandler.convertToUTF8(buffer, "iso-8859-1");

			expect(result).toBe("café");
		});

		it("should strip BOM from string", () => {
			const withBOM = "\ufeffHello";

			const result = encodingHandler.stripBOM(withBOM);

			expect(result).toBe("Hello");
		});

		it("should not modify string without BOM", () => {
			const noBOM = "Hello";

			const result = encodingHandler.stripBOM(noBOM);

			expect(result).toBe("Hello");
		});
	});

	describe("J2-E04: Large file handling (>10MB)", () => {
		let largeFileHandler: LargeFileHandler;

		beforeEach(() => {
			largeFileHandler = new LargeFileHandler();
		});

		it("should allow small files without confirmation", async () => {
			vi.mocked(fs.stat).mockResolvedValueOnce({
				size: 1024 * 1024, // 1MB
			} as never);

			const result = await largeFileHandler.checkFileSize("/test/file.ts");

			expect(result.allowed).toBe(true);
			expect(result.requiresConfirmation).toBe(false);
		});

		it("should warn for moderately large files (5MB+)", async () => {
			vi.mocked(fs.stat).mockResolvedValueOnce({
				size: 6 * 1024 * 1024, // 6MB
			} as never);

			const result = await largeFileHandler.checkFileSize("/test/file.ts");

			expect(result.allowed).toBe(true);
			expect(result.requiresConfirmation).toBe(false);
			expect(result.message).toContain("moderately large");
		});

		it("should require confirmation for large files (10MB+)", async () => {
			vi.mocked(fs.stat).mockResolvedValueOnce({
				size: 12 * 1024 * 1024, // 12MB
			} as never);

			const result = await largeFileHandler.checkFileSize("/test/file.ts");

			expect(result.allowed).toBe(true);
			expect(result.requiresConfirmation).toBe(true);
			expect(result.message).toContain("large");
		});

		it("should refuse files over absolute limit (50MB+)", async () => {
			vi.mocked(fs.stat).mockResolvedValueOnce({
				size: 60 * 1024 * 1024, // 60MB
			} as never);

			const result = await largeFileHandler.checkFileSize("/test/file.ts");

			expect(result.allowed).toBe(false);
			expect(result.message).toContain("too large");
		});

		it("should format sizes correctly", () => {
			expect(largeFileHandler.formatSize(500)).toBe("500 B");
			expect(largeFileHandler.formatSize(1536)).toBe("1.5 KB");
			expect(largeFileHandler.formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
			expect(largeFileHandler.formatSize(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
		});
	});

	describe("J2-E08: Special characters in filename", () => {
		let pathSanitizer: PathSanitizer;

		beforeEach(() => {
			pathSanitizer = new PathSanitizer();
		});

		it("should detect problematic characters", () => {
			// Characters that are problematic across platforms
			expect(pathSanitizer.hasProblematicChars("/path/file<name>.ts")).toBe(true);
			expect(pathSanitizer.hasProblematicChars("/path/file|name.ts")).toBe(true);
			expect(pathSanitizer.hasProblematicChars("/path/file?name.ts")).toBe(true);
			expect(pathSanitizer.hasProblematicChars('/path/file"name.ts')).toBe(true);
			expect(pathSanitizer.hasProblematicChars("/path/file*name.ts")).toBe(true);
			// Normal file should pass
			expect(pathSanitizer.hasProblematicChars("/path/normal-file.ts")).toBe(false);
			expect(pathSanitizer.hasProblematicChars("/path/file_name.ts")).toBe(false);
		});

		it("should detect Windows reserved names", () => {
			expect(pathSanitizer.isReservedName("/path/CON.txt")).toBe(true);
			expect(pathSanitizer.isReservedName("/path/con.txt")).toBe(true);
			expect(pathSanitizer.isReservedName("/path/NUL.txt")).toBe(true);
			expect(pathSanitizer.isReservedName("/path/COM1.txt")).toBe(true);
			expect(pathSanitizer.isReservedName("/path/normal.txt")).toBe(false);
		});

		it("should sanitize problematic characters", () => {
			const sanitized = pathSanitizer.sanitize("/path/file<name>.ts");

			expect(sanitized).toBe("/path/file_name_.ts");
		});

		it("should sanitize Windows reserved names", () => {
			const sanitized = pathSanitizer.sanitize("/path/CON.txt");

			expect(sanitized).toBe("/path/CON_file.txt");
		});

		it("should create URL-safe storage keys", () => {
			const filePath = "/path/to/file with spaces.ts";
			const key = pathSanitizer.createStorageKey(filePath);

			// Should be URL-safe (no +, /, =)
			expect(key).not.toContain("+");
			expect(key).not.toContain("/");

			// Should be reversible
			const decoded = pathSanitizer.decodeStorageKey(key);
			expect(decoded).toBe(filePath);
		});
	});
});
