/**
 * Centralized Mock Factories for VS Code Extension Tests
 *
 * This file provides complete, consistent mocks for commonly-used services.
 * Using centralized mocks ensures:
 * 1. Tests don't break when implementation adds methods
 * 2. Less boilerplate in individual test files
 * 3. Consistent mock behavior across the test suite
 *
 * Usage:
 * ```typescript
 * import { createMockTelemetryService, createMockDaemonBridge } from "../mocks";
 *
 * vi.mock("../../src/analytics/telemetry", () => ({
 *   TelemetryService: createMockTelemetryService(),
 * }));
 * ```
 */

import { vi } from "vitest";

// =============================================================================
// TELEMETRY SERVICE MOCK
// =============================================================================

/**
 * Complete TelemetryService mock with all methods
 */
export function createMockTelemetryService() {
	const instance = {
		track: vi.fn().mockResolvedValue(undefined),
		scrub: vi.fn((s: string) => `hashed-${s}`),
		enabled: true,
		proxy: {
			trackEvent: vi.fn().mockResolvedValue(undefined),
		},
	};

	return {
		getInstance: vi.fn(() => instance),
		isInitialized: vi.fn(() => true),
		// Direct instance access for tests that need it
		_instance: instance,
	};
}

// =============================================================================
// DAEMON BRIDGE MOCK
// =============================================================================

/**
 * Complete DaemonBridge mock with all event emitters and methods
 */
export function createMockDaemonBridge(overrides: Record<string, any> = {}) {
	const eventEmitters = {
		_onRiskDetected: { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() },
		_onSnapshotCreated: { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() },
		_onDaemonShuttingDown: { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() },
		_onGuardChanged: { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() },
		_onConnectionChanged: { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() },
		_onSessionStarted: { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() },
		_onSessionEnded: { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() },
	};

	return {
		// Connection state
		isConnected: vi.fn(() => true),
		connect: vi.fn().mockResolvedValue(true),
		disconnect: vi.fn(),
		isHealthy: vi.fn(() => true),
		getState: vi.fn(() => "connected"),

		// Event emitters
		onRiskDetected: eventEmitters._onRiskDetected.event,
		onSnapshotCreated: eventEmitters._onSnapshotCreated.event,
		onDaemonShuttingDown: eventEmitters._onDaemonShuttingDown.event,
		onGuardChanged: eventEmitters._onGuardChanged.event,
		onConnectionChanged: eventEmitters._onConnectionChanged.event,
		onSessionStarted: eventEmitters._onSessionStarted.event,
		onSessionEnded: eventEmitters._onSessionEnded.event,

		// IPC methods
		request: vi.fn().mockResolvedValue({}),
		ping: vi.fn().mockResolvedValue({ pong: true, uptime: 100 }),
		getStatus: vi.fn().mockResolvedValue({ connected: true, version: "1.0.0" }),

		// Snapshot operations
		createSnapshot: vi.fn().mockResolvedValue({ id: "snap-123" }),
		listSnapshots: vi.fn().mockResolvedValue([]),
		restoreSnapshot: vi.fn().mockResolvedValue(true),

		// Session operations
		beginSession: vi.fn().mockResolvedValue({ sessionId: "session-123" }),
		endSession: vi.fn().mockResolvedValue(undefined),

		// File watching
		subscribeToFileWatching: vi.fn().mockResolvedValue(true),
		unsubscribeFromFileWatching: vi.fn().mockResolvedValue(true),

		// Intelligence
		addLearning: vi.fn().mockResolvedValue(undefined),
		getContext: vi.fn().mockResolvedValue(null),
		validateQuick: vi.fn().mockResolvedValue({ valid: true }),

		// Lifecycle
		dispose: vi.fn(),

		// Internal access for tests
		_eventEmitters: eventEmitters,

		// Overrides
		...overrides,
	};
}

// =============================================================================
// HEAT TRACKER MOCK
// =============================================================================

