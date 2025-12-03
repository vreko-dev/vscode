import { vi } from "vitest";

/**
 * Unified Mock Factory Module
 *
 * Provides centralized factory functions for creating test doubles for:
 * - VS Code API (window, workspace, commands, etc.)
 * - SnapBack services (Guardian, Storage, etc.)
 * - Extension context and infrastructure
 *
 * Benefits:
 * - Single source of truth for mock setup
 * - Easy to maintain and update across all tests
 * - Reduces duplication of mock code
 * - Enables consistent mock behavior across test suites
 */

// ============================================
// VS Code Extension Context Mock
// ============================================

export function createMockExtensionContext(overrides: any = {}) {
	const subscriptions: { dispose: () => void }[] = [];
	const globalState = new Map<string, unknown>();
	const workspaceState = new Map<string, unknown>();

	return {
		subscriptions,
		globalStorageUri: { fsPath: "/test-global-storage" },
		storageUri: { fsPath: "/test-storage" },
		extensionUri: { fsPath: "/test-extension" },
		extensionPath: "/test-extension",
		globalState: {
			get: (key: string) => globalState.get(key),
			update: (key: string, value: unknown) => globalState.set(key, value),
			keys: () => Array.from(globalState.keys()),
		},
		workspaceState: {
			get: (key: string) => workspaceState.get(key),
			update: (key: string, value: unknown) => workspaceState.set(key, value),
			keys: () => Array.from(workspaceState.keys()),
		},
		...overrides,
	};
}

// ============================================
// Guardian Mock Factory
// ============================================

export function createMockGuardian(overrides: any = {}) {
	return {
		analyze: vi.fn().mockResolvedValue({ risk: "low", score: 0, findings: [] }),
		detectSecrets: vi.fn().mockResolvedValue([]),
		evaluatePolicy: vi.fn().mockResolvedValue({ allowed: true }),
		validateSnapshot: vi.fn().mockResolvedValue(true),
		canRestore: vi.fn().mockResolvedValue(true),
		checkIntegrity: vi.fn().mockResolvedValue({ valid: true }),
		quickCheckDoc: vi.fn().mockResolvedValue({
			score: 0.0,
			factors: [],
			severity: "low",
		}),
		...overrides,
	};
}

// ============================================
// File System Storage Mock Factory
// ============================================

export function createMockFileSystemStorage(overrides: any = {}) {
	const storage = new Map<string, string>();

	return {
		read: vi.fn((key: string) => storage.get(key)),
		write: vi.fn().mockImplementation((key: string, value: string) => {
			storage.set(key, value);
			return Promise.resolve();
		}),
		delete: vi.fn().mockImplementation((key: string) => {
			storage.delete(key);
			return Promise.resolve();
		}),
		exists: vi.fn((key: string) => storage.has(key)),
		list: vi.fn(() => Array.from(storage.keys())),
		clear: vi.fn(() => {
			storage.clear();
			return Promise.resolve();
		}),
		_getStorage: () => storage, // For testing purposes
		...overrides,
	};
}

// ============================================
// Document Mock Factory
// ============================================

export function createMockDocument(overrides: any = {}) {
	return {
		uri: {
			fsPath: "/test/file.ts",
			path: "/test/file.ts",
			scheme: "file",
		},
		fileName: "/test/file.ts",
		languageId: "typescript",
		version: 1,
		isDirty: false,
		isUntitled: false,
		isClosed: false,
		eol: 1,
		lineCount: 10,
		getText: vi.fn(() => "const x = 1;"),
		lineAt: vi.fn(),
		offsetAt: vi.fn(),
		positionAt: vi.fn(),
		validateRange: vi.fn(),
		validatePosition: vi.fn(),
		getWordRangeAtPosition: vi.fn(),
		save: vi.fn().mockResolvedValue(true),
		...overrides,
	};
}

// ============================================
// Text Editor Mock Factory
// ============================================

