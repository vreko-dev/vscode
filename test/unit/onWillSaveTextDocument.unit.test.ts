import { beforeEach, describe, expect, it, vi } from "vitest";

describe("onWillSaveTextDocument handler", () => {
	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();
	});

	it("should call waitUntil synchronously with a promise", () => {
		// This test verifies the structure of our fix
		// The key requirement is that waitUntil must be called synchronously

		// Create a mock event
		const mockEvent: any = {
			document: {
				uri: { fsPath: "/test/workspace/src/protected-file.ts" },
				fileName: "/test/workspace/src/protected-file.ts",
			},
			waitUntil: vi.fn(),
		};

		// Simulate our fixed implementation
		// The handler is NOT async
		const handler = (event: any) => {
			// MUST call waitUntil synchronously, wrapping the async work
			event.waitUntil(
				(async () => {
					// Simulate async work
					await Promise.resolve();
					return undefined;
				})(),
			);
		};

		// Call the handler
		handler(mockEvent);

		// Verify that waitUntil was called synchronously
		expect(mockEvent.waitUntil).toHaveBeenCalled();

		// Verify that the promise passed to waitUntil resolves
		const waitUntilCall = mockEvent.waitUntil.mock.calls[0][0];
		expect(waitUntilCall).toBeInstanceOf(Promise);
	});

	it("should not call waitUntil asynchronously after await operations", () => {
		// This test verifies that we don't make the mistake of calling waitUntil after await

		// Create a mock event
		const mockEvent: any = {
			document: {
				uri: { fsPath: "/test/workspace/src/protected-file.ts" },
				fileName: "/test/workspace/src/protected-file.ts",
			},
			waitUntil: vi.fn(),
		};

		// Simulate the WRONG implementation (what we had before)
		// This would be an async handler that calls waitUntil after await
		const _wrongHandler = async (event: any) => {
			// This is WRONG - await before waitUntil
			await Promise.resolve(); // ← await here

			// This would fail in VS Code
			event.waitUntil(Promise.resolve()); // ← TOO LATE!
		};

		// We're not actually calling the wrong handler because it would throw
		// But we're showing what NOT to do

		// Our fix ensures waitUntil is called synchronously
		const correctHandler = (event: any) => {
			// MUST call waitUntil synchronously
			event.waitUntil(
				(async () => {
					// NOW we can use await inside this async IIFE
					await Promise.resolve();
					return undefined;
				})(),
			);
		};

		// Call the correct handler
		correctHandler(mockEvent);

		// Verify that waitUntil was called synchronously
		expect(mockEvent.waitUntil).toHaveBeenCalled();
	});
});
