/**
 * Platform Coordinator Module
 *
 * Multi-surface workspace coordination for VS Code extension, CLI, and MCP server.
 *
 * @module platform
 */

export { PlatformCoordinator } from "./PlatformCoordinator";
export type {
	CelebrationEvent,
	CelebrationType,
	PlatformInitResult,
	Surface,
	SurfaceHealth,
	SurfaceHealthStatus,
	SurfaceRegistration,
	WorkspaceManifest,
	WorkspaceTier,
} from "./types";
