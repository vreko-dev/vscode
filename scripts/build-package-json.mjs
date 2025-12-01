import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the base package.json
const basePackagePath = path.join(__dirname, "..", "package.base.json");

// Path to the contributes directory
const contributesDir = path.join(__dirname, "..", "package-contributes");

// Path to the output package.json
const outputPackagePath = path.join(__dirname, "..", "package.json");

// Read the base package.json
const basePackage = JSON.parse(fs.readFileSync(basePackagePath, "utf8"));

// Preserve existing contributes section if it exists, otherwise initialize it
if (!basePackage.contributes) {
	basePackage.contributes = {};
}

// Preserve existing submenus if they exist in contributes section
const existingSubmenus = basePackage.contributes?.submenus || [];

// List of modular files to merge
const modularFiles = [
	"snapshot-commands.json",
	"protection-commands.json",
	"mcp-commands.json",
	"view-commands.json",
	"snapshot-creation-commands.json",
	"views.json",
	"explorer-menus.json",
	"editor-menus.json",
	"view-menus.json",
	"configuration.json",
	"keybindings.json",
	"walkthroughs.json",
	"protection-submenus.json",
	"submenus.json",
];

// Merge each modular file
modularFiles.forEach((file) => {
	const filePath = path.join(contributesDir, file);
	if (fs.existsSync(filePath)) {
		const moduleContent = JSON.parse(fs.readFileSync(filePath, "utf8"));

		// Merge the content into the base package's contributes section
		Object.keys(moduleContent).forEach((key) => {
			if (Array.isArray(moduleContent[key])) {
				// If the module content is an array
				if (!basePackage.contributes[key]) {
					// If the key doesn't exist in basePackage.contributes, directly assign
					basePackage.contributes[key] = moduleContent[key];
				} else if (Array.isArray(basePackage.contributes[key])) {
					// If both are arrays, concatenate them
					basePackage.contributes[key] = basePackage.contributes[key].concat(
						moduleContent[key],
					);
				} else {
					// If basePackage.contributes[key] is not an array, overwrite it
					basePackage.contributes[key] = moduleContent[key];
				}
			} else if (
				typeof moduleContent[key] === "object" &&
				moduleContent[key] !== null
			) {
				// If both are objects, merge them
				if (!basePackage.contributes[key]) {
					basePackage.contributes[key] = {};
				}
				if (key === "menus") {
					// Special handling for menus to merge nested objects
					Object.keys(moduleContent[key]).forEach((menuKey) => {
						if (!basePackage.contributes[key][menuKey]) {
							basePackage.contributes[key][menuKey] = [];
						}
						basePackage.contributes[key][menuKey] = basePackage.contributes[
							key
						][menuKey].concat(moduleContent[key][menuKey]);
					});
				} else {
					// Regular object merge
					Object.assign(basePackage.contributes[key], moduleContent[key]);
				}
			} else {
				// Otherwise, directly assign
				basePackage.contributes[key] = moduleContent[key];
			}
		});
	}
});

// Ensure submenus are in the contributes section where VS Code expects them
if (basePackage.contributes?.submenus) {
	// Merge submenus from modular files with existing submenus
	basePackage.contributes.submenus = [
		...existingSubmenus,
		...basePackage.contributes.submenus,
	];
} else if (existingSubmenus.length > 0) {
	basePackage.contributes.submenus = existingSubmenus;
}
// Remove any root level submenus as they don't belong there in VS Code extensions
if (basePackage.submenus) {
	delete basePackage.submenus;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION: Guardrails to catch common errors before they cause issues
// ═══════════════════════════════════════════════════════════════════════════

console.log("🔍 Validating package.json structure...");

const validationErrors = [];

// Validation 1: Check enabledApiProposals includes timeline if timeline API is used
if (basePackage.enabledApiProposals) {
	if (!basePackage.enabledApiProposals.includes("timeline")) {
		validationErrors.push(
			'⚠️  WARNING: enabledApiProposals should include "timeline" for Timeline Provider support',
		);
	}
} else {
	validationErrors.push(
		"❌ ERROR: enabledApiProposals is missing - Timeline Provider will fail",
	);
}

// Validation 2: Check submenu menu items don't have invalid properties
if (basePackage.contributes?.menus) {
	Object.keys(basePackage.contributes.menus).forEach((menuKey) => {
		// Check if this is a submenu (not explorer/context, editor/context, etc.)
		if (basePackage.contributes.submenus?.some((s) => s.id === menuKey)) {
			const menuItems = basePackage.contributes.menus[menuKey];
			menuItems.forEach((item, index) => {
				// Skip separators
				if (item.type === "separator") {
					return;
				}

				// Check for invalid properties in submenu menu items
				if (item.title) {
					validationErrors.push(
						`❌ ERROR: Menu item ${index} in submenu "${menuKey}" has invalid "title" property. Titles should be defined in command contributions, not menu items.`,
					);
				}
				if (item.description) {
					validationErrors.push(
						`❌ ERROR: Menu item ${index} in submenu "${menuKey}" has invalid "description" property. Descriptions should be defined in command contributions, not menu items.`,
					);
				}
				// Valid properties for menu items: command, when, group
				const validProps = ["command", "when", "group"];
				for (const prop of Object.keys(item)) {
					if (!validProps.includes(prop)) {
						validationErrors.push(
							`⚠️  WARNING: Menu item ${index} in submenu "${menuKey}" has unexpected property "${prop}"`,
						);
					}
				}
			});
		}
	});
}

// Validation 3: Check submenu references are valid
if (basePackage.contributes?.menus) {
	const declaredSubmenus = (basePackage.contributes.submenus || []).map(
		(s) => s.id,
	);

	for (const menuKey of Object.keys(basePackage.contributes.menus)) {
		basePackage.contributes.menus[menuKey].forEach((item, index) => {
			if (item.submenu && !declaredSubmenus.includes(item.submenu)) {
				validationErrors.push(
					`❌ ERROR: Menu "${menuKey}" item ${index} references undeclared submenu "${item.submenu}"`,
				);
			}
		});
	}
}

// Report validation results
if (validationErrors.length > 0) {
	console.log("\n📋 Validation Results:");
	validationErrors.forEach((error) => {
		console.log(`  ${error}`);
	});

	// Count critical errors (vs warnings)
	const criticalErrors = validationErrors.filter((e) =>
		e.startsWith("❌"),
	).length;
	if (criticalErrors > 0) {
		console.log(
			`\n❌ Build completed with ${criticalErrors} critical error(s) that may cause runtime failures`,
		);
		console.log(
			"⚠️  Please fix these errors to ensure proper extension functionality\n",
		);
	} else {
		console.log("\n⚠️  Build completed with warnings - review recommended\n");
	}
} else {
	console.log("✅ Validation passed - no issues detected\n");
}

// Write the combined package.json
fs.writeFileSync(outputPackagePath, JSON.stringify(basePackage, null, 2));

console.log("✅ package.json successfully built from modular components");
