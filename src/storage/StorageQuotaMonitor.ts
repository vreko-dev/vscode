/**
 * StorageQuotaMonitor.ts
 *
 * Monitors disk usage and storage quotas for snapshots.
 * Uses Node.js native fs.statfs() for cross-platform disk space detection.
 *
 * Spec Reference: unified_ux_spec.md §3.3, §6.2, §7.1 P0-5
 * Edge Cases Covered:
 *   - J2-E03: Disk full / quota exceeded (P0)
 *   - J8-E05: Settings exceed size limit
 *
 * Implementation Notes (2025 Best Practices):
 *   - Uses native fs.statfs() instead of external packages (Node 18+)
 *   - Debounced warnings to prevent notification spam
 *   - Structured telemetry for storage events
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';
import type { TelemetryProxy } from '../services/telemetry-proxy';
import { logger } from '../utils/logger';

export interface StorageStatus {
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  usagePercent: number;
  isFull: boolean;
  isWarning: boolean;
  isCritical: boolean;
}

export interface StorageQuotaConfig {
  /** Percentage (0-1) at which to show warning */
  warningThreshold: number;
  /** Percentage (0-1) at which to block snapshots */
  criticalThreshold: number;
  /** Minimum time between warnings (ms) */
  warningDebounceMs: number;
  /** Minimum free space required for snapshots (bytes) */
  minFreeSpaceBytes: number;
}

const DEFAULT_CONFIG: StorageQuotaConfig = {
  warningThreshold: 0.8, // 80%
  criticalThreshold: 0.95, // 95%
  warningDebounceMs: 300_000, // 5 minutes between warnings
  minFreeSpaceBytes: 50 * 1024 * 1024, // 50MB minimum
};

/**
 * Error thrown when storage quota is exceeded.
 * Includes structured information for telemetry.
 */
export class StorageQuotaError extends Error {
  constructor(
    message: string,
    public readonly status: StorageStatus,
    public readonly isCritical: boolean
  ) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

/**
 * Monitors storage usage and triggers warnings/errors.
 *
 * Features:
 * - Native Node.js disk space detection via fs.statfs()
 * - Debounced warning notifications
 * - Telemetry integration for storage events
 * - Proactive quota checking before snapshot creation
 */
export class StorageQuotaMonitor {
  private config: StorageQuotaConfig;
  private lastWarningTime = 0;
  private telemetry?: TelemetryProxy;

  constructor(
    private readonly storagePath: string,
    config: Partial<StorageQuotaConfig> = {},
    telemetry?: TelemetryProxy
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.telemetry = telemetry;
  }

  /**
   * Set telemetry proxy for event tracking.
   * Can be called after construction if proxy is available later.
   */
  setTelemetry(telemetry: TelemetryProxy): void {
    this.telemetry = telemetry;
  }

  /**
   * Check current storage status using native fs.statfs().
   *
   * Uses Node.js built-in file system statistics which provides:
   * - blocks: Total data blocks in filesystem
   * - bfree: Free blocks in filesystem
   * - bavail: Free blocks available to unprivileged users
   * - bsize: Block size
   *
   * @returns StorageStatus with disk usage information
   */
  async checkStatus(): Promise<StorageStatus> {
    try {
      const stats = await fs.statfs(this.storagePath);

      // Calculate disk space
      // Note: bavail is more accurate for user processes (excludes reserved blocks)
      const blockSize = stats.bsize;
      const totalBytes = stats.blocks * blockSize;
      const availableBytes = stats.bavail * blockSize;
      const usedBytes = totalBytes - availableBytes;
      const usagePercent = totalBytes > 0 ? usedBytes / totalBytes : 0;

      // Determine status levels
      const isCritical = usagePercent >= this.config.criticalThreshold;
      const isWarning = usagePercent >= this.config.warningThreshold && !isCritical;
      const isFull = availableBytes < this.config.minFreeSpaceBytes;

      const status: StorageStatus = {
        totalBytes,
        availableBytes,
        usedBytes,
        usagePercent,
        isFull,
        isWarning,
        isCritical,
      };

      logger.debug('Storage status checked', {
        usagePercent: Math.round(usagePercent * 100),
        availableMB: Math.round(availableBytes / 1024 / 1024),
        isCritical,
        isWarning,
      });

      return status;
    } catch (error) {
      // Handle errors gracefully - allow operations to continue
      logger.warn('Failed to check storage status', {
        path: this.storagePath,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return safe defaults that don't block operations
      return {
        totalBytes: 0,
        availableBytes: Number.MAX_SAFE_INTEGER,
        usedBytes: 0,
        usagePercent: 0,
        isFull: false,
        isWarning: false,
        isCritical: false,
      };
    }
  }

  /**
   * Validation hook for before-snapshot creation.
   * Throws StorageQuotaError if critical threshold exceeded.
   * Shows debounced warning if warning threshold exceeded.
   *
   * @throws StorageQuotaError if storage is critically full
   */
  async ensureQuota(): Promise<void> {
    const status = await this.checkStatus();

    // Critical: Block snapshots and throw error
    if (status.isCritical || status.isFull) {
      await this.trackTelemetry('storage_full', status);

      // Show error notification
      const freeMB = Math.round(status.availableBytes / 1024 / 1024);
      void vscode.window.showErrorMessage(
        `SnapBack: Disk storage critically low (${freeMB}MB free). Snapshots disabled until space is freed.`,
        'Open Folder'
      ).then((selection) => {
        if (selection === 'Open Folder') {
          void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.storagePath));
        }
      });

      throw new StorageQuotaError(
        `Storage quota exceeded: ${Math.round(status.usagePercent * 100)}% full, ${freeMB}MB available`,
        status,
        true
      );
    }

    // Warning: Show debounced notification
    if (status.isWarning) {
      await this.showDebouncedWarning(status);
    }
  }

