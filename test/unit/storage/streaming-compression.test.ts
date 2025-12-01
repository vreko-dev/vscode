import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import * as StreamingCompressionUtil from "../../../src/storage/StreamingCompressionUtil.js";

describe("StreamingCompressionUtil", () => {
	describe("compress", () => {
		it("should compress small content correctly", async () => {
			const content = "Hello World";
			const compressed = await StreamingCompressionUtil.compress(content);
			expect(compressed).toBeInstanceOf(Buffer);
			expect(compressed.length).toBeGreaterThan(0);
		});

		it("should compress large content correctly", async () => {
			const content = "A".repeat(10000);
			const compressed = await StreamingCompressionUtil.compress(content);
			expect(compressed).toBeInstanceOf(Buffer);
			expect(compressed.length).toBeGreaterThan(0);
		});

		it("should produce same result as regular compression for small content", async () => {
			const content = "Hello World\nThis is a test file with some content\n";
			const compressed = await StreamingCompressionUtil.compress(content);

			// Compare with regular compression
			const regularCompressed = require("node:zlib").gzipSync(
				Buffer.from(content, "utf-8"),
				{ level: 9 },
			);
			expect(compressed.length).toBeCloseTo(regularCompressed.length, -1); // Allow some variance
		});
	});

	describe("decompress", () => {
		it("should decompress compressed content correctly", async () => {
			const original = "Hello World\nThis is a test file\n";
			const compressed = await StreamingCompressionUtil.compress(original);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(original);
		});

		it("should decompress large compressed content correctly", async () => {
			const original = "A".repeat(10000);
			const compressed = await StreamingCompressionUtil.compress(original);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(original);
		});
	});

	describe("Streaming Operations", () => {
		it("should work with transform streams", async () => {
			const content = "Hello World\nThis is streaming test content\n";
			const chunks: Buffer[] = [];

			// Create streams
			const compressionStream =
				StreamingCompressionUtil.createCompressionStream();
			const decompressionStream =
				StreamingCompressionUtil.createDecompressionStream();

			// Collect output
			const writable = new Writable({
				write(
					chunk: Buffer,
					_encoding: string,
					callback: (error?: Error | null) => void,
				) {
					chunks.push(chunk);
					callback();
				},
			});

			// Create input stream
			const readable = Readable.from([Buffer.from(content, "utf-8")]);

			// Pipeline: readable -> compress -> decompress -> writable
			await pipeline(
				readable,
				compressionStream,
				decompressionStream,
				writable,
			);

			const result = Buffer.concat(chunks).toString("utf-8");
			expect(result).toBe(content);
		});

		it("should handle multiple chunks correctly", async () => {
			const contentParts = [
				"Hello World\n",
				"This is part 2\n",
				"This is part 3\n",
			];
			const fullContent = contentParts.join("");
			const chunks: Buffer[] = [];

			// Create streams
			const compressionStream =
				StreamingCompressionUtil.createCompressionStream();
			const decompressionStream =
				StreamingCompressionUtil.createDecompressionStream();

			// Collect output
			const writable = new Writable({
				write(
					chunk: Buffer,
					_encoding: string,
					callback: (error?: Error | null) => void,
				) {
					chunks.push(chunk);
					callback();
				},
			});

			// Create input stream with multiple chunks
			const readable = Readable.from(
				contentParts.map((part) => Buffer.from(part, "utf-8")),
			);

			// Pipeline: readable -> compress -> decompress -> writable
			await pipeline(
				readable,
				compressionStream,
				decompressionStream,
				writable,
			);

			const result = Buffer.concat(chunks).toString("utf-8");
			expect(result).toBe(fullContent);
		});
	});

	describe("Performance", () => {
		it("should handle very large content without memory issues", async () => {
			// Create moderately large content (100KB)
			const content = "A".repeat(100000);
			const compressed = await StreamingCompressionUtil.compress(content);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(content);
			expect(compressed.length).toBeLessThan(content.length);
		});
	});
});
