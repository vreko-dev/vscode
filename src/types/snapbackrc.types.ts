import type { ProtectionLevel } from "./protection.js";

/**
 * Main configuration schema for .snapbackrc
 */
export interface SnapBackRC {
	protection?: ProtectionRule[];
	ignore?: string[];
	settings?: SnapBackSettings;
	policies?: SnapBackPolicies;
	hooks?: SnapBackHooks;
	templates?: SnapshotTemplate[];
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

export interface SnapBackSettings {
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

export interface SnapBackPolicies {
	requireSnapshotMessage?: boolean;
	enforceProtectionLevels?: boolean;
	allowOverrides?: boolean;
	minimumProtectionLevel?: ProtectionLevel;
	preventAccidentalCommit?: boolean;
	teamConfigUrl?: string;
}

export interface SnapBackHooks {
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

export const SNAPBACKRC_SCHEMA = {
	type: "object",
	properties: {
		protection: {
			type: "array",
			items: {
				type: "object",
				required: ["pattern", "level"],
				properties: {
					pattern: { type: "string" },
					level: { enum: ["Watched", "Warning", "Protected"] },
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
					enum: ["Watched", "Warning", "Protected"],
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
					enum: ["Watched", "Warning", "Protected"],
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
