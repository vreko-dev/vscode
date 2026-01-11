/**
 * Environment Variable Validation for SnapBack VS Code Extension
 *
 * Uses composable presets from @snapback/env with T3-env core for
 * VS Code extension context (no database, payments, or email services needed).
 *
 * @example
 * ```typescript
 * import { env } from "@/lib/env";
 * console.log(env.SNAPBACK_API_URL);
 * ```
 *
 * Presets included:
 * - platform: NODE_ENV, LOG_LEVEL, CORS, Vercel/Fly.io platform vars
 * - analytics: POSTHOG_*, SENTRY_* for telemetry
 *
 * Extension-specific variables:
 * - SNAPBACK_API_URL: API endpoint
 * - SNAPBACK_MCP_URL: MCP server endpoint
 * - SNAPBACK_TELEMETRY_PROXY: Telemetry proxy endpoint
 * - SNAPBACK_RULES_PUBLIC_KEY: Rules bundle verification
 * - VSCODE_SNAPSHOT_TEST_MODE: Test mode flag
 */

import { analytics, platform } from "@snapback/env/presets";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Extend from @snapback/env presets
	 * Extension only needs platform and analytics - no database, auth, payments, etc.
	 */
	extends: [platform(), analytics()],

	/**
	 * Extension-specific environment variables
	 */
	server: {
		// API Endpoints
		SNAPBACK_API_URL: z
			.string()
			.url()
			.default("https://api.snapback.dev")
			.describe("SnapBack API endpoint for extension-server communication"),

		SNAPBACK_MCP_URL: z
			.string()
			.url()
			.default("https://snapback-mcp.fly.dev")
			.describe("SnapBack MCP server endpoint for AI assistant features"),

		SNAPBACK_TELEMETRY_PROXY: z
			.string()
			.url()
			.default("https://api.snapback.dev/telemetry")
			.describe("Telemetry proxy endpoint for analytics events"),

		// Security
		SNAPBACK_RULES_PUBLIC_KEY: z
			.string()
			.optional()
			.describe("Public key for verifying signed rules bundles (JWS verification)"),

		// Testing
		VSCODE_SNAPSHOT_TEST_MODE: z
			.enum(["true", "false"])
			.default("false")
			.transform((v) => v === "true")
			.describe("Enable test mode for snapshot testing"),

		// PostHog (extension-specific)
		POSTHOG_PROJECT_KEY: z
			.string()
			.optional()
			.describe("PostHog project key for extension telemetry (legacy, prefer POSTHOG_API_KEY)"),

		// Proxy configuration (for corporate environments)
		HTTP_PROXY: z.string().optional().describe("HTTP proxy URL for corporate environments"),
		HTTPS_PROXY: z.string().optional().describe("HTTPS proxy URL for corporate environments"),
		NO_PROXY: z.string().optional().describe("Comma-separated list of hosts to bypass proxy"),

		// System paths (for sandboxed execution)
		PATH: z.string().optional().describe("System PATH environment variable"),
		HOME: z.string().optional().describe("User home directory path"),
	},

	/**
	 * Runtime environment variables mapping
	 */
	runtimeEnv: {
		// Extension-specific
		SNAPBACK_API_URL: process.env.SNAPBACK_API_URL,
		SNAPBACK_MCP_URL: process.env.SNAPBACK_MCP_URL,
		SNAPBACK_TELEMETRY_PROXY: process.env.SNAPBACK_TELEMETRY_PROXY,
		SNAPBACK_RULES_PUBLIC_KEY: process.env.SNAPBACK_RULES_PUBLIC_KEY,
		VSCODE_SNAPSHOT_TEST_MODE: process.env.VSCODE_SNAPSHOT_TEST_MODE,
		POSTHOG_PROJECT_KEY: process.env.POSTHOG_PROJECT_KEY,
		HTTP_PROXY: process.env.HTTP_PROXY,
		HTTPS_PROXY: process.env.HTTPS_PROXY,
		NO_PROXY: process.env.NO_PROXY,
		PATH: process.env.PATH,
		HOME: process.env.HOME,
	},

	/**
	 * Skip validation during build/CI
	 * Most extension env vars have defaults, so this is safe
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

/**
 * Type-safe environment access
 */
export type Env = typeof env;

/**
 * Helper to check if running in test mode
 */
export function isTestMode(): boolean {
	return env.VSCODE_SNAPSHOT_TEST_MODE === true;
}

/**
 * Helper to get API base URL
 */
export function getApiUrl(): string {
	return env.SNAPBACK_API_URL;
}

/**
 * Helper to get MCP server URL
 */
export function getMcpUrl(): string {
	return env.SNAPBACK_MCP_URL;
}
