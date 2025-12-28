# Intelligence Integration Plan

## Executive Summary

This document outlines the complete wiring of VS Code extension systems to the Intelligence layer (`@snapback/intelligence`). The Intelligence layer is the central nervous system for SnapBack's adaptive protection - it learns from violations, calibrates thresholds, and provides cross-surface session coordination.

**Current State**: 7 major systems generate valuable data that currently goes nowhere.
**Target State**: All data flows to Intelligence for learning, calibration, and cross-surface visibility.

---

## 🔴 CRITICAL REFINEMENTS (from SnapBack context)

### Existing Infrastructure Already In Place

| Component | Current Status | Integration Impact |
|-----------|----------------|-------------------|
| **HeatIntegration.ts:161** | ✅ Already calls `recordFileModification()` | SKIP HeatTracker wiring - already done |
| **UnifiedDataService.ts** | ✅ Has `updateVitals()` receiving vitals | Use as data sink, not new bridge |
| **EventBus (SnapBackEventBus)** | ✅ Exists, publishes SNAPSHOT_CREATED | Use for cross-component communication |
| **AutoDecisionIntegration** | ✅ Gets vitals via getVitalsSnapshot() | Already connected, enhance only |

### Key Learnings from SnapBack MCP

1. **EventBus Pattern Required**: All cross-component communication MUST use EventBus
   - NOT direct IntelligenceBridge calls from each component
   - EventBus already handles SNAPSHOT_CREATED events
   - Use existing pattern for new integrations

2. **Singleton Per Workspace Pattern**: Intelligence instances are workspace-scoped
   - Use `getIntelligence(workspaceFolder)` pattern
   - Module-level variables for race condition handling

3. **Async Handling in Event Handlers**: Never call async methods without `void` prefix
   - Pattern: `void recordFileModification(...)`
   - Already correctly used in HeatIntegration.ts:161

### Performance Constraints (from CLAUDE.md)

| Metric | Budget | Impact |
|--------|--------|--------|
| Extension activation | <500ms | Bridge init must be async, non-blocking |
| Save latency | <100ms | All signal computation must be batched |
| Memory | <200MB | No unbounded caches in bridge |

### Revised Architecture (EventBus-Based)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VS Code Extension                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│   │HeatIntegrat │   │AnalysisCord │   │SessionCoord │   │PointsTracker│    │
│   │ (DONE ✅)   │   │             │   │             │   │             │    │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘    │
│          │                 │                 │                 │            │
│          └────────────────┬┴─────────────────┴─────────────────┘            │
│                           │                                                  │
│                           ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     EventBus (EXISTING ✅)                          │  │
│   │  - SNAPSHOT_CREATED, FILE_MODIFIED, ANALYSIS_COMPLETE              │  │
│   │  - Cross-component backbone already in place                        │  │
│   └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
│                                  ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │              IntelligenceBridge (NEW - EventBus subscriber)         │  │
│   │  - Subscribes to EventBus events                                    │  │
│   │  - Routes to IntelligenceService                                    │  │
│   │  - Single point of Intelligence integration                         │  │
│   └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      @snapback/intelligence                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Revised LOC Estimate

