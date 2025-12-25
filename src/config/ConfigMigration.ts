/**
 * ConfigMigration.ts
 *
 * Handles configuration schema updates and data migration.
 *
 * Spec Reference: unified_ux_spec.md §4.6, §6.2
 * Edge Cases Covered:
 *   - J1-E12: Config version mismatch
 *   - J8-E03: Settings migration on update
 *   - J8-E07: Config backup before modify
 *   - J8-E08: Config corruption recovery
 *
 * Implementation:
 *   - Semantic version comparison for migration detection
 *   - Timestamped backups before any modification
 *   - JSON parse error detection with automatic recovery
 *   - Sequential migration execution with rollback on failure
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import * as fs from 'node:fs/promises';
import * as path from 'path';

/** Helper to check if path exists */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Helper to ensure directory exists */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/** Helper to copy file */
async function copyFile(src: string, dest: string, overwrite = false): Promise<void> {
  const flags = overwrite ? undefined : fs.constants.COPYFILE_EXCL;
  await fs.copyFile(src, dest, flags);
}

/** Helper to remove file/directory */
async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.rm(filePath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/** Current config schema version - bump on breaking changes */
const CURRENT_CONFIG_VERSION = '1.5.0';

interface ConfigVersion {
  major: number;
  minor: number;
  patch: number;
}

interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  backupPath?: string;
  error?: Error;
}

interface ConfigData {
  version?: string;
  [key: string]: unknown;
}

/** Migration function type */
type MigrationFn = (config: ConfigData) => ConfigData;

/**
 * Manages configuration migrations between versions.
 *
 * Migration Strategy:
 * 1. Read current config + version
 * 2. Backup current config
 * 3. Apply migrations sequentially
 * 4. Write new config + version
 * 5. On failure: restore from backup
 */
export class ConfigMigration {
  private readonly configPath: string;
  private readonly backupDir: string;

  constructor(snapbackHome: string) {
    this.configPath = path.join(snapbackHome, 'config.json');
    this.backupDir = path.join(snapbackHome, 'backups', 'config');
  }

  /**
   * Check if migration is needed.
   *
   * Edge Case: J1-E12 - Config version mismatch
   */
  async needsMigration(): Promise<boolean> {
    try {
      const config = await this.loadConfigSafely();
      if (!config) return false; // No config = fresh install, no migration needed

      const currentVersion = (config as ConfigData).version || '1.0.0';
      return this.compareVersions(currentVersion, CURRENT_CONFIG_VERSION) < 0;
    } catch {
      // If we can't load config, we might need recovery
      return true;
    }
  }

  /**
   * Compare semantic versions.
   * Returns: -1 if a < b, 0 if a == b, 1 if a > b
   */
  private compareVersions(a: string, b: string): number {
    const parseVersion = (v: string): ConfigVersion => {
      const parts = v.split('.').map(Number);
      return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
      };
    };

    const va = parseVersion(a);
    const vb = parseVersion(b);

