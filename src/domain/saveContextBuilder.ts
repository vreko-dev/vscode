/**
 * SaveContextBuilder
 *
 * Orchestrates SaveContext construction by:
 * 1. Collecting file change events
 * 2. Extracting file metadata (path, extension, size, etc.)
 * 3. Running detection engines in sequence
 * 4. Aggregating signals into SaveContext
 * 5. Validating SaveContext for AutoDecisionEngine
 *
 * Flow: FileChangeEvent[] → Detection Engines → SignalAggregator → SaveContext
 */

import type { FileInfo, SaveContext } from "./signalAggregator";

export interface FileChangeEvent {
	path: string;
	type: "created" | "modified" | "deleted";
	timestamp?: number;
	sizeBytes?: number;
	previousSize?: number;
}

export interface DetectionEngineResult {
	aiDetected: boolean;
	aiToolName?: string;
	aiConfidence: number;
	riskScore: number;
	burstDetected: boolean;
	containsCriticalFiles: boolean;
	criticalFileCount: number;
	sessionId: string;
	sessionFileCount: number;
	sessionDurationMs: number;
}

/**
 * Builds SaveContext from file events and detection results
 */
export class SaveContextBuilder {
	private repoId: string;
	private events: FileChangeEvent[] = [];

	constructor(repoId: string) {
		this.repoId = repoId;
		this.startTime = Date.now();
	}

	/**
	 * Add file change event
	 */
	addEvent(event: FileChangeEvent): SaveContextBuilder {
		this.events.push({
			...event,
			timestamp: event.timestamp || Date.now(),
		});
		return this;
	}

	/**
	 * Add multiple events
	 */
	addEvents(events: FileChangeEvent[]): SaveContextBuilder {
		events.forEach((e) => this.addEvent(e));
		return this;
	}

	/**
	 * Get collected events
	 */
	getEvents(): FileChangeEvent[] {
		return this.events;
	}

	/**
	 * Extract file metadata from events
	 */
	private extractFileMetadata(events: FileChangeEvent[]): FileInfo[] {
		return events.map((event) => {
			const extension = event.path.includes(".")
				? `.${event.path.split(".").pop() || ""}`
				: "";

			return {
				path: event.path,
				extension,
				sizeBytes: event.sizeBytes || 0,
				isNew: event.type === "created",
				isBinary: this.isBinaryFile(event.path),
				nextHash: "",
			};
		});
	}

	/**
	 * Check if file is binary
	 */
	private isBinaryFile(path: string): boolean {
		const binaryExtensions = [
			".png",
			".jpg",
			".jpeg",
			".gif",
			".pdf",
			".zip",
			".tar",
			".exe",
			".dll",
			".so",
		];

		const ext = path.slice(path.lastIndexOf(".")).toLowerCase();

		return binaryExtensions.includes(ext);
	}

	/**
	 * Build SaveContext with provided detection results
	 */
	build(detectionResults: DetectionEngineResult): SaveContext {
		const files = this.extractFileMetadata(this.events);

		return {
			repoId: this.repoId,
			timestamp: Date.now(),
			files,
			aiDetected: detectionResults.aiDetected,
			aiToolName: detectionResults.aiToolName,
			aiConfidence: detectionResults.aiConfidence,
			sessionId: detectionResults.sessionId,
			sessionFileCount: detectionResults.sessionFileCount,
			sessionDurationMs: detectionResults.sessionDurationMs,
			riskScore: detectionResults.riskScore,
			burstDetected: detectionResults.burstDetected,
			containsCriticalFiles: detectionResults.containsCriticalFiles,
			criticalFileCount: detectionResults.criticalFileCount,
		};
	}

	/**
	 * Validate SaveContext
	 */
	validate(context: SaveContext): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!context.repoId) {
			errors.push("Missing repoId");
		}

		if (!context.timestamp || context.timestamp <= 0) {
			errors.push("Invalid timestamp");
		}

		if (!Array.isArray(context.files)) {
			errors.push("Invalid files array");
		}

		if (context.riskScore < 0 || context.riskScore > 100) {
			errors.push("Risk score out of range [0, 100]");
		}

		if (context.aiConfidence < 0 || context.aiConfidence > 1) {
			errors.push("AI confidence out of range [0, 1]");
		}

		if (context.sessionFileCount < 0) {
			errors.push("Invalid session file count");
		}

		if (context.sessionDurationMs < 0) {
			errors.push("Invalid session duration");
		}

		if (context.criticalFileCount < 0) {
			errors.push("Invalid critical file count");
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Clear builder state
	 */
	reset(): void {
		this.events = [];
		this.startTime = Date.now();
	}
}

/**
 * Factory for creating SaveContextBuilder
 */
export function createSaveContextBuilder(repoId: string): SaveContextBuilder {
	return new SaveContextBuilder(repoId);
}
