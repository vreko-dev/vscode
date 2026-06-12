/**
 * Platform Coordinator Types
 *
 * Types for multi-surface coordination across VS Code extension, CLI, and MCP server.
 * Manages workspace identity, health status, and "first to scene" initialization.
 *
 * @module platform/types
 */

/**
 * Surface identifier - which part of the platform is running
 */
export type Surface = "extension" | "cli" | "mcp";

/**
 * Health status for a surface
 */
export type SurfaceHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

/**
 * Tier level for workspace
 */
export type WorkspaceTier = "free" | "pro" | "enterprise";

/**
 * Health information for a specific surface
 */
export interface SurfaceHealth {
	/** Surface version (e.g., extension version) */
	version: string;
	/** Last time this surface was seen/active (ISO timestamp) */
	lastSeen: string;
	/** Health status of this surface */
	healthy: SurfaceHealthStatus;
	/** Optional health details (error messages, latency, etc.) */
	details?: string;
}

/**
 * Workspace manifest - shared state across all surfaces
 *
 * Stored at `.vreko/extension-state.json` and managed by PlatformCoordinator.
 * Acts as the source of truth for workspace identity and health.
 */
export interface WorkspaceManifest {
	/** Canonical workspace ID (ws_[32 hex chars]) */
	workspaceId: string;

	/** Which surface initialized the workspace first */
	initializedBy: Surface;

	/** When the workspace was first initialized (ISO timestamp) */
	initializedAt: string;

	/** Health status of each surface */
	surfaces: {
		extension?: SurfaceHealth;
		cli?: SurfaceHealth;
		mcp?: SurfaceHealth;
	};

	/** Current workspace tier (determined by API key or subscription) */
	tier: WorkspaceTier;

	/** Overall workspace health check result */
	healthCheck: {
		/** Last time health was checked (ISO timestamp) */
		lastCheck: string;
		/** Overall health status */
		status: SurfaceHealthStatus;
		/** Issues detected across surfaces */
		issues: string[];
	};

	/** Manifest version for future migrations */
	version: number;
}

/**
 * Celebration event types - success moments to show to user
 */
export type CelebrationType =
	| "workspace_initialized" // First time setup complete
	| "mcp_connected" // MCP server connected successfully
	| "mcp_recovered" // MCP recovered from failure
	| "all_surfaces_healthy" // All surfaces are operational
	| "tier_upgraded"; // Workspace tier upgraded

/**
 * Celebration event
 */
export interface CelebrationEvent {
	type: CelebrationType;
	message: string;
	timestamp: number;
	/** Optional data specific to celebration type */
	data?: Record<string, unknown>;
}

/**
 * Platform initialization result
 */
export interface PlatformInitResult {
	/** Whether this was the first initialization */
	firstInit: boolean;
	/** Workspace ID that was created or loaded */
	workspaceId: string;
	/** Manifest that was created or loaded */
	manifest: WorkspaceManifest;
	/** Celebration event if this is a success moment */
	celebration?: CelebrationEvent;
}

/**
 * Surface registration info - provided when a surface announces itself
 */
export interface SurfaceRegistration {
	/** Which surface is registering */
	surface: Surface;
	/** Version of the surface */
	version: string;
	/** Health status at registration time */
	health: SurfaceHealthStatus;
	/** Optional health details */
	details?: string;
}
