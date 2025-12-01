// apps/vscode/src/storage/StorageManager.ts

import * as vscode from 'vscode';
import type {
  IStorageManager,
  CooldownEntry,
  SnapshotManifest,
  SnapshotWithContent,
  SnapshotFilters,
  SessionManifest,
  SessionFileEntry,
  SessionFilters,
  AuditEntry,
  StorageMetadata,
} from './types';
import { CooldownCache } from './CooldownCache';
import { BlobStore } from './BlobStore';
import { SnapshotStore } from './SnapshotStore';
import { SessionStore } from './SessionStore';
import { AuditLog } from './AuditLog';
import {
  ensureDirectory,
  readJsonFile,
  writeJsonFile,
} from './utils/atomicWrite';

const STORAGE_VERSION = 1;

/**
 * Main storage orchestrator that provides a unified interface
 * to all storage components.
 *
 * This replaces the SQLite-based StorageBroker with a file-based
 * implementation that works in all VS Code environments.
 */
export class StorageManager implements IStorageManager {
  private readonly storageUri: vscode.Uri;
  private readonly metadataUri: vscode.Uri;

  private cooldownCache: CooldownCache;
  private blobStore: BlobStore;
  private snapshotStore: SnapshotStore;
  private sessionStore: SessionStore;
  private auditLog: AuditLog;

  private initialized = false;

  constructor(context: vscode.ExtensionContext) {
    // Use VS Code's global storage URI
    this.storageUri = context.globalStorageUri;
    this.metadataUri = vscode.Uri.joinPath(this.storageUri, 'storage.json');

    // Initialize components
    this.cooldownCache = new CooldownCache();
    this.blobStore = new BlobStore(this.storageUri);
    this.snapshotStore = new SnapshotStore(this.storageUri, this.blobStore);
    this.sessionStore = new SessionStore(this.storageUri);
    this.auditLog = new AuditLog(this.storageUri);
  }

  // ============================================
  // Lifecycle
  // ============================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure root storage directory exists
    await ensureDirectory(this.storageUri);

    // Initialize all components
    await this.blobStore.initialize();
    await this.snapshotStore.initialize();
    await this.sessionStore.initialize();
    await this.auditLog.initialize();

    // Start cooldown cleanup
    this.cooldownCache.start();

    // Initialize or update metadata
    await this.initializeMetadata();

    this.initialized = true;

