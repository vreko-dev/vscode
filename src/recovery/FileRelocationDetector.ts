/**
 * FileRelocationDetector.ts
 *
 * Detects and handles files that have been moved or renamed since a snapshot was taken.
 * Enables intelligent restore operations when file paths have changed.
 *
 * Spec Reference: unified_ux_spec.md §7.1 P0-6
 * Edge Cases Covered:
 *   - File renamed (same directory, different name)
 *   - File moved (different directory, same name)
 *   - File moved and renamed (different directory and name)
 *   - File deleted (no longer exists)
 *
 * Detection Strategy:
 *   1. Content hash matching - Find files with identical content
 *   2. Filename similarity - Match by similar filenames
 *   3. Directory analysis - Check common parent directories
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec.md
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

export interface RelocationCandidate {
  /** Original path from snapshot */
  originalPath: string;
  /** Detected new path (if found) */
  newPath: string | null;
  /** Type of relocation detected */
  relocationType: "renamed" | "moved" | "moved_and_renamed" | "deleted" | "unchanged";
  /** Confidence score (0-1) */
  confidence: number;
  /** How the match was detected */
  matchMethod: "hash" | "filename" | "directory" | "none";
  /** Content hash of original file */
  contentHash?: string;
}

export interface RelocationChoice {
  /** Original path from snapshot */
  originalPath: string;
  /** What action to take */
  action: "restore_original" | "follow_rename" | "skip" | "restore_both";
  /** Target path for restore (may differ based on action) */
  targetPath: string;
}

export interface RelocationResult {
  /** All detected relocations */
  relocations: RelocationCandidate[];
  /** Files that were not relocated (unchanged or deleted) */
  unchanged: string[];
  /** Files that no longer exist */
  deleted: string[];
  /** Whether user intervention is needed */
  needsUserChoice: boolean;
}

/**
 * Detects file relocations (moves/renames) between snapshot time and current state.
 * Helps restore operations handle files that have changed location.
 */
export class FileRelocationDetector {
  /** Cache of file hashes for performance */
  private hashCache = new Map<string, string>();

  constructor(private readonly workspaceRoot: string) {}

  /**
   * Analyze files from a snapshot to detect relocations.
   *
   * @param snapshotFiles - Map of original paths to content from snapshot
   * @returns Analysis of which files have been relocated
   */
  async detectRelocations(snapshotFiles: Map<string, string>): Promise<RelocationResult> {
    const relocations: RelocationCandidate[] = [];
    const unchanged: string[] = [];
    const deleted: string[] = [];
    let needsUserChoice = false;

    logger.info("Detecting file relocations", {
      fileCount: snapshotFiles.size,
      workspaceRoot: this.workspaceRoot,
    });

    const entries = Array.from(snapshotFiles.entries());
    for (const [originalPath, snapshotContent] of entries) {
      const candidate = await this.analyzeFile(originalPath, snapshotContent);
      relocations.push(candidate);

      if (candidate.relocationType === "unchanged") {
        unchanged.push(originalPath);
      } else if (candidate.relocationType === "deleted") {
        deleted.push(originalPath);
      } else {
        // Any relocation needs user choice
        needsUserChoice = true;
      }
    }

    logger.info("Relocation detection complete", {
      total: snapshotFiles.size,
      unchanged: unchanged.length,
      deleted: deleted.length,
      relocated: relocations.filter((r) => r.newPath !== null).length,
      needsUserChoice,
    });

    return {
      relocations,
      unchanged,
      deleted,
      needsUserChoice,
    };
  }

