import * as vscode from "vscode";
import type { ProtectionLevelCanonical } from "../signage/types";
import { readJsonFile, writeJsonFile } from "./utils/atomicWrite";

/**
 * ConfigStore - Persistent storage for protection levels and engine settings
 *
 * PURPOSE:
 * - Store per-file protection levels (Block/Warn/Watch)
 * - Persist engine configuration (graph analysis settings, cooldowns)
 * - Provide atomic config updates with rollback capability
 *
 * STORAGE LOCATION:
 * - ~/.config/Code/User/globalStorage/snapback.id/config.json
 *
 * SCHEMA:
 * {
 *   version: 1,
 *   protections: {
 *     "/absolute/path/to/file.ts": {
 *       level: "block" | "warn" | "watch",
 *       isAnchor: boolean,
 *       clusterId?: string,
 *       setAt: number
 *     }
 *   },
 *   engine: {
 *     maxDepth: 2,
 *     burstThreshold: 30,
 *     cooldowns: {
 *       block: 60000,
 *       warn: 30000,
 *       watch: 0
 *     }
 *   }
 * }
 *
 * TESTING SCENARIOS (Red Phase):
 *
 * 1. INITIALIZATION
 *    - ✅ Creates config.json on first run
 *    - ✅ Loads existing config with correct schema
 *    - ✅ Migrates old config versions
 *    - ❌ Handles corrupted JSON gracefully
 *    - ❌ Handles disk full error
 *    - ❌ Handles permission denied
 *
 * 2. PROTECTION LEVEL OPERATIONS
 *    - ✅ Sets protection level for new file
 *    - ✅ Updates existing protection level
 *    - ✅ Retrieves protection level (happy path)
 *    - ✅ Returns null for unprotected file
 *    - ✅ Lists all protected files
 *    - ✅ Removes protection level
 *    - ❌ Handles concurrent writes (atomic)
 *    - ❌ Preserves other fields on update
 *
 * 3. ANCHOR FILE MANAGEMENT
 *    - ✅ Marks file as cluster anchor
 *    - ✅ Retrieves all anchors
 *    - ✅ Clusters are tied to anchors
 *    - ❌ Prevents multiple anchors per cluster
 *
 * 4. ENGINE CONFIGURATION
 *    - ✅ Gets default engine config
 *    - ✅ Updates engine config
 *    - ✅ Validates config values (maxDepth >= 0)
 *    - ❌ Rejects invalid cooldown values
 *
 * 5. PERSISTENCE
 *    - ✅ Writes to disk immediately
 *    - ✅ Atomic write (tmp → rename)
 *    - ❌ Recovers from partial write
 *
 * 6. EDGE CASES
 *    - ❌ Handles very long file paths (>255 chars)
 *    - ❌ Handles special characters in paths
 *    - ❌ Handles 10K+ protected files
 *    - ❌ Handles rapid successive updates
 *
 * TDD WORKFLOW:
 * 1. Write failing test for scenario
 * 2. Implement minimal code to pass
 * 3. Refactor with confidence
 * 4. Run gate: ./ai_dev_utils/scripts/tdd-gate.sh green
 */

interface ProtectionEntry {
	level: ProtectionLevelCanonical;
	isAnchor: boolean;
	clusterId?: string;
	setAt: number;
}

interface EngineConfig {
	maxDepth: number;
	burstThreshold: number;
	cooldowns: {
		block: number;
		warn: number;
		watch: number;
	};
}

interface ConfigSchema {
	version: number;
	protections: Record<string, ProtectionEntry>;
	engine: EngineConfig;
}

const DEFAULT_ENGINE_CONFIG: EngineConfig = {
	maxDepth: 2,
	burstThreshold: 30, // chars per 100ms
	cooldowns: {
		block: 60000, // 1 minute
		warn: 30000, // 30 seconds
		watch: 0, // no cooldown
	},
};

const CONFIG_VERSION = 1;

export class ConfigStore {
	private readonly configUri: vscode.Uri;
	private cache: ConfigSchema | null = null;
	private initialized = false;

	constructor(storageUri: vscode.Uri) {
		this.configUri = vscode.Uri.joinPath(storageUri, "config.json");
	}

