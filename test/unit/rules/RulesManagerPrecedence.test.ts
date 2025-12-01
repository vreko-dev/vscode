import { describe, expect, it } from "vitest";
import { validate } from "../../../src/schema/rulesBundle.schema";

describe("RulesManager Precedence Schema Tests", () => {
	it("should validate policy bundle with precedence field", () => {
		const validBundle = {
			version: "1.0.0",
			minClientVersion: "1.0.0",
			rules: [
				{
					pattern: "**/*.env",
					level: "block",
					reason: "Environment files",
					precedence: 100,
				},
				{
					pattern: "**/*.ts",
					level: "warn",
					precedence: 50,
				},
			],
			metadata: {
				timestamp: Date.now(),
				schemaVersion: "1.0",
			},
		};

		const result = validate(validBundle);
		expect(result).toBe(true);
	});

	it("should handle policy bundle without precedence field", () => {
		const bundleWithoutPrecedence = {
			version: "1.0.0",
			minClientVersion: "1.0.0",
			rules: [
				{
					pattern: "**/*.env",
					level: "block",
					reason: "Environment files",
					// No precedence field
				},
			],
			metadata: {
				timestamp: Date.now(),
				schemaVersion: "1.0",
			},
		};

		const result = validate(bundleWithoutPrecedence);
		expect(result).toBe(true);
	});

	it("should reject invalid precedence values", () => {
		const invalidBundle = {
			version: "1.0.0",
			minClientVersion: "1.0.0",
			rules: [
				{
					pattern: "**/*.env",
					level: "block",
					precedence: "invalid", // Should be a number
				},
			],
			metadata: {
				timestamp: Date.now(),
				schemaVersion: "1.0",
			},
		};

		const result = validate(invalidBundle);
		expect(result).toBe(false);
	});
});