    console.log(
      `[SnapBack Storage] Initialized at ${this.storageUri.fsPath}`
    );
  }

  dispose(): void {
    this.cooldownCache.dispose();
    this.initialized = false;
    console.log('[SnapBack Storage] Disposed');
  }

  private async initializeMetadata(): Promise<void> {
    const existing = await readJsonFile<StorageMetadata>(this.metadataUri);

    if (!existing) {
      const metadata: StorageMetadata = {
        version: STORAGE_VERSION,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        stats: {
          snapshotCount: 0,
          sessionCount: 0,
          totalBlobBytes: 0,
        },
      };
      await writeJsonFile(this.metadataUri, metadata);
    } else if (existing.version < STORAGE_VERSION) {
      // Handle migrations in the future
      console.log(
        `[SnapBack Storage] Upgrading from v${existing.version} to v${STORAGE_VERSION}`
      );
      existing.version = STORAGE_VERSION;
      await writeJsonFile(this.metadataUri, existing);
    }
  }

  /**
   * Check if storage is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get storage URI
   */
  getStorageUri(): vscode.Uri {
    return this.storageUri;
  }

  // ============================================
  // Cooldowns (In-Memory)
  // ============================================

  setCooldown(entry: CooldownEntry): void {
    this.cooldownCache.set(entry);
  }

  getCooldown(filePath: string, level: string): CooldownEntry | null {
    return this.cooldownCache.get(filePath, level);
  }

  isInCooldown(filePath: string, level: string): boolean {
    return this.cooldownCache.isInCooldown(filePath, level);
  }

  getRemainingCooldownTime(filePath: string, level: string): number {
    return this.cooldownCache.getRemainingTime(filePath, level);
  }

  clearCooldowns(): void {
    this.cooldownCache.clear();
  }

  getActiveCooldowns(): CooldownEntry[] {
    return this.cooldownCache.getAll();
  }

  // ============================================
  // Snapshots
  // ============================================

  async createSnapshot(
    files: Map<string, string>,
    options: {
      name: string;
      trigger: SnapshotManifest['trigger'];
      metadata?: SnapshotManifest['metadata'];
    }
  ): Promise<SnapshotManifest> {
    const manifest = await this.snapshotStore.create(files, options);

    // Update metadata stats (fire and forget)
    this.updateStats().catch(console.error);

    return manifest;
  }

  async getSnapshot(id: string): Promise<SnapshotWithContent | null> {
    return this.snapshotStore.getWithContent(id);
  }

  async getSnapshotManifest(id: string): Promise<SnapshotManifest | null> {
    return this.snapshotStore.getManifest(id);
  }

  async listSnapshots(filters?: SnapshotFilters): Promise<SnapshotManifest[]> {
    return this.snapshotStore.list(filters);
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.snapshotStore.delete(id);
    this.updateStats().catch(console.error);
  }

  async getSnapshotsForFile(
    filePath: string,
    limit?: number
  ): Promise<SnapshotManifest[]> {
    return this.snapshotStore.getForFile(filePath, limit);
  }

  async snapshotExists(id: string): Promise<boolean> {
    return this.snapshotStore.exists(id);
  }

  // ============================================
  // Sessions
  // ============================================

  async createSession(_startedAt?: number): Promise<string> {
    return this.sessionStore.startSession();
  }

  async finalizeSession(
    _id: string,
    _endedAt: number,
    reason: SessionManifest['reason'],
    files: SessionFileEntry[],
    options?: { tags?: string[]; summary?: string }
  ): Promise<SessionManifest> {
    const manifest = await this.sessionStore.finalizeSession(
      reason,
      files,
      options
    );

    if (!manifest) {
      throw new Error('No active session to finalize');
    }

    this.updateStats().catch(console.error);
    return manifest;
  }

  async getSession(id: string): Promise<SessionManifest | null> {
    return this.sessionStore.get(id);
  }

  async listSessions(filters?: SessionFilters): Promise<SessionManifest[]> {
    return this.sessionStore.list(filters);
  }

  getActiveSessionId(): string | null {
    return this.sessionStore.getActiveSessionId();
  }

  hasActiveSession(): boolean {
    return this.sessionStore.hasActiveSession();
  }

  cancelSession(): void {
    this.sessionStore.cancelSession();
  }

  // ============================================
  // Audit
  // ============================================

  async recordAudit(
    entry: Omit<AuditEntry, 'id' | 'timestamp'>
  ): Promise<void> {
    await this.auditLog.append(entry);
  }

  async getAuditTrail(filePath: string, limit?: number): Promise<AuditEntry[]> {
    return this.auditLog.getForFile(filePath, limit);
  }

  async getAllAuditEntries(limit?: number): Promise<AuditEntry[]> {
    return this.auditLog.getAll(limit);
  }

  async getAuditEntriesByAction(
    action: AuditEntry['action'],
    limit?: number
  ): Promise<AuditEntry[]> {
    return this.auditLog.getByAction(action, limit);
  }

  // ============================================
  // Metadata & Stats
  // ============================================

  async getStorageMetadata(): Promise<StorageMetadata> {
    const metadata = await readJsonFile<StorageMetadata>(this.metadataUri);

    if (!metadata) {
      return {
        version: STORAGE_VERSION,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        stats: {
          snapshotCount: 0,
          sessionCount: 0,
          totalBlobBytes: 0,
        },
      };
    }

    return metadata;
  }

  private async updateStats(): Promise<void> {
    const metadata = await this.getStorageMetadata();

    metadata.lastUpdatedAt = Date.now();
    metadata.stats.snapshotCount = await this.snapshotStore.count();
    metadata.stats.sessionCount = await this.sessionStore.count();
    metadata.stats.totalBlobBytes = await this.blobStore.getTotalSize();

    await writeJsonFile(this.metadataUri, metadata);
  }

  /**
   * Force update stats (useful after bulk operations)
   */
  async refreshStats(): Promise<StorageMetadata> {
    await this.updateStats();
    return this.getStorageMetadata();
  }

  /**
   * Get quick stats without full metadata
   */
  async getQuickStats(): Promise<{
    snapshots: number;
    sessions: number;
    blobs: number;
    totalBytes: number;
  }> {
    return {
      snapshots: await this.snapshotStore.count(),
      sessions: await this.sessionStore.count(),
      blobs: await this.blobStore.count(),
      totalBytes: await this.blobStore.getTotalSize(),
    };
  }
}
