/**
 * Snapshot Display Module
 *
 * Exports all snapshot display components for use in the extension:
 * - SnapshotQuickPick (P0): Status bar click → quick restore
 * - SnapshotTreeDataProvider (P1): Sidebar browse and manage
 * - WebviewActivityTab (P1): Dashboard activity tab
 * - formatting: Shared formatting utilities
 *
 * @packageDocumentation
 */

// Shared formatting utilities
export {
	type AnySnapshotManifest,
	type DateGroup,
	formatAbsoluteTime,
	formatAnchorFile,
	formatBytes,
	formatReason,
	formatRelativeTime,
	getDateGroup,
	getOriginIcon,
	groupByDate,
	isV2Manifest,
	ORIGIN_ICONS,
	REASON_LABELS,
} from "./formatting";

// Quick Pick (P0)
export {
	createSnapshotQuickPickItem,
	registerSnapshotQuickPickCommands,
	SnapshotQuickPick,
	type SnapshotQuickPickConfig,
	type SnapshotQuickPickItem,
} from "./SnapshotQuickPick";

// Tree View (P1)
export {
	DateGroupTreeItem,
	registerSnapshotTreeView,
	type SnapshotTreeConfig,
	SnapshotTreeDataProvider,
	SnapshotTreeItem,
} from "./SnapshotTreeDataProvider";

// Webview Activity Tab (P1)
export {
	ActivityTabMessages,
	type ActivityTabMessageType,
	type AIDetectionSummary,
	createActivityTabData,
	createAIDetectionSummary,
	createSessionTimelineData,
	createSnapshotSummary,
	type ExtensionToWebviewMessage,
	type SessionTimelineItem,
	type SnapshotSummary,
	type WebviewToExtensionMessage,
} from "./WebviewActivityTab";
