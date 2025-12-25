/**
 * CliLinkManager.ts
 *
 * Manages detection, hot-linking, and heartbeat monitoring for the CLI.
 *
 * Spec Reference: unified_ux_spec.md §4
 * Edge Cases Covered:
 *   - J1-E11: CLI installed while extension running
 *   - J9-E06: CLI heartbeat stale (crashed)
 *   - J9-E07: Graceful degradation mode
 *
 * Implementation:
 *   - Polls for CLI lock file every 5 seconds
 *   - Hot-links to CLI when detected without restart
 *   - Monitors heartbeat for staleness/crashes
 *   - Gracefully degrades to standalone mode on CLI failure
 *   - Emits telemetry events for CLI detection
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import * as vscode from 'vscode';
import { CliLockFile, type CliLockData } from './CliLockFile';

/** Events emitted by CliLinkManager */
export interface CliLinkEvents {
  onLinked: (data: CliLockData) => void;
  onUnlinked: (reason: string) => void;
  onStaleDetected: () => void;
}

/** Configuration for CLI link behavior */
interface LinkConfig {
  pollingIntervalMs: number;
  heartbeatCheckIntervalMs: number;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
}

const DEFAULT_CONFIG: LinkConfig = {
  pollingIntervalMs: 5_000, // Poll every 5 seconds per spec
  heartbeatCheckIntervalMs: 10_000, // Check heartbeat every 10 seconds
  reconnectDelayMs: 2_000,
  maxReconnectAttempts: 3,
};

/**
 * Manages the extension's connection to the CLI process.
 *
 * Responsibilities:
 * - Detect CLI availability via lock file polling
 * - Establish MCP connection when CLI is running
 * - Monitor CLI health via heartbeat
 * - Handle graceful degradation on CLI failure
 */
export class CliLinkManager implements vscode.Disposable {
  private isLinked = false;
  private pollingTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private currentLinkData: CliLockData | null = null;
  /** Reserved for reconnect logic */
  // @ts-expect-error Reserved for future reconnect enhancement
  private _reconnectAttempts = 0;
  private readonly config: LinkConfig;
  private readonly eventHandlers: Partial<CliLinkEvents> = {};
  private readonly extensionId: string;
  private disposed = false;

  constructor(
    private readonly lockFile: CliLockFile,
    config: Partial<LinkConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.extensionId = `vscode-${process.pid}-${Date.now()}`;
  }

  /**
   * Register event handlers.
   */
  on<K extends keyof CliLinkEvents>(
    event: K,
    handler: CliLinkEvents[K]
  ): void {
    this.eventHandlers[event] = handler;
  }

  /**
   * Start polling for CLI availability.
   *
   * Edge Case: J1-E11 - CLI installed while extension running
   */
  startPolling(): void {
    if (this.pollingTimer || this.disposed) {
      return; // Already polling or disposed
    }

    // Initial check
    void this.checkCliAvailability();

    // Start periodic polling
    this.pollingTimer = setInterval(async () => {
      if (!this.isLinked && !this.disposed) {
        await this.checkCliAvailability();
      }
    }, this.config.pollingIntervalMs);
  }

  /**
   * Stop polling for CLI.
   */
  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Check if CLI is available and link if found.
   */
  private async checkCliAvailability(): Promise<void> {
    try {
      const state = await this.lockFile.checkState();

      if (state.isRunning && state.data && !this.isLinked) {
        // CLI detected! Hot-link to it
        await this.link(state.data);
      } else if (state.wasStale) {
        // Stale lock detected (CLI crashed)
        this.eventHandlers.onStaleDetected?.();
      }
    } catch (error) {
      // Ignore polling errors
      console.debug('[CliLinkManager] Polling error:', error);
    }
  }

  /**
   * Establish link to running CLI process.
   */
  async link(data: CliLockData): Promise<void> {
    if (this.isLinked || this.disposed) {
      return;
    }

    try {
      // 1. Verify heartbeat freshness (extra safety check)
      if (await this.lockFile.isStale(data)) {
        console.debug('[CliLinkManager] CLI lock is stale, not linking');
        return;
      }

      // 2. Register this extension instance
      await this.lockFile.registerExtension(this.extensionId);

      // 3. Update internal state
      this.isLinked = true;
      this.currentLinkData = data;
      this._reconnectAttempts = 0;

      // 4. Start heartbeat monitoring
      this.startHeartbeatMonitor();

      // 5. Stop polling (we're now linked)
      this.stopPolling();

      // 6. Notify listeners
      this.eventHandlers.onLinked?.(data);

      // 7. Show notification to user
      this.showLinkNotification(data);

      // 8. Track telemetry
      // telemetry.track('cli_detected', { cli_version: data.version, link_success: true });

      console.log(
        `[CliLinkManager] Linked to CLI v${data.version} on port ${data.mcpPort}`
      );
    } catch (error) {
      console.error('[CliLinkManager] Link failed:', error);
      // telemetry.track('cli_link_failed', { error_code: 'link_error' });
    }
  }

