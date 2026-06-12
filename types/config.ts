/**
 * Config Types & Stubs - Local definitions for thin client architecture
 *
 * Replaces @vreko/config, @vreko/config/migrations, @vreko/config/schemas,
 * @vreko/config/store imports with local minimal stubs.
 */

// =============================================================================
// CONFIG TYPES (from @vreko/config)
// =============================================================================

export interface V1ConfigSchema {
	version: 1;
	protectedFiles?: string[];
	settings?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface ConfigStoreV2 {
	version: 2;
	protectedFiles: Array<{ path: string; level: string }>;
	settings: Record<string, unknown>;
	[key: string]: unknown;
}

export type ConfigPath<_T = unknown> = string;
export type PathValue<_T = unknown, _P = string> = unknown;

export interface MigrationResult {
	success: boolean;
	from: number;
	to: number;
	warnings?: string[];
	error?: string;
}

// =============================================================================
// MIGRATIONS (from @vreko/config/migrations)
// =============================================================================

export function isV1Config(config: unknown): config is V1ConfigSchema {
	return typeof config === "object" && config !== null && (config as Record<string, unknown>).version === 1;
}

export function migrateV1ToV2(v1Config: V1ConfigSchema): { config: ConfigStoreV2; result: MigrationResult } {
	const config: ConfigStoreV2 = {
		version: 2,
		protectedFiles: (v1Config.protectedFiles ?? []).map((p) => ({ path: p, level: "watch" })),
		settings: v1Config.settings ?? {},
	};
	return {
		config,
		result: { success: true, from: 1, to: 2 },
	};
}

// =============================================================================
// SCHEMAS (from @vreko/config/schemas)
// =============================================================================

export function validateConfig(config: unknown): { valid: boolean; errors: string[]; data?: unknown } {
	if (typeof config !== "object" || config === null) {
		return { valid: false, errors: ["Config must be an object"] };
	}
	return { valid: true, errors: [], data: config };
}

/**
 * Validate that a JSON string is well-formed and can be parsed back.
 * Catches malformed output before writing to disk.
 */
export function validateJsonOutput(jsonString: string): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Check for suspicious caret character (possible typo)
	if (/\^/.test(jsonString)) {
		errors.push("Suspicious caret (^) character found - possible typo");
	}

	// Check for control characters (codes 0-8, 11, 12, 14-31) without using regex control chars
	const hasControlChars = Array.from(jsonString).some((ch) => {
		const code = ch.charCodeAt(0);
		return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31);
	});
	if (hasControlChars) {
		errors.push("Control characters found in output");
	}

	// Try to parse the JSON to ensure it's valid
	try {
		JSON.parse(jsonString);
	} catch (err) {
		errors.push(`Invalid JSON: ${err instanceof Error ? err.message : "Parse error"}`);
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return { valid: true, errors: [] };
}

/**
 * Safely stringify config to JSON with validation.
 * Validates the output string before returning.
 */
export function safeStringifyConfig(
	config: unknown,
	space = 2,
): { success: boolean; json?: string; errors?: string[] } {
	try {
		const jsonString = JSON.stringify(config, null, space);

		// Validate the output
		const validation = validateJsonOutput(jsonString);
		if (!validation.valid) {
			return { success: false, errors: validation.errors };
		}

		return { success: true, json: jsonString };
	} catch (err) {
		return {
			success: false,
			errors: [`Failed to stringify: ${err instanceof Error ? err.message : "Unknown error"}`],
		};
	}
}

// =============================================================================
// CONFIG STORE (from @vreko/config/store)
// =============================================================================

export class ConfigStore {
	private data: ConfigStoreV2;
	private changeCallbacks: ((config: ConfigStoreV2) => void)[] = [];
	private watching = false;

	constructor(initialData?: Partial<ConfigStoreV2>) {
		this.data = {
			version: 2,
			protectedFiles: [],
			settings: {},
			...initialData,
		};
	}

	get<T = unknown>(path: string): T | undefined {
		const parts = path.split(".");
		let current: unknown = this.data;
		for (const part of parts) {
			if (typeof current !== "object" || current === null) {
				return undefined;
			}
			current = (current as Record<string, unknown>)[part];
		}
		return current as T | undefined;
	}

	set(path: string, value: unknown): void {
		const parts = path.split(".");
		let current: Record<string, unknown> = this.data;
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (!(part in current) || typeof current[part] !== "object") {
				current[part] = {};
			}
			current = current[part] as Record<string, unknown>;
		}
		current[parts[parts.length - 1]] = value;
	}

	/**
	 * Get the full config
	 */
	getConfig(): ConfigStoreV2 {
		return { ...this.data };
	}

	/**
	 * Save config to .vrekorc (stub - would write to file in real implementation)
	 */
	async saveVrekorc(_config: ConfigStoreV2): Promise<void> {
		// Stub implementation - would persist to file
		this.data = { ..._config };
	}

	/**
	 * Watch for .vrekorc changes (stub)
	 */
	watchForChanges(): void {
		this.watching = true;
		// Stub implementation - would set up file watcher
	}

	/**
	 * Stop watching for changes
	 */
	stopWatching(): void {
		this.watching = false;
	}

	/**
	 * Subscribe to config changes
	 */
	onChange(callback: (config: ConfigStoreV2) => void): () => void {
		this.changeCallbacks.push(callback);
		return () => {
			const index = this.changeCallbacks.indexOf(callback);
			if (index > -1) {
				this.changeCallbacks.splice(index, 1);
			}
		};
	}

	/**
	 * Reset the ConfigStore (for testing)
	 */
	static reset(): void {
		globalStore = undefined;
	}

	toJSON(): ConfigStoreV2 {
		return { ...this.data };
	}
}

let globalStore: ConfigStore | undefined;

export function getConfigStore(_params?: { workspaceRoot?: string }): ConfigStore {
	if (!globalStore) {
		globalStore = new ConfigStore();
	}
	return globalStore;
}
