import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import * as StreamingCompressionUtil from "../../../src/storage/StreamingCompressionUtil.js";

describe("StreamingCompressionUtil", () => {
	describe("compress", () => {
		it("should compress a simple string", async () => {
			const input = "Hello, World!";
			const compressed = await StreamingCompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
			// Decompressing should yield the original content
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);
			expect(decompressed).toBe(input);
		});

		it("should compress a large string effectively", async () => {
			const input = "A".repeat(1000);
			const compressed = await StreamingCompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
			// Compressed data should be significantly smaller
			expect(compressed.length).toBeLessThan(Buffer.byteLength(input, "utf-8"));
		});

		it("should compress an empty string", async () => {
			const input = "";
			const compressed = await StreamingCompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
			// Even empty string should produce some compressed data (gzip headers)
			expect(compressed.length).toBeGreaterThan(0);
		});

		it("should compress a string with special characters", async () => {
			const input = "Hello, 世界! 🌍\n\t\r\0";
			const compressed = await StreamingCompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
		});

		it("should compress a string with repeated patterns", async () => {
			const input = "ABC ".repeat(200);
			const compressed = await StreamingCompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
			// Highly repetitive content should compress very well
			expect(compressed.length).toBeLessThan(
				Buffer.byteLength(input, "utf-8") / 2,
			);
		});
	});

	describe("decompress", () => {
		it("should decompress a simple string correctly", async () => {
			const input = "Hello, World!";
			const compressed = await StreamingCompressionUtil.compress(input);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});

		it("should decompress a large string correctly", async () => {
			const input = "A".repeat(10000);
			const compressed = await StreamingCompressionUtil.compress(input);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});

		it("should decompress an empty string correctly", async () => {
			const input = "";
			const compressed = await StreamingCompressionUtil.compress(input);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});

		it("should decompress a string with unicode characters correctly", async () => {
			const input = "Hello, 世界! 🌍🚀🎉";
			const compressed = await StreamingCompressionUtil.compress(input);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});

		it("should decompress a string with special characters correctly", async () => {
			const input = "Line 1\nLine 2\tTab\r\nNew line\0Null character";
			const compressed = await StreamingCompressionUtil.compress(input);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});
	});

	describe("compress and decompress integration", () => {
		it("should maintain data integrity through compression/decompression cycle", async () => {
			const testStrings = [
				"Simple text",
				"",
				"A".repeat(100),
				"Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?",
				"Unicode: 你好世界 🌏🌍🌎",
				JSON.stringify({ key: "value", number: 42, array: [1, 2, 3] }),
				"Mixed content with\nnewlines\ttabs and 世界 unicode",
			];

			for (const testString of testStrings) {
				const compressed = await StreamingCompressionUtil.compress(testString);
				const decompressed =
					await StreamingCompressionUtil.decompress(compressed);
				expect(decompressed).toBe(testString);
			}
		});

		it("should handle very large content", async () => {
			const largeContent = "This is a test string. ".repeat(10000);
			const compressed = await StreamingCompressionUtil.compress(largeContent);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(largeContent);
			// Compression should be effective for large repetitive content
			expect(compressed.length).toBeLessThan(largeContent.length / 10);
		});

		it("should handle JSON content correctly", async () => {
			const jsonObject = {
				name: "Test Object",
				value: 42,
				nested: {
					array: [1, 2, 3, "test"],
					boolean: true,
					nullValue: null,
				},
			};

			const jsonString = JSON.stringify(jsonObject);
			const compressed = await StreamingCompressionUtil.compress(jsonString);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);
			const parsed = JSON.parse(decompressed);

			expect(parsed).toEqual(jsonObject);
		});
	});

	describe("createCompressionStream", () => {
		it("should create a compression stream", () => {
			const stream = StreamingCompressionUtil.createCompressionStream();

			expect(stream).toBeDefined();
			expect(typeof stream.write).toBe("function");
			expect(typeof stream.read).toBe("function");
		});

		it("should compress data through the stream", async () => {
			const stream = StreamingCompressionUtil.createCompressionStream();
			const chunks: Buffer[] = [];

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

			const readable = Readable.from([Buffer.from("Hello, World!", "utf-8")]);

			await pipeline(readable, stream, writable);

			const result = Buffer.concat(chunks);
			expect(result).toBeInstanceOf(Buffer);
			expect(result.length).toBeGreaterThan(0);
		});
	});

	describe("createDecompressionStream", () => {
		it("should create a decompression stream", () => {
			const stream = StreamingCompressionUtil.createDecompressionStream();

			expect(stream).toBeDefined();
			expect(typeof stream.write).toBe("function");
			expect(typeof stream.read).toBe("function");
		});

		it("should decompress data through the stream", async () => {
			// First compress some data
			const originalData = "Hello, World!";
			const compressed = await StreamingCompressionUtil.compress(originalData);

			// Then decompress using the stream
			const stream = StreamingCompressionUtil.createDecompressionStream();
			const chunks: Buffer[] = [];

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

			const readable = Readable.from([compressed]);

			await pipeline(readable, stream, writable);

			const result = Buffer.concat(chunks).toString("utf-8");
			expect(result).toBe(originalData);
		});
	});

	describe("streaming integration", () => {
		it("should compress and decompress through streams", async () => {
			const testData = "Test data for streaming compression";
			const compressionStream =
				StreamingCompressionUtil.createCompressionStream();
			const decompressionStream =
				StreamingCompressionUtil.createDecompressionStream();
			const chunks: Buffer[] = [];

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

			const readable = Readable.from([Buffer.from(testData, "utf-8")]);

			await pipeline(
				readable,
				compressionStream,
				decompressionStream,
				writable,
			);

			const result = Buffer.concat(chunks).toString("utf-8");
			expect(result).toBe(testData);
		});

		it("should handle empty data through streams", async () => {
			const testData = "";
			const compressionStream =
				StreamingCompressionUtil.createCompressionStream();
			const decompressionStream =
				StreamingCompressionUtil.createDecompressionStream();
			const chunks: Buffer[] = [];

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

			const readable = Readable.from([Buffer.from(testData, "utf-8")]);

			await pipeline(
				readable,
				compressionStream,
				decompressionStream,
				writable,
			);

			const result = Buffer.concat(chunks).toString("utf-8");
			expect(result).toBe(testData);
		});
	});

	describe("edge cases", () => {
		it("should handle binary-like content", async () => {
			// Create a string that looks like binary data
			let binaryLike = "";
			for (let i = 0; i < 256; i++) {
				binaryLike += String.fromCharCode(i % 256);
			}

			const compressed = await StreamingCompressionUtil.compress(binaryLike);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(binaryLike);
		});

		it("should handle content with many repeated characters", async () => {
			const content = "0".repeat(5000) + "1".repeat(5000);
			const compressed = await StreamingCompressionUtil.compress(content);
			const decompressed =
				await StreamingCompressionUtil.decompress(compressed);

			expect(decompressed).toBe(content);
			// This should compress extremely well
			expect(compressed.length).toBeLessThan(100);
		});
	});
});
