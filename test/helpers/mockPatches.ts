import { vi } from "vitest";

/**
 * Patches for adding missing methods to existing mocks
 * Used during recovery to fix test failures
 */

interface MockFile {
	path: string;
	protectionLevel?: string;
}

interface MockRegistry {
	getProtectionLevel?: ReturnType<typeof vi.fn>;
	total?: ReturnType<typeof vi.fn>;
	updateProtectionLevel?: ReturnType<typeof vi.fn>;
	list?: () => MockFile[];
}

export function patchRegistryMockWithProtectionLevel(
	mockRegistry: MockRegistry,
	defaultLevel: "watch" | "warn" | "block" = "watch",
) {
	if (!mockRegistry.getProtectionLevel) {
		mockRegistry.getProtectionLevel = vi.fn((path: string) => {
			const files = mockRegistry.list?.() || [];
			const file = files.find((f) => f.path === path);
			return file?.protectionLevel || defaultLevel;
		});
	}
	if (!mockRegistry.total) {
		mockRegistry.total = vi.fn().mockResolvedValue(0);
	}
	if (!mockRegistry.updateProtectionLevel) {
		mockRegistry.updateProtectionLevel = vi.fn().mockResolvedValue(undefined);
	}
	return mockRegistry;
}

export function createFullRegistryMock(options?: {
	defaultLevel?: "watch" | "warn" | "block";
	protectedFiles?: Array<{ path: string; level: "watch" | "warn" | "block" }>;
}) {
	const protectedFiles = options?.protectedFiles || [];
	const defaultLevel = options?.defaultLevel || "watch";

	return {
		list: vi.fn().mockResolvedValue(
			protectedFiles.map((f) => ({
				id: `mock-${f.path}`,
				path: f.path,
				label: f.path,
				protectionLevel: f.level,
			})),
		),
		total: vi.fn().mockResolvedValue(protectedFiles.length),
		add: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		updateProtectionLevel: vi.fn().mockResolvedValue(undefined),
		getProtectionLevel: vi.fn((path: string) => {
			const file = protectedFiles.find((f) => f.path === path);
			return file?.level || defaultLevel;
		}),
		markCheckpoint: vi.fn().mockResolvedValue(undefined),
		onDidChangeProtectedFiles: {
			event: vi.fn(),
			fire: vi.fn(),
		},
		dispose: vi.fn(),
	};
}
