import { describe, expect, it } from "vitest";
import { DEFAULT_SNAPBACKRC } from "../../../src/config/defaults.js";

describe("Defaults Configuration", () => {
	it("should block sensitive files like environment files and lockfiles", () => {
		const blockRules =
			DEFAULT_SNAPBACKRC.protection?.filter((rule) => rule.level === "block") ||
			[];

		expect(blockRules).toHaveLength(5);

		const envRule = blockRules.find((rule) => rule.pattern === "**/.env*");
		expect(envRule).toBeDefined();
		expect(envRule?.reason).toContain("sensitive");

		const lockfileRules = blockRules.filter(
			(rule) => rule.pattern.includes("lock") || rule.pattern.includes("yarn"),
		);
		expect(lockfileRules).toHaveLength(3);
		expect(
			lockfileRules.every((rule) => rule.reason?.includes("Lock files")),
		).toBe(true);
	});

	it("should warn on important configuration files", () => {
		const warnRules =
			DEFAULT_SNAPBACKRC.protection?.filter((rule) => rule.level === "warn") ||
			[];

		expect(warnRules).toHaveLength(5);

		console.log(
			"Warn rules:",
			warnRules.map((r) => r.pattern),
		);

		const packageJsonRule = warnRules.find(
			(rule) => rule.pattern === "**/package.json",
		);
		expect(packageJsonRule).toBeDefined();
		expect(packageJsonRule?.reason).toContain("dependencies");

		const ciRules = warnRules.filter(
			(rule) =>
				rule.pattern.includes("github/workflows") ||
				rule.pattern.includes("Dockerfile"),
		);
		expect(ciRules).toHaveLength(2);
	});

	it("should watch auxiliary files passively", () => {
		const watchRules =
			DEFAULT_SNAPBACKRC.protection?.filter((rule) => rule.level === "watch") ||
			[];

		expect(watchRules).toHaveLength(4);

		const docRules = watchRules.filter(
			(rule) => rule.pattern.includes(".md") || rule.pattern.includes(".txt"),
		);
		expect(docRules).toHaveLength(2);

		const ideRules = watchRules.filter(
			(rule) =>
				rule.pattern.includes(".vscode") || rule.pattern.includes(".idea"),
		);
		expect(ideRules).toHaveLength(2);
	});

	it("should have standard ignore patterns for common directories and files", () => {
		const ignorePatterns = DEFAULT_SNAPBACKRC.ignore || [];

		expect(ignorePatterns).toContain("node_modules/**");
		expect(ignorePatterns).toContain(".git/**");
		expect(ignorePatterns).toContain("dist/**");
		expect(ignorePatterns).toContain("build/**");
		expect(ignorePatterns).toContain("coverage/**");
		expect(ignorePatterns).toContain("*.log");
		expect(ignorePatterns).toContain(".snapback/**");

		// Should not have duplicates
		const uniquePatterns = [...new Set(ignorePatterns)];
		expect(ignorePatterns).toHaveLength(uniquePatterns.length);
	});

	it("should have reasonable default settings", () => {
		const settings = DEFAULT_SNAPBACKRC.settings;

		expect(settings).toBeDefined();
		expect(settings?.maxSnapshots).toBe(100);
		expect(settings?.compressionEnabled).toBe(true);
		expect(settings?.defaultProtectionLevel).toBe("watch");
	});

	it("should not have duplicate protection patterns", () => {
		const protectionRules = DEFAULT_SNAPBACKRC.protection || [];
		const patterns = protectionRules.map((rule) => rule.pattern);
		const uniquePatterns = [...new Set(patterns)];
		expect(patterns).toHaveLength(uniquePatterns.length);
	});
});
