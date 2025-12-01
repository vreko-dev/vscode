import { describe, expect, it } from "vitest";
import type {
	FileHealthLevel,
	FileHealthStatus,
} from "../../../src/decorations/types.js";

describe("FileHealth Types", () => {
	describe("FileHealthLevel", () => {
		it("should accept 'protected' as a valid level", () => {
			const level: FileHealthLevel = "protected";
			expect(level).toBe("protected");
		});

		it("should accept 'warning' as a valid level", () => {
			const level: FileHealthLevel = "warning";
			expect(level).toBe("warning");
		});

		it("should accept 'risk' as a valid level", () => {
			const level: FileHealthLevel = "risk";
			expect(level).toBe("risk");
		});
	});

	describe("FileHealthStatus", () => {
		it("should create a valid FileHealthStatus object", () => {
			const status: FileHealthStatus = {
				uri: "/test/file.ts",
				level: "protected",
				protectionLevel: "watch",
				lastUpdated: new Date(),
			};

			expect(status.uri).toBe("/test/file.ts");
			expect(status.level).toBe("protected");
			expect(status.protectionLevel).toBe("watch");
			expect(status.lastUpdated).toBeInstanceOf(Date);
		});

		it("should allow optional protectionLevel", () => {
			const status: FileHealthStatus = {
				uri: "/test/file.ts",
				level: "warning",
				lastUpdated: new Date(),
			};

			expect(status.protectionLevel).toBeUndefined();
		});

		it("should support all health levels", () => {
			const levels: FileHealthLevel[] = ["protected", "warning", "risk"];

			for (const level of levels) {
				const status: FileHealthStatus = {
					uri: "/test/file.ts",
					level,
					lastUpdated: new Date(),
				};
				expect(status.level).toBe(level);
			}
		});

		it("should support all protection levels", () => {
			const protectionLevels = ["watch", "warn", "block"] as const;

			for (const protectionLevel of protectionLevels) {
				const status: FileHealthStatus = {
					uri: "/test/file.ts",
					level: "protected",
					protectionLevel,
					lastUpdated: new Date(),
				};
				expect(status.protectionLevel).toBe(protectionLevel);
			}
		});
	});
});
