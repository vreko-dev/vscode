# SnapBack Implementation Integration Guide

**Purpose**: Wiring diagram for connecting new scaffolded components with existing codebase
**Status**: Ready for TDD implementation following @ai_dev_utils/TDD_CORE.md
**Created**: 2025-12-10

---

## Component Status Matrix

| Component | File | Status | Tests | Integration Points |
|-----------|------|--------|-------|-------------------|
| **ConfigStore** | `src/storage/ConfigStore.ts` | ✅ Scaffolded | `test/unit/storage/ConfigStore.red.test.ts` | StorageManager, ClusterManager |
| **GraphManager** | `src/engine/graph/GraphManager.ts` | ✅ Scaffolded | `test/unit/engine/GraphManager.red.test.ts` | ImportAnalyzer, ClusterManager |
| **ClusterManager** | `src/engine/ClusterManager.ts` | ✅ Scaffolded | `test/unit/engine/ClusterManager.red.test.ts` | GraphManager, ConfigStore, StorageManager, PioneerGatekeeper |
| **BurstDetector** | `src/engine/BurstDetector.ts` | ✅ Scaffolded | `test/unit/engine/BurstDetector.red.test.ts` | ConfigStore, SaveHandler |
| **InteractiveTutorial** | `src/tutorial/InteractiveTutorial.ts` | ✅ Scaffolded | `test/unit/tutorial/InteractiveTutorial.red.test.ts` | PioneerGatekeeper, StorageManager, ProtectedFilesTreeProvider |

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          EXTENSION.TS                                │
│                       (Activation Root)                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌────────────────┐ ┌──────────┐ ┌──────────────┐
     │ StorageManager │ │ Pioneer  │ │ GraphManager │
     │   (Existing)   │ │Gatekeeper│ │    (NEW)     │
     └────────┬───────┘ └────┬─────┘ └──────┬───────┘
              │              │               │
              │         ┌────▼────┐          │
              │         │ConfigStore        │
              │         │  (NEW)  │          │
              │         └────┬────┘          │
              │              │               │
              └──────────────┼───────────────┘
                             ▼
                    ┌────────────────┐
                    │ClusterManager  │
                    │     (NEW)      │
                    └────────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌───────────┐  ┌───────────┐  ┌──────────┐
       │SaveHandler│  │BurstDetector  │Tutorial  │
       │ (Existing)│  │   (NEW)   │  │  (NEW)   │
       └───────────┘  └───────────┘  └──────────┘
```

---

## Chunk 1: ConfigStore Integration

### Add to StorageManager

**File**: `apps/vscode/src/storage/StorageManager.ts`

```typescript
// Add import
import { ConfigStore } from "./ConfigStore";

// Add to class
export class StorageManager implements IStorageManager {
  private configStore: ConfigStore;

  constructor(context: vscode.ExtensionContext, eventBus?: SnapBackEventBus) {
    // ... existing code ...
    this.configStore = new ConfigStore(this.storageUri);
  }

  async initialize(): Promise<void> {
    // ... existing initialization ...
    await this.configStore.initialize();
  }

  // Expose ConfigStore API
  getConfigStore(): ConfigStore {
    return this.configStore;
  }
}
```

**TDD Test**:
```typescript
// test/unit/storage/StorageManager.test.ts
it("should initialize ConfigStore", async () => {
  await storageManager.initialize();
  const config = storageManager.getConfigStore();
  expect(config).toBeDefined();
  expect(await config.getEngineConfig()).toMatchObject({
    maxDepth: 2,
    burstThreshold: 30
  });
});
```

---

## Chunk 2: Engine Layer Integration

### 1. Wire GraphManager to Extension

**File**: `apps/vscode/src/extension.ts`

```typescript
import { ImportAnalyzer } from "./engine/graph/ImportAnalyzer";
import { GraphManager } from "./engine/graph/GraphManager";

// In activate() function
const importAnalyzer = new ImportAnalyzer();
const graphManager = new GraphManager(importAnalyzer);

