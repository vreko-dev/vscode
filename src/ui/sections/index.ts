/**
 * Tree View Sections
 *
 * Central exports for all tree view section providers.
 *
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md
 *
 * SECTION ORDER (in tree view):
 * 1. Activity - Event log (what happened)
 * 2. Protected - Protected files (what's guarded)
 * 3. History - Sessions (what can be rolled back)
 * 4. Cloud - Sync status (optional)
 * 5. Vitals - Workspace health (optional, power user)
 *
 * @packageDocumentation
 */

// Activity section
export {
	ActivitySection,
	createActivityEventItem,
	createActivityGroupItem,
	createMockEvents,
	groupEventsByDate,
} from "./ActivitySection";

// History section (renamed from Sessions in UI)
export {
	createHistoryGroupItem,
	createMockSessions,
	createSessionFileItem,
	createSessionItem,
	HistorySection,
} from "./HistorySection";

// Protected files section
export {
	createAllFilesItem,
	createLevelGroupItem,
	createMockProtectedFiles,
	createProtectedFileItem,
	groupFilesByLevel,
	ProtectedSection,
	sortFilesBySeverity,
} from "./ProtectedSection";
