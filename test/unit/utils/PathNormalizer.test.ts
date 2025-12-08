import { describe, expect, it } from "vitest";
import {
	areEqual,
	getDepth,
	isWithin,
	normalize,
} from "@vscode/utils/PathNormalizer";

describe("PathNormalizer", () => {
	describe("normalize", () => {
		it("should convert backslashes to forward slashes", () => {
			expect(normalize("C:\\Users\\test\\project")).toBe(
				"C:/Users/test/project",
			);
		});

		it("should remove trailing slashes", () => {
			expect(normalize("/home/user/project/")).toBe("/home/user/project");

			expect(normalize("C:\\Users\\test\\")).toBe("C:/Users/test");
		});

		it("should handle paths with multiple trailing slashes", () => {
			expect(normalize("/home/user/project///")).toBe("/home/user/project");
		});

		it("should handle already normalized paths", () => {
			expect(normalize("/home/user/project")).toBe("/home/user/project");
		});

		it("should handle root paths", () => {
			expect(normalize("/")).toBe("/"); // Unix root preserved
			expect(normalize("C:\\")).toBe("C:");
		});
	});

	describe("isWithin", () => {
		it("should return true for child path within parent", () => {
			expect(
				isWithin("/home/user/project/src/index.ts", "/home/user/project"),
			).toBe(true);
		});

		it("should return false for path outside parent", () => {
			expect(isWithin("/external/file.ts", "/home/user/project")).toBe(false);
		});

		it("should return true for exact path match", () => {
			expect(isWithin("/home/user/project", "/home/user/project")).toBe(true);
		});

		it("should handle Windows paths", () => {
			expect(
				isWithin(
					"C:\\Users\\test\\project\\src\\index.ts",
					"C:\\Users\\test\\project",
				),
			).toBe(true);
		});

		it("should handle mixed separators", () => {
			expect(
				isWithin(
					"C:\\Users\\test/project\\src/index.ts",
					"C:/Users/test/project",
				),
			).toBe(true);
		});

		it("should not match partial directory names", () => {
			// '/home/user/project2' should NOT match parent '/home/user/project'
			expect(
				isWithin("/home/user/project2/file.ts", "/home/user/project"),
			).toBe(false);
		});

		it("should handle trailing slashes correctly", () => {
			expect(
				isWithin("/home/user/project/src/index.ts", "/home/user/project/"),
			).toBe(true);
		});
	});

	describe("getDepth", () => {
		it("should calculate depth for Unix paths", () => {
			expect(getDepth("/home/user/project")).toBe(4); // / + home + user + project
			expect(getDepth("/home")).toBe(2); // / + home
			expect(getDepth("/home/user/project/src/deep")).toBe(6); // / + 5 segments
		});

		it("should calculate depth for Windows paths", () => {
			expect(getDepth("C:\\Users\\test")).toBe(3); // C: + Users + test
			expect(getDepth("C:\\Users\\test\\project\\src")).toBe(5); // C: + 4 segments
		});

		it("should handle root paths", () => {
			expect(getDepth("/")).toBe(1); // Unix root is depth 1
			expect(getDepth("C:\\")).toBe(1); // C: counts as one level
		});

		it("should handle trailing slashes", () => {
			expect(getDepth("/home/user/project/")).toBe(4); // Same as without trailing slash
		});
	});

	describe("areEqual", () => {
		it("should return true for identical paths", () => {
			expect(areEqual("/home/user/project", "/home/user/project")).toBe(true);
		});

		it("should be case-insensitive on Windows", () => {
			expect(areEqual("C:\\Users\\Test", "c:\\users\\test")).toBe(true);
		});

		it("should be case-sensitive on Unix", () => {
			expect(areEqual("/home/USER/project", "/home/user/project")).toBe(false);
			expect(areEqual("/home/user/project", "/home/user/project")).toBe(true);
		});

		it("should ignore trailing slashes", () => {
			expect(areEqual("/home/user/project/", "/home/user/project")).toBe(true);
		});

		it("should handle mixed separators", () => {
			expect(
				areEqual("C:\\Users\\test\\project", "C:/Users/test/project"),
			).toBe(true);
		});

		it("should return false for different paths", () => {
			expect(areEqual("/home/user/project1", "/home/user/project2")).toBe(
				false,
			);
		});
	});
});
