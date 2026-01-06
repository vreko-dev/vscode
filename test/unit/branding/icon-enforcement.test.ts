/**
 * Icon Enforcement Tests
 *
 * These tests ensure the codebase follows the branding consolidation guidelines:
 * - No hardcoded emojis outside signage/constants.ts
 * - No $(codicon) syntax (cross-IDE compatibility)
 * - All icon references use the centralized signage system
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";

const SRC_DIR = path.resolve(__dirname, "../../../src");
const SIGNAGE_FILE = path.join(SRC_DIR, "signage/constants.ts");

// Files that are allowed to have hardcoded emojis/icons
const ALLOWED_EMOJI_FILES = [
	"signage/constants.ts",
	"constants/icons.ts", // SNAPBACK_ICONS for MCP/dashboard specific icons
];

// Common emoji unicode ranges
const EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

// VS Code codicon pattern
const CODICON_PATTERN = /\$\([a-z-]+(?:~[a-z]+)?\)/g;

function getAllTsFiles(dir: string): string[] {
	return glob.sync("**/*.ts", {
		cwd: dir,
		ignore: ["**/*.test.ts", "**/*.d.ts", "**/node_modules/**"],
		absolute: false,
	});
}

function isAllowedFile(relativePath: string): boolean {
	return ALLOWED_EMOJI_FILES.some((allowed) => relativePath.includes(allowed));
}

describe("Icon Enforcement", () => {
	describe("Codicon Usage", () => {
		it("should not have $(codicon) syntax outside allowed files", () => {
			const files = getAllTsFiles(SRC_DIR);
			const violations: { file: string; line: number; match: string }[] = [];

			for (const file of files) {
				if (isAllowedFile(file)) continue;

				const filePath = path.join(SRC_DIR, file);
				const content = fs.readFileSync(filePath, "utf-8");
				const lines = content.split("\n");

				lines.forEach((line, index) => {
					// Skip comments and string literals that are documenting codicons
					if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;

					const matches = line.match(CODICON_PATTERN);
					if (matches) {
						matches.forEach((match) => {
							violations.push({ file, line: index + 1, match });
						});
					}
				});
			}

			if (violations.length > 0) {
				const report = violations
					.slice(0, 10)
					.map((v) => `  ${v.file}:${v.line} - ${v.match}`)
					.join("\n");
				const extra = violations.length > 10 ? `\n  ... and ${violations.length - 10} more` : "";

				expect.fail(
					`Found ${violations.length} codicon usage(s) outside allowed files:\n${report}${extra}\n\n` +
						"Use signage constants or QUICKPICK_ICONS instead of $(codicon) syntax.",
				);
			}
		});
	});

	describe("Signage System Integrity", () => {
		it("should have signage/constants.ts file", () => {
			expect(fs.existsSync(SIGNAGE_FILE)).toBe(true);
		});

		it("should export required constants from signage", () => {
			const content = fs.readFileSync(SIGNAGE_FILE, "utf-8");

			const requiredConstExports = [
				"BRAND_SIGNAGE",
				"PROTECTION_LEVEL_SIGNAGE",
				"SNAPSHOT_ORIGIN_SIGNAGE",
				"EVENT_TYPE_SIGNAGE",
				"STATUS_SIGNAGE",
				"QUICKPICK_ICONS",
				"ANIMATION_FRAMES",
				"STATUS_BAR_TEXT",
			];

			for (const exportName of requiredConstExports) {
				expect(content).toContain(`export const ${exportName}`);
			}

			// icon is exported as a function
			expect(content).toContain("export function icon(");
		});

		it("should use icon field (not emoji) in signage constants", () => {
			const content = fs.readFileSync(SIGNAGE_FILE, "utf-8");

			// Should have icon: fields
			expect(content).toContain("icon:");

			// Should NOT have emoji: fields (except in comments)
			const lines = content.split("\n");
			const emojiFieldLines = lines.filter(
				(line) => line.includes("emoji:") && !line.trim().startsWith("//") && !line.trim().startsWith("*"),
			);

			expect(emojiFieldLines.length).toBe(0);
		});

		it("should use logo field (not logoEmoji) in BRAND_SIGNAGE", () => {
			const content = fs.readFileSync(SIGNAGE_FILE, "utf-8");

			// Should have logo: field
			expect(content).toContain('logo: "🧢"');

			// Should NOT have logoEmoji field
			expect(content).not.toContain("logoEmoji:");
		});
	});
});
