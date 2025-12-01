// Test our prototype freezing directly
console.log("Testing prototype freezing...");

// Try to manually freeze some key intrinsics
try {
	console.log("Before freezing:");
	console.log(
		"Array.prototype has customMethod:",
		"customMethod" in Array.prototype
	);
	console.log(
		"Object.prototype has customMethod:",
		"customMethod" in Object.prototype
	);

	// Try to freeze prototypes
	Object.freeze(Object.prototype);
	Object.freeze(Array.prototype);
	Object.freeze(Function.prototype);

	console.log("After freezing:");

	// Try to modify Array.prototype
	try {
		Array.prototype.customMethod = () => "modified";
		console.log("Assignment completed for Array.prototype");
		console.log(
			"Array.prototype has customMethod:",
			"customMethod" in Array.prototype
		);
		console.log(
			"Array.prototype.customMethod:",
			Array.prototype.customMethod
		);
	} catch (error) {
		console.log(
			"Error modifying Array.prototype after freezing:",
			error.message
		);
	}

	// Try to modify Object.prototype
	try {
		Object.prototype.customMethod = () => "modified";
		console.log("Assignment completed for Object.prototype");
		console.log(
			"Object.prototype has customMethod:",
			"customMethod" in Object.prototype
		);
		console.log(
			"Object.prototype.customMethod:",
			Object.prototype.customMethod
		);
	} catch (error) {
		console.log(
			"Error modifying Object.prototype after freezing:",
			error.message
		);
	}
} catch (e) {
	console.log("Error during freezing test:", e.message);
}
