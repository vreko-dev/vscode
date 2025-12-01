// apps/vscode/src/storage/SessionStore.ts

import * as vscode from 'vscode';
import type { SessionManifest, SessionFileEntry, SessionFilters } from './types';
import { generateSessionId, parseTimestampFromId } from './utils/fileId';
import {
  ensureDirectory,
  readJsonFile,
  writeJsonFile,
  fileExists,
} from './utils/atomicWrite';

/**
 * Session manifest storage.
 *
 * A session represents a period of editing activity, containing
 * references to snapshots created during that session.
 */
export class SessionStore {
  private readonly sessionsUri: vscode.Uri;

  // Track active session (not yet finalized)
  private activeSessionId: string | null = null;
  private activeSessionStartedAt: number | null = null;

  constructor(storageUri: vscode.Uri) {
    this.sessionsUri = vscode.Uri.joinPath(storageUri, 'sessions');
  }

  /**
   * Initialize sessions directory
   */
  async initialize(): Promise<void> {
    await ensureDirectory(this.sessionsUri);
  }

  /**
   * Start a new session (returns session ID)
   */
  startSession(): string {
    if (this.activeSessionId) {
      // Return existing active session
      return this.activeSessionId;
    }

    this.activeSessionId = generateSessionId();
    this.activeSessionStartedAt = Date.now();
    return this.activeSessionId;
  }

  /**
   * Get active session ID (if any)
   */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /**
   * Get active session start time
   */
  getActiveSessionStartedAt(): number | null {
    return this.activeSessionStartedAt;
  }

  /**
   * Check if there's an active session
   */
  hasActiveSession(): boolean {
    return this.activeSessionId !== null;
  }

  /**
   * Finalize and persist the active session
   */
  async finalizeSession(
    reason: SessionManifest['reason'],
    files: SessionFileEntry[],
    options?: {
      tags?: string[];
      summary?: string;
    }
  ): Promise<SessionManifest | null> {
    if (!this.activeSessionId || !this.activeSessionStartedAt) {
      return null;
    }

    const manifest: SessionManifest = {
      id: this.activeSessionId,
      startedAt: this.activeSessionStartedAt,
      endedAt: Date.now(),
      reason,
      files,
      tags: options?.tags,
      summary: options?.summary,
    };

    // Write manifest
    const manifestUri = vscode.Uri.joinPath(
      this.sessionsUri,
      `${this.activeSessionId}.json`
    );
    await writeJsonFile(manifestUri, manifest);

    // Clear active session
    this.activeSessionId = null;
    this.activeSessionStartedAt = null;

    return manifest;
  }

  /**
   * Cancel active session without saving
   */
  cancelSession(): void {
    this.activeSessionId = null;
    this.activeSessionStartedAt = null;
  }

  /**
   * Get session by ID
   */
  async get(id: string): Promise<SessionManifest | null> {
    const manifestUri = vscode.Uri.joinPath(this.sessionsUri, `${id}.json`);
    return readJsonFile<SessionManifest>(manifestUri);
  }

  /**
   * List sessions with optional filtering
   */
  async list(filters?: SessionFilters): Promise<SessionManifest[]> {
    let entries: [string, vscode.FileType][];

    try {
      entries = await vscode.workspace.fs.readDirectory(this.sessionsUri);
    } catch {
      return [];
    }

    const manifests: SessionManifest[] = [];

    // Sort by timestamp from ID
    const jsonFiles = entries
      .filter(
        ([name, type]) =>
          type === vscode.FileType.File && name.endsWith('.json')
      )
      .map(([name]) => name.replace('.json', ''))
      .sort((a, b) => {
        const tsA = parseTimestampFromId(a) ?? 0;
        const tsB = parseTimestampFromId(b) ?? 0;
        return tsB - tsA; // Newest first
      });

    const limit = filters?.limit ?? 50;

    for (const id of jsonFiles) {
      const manifest = await this.get(id);
      if (!manifest) continue;

      // Apply filters
      if (filters?.after && manifest.endedAt < filters.after) continue;
      if (filters?.before && manifest.endedAt > filters.before) continue;
      if (filters?.reason && manifest.reason !== filters.reason) continue;

      manifests.push(manifest);

      if (manifests.length >= limit) break;
    }

    return manifests;
  }

  /**
   * Delete a session
   */
  async delete(id: string): Promise<boolean> {
    const manifestUri = vscode.Uri.joinPath(this.sessionsUri, `${id}.json`);

    try {
      await vscode.workspace.fs.delete(manifestUri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if session exists
   */
  async exists(id: string): Promise<boolean> {
    const manifestUri = vscode.Uri.joinPath(this.sessionsUri, `${id}.json`);
    return fileExists(manifestUri);
  }

  /**
   * Get count of sessions
   */
  async count(): Promise<number> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(this.sessionsUri);
      return entries.filter(
        ([name, type]) =>
          type === vscode.FileType.File && name.endsWith('.json')
      ).length;
    } catch {
      return 0;
    }
  }

  /**
   * Get most recent session
   */
  async getMostRecent(): Promise<SessionManifest | null> {
    const list = await this.list({ limit: 1 });
    return list[0] ?? null;
  }

  /**
   * Get total duration of all sessions (ms)
   */
  async getTotalDuration(): Promise<number> {
    const sessions = await this.list({ limit: 1000 });
    return sessions.reduce((sum, s) => sum + (s.endedAt - s.startedAt), 0);
  }
}
