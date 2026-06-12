/**
 * Theme Color Registration Tests
 *
 * Validates that all required theme colors are registered in package.json
 * and match the branding playbook specification.
 *
 * @see docs/brand/extension-branding-playbook.md
 * @module test/unit/branding
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const PACKAGE_JSON_PATH = path.resolve(__dirname, "../../../package.json");

interface ThemeColorDefault {
	dark: string;
	light: string;
	highContrast: string;
}

interface ThemeColor {
	id: string;
	description: string;
	defaults: ThemeColorDefault;
}

interface IconContribution {
	[key: string]: {
		description: string;
		default: {
			fontPath: string;
			fontCharacter: string;
		};
	};
}

interface PackageJson {
	contributes: {
		colors: ThemeColor[];
		icons: IconContribution;
	};
}

// Required theme colors per branding playbook
const REQUIRED_THEME_COLORS = [
	// AI Attribution
	"vreko.aiModifiedBadge",
	"vreko.aiModifiedGutter",

	// Fragile Files
	"vreko.fragileFileBadge",
	"vreko.fragileFileHighlight",

	// Risk Levels
	"vreko.riskHigh",
	"vreko.riskMedium",
	"vreko.riskLow",

	// Session State
	"vreko.sessionActive",

	// Snapshot Coverage
	"vreko.snapshotCoverage",

	// Coherence
	"vreko.coherenceHigh",
	"vreko.coherenceLow",

	// File Heat
	"vreko.fileHeatWarm",
	"vreko.fileHeatHot",

	// Status Bar
	"vreko.statusBar.protected",
	"vreko.statusBar.alert",
	"vreko.statusBar.error",
];

// Required icons per branding playbook
const REQUIRED_ICONS = [
	// Core brand icons
	"vreko-shield",
	"vreko-lightning",
	"vreko-pulse",
	"vreko-brain",
	"vreko-rollback",
	"vreko-risk",

	// Session status icons
	"session-active",
	"session-completed",
	"session-abandoned",

	// Snapshot type icons
	"snapshot-standard",
	"snapshot-ai",
	"snapshot-fragile",

	// Learning confidence icons
	"learning-low",
	"learning-medium",
	"learning-high",

	// Risk level icons
	"risk-low",
	"risk-medium",
	"risk-high",

	// Activity type icons
	"activity-manual-save",
	"activity-auto-snapshot",
	"activity-ai-detection",
	"activity-rollback",
	"activity-learning",
];

describe("Theme Color Registration", () => {
	let packageJson: PackageJson;

	beforeAll(() => {
		const content = fs.readFileSync(PACKAGE_JSON_PATH, "utf-8");
		packageJson = JSON.parse(content) as PackageJson;
	});

	describe("Required colors", () => {
		it("should have all required theme colors registered", () => {
			const registeredColors = packageJson.contributes.colors.map((c) => c.id);

			for (const requiredColor of REQUIRED_THEME_COLORS) {
				expect(registeredColors).toContain(requiredColor);
			}
		});

		it("should have valid hex color values for all defaults", () => {
			const hexPattern = /^#[0-9A-Fa-f]{6,8}$/;

			for (const color of packageJson.contributes.colors) {
				expect(color.defaults.dark).toMatch(hexPattern);
				expect(color.defaults.light).toMatch(hexPattern);
				expect(color.defaults.highContrast).toMatch(hexPattern);
			}
		});

		it("should have descriptions for all colors", () => {
			for (const color of packageJson.contributes.colors) {
				expect(color.description).toBeTruthy();
				expect(color.description.length).toBeGreaterThan(0);
			}
		});
	});

	describe("AI Attribution Colors", () => {
		it("should have consistent AI badge colors across dark/light", () => {
			const aiBadge = packageJson.contributes.colors.find((c) => c.id === "vreko.aiModifiedBadge");
			const aiGutter = packageJson.contributes.colors.find((c) => c.id === "vreko.aiModifiedGutter");

			expect(aiBadge).toBeDefined();
			expect(aiGutter).toBeDefined();

			// AI colors should be blue-ish
			expect(aiBadge?.defaults.dark).toMatch(/#60A5FA/i);
			expect(aiBadge?.defaults.light).toMatch(/#2563EB/i);
		});
	});

	describe("Risk Level Colors", () => {
		it("should have distinct colors for each risk level", () => {
			const riskHigh = packageJson.contributes.colors.find((c) => c.id === "vreko.riskHigh");
			const riskMedium = packageJson.contributes.colors.find((c) => c.id === "vreko.riskMedium");
			const riskLow = packageJson.contributes.colors.find((c) => c.id === "vreko.riskLow");

			expect(riskHigh).toBeDefined();
			expect(riskMedium).toBeDefined();
			expect(riskLow).toBeDefined();

			// High risk should be red
			expect(riskHigh?.defaults.dark).toMatch(/#EF4444/i);

			// Medium risk should be amber/orange
			expect(riskMedium?.defaults.dark).toMatch(/#F59E0B/i);

			// Low risk should be green
			expect(riskLow?.defaults.dark).toMatch(/#4ADE80/i);
		});

		it("should use Vreko green for low risk", () => {
			const riskLow = packageJson.contributes.colors.find((c) => c.id === "vreko.riskLow");
			const sessionActive = packageJson.contributes.colors.find((c) => c.id === "vreko.sessionActive");

			// Low risk and session active should use same green
			expect(riskLow?.defaults.dark).toBe(sessionActive?.defaults.dark);
		});
	});

	describe("Fragile File Colors", () => {
		it("should have orange/amber color for fragile files", () => {
			const fragileBadge = packageJson.contributes.colors.find((c) => c.id === "vreko.fragileFileBadge");

			expect(fragileBadge).toBeDefined();
			// Orange-ish color
			expect(fragileBadge?.defaults.dark).toMatch(/#FF6B35/i);
		});

		it("should have semi-transparent highlight for fragile files", () => {
			const fragileHighlight = packageJson.contributes.colors.find(
				(c) => c.id === "vreko.fragileFileHighlight",
			);

			expect(fragileHighlight).toBeDefined();
			// Should have alpha channel (8 characters)
			expect(fragileHighlight?.defaults.dark.length).toBe(9); // # + 8 hex chars
		});
	});

	describe("Status Bar Colors", () => {
		it("should have protected, alert, and error status bar colors", () => {
			const protected_ = packageJson.contributes.colors.find((c) => c.id === "vreko.statusBar.protected");
			const alert = packageJson.contributes.colors.find((c) => c.id === "vreko.statusBar.alert");
			const error = packageJson.contributes.colors.find((c) => c.id === "vreko.statusBar.error");

			expect(protected_).toBeDefined();
			expect(alert).toBeDefined();
			expect(error).toBeDefined();
		});

		it("should use green for protected status", () => {
			const protected_ = packageJson.contributes.colors.find((c) => c.id === "vreko.statusBar.protected");
			expect(protected_?.defaults.dark).toMatch(/#4ADE80/i);
		});

		it("should use amber for alert status", () => {
			const alert = packageJson.contributes.colors.find((c) => c.id === "vreko.statusBar.alert");
			expect(alert?.defaults.dark).toMatch(/#F59E0B/i);
		});

		it("should use red for error status", () => {
			const error = packageJson.contributes.colors.find((c) => c.id === "vreko.statusBar.error");
			expect(error?.defaults.dark).toMatch(/#EF4444/i);
		});
	});
});

describe("Icon Registration", () => {
	let packageJson: PackageJson;

	beforeAll(() => {
		const content = fs.readFileSync(PACKAGE_JSON_PATH, "utf-8");
		packageJson = JSON.parse(content) as PackageJson;
	});

	describe("Required icons", () => {
		it("should have all required icons registered", () => {
			const registeredIcons = Object.keys(packageJson.contributes.icons);

			for (const requiredIcon of REQUIRED_ICONS) {
				expect(registeredIcons).toContain(requiredIcon);
			}
		});

		it("should have fontPath for all icons", () => {
			for (const [name, icon] of Object.entries(packageJson.contributes.icons)) {
				expect(icon.default.fontPath).toBeTruthy();
				expect(icon.default.fontPath).toContain("vreko-icons.woff");
			}
		});

		it("should have fontCharacter for all icons", () => {
			for (const [name, icon] of Object.entries(packageJson.contributes.icons)) {
				expect(icon.default.fontCharacter).toBeTruthy();
				expect(icon.default.fontCharacter).toMatch(/^\\EA[0-9A-F]{2}$/);
			}
		});

		it("should have descriptions for all icons", () => {
			for (const [name, icon] of Object.entries(packageJson.contributes.icons)) {
				expect(icon.description).toBeTruthy();
				expect(icon.description.length).toBeGreaterThan(0);
			}
		});
	});

	describe("Core brand icons", () => {
		it("should have vreko-shield icon", () => {
			const shield = packageJson.contributes.icons["vreko-shield"];
			expect(shield).toBeDefined();
			expect(shield.description).toContain("protection");
		});

		it("should have vreko-lightning icon for AI attribution", () => {
			const lightning = packageJson.contributes.icons["vreko-lightning"];
			expect(lightning).toBeDefined();
			expect(lightning.description.toLowerCase()).toContain("ai");
		});

		it("should have vreko-brain icon for intelligence", () => {
			const brain = packageJson.contributes.icons["vreko-brain"];
			expect(brain).toBeDefined();
			expect(brain.description.toLowerCase()).toContain("intelligence");
		});
	});

	describe("Session icons", () => {
		it("should have active, completed, and abandoned session icons", () => {
			expect(packageJson.contributes.icons["session-active"]).toBeDefined();
			expect(packageJson.contributes.icons["session-completed"]).toBeDefined();
			expect(packageJson.contributes.icons["session-abandoned"]).toBeDefined();
		});
	});

	describe("Risk icons", () => {
		it("should have low, medium, and high risk icons", () => {
			expect(packageJson.contributes.icons["risk-low"]).toBeDefined();
			expect(packageJson.contributes.icons["risk-medium"]).toBeDefined();
			expect(packageJson.contributes.icons["risk-high"]).toBeDefined();
		});
	});

	describe("Activity icons", () => {
		it("should have all activity type icons", () => {
			const activityIcons = [
				"activity-manual-save",
				"activity-auto-snapshot",
				"activity-ai-detection",
				"activity-rollback",
				"activity-learning",
			];

			for (const icon of activityIcons) {
				expect(packageJson.contributes.icons[icon]).toBeDefined();
			}
		});
	});
});

describe("Color-Icon Consistency", () => {
	let packageJson: PackageJson;

	beforeAll(() => {
		const content = fs.readFileSync(PACKAGE_JSON_PATH, "utf-8");
		packageJson = JSON.parse(content) as PackageJson;
	});

	it("should have matching risk colors and icons", () => {
		const riskColors = ["vreko.riskLow", "vreko.riskMedium", "vreko.riskHigh"];
		const riskIcons = ["risk-low", "risk-medium", "risk-high"];

		// All should be registered
		for (const color of riskColors) {
			expect(packageJson.contributes.colors.find((c) => c.id === color)).toBeDefined();
		}
		for (const icon of riskIcons) {
			expect(packageJson.contributes.icons[icon]).toBeDefined();
		}
	});

	it("should have matching session colors and icons", () => {
		const sessionColor = "vreko.sessionActive";
		const sessionIcon = "session-active";

		expect(packageJson.contributes.colors.find((c) => c.id === sessionColor)).toBeDefined();
		expect(packageJson.contributes.icons[sessionIcon]).toBeDefined();
	});
});