export function createMockTextEditor(document: any = null) {
	const doc = document || createMockDocument();

	return {
		document: doc,
		selection: {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 0 },
		},
		selections: [],
		options: { tabSize: 4, insertSpaces: true },
		viewColumn: 1,
		edit: vi.fn(async (callback: any) => {
			const editBuilder = {
				insert: vi.fn(),
				delete: vi.fn(),
				replace: vi.fn(),
			};
			callback(editBuilder);
			return true;
		}),
		setDecorations: vi.fn(),
		revealRange: vi.fn(),
	};
}

// ============================================
// Will Save Text Document Event Mock
// ============================================

export function createMockWillSaveEvent(document: any = null) {
	const doc = document || createMockDocument();
	const waitUntilPromises: Promise<unknown>[] = [];

	return {
		document: doc,
		reason: 1, // Manual save
		waitUntil: vi.fn((promise: Promise<unknown>) => {
			waitUntilPromises.push(promise);
		}),
		_getWaitUntilPromises: () => waitUntilPromises,
	};
}

// ============================================
// Workspace Folder Mock Factory
// ============================================

export function createMockWorkspaceFolder(
	name: string = "test-workspace",
	index: number = 0,
) {
	return {
		uri: { fsPath: `/workspace/${name}`, path: `/workspace/${name}` },
		name,
		index,
	};
}

// ============================================
// Snapshot Mock Factory
// ============================================

export function createMockSnapshot(overrides: any = {}) {
	const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

	return {
		id,
		name: "Test Snapshot",
		createdAt: new Date().toISOString(),
		trigger: "manual" as const,
		sessionId: undefined,
		files: {},
		...overrides,
	};
}

// ============================================
// Session Mock Factory
// ============================================

export function createMockSession(overrides: any = {}) {
	const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

	return {
		id,
		startedAt: new Date().toISOString(),
		finalizedAt: undefined,
		status: "active" as const,
		files: [],
		snapshots: [],
		...overrides,
	};
}

// ============================================
// API Client Mock Factory
// ============================================

export function createMockApiClient(overrides: any = {}) {
	return {
		analyzeFiles: vi.fn().mockResolvedValue({
			risk: "low",
			score: 0,
			findings: [],
		}),
		detectSecrets: vi.fn().mockResolvedValue([]),
		evaluatePolicy: vi.fn().mockResolvedValue({ allowed: true }),
		healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
		...overrides,
	};
}

// ============================================
// Storage Manager Mock Factory
// ============================================

export function createMockStorageManager(overrides: any = {}) {
	const snapshots = new Map<string, any>();
	const sessions = new Map<string, any>();
	const blobs = new Map<string, string>();

	return {
		// Blob operations
		storeBlob: vi.fn(async (content: string) => {
			const hash = `blob-${Date.now()}`;
			blobs.set(hash, content);
			return hash;
		}),
		retrieveBlob: vi.fn(async (hash: string) => blobs.get(hash)),

		// Snapshot operations
		createSnapshot: vi.fn(async (data: any) => {
			const snapshot = createMockSnapshot(data);
			snapshots.set(snapshot.id, snapshot);
			return snapshot;
		}),
		getSnapshot: vi.fn(async (id: string) => snapshots.get(id)),
		listSnapshots: vi.fn(async () => Array.from(snapshots.values())),
		deleteSnapshot: vi.fn(async (id: string) => {
			snapshots.delete(id);
		}),

		// Session operations
		createSession: vi.fn(async (data: any) => {
			const session = createMockSession(data);
			sessions.set(session.id, session);
			return session;
		}),
		getSession: vi.fn(async (id: string) => sessions.get(id)),
		listSessions: vi.fn(async () => Array.from(sessions.values())),
		deleteSession: vi.fn(async (id: string) => {
			sessions.delete(id);
		}),

		_getSnapshots: () => snapshots, // For testing purposes
		_getSessions: () => sessions, // For testing purposes
		_getBlobs: () => blobs, // For testing purposes
		...overrides,
	};
}

// ============================================
// Operation Coordinator Mock Factory
// ============================================