// Pass to other components that need it
```

### 2. Wire ClusterManager

**File**: `apps/vscode/src/extension.ts`

```typescript
import { ClusterManager } from "./engine/ClusterManager";

// In activate() function, after StorageManager and GraphManager
const clusterManager = new ClusterManager(
  graphManager,
  storage.getConfigStore(),
  storage,
  PioneerGatekeeper.getInstance()
);
```

### 3. Update SaveHandler

**File**: `apps/vscode/src/handlers/SaveHandler.ts`

**Replace cluster cache logic** with ClusterManager integration:

```typescript
// Add to constructor
constructor(
  private registry: ProtectedFileRegistry,
  operationCoordinator: OperationCoordinator,
  private clusterManager: ClusterManager, // NEW
  decorationProvider?: FileHealthDecorationProvider,
  aiRiskService?: AIRiskService,
  milestoneService?: MilestoneService,
) {
  // Remove local clusterCache and importAnalyzer
  // Use clusterManager instead
}

// Replace cluster detection
async getClusterForFile(filePath: string): Promise<ClusterInfo | null> {
  return this.clusterManager.getCluster(filePath);
}

// Replace snapshot creation
async createClusterSnapshot(anchorFile: string, trigger: string): Promise<string | null> {
  try {
    return await this.clusterManager.createClusterSnapshot(anchorFile, trigger);
  } catch (error) {
    // Non-Pioneer user - fallback to single file
    if (error.message.includes('Pioneer tier')) {
      const content = await this.readFileContent(anchorFile);
      return await this.clusterManager.createSingleFileSnapshot(anchorFile, content, trigger);
    }
    throw error;
  }
}
```

**TDD Tests**:
```typescript
// test/unit/handlers/SaveHandler.test.ts
describe("Cluster Integration", () => {
  it("should use ClusterManager for cluster detection", async () => {
    const cluster = await saveHandler.getClusterForFile("/anchor.ts");
    expect(cluster.files.size).toBeGreaterThan(1);
  });

  it("should create cluster snapshot for Pioneers", async () => {
    mockGatekeeper.canUseFeature.mockReturnValue(true);
    const snapshotId = await saveHandler.createClusterSnapshot("/anchor.ts", "save");
    expect(snapshotId).toBeDefined();
  });

  it("should fallback to single-file for non-Pioneers", async () => {
    mockGatekeeper.canUseFeature.mockReturnValue(false);
    const snapshotId = await saveHandler.createClusterSnapshot("/anchor.ts", "save");
    expect(snapshotId).toBeDefined();
    // Verify metadata indicates single-file snapshot
  });
});
```

---

## Chunk 5: BurstDetector Integration

### Wire to Extension

**File**: `apps/vscode/src/extension.ts`

```typescript
import { BurstDetector } from "./engine/BurstDetector";

// In activate() function
const burstDetector = new BurstDetector(
  storage.getConfigStore(),
  async (burstEvent) => {
    // Handle burst detection
    if (burstEvent.isProtected) {
      // Auto-snapshot protected file
      await clusterManager.createClusterSnapshot(burstEvent.filePath, 'burst');
      vscode.window.showInformationMessage(
        `📷 Rapid changes detected - snapshot created automatically`
      );
    } else {
      // Suggest protection for unprotected file
      const protect = await vscode.window.showInformationMessage(
        `🚨 Large code change detected. Protect this file?`,
        'Protect',
        'Dismiss'
      );
      if (protect === 'Protect') {
        await vscode.commands.executeCommand('snapback.protectFile', burstEvent.filePath);
      }
    }

    // Telemetry
    telemetry.track('burst_detected', {
      velocity: burstEvent.velocity,
      file_protected: burstEvent.isProtected,
      chars_changed: burstEvent.charCount
    });
  }
);

