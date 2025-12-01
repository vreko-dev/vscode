import { describe, expect, it } from "vitest";
import { CompressionUtil } from "../../../src/storage/CompressionUtil.js";

describe("CompressionUtil", () => {
	it("should compress and decompress diffs correctly", () => {
		const diff = `
@@ -1,3 +1,3 @@
 line1
-line2
+modified line2
 line3
`.repeat(10); // Simulate larger diff

		const compressed = CompressionUtil.compress(diff);
		const decompressed = CompressionUtil.decompress(compressed);

		expect(decompressed).toBe(diff);
		expect(compressed.length).toBeLessThan(diff.length * 0.5); // At least 50% compression
	});

	it("should handle empty content", () => {
		expect(CompressionUtil.compress("")).toBeDefined();
		expect(CompressionUtil.decompress(CompressionUtil.compress(""))).toBe("");
	});
});