  /**
   * Analyze a single file for relocation.
   */
  private async analyzeFile(originalPath: string, snapshotContent: string): Promise<RelocationCandidate> {
    const fullOriginalPath = path.join(this.workspaceRoot, originalPath);
    const snapshotHash = this.computeHash(snapshotContent);

    // Step 1: Check if file exists at original location
    try {
      const currentContent = await fs.readFile(fullOriginalPath, "utf-8");
      const currentHash = this.computeHash(currentContent);

      if (currentHash === snapshotHash) {
        // File exists at original location with same content
        return {
          originalPath,
          newPath: null,
          relocationType: "unchanged",
          confidence: 1.0,
          matchMethod: "hash",
          contentHash: snapshotHash,
        };
      }
      // File exists but content differs (modified, not relocated)
      return {
        originalPath,
        newPath: null,
        relocationType: "unchanged",
        confidence: 1.0,
        matchMethod: "hash",
        contentHash: snapshotHash,
      };
    } catch {
      // File doesn't exist at original location - search for relocation
    }

    // Step 2: Search for file by content hash (most reliable)
    const hashMatch = await this.findByHash(snapshotHash, originalPath);
    if (hashMatch) {
      return {
        originalPath,
        newPath: hashMatch.relativePath,
        relocationType: this.classifyRelocation(originalPath, hashMatch.relativePath),
        confidence: 1.0,
        matchMethod: "hash",
        contentHash: snapshotHash,
      };
    }

    // Step 3: Search for file by filename (less reliable)
    const filenameMatch = await this.findByFilename(originalPath, snapshotContent);
    if (filenameMatch) {
      return {
        originalPath,
        newPath: filenameMatch.relativePath,
        relocationType: this.classifyRelocation(originalPath, filenameMatch.relativePath),
        confidence: filenameMatch.confidence,
        matchMethod: "filename",
        contentHash: snapshotHash,
      };
    }

    // Step 4: File not found - marked as deleted
    return {
      originalPath,
      newPath: null,
      relocationType: "deleted",
      confidence: 1.0,
      matchMethod: "none",
      contentHash: snapshotHash,
    };
  }

  /**
   * Search workspace for a file with matching content hash.
   */
  private async findByHash(
    targetHash: string,
    excludePath: string
  ): Promise<{ relativePath: string; fullPath: string } | null> {
    const extension = path.extname(excludePath);

    // Search for files with same extension in workspace
    const pattern = `**/*${extension}`;
    const files = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 500);