context.subscriptions.push(burstDetector);
```

**TDD Tests**:
```typescript
// test/unit/engine/BurstDetector.integration.test.ts
it("should trigger auto-snapshot for protected file", async () => {
  mockConfigStore.getProtection.mockResolvedValue({ level: 'block' });

  // Simulate rapid change (500 chars instant)
  await simulateDocumentChange(500);

  // Assert snapshot created
  expect(mockStorageManager.persistSnapshot).toHaveBeenCalled();
});

it("should show protection CTA for unprotected file", async () => {
  mockConfigStore.getProtection.mockResolvedValue(null);

  await simulateDocumentChange(500);

  // Assert notification shown
  expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
    expect.stringContaining('Protect this file'),
    expect.any(String),
    expect.any(String)
  );
});
```

---

## Chunk 4: InteractiveTutorial Integration

### Wire to Extension

**File**: `apps/vscode/src/extension.ts`

```typescript
import { InteractiveTutorial } from "./tutorial/InteractiveTutorial";

// In activate() function
const tutorial = new InteractiveTutorial(
  context,
  storage,
  PioneerGatekeeper.getInstance(),
  (snapshotId: string) => {
    // Reveal snapshot in sidebar
    protectedFilesTreeProvider.revealSnapshot(snapshotId);
  }
);

// Check if should show on first activation
if (await tutorial.shouldShow()) {
  const show = await vscode.window.showInformationMessage(
    "👋 Welcome to SnapBack! Want a quick tutorial?",
    "Yes, show me",
    "Maybe later"
  );

  if (show === "Yes, show me") {
    await tutorial.start();
  } else {
    await tutorial.dismiss();
  }
}

// Register tutorial command
context.subscriptions.push(
  vscode.commands.registerCommand("snapback.startTutorial", async () => {
    await tutorial.start();
  })
);
```

### Update ProtectedFilesTreeProvider

**File**: `apps/vscode/src/views/ProtectedFilesTreeProvider.ts`

```typescript
/**
 * Reveal a specific snapshot in the tree (for tutorial handoff)
 */
revealSnapshot(snapshotId: string): void {
  // Find snapshot node and reveal it
  // Implementation depends on tree structure
  this.refresh();

  // Focus sidebar
  vscode.commands.executeCommand('workbench.view.extension.snapback');
}
```

**TDD Tests**:
```typescript
// test/unit/tutorial/InteractiveTutorial.integration.test.ts
it("should show tutorial for first-time users", async () => {
  mockContext.globalState.get.mockReturnValue(false);
  mockStorageManager.listSnapshots.mockResolvedValue([]);

  expect(await tutorial.shouldShow()).toBe(true);
});

it("should create real snapshot during tutorial", async () => {
  await tutorial.start();

  // Simulate user edit and save
  await simulateDocumentChange();
  await simulateSave();

  // Trigger snapshot creation callback
  await tutorial.onSnapshotCreated('test-snapshot-id');

  expect(mockStorageManager.persistSnapshot).toHaveBeenCalled();
});