| File | Original LOC | Revised LOC | Reason |
|------|-------------|-------------|--------|
| IntelligenceBridge.ts | 250 | 150 | EventBus subscriber, not direct calls |
| SignalOrchestrator.ts | 200 | 200 | Still needed (no existing infra) |
| HeatTracker.ts | 40 | **0** | Already wired via HeatIntegration! |
| AnalysisCoordinator.ts | 30 | 20 | Just emit EventBus event |
| SessionCoordinator.ts | 60 | 40 | EventBus integration |
| UserBehaviorTracker.ts | 25 | 15 | EventBus pattern |
| AutoDecisionIntegration.ts | 30 | 30 | Already has vitals, add signals |
| PointsTracker.ts | 15 | 10 | EventBus emission |
| extension.ts | 20 | 15 | EventBus wiring |
| bridges/index.ts | 5 | 5 | Exports |
| **Total** | **675** | **~485** | **28% reduction** |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VS Code Extension                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│   │ HeatTracker │   │AnalysisCord │   │SessionCoord │   │PointsTracker│    │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘    │
│          │                 │                 │                 │            │
│          ▼                 ▼                 ▼                 ▼            │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    IntelligenceBridge (NEW)                         │  │
│   │  - Routes all signals to Intelligence                               │  │
│   │  - Manages WorkspaceVitals subscriptions                            │  │
│   │  - Provides unified API for all consumers                           │  │
│   └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
├──────────────────────────────────┼──────────────────────────────────────────┤
│                                  ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │              IntelligenceService (existing)                         │  │
│   │  - Singleton access to @snapback/intelligence                       │  │
│   │  - WorkspaceVitals management                                       │  │
│   │  - Session persistence                                              │  │
│   └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      @snapback/intelligence                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ Vitals     │  │ Learning   │  │ Session    │  │ Validation │            │
│  │ - Pulse    │  │ - Learner  │  │ - Manager  │  │ - Pipeline │            │
│  │ - Temp     │  │ - Tracker  │  │ - Loop     │  │ - Patterns │            │
│  │ - Pressure │  │ - Feedback │  │ - Analytics│  │ - Layers   │            │
│  │ - Oxygen   │  │            │  │            │  │            │            │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Tasks

### Task 1: Create IntelligenceBridge
**Priority**: 🔴 CRITICAL
**Complexity**: Medium
**LOC**: ~250

The central orchestrator that routes all extension events to Intelligence.

#### File: `apps/vscode/src/bridges/IntelligenceBridge.ts`

