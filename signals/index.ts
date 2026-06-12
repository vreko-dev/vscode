/**
 * Signals Module - Signal Communication System
 *
 * Implements the Signal Communication Specification v2.0 for Vreko.
 * Provides typed event bus, unified state management, status flag management,
 * notification queue, and file decorations.
 *
 * @module signals
 * @see docs/plans/vreko_signal_communicaton.md
 */

export { createDaemonBridgeAdapter, DaemonBridgeAdapter } from "./DaemonBridgeAdapter";
export {
	registerFileDecorationProvider,
	SignalFileDecorationProvider,
} from "./FileDecorationProvider";
export { getSignalSystemState, initializeSignalSystem, type SignalSystem } from "./integration";
// Legacy IP-safe detection (kept for backward compatibility)
export {
	MinimalAIDetector,
	type MinimalDetectionInput,
	type MinimalDetectionResult,
	minimalAIDetector,
} from "./MinimalAIDetector";
export {
	disposeNotificationQueue,
	getNotificationQueue,
	NOTIFICATION_PRIORITY,
	NotificationQueue,
} from "./NotificationQueue";
export { RingBuffer } from "./RingBuffer";
export { SignalCoordinator } from "./SignalCoordinator";
export { disposeSignalEventBus, getSignalEventBus, SignalEventBus } from "./SignalEventBus";
// Signal Communication System v2.0
export { SignalState } from "./SignalState";
export { StatusFlagManager } from "./StatusFlagManager";

// Types
export type {
	DaemonShutdownEventData,
	DisclosureTier,
	FileDecorationState,
	FileDecorationType,
	IntelligenceCaptureEventData,
	ISignalEventBus,
	LearningAddedEventData,
	LearningPromotedEventData,
	LearningPrunedEventData,
	MilestoneState,
	MomentumScoreUpdatedEventData,
	NotificationPriorityKey,
	PatternCopyConfig,
	RingBufferEntry,
	RiskFragileDetectedEventData,
	RiskUpdatedEventData,
	SessionEndedEventData,
	SessionReview,
	SessionStartedEventData,
	SnapshotCreatedEventData,
	SnapshotRestoredEventData,
	StatusFlag,
	StatusFlagKey,
	VrekoSignalEvent,
	WatchFileChangedEventData,
} from "./types";
