// Debug script to test isPlainObject function

// Simple implementation of isPlainObject for testing
function isPlainObject(obj, seen = new Set()) {
	// Null or primitive types are not objects
	if (obj === null || typeof obj !== "object") {
		console.log("Not an object:", obj);
		return false;
	}

	// Prevent infinite recursion
	if (seen.has(obj)) {
		console.log("Already seen:", obj);
		return false;
	}
	seen.add(obj);

	// Check if it's a proxy
	try {
		// Try to detect proxies by checking if they have special properties
		// This is a more robust way to detect proxies
		if (typeof obj === "object" && obj !== null) {
			// Try to access a property that doesn't exist
			// Proxies might intercept this and behave differently
			const testKey = Symbol("test");
			const original = obj[testKey];
			obj[testKey] = testKey;
			if (obj[testKey] !== testKey) {
				// Property was intercepted, likely a proxy
				seen.delete(obj);
				console.log("Proxy detected");
				return false;
			}
			obj[testKey] = original; // Restore original value
		}
	} catch (_e) {
		// If we get an error accessing properties, it might be a proxy
		seen.delete(obj);
		console.log("Error accessing properties, likely proxy");
		return false;
	}

	// Arrays are allowed but need to be checked
	if (Array.isArray(obj)) {
		console.log("Array detected");
		// Check array items
		for (const item of obj) {
			if (typeof item === "function") {
				seen.delete(obj);
				console.log("Function in array");
				return false; // Functions not allowed
			}
			if (typeof item === "object" && item !== null) {
				if (!isPlainObject(item, seen)) {
					seen.delete(obj);
					console.log("Invalid object in array");
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
			console.log("Function value detected");
			return false; // Functions not allowed
		}
		if (typeof value === "object" && value !== null) {
			if (Array.isArray(value)) {
				// Check array items
				for (const item of value) {
					if (typeof item === "function") {
						seen.delete(obj);
						console.log("Function in nested array");
						return false;
					}
					if (typeof item === "object" && item !== null) {
						// Recursively check nested objects
						if (
							!isPlainObject(item, seen) &&
							!Array.isArray(item)
						) {
							seen.delete(obj);
							console.log("Invalid object in nested array");
							return false;
						}
					}
				}
			} else {
				// Check nested objects
				if (!isPlainObject(value, seen)) {
					seen.delete(obj);
					console.log("Invalid nested object");
					return false;
				}
			}
		}
	}

	// Check for getters/setters/symbols
	const descriptors = Object.getOwnPropertyDescriptors(obj);
	for (const key in descriptors) {
		const desc = descriptors[key];
		if (typeof key === "symbol") {
			seen.delete(obj);
			console.log("Symbol key in descriptors:", key);
			return false; // Symbol keys not allowed
		}
		if (desc.get || desc.set) {
			seen.delete(obj);
			console.log("Getter/setter detected");
			return false; // Getters/setters not allowed
		}
	}

	seen.delete(obj);
	console.log("Valid plain object");
	return true;
}

// Test with a valid POJO
const validPojo = {
	protection: [{ pattern: "**/*.secret", level: "block" }],
	ignore: ["node_modules/**"],
	settings: {
		maxCheckpoints: 100,
		defaultProtectionLevel: "watch",
	},
};

console.log("Testing valid POJO:");
console.log("Keys:", Object.keys(validPojo));
console.log("Symbols:", Object.getOwnPropertySymbols(validPojo));
console.log("Descriptors:", Object.getOwnPropertyDescriptors(validPojo));
console.log("Result:", isPlainObject(validPojo));