    for (const file of files) {
      const relativePath = vscode.workspace.asRelativePath(file);

      // Skip original path
      if (relativePath === excludePath) {
        continue;
      }

      try {
        // Check cache first
        let fileHash = this.hashCache.get(file.fsPath);
        if (!fileHash) {
          const content = await fs.readFile(file.fsPath, "utf-8");
          fileHash = this.computeHash(content);
          this.hashCache.set(file.fsPath, fileHash);
        }

        if (fileHash === targetHash) {
          logger.debug("Found file by hash match", {
            original: excludePath,
            found: relativePath,
          });
          return {
            relativePath,
            fullPath: file.fsPath,
          };
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return null;
  }

  /**
   * Search workspace for a file with similar filename.
   */
  private async findByFilename(
    originalPath: string,
    _snapshotContent: string
  ): Promise<{ relativePath: string; fullPath: string; confidence: number } | null> {
    const originalFilename = path.basename(originalPath);
    const extension = path.extname(originalPath);
    const baseName = path.basename(originalPath, extension);

    // Search for files with same base name or similar
    const pattern = `**/${baseName}*${extension}`;
    const files = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 50);

    for (const file of files) {
      const relativePath = vscode.workspace.asRelativePath(file);

      // Skip original path
      if (relativePath === originalPath) {
        continue;
      }

      const foundFilename = path.basename(relativePath);

      // Calculate filename similarity
      const similarity = this.calculateSimilarity(originalFilename, foundFilename);

      if (similarity > 0.8) {
        logger.debug("Found file by filename similarity", {
          original: originalPath,
          found: relativePath,
          similarity,
        });
        return {
          relativePath,
          fullPath: file.fsPath,
          confidence: similarity,
        };
      }
    }

    return null;
  }

  /**
   * Classify the type of relocation based on path changes.
   */
  private classifyRelocation(
    originalPath: string,
    newPath: string
  ): "renamed" | "moved" | "moved_and_renamed" {
    const originalDir = path.dirname(originalPath);
    const newDir = path.dirname(newPath);
    const originalName = path.basename(originalPath);
    const newName = path.basename(newPath);

    const sameDir = originalDir === newDir;
    const sameName = originalName === newName;

    if (sameDir && !sameName) {
      return "renamed";
    }
    if (!sameDir && sameName) {
      return "moved";
    }
    return "moved_and_renamed";
  }

  /**
   * Compute content hash for comparison.
   */
  private computeHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  /**
   * Calculate string similarity using Levenshtein distance.
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[b.length][a.length];
    return 1 - distance / Math.max(a.length, b.length);
  }

  /**
   * Show quick pick dialog for user to choose relocation handling.
   */
  async promptForRelocationChoice(
    relocations: RelocationCandidate[]
  ): Promise<RelocationChoice[] | null> {
    const movedFiles = relocations.filter(
      (r) => r.relocationType !== "unchanged" && r.relocationType !== "deleted"
    );

    if (movedFiles.length === 0) {
      return relocations.map((r) => ({
        originalPath: r.originalPath,
        action: r.relocationType === "deleted" ? "restore_original" : "skip",
        targetPath: r.originalPath,
      }));
    }

    // Build quick pick items
    const items: vscode.QuickPickItem[] = [
      {
        label: "$(arrow-right) Restore to original locations",
        description: `Restore ${movedFiles.length} file(s) to their original paths`,
        detail: "Files will be created at their snapshot locations",
      },
      {
        label: "$(arrow-both) Follow renames",
        description: `Update ${movedFiles.length} file(s) at their new locations`,
        detail: "Content will be restored to where files were moved",
      },
      {
        label: "$(list-selection) Choose per file",
        description: "Decide individually for each moved file",
        detail: "Shows options for each relocated file",
      },
    ];

    const choice = await vscode.window.showQuickPick(items, {
      title: "Files Moved Since Snapshot",
      placeHolder: `${movedFiles.length} file(s) have been moved or renamed. How should they be restored?`,
    });

    if (!choice) {
      return null; // User cancelled
    }

    if (choice.label.includes("original")) {
      return relocations.map((r) => ({
        originalPath: r.originalPath,
        action: "restore_original" as const,
        targetPath: r.originalPath,
      }));
    }

    if (choice.label.includes("Follow")) {
      return relocations.map((r) => ({
        originalPath: r.originalPath,
        action: r.newPath ? ("follow_rename" as const) : ("restore_original" as const),
        targetPath: r.newPath || r.originalPath,
      }));
    }

    // Per-file choice
    return this.promptPerFileChoice(movedFiles);
  }

  /**
   * Prompt for each moved file individually.
   */
  private async promptPerFileChoice(
    relocations: RelocationCandidate[]
  ): Promise<RelocationChoice[]> {
    const choices: RelocationChoice[] = [];

    for (const relocation of relocations) {
      const items: vscode.QuickPickItem[] = [
        {
          label: `$(file) Restore to original: ${relocation.originalPath}`,
          description: "Create file at original snapshot location",
        },
      ];

      if (relocation.newPath) {
        items.push({
          label: `$(arrow-right) Follow rename: ${relocation.newPath}`,
          description: `Update file at new location (${relocation.relocationType})`,
        });
        items.push({
          label: "$(files) Restore both locations",
          description: "Create file at both original and new locations",
        });
      }

      items.push({
        label: "$(x) Skip this file",
        description: "Don't restore this file",
      });

      const choice = await vscode.window.showQuickPick(items, {
        title: `File Relocated: ${path.basename(relocation.originalPath)}`,
        placeHolder: `This file was ${relocation.relocationType}. Choose restore action.`,
      });

      if (!choice) {
        // User cancelled - skip remaining
        break;
      }

      let action: RelocationChoice["action"] = "skip";
      let targetPath = relocation.originalPath;

      if (choice.label.includes("original")) {
        action = "restore_original";
        targetPath = relocation.originalPath;
      } else if (choice.label.includes("Follow")) {
        action = "follow_rename";
        targetPath = relocation.newPath || relocation.originalPath;
      } else if (choice.label.includes("both")) {
        action = "restore_both";
        targetPath = relocation.originalPath;
      }

      choices.push({
        originalPath: relocation.originalPath,
        action,
        targetPath,
      });
    }

    return choices;
  }

  /**
   * Clear hash cache (call after restore operations).
   */
  clearCache(): void {
    this.hashCache.clear();
  }
}
