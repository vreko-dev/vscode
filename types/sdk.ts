/**
 * SDK Types - Local definitions for thin client architecture
 *
 * Minimal type stubs replacing @vreko/sdk types.
 * These are just interfaces - no runtime code.
 */

// =============================================================================
// STORAGE
// =============================================================================

export interface IKeyValueStorage {
	get<T>(key: string, defaultValue?: T): T | undefined | Promise<T | undefined>;
	set<T>(key: string, value: T): void | Promise<void>;
	delete?(key: string): void | Promise<void>;
	keys?(): string[];
}

export interface IDisposable {
	dispose(): void;
}

export interface IEventEmitter<T = unknown> {
	on(event: string, handler: (data: T) => void): IDisposable;
	emit(event: string, data: T): void;
}

// =============================================================================
// AI DETECTION
// =============================================================================

export type AIAssistantName =
	| "cursor"
	| "copilot"
	| "claude"
	| "codewhisperer"
	| "windsurf"
	| "continue"
	| "tabnine"
	| "codeium"
	| "amazon-q"
	| "unknown";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export type HostApp = "vscode" | "cursor" | "windsurf" | "unknown";

export interface InstalledAssistant {
	name: AIAssistantName;
	extensionId: string;
	version?: string;
	displayName: string;
}

export interface AIPresenceInfo {
	// --- Core: what's installed ---
	installed: AIAssistantName[];
	primary?: AIAssistantName;
	confidence: ConfidenceLevel;
	indicators: string[];

	// --- Host detection ---
	host: HostApp;

	// --- Rich detail ---
	assistantDetails: InstalledAssistant[];

	// --- Backward compat aliases (consumers can migrate gradually) ---
	/** @deprecated use `installed.length > 0` */
	detected: boolean;
	/** @deprecated use `installed.length > 0` */
	hasAI: boolean;
	/** @deprecated use `primary` */
	tool?: AIAssistantName;
	/** @deprecated use `installed` */
	detectedAssistants: AIAssistantName[];
}

export interface BurstDetectionResult {
	isBurst: boolean;
	/** @deprecated use confidence instead */
	burstScore?: number;
	/** @deprecated use details.changeCount instead */
	eventCount?: number;
	/** Confidence level (0-1) */
	confidence?: number;
	details?: {
		/** Total characters inserted */
		totalInserted: number;
		/** Total characters deleted */
		totalDeleted: number;
		/** Insert/delete ratio */
		ratio: number;
		/** Number of changes in burst */
		changeCount: number;
		/** Duration of burst */
		duration: number;
		/** @deprecated */
		peakEventsPerMinute?: number;
		/** @deprecated */
		averageLinesAdded?: number;
		/** @deprecated */
		windowDuration?: number;
	};
}

// =============================================================================
// PROTECTION
// =============================================================================

export interface EvaluationContext {
	filePath: string;
	protectionLevel: string;
	isAIDetected: boolean;
	riskScore: number;
}

export interface ProtectionDecision {
	action: "allow" | "warn" | "block";
	reason: string;
	requiresSnapshot: boolean;
	shouldSnapshot?: boolean;
}

export interface ProtectionDecisionEngine {
	evaluate(context: EvaluationContext): ProtectionDecision;
}

// =============================================================================
// EXPERIENCE
// =============================================================================

export type ExperienceTier = "new" | "beginner" | "intermediate" | "advanced" | "expert" | "explorer" | "power";

export interface ExperienceMetrics {
	totalSessions: number;
	totalSnapshots: number;
	totalRestores: number;
	daysSinceFirstUse: number;
	snapshotsCreated: number;
	sessionsRecorded: number;
	protectedFiles: number;
	manualRestores: number;
	aiAssistedSessions: number;
	[key: string]: number;
}

// =============================================================================
// SESSION
// =============================================================================

export type SessionId = string;

export interface SessionFileEntry {
	uri: string;
	snapshotId: string;
	changeStats?: { added: number; deleted: number };
}

export interface SessionManifest {
	id: SessionId;
	startedAt: number;
	endedAt: number;
	snapshotCount: number;
	fileCount: number;
	files?: SessionFileEntry[];
	reason?: string;
	triggers?: string[];
	tags?: SessionTag[];
	summary?: string;
	metadata?: Record<string, unknown>;
	[key: string]: unknown;
}

export type SessionFinalizeReason = "manual" | "auto" | "git-commit" | "window-blur" | "task-complete" | "timeout";

export interface SessionCandidate {
	uri: string;
	snapshotId: string;
	stats?: { added: number; deleted: number };
}

export interface SessionTag {
	key: string;
	value: string;
}

export interface SessionTaggingResult {
	tags: SessionTag[];
	confidence: number;
}

// =============================================================================
// FILE CHANGE
// =============================================================================

export interface IExtensionProvider {
	getActiveExtensions(): string[];
}

export interface FileChangeSummary {
	totalFiles: number;
	totalLinesAdded: number;
	totalLinesRemoved: number;
	fileTypes: Record<string, number>;
}

// =============================================================================
// SNAPSHOT PROVIDER
// =============================================================================

export interface ISnapshotProvider {
	getSnapshots(sessionId: string): Promise<Array<{ id: string; createdAt: number; fileCount: number }>>;
}