```typescript
/**
 * IntelligenceBridge - Central router for Intelligence integration
 *
 * Routes events from:
 * - HeatTracker → WorkspaceVitals
 * - AnalysisCoordinator → Learning/Violations
 * - SessionCoordinator → Intelligence Sessions
 * - UserBehaviorTracker → Calibration
 * - SignalBridge → Full signal pipeline
 */

import type { WorkspaceVitals } from "@snapback/intelligence/vitals";
import type { Intelligence } from "@snapback/intelligence";
import * as vscode from "vscode";
import { getIntelligence, getWorkspaceVitals } from "../services/IntelligenceService";
import { logger } from "../utils/logger";

export interface IntelligenceBridgeOptions {
  workspaceFolder?: vscode.WorkspaceFolder;
}

export class IntelligenceBridge {
  private vitals: WorkspaceVitals | null = null;
  private intelligence: Intelligence | null = null;
  private disposables: vscode.Disposable[] = [];
  private initialized = false;

  constructor(private options: IntelligenceBridgeOptions = {}) {}

  /**
   * Initialize the bridge - must be called before using
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.intelligence = await getIntelligence(this.options.workspaceFolder);
      this.vitals = await getWorkspaceVitals(this.options.workspaceFolder);
      this.initialized = true;
      logger.info("IntelligenceBridge initialized");
    } catch (error) {
      logger.error("Failed to initialize IntelligenceBridge", error as Error);
    }
  }

  // =========================================================================
  // HEAT TRACKER INTEGRATION
  // =========================================================================

  /**
   * Record file heat event from HeatTracker
   */
  recordFileHeat(event: {
    filePath: string;
    saveCount: number;
    diffSize: number;
    aiInvolved: boolean;
    aiTool?: string;
    undoRedoCount: number;
  }): void {
    if (!this.vitals) return;

    // Feed to Vitals pulse/temperature
    this.vitals.onFileChange({
      path: event.filePath,
      isAI: event.aiInvolved,
      tool: event.aiTool,
    });

    // Record edit metrics for behavioral metadata
    this.vitals.recordEdit(event.diffSize, 0); // lines added approximation

    // High undo/redo indicates struggle - record as test failure pattern
    if (event.undoRedoCount >= 3) {
      this.vitals.recordTest(false); // Struggle = implicit test failure
    }
  }

  /**
   * Record AI edit detection from HeatTracker
   */
  recordAIEdit(filePath: string, tool: string, confidence: number): void {
    if (!this.vitals) return;

    this.vitals.onAIDetected({
      tool,
      confidence,
    });
  }

  // =========================================================================
  // ANALYSIS COORDINATOR INTEGRATION
  // =========================================================================

  /**
   * Record analysis result for learning
   */
  async recordAnalysisResult(result: {
    filePath: string;
    score: number;
    severity: "low" | "medium" | "high" | "critical";
    factors: string[];
    passed: boolean;
  }): Promise<void> {
    if (!this.intelligence || !this.vitals) return;

    // Record as pseudo-test result for behavioral metadata
    this.vitals.recordTest(result.passed);

    // Report violations for critical/high severity
    if (result.severity === "critical" || result.severity === "high") {
      for (const factor of result.factors) {
        await this.intelligence.reportViolation({
          type: `analysis-${result.severity}`,
          file: result.filePath,
          message: factor,
          reason: `Detected during save-time analysis (score: ${result.score})`,
          prevention: "Review AI-generated code before saving",
        });
      }
    }

    // Record learning if this is a repeated pattern
    if (result.factors.length > 0 && result.severity !== "low") {
      await this.intelligence.recordLearning({
        type: "pitfall",
        trigger: `${result.severity} severity in ${result.filePath.split("/").pop()}`,
        action: `Check for: ${result.factors.slice(0, 2).join(", ")}`,
        source: "analysis-coordinator",
      });
    }
  }

  // =========================================================================
  // SESSION COORDINATOR INTEGRATION
  // =========================================================================

  /**
   * Start Intelligence session when SDK session starts
   */
  startSession(sessionId: string, metadata?: { files?: string[] }): void {
    if (!this.intelligence) return;

    this.intelligence.startSession(sessionId, {
      workspaceId: this.options.workspaceFolder?.uri.toString(),
      tags: metadata?.files?.slice(0, 5), // First 5 files as tags
    });
  }

  /**
   * Record file modification for cross-surface visibility
   */
  recordFileModification(
    sessionId: string,
    mod: {
      path: string;
      type: "create" | "update" | "delete";
      linesChanged?: number;
    }
  ): void {
    if (!this.intelligence) return;

    this.intelligence.recordFileModification(sessionId, {
      path: mod.path,
      timestamp: Date.now(),
      type: mod.type,
      linesChanged: mod.linesChanged,
    });
  }

  /**
   * End Intelligence session when SDK session ends
   */
  endSession(sessionId: string): void {
    if (!this.intelligence) return;
    this.intelligence.endSession(sessionId);
  }

  // =========================================================================
  // USER BEHAVIOR TRACKER INTEGRATION
  // =========================================================================

  /**
   * Record user behavior for threshold calibration
   */
  recordUserBehavior(event: {
    type: "snapshot_created" | "restore_performed" | "ai_session";
    userInitiated: boolean;
  }): void {
    if (!this.vitals) return;

    if (event.type === "snapshot_created") {
      this.vitals.recordBehavior(event.userInitiated);
    }
  }

  // =========================================================================
  // SIGNAL BRIDGE INTEGRATION
  // =========================================================================

  /**
   * Record engine signal results
   */
  recordSignalResult(signal: {
    name: string;
    value: number;
    factors?: string[];
  }): void {
    // Signals are informational - store for context enrichment
    // Could be used for pattern learning in future
    logger.debug("Signal recorded", { signal: signal.name, value: signal.value });
  }

  // =========================================================================
  // VITALS ACCESS
  // =========================================================================

  /**
   * Get current vitals snapshot
   */
  getVitalsSnapshot() {
    return this.vitals?.current() ?? null;
  }

  /**
   * Get threshold multiplier for adaptive decisions
   */
  getThresholdMultiplier(): number {
    return this.vitals?.getThresholdMultiplier() ?? 1.0;
  }

  /**
   * Get agent guidance for AI tools
   */
  getAgentGuidance() {
    return this.vitals?.getAgentGuidance() ?? null;
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.initialized = false;
  }
}

// Singleton instance
let bridgeInstance: IntelligenceBridge | null = null;

export function getIntelligenceBridge(): IntelligenceBridge {
  if (!bridgeInstance) {
    bridgeInstance = new IntelligenceBridge();
  }
  return bridgeInstance;
}

export async function initializeIntelligenceBridge(
  workspaceFolder?: vscode.WorkspaceFolder
): Promise<IntelligenceBridge> {
  const bridge = getIntelligenceBridge();
  bridge.options.workspaceFolder = workspaceFolder;
  await bridge.initialize();
  return bridge;
}
```

