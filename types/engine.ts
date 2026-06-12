/**
 * Engine Types & Stubs - Local definitions for thin client architecture
 *
 * Replaces @vreko/engine, @vreko/engine/signals, @vreko/engine/runtime imports.
 */

// Re-export canonical FileChange from fileChanges.ts (single source of truth)
export type { FileChange } from "./fileChanges";

// Re-export canonical SnapshotManifest from snapshot.ts (single source of truth)
export type { SnapshotManifest } from "./snapshot";

import type { SnapshotManifest } from "./snapshot";

// =============================================================================
// ENGINE STORAGE (types formerly in @vreko/engine)
// =============================================================================

/** Restored file with content */
export interface RestoredFile {
	path: string;
	content: string;
}

/** Stub for engine Storage class */
export class Storage {
	constructor(_options?: { rootDir?: string; compress?: boolean }) {}

	async createSnapshot(
		files: Array<{ path: string; content: string }>,
		_options?: { description?: string; trigger?: string },
	): Promise<SnapshotManifest> {
		return {
			id: `stub-${Date.now()}`,
			createdAt: Date.now(),
			description: _options?.description,
			files: files.map((f) => ({
				path: f.path,
				blobId: `blob-${f.path}`,
				hash: "stub-hash",
				size: f.content.length,
			})),
		};
	}

	async getSnapshot(_id: string): Promise<SnapshotManifest | null> {
		return null;
	}

	async listSnapshots(): Promise<SnapshotManifest[]> {
		return [];
	}

	async deleteSnapshot(_id: string): Promise<boolean> {
		return false;
	}

	/** Restore snapshot files by ID */
	async restore(_id: string): Promise<RestoredFile[]> {
		return [];
	}
}

// =============================================================================
// ENGINE SIGNALS (types formerly in @vreko/engine/signals)
// =============================================================================

export interface BurstEvent {
	timestamp: number;
	filePath: string;
	changeSize: number;
}

/** Extended BurstEvent with velocity for SignalBridge */
export interface BurstEvent {
	timestamp: number;
	filePath: string;
	changeSize: number;
	velocity?: number;
	charCount?: number;
}

/** Stub for BurstDetector */
export class BurstDetector {
	constructor(_options?: { threshold?: number; windowMs?: number; cooldownMs?: number }) {}

	addEvent(_event: BurstEvent): void {
		// no-op
	}

	detect(): { isBurst: boolean; score: number; events: number } {
		return { isBurst: false, score: 0, events: 0 };
	}

	reset(): void {
		// no-op
	}

	/** Process a file change and return burst event if detected */
	processChange(filePath: string, charCount: number, _timestamp: number): BurstEvent | null {
		if (charCount > 100) {
			return {
				timestamp: Date.now(),
				filePath,
				changeSize: charCount,
				velocity: charCount / 100,
				charCount,
			};
		}
		return null;
	}

	/** Clear all state */
	clear(): void {
		// no-op
	}

	/** Update the burst threshold */
	updateThreshold(_threshold: number): void {
		// no-op
	}

	/** Cleanup old history */
	cleanup(): void {
		// no-op
	}
}

/** AI detection input for complex detect calls */
export interface AIDetectInput {
	extensionIds: string[];
	content: string;
	velocity?: number;
	charCount: number;
}

/** AI detection result with full details (internal stub  -  not exported to avoid collision with SignalBridge.AIDetectionResult) */
interface AIDetectionResult {
	isAI: boolean;
	confidence: number;
	tool?: string;
	method?: "extension" | "velocity" | "pattern" | "combined" | null;
	indicators?: string[];
}

/** Stub for AIDetector */
export class AIDetector {
	constructor(_options?: {
		velocityThreshold?: number;
		minCharsForVelocity?: number;
		enablePatternMatching?: boolean;
	}) {}

	detect(content: string | AIDetectInput, _filePath?: string): AIDetectionResult {
		// Handle both string and object input
		if (typeof content === "string") {
			return { isAI: false, confidence: 0, tool: undefined, method: null, indicators: [] };
		}
		// Object input with extensionIds, velocity, etc.
		return { isAI: false, confidence: 0, tool: undefined, method: null, indicators: [] };
	}
}

export interface ComplexityResult {
	maxComplexity: number;
	averageComplexity: number;
}

export function calculateComplexityAggregate(_files: Array<{ content: string; path: string }>): ComplexityResult {
	return { maxComplexity: 0, averageComplexity: 0 };
}

export function isSensitiveFile(filePath: string): boolean {
	const sensitive = [".env", "secret", "credential", "password", "key", "token"];
	const lower = filePath.toLowerCase();
	return sensitive.some((s) => lower.includes(s));
}

export function detectThreats(
	_content: string,
	_filePath?: string,
): { threats: Array<{ type: string; severity: string; description: string }>; riskScore: number } {
	return { threats: [], riskScore: 0 };
}

// =============================================================================
// ENGINE EVENTS (types formerly in @vreko/engine/runtime)
// =============================================================================

export interface VrekoEvents {
	"burst.detected": {
		filePath: string;
		score: number;
		velocity?: number;
		charCount?: number;
		fileExtension?: string;
	};
	"ai.detected": {
		filePath: string;
		tool: string;
		confidence: number;
		method?: string;
	};
	"snapshot.created": {
		id: string;
		origin: string;
		trigger?: string;
		fileCount?: number;
		totalBytes?: number;
		riskScore?: number;
	};
	"decision.made": { filePath: string; action: string };
	"file.changed": {
		filePath: string;
		type: string;
		changeType?: string;
		extension?: string;
		lineCount?: number;
	};
	"risk.analyzed": {
		filePath: string;
		score: number;
		factorCount?: number;
		threatCount?: number;
	};
	"validation.passed": {
		filePath: string;
		validator?: string;
		duration?: number;
	};
	"validation.failed": {
		filePath: string;
		errors: string[];
		validator?: string;
		errorCount?: number;
		duration?: number;
	};
	"protection.changed": {
		filePath: string;
		level: string;
		from?: string;
		to?: string;
		source?: string;
	};
	"error.occurred": {
		message: string;
		error?: Error;
		component?: string;
		recoverable?: boolean;
	};
	"session.started": {
		sessionId: string;
		workspaceHash: string;
	};
	"session.ended": {
		sessionId: string;
		duration: number;
		filesModified: number;
		snapshotsCreated: number;
	};
	"feedback.collected": {
		detectionId: string;
		verdict: string;
		confidence: number;
		reason?: string;
		durationMs?: number;
	};
	[key: string]: unknown;
}
