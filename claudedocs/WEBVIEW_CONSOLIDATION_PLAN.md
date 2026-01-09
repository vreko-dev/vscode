# VS Code Webview Consolidation Plan

## Executive Summary

The SnapBack extension currently has **3 separate webview panels** (`DashboardPanel`, `VitalsDashboardPanel`, `OnboardingPanelProvider`) that all load the **same React bundle** but with different data flows and initialization patterns. This creates maintenance overhead, inconsistent UX, and data synchronization challenges.

**Recommendation**: Consolidate to a single `UnifiedDashboardPanel` with one merged `WorkspaceDataService`.

---

## Current Architecture Analysis

### Panel Inventory

| Panel | View Type | Data Service | data-panel | React Tab |
|-------|-----------|--------------|------------|-----------|
| [DashboardPanel.ts:85](../src/ui/DashboardPanel.ts#L85) | `snapback.dashboard` | DashboardDataService | `"home"` | Home |
| [VitalsDashboardPanel.ts:61](../src/ui/VitalsDashboardPanel.ts#L61) | `snapback.vitalsDashboard` | UnifiedDataService | *missing* | Vitals |
| [OnboardingPanelProvider.ts:20](../src/ui/OnboardingPanelProvider.ts#L20) | `snapback.onboarding` | None (direct API) | `"onboarding"` | Setup |

### Data Service Comparison

```
DashboardDataService (803 lines)          UnifiedDataService (704 lines)
├─ getStats() → DashboardStats            ├─ getSessionHealth() → SessionHealth
├─ getActivityData() → ActivityData       ├─ getSnapshotRecommendation()
├─ getSettingsState() → SettingsState     ├─ getAgentGuidance()
├─ recordRestore()                        ├─ updateVitals()
├─ recordAIDetection()                    ├─ getLearnings()
├─ getUnifiedSnapshots()                  ├─ getViolations()
└─ onDataChange event                     └─ onDataChange event
```

**Overlap**: Both track snapshots, both have `onDataChange`, both use workspace folder.

### React App Structure ([App.tsx:34](../webview/src/App.tsx#L34))

```typescript
const TABS = [
  { id: "home", label: "Dashboard", icon: "🏠" },
  { id: "vitals", label: "Vitals", icon: "💓" },
  { id: "onboarding", label: "Setup", icon: "🚀" },
];
```

The React app already supports tab switching - the issue is that different panels initialize it differently.

---

## Problems Identified

### 1. Multiple Entry Points for Same UI
- Status Bar → `DashboardPanel` → Home tab only
- Command Palette "Open Dashboard" → `DashboardPanel` → Home tab only
- Command Palette "Show Vitals" → `VitalsDashboardPanel` → All tabs (but defaults unclear)
- Command Palette "Setup" → `OnboardingPanelProvider` → Setup tab only

### 2. Inconsistent data-panel Initialization
- `DashboardPanel` sets `data-panel="home"`
- `VitalsDashboardPanel` sets NO `data-panel` (React defaults to "home")
- `OnboardingPanelProvider` sets `data-panel="onboarding"`

### 3. Data Not Shared Between Panels
- Opening Dashboard shows stats but no vitals
- Opening Vitals shows health but no stats
- No way to see both simultaneously

### 4. Duplicate Singleton Patterns
- `DashboardPanel.instance`
- `VitalsDashboardPanel.instance`
- `DashboardDataService.instance`
- `UnifiedDataService.instances` (per-workspace)

### 5. Orphaned Code
- [ProviderStatusDashboard.tsx](../webview/src/panels/ProviderStatusDashboard.tsx) (251 lines) - never routed in App.tsx

---

## Best Practices (2025/2026)

### 1. Single Webview Panel Pattern

**Reference**: [VS Code Webview Best Practices](https://code.visualstudio.com/api/extension-guides/webview#retaincontextwhenhidden)

```typescript
// GOOD: Single panel with tabs
class UnifiedDashboardPanel {
  static readonly viewType = "snapback.dashboard";

  navigateTo(tab: "home" | "vitals" | "setup" | "activity") {
    this.panel.webview.postMessage({ type: "navigate", tab });
  }
}

// BAD: Multiple panels for same React app
class DashboardPanel { ... }
class VitalsDashboardPanel { ... }
class OnboardingPanel { ... }
```

### 2. Single Data Service with Domain Accessors

```typescript
// GOOD: Unified service with domain-specific getters
class WorkspaceDataService {
  // Core data
  getStats(): DashboardStats
  getVitals(): VitalsSnapshot | null
  getSessionHealth(): SessionHealth

  // Activity
  getActivityTimeline(): ActivityEvent[]
  getAIDetectionLog(): AIDetectionEntry[]

  // Learnings
  getLearnings(): Learning[]
  getViolations(): Violation[]

  // Unified event
  onDataChange: vscode.Event<DataChangeEvent>
}

// BAD: Separate services with overlapping concerns
class DashboardDataService { getStats(), getActivityData() }
class UnifiedDataService { getVitals(), getLearnings() }
```

### 3. Message Protocol Design

```typescript
// Extension → Webview (one-way data updates)
interface DataUpdateMessage {
  type: "update";
  stats?: DashboardStats;
  vitals?: VitalsData;
  guidance?: Guidance;
  providers?: DetectedProvider[];
  mcpStatus?: MCPStatus;
}

// Webview → Extension (commands only)
interface CommandMessage {
  type: "webviewReady"
      | "createSnapshot"
      | "configureMCP"
      | "openSettings"
      | "detectProviders"
      | "configureProvider";
  payload?: unknown;
}
```

### 4. Initialization Sequence

```typescript
constructor() {
  // 1. Set up message handler FIRST
  this.panel.webview.onDidReceiveMessage(...);

  // 2. Set HTML (React loads and sends "webviewReady")
  this.panel.webview.html = this.getHtml();

  // 3. Wait for "webviewReady" before sending data
  // (Don't call sendDataToWebview() in constructor!)
}

handleMessage(msg) {
  if (msg.type === "webviewReady") {
    this.isReady = true;
    this.sendAllData(); // NOW safe to send
  }
}
```

### 5. Tab-Based Navigation

```typescript
// HTML with initial tab from command
<div id="root" data-panel="${initialTab}"></div>

// React reads initial tab once
const rootElement = document.getElementById("root");
const initialTab = rootElement?.getAttribute("data-panel") || "home";
const [activeTab, setActiveTab] = useState(initialTab);

// Extension can change tab via message
useEffect(() => {
  const handler = (event) => {
    if (event.data.type === "navigate") {
      setActiveTab(event.data.tab);
    }
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}, []);
```

---

## Consolidation Implementation Plan

### Phase 1: Create WorkspaceDataService (Merge Data Services)

**Files to modify**:
- Create: [src/services/WorkspaceDataService.ts](../src/services/)
- Deprecate: [src/ui/DashboardDataService.ts](../src/ui/DashboardDataService.ts)
- Deprecate: [src/services/UnifiedDataService.ts](../src/services/UnifiedDataService.ts)

**Interface**:
```typescript
export interface WorkspaceDataSnapshot {
  // From DashboardDataService
  stats: DashboardStats;
  activity: ActivityData;
  settings: SettingsState;

  // From UnifiedDataService
  vitals: VitalsSnapshot | null;
  sessionHealth: SessionHealth;
  recommendation: SnapshotRecommendation;
  guidance: AgentGuidance;
  learnings: Learning[];
  violations: Violation[];
  patterns: WorkspacePattern[];
}

export class WorkspaceDataService {
  static for(workspaceId: string): WorkspaceDataService;

  getSnapshot(): WorkspaceDataSnapshot;

  // Real-time updates
  updateVitals(vitals: VitalsSnapshot): void;
  recordSnapshot(): void;
  recordRestore(snapshotId: string, files: number): void;
  recordAIDetection(tool: string, confidence: number): void;

  // Events
  onDataChange: vscode.Event<WorkspaceDataEvent>;
}
```

### Phase 2: Create UnifiedDashboardPanel

**Files to modify**:
- Create: [src/ui/UnifiedDashboardPanel.ts](../src/ui/)
- Deprecate: [src/ui/DashboardPanel.ts](../src/ui/DashboardPanel.ts)
- Deprecate: [src/ui/VitalsDashboardPanel.ts](../src/ui/VitalsDashboardPanel.ts)
- Update: [src/ui/OnboardingPanelProvider.ts](../src/ui/OnboardingPanelProvider.ts) → Merge into unified

**Key features**:
```typescript
export class UnifiedDashboardPanel {
  static readonly viewType = "snapback.dashboard";

  static createOrShow(
    extensionUri: vscode.Uri,
    dataService: WorkspaceDataService,
    initialTab?: "home" | "vitals" | "setup" | "activity"
  ): UnifiedDashboardPanel;

  navigateTo(tab: string): void;
  refresh(): void;
}
```

### Phase 3: Update React App

**Files to modify**:
- Update: [webview/src/App.tsx](../webview/src/App.tsx)
- Delete: [webview/src/panels/ProviderStatusDashboard.tsx](../webview/src/panels/ProviderStatusDashboard.tsx)

**Changes**:
1. Handle unified data message format
2. Add "activity" tab (currently missing)
3. Graceful fallbacks when data unavailable
4. Remove orphaned ProviderStatusDashboard

### Phase 4: Update Extension Commands

**Files to modify**:
- Update: [src/extension.ts](../src/extension.ts)
- Update: [package.json](../package.json)

**Command mapping**:
```typescript
// Old commands → New unified command with tab parameter
"snapback.openDashboard" → navigateTo("home")
"snapback.showVitals" → navigateTo("vitals")
"snapback.openOnboarding" → navigateTo("setup")
"snapback.showActivity" → navigateTo("activity")
```

---

## Test Impact Analysis

### Existing Tests to Update

| Test File | Lines | Impact | Action |
|-----------|-------|--------|--------|
| [test/unit/ui/DashboardDataService.test.ts](../test/unit/ui/DashboardDataService.test.ts) | 659 | **HIGH** - Tests entire DashboardDataService | Migrate to WorkspaceDataService tests, preserve all coverage |
| [test/unit/mcp/entry-point-consistency.test.ts](../test/unit/mcp/entry-point-consistency.test.ts) | 221 | **MEDIUM** - References DashboardPanel | Update imports, verify unified panel routing |
| [test/unit/ui/dashboard.test.ts](../test/unit/ui/dashboard.test.ts) | 416 | **LOW** - Uses MockDashboardProvider | Update mock to match UnifiedDashboardPanel API |
| [test/unit/manifest/command-declaration.test.ts](../test/unit/manifest/command-declaration.test.ts) | 100 | **LOW** - Tests command declarations | Add new unified commands to assertions |
| [test/unit/ui/statusBar/StatusBarController.test.ts](../test/unit/ui/statusBar/StatusBarController.test.ts) | ~200 | **LOW** - May reference panel types | Update if it references DashboardPanel |

### Test Coverage Migration Map

**From DashboardDataService.test.ts → WorkspaceDataService.test.ts:**
```
✓ Singleton pattern tests (lines 155-173) → Keep identical
✓ getStats happy path (lines 179-260) → Merge with vitals tests
✓ getSettingsState tests (lines 266-292) → Keep identical
✓ getActivityData tests (lines 298-408) → Keep identical
✓ Error handling tests (lines 443-488) → Keep, add vitals error handling
✓ Edge cases (lines 494-577) → Keep, add vitals edge cases
✓ Token calculations (lines 583-604) → Keep identical
✓ AI detection recording (lines 610-635) → Keep identical
✓ Lifecycle tests (lines 641-657) → Update disposal logic
```

**From UnifiedDataService (no dedicated test file) → Add to WorkspaceDataService.test.ts:**
```
+ getSessionHealth() tests (derive from vitals)
+ getSnapshotRecommendation() tests
+ getAgentGuidance() tests
+ updateVitals() tests
+ getLearnings() / getViolations() tests
+ File watcher behavior tests
+ Per-workspace singleton pattern tests
```

### New Tests Needed

1. **WorkspaceDataService.test.ts** (merge + extend)
   ```typescript
   describe("WorkspaceDataService", () => {
     // Migrated from DashboardDataService
     describe("stats aggregation", () => { /* existing tests */ });
     describe("activity tracking", () => { /* existing tests */ });

     // New from UnifiedDataService
     describe("vitals integration", () => {
       it("should derive session health from vitals");
       it("should calculate snapshot recommendations");
       it("should provide agent guidance based on pressure");
     });

     // New unified behavior
     describe("unified data flow", () => {
       it("should emit single onDataChange for any source update");
       it("should aggregate stats + vitals in getSnapshot()");
       it("should maintain workspace isolation");
     });
   });
   ```

2. **UnifiedDashboardPanel.test.ts** (new)
   ```typescript
   describe("UnifiedDashboardPanel", () => {
     describe("tab navigation", () => {
       it("should navigate to tab via postMessage");
       it("should respect initialTab from createOrShow()");
       it("should maintain tab state across visibility changes");
     });

     describe("data flow", () => {
       it("should send all data on webviewReady");
       it("should update all tabs on data change");
       it("should handle partial data gracefully");
     });

     describe("singleton behavior", () => {
       it("should reveal existing panel instead of creating new");
       it("should navigate existing panel to requested tab");
     });
   });
   ```

3. **entry-point-consistency.test.ts updates**
   ```typescript
   // Add to existing test suite
   describe("Unified Dashboard Entry Points", () => {
     it("should route all dashboard commands to UnifiedDashboardPanel");
     it("should preserve tab state across entry points");
     it("should use WorkspaceDataService for all data");
   });
   ```

### Test Commands

```bash
# Run all affected tests
pnpm --filter @snapback/vscode test test/unit/ui/DashboardDataService.test.ts
pnpm --filter @snapback/vscode test test/unit/mcp/entry-point-consistency.test.ts
pnpm --filter @snapback/vscode test test/unit/ui/dashboard.test.ts

# After migration, run new consolidated tests
pnpm --filter @snapback/vscode test test/unit/ui/WorkspaceDataService.test.ts
pnpm --filter @snapback/vscode test test/unit/ui/UnifiedDashboardPanel.test.ts
```

---

## Migration Checklist

- [ ] Create `WorkspaceDataService` merging both services
- [ ] Create `UnifiedDashboardPanel` with tab support
- [ ] Update React app for unified data format
- [ ] Add "activity" tab to React app
- [ ] Delete `ProviderStatusDashboard.tsx` (orphaned)
- [ ] Update extension.ts command handlers
- [ ] Add deprecation warnings to old panels
- [ ] Update package.json commands
- [ ] Update all tests
- [ ] Remove deprecated files after deprecation period

---

## Bundle Size Impact

Current (3 panels, 2 data services):
- DashboardPanel.ts: 532 lines
- VitalsDashboardPanel.ts: 897 lines
- OnboardingPanelProvider.ts: 297 lines
- DashboardDataService.ts: 803 lines
- UnifiedDataService.ts: 704 lines
- **Total: ~3,233 lines**

After consolidation (1 panel, 1 data service):
- UnifiedDashboardPanel.ts: ~600 lines (estimated)
- WorkspaceDataService.ts: ~900 lines (estimated)
- **Total: ~1,500 lines** (54% reduction)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing command shortcuts | Medium | High | Add deprecation period with forwarding |
| Data sync issues during migration | Low | Medium | Comprehensive tests before removal |
| React hydration errors | Low | Medium | Test data-panel attribute handling |
| User confusion from UI changes | Low | Low | Tabs remain familiar, just unified |

---

## Timeline Recommendation

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: WorkspaceDataService | 1-2 days | None |
| Phase 2: UnifiedDashboardPanel | 2-3 days | Phase 1 |
| Phase 3: React Updates | 1 day | Phase 2 |
| Phase 4: Command Updates | 0.5 day | Phase 3 |
| Testing & Validation | 1-2 days | All phases |
| **Total** | **5-8 days** | |

---

## References

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [React in VS Code Webviews](https://github.com/nicknisi/vscode-extension-react-template)
