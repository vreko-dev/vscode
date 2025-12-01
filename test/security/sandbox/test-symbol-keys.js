// Test to see how symbol keys work
const sym = Symbol("test");
const obj = {};
obj[sym] = "symbol value";

console.log("Object with symbol key:", obj);
console.log("Object keys:", Object.keys(obj));
console.log("Object symbol keys:", Object.getOwnPropertySymbols(obj));

// Test our isPlainObject function
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
			// Try to access a property that doesn't exist
			// Proxies might intercept this and behave differently
			const testKey = Symbol("test");
			const original = obj[testKey];
			obj[testKey] = testKey;
			if (obj[testKey] !== testKey) {
				// Property was intercepted, likely a proxy
				seen.delete(obj);
				return false;
			}
			obj[testKey] = original; // Restore original value
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

console.log("isPlainObject result:", isPlainObject(obj));