it("should reveal snapshot in sidebar after creation", async () => {
  const revealMock = vi.fn();
  const tutorial = new InteractiveTutorial(context, storage, gatekeeper, revealMock);

  await tutorial.onSnapshotCreated('test-id');

  expect(revealMock).toHaveBeenCalledWith('test-id');
});
```

---

## TDD Implementation Sequence

Follow this order for systematic TDD development:

### Week 1: Storage Foundation
1. **ConfigStore** (RED → GREEN → REFACTOR)
   - Start: `./ai_dev_utils/scripts/tdd-gate.sh audit`
   - Red tests: `test/unit/storage/ConfigStore.red.test.ts`
   - Gate: `./ai_dev_utils/scripts/tdd-gate.sh green`

2. **StorageManager Integration**
   - Add ConfigStore to StorageManager
   - Update tests
   - Gate: `./ai_dev_utils/scripts/tdd-gate.sh refactor`

### Week 2: Engine Layer
3. **GraphManager** (RED → GREEN → REFACTOR)
   - Red tests: `test/unit/engine/GraphManager.red.test.ts`
   - Uses existing ImportAnalyzer
   - Gate: `./ai_dev_utils/scripts/tdd-gate.sh green`

4. **ClusterManager** (RED → GREEN → REFACTOR)
   - Red tests: `test/unit/engine/ClusterManager.red.test.ts`
   - Integrates GraphManager + ConfigStore
   - Gate: `./ai_dev_utils/scripts/tdd-gate.sh green`

5. **SaveHandler Refactor**
   - Replace cluster cache with ClusterManager
   - Update existing tests
   - Gate: `./ai_dev_utils/scripts/tdd-gate.sh refactor`

### Week 3: Intelligence Layer
6. **BurstDetector** (RED → GREEN → REFACTOR)
   - Red tests: `test/unit/engine/BurstDetector.red.test.ts`
   - Wire to extension.ts
   - Gate: `./ai_dev_utils/scripts/tdd-gate.sh green`

### Week 4: Tutorial
7. **InteractiveTutorial** (RED → GREEN → REFACTOR)
   - Red tests: `test/unit/tutorial/InteractiveTutorial.red.test.ts`
   - Wire to extension.ts + sidebar
   - Gate: `./ai_dev_utils/scripts/tdd-gate.sh green`

8. **Final Certification**
   - Integration tests across all components
   - Gate: `./ai_dev_utils/scripts/tdd-gate.sh certify`

---

## Testing Coverage Checklist

Each component must achieve:
- ✅ **4-Path Coverage**: Happy, Sad, Edge, Error
- ✅ **No Vague Assertions**: Concrete expectations only
- ✅ **Integration Tests**: Real VS Code API usage
- ✅ **Performance Tests**: Meet spec budgets
- ✅ **Gate Passing**: All TDD gates green

---

## Pioneer Feature Gating

All cluster features check PioneerGatekeeper:

```typescript
// In ClusterManager
if (!this.gatekeeper.canUseFeature('clusters')) {
  throw new Error(this.gatekeeper.getUpsellMessage('clusters'));
}
```

**Test Coverage**:
- ✅ Non-Pioneer attempts cluster snapshot → error with upsell
- ✅ Pioneer creates cluster snapshot → success
- ✅ Seedling tier → clusters allowed
- ✅ Grower tier → clusters + co-change allowed

---

## Telemetry Integration

**Events to implement** (from spec):

```typescript
// ConfigStore
telemetry.track('protection_level_set', { level, is_anchor, cluster_size });

// ClusterManager
telemetry.track('cluster_snapshot_created', {
  cluster_size,
  anchor_level,
  is_pioneer
});

// BurstDetector
telemetry.track('burst_detected', {
  velocity,
  file_protected,
  chars_changed
});

// InteractiveTutorial
telemetry.track('tutorial_started');
telemetry.track('tutorial_step_completed', { step });
telemetry.track('tutorial_pioneer_cta_shown');
telemetry.track('tutorial_completed', { became_pioneer });
```

---

## Performance Budgets (from spec)

Monitor in tests:

| Operation | Budget | Test Assertion |
|-----------|--------|----------------|
| Graph analysis (cold) | <500ms | `expect(duration).toBeLessThan(500)` |
| Graph query (cached) | <10ms | `expect(duration).toBeLessThan(10)` |
| Cluster snapshot | <200ms | `expect(duration).toBeLessThan(200)` |
| Pioneer tier check | <5ms | `expect(duration).toBeLessThan(5)` |
| Burst detection event | <1ms | `expect(duration).toBeLessThan(1)` |

---

## Next Steps

1. **Load TDD_CORE.md** into each implementation session
2. **Start with ConfigStore** (simplest, no dependencies)
3. **Follow RED → GREEN → REFACTOR** cycle strictly
4. **Run gates** after each phase
5. **Document violations** if gates fail
6. **Update this guide** as integration points evolve

---

**Last Updated**: 2025-12-10
**Status**: Ready for TDD implementation
**Estimated Effort**: 4 weeks (20-30 hours per week)
