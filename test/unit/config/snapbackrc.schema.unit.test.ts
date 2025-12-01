import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { SNAPBACKRC_SCHEMA } from "../../../src/types/snapbackrc.types";

describe("SnapBackRC Schema Validation", () => {
	const ajv = new Ajv({ allErrors: true });
	const validate = ajv.compile(SNAPBACKRC_SCHEMA);

	it("should validate a valid .snapbackrc configuration", () => {
		const validConfig = {
			protection: [
				{
					pattern: "**/*.env*",
					level: "block",
					reason: "Environment files contain sensitive data",
				},
				{
					pattern: "package.json",
					level: "warn",
					reason: "Changes affect dependencies",
				},
			],
			ignore: ["node_modules/**", "dist/**", ".git/**"],
			settings: {
				maxSnapshots: 50,
				compressionEnabled: true,
				defaultProtectionLevel: "watch",
			},
			policies: {
				enforceProtectionLevels: true,
				minimumProtectionLevel: "warn",
			},
		};

		const valid = validate(validConfig);
		expect(valid).toBe(true);
		expect(validate.errors).toBeNull();
	});

	it("should report precise errors for invalid level values", () => {
		const invalidConfig = {
			protection: [
				{
					pattern: "**/*.env*",
					level: "invalid-level", // This should fail
				},
			],
		};

		const valid = validate(invalidConfig);
		expect(valid).toBe(false);
		expect(validate.errors).toBeDefined();
		expect(validate.errors).toHaveLength(1);
		expect(validate.errors?.[0].instancePath).toBe("/protection/0/level");
		expect(validate.errors?.[0].message).toContain(
			"must be equal to one of the allowed values",
		);
	});

	it("should report errors for missing required properties", () => {
		const invalidConfig = {
			protection: [
				{
					pattern: "**/*.env*", // Missing required 'level' property
				},
			],
		};

		const valid = validate(invalidConfig);
		expect(valid).toBe(false);
		expect(validate.errors).toBeDefined();
		expect(validate.errors).toHaveLength(1);
		expect(validate.errors?.[0].instancePath).toBe("/protection/0");
		expect(validate.errors?.[0].message).toContain(
			"must have required property 'level'",
		);
	});

	it("should reject unknown properties", () => {
		const invalidConfig = {
			unknownProperty: "this should not be allowed",
			protection: [
				{
					pattern: "**/*.env*",
					level: "block",
					invalidField: "unknown field",
				},
			],
		};

		const valid = validate(invalidConfig);
		expect(valid).toBe(false);
		expect(validate.errors).toBeDefined();
		// Should have errors for both the top-level unknown property and the rule-level unknown property
	});

	it("should validate protection level enum values correctly", () => {
		const testCases = [
			{ level: "watch", valid: true },
			{ level: "warn", valid: true },
			{ level: "block", valid: true },
			{ level: "invalid", valid: false },
			{ level: "", valid: false },
			{ level: null, valid: false },
		];

		for (const testCase of testCases) {
			const config = {
				protection: [
					{
						pattern: "**/*.test*",
						level: testCase.level,
					},
				],
			};

			const valid = validate(config);
			expect(valid).toBe(testCase.valid);

			if (!testCase.valid) {
				expect(validate.errors).toBeDefined();
				// For undefined, the error is at the object level (missing required property)
				if (testCase.level !== undefined) {
					expect(
						validate.errors?.some((err: any) =>
							err.instancePath.includes("/protection/0/level"),
						),
					).toBe(true);
				} else {
					// For undefined, check that it's a required property error
					expect(
						validate.errors?.some(
							(err: any) =>
								err.instancePath.includes("/protection/0") &&
								err.message?.includes("required property"),
						),
					).toBe(true);
				}
			}
		}

		// Special case for undefined (missing property)
		const undefinedConfig = {
			protection: [
				{
					pattern: "**/*.test*",
					// level is intentionally omitted
				},
			],
		};

		const valid = validate(undefinedConfig);
		expect(valid).toBe(false);
		expect(validate.errors).toBeDefined();
		expect(
			validate.errors?.some(
				(err: any) =>
					err.instancePath.includes("/protection/0") &&
					err.message?.includes("required property"),
			),
		).toBe(true);
	});
});