    if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
    if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
    if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
    return 0;
  }

  /**
   * Perform migration from current version to target.
   *
   * Edge Case: J8-E03 - Settings migration on update
   */
  async migrate(
    targetVersion: string = CURRENT_CONFIG_VERSION
  ): Promise<MigrationResult> {
    let backupPath: string | undefined;

    try {
      // 1. Create backup first (J8-E07)
      backupPath = await this.createBackup();

      // 2. Load current config
      const config = (await this.loadConfigSafely()) as ConfigData;
      if (!config) {
        return {
          success: false,
          fromVersion: 'unknown',
          toVersion: targetVersion,
          error: new Error('No config file to migrate'),
        };
      }

      const fromVersion = config.version || '1.0.0';

      // 3. Apply migrations sequentially
      let migratedConfig = { ...config };
      const migrations = this.getMigrationsToApply(fromVersion, targetVersion);

      for (const [version, migrateFn] of migrations) {
        try {
          migratedConfig = migrateFn(migratedConfig);
          migratedConfig.version = version;
        } catch (migrationError) {
          // Rollback to backup
          await this.restoreFromBackup(backupPath);
          return {
            success: false,
            fromVersion,
            toVersion: targetVersion,
            backupPath,
            error:
              migrationError instanceof Error
                ? migrationError
                : new Error(String(migrationError)),
          };
        }
      }

      // 4. Save new config
      migratedConfig.version = targetVersion;
      await this.saveConfigAtomically(migratedConfig);

      // 5. Track telemetry (placeholder for actual telemetry)
      // telemetry.track('config_migration', { fromVersion, toVersion: targetVersion, success: true });

      return {
        success: true,
        fromVersion,
        toVersion: targetVersion,
        backupPath,
      };
    } catch (error) {
      // Attempt rollback on any error
      if (backupPath) {
        try {
          await this.restoreFromBackup(backupPath);
        } catch {
          // Rollback failed, backup is still available
        }
      }

      return {
        success: false,
        fromVersion: 'unknown',
        toVersion: targetVersion,
        backupPath,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Get ordered list of migrations to apply.
   */
  private getMigrationsToApply(
    fromVersion: string,
    toVersion: string
  ): Array<[string, MigrationFn]> {
    const result: Array<[string, MigrationFn]> = [];

    for (const [version, migrateFn] of Object.entries(MIGRATIONS)) {
      if (
        this.compareVersions(version, fromVersion) > 0 &&
        this.compareVersions(version, toVersion) <= 0
      ) {
        result.push([version, migrateFn]);
      }
    }

    // Sort by version
    result.sort((a, b) => this.compareVersions(a[0], b[0]));
    return result;
  }

  /**
   * Create backup of current config before modification.
   *
   * Edge Case: J8-E07 - Config backup before modify
   */
  async createBackup(): Promise<string> {
    await ensureDir(this.backupDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      this.backupDir,
      `config.${timestamp}.json`
    );

    if (await pathExists(this.configPath)) {
      await copyFile(this.configPath, backupPath);
    }

    // Cleanup old backups (keep last 10)
    await this.cleanupOldBackups(10);

    return backupPath;
  }

  /**
   * Clean up old backups, keeping only the most recent N.
   */
  private async cleanupOldBackups(keepCount: number): Promise<void> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = files
        .filter((f: string) => f.startsWith('config.') && f.endsWith('.json'))
        .sort()
        .reverse();

      for (const backup of backups.slice(keepCount)) {
        await removeIfExists(path.join(this.backupDir, backup));
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Restore config from a backup file.
   */
  private async restoreFromBackup(backupPath: string): Promise<void> {
    if (await pathExists(backupPath)) {
      await copyFile(backupPath, this.configPath, true);
    }
  }

  /**
   * Recover from corrupted config using backup.
   *
   * Edge Case: J8-E08 - Config corruption recovery
   */
  async recoverFromCorruption(): Promise<MigrationResult> {
    try {
      // 1. Try loading most recent backup
      const backups = await this.getAvailableBackups();

      for (const backupPath of backups) {
        try {
          const backupContent = await fs.readFile(backupPath, 'utf-8');
          const config = JSON.parse(backupContent) as ConfigData;

          // Valid backup found - restore it
          await copyFile(backupPath, this.configPath, true);

          // Track recovery telemetry
          // telemetry.track('config_corruption_recovered', { recovery_method: 'backup' });

          return {
            success: true,
            fromVersion: 'corrupted',
            toVersion: config.version || '1.0.0',
            backupPath,
          };
        } catch {
          // This backup is also corrupted, try next
          continue;
        }
      }

      // 2. No valid backup - create fresh config
      const freshConfig = this.createFreshConfig();
      await this.saveConfigAtomically(freshConfig);

      // Track recovery telemetry
      // telemetry.track('config_corruption_recovered', { recovery_method: 'fresh' });

      return {
        success: true,
        fromVersion: 'corrupted',
        toVersion: CURRENT_CONFIG_VERSION,
      };
    } catch (error) {
      return {
        success: false,
        fromVersion: 'corrupted',
        toVersion: CURRENT_CONFIG_VERSION,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Get list of available backups, sorted newest first.
   */
  private async getAvailableBackups(): Promise<string[]> {
    try {
      if (!(await pathExists(this.backupDir))) {
        return [];
      }

      const files = await fs.readdir(this.backupDir);
      return files
        .filter((f: string) => f.startsWith('config.') && f.endsWith('.json'))
        .sort()
        .reverse()
        .map((f: string) => path.join(this.backupDir, f));
    } catch {
      return [];
    }
  }

  /**
   * Create a fresh default configuration.
   */
  private createFreshConfig(): ConfigData {
    return {
      version: CURRENT_CONFIG_VERSION,
      createdAt: new Date().toISOString(),
      settings: {},
      projects: {},
    };
  }

  /**
   * Load config with corruption detection.
   *
   * Uses atomic read pattern and triggers recovery on parse errors.
   */
  async loadConfigSafely(): Promise<unknown> {
    try {
      if (!(await pathExists(this.configPath))) {
        return null;
      }

      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error instanceof SyntaxError) {
        // JSON parse error - config is corrupted
        // Trigger recovery flow
        const recovery = await this.recoverFromCorruption();
        if (recovery.success) {
          // Retry loading after recovery
          const content = await fs.readFile(this.configPath, 'utf-8');
          return JSON.parse(content);
        }
        throw new Error(
          `Config corrupted and recovery failed: ${recovery.error?.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Save config atomically using write-to-temp-then-rename pattern.
   *
   * Best Practice: Prevents corruption during concurrent or failed writes.
   * Reference: https://www.npmjs.com/package/write-file-atomic
   */
  private async saveConfigAtomically(config: ConfigData): Promise<void> {
    const tempPath = `${this.configPath}.tmp.${Date.now()}`;

    try {
      // 1. Write to temp file
      await fs.writeFile(tempPath, JSON.stringify(config, null, 2), {
        mode: 0o600,
      });

      // 2. Atomic rename to target
      await fs.rename(tempPath, this.configPath);
    } catch (error) {
      // Cleanup temp file on error
      try {
        await removeIfExists(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}

/**
 * Migration definitions (version → migration function).
 *
 * Each migration transforms config from the previous version to the target version.
 * Migrations are applied sequentially in version order.
 */
const MIGRATIONS: Record<string, MigrationFn> = {
  // Example migration from 1.4.0 to 1.5.0
  '1.5.0': (config) => {
    // Add new fields with defaults
    return {
      ...config,
      // New in 1.5.0: CLI integration settings
      cli: {
        enabled: true,
        pollingIntervalMs: 5000,
        heartbeatThresholdMs: 30000,
      },
      // New in 1.5.0: Multi-entry onboarding state
      onboarding: {
        completed: (config as ConfigData).onboarding !== undefined,
        entryPoint: 'extension',
      },
    };
  },

  // Add future migrations here:
  // '1.6.0': (config) => { ... },
};
