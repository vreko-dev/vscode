// Test to see how frozen intrinsics work
console.log("Testing frozen intrinsics...");

try {
	// This should fail with the --frozen-intrinsics flag
	Array.prototype.customMethod = () => "modified";
	console.log("Successfully modified Array.prototype");
	console.log("customMethod:", Array.prototype.customMethod);
} catch (error) {
	console.log("Error modifying Array.prototype:", error.message);
}

try {
	// Try to modify Object.prototype
	Object.prototype.customMethod = () => "modified";
	console.log("Successfully modified Object.prototype");
	console.log("customMethod:", Object.prototype.customMethod);
} catch (error) {
	console.log("Error modifying Object.prototype:", error.message);
}

// Try to modify a property that might be frozen
try {
	Object.defineProperty(Array, "isArray", {
		value: () => false,
		writable: true,
		configurable: true,
	});
	console.log("Successfully modified Array.isArray");
} catch (error) {
	console.log("Error modifying Array.isArray:", error.message);
}
