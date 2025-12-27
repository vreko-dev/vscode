/**
 * Heat Module - File Activity Tracking and Decoration
 *
 * Provides visual indicators for file "heat" levels based on:
 * - Save frequency
 * - Diff size
 * - AI tool involvement
 * - Undo/redo patterns (struggle indicator)
 */

export { AI_BADGE, getHeatDecorationConfig, HEAT_DECORATION_CONFIG } from "./constants";
export { FileHeatDecorationProvider } from "./FileHeatDecorationProvider";
export {
	disposeHeatIntegration,
	getHeatIntegration,
	HeatIntegration,
	initializeHeatIntegration,
} from "./HeatIntegration";
export { HeatTracker } from "./HeatTracker";
export type {
	AITool,
	FileHeatData,
	HeatAssessment,
	HeatConfig,
	HeatLevel,
	HeatSummary,
} from "./types";
export { DEFAULT_HEAT_CONFIG } from "./types";
