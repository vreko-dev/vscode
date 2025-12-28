/**
 * Integration tests for file decoration provider registration
 *
 * PREVENTS REGRESSION: Duplicate decorator registration causing old decorators to show
 * See commit fe648f9: Heat decorations weren't showing due to duplicate registration
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";

describe("File Decoration Provider Registration", () => {
	let registeredProviders: Map<string, unknown>;
	let originalRegister: typeof vscode.window.registerFileDecorationProvider;

	beforeEach(() => {
		registeredProviders = new Map();

		// Mock VS Code's registerFileDecorationProvider to track registrations
		originalRegister = vscode.window.registerFileDecorationProvider;
		vscode.window.registerFileDecorationProvider = vi.fn((provider: any) => {
			const providerType = provider.constructor.name;

			if (registeredProviders.has(providerType)) {
				throw new Error(
					`Duplicate file decoration provider registration detected: ${providerType}. ` +
					`VS Code only allows ONE provider per type. Check extension.ts and phase5-registration.ts.`
				);
			}

			registeredProviders.set(providerType, provider);
			return { dispose: () => registeredProviders.delete(providerType) };
		});
	});

	it("should register FileHealthDecorationProvider exactly once", async () => {
		// This would fail if both extension.ts and phase5-registration.ts register the provider
		const { activate } = await import("../../src/extension");
		const mockContext = createMockExtensionContext();

		await activate(mockContext);

		const healthProviderCount = Array.from(registeredProviders.keys())
			.filter(name => name.includes("FileHealth"))
			.length;

		expect(healthProviderCount).toBe(1);
		expect(registeredProviders.has("FileHealthDecorationProvider")).toBe(true);
	});

	it("should register ProtectionDecorationProvider exactly once", async () => {
		const { activate } = await import("../../src/extension");
		const mockContext = createMockExtensionContext();

		await activate(mockContext);

		const protectionProviderCount = Array.from(registeredProviders.keys())
			.filter(name => name.includes("Protection"))
			.length;

		expect(protectionProviderCount).toBe(1);
	});

	it("should register heat-based decorations in Phase 5 only", async () => {
		// Import phase5 registration directly
		const { initializePhase5Registration } = await import("../../src/activation/phase5-registration");
		const { initializePhase4Providers } = await import("../../src/activation/phase4-providers");

		const mockContext = createMockExtensionContext();
		const mockPhase3 = createMockPhase3Result();
		const mockStorage = createMockStorage();
		const mockRegistry = createMockProtectedFileRegistry();

		// Phase 4 creates the provider
		const phase4Result = await initializePhase4Providers(
			mockContext,
			mockPhase3,
			mockStorage,
			mockRegistry,
			"/test/workspace"
		);

		// Before Phase 5, no decorators registered
		expect(registeredProviders.size).toBe(0);

		// Phase 5 registers the provider
		await initializePhase5Registration(mockContext, phase4Result, mockPhase3.sessionCoordinator);

		// After Phase 5, decorators are registered
		expect(registeredProviders.has("FileHealthDecorationProvider")).toBe(true);
		expect(registeredProviders.has("ProtectionDecorationProvider")).toBe(true);
	});

	it("should throw error if same decorator registered twice", () => {
		const mockProvider = { provideFileDecoration: vi.fn() };
		mockProvider.constructor = { name: "TestProvider" };

		// First registration succeeds
		expect(() => {
			vscode.window.registerFileDecorationProvider(mockProvider as any);
		}).not.toThrow();

		// Second registration fails
		expect(() => {
			vscode.window.registerFileDecorationProvider(mockProvider as any);
		}).toThrow(/Duplicate file decoration provider/);
	});
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockExtensionContext(): vscode.ExtensionContext {
	return {
		subscriptions: [],
		extensionUri: vscode.Uri.file("/test/extension"),
		globalState: {
			get: vi.fn(),
			update: vi.fn(),
			keys: vi.fn(() => []),
			setKeysForSync: vi.fn(),
		},
		workspaceState: {
			get: vi.fn(),
			update: vi.fn(),
			keys: vi.fn(() => []),
		},
		secrets: {
			get: vi.fn(),
			store: vi.fn(),
			delete: vi.fn(),
			onDidChange: vi.fn(),
		},
		extensionPath: "/test/extension",
		storagePath: "/test/storage",
		globalStoragePath: "/test/global-storage",
		logPath: "/test/logs",
		extension: {} as any,
		environmentVariableCollection: {} as any,
		extensionMode: 3,
		storageUri: vscode.Uri.file("/test/storage"),
		globalStorageUri: vscode.Uri.file("/test/global-storage"),
		logUri: vscode.Uri.file("/test/logs"),
		asAbsolutePath: (path: string) => `/test/extension/${path}`,
		languageModelAccessInformation: {} as any,
	} as any;
}

function createMockPhase3Result() {
	return {
		snapshotManager: {} as any,
		operationCoordinator: {} as any,
		sessionCoordinator: {
			handleWindowBlur: vi.fn(),
		} as any,
		workflowIntegration: {} as any,
		notificationManager: {} as any,
		workspaceMemoryManager: {} as any,
		conflictResolver: {} as any,
		protectionService: {} as any,
		snapshotSummaryProvider: {} as any,
		milestoneService: {} as any,
	};
}

function createMockStorage() {
	return {
		getSnapshot: vi.fn(),
		listSnapshots: vi.fn(() => Promise.resolve([])),
	} as any;
}

function createMockProtectedFileRegistry() {
	return {
		isProtected: vi.fn(() => false),
		list: vi.fn(() => Promise.resolve([])),
		onProtectionChanged: vi.fn(() => ({ dispose: vi.fn() })),
	} as any;
}
