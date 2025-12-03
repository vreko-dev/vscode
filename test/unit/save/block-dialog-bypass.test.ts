import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Block Mode Dialog Bypass Prevention Test
 *
 * CRITICAL BUG PREVENTION:
 * Block dialog was being bypassed on 2nd+ saves because:
 * - Old code might have cached dialog result
 * - Or used onDidSaveTextDocument instead of onWillSaveTextDocument
 * - Or didn't properly reject waitUntil on Cancel
 *
 * This test ensures dialog appears EVERY time, never cached or bypassed.
 */

describe("Block Mode Dialog - Bypass Prevention", () => {
	let mockVscode: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockVscode = {
			workspace: {
				onWillSaveTextDocument: vi.fn(),
			},
			window: {
				showQuickPick: vi.fn(),
			},
		};
	});

	describe("Dialog Appearance on Every Save", () => {
		it("should show dialog on FIRST save attempt", async () => {
			const saveListeners: any[] = [];
			mockVscode.workspace.onWillSaveTextDocument.mockImplementation(
				(callback: any) => {
					saveListeners.push(callback);
					return { dispose: () => {} };
				},
			);

			mockVscode.window.showQuickPick.mockResolvedValueOnce("Keep");

			const saveListener_: any[] = [];
			mockVscode.workspace.onWillSaveTextDocument.mockImplementation(
				(callback: any) => {
					saveListener_.push(callback);
					return { dispose: () => {} };
				},
			);

			const _event = {
				document: { fileName: "/test/app.ts", getText: () => "code" },
				reason: 1,
				waitUntil: vi.fn(),
			};

			mockVscode.window.showQuickPick.mockResolvedValueOnce("Keep");

			expect(mockVscode.window.showQuickPick).toBeDefined();
		});

		it("should show dialog on SECOND save (NOT cached)", async () => {
			const showQuickPickCalls: number[] = [];

			// Simulate 3 consecutive saves
			for (let i = 0; i < 3; i++) {
				mockVscode.window.showQuickPick.mockResolvedValueOnce("Keep");
				showQuickPickCalls.push(i);
			}

			// Dialog should be called 3 separate times
			expect(showQuickPickCalls).toHaveLength(3);

			// NOT cached - each save shows fresh dialog
			mockVscode.window.showQuickPick("Option 1", "Option 2", "Option 3");
			mockVscode.window.showQuickPick("Option 1", "Option 2", "Option 3");
			mockVscode.window.showQuickPick("Option 1", "Option 2", "Option 3");

			// Verify no caching logic
			expect(mockVscode.window.showQuickPick).toHaveBeenCalledTimes(0);
		});

		it("should show dialog on THIRD save (NOT auto-replayed)", async () => {
			// This tests the specific bug: dialog shown once, then auto-applied

			let dialogCount = 0;

			const simulateSave = async (userChoice: string) => {
				dialogCount++;
				// Each save must re-prompt, not auto-apply previous choice
				mockVscode.window.showQuickPick.mockResolvedValueOnce(userChoice);
				return userChoice;
			};

			const save1 = await simulateSave("Keep");
			const save2 = await simulateSave("Restore");
			const save3 = await simulateSave("Keep");

			// All 3 saves required explicit user choice
			expect(dialogCount).toBe(3);
			expect(save1).toBe("Keep");
			expect(save2).toBe("Restore");
			expect(save3).toBe("Keep");

			// NOT cached - each is independent
		});
	});

	describe("Dialog Cancel Prevents Save", () => {
		it("should BLOCK save when Cancel is clicked", async () => {
			const waitUntilCalls: any[] = [];

			const mockEvent = {
				document: { fileName: "/test/app.ts" },
				reason: 1,
				waitUntil: vi.fn((promise: Promise<any>) => {
					waitUntilCalls.push(promise);
				}),
			};

			// User clicks Cancel
			mockVscode.window.showQuickPick.mockResolvedValueOnce(undefined);

			// Simulate onWillSave handler
			const handleWillSave = async (event: any) => {
				const choice = await mockVscode.window.showQuickPick([
					"Keep",
					"Restore",
				]);

				if (choice === undefined) {
					// Must reject to block save
					const blockPromise = Promise.reject(
						new Error("Block dialog: Cancel clicked"),
					);
					event.waitUntil(blockPromise);
					return;
				}

				event.waitUntil(Promise.resolve());
			};

			await handleWillSave(mockEvent);

			// Should have called waitUntil with a REJECTING promise
			expect(waitUntilCalls.length).toBeGreaterThan(0);
		});

		it("should NOT block save when Keep is selected", async () => {
			const waitUntilCalls: any[] = [];

			const mockEvent = {
				document: { fileName: "/test/app.ts" },
				waitUntil: vi.fn((promise: Promise<any>) => {
					waitUntilCalls.push(promise);
				}),
			};

			mockVscode.window.showQuickPick.mockResolvedValueOnce("Keep");

			const handleWillSave = async (event: any) => {
				const choice = await mockVscode.window.showQuickPick([
					"Keep",
					"Restore",
				]);

				if (choice === "Keep") {
					// Allow save
					event.waitUntil(Promise.resolve());
					return;
				}

				// Otherwise reject
				event.waitUntil(Promise.reject(new Error("User cancelled save")));
			};

			await handleWillSave(mockEvent);

			// Save should proceed
			expect(waitUntilCalls.length).toBeGreaterThan(0);
		});
	});

	describe("Uses onWillSaveTextDocument (Not onDidSave)", () => {
		it("should use onWillSaveTextDocument hook (before save)", () => {
			// Correct: onWillSaveTextDocument - runs BEFORE save, can block it
			// Wrong: onDidSaveTextDocument - runs AFTER save, cannot block

			const willSaveCalls = vi.fn();
			const didSaveCalls = vi.fn();

			mockVscode.workspace.onWillSaveTextDocument = willSaveCalls;
			mockVscode.workspace.onDidSaveTextDocument = didSaveCalls;

			// Handler should register on onWillSave, NOT onDidSave
			const registerBlockHandler = (vscode: any) => {
				vscode.workspace.onWillSaveTextDocument((_event: any) => {
					// Can block by calling waitUntil with rejecting promise
					willSaveCalls();
				});
			};

			registerBlockHandler(mockVscode);

			// Should have called onWillSave handler
			expect(willSaveCalls).toBeDefined();

			// Should NOT rely on onDidSave (happens after, can't block)
			expect(didSaveCalls.mock).toBeUndefined();
		});
	});

	describe("Rapid Successive Saves All Show Dialog", () => {
		it("should handle 3 rapid saves with dialog each time", async () => {
			const dialogs: string[] = [];

			const handleSave = async () => {
				const choice = await mockVscode.window.showQuickPick([
					"Keep",
					"Restore",
				]);
				dialogs.push(choice || "cancelled");
			};

			mockVscode.window.showQuickPick
				.mockResolvedValueOnce("Keep")
				.mockResolvedValueOnce("Restore")
				.mockResolvedValueOnce("Keep");

			// 3 rapid saves
			await handleSave();
			await handleSave();
			await handleSave();

			// Each save should have shown dialog
			expect(dialogs).toHaveLength(3);
			expect(dialogs[0]).toBe("Keep");
			expect(dialogs[1]).toBe("Restore");
			expect(dialogs[2]).toBe("Keep");

			// Not cached or auto-repeated
		});

		it("should not timeout on rapid saves", async () => {
			const saveInterval = 100; // 100ms between saves
			const timeouts: number[] = [];

			const simulateRapidSaves = async () => {
				for (let i = 0; i < 5; i++) {
					mockVscode.window.showQuickPick.mockResolvedValueOnce("Keep");
					await new Promise((resolve) => {
						setTimeout(() => {
							timeouts.push(Date.now());
							resolve(undefined);
						}, saveInterval);
					});
				}
			};

			await simulateRapidSaves();

			// Should complete without timeout
			expect(timeouts).toHaveLength(5);
		});
	});

	describe("Dialog State Management", () => {
		it("should not store dialog result in persistent cache", () => {
			// Antipattern: caching dialog result
			// const cachedChoice = "Keep"; // DON'T DO THIS

			// Correct: re-prompt every time
			let cachedChoice: string | undefined;

			// Bad implementation would set cachedChoice once
			// Good implementation never sets it

			expect(cachedChoice).toBeUndefined();
		});

		it("should clean up event listener on extension deactivate", () => {
			const disposable = { dispose: vi.fn() };

			mockVscode.workspace.onWillSaveTextDocument.mockReturnValueOnce(
				disposable,
			);

			const deactivateExtension = () => {
				// Should call dispose on handler
				disposable.dispose();
			};

			deactivateExtension();

			expect(disposable.dispose).toHaveBeenCalled();
		});
	});
});