export function createMockOperationCoordinator(overrides: any = {}) {
	return {
		coordinateSnapshotCreation: vi.fn().mockResolvedValue(`snap-${Date.now()}`),
		createSnapshot: vi.fn().mockResolvedValue(createMockSnapshot()),
		restoreSnapshot: vi.fn().mockResolvedValue(true),
		deleteSnapshot: vi.fn().mockResolvedValue(true),
		listSnapshots: vi
			.fn()
			.mockResolvedValue([createMockSnapshot(), createMockSnapshot()]),
		createSession: vi.fn().mockResolvedValue(createMockSession()),
		finalizeSession: vi.fn().mockResolvedValue(true),
		restoreToSnapshot: vi.fn().mockResolvedValue(true),
		...overrides,
	};
}

// ============================================
// Notification Manager Mock Factory
// ============================================

export function createMockNotificationManager(overrides: any = {}) {
	return {
		showInfo: vi.fn().mockResolvedValue(undefined),
		showWarning: vi.fn().mockResolvedValue(undefined),
		showError: vi.fn().mockResolvedValue(undefined),
		showQuickPick: vi.fn().mockResolvedValue(undefined),
		showProgress: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

// ============================================
// Logger Mock Factory
// ============================================

export function createMockLogger(overrides: any = {}) {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		trace: vi.fn(),
		setLevel: vi.fn(),
		getLevel: vi.fn(() => "info"),
		...overrides,
	};
}

// ============================================
// Configuration Mock Factory
// ============================================

export function createMockConfiguration(defaults: any = {}) {
	const config = new Map(Object.entries(defaults));

	return {
		get: vi.fn((key: string) => config.get(key)),
		update: vi.fn((key: string, value: any) => {
			config.set(key, value);
			return Promise.resolve();
		}),
		has: vi.fn((key: string) => config.has(key)),
		_getConfig: () => config,
	};
}

// ============================================
// Event Emitter Mock Factory
// ============================================

export function createMockEventEmitter<T = any>() {
	const listeners: Array<(event: T) => void> = [];

	return {
		event: vi.fn((listener: (event: T) => void) => {
			listeners.push(listener);
			return {
				dispose: () => {
					const index = listeners.indexOf(listener);
					if (index > -1) {
						listeners.splice(index, 1);
					}
				},
			};
		}),
		fire: vi.fn((event: T) => {
			listeners.forEach((listener) => listener(event));
		}),
		dispose: vi.fn(() => {
			listeners.length = 0;
		}),
		_getListeners: () => listeners,
	};
}

// ============================================
// Test Workspace Factory (for file system simulation)
// ============================================

export async function createTestWorkspace(files: Record<string, string> = {}) {
	const workspace = new Map(Object.entries(files));

	return {
		files: workspace,
		readFile: (path: string) => workspace.get(path),
		writeFile: (path: string, content: string) => workspace.set(path, content),
		deleteFile: (path: string) => workspace.delete(path),
		listFiles: () => Array.from(workspace.keys()),
		clear: () => workspace.clear(),
		_getWorkspace: () => workspace,
	};
}

// ============================================
// Performance Testing Utilities
// ============================================

export function createPerformanceMonitor() {
	const measurements: Array<{
		name: string;
		duration: number;
		timestamp: number;
	}> = [];

	return {
		start: vi.fn((name: string) => {
			const timestamp = performance.now();
			return () => {
				const duration = performance.now() - timestamp;
				measurements.push({ name, duration, timestamp });
				return duration;
			};
		}),
		measure: vi.fn(async (name: string, fn: () => Promise<void> | void) => {
			const start = performance.now();
			try {
				await fn();
			} finally {
				const duration = performance.now() - start;
				measurements.push({ name, duration, timestamp: start });
			}
		}),
		getMeasurements: () => [...measurements],
		getAverage: (name: string) => {
			const relevant = measurements.filter((m) => m.name === name);
			if (relevant.length === 0) return 0;
			return relevant.reduce((sum, m) => sum + m.duration, 0) / relevant.length;
		},
		clear: () => {
			measurements.length = 0;
		},
	};
}
