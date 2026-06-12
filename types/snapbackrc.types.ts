import type { ProtectionLevel } from "./protection";

/**
 * Main configuration schema for .vrekorc
 */
export interface VrekoRC {
	protection?: ProtectionRule[];
	ignore?: string[];
	settings?: VrekoSettings;
	policies?: VrekoPolicies;
	hooks?: VrekoHooks;
	templates?: SnapshotTemplate[];
	integrations?: IntegrationConfig;
}

export interface IntegrationConfig {
	enabled?: boolean;
	github?: GitHubIntegrationConfig;
	context7?: Context7IntegrationConfig;
	sentry?: SentryIntegrationConfig;
	cache?: IntegrationCacheConfig;
	circuitBreaker?: CircuitBreakerConfig;
}

export interface GitHubIntegrationConfig {
	enabled?: boolean;
	token?: string;
	owner?: string;
	repo?: string;
	timeoutMs?: number;
}

export interface Context7IntegrationConfig {
	enabled?: boolean;
	apiKey?: string;
	timeoutMs?: number;
}

export interface SentryIntegrationConfig {
	enabled?: boolean;
	authToken?: string;
	organization?: string;
	project?: string;
	timeoutMs?: number;
}

export interface IntegrationCacheConfig {
	enabled?: boolean;
	githubTtlMs?: number;
	context7TtlMs?: number;
	sentryTtlMs?: number;
	maxEntries?: number;
}

export interface CircuitBreakerConfig {
	failureThreshold?: number;
	recoveryTimeMs?: number;
}

export interface ProtectionRule {
	pattern: string;
	level: ProtectionLevel;
	reason?: string;
	excludeFrom?: string[];
	autoSnapshot?: boolean;
	debounce?: number;
	// Provenance tracking for config merge
	_provenance?: string; // Path of the config file that defined this rule
}

export interface VrekoSettings {
	maxSnapshots?: number;
	compressionEnabled?: boolean;
	autoSnapshotInterval?: number;
	notificationDuration?: number;
	showStatusBarItem?: boolean;
	confirmRestore?: boolean;
	defaultProtectionLevel?: ProtectionLevel;
	protectionDebounce?: number;
	snapshotLocation?: string;
	maxStorageSize?: number;
	parallelOperations?: number;
	enableCaching?: boolean;
}

export interface VrekoPolicies {
	requireSnapshotMessage?: boolean;
	enforceProtectionLevels?: boolean;
	allowOverrides?: boolean;
	minimumProtectionLevel?: ProtectionLevel;
	preventAccidentalCommit?: boolean;
	teamConfigUrl?: string;
}

export interface VrekoHooks {
	beforeSnapshot?: string;
	afterSnapshot?: string;
	beforeRestore?: string;
	afterRestore?: string;
	onProtectedFileChange?: string;
}

export interface SnapshotTemplate {
	name: string;
	patterns: string[];
	message?: string;
	tags?: string[];
}

export const VREKORC_SCHEMA = {
	type: "object",
	properties: {
		protection: {
			type: "array",
			items: {
				type: "object",
				required: ["pattern", "level"],
				properties: {
					pattern: { type: "string" },
					level: { enum: ["watch", "warn", "block"] },
					reason: { type: "string" },
					excludeFrom: {
						type: "array",
						items: { type: "string" },
					},
					autoSnapshot: { type: "boolean" },
					debounce: { type: "number", minimum: 0 },
				},
			},
		},
		ignore: {
			type: "array",
			items: { type: "string" },
		},
		settings: {
			type: "object",
			properties: {
				maxSnapshots: { type: "number", minimum: 1 },
				compressionEnabled: { type: "boolean" },
				autoSnapshotInterval: { type: "number", minimum: 0 },
				notificationDuration: { type: "number", minimum: 0 },
				showStatusBarItem: { type: "boolean" },
				confirmRestore: { type: "boolean" },
				defaultProtectionLevel: {
					enum: ["watch", "warn", "block"],
				},
				protectionDebounce: { type: "number", minimum: 0 },
				snapshotLocation: { type: "string" },
				maxStorageSize: { type: "number", minimum: 0 },
				parallelOperations: { type: "number", minimum: 1 },
				enableCaching: { type: "boolean" },
			},
		},
		policies: {
			type: "object",
			properties: {
				requireSnapshotMessage: { type: "boolean" },
				enforceProtectionLevels: { type: "boolean" },
				allowOverrides: { type: "boolean" },
				minimumProtectionLevel: {
					enum: ["watch", "warn", "block"],
				},
				preventAccidentalCommit: { type: "boolean" },
				teamConfigUrl: { type: "string" },
			},
		},
		hooks: {
			type: "object",
			properties: {
				beforeSnapshot: { type: "string" },
				afterSnapshot: { type: "string" },
				beforeRestore: { type: "string" },
				afterRestore: { type: "string" },
				onProtectedFileChange: { type: "string" },
			},
		},
		templates: {
			type: "array",
			items: {
				type: "object",
				required: ["name", "patterns"],
				properties: {
					name: { type: "string" },
					patterns: {
						type: "array",
						items: { type: "string" },
					},
					message: { type: "string" },
					tags: {
						type: "array",
						items: { type: "string" },
					},
				},
			},
		},
	},
	additionalProperties: false,
};
