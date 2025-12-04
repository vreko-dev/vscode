#!/usr/bin/env node

const pkg = require("../package.json");

// Get all defined commands
const definedCommands = new Set(pkg.contributes.commands.map((c) => c.command));

console.log(`📋 Defined commands (${definedCommands.size}):`);
[...definedCommands].sort().forEach((cmd) => console.log("  ✓", cmd));

// Extract all commands used in menus
const usedInMenus = new Set();
for (const [_menuName, items] of Object.entries(pkg.contributes.menus || {})) {
	for (const item of items) {
		if (item.command) usedInMenus.add(item.command);
		if (item.submenu) {
			// Check if submenu is actually a command reference
			const submenuItems = pkg.contributes.menus[item.submenu] || [];
			for (const subItem of submenuItems) {
				if (subItem.command) usedInMenus.add(subItem.command);
			}
		}
	}
}

console.log(`\n🔍 Commands used in menus (${usedInMenus.size}):`);
[...usedInMenus].sort().forEach((cmd) => console.log("  ➜", cmd));

// Find missing commands
const missing = [...usedInMenus].filter((cmd) => !definedCommands.has(cmd));
console.log(`\n❌ Missing command definitions (${missing.length}):`);
if (missing.length === 0) {
	console.log("  ✅ All menu commands are properly defined!");
} else {
	missing.forEach((cmd) => console.log("  ⚠️ ", cmd));
	process.exit(1);
}

// Find unused commands
const unused = [...definedCommands].filter((cmd) => !usedInMenus.has(cmd));
console.log(`\n⚪ Defined but not in menus (${unused.length}):`);
unused.forEach((cmd) => console.log("  ℹ️ ", cmd));
