// Debug script to test the exact valid POJO from the test

const fs = require("node:fs");
const path = require("node:path");

// Create the exact same content as the test
const validPojoContent = `
      module.exports = {
        protection: [
          { pattern: '**/*.secret', level: 'block' }
        ],
        ignore: [
          'node_modules/**'
        ],
        settings: {
          maxCheckpoints: 100,
          defaultProtectionLevel: 'watch'
        }
      };
    `;

// Write to a temporary file
const configPath = path.join(__dirname, "debug-valid-pojo.cjs");
fs.writeFileSync(configPath, validPojoContent);

console.log("Created test file at:", configPath);

// Test our isPlainObject function with the exact same logic as in sandboxScript.js
function isPlainObject(obj, seen = new Set()) {
	// Null or primitive types are not objects
	if (obj === null || typeof obj !== "object") {
		return false;
	}

	// Prevent infinite recursion
	if (seen.has(obj)) {
		return false;
	}
	seen.add(obj);

	// Check if it's a proxy
	try {
		// Try to detect proxies by checking if they have special properties
		// This is a more robust way to detect proxies
		if (typeof obj === "object" && obj !== null) {
			// Try to access the prototype - proxies might behave differently
			const _proto = Object.getPrototypeOf(obj);
			// Try to getOwnPropertyNames - proxies might behave differently
			const _ownProps = Object.getOwnPropertyNames(obj);
		}
	} catch (_e) {
		// If we get an error accessing properties, it might be a proxy
		seen.delete(obj);
		return false;
	}

	// Arrays are allowed but need to be checked
	if (Array.isArray(obj)) {
		// Check array items
		for (const item of obj) {
			if (typeof item === "function") {
				seen.delete(obj);
				return false; // Functions not allowed
			}
			if (typeof item === "object" && item !== null) {
				if (!isPlainObject(item, seen)) {
					seen.delete(obj);
					return false;
				}
			}
		}
		seen.delete(obj);
		return true;
	}

	// Check for forbidden types in values
	const values = Object.values(obj);
	for (const value of values) {
		if (typeof value === "function") {
			seen.delete(obj);
			return false; // Functions not allowed
		}
		if (typeof value === "object" && value !== null) {
			if (Array.isArray(value)) {
				// Check array items
				for (const item of value) {
					if (typeof item === "function") {
						seen.delete(obj);
						return false;
					}
					if (typeof item === "object" && item !== null) {
						// Recursively check nested objects
						if (
							!isPlainObject(item, seen) &&
							!Array.isArray(item)
						) {
							seen.delete(obj);
							return false;
						}
					}
				}
			} else {
				// Check nested objects
				if (!isPlainObject(value, seen)) {
					seen.delete(obj);
					return false;
				}
			}
		}
	}

	// Check for symbol keys
	const symbolKeys = Object.getOwnPropertySymbols(obj);
	if (symbolKeys.length > 0) {
		seen.delete(obj);
		return false; // Symbol keys not allowed
	}

	// Check for getters/setters
	const descriptors = Object.getOwnPropertyDescriptors(obj);
	for (const key in descriptors) {
		const desc = descriptors[key];
		if (desc.get || desc.set) {
			seen.delete(obj);
			return false; // Getters/setters not allowed
		}
	}

	seen.delete(obj);
	return true;
}

// Load and test the module
try {
	const userModule = require(configPath);
	console.log("Loaded module:", userModule);
	console.log("isPlainObject result:", isPlainObject(userModule));

	// Check individual properties
	console.log("protection:", userModule.protection);
	console.log("protection is array:", Array.isArray(userModule.protection));
	if (userModule.protection) {
		console.log("First protection item:", userModule.protection[0]);
		console.log(
			"First protection item type:",
			typeof userModule.protection[0]
		);

		// Check for symbol keys in the protection item
		const symbolKeys = Object.getOwnPropertySymbols(
			userModule.protection[0]
		);
		console.log("Symbol keys in protection item:", symbolKeys);
	}
} catch (error) {
	console.log("Error loading module:", error.message);
}

// Clean up
fs.unlinkSync(configPath);
