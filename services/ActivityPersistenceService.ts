/**
 * ActivityPersistenceService - Persistent activity event storage
 *
 * Subscribes to Vreko events and persists them to workspaceState
 * for display in the activity feed. Decoupled from UI components.
 *
 * @module services/ActivityPersistenceService
 */

import * as vscode from "vscode";
import { VrekoEvent, type VrekoEventBus } from "../events";
import { logger } from "../utils/logger";

/** Activity event types */
export type ActivityEventType =
	| "auto-snapshot"
	| "manual-snapshot"
	| "restore"
	| "service-protection"
	| "risk-detected"
	| "ai-detected";

/** Activity event for persistence */
export interface PersistedActivityEvent {
	/** Unique event ID */
	id: string;
	/** Event type */
	type: ActivityEventType;
	/** Unix timestamp (ms) */
	timestamp: number;
	/** Associated file or snapshot ID */
	file: string;
	/** Number of files (for snapshot events) */
	fileCount?: number;
	/** Event source/trigger */
	source: string;
}

/** Configuration for activity persistence */
export interface ActivityPersistenceConfig {
	/** Maximum events to persist (default: 100) */
	maxEvents: number;
	/** Storage key in workspaceState (default: "vreko.activityEvents") */
	storageKey: string;
}

/**
 * Service for persisting activity events to workspaceState
 *
 * Subscribes to VrekoEventBus events and maintains a persistent
 * activity log that survives extension restarts.
 */
export class ActivityPersistenceService implements vscode.Disposable {
	private readonly events: PersistedActivityEvent[] = [];
	private readonly disposables: vscode.Disposable[] = [];
	private readonly workspaceState: vscode.Memento | undefined;
	private readonly config: ActivityPersistenceConfig;

	/** Event emitter for change notifications */
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly eventBus: VrekoEventBus,
		workspaceState?: vscode.Memento,
		config?: Partial<ActivityPersistenceConfig>,
	) {
		this.workspaceState = workspaceState;
		this.config = {
			maxEvents: 100,
			storageKey: "vreko.activityEvents",
			...config,
		};

		this.loadFromStorage();
		this.setupEventSubscriptions();
	}

	/**
	 * Get all persisted events (newest first)
	 */
	getEvents(): ReadonlyArray<PersistedActivityEvent> {
		return this.events;
	}

	/**
	 * Get events grouped by date
	 */
	getEventsByDate(): Map<string, PersistedActivityEvent[]> {
		const groups = new Map<string, PersistedActivityEvent[]>();
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		for (const event of this.events) {
			const eventDate = new Date(event.timestamp);
			const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

			let group: string;
			if (eventDay.getTime() === today.getTime()) {
				group = "Today";
			} else if (eventDay.getTime() === yesterday.getTime()) {
				group = "Yesterday";
			} else {
				group = eventDay.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				});
			}

			if (!groups.has(group)) {
				groups.set(group, []);
			}
			groups.get(group)?.push(event);
		}

		return groups;
	}

	/**
	 * Clear all events
	 */
	clear(): void {
		this.events.length = 0;
		void this.save();
		this._onDidChange.fire();
	}

	/**
	 * Load events from persistent storage
	 */
	private loadFromStorage(): void {
		if (!this.workspaceState) {
			return;
		}

		try {
			const stored = this.workspaceState.get<PersistedActivityEvent[]>(this.config.storageKey);
			if (stored && Array.isArray(stored)) {
				// Validate and filter valid events
				const validEvents = stored.filter(this.isValidEvent);
				this.events.push(...validEvents);
				logger.debug(`[ActivityPersistence] Loaded ${validEvents.length} events`);
			}
		} catch (error) {
			logger.warn("[ActivityPersistence] Failed to load events:", error);
		}
	}

	/**
	 * Save events to persistent storage
	 */
	private async save(): Promise<void> {
		if (!this.workspaceState) {
			return;
		}

		try {
			await this.workspaceState.update(this.config.storageKey, [...this.events]);
		} catch (error) {
			logger.warn("[ActivityPersistence] Failed to save events:", error);
		}
	}

	/**
	 * Add an event and persist
	 */
	private addEvent(event: PersistedActivityEvent): void {
		this.events.unshift(event);

		// Prune if over limit
		if (this.events.length > this.config.maxEvents) {
			this.events.length = this.config.maxEvents;
		}

		// Persist (fire and forget)
		void this.save();

		// Notify subscribers
		this._onDidChange.fire();
	}

	/**
	 * Validate event structure
	 */
	private isValidEvent(event: unknown): event is PersistedActivityEvent {
		if (typeof event !== "object" || event === null) {
			return false;
		}
		const e = event as Record<string, unknown>;
		return (
			typeof e.id === "string" &&
			typeof e.type === "string" &&
			typeof e.timestamp === "number" &&
			typeof e.file === "string" &&
			typeof e.source === "string"
		);
	}

	/**
	 * Setup event bus subscriptions
	 */
	private setupEventSubscriptions(): void {
		// Snapshot created
		this.disposables.push(
			this.eventBus.on(VrekoEvent.SNAPSHOT_CREATED, (data) => {
				this.addEvent({
					id: crypto.randomUUID(),
					type: "auto-snapshot",
					timestamp: Date.now(),
					file: data.snapshotId,
					fileCount: data.fileCount,
					source: data.trigger,
				});
			}),
		);

		// Snapshot restored
		this.disposables.push(
			this.eventBus.on(VrekoEvent.SNAPSHOT_RESTORED, (data) => {
				this.addEvent({
					id: crypto.randomUUID(),
					type: "restore",
					timestamp: Date.now(),
					file: data.snapshotId,
					fileCount: data.fileCount,
					source: `restored ${data.fileCount} files`,
				});
			}),
		);

		// File protected
		this.disposables.push(
			this.eventBus.on(VrekoEvent.FILE_PROTECTED, (data) => {
				this.addEvent({
					id: crypto.randomUUID(),
					type: "manual-snapshot",
					timestamp: Date.now(),
					file: data.filePath,
					source: "user",
				});
			}),
		);

		// File unprotected
		this.disposables.push(
			this.eventBus.on(VrekoEvent.FILE_UNPROTECTED, (data) => {
				this.addEvent({
					id: crypto.randomUUID(),
					type: "service-protection",
					timestamp: Date.now(),
					file: data.filePath,
					source: "user",
				});
			}),
		);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables.length = 0;
		this._onDidChange.dispose();
	}
}

/**
 * Create ActivityPersistenceService instance
 */
export function createActivityPersistenceService(
	eventBus: VrekoEventBus,
	workspaceState?: vscode.Memento,
	config?: Partial<ActivityPersistenceConfig>,
): ActivityPersistenceService {
	return new ActivityPersistenceService(eventBus, workspaceState, config);
}