/**
 * Complete HeatTracker mock with all methods
 */
export function createMockHeatTracker() {
	return {
		recordSave: vi.fn(),
		recordAIEdit: vi.fn(),
		recordUndoRedo: vi.fn(),
		resetFile: vi.fn(),
		getSummary: vi.fn().mockReturnValue({
			totalFiles: 0,
			hotFiles: [],
			warmFiles: [],
		}),
		getFileHeat: vi.fn().mockReturnValue(null),
		onHeatChanged: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		dispose: vi.fn(),
	};
}

// =============================================================================
// FILE HEAT DECORATION PROVIDER MOCK
// =============================================================================

/**
 * Complete FileHeatDecorationProvider mock
 */
export function createMockDecorationProvider() {
	return {
		forceUpdate: vi.fn(),
		provideFileDecoration: vi.fn().mockReturnValue(null),
		onDidChangeFileDecorations: { event: vi.fn() },
		dispose: vi.fn(),
	};
}

// =============================================================================
// SIGNAL BRIDGE MOCK
// =============================================================================

/**
 * Complete SignalBridge mock
 */
export function createMockSignalBridge() {
	return {
		detectAI: vi.fn().mockReturnValue({ tool: null, confidence: 0, method: "none" }),
		computeBurst: vi.fn().mockReturnValue(null),
		dispose: vi.fn(),
	};
}

// =============================================================================
// INTELLIGENCE SERVICE MOCK
// =============================================================================

/**
 * Complete IntelligenceService mock
 */
export function createMockIntelligenceService() {
	return {
		getIntelligence: vi.fn().mockResolvedValue({
			reportViolation: vi.fn().mockResolvedValue(undefined),
			recordLearning: vi.fn().mockResolvedValue(undefined),
			startSession: vi.fn().mockResolvedValue({ sessionId: "session-123" }),
			endSession: vi.fn().mockResolvedValue(undefined),
			recordFileModification: vi.fn().mockResolvedValue(undefined),
		}),
		getWorkspaceVitals: vi.fn().mockResolvedValue({
			current: vi.fn().mockReturnValue(null),
			getThresholdMultiplier: vi.fn().mockReturnValue(1.0),
			getAgentGuidance: vi.fn().mockReturnValue(null),
			recordBehavior: vi.fn(),
			recordEdit: vi.fn(),
			recordTest: vi.fn(),
		}),
		reportViolation: vi.fn().mockResolvedValue(undefined),
	};
}

// =============================================================================
// TELEMETRY PROXY MOCK
// =============================================================================

/**
 * Complete TelemetryProxy mock
 */
export function createMockTelemetryProxy() {
	return {
		trackEvent: vi.fn().mockResolvedValue(undefined),
		flush: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
	};
}

// =============================================================================
// MCP CLIENT MOCK
// =============================================================================

/**
 * Complete MCP client mock
 */
export function createMockMCPClient() {
	return {
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn(),
		healthCheck: vi.fn().mockResolvedValue({ ready: true }),
		sendRequest: vi.fn().mockResolvedValue({ success: true }),
		onConnectionChanged: { event: vi.fn() },
		dispose: vi.fn(),
	};
}

// =============================================================================
// VS CODE DISPOSABLE CLASS
// =============================================================================

/**
 * Mock Disposable class that can be extended
 * Use this when tests need to extend vscode.Disposable
 */
export class MockDisposable {
	callback?: () => void;

	constructor(callback?: () => void) {
		this.callback = callback;
	}

	dispose(): void {
		if (this.callback) {
			this.callback();
		}
	}

	static from(...disposables: MockDisposable[]): MockDisposable {
		return new MockDisposable(() => {
			for (const d of disposables) {
				d.dispose();
			}
		});
	}
}

// =============================================================================
// LOGGER MOCK
// =============================================================================

/**
 * Complete logger mock
 */
export function createMockLogger() {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		trace: vi.fn(),
		child: vi.fn(() => createMockLogger()),
	};
}
