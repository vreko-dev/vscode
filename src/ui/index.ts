/**
 * UI Module Index
 *
 * Exports all UI components for the SnapBack VS Code extension.
 *
 * @packageDocumentation
 */

// Branding Constants
export { BRANDING, DASHBOARD_TAB_EMOJIS, ESSENTIAL_EMOJIS, PIONEER_EMOJIS, SETTINGS_EMOJIS } from "./branding";
export type {
	ActivityData,
	ActivityEvent,
	AIDetectionEntry,
	DashboardStats,
	SettingsState,
} from "./DashboardDataService";
// Dashboard Data Service (data aggregation for dashboard)
export { DashboardDataService, getDashboardDataService } from "./DashboardDataService";
// Dashboard WebView (3-tab settings panel)
export { createDashboardPanel, DashboardPanel } from "./DashboardPanel";
// File Decorations
export { FileDecorationProvider } from "./fileDecorations";
// Quick Picker (Cmd+Shift+R restore flow)
export { registerSnapshotQuickPickerCommands, SnapshotQuickPicker } from "./SnapshotQuickPicker";
// Snapshot Restore UI
export { SnapshotRestoreUI } from "./SnapshotRestoreUI";
// Status Bar
export { createStatusBarManager, StatusBarManager } from "./StatusBarManager";
// User Tier Service (progressive disclosure)
export { createUserTierService, type TierFeatures, type UserTier, UserTierService } from "./UserTierService";
// Types
export type { ActivitySequenceType, ActivityStep, StatusBarState, StatusBarStats, VitalsDisplayData } from "./ux-types";
// Vitals Dashboard (power users)
export { createVitalsDashboardPanel, VitalsDashboardPanel } from "./VitalsDashboardPanel";
