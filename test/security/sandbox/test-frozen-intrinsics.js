// Test to see how frozen intrinsics work
try {
	Array.prototype.customMethod = () => "modified";
	console.log("Successfully modified Array.prototype");
	console.log("customMethod:", Array.prototype.customMethod);
} catch (error) {
	console.log("Error modifying Array.prototype:", error.message);
}