  /**
   * Quick check if storage has sufficient space for an operation.
   * Does not throw - returns boolean for conditional logic.
   *
   * @param requiredBytes - Estimated bytes needed for operation
   * @returns true if sufficient space available
   */
  async hasSpace(requiredBytes = 0): Promise<boolean> {
    const status = await this.checkStatus();
    return status.availableBytes > requiredBytes + this.config.minFreeSpaceBytes;
  }

  /**
   * Get human-readable storage status for UI display.
   */
  async getDisplayStatus(): Promise<{
    label: string;
    tooltip: string;
    severity: 'ok' | 'warning' | 'critical';
  }> {
    const status = await this.checkStatus();

    const usedGB = (status.usedBytes / 1024 / 1024 / 1024).toFixed(1);
    const totalGB = (status.totalBytes / 1024 / 1024 / 1024).toFixed(1);
    const percentUsed = Math.round(status.usagePercent * 100);

    if (status.isCritical || status.isFull) {
      return {
        label: `$(warning) ${percentUsed}%`,
        tooltip: `Storage critical: ${usedGB}GB / ${totalGB}GB used. Free space needed.`,
        severity: 'critical',
      };
    }

    if (status.isWarning) {
      return {
        label: `$(alert) ${percentUsed}%`,
        tooltip: `Storage warning: ${usedGB}GB / ${totalGB}GB used. Consider freeing space.`,
        severity: 'warning',
      };
    }

    return {
      label: `${percentUsed}%`,
      tooltip: `Storage: ${usedGB}GB / ${totalGB}GB used`,
      severity: 'ok',
    };
  }

  /**
   * Show warning notification with debouncing to prevent spam.
   */
  private async showDebouncedWarning(status: StorageStatus): Promise<void> {
    const now = Date.now();

    // Skip if within debounce window
    if (now - this.lastWarningTime < this.config.warningDebounceMs) {
      return;
    }

    this.lastWarningTime = now;
    await this.trackTelemetry('storage_warning', status);

    const percentUsed = Math.round(status.usagePercent * 100);
    const freeMB = Math.round(status.availableBytes / 1024 / 1024);

    void vscode.window.showWarningMessage(
      `SnapBack: Storage reaching capacity (${percentUsed}% used, ${freeMB}MB free). Consider cleaning old snapshots.`,
      'Manage Snapshots',
      'Dismiss'
    ).then((selection) => {
      if (selection === 'Manage Snapshots') {
        void vscode.commands.executeCommand('snapback.viewSnapshots');
      }
    });
  }

  /**
   * Track telemetry for storage events.
   */
  private async trackTelemetry(
    event: 'storage_full' | 'storage_warning' | 'storage_checked',
    status: StorageStatus
  ): Promise<void> {
    if (!this.telemetry) {
      return;
    }

    try {
      await this.telemetry.trackEvent(event, {
        usage_percent: Math.round(status.usagePercent * 100),
        available_mb: Math.round(status.availableBytes / 1024 / 1024),
        total_gb: Math.round(status.totalBytes / 1024 / 1024 / 1024),
        is_critical: status.isCritical,
        is_warning: status.isWarning,
        path: this.storagePath,
      });
    } catch {
      // Fire and forget - don't fail storage operations for telemetry
    }
  }
}
