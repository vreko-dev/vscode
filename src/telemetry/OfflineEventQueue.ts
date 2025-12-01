import { randomUUID } from "node:crypto";
import type * as vscode from "vscode";

/**
 * Queued telemetry event with metadata for retry logic
 */
export interface QueuedEvent {
	/** Unique identifier for this event */
	id: string;
	/** Event name */
	event: string;
	/** Event properties */
	properties: Record<string, unknown>;
	/** Timestamp when event was created */
	timestamp: number;
	/** Number of retry attempts */
	retryCount: number;
}

/**
 * Configuration options for OfflineEventQueue
 */
export interface OfflineEventQueueOptions {
	/** Maximum number of events to keep in queue */
	maxSize?: number;
	/** Maximum number of retry attempts per event */
	maxRetries?: number;
	/** Base delay for exponential backoff (ms) */
	baseRetryDelay?: number;
	/** Maximum retry delay cap (ms) */
	maxRetryDelay?: number;
	/** Maximum age of events in ms (events older than this are dropped) */
	maxAge?: number;
}

const STORAGE_KEY = "snapback.offlineEventQueue";
const DEFAULT_MAX_SIZE = 100;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_RETRY_DELAY = 1000; // 1 second
const DEFAULT_MAX_RETRY_DELAY = 60000; // 60 seconds
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Persistent queue for offline telemetry events
 *
 * Features:
 * - Persists to VS Code globalState
 * - Automatic size limiting with LRU eviction
 * - Exponential backoff retry logic
 * - Age-based event expiration
 */
export class OfflineEventQueue {
	private events: QueuedEvent[] = [];
	private readonly context: vscode.ExtensionContext;
	private readonly maxSize: number;
	private readonly maxRetries: number;
	private readonly baseRetryDelay: number;
	private readonly maxRetryDelay: number;
	private readonly maxAge: number;

	constructor(
		context: vscode.ExtensionContext,
		options: OfflineEventQueueOptions = {},
	) {
		this.context = context;
		this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
		this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
		this.baseRetryDelay = options.baseRetryDelay ?? DEFAULT_BASE_RETRY_DELAY;
		this.maxRetryDelay = options.maxRetryDelay ?? DEFAULT_MAX_RETRY_DELAY;
		this.maxAge = options.maxAge ?? DEFAULT_MAX_AGE;

		this.loadFromStorage();
	}

	/**
	 * Load events from persistent storage
	 */
	private loadFromStorage(): void {
		try {
			const persisted = this.context.globalState.get<QueuedEvent[]>(
				STORAGE_KEY,
				[],
			);

			// Validate and filter events
			const now = Date.now();
			const validEvents = Array.isArray(persisted)
				? persisted.filter((event) => {
						// Validate required fields
						if (
							!event ||
							typeof event !== "object" ||
							!event.id ||
							!event.event ||
							typeof event.timestamp !== "number" ||
							typeof event.retryCount !== "number"
						) {
							return false;
						}

						// Check age
						if (now - event.timestamp > this.maxAge) {
							return false;
						}

						return true;
					})
				: [];

			// Enforce max size (keep most recent)
			if (validEvents.length > this.maxSize) {
				this.events = validEvents.slice(-this.maxSize);
			} else {
				this.events = validEvents;
			}
		} catch {
			// If loading fails, start with empty queue
			this.events = [];
		}
	}

	/**
	 * Persist events to storage
	 */
	private persist(): void {
		this.context.globalState.update(STORAGE_KEY, this.events);
	}

	/**
	 * Add event to queue
	 */
	enqueue(event: string, properties: Record<string, unknown>): void {
		const queuedEvent: QueuedEvent = {
			id: randomUUID(),
			event,
			properties,
			timestamp: Date.now(),
			retryCount: 0,
		};

		this.events.push(queuedEvent);

		// Enforce size limit (drop oldest)
		if (this.events.length > this.maxSize) {
			this.events.shift();
		}

		this.persist();
	}

	/**
	 * Remove and return first event
	 */
	dequeue(): QueuedEvent | null {
		if (this.events.length === 0) {
			return null;
		}

		const event = this.events.shift();
		if (!event) {
			throw new Error("No events in queue");
		}
		this.persist();
		return event;
	}

	/**
	 * Get first event without removing it
	 */
	peek(): QueuedEvent | null {
		return this.events.length > 0 ? this.events[0] : null;
	}

	/**
	 * Increment retry count for event
	 */
	incrementRetryCount(eventId: string): void {
		const event = this.events.find((e) => e.id === eventId);
		if (event) {
			event.retryCount++;
			this.persist();
		}
	}

	/**
	 * Remove event by ID
	 */
	removeById(eventId: string): void {
		const index = this.events.findIndex((e) => e.id === eventId);
		if (index !== -1) {
			this.events.splice(index, 1);
			this.persist();
		}
	}

	/**
	 * Clear all events
	 */
	clear(): void {
		this.events = [];
		this.persist();
	}

	/**
	 * Get all events (returns copy)
	 */
	getAll(): QueuedEvent[] {
		return [...this.events];
	}

	/**
	 * Get current queue size
	 */
	size(): number {
		return this.events.length;
	}

	/**
	 * Check if queue is empty
	 */
	isEmpty(): boolean {
		return this.events.length === 0;
	}

	/**
	 * Calculate retry delay with exponential backoff
	 * Formula: min(baseDelay * 2^retryCount, maxDelay)
	 */
	getRetryDelay(retryCount: number): number {
		const delay = this.baseRetryDelay * 2 ** retryCount;
		return Math.min(delay, this.maxRetryDelay);
	}

	/**
	 * Check if event should be retried
	 */
	shouldRetry(event: QueuedEvent): boolean {
		return event.retryCount < this.maxRetries;
	}
}
