/**
 * Recovery Service Mock Factories (TDD GREEN Phase)
 * Provides mock factories for recovery service testing with VS Code event patterns
 */

import { vi } from "vitest";
import type * as vscode from "vscode";
import type {
	IRecoveryService,
	ISessionStatsProvider,
	RecoverySnapshot,
	SessionStats,
} from "../../src/services/recovery/interfaces";
import type { RecoveryFilterOptions } from "../../src/ui/tree/RecoveryTreeProvider";

/**
 * Mock extension of IRecoveryService with testing utilities
 */
export interface MockRecoveryService extends IRecoveryService {
	/**
	 * Testing utility to trigger onSnapshotCreated event
	 * @internal
	 */
	_fireSnapshotCreated(snapshot: RecoverySnapshot): void;

	/**
	 * Access to event emitter for advanced testing
	 * @internal
	 */
	_eventEmitter: {
		fire: (snapshot: RecoverySnapshot) => void;
		event: vscode.Event<RecoverySnapshot>;
	};
}

/**
 * Mock extension of ISessionStatsProvider with testing utilities
 */
export interface MockSessionStatsProvider extends ISessionStatsProvider {
	/**
	 * Testing utility to trigger onStatsChanged event
	 * @internal
	 */
	_fireStatsChanged(stats: SessionStats): void;

	/**
	 * Access to event emitter for advanced testing
	 * @internal
	 */
	_eventEmitter: {
		fire: (stats: SessionStats) => void;
		event: vscode.Event<SessionStats>;
	};
}

/**
 * Create a mock EventEmitter that mimics vscode.EventEmitter<T>
 * Follows VS Code Event pattern: https://code.visualstudio.com/api/references/vscode-api#Event
 */
function createMockEventEmitter<T>(): {
	fire: (data: T) => void;
	event: vscode.Event<T>;
} {
	const listeners: Array<(data: T) => void> = [];

	return {
		fire: (data: T) => {
			for (const listener of listeners) {
				listener(data);
			}
		},
		event: (listener: (data: T) => void) => {
			listeners.push(listener);
			return {
				dispose: () => {
					const index = listeners.indexOf(listener);
					if (index !== -1) {
						listeners.splice(index, 1);
					}
				},
			};
		},
	};
}

/**
 * Create a mock recovery service for testing
 *
 * **Usage:**
 * ```typescript
 * const mockService = createMockRecoveryService({
 *   getRecent: vi.fn().mockResolvedValue([...snapshots]),
 * });
 *
 * // Trigger event for testing
 * mockService._fireSnapshotCreated(newSnapshot);
 * ```
 *
 * @param overrides - Partial implementation overrides
 * @returns Mock recovery service with testing utilities
 */
export function createMockRecoveryService(
	overrides: Partial<IRecoveryService> = {},
): MockRecoveryService {
	const eventEmitter = createMockEventEmitter<RecoverySnapshot>();

	const mockService: MockRecoveryService = {
		// Default implementations (can be overridden)
		getRecent: vi.fn().mockResolvedValue([]),
		getAll: vi.fn().mockResolvedValue([]),
		restore: vi.fn().mockResolvedValue(undefined),
		restoreBatch: vi.fn().mockResolvedValue(undefined),
		onSnapshotCreated: eventEmitter.event,

		// Testing utilities
		_fireSnapshotCreated: (snapshot: RecoverySnapshot) => {
			eventEmitter.fire(snapshot);
		},
		_eventEmitter: eventEmitter,

		// Apply overrides
		...overrides,
	};

	return mockService;
}

/**
 * Create a mock session stats provider for testing
 *
 * **Usage:**
 * ```typescript
 * const mockProvider = createMockSessionStatsProvider({
 *   getStats: vi.fn().mockResolvedValue({
 *     duration: 30000,
 *     snapshotCount: 5,
 *     filesModified: 10,
 *     linesChanged: 250,
 *     tokensEstimated: 5000,
 *   }),
 * });
 *
 * // Trigger event for testing
 * mockProvider._fireStatsChanged(updatedStats);
 * ```
 *
 * @param overrides - Partial implementation overrides
 * @returns Mock session stats provider with testing utilities
 */
export function createMockSessionStatsProvider(
	overrides: Partial<ISessionStatsProvider> = {},
): MockSessionStatsProvider {
	const eventEmitter = createMockEventEmitter<SessionStats>();

	const mockProvider: MockSessionStatsProvider = {
		// Default implementations (can be overridden)
		getStats: vi.fn().mockResolvedValue({
			duration: 0,
			snapshotCount: 0,
			filesModified: 0,
			linesChanged: 0,
			tokensEstimated: 0,
		}),
		onStatsChanged: eventEmitter.event,

		// Testing utilities
		_fireStatsChanged: (stats: SessionStats) => {
			eventEmitter.fire(stats);
		},
		_eventEmitter: eventEmitter,

		// Apply overrides
		...overrides,
	};

	return mockProvider;
}

/**
 * Mock RecoveryTreeProvider for testing
 *
 * **Usage:**
 * ```typescript
 * const mockTreeProvider = createMockRecoveryTreeProvider();
 * mockCommandContext.recoveryTreeProvider = mockTreeProvider;
 *
 * // Verify filter was applied
 * expect(mockTreeProvider.setFilter).toHaveBeenCalledWith({ scope: "recent" });
 * ```
 *
 * @param overrides - Partial implementation overrides
 * @returns Mock recovery tree provider with testing utilities
 */
export function createMockRecoveryTreeProvider(overrides: Partial<{
	refresh: () => Promise<void>;
	setFilter: (options: RecoveryFilterOptions) => void;
	getFilter: () => RecoveryFilterOptions;
	dispose: () => void;
}> = {}) {
	return {
		refresh: vi.fn().mockResolvedValue(undefined),
		setFilter: vi.fn(),
		getFilter: vi.fn().mockReturnValue({}),
		dispose: vi.fn(),
		...overrides,
	};
}
