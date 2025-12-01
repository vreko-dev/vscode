import { describe, expect, it } from "vitest";
import { CompressionUtil } from "../../../src/storage/CompressionUtil.js";

describe("CompressionUtil", () => {
	describe("compress", () => {
		it("should compress a simple string", () => {
			const input = "Hello, World!";
			const compressed = CompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
			// Compressed data should be smaller or equal in size
			expect(compressed.length).toBeLessThanOrEqual(
				Buffer.byteLength(input, "utf-8"),
			);
		});

		it("should compress a large string effectively", () => {
			const input = "A".repeat(1000);
			const compressed = CompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
			// Compressed data should be significantly smaller
			expect(compressed.length).toBeLessThan(Buffer.byteLength(input, "utf-8"));
		});

		it("should compress an empty string", () => {
			const input = "";
			const compressed = CompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
			// Even empty string should produce some compressed data (gzip headers)
			expect(compressed.length).toBeGreaterThan(0);
		});

		it("should compress a string with special characters", () => {
			const input = "Hello, 世界! 🌍\n\t\r\0";
			const compressed = CompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
		});

		it("should compress a string with repeated patterns", () => {
			const input = "ABC ABC ABC ABC ABC ABC ABC ABC ABC ABC ";
			const compressed = CompressionUtil.compress(input);

			expect(compressed).toBeInstanceOf(Buffer);
			// Highly repetitive content should compress very well
			expect(compressed.length).toBeLessThan(
				Buffer.byteLength(input, "utf-8") / 2,
			);
		});
	});

	describe("decompress", () => {
		it("should decompress a simple string correctly", () => {
			const input = "Hello, World!";
			const compressed = CompressionUtil.compress(input);
			const decompressed = CompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});

		it("should decompress a large string correctly", () => {
			const input = "A".repeat(10000);
			const compressed = CompressionUtil.compress(input);
			const decompressed = CompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});

		it("should decompress an empty string correctly", () => {
			const input = "";
			const compressed = CompressionUtil.compress(input);
			const decompressed = CompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});

		it("should decompress a string with unicode characters correctly", () => {
			const input = "Hello, 世界! 🌍🚀🎉";
			const compressed = CompressionUtil.compress(input);
			const decompressed = CompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});

		it("should decompress a string with special characters correctly", () => {
			const input = "Line 1\nLine 2\tTab\r\nNew line\0Null character";
			const compressed = CompressionUtil.compress(input);
			const decompressed = CompressionUtil.decompress(compressed);

			expect(decompressed).toBe(input);
		});
	});

	describe("compress and decompress integration", () => {
		it("should maintain data integrity through compression/decompression cycle", () => {
			const testStrings = [
				"Simple text",
				"",
				"A".repeat(100),
				"Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?",
				"Unicode: 你好世界 🌏🌍🌎",
				JSON.stringify({ key: "value", number: 42, array: [1, 2, 3] }),
				"Mixed content with\nnewlines\ttabs and 世界 unicode",
			];

			testStrings.forEach((testString) => {
				const compressed = CompressionUtil.compress(testString);
				const decompressed = CompressionUtil.decompress(compressed);
				expect(decompressed).toBe(testString);
			});
		});

		it("should handle very large content", () => {
			const largeContent = "This is a test string. ".repeat(10000);
			const compressed = CompressionUtil.compress(largeContent);
			const decompressed = CompressionUtil.decompress(compressed);

			expect(decompressed).toBe(largeContent);
			// Compression should be effective for large repetitive content
			expect(compressed.length).toBeLessThan(largeContent.length / 10);
		});

		it("should handle JSON content correctly", () => {
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
			const compressed = CompressionUtil.compress(jsonString);
			const decompressed = CompressionUtil.decompress(compressed);
			const parsed = JSON.parse(decompressed);

			expect(parsed).toEqual(jsonObject);
		});
	});

	describe("edge cases", () => {
		it("should handle binary-like content", () => {
			// Create a string that looks like binary data
			let binaryLike = "";
			for (let i = 0; i < 256; i++) {
				binaryLike += String.fromCharCode(i % 256);
			}

			const compressed = CompressionUtil.compress(binaryLike);
			const decompressed = CompressionUtil.decompress(compressed);

			expect(decompressed).toBe(binaryLike);
		});

		it("should handle content with many repeated characters", () => {
			const content = "0".repeat(5000) + "1".repeat(5000);
			const compressed = CompressionUtil.compress(content);
			const decompressed = CompressionUtil.decompress(compressed);

			expect(decompressed).toBe(content);
			// This should compress extremely well
			expect(compressed.length).toBeLessThan(100);
		});
	});
});
