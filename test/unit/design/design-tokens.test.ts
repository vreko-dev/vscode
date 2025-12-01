import * as assert from "node:assert";
import {
	DesignTokens,
	type ProtectionLevel,
} from "../../../src/styles/designTokens";

suite("Design System: Color-Based Tokens", () => {
	test("should have colors for all protection levels", () => {
		const levels: ProtectionLevel[] = ["watch", "warn", "block"];

		levels.forEach((level) => {
			assert.ok(
				DesignTokens.colors[level],
				`Should have colors defined for ${level} level`,
			);
			assert.ok(
				DesignTokens.colors[level].primary,
				`Should have primary color for ${level}`,
			);
			assert.ok(
				DesignTokens.colors[level].background,
				`Should have background color for ${level}`,
			);
		});
	});

	test("should have color emoji for all protection levels", () => {
		assert.strictEqual(
			DesignTokens.icons.watch,
			"🟢",
			"Watch should use green circle",
		);
		assert.strictEqual(
			DesignTokens.icons.warn,
			"🟡",
			"Warn should use yellow circle",
		);
		assert.strictEqual(
			DesignTokens.icons.block,
			"🔴",
			"Block should use red circle",
		);
	});

	test("should have consistent typography scale", () => {
		assert.ok(DesignTokens.typography.fontSize, "Should have font sizes");
		assert.ok(DesignTokens.typography.fontWeight, "Should have font weights");
		assert.ok(
			DesignTokens.typography.letterSpacing,
			"Should have letter spacing",
		);
	});

	test("watch level should use green colors", () => {
		const watchColor = DesignTokens.colors.watch.primary;
		assert.ok(
			watchColor.includes("#10B981"),
			"Watch should use Matrix green (#10B981)",
		);
	});

	test("warn level should use orange colors", () => {
		const warnColor = DesignTokens.colors.warn.primary;
		assert.ok(
			warnColor.includes("#FF6B35"),
			"Warn should use safety orange (#FF6B35)",
		);
	});

	test("block level should use red colors", () => {
		const blockColor = DesignTokens.colors.block.primary;
		assert.ok(
			blockColor.includes("#EF4444"),
			"Block should use emergency red (#EF4444)",
		);
	});

	test("should provide helper function to get level color", () => {
		assert.strictEqual(
			DesignTokens.getColor("watch"),
			DesignTokens.colors.watch.primary,
		);
		assert.strictEqual(
			DesignTokens.getColor("warn"),
			DesignTokens.colors.warn.primary,
		);
		assert.strictEqual(
			DesignTokens.getColor("block"),
			DesignTokens.colors.block.primary,
		);
	});

	test("should provide helper function to get level icon", () => {
		assert.strictEqual(DesignTokens.getIcon("watch"), "🟢");
		assert.strictEqual(DesignTokens.getIcon("warn"), "🟡");
		assert.strictEqual(DesignTokens.getIcon("block"), "🔴");
	});

	test("should not include lock icon (deprecated)", () => {
		const icons = Object.values(DesignTokens.icons);
		assert.ok(
			!icons.includes("🔒"),
			"Lock icon should not be in design system (deprecated)",
		);
	});
});