---

### Task 2: ~~Wire HeatTracker to Intelligence~~ ✅ ALREADY DONE
**Priority**: ~~🔴 CRITICAL~~ ✅ COMPLETE
**Complexity**: N/A
**LOC**: 0

#### Status: Already Implemented in HeatIntegration.ts

**Discovery**: [HeatIntegration.ts:161](apps/vscode/src/heat/HeatIntegration.ts#L161) already calls:
```typescript
// Record to Intelligence layer
void recordFileModification(filePath, "update", {
  linesChanged: diffSize,
});
```

This integration was implemented during the HeatIntegration feature and correctly:
- Uses `void` prefix for async calls (per SnapBack learning)
- Records file modifications with diff size
- Connects to IntelligenceService via `recordFileModification()`

**No changes needed** - this task is complete.

---

### Task 3: Wire AnalysisCoordinator to Intelligence
**Priority**: 🔴 CRITICAL
**Complexity**: Low
**LOC**: ~30

#### Modify: `apps/vscode/src/handlers/AnalysisCoordinator.ts`

```typescript
// Add import at top
import { getIntelligenceBridge } from "../bridges/IntelligenceBridge";

// In analyzeAndPublish() method, after line 105:
async analyzeAndPublish(...): Promise<RiskAnalysisResult> {
  // ... existing analysis code ...

  // Store the last analysis result
  this.lastAnalysisResult = analysisResult;

  // NEW: Feed to Intelligence for learning
  const bridge = getIntelligenceBridge();
  await bridge.recordAnalysisResult({
    filePath,
    score: analysisResult.score,
    severity: analysisResult.severity || "low",
    factors: analysisResult.factors?.map(f =>
      typeof f === "string" ? f : f.message || "Unknown"
    ) || [],
    passed: !blockingResult.shouldBlock,
  });

  return {
    analysis: analysisResult,
    shouldBlock: blockingResult.shouldBlock,
    userOverride: blockingResult.userOverride,
  };
}
```

---

### Task 4: Wire SessionCoordinator to Intelligence
**Priority**: 🟡 IMPORTANT
**Complexity**: Medium
**LOC**: ~60

#### Modify: `apps/vscode/src/snapshot/SessionCoordinator.ts`

```typescript
// Add import at top
import { getIntelligenceBridge } from "../bridges/IntelligenceBridge";

// In constructor, after SDK coordinator creation:
constructor(storage: IStorageManager) {
  // ... existing code ...

  // NEW: Subscribe to session events for Intelligence tracking
  this.sdkCoordinator.onSessionFinalized((manifest) => {
    const bridge = getIntelligenceBridge();

    // End the Intelligence session when SDK session finalizes
    bridge.endSession(manifest.id);

    // Record all file modifications from the manifest
    for (const file of (manifest as any).files || []) {
      bridge.recordFileModification(manifest.id, {
        path: file.path || file.uri,
        type: "update",
        linesChanged: file.stats?.added + file.stats?.deleted,
      });
    }
  });
}

// In addCandidate() method:
addCandidate(uri: string, snapshotId: string, stats?: { added: number; deleted: number }): void {
  // ... existing code ...

  // NEW: Start Intelligence session on first candidate
  const bridge = getIntelligenceBridge();
  const sessionId = `session-${Date.now()}`;

  // Record this file modification immediately
  bridge.recordFileModification(sessionId, {
    path: uri,
    type: "update",
    linesChanged: stats ? stats.added + stats.deleted : undefined,
  });

  this.sdkCoordinator.addCandidate(uri, snapshotId, stats);
}
```

---

### Task 5: Wire UserBehaviorTracker to Intelligence
**Priority**: 🟡 IMPORTANT
**Complexity**: Low
**LOC**: ~25

#### Modify: `apps/vscode/src/utils/UserBehaviorTracker.ts`

```typescript
// Add import at top
import { getIntelligenceBridge } from "../bridges/IntelligenceBridge";

// Modify incrementCounter to also notify Intelligence:
incrementCounter(key: keyof typeof USER_BEHAVIOR_KEYS, amount = 1): void {
  const keyName = USER_BEHAVIOR_KEYS[key];
  const current = this.context.globalState.get<number>(keyName, 0);
  const newValue = current + amount;
  this.context.globalState.update(keyName, newValue);

  // NEW: Feed relevant events to Intelligence
  const bridge = getIntelligenceBridge();

  if (key === "SNAPSHOTS_CREATED") {
    bridge.recordUserBehavior({
      type: "snapshot_created",
      userInitiated: true, // Counter increments are from user actions
    });
  } else if (key === "MANUAL_RESTORES" || key === "FILES_RESTORED") {
    bridge.recordUserBehavior({
      type: "restore_performed",
      userInitiated: true,
    });
  } else if (key === "AI_ASSISTED_SESSIONS") {
    bridge.recordUserBehavior({
      type: "ai_session",
      userInitiated: false,
    });
  }

  logger.debug("Counter incremented", { key: keyName, amount, newValue });
}
```

---

### Task 6: Create SignalOrchestrator for Full Engine Pipeline
**Priority**: 🟡 IMPORTANT
**Complexity**: High
**LOC**: ~200

This creates a bridge to invoke all 7 engine signals and populate SignalAggregator properly.

#### File: `apps/vscode/src/bridges/SignalOrchestrator.ts`

```typescript
/**
 * SignalOrchestrator - Invokes all engine signals and aggregates results
 *
 * Bridges the gap between:
 * - packages/engine/src/signals/* (7 signal scripts)
 * - apps/vscode/src/domain/signalAggregator.ts
 *
 * Unlike SignalBridge which only handles burst/AI detection,
 * this orchestrator invokes the full signal pipeline.
 */

import {
  calculateRiskScore,
  calculateComplexity,
  isSensitiveFile,
} from "@snapback/engine/signals";
import type { SignalAggregator, RiskSignal } from "../domain/signalAggregator";
import { logger } from "../utils/logger";

export interface FileForSignals {
  path: string;
  content: string;
  lineCount: number;
}

export interface SignalOrchestratorResult {
  riskScore: number;
  complexity: number;
  factors: string[];
  sensitiveFiles: string[];
  threatCount: number;
}

/**
 * SignalOrchestrator invokes engine signals synchronously
 *
 * Design decision: Synchronous invocation instead of child process
 * - Engine signals export pure functions
 * - No need for stdin/stdout JSON parsing in extension
 * - Much faster (<5ms vs ~100ms for child process)
 */
export class SignalOrchestrator {
  /**
   * Run all signals on files and return aggregated result
   */
  computeSignals(files: FileForSignals[]): SignalOrchestratorResult {
    const startTime = Date.now();

    // Convert to engine format
    const engineFiles = files.map(f => ({
      path: f.path,
      content: f.content,
      lineCount: f.lineCount,
      changeType: "modify" as const,
    }));

    // 1. Risk Score (primary signal)
    const { score: riskScore, factors } = calculateRiskScore(engineFiles);

    // 2. Complexity (per-file, take max)
    let maxComplexity = 0;
    for (const file of files) {
      const complexity = calculateComplexity(file.content, file.lineCount);
      maxComplexity = Math.max(maxComplexity, complexity);
    }

    // 3. Sensitive files detection
    const sensitiveFiles = files
      .filter(f => isSensitiveFile(f.path))
      .map(f => f.path);

    // 4. Threat count (simplified - count security-related factors)
    const threatCount = factors.filter(f =>
      f.toLowerCase().includes("security") ||
      f.toLowerCase().includes("threat") ||
      f.toLowerCase().includes("sensitive")
    ).length;

    const duration = Date.now() - startTime;
    logger.debug("SignalOrchestrator computed signals", {
      riskScore,
      complexity: maxComplexity,
      factorCount: factors.length,
      sensitiveFileCount: sensitiveFiles.length,
      duration,
    });

    return {
      riskScore,
      complexity: maxComplexity,
      factors,
      sensitiveFiles,
      threatCount,
    };
  }

  /**
   * Populate a SignalAggregator with computed signals
   */
  populateAggregator(
    aggregator: SignalAggregator,
    files: FileForSignals[]
  ): void {
    const signals = this.computeSignals(files);

    // Set risk signal with full context
    const riskSignal: RiskSignal = {
      score: signals.riskScore * 10, // Normalize 0-10 to 0-100
      factors: signals.factors,
    };

    aggregator.setRiskSignal(riskSignal);

    // Set critical file signal based on sensitive files
    aggregator.setCriticalFileSignal({
      detected: signals.sensitiveFiles.length > 0,
      files: signals.sensitiveFiles,
      count: signals.sensitiveFiles.length,
    });

    logger.debug("SignalAggregator populated from engine signals", {
      riskScore: riskSignal.score,
      criticalFiles: signals.sensitiveFiles.length,
    });
  }
}

// Singleton
let orchestratorInstance: SignalOrchestrator | null = null;

export function getSignalOrchestrator(): SignalOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new SignalOrchestrator();
  }
  return orchestratorInstance;
}
```

---

### Task 7: Wire SignalOrchestrator to AutoDecisionIntegration
**Priority**: 🟡 IMPORTANT
**Complexity**: Low
**LOC**: ~30

#### Modify: `apps/vscode/src/integration/AutoDecisionIntegration.ts`

```typescript
// Add import at top
import { getSignalOrchestrator } from "../bridges/SignalOrchestrator";

// Replace getRiskScore() method (line ~566):
private async getRiskScore(fileInfos: FileInfo[]): Promise<number> {
  // NEW: Use SignalOrchestrator for full engine signal pipeline
  const orchestrator = getSignalOrchestrator();

  try {
    // Get file contents for signal computation
    const filesWithContent = await Promise.all(
      fileInfos.slice(0, 10).map(async (file) => { // Limit to 10 files
        try {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const absolutePath = path.isAbsolute(file.path)
            ? file.path
            : workspaceFolder
              ? path.join(workspaceFolder, file.path)
              : file.path;

          const document = await vscode.workspace.openTextDocument(
            vscode.Uri.file(absolutePath)
          );

          return {
            path: file.path,
            content: document.getText(),
            lineCount: document.lineCount,
          };
        } catch {
          return null;
        }
      })
    );

    const validFiles = filesWithContent.filter(Boolean) as Array<{
      path: string;
      content: string;
      lineCount: number;
    }>;

    if (validFiles.length === 0) {
      return this.estimateRiskScoreLocally(fileInfos);
    }

    // Compute signals and populate aggregator
    orchestrator.populateAggregator(this.signalAggregator, validFiles);

    // Get the computed risk score
    const signals = this.signalAggregator.getSignals();
    return signals.risk.score;

  } catch (error) {
    logger.warn("SignalOrchestrator failed, using fallback", {
      error: (error as Error).message,
    });
    return this.estimateRiskScoreLocally(fileInfos);
  }
}
```

---

### Task 8: Wire PointsTracker to Intelligence (Optional)
**Priority**: 🟢 LOW
**Complexity**: Low
**LOC**: ~15

#### Modify: `apps/vscode/src/pioneer/PointsTracker.ts`

```typescript
// Add import at top
import { getIntelligenceBridge } from "../bridges/IntelligenceBridge";

// In addPoints() method, on success (after line 192):
async addPoints(actionType: ActionType, metadata?: Record<string, unknown>): Promise<PointsTrackerResult> {
  // ... existing code ...

  if (result.success) {
    // NEW: Notify Intelligence of engagement
    const bridge = getIntelligenceBridge();

    // First AI detection is a significant event
    if (actionType === "bug_report" || metadata?._is_first_ai_detection) {
      bridge.recordUserBehavior({
        type: "snapshot_created",
        userInitiated: true,
      });
    }
  }

  return result;
}
```

---

### Task 9: Initialize Bridge During Extension Activation
**Priority**: 🔴 CRITICAL
**Complexity**: Low
**LOC**: ~20

#### Modify: `apps/vscode/src/extension.ts` (or main activation file)

```typescript
// Add import
import { initializeIntelligenceBridge } from "./bridges/IntelligenceBridge";

// In activate() function, after workspace checks:
export async function activate(context: vscode.ExtensionContext) {
  // ... existing activation code ...

  // Initialize Intelligence Bridge early
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    try {
      await initializeIntelligenceBridge(workspaceFolder);
      logger.info("IntelligenceBridge initialized during activation");
    } catch (error) {
      logger.warn("IntelligenceBridge initialization failed, continuing without", {
        error: (error as Error).message,
      });
    }
  }

  // ... rest of activation ...
}
```

---

### Task 10: Add Exports to bridges/index.ts
**Priority**: 🔴 CRITICAL
**Complexity**: Trivial
**LOC**: ~5

#### Modify: `apps/vscode/src/bridges/index.ts`

```typescript
// Add exports for new bridges
export * from "./IntelligenceBridge";
export * from "./SignalOrchestrator";
```

---

## Integration Test Plan

### Unit Tests

```typescript
// apps/vscode/src/__tests__/bridges/IntelligenceBridge.test.ts

describe("IntelligenceBridge", () => {
  it("should initialize with workspace vitals", async () => {
    const bridge = new IntelligenceBridge();
    await bridge.initialize();
    expect(bridge.getVitalsSnapshot()).not.toBeNull();
  });

  it("should record file heat and update vitals", () => {
    const bridge = getIntelligenceBridge();
    bridge.recordFileHeat({
      filePath: "/test/file.ts",
      saveCount: 5,
      diffSize: 100,
      aiInvolved: true,
      aiTool: "copilot",
      undoRedoCount: 2,
    });

    const vitals = bridge.getVitalsSnapshot();
    expect(vitals?.temperature.level).not.toBe("cold");
  });

  it("should report violations for critical analysis results", async () => {
    const bridge = getIntelligenceBridge();
    await bridge.initialize();

    await bridge.recordAnalysisResult({
      filePath: "/test/auth.ts",
      score: 0.9,
      severity: "critical",
      factors: ["Hardcoded credentials detected"],
      passed: false,
    });

    // Violation should be recorded in Intelligence
    const intel = await getIntelligence();
    const summary = intel.getViolationsSummary();
    expect(summary.total).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
// apps/vscode/src/__tests__/integration/intelligence-flow.test.ts

describe("Intelligence Integration Flow", () => {
  it("should flow heat → vitals → calibration", async () => {
    // Setup
    const bridge = await initializeIntelligenceBridge();

    // Simulate file activity
    for (let i = 0; i < 10; i++) {
      bridge.recordFileHeat({
        filePath: `/test/file${i}.ts`,
        saveCount: i + 1,
        diffSize: 50 * (i + 1),
        aiInvolved: i % 2 === 0,
        undoRedoCount: 0,
      });
    }

    // Check vitals reflect activity
    const vitals = bridge.getVitalsSnapshot();
    expect(vitals?.pulse.level).not.toBe("resting");
    expect(vitals?.pressure.value).toBeGreaterThan(0);

    // Check threshold multiplier adjusts
    const multiplier = bridge.getThresholdMultiplier();
    expect(multiplier).not.toBe(1.0);
  });

  it("should flow session → intelligence → cross-surface", async () => {
    const bridge = await initializeIntelligenceBridge();
    const intel = await getIntelligence();

    // Start session
    const sessionId = "test-session-123";
    bridge.startSession(sessionId, { files: ["file1.ts", "file2.ts"] });

    // Record modifications
    bridge.recordFileModification(sessionId, {
      path: "file1.ts",
      type: "update",
      linesChanged: 50,
    });

    // Get modifications (cross-surface visible)
    const mods = intel.getFileModifications(sessionId);
    expect(mods).toHaveLength(1);
    expect(mods[0].path).toBe("file1.ts");

    // End session
    bridge.endSession(sessionId);
  });
});
```

---

## Migration Steps

### Phase 1: Foundation (Week 1)
1. ✅ Create `IntelligenceBridge.ts`
2. ✅ Create `SignalOrchestrator.ts`
3. ✅ Add exports to `bridges/index.ts`
4. ✅ Initialize bridge during activation

### Phase 2: Critical Wiring (Week 2)
5. ✅ Wire HeatTracker → IntelligenceBridge
6. ✅ Wire AnalysisCoordinator → IntelligenceBridge
7. ✅ Wire AutoDecisionIntegration → SignalOrchestrator

### Phase 3: Session Integration (Week 3)
8. ✅ Wire SessionCoordinator → IntelligenceBridge
9. ✅ Wire UserBehaviorTracker → IntelligenceBridge
10. ✅ Wire PointsTracker → IntelligenceBridge (optional)

### Phase 4: Testing & Validation (Week 4)
11. ✅ Unit tests for IntelligenceBridge
12. ✅ Integration tests for full flow
13. ✅ Performance validation (<10ms overhead)
14. ✅ Memory validation (no leaks)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bridge init fails | Features degrade gracefully | All bridge methods check null before use |
| Intelligence package breaks | Extension won't load | Catch all errors, continue without Intelligence |
| Performance overhead | Slow saves | Async where possible, <10ms budget |
| Memory leaks | Extension bloat | Proper dispose(), clear singletons |
| Circular imports | Build fails | Bridge is leaf node, imports only services |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Integration coverage | 100% | All 7 systems wired |
| Performance overhead | <10ms | Measure bridge call latency |
| Learning data captured | >90% | Compare events to Intelligence records |
| Cross-surface visibility | 100% | MCP can see extension sessions |
| Violation auto-promotion | Working | 3x violations → pattern |

---

## Files Changed Summary (REVISED)

| File | Action | Original LOC | Revised LOC | Notes |
|------|--------|-------------|-------------|-------|
| `bridges/IntelligenceBridge.ts` | CREATE | ~250 | ~150 | EventBus subscriber pattern |
| `bridges/SignalOrchestrator.ts` | CREATE | ~200 | ~200 | Still needed |
| `bridges/index.ts` | MODIFY | +5 | +5 | Exports |
| `heat/HeatTracker.ts` | ~~MODIFY~~ | ~~+40~~ | **0** | ✅ Already wired via HeatIntegration.ts:161 |
| `handlers/AnalysisCoordinator.ts` | MODIFY | +30 | +20 | EventBus emission only |
| `snapshot/SessionCoordinator.ts` | MODIFY | +60 | +40 | EventBus pattern |
| `utils/UserBehaviorTracker.ts` | MODIFY | +25 | +15 | EventBus pattern |
| `integration/AutoDecisionIntegration.ts` | MODIFY | +30 | +30 | Add SignalOrchestrator |
| `pioneer/PointsTracker.ts` | MODIFY | +15 | +10 | EventBus emission |
| `extension.ts` | MODIFY | +20 | +15 | EventBus wiring |
| **Total** | | **~675** | **~485** | **28% reduction** |

### Key Scope Reductions

1. **HeatTracker wiring eliminated** (-40 LOC): HeatIntegration.ts already calls `recordFileModification()`
2. **IntelligenceBridge simplified** (-100 LOC): EventBus subscriber instead of direct component calls
3. **All components use EventBus pattern** (-50 LOC): Consistent, simpler integration
