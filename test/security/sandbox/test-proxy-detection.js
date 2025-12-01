// Test to see how proxy detection works
const fs = require("node:fs");
const path = require("node:path");

// Create a test config with a proxy
const testConfig = `
const proxy = new Proxy({}, {
  get: function(target, prop) {
    return 'proxy';
  }
});

module.exports = {
  protection: [],
  ignore: [],
  // Proxy should be rejected with ERR_NON_POJO_RETURN
  proxyValue: proxy
};
`;

// Write test config to a temporary file
const testConfigPath = path.join(__dirname, "proxy-test.cjs");
fs.writeFileSync(testConfigPath, testConfig);

console.log("Test config written to:", testConfigPath);

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

	// Check if it's a proxy using util.types if available
	try {
		const util = require("node:util");
		if (util?.types && typeof util.types.isProxy === "function") {
			if (util.types.isProxy(obj)) {
				seen.delete(obj);
				return false; // Proxy detected
			}
		}
	} catch (_e) {
		// Ignore if we can't use util.types
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
	const userModule = require(testConfigPath);
	console.log("Loaded module:", userModule);
	console.log("isPlainObject result:", isPlainObject(userModule));

	// Check the proxy value specifically
	console.log("proxyValue:", userModule.proxyValue);
	console.log("proxyValue type:", typeof userModule.proxyValue);

	// Try to access properties on the proxy
	console.log("proxyValue.test:", userModule.proxyValue.test);

	// Try to get prototype
	try {
		const proto = Object.getPrototypeOf(userModule.proxyValue);
		console.log("proxyValue prototype:", proto);
	} catch (e) {
		console.log("Error getting proxy prototype:", e.message);
	}

	// Try to getOwnPropertyNames
	try {
		const ownProps = Object.getOwnPropertyNames(userModule.proxyValue);
		console.log("proxyValue ownProps:", ownProps);
	} catch (e) {
		console.log("Error getting proxy ownProps:", e.message);
	}

	// Test the proxy value directly with isPlainObject
	console.log(
		"proxyValue isPlainObject:",
		isPlainObject(userModule.proxyValue)
	);
} catch (error) {
	console.log("Error loading module:", error.message);
}

// Clean up
fs.unlinkSync(testConfigPath);
