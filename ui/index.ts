/**
 * UI Module Index
 *
 * Exports all UI components for the Vreko VS Code extension.
 *
 * @packageDocumentation
 */

// Branding Constants
export { BRANDING, DASHBOARD_TAB_EMOJIS, ESSENTIAL_EMOJIS, PIONEER_EMOJIS, SETTINGS_EMOJIS } from "./branding";
// File Decorations
export { FileDecorationProvider } from "./fileDecorations";
// Quick Picker (Cmd+Shift+R restore flow)
export { registerSnapshotQuickPickerCommands, SnapshotQuickPicker } from "./SnapshotQuickPicker";
// Snapshot Restore UI
export { SnapshotRestoreUI } from "./SnapshotRestoreUI";
// User Tier Service (progressive disclosure)
export { createUserTierService, type TierFeatures, type UserTier, UserTierService } from "./UserTierService";
// Types
export type { ActivitySequenceType, ActivityStep, StatusBarState, StatusBarStats, VitalsDisplayData } from "./ux-types";