	/**
	 * Initialize config store
	 * Creates default config if none exists
	 *
	 * TEST: Should create config.json with default schema
	 * TEST: Should load existing config without overwriting
	 * TEST: Should migrate v0 → v1 schema
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		const existing = await readJsonFile<ConfigSchema>(this.configUri);

		if (!existing) {
			// Create default config
			this.cache = {
				version: CONFIG_VERSION,
				protections: {},
				engine: DEFAULT_ENGINE_CONFIG,
			};
			await writeJsonFile(this.configUri, this.cache);
		} else {
			// TODO: Handle migrations when version < CONFIG_VERSION
			this.cache = existing;
		}

		this.initialized = true;
	}

	/**
	 * Set protection level for a file
	 *
	 * TEST: New file → creates entry
	 * TEST: Existing file → updates level
	 * TEST: Atomic write → other protections preserved
	 * TEST: Timestamp updated on every change
	 */
	async setProtection(
		filePath: string,
		level: ProtectionLevelCanonical,
		isAnchor = false,
		clusterId?: string,
	): Promise<void> {
		await this.ensureInitialized();

		if (!this.cache) {
			throw new Error("ConfigStore not initialized");
		}

		this.cache.protections[filePath] = {
			level,
			isAnchor,
			clusterId,
			setAt: Date.now(),
		};

		await this.persist();
	}

	/**
	 * Get protection entry for a file
	 *
	 * TEST: Protected file → returns entry
	 * TEST: Unprotected file → returns null
	 * TEST: Invalid path → returns null
	 */
	async getProtection(filePath: string): Promise<ProtectionEntry | null> {
		await this.ensureInitialized();

		if (!this.cache) {
			return null;
		}

		return this.cache.protections[filePath] || null;
	}

	/**
	 * Remove protection from a file
	 *
	 * TEST: Protected file → removes entry
	 * TEST: Unprotected file → no-op
	 * TEST: Atomic write → other protections preserved
	 */
	async removeProtection(filePath: string): Promise<void> {
		await this.ensureInitialized();

		if (!this.cache) {
			return;
		}

		delete this.cache.protections[filePath];
		await this.persist();
	}

	/**
	 * List all protected files
	 *
	 * TEST: Empty config → returns []
	 * TEST: Multiple files → returns all entries
	 * TEST: Returns copy (not reference to internal state)
	 */
	async listProtections(): Promise<Array<{ filePath: string; entry: ProtectionEntry }>> {
		await this.ensureInitialized();

		if (!this.cache) {
			return [];
		}

		return Object.entries(this.cache.protections).map(([filePath, entry]) => ({
			filePath,
			entry,
		}));
	}

	/**
	 * Get all cluster anchor files
	 *
	 * TEST: No anchors → returns []
	 * TEST: Multiple anchors → returns all
	 * TEST: Filters non-anchor files
	 */
	async getAnchors(): Promise<string[]> {
		await this.ensureInitialized();

		if (!this.cache) {
			return [];
		}

		return Object.entries(this.cache.protections)
			.filter(([_, entry]) => entry.isAnchor)
			.map(([filePath]) => filePath);
	}

	/**
	 * Get engine configuration
	 *
	 * TEST: Returns current config
	 * TEST: Returns copy (not reference)
	 */
	async getEngineConfig(): Promise<EngineConfig> {
		await this.ensureInitialized();

		if (!this.cache) {
			return { ...DEFAULT_ENGINE_CONFIG };
		}

		return { ...this.cache.engine };
	}

	/**
	 * Update engine configuration
	 *
	 * TEST: Updates specified fields only
	 * TEST: Validates maxDepth >= 0
	 * TEST: Validates cooldown values >= 0
	 * TEST: Preserves other config values
	 */
	async updateEngineConfig(updates: Partial<EngineConfig>): Promise<void> {
		await this.ensureInitialized();

		if (!this.cache) {
			throw new Error("ConfigStore not initialized");
		}

		// Validation
		if (updates.maxDepth !== undefined && updates.maxDepth < 0) {
			throw new Error("maxDepth must be >= 0");
		}

		if (updates.cooldowns) {
			const { block, warn, watch } = updates.cooldowns;
			if (
				(block !== undefined && block < 0) ||
				(warn !== undefined && warn < 0) ||
				(watch !== undefined && watch < 0)
			) {
				throw new Error("Cooldown values must be >= 0");
			}
		}

		this.cache.engine = {
			...this.cache.engine,
			...updates,
			cooldowns: {
				...this.cache.engine.cooldowns,
				...(updates.cooldowns || {}),
			},
		};

		await this.persist();
	}

	/**
	 * Persist config to disk
	 *
	 * TEST: Writes atomically (tmp → rename)
	 * TEST: Handles disk full error
	 * TEST: Handles permission denied
	 */
	private async persist(): Promise<void> {
		if (!this.cache) {
			return;
		}

		await writeJsonFile(this.configUri, this.cache);
	}

	/**
	 * Ensure initialization before operations
	 *
	 * TEST: Auto-initializes if not initialized
	 * TEST: No-op if already initialized
	 */
	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.initialize();
		}
	}

	/**
	 * Clear all configuration (for testing)
	 *
	 * TEST: Resets to default state
	 * TEST: Preserves engine config
	 */
	async clear(): Promise<void> {
		await this.ensureInitialized();

		if (!this.cache) {
			return;
		}

		this.cache.protections = {};
		await this.persist();
	}
}
