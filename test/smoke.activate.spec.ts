import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VSCodeMockFactory } from "./helpers/vscodeHelpers";

describe("Extension Smoke Tests", () => {
	let mockFactory: VSCodeMockFactory;
	let mockContext: vscode.ExtensionContext;

	beforeEach(() => {
		mockFactory = VSCodeMockFactory.getInstance();
		mockContext = mockFactory.createExtensionContext();

		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	afterEach(() => {
		mockFactory.reset();
	});

	// smoke-001: Extension activates & registers core commands
	it("should activate extension without errors", async () => {
		// Import the extension activation function
		const extensionModule = await import("../src/extension");

		// Verify the activate function exists
		expect(extensionModule.activate).toBeDefined();
		expect(typeof extensionModule.activate).toBe("function");

		// Activate the extension with mock context
		await expect(extensionModule.activate(mockContext)).resolves.not.toThrow();
	});

	// smoke-002: Extension registers core commands
	it("should register core commands on activation", async () => {
		const vscode = await import("vscode");
		const extensionModule = await import("../src/extension");

		// Activate the extension
		await extensionModule.activate(mockContext);

		// Verify commands were registered
		expect(vscode.commands.registerCommand).toHaveBeenCalled();

		// Check that essential commands are registered
		const registerCommandCalls = (vscode.commands.registerCommand as jest.Mock)
			.mock.calls;
		const commandNames = registerCommandCalls.map(
			(call: [string, unknown]) => call[0],
		);

		// Verify core commands are registered
		expect(commandNames).toContain("snapback.enableProtection");
		expect(commandNames).toContain("snapback.disableProtection");
		expect(commandNames).toContain("snapback.toggleProtection");
	});
});