  /**
   * Show notification when CLI is detected.
   */
  private showLinkNotification(data: CliLockData): void {
    const projectCount = data.watchingProjects.length;
    const message =
      projectCount > 0
        ? `SnapBack CLI detected! ⚡ Watching ${projectCount} project(s)`
        : 'SnapBack CLI detected! ⚡ Experience upgraded.';

    vscode.window.showInformationMessage(message, 'View Status').then((action) => {
      if (action === 'View Status') {
        void vscode.commands.executeCommand('snapback.mcp.status');
      }
    });
  }

  /**
   * Monitor CLI heartbeat for staleness/crashes.
   *
   * Edge Case: J9-E06, J9-E07
   */
  private startHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      if (!this.isLinked || this.disposed) {
        return;
      }

      try {
        const state = await this.lockFile.checkState();

        if (!state.isRunning) {
          // CLI is no longer running
          if (state.wasStale) {
            await this.unlink('CLI heartbeat stale (possible crash)');
          } else {
            await this.unlink('CLI process terminated');
          }
        }
      } catch (error) {
        console.debug('[CliLinkManager] Heartbeat check error:', error);
      }
    }, this.config.heartbeatCheckIntervalMs);
  }

  /**
   * Stop heartbeat monitoring.
   */
  private stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Handle CLI disconnection/crash.
   *
   * Edge Case: J9-E07 - Graceful degradation mode
   */
  async unlink(reason: string): Promise<void> {
    if (!this.isLinked) {
      return;
    }

    // 1. Update internal state
    const wasLinked = this.isLinked;
    this.isLinked = false;
    this.currentLinkData = null;

    // 2. Stop heartbeat monitoring
    this.stopHeartbeatMonitor();

    // 3. Unregister from lock file
    try {
      await this.lockFile.unregisterExtension(this.extensionId);
    } catch {
      // Ignore unregister errors
    }

    // 4. Notify listeners
    if (wasLinked) {
      this.eventHandlers.onUnlinked?.(reason);
    }

    // 5. Show notification to user
    this.showUnlinkNotification(reason);

    // 6. Track telemetry
    // telemetry.track('cli_link_failed', { error_code: 'unlink', reason });

    // 7. Restart polling to detect CLI restart
    this.startPolling();

    console.log(`[CliLinkManager] Unlinked from CLI: ${reason}`);
  }

  /**
   * Show notification when CLI is disconnected.
   */
  private showUnlinkNotification(reason: string): void {
    const isCrash = reason.includes('stale') || reason.includes('crash');
    const message = isCrash
      ? 'SnapBack CLI disconnected (possible crash). Running in standalone mode.'
      : 'SnapBack CLI disconnected. Running in standalone mode.';

    vscode.window.showWarningMessage(message, 'Restart CLI').then((action) => {
      if (action === 'Restart CLI') {
        // Open terminal with restart command
        const terminal = vscode.window.createTerminal('SnapBack CLI');
        terminal.show();
        terminal.sendText('snapback watch');
      }
    });
  }

  /**
   * Get current link state.
   */
  getState(): {
    isLinked: boolean;
    cliVersion?: string;
    mcpPort?: number;
  } {
    return {
      isLinked: this.isLinked,
      cliVersion: this.currentLinkData?.version,
      mcpPort: this.currentLinkData?.mcpPort,
    };
  }

  /**
   * Check if currently linked to CLI.
   */
  isConnected(): boolean {
    return this.isLinked;
  }

  /**
   * Get MCP connection info if linked.
   */
  getMcpInfo(): { port: number; transport: 'sse' | 'stdio' } | null {
    if (!this.isLinked || !this.currentLinkData) {
      return null;
    }

    return {
      port: this.currentLinkData.mcpPort,
      transport: this.currentLinkData.mcpTransport,
    };
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.disposed = true;
    this.stopPolling();
    this.stopHeartbeatMonitor();

    // Unregister from CLI if linked
    if (this.isLinked) {
      void this.lockFile.unregisterExtension(this.extensionId);
    }
  }
}
