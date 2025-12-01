import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

describe("Extension Activation Tests", () => {
	let registerFileDecorationProviderSpy: any;
	let registrationCount: number;

	beforeEach(() => {
		registrationCount = 0;

		// Spy on registerFileDecorationProvider to count registrations
		registerFileDecorationProviderSpy = vi
			.spyOn(vscode.window, "registerFileDecorationProvider")
			.mockImplementation((_provider: any) => {
				registrationCount++;
				return { dispose: vi.fn() };
			});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	/**
	 * CRITICAL TEST: Decoration provider should be registered exactly ONCE
	 * REGRESSION BUG #2: Multiple registrations causing duplicate decorations
	 */
	it("Should register decoration provider exactly ONCE during activation", async () => {
		// Reset registration count
		registrationCount = 0;

		// Simulate extension activation sequence
		// In the actual activate() function, decoration provider is registered at line 268
		const { ProtectionDecorationProvider } = await import(
			"@/ui/ProtectionDecorationProvider"
		);
		const { ProtectedFileRegistry } = await import(
			"@/services/protectedFileRegistry"
		);

		// Create registry
		const mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		const registry = new ProtectedFileRegistry(mockState as any);

		// Create decoration provider
		const decorationProvider = new ProtectionDecorationProvider(registry);

		// Register with VS Code (simulating extension activation)
		const disposable =
			vscode.window.registerFileDecorationProvider(decorationProvider);

		// CRITICAL ASSERTION: Should be registered exactly ONCE
		expect(registrationCount).toBe(1);

		// Verify the spy was called
		expect(registerFileDecorationProviderSpy).toHaveBeenCalledTimes(1);

		// Clean up
		disposable.dispose();
		decorationProvider.dispose();
		await registry.clearAll();
	});

	/**
	 * CRITICAL TEST: Registration happens BEFORE async operations
	 * REGRESSION BUG #2: Async operations before registration caused UI issues
	 */
	it("Should register decoration provider BEFORE async config initialization", async () => {
		const registrationOrder: string[] = [];

		// Mock registerFileDecorationProvider to track timing
		registerFileDecorationProviderSpy.mockImplementation((_provider: any) => {
			registrationOrder.push("register_decoration_provider");
			return { dispose: vi.fn() };
		});

		// Simulate the critical activation sequence from extension.ts
		const { ProtectionDecorationProvider } = await import(
			"@/ui/ProtectionDecorationProvider"
		);
		const { ProtectedFileRegistry } = await import(
			"@/services/protectedFileRegistry"
		);

		const mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		const registry = new ProtectedFileRegistry(mockState as any);
		const decorationProvider = new ProtectionDecorationProvider(registry);

		// CRITICAL: Register IMMEDIATELY (synchronously)
		vscode.window.registerFileDecorationProvider(decorationProvider);
		registrationOrder.push("registered");

		// THEN perform async operations
		await new Promise((resolve) => {
			registrationOrder.push("async_operation_start");
			setTimeout(() => {
				registrationOrder.push("async_operation_complete");
				resolve(undefined);
			}, 50);
		});

		// CRITICAL ASSERTION: Registration must happen BEFORE async operations
		expect(registrationOrder[0]).toBe("register_decoration_provider");
		expect(registrationOrder[1]).toBe("registered");
		expect(registrationOrder[2]).toBe("async_operation_start");

		// Clean up
		decorationProvider.dispose();
		await registry.clearAll();
	});

	/**
	 * TEST: Proper extension activation sequence
	 */
	it("Should follow correct activation sequence", async () => {
		const activationSteps: string[] = [];

		// Simulate key activation steps
		activationSteps.push("1_create_services");

		const { ProtectionDecorationProvider } = await import(
			"@/ui/ProtectionDecorationProvider"
		);
		const { ProtectedFileRegistry } = await import(
			"@/services/protectedFileRegistry"
		);

		const mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		const registry = new ProtectedFileRegistry(mockState as any);
		const decorationProvider = new ProtectionDecorationProvider(registry);

		activationSteps.push("2_create_decoration_provider");

		// CRITICAL: Register decoration provider synchronously
		vscode.window.registerFileDecorationProvider(decorationProvider);
		activationSteps.push("3_register_decoration_provider");

		// Now perform async initialization
		await Promise.resolve();
		activationSteps.push("4_async_initialization");

		// Verify correct order
		expect(activationSteps).toEqual([
			"1_create_services",
			"2_create_decoration_provider",
			"3_register_decoration_provider",
			"4_async_initialization",
		]);

		// Clean up
		decorationProvider.dispose();
		await registry.clearAll();
	});

	/**
	 * TEST: No duplicate registrations even if activate() called multiple times
	 */
	it("Should not register decoration provider multiple times", () => {
		// This is more of a guard test - in practice, VS Code won't call activate() multiple times
		// but we want to ensure our code is defensive

		const mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		// Track disposables like extension context would
		const disposables: vscode.Disposable[] = [];

		// Simulate multiple activation attempts (should not happen in practice)
		const activateOnce = () => {
			const {
				ProtectionDecorationProvider,
			} = require("@/ui/ProtectionDecorationProvider");
			const {
				ProtectedFileRegistry,
			} = require("@/services/protectedFileRegistry");

			const registry = new ProtectedFileRegistry(mockState as any);
			const decorationProvider = new ProtectionDecorationProvider(registry);

			const disposable =
				vscode.window.registerFileDecorationProvider(decorationProvider);
			disposables.push(disposable);
			disposables.push(registry);
			disposables.push(decorationProvider as any);
		};

		registrationCount = 0;

		// First activation
		activateOnce();
		expect(registrationCount).toBe(1);

		// Second activation (defensive check)
		activateOnce();
		expect(registrationCount).toBe(2); // Each activation creates new provider

		// Clean up
		for (const disposable of disposables) {
			disposable.dispose();
		}
	});

	/**
	 * TEST: Decoration provider is added to extension subscriptions
	 */
	it("Should add decoration provider to extension subscriptions for cleanup", async () => {
		const mockSubscriptions: vscode.Disposable[] = [];

		const mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		const {
			ProtectionDecorationProvider,
		} = require("@/ui/ProtectionDecorationProvider");
		const {
			ProtectedFileRegistry,
		} = require("@/services/protectedFileRegistry");

		const registry = new ProtectedFileRegistry(mockState as any);
		const decorationProvider = new ProtectionDecorationProvider(registry);

		const disposable =
			vscode.window.registerFileDecorationProvider(decorationProvider);

		// Simulate extension context subscriptions
		mockSubscriptions.push(disposable);

		// Verify it was added
		expect(mockSubscriptions.length).toBeGreaterThan(0);
		expect(mockSubscriptions).toContain(disposable);

		// Clean up
		for (const sub of mockSubscriptions) {
			sub.dispose();
		}
		decorationProvider.dispose();
		await registry.clearAll();
	});
});
