// Test to see what happens when we try to use Module._load directly
try {
	const _moduleLoad = require("node:module")._load("fs", null, true);
	console.log("Successfully loaded module with Module._load");
} catch (error) {
	console.log("Error using Module._load:", error.message);
}
