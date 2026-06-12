/**
 * Ring Buffer Utility
 *
 * Lightweight circular buffer for tracking recent events.
 * 10 capacity internal, 1 visible in UI.
 *
 * @module signals/RingBuffer
 * @see docs/plans/vreko_signal_communicaton.md Appendix A.5
 */

import type { RingBufferEntry } from "./types";

/**
 * Ring buffer for efficient event tracking
 */
export class RingBuffer {
	private buffer: (RingBufferEntry | undefined)[];
	private head = 0;
	private count = 0;

	constructor(private capacity: number) {
		this.buffer = new Array(capacity);
	}

	/**
	 * Add an entry to the buffer
	 */
	push(entry: RingBufferEntry): void {
		this.buffer[this.head] = entry;
		this.head = (this.head + 1) % this.capacity;
		this.count = Math.min(this.count + 1, this.capacity);
	}

	/**
	 * Get the most recent entry
	 */
	peek(): RingBufferEntry | undefined {
		if (this.count === 0) {
			return undefined;
		}
		const idx = (this.head - 1 + this.capacity) % this.capacity;
		return this.buffer[idx];
	}

	/**
	 * Get all entries as array (oldest first)
	 */
	toArray(): RingBufferEntry[] {
		const result: RingBufferEntry[] = [];
		for (let i = 0; i < this.count; i++) {
			const idx = (this.head - this.count + i + this.capacity) % this.capacity;
			if (this.buffer[idx] !== undefined) {
				result.push(this.buffer[idx]!);
			}
		}
		return result;
	}

	/**
	 * Get entries in reverse order (newest first)
	 */
	toArrayReversed(): RingBufferEntry[] {
		const result: RingBufferEntry[] = [];
		for (let i = 0; i < this.count; i++) {
			const idx = (this.head - 1 - i + this.capacity) % this.capacity;
			if (this.buffer[idx] !== undefined) {
				result.push(this.buffer[idx]!);
			}
		}
		return result;
	}

	/**
	 * Clear all entries
	 */
	clear(): void {
		this.buffer = new Array(this.capacity);
		this.head = 0;
		this.count = 0;
	}

	/**
	 * Get current size
	 */
	size(): number {
		return this.count;
	}

	/**
	 * Check if empty
	 */
	isEmpty(): boolean {
		return this.count === 0;
	}
}
