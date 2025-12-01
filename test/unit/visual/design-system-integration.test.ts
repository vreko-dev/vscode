import * as assert from "node:assert";
import { DesignTokens } from "../../../src/styles/designTokens.js";
import { FileDecorationProvider } from "../../../src/ui/fileDecorations.js";
import { NotificationFormatter } from "../../../src/ui/notifications.js";
import { StatusBarController } from "../../../src/ui/statusBar.js";

suite("Visual: Design System Integration", () => {
	test("all UI components should use consistent design tokens", () => {
		// Status bar uses design tokens
		const statusText = StatusBarController.formatStatusBar({
			watched: 1,
			warnings: 1,
			protected: 1,
		});

		assert.ok(
			statusText.includes(DesignTokens.icons.watch),
			"Status bar should use design token icons",
		);
		assert.ok(
			statusText.includes(DesignTokens.icons.warn),
			"Status bar should use design token icons",
		);
		assert.ok(
			statusText.includes(DesignTokens.icons.block),
			"Status bar should use design token icons",
		);

		// File decorations use design tokens
		const watchDecoration = FileDecorationProvider.getDecoration("watch");
		assert.strictEqual(
			watchDecoration.badge,
			DesignTokens.icons.watch,
			"File decorations should use design token icons",
		);

		// Notifications use design tokens
		const notification = NotificationFormatter.createWatchNotification("test");
		assert.ok(
			notification.includes(DesignTokens.icons.watch),
			"Notifications should use design token icons",
		);
	});

	test("no UI component should use lock icon", () => {
		const components = [
			StatusBarController.formatStatusBar({
				watched: 10,
				warnings: 0,
				protected: 5,
			}),
			FileDecorationProvider.getDecoration("watch").badge,
			FileDecorationProvider.getDecoration("warn").badge,
			FileDecorationProvider.getDecoration("block").badge,
			NotificationFormatter.createWatchNotification("test"),
			NotificationFormatter.createWarnNotification("test"),
			NotificationFormatter.createBlockNotification("test"),
		];

		components.forEach((component) => {
			assert.ok(
				!component.includes("🔒"),
				"No component should use deprecated lock icon",
			);
		});
	});

	test("color consistency across protection levels", () => {
		// Each level should use its designated color from design tokens
		const levels: Array<"watch" | "warn" | "block"> = [
			"watch",
			"warn",
			"block",
		];

		levels.forEach((level) => {
			const color = DesignTokens.getColor(level);
			const icon = DesignTokens.getIcon(level);

			assert.ok(color, `${level} should have color defined`);
			assert.ok(icon, `${level} should have icon defined`);
		});
	});
});
