# SnapBack IP Protection Audit Report

**Date**: 2025-01-05
**Scope**: VS Code Extension bundle analysis, MCP server architecture, package exports
**Objective**: Determine where IP-sensitive logic executes (client vs server) and produce gap analysis

---

## Executive Summary

- **DBSCAN clustering** (`packages/core/src/clustering/dbscan.ts`) is **NOT bundled** in the extension - marked external in esbuild config
- **Risk scoring** (`packages/engine/src/signals/risk-score.ts`) is **BUNDLED** in extension.js (~7KB minified)
- **AI detection** (`packages/engine/src/signals/ai-detection.ts`) is **BUNDLED** in extension.js (basic heuristics)
- **No rollback validation or smart grouping algorithms** were found implemented - these are planned features
- **Critical Gap**: `@snapback/engine` is **bundled** into the extension (not externalized), exposing risk-score and AI detection logic

---

## Section 1: IP-Sensitive Logic Inventory

| Algorithm | File Location | Package | Exported | Consumed By |
|-----------|---------------|---------|----------|-------------|
| **DBSCAN Clustering** | `packages/core/src/clustering/dbscan.ts` | `@snapback/core` | Not exported (internal) | Not consumed |
| **Risk Scoring** | `packages/engine/src/signals/risk-score.ts` | `@snapback/engine` | `@snapback/engine/signals` | Extension (via SignalOrchestrator) |
| **AI Detection (Engine)** | `packages/engine/src/signals/ai-detection.ts` | `@snapback/engine` | `@snapback/engine/signals` | Extension (via SignalBridge) |
| **AI Detection (Core)** | `packages/core/src/ai-detection.ts` | `@snapback/core` | `@snapback/core` (main export) | External via lazy import |
| **Threat Detection** | `packages/engine/src/signals/threats.ts` | `@snapback/engine` | `@snapback/engine/signals` | Extension (via editorDecorations) |
| **Complexity Scoring** | `packages/engine/src/signals/complexity.ts` | `@snapback/engine` | `@snapback/engine/signals` | Extension (via SignalOrchestrator) |
| **Burst Detection** | `packages/engine/src/signals/burst.ts` | `@snapback/engine` | `@snapback/engine/signals` | Extension (via SignalBridge) |

### Not Found (planned but not implemented)

- `validateRollback` / `RollbackValidation` - No implementation found
- `smartGrouping` / `SessionGroup` - No implementation found
- `PatternEngine` / L1/L2/L3 learning - Only planning docs exist

---

## Section 2: MCP Tool Execution Paths

```
MCP Tool: snap (mode: start/check/context)
├─ Entry: packages/mcp/src/tools/consolidated/snap.ts
├─ Calls: handleBeginTask, handleQuickCheck (local handlers)
├─ Actual algorithm: Local TypeScript validation, pattern matching
└─ Executes on: LOCAL (MCP server process, not cloud)

MCP Tool: check (mode: q/f/p/b/i/c/d)
├─ Entry: packages/mcp/src/tools/consolidated/check.ts
├─ Calls: TypeScript compiler, ESLint (spawned processes)
├─ Actual algorithm: Build tool wrappers, no proprietary logic
└─ Executes on: LOCAL

MCP Tool: snap_violation / snap_learn
├─ Entry: packages/mcp/src/tools/consolidated/
├─ Calls: File-based learning storage (JSON/SQLite)
├─ Actual algorithm: Pattern matching, file I/O
└─ Executes on: LOCAL

MCP Tool: analyze_before_apply (threat detection)
├─ Entry: packages/mcp/src/analyze_before_apply.ts
├─ Calls: Diff analysis, pattern matching
├─ Actual algorithm: Regex-based threat patterns (exposed)
└─ Executes on: LOCAL
```

**Note**: The apps/mcp-server (remote HTTP transport) imports from `@snapback/mcp` and `@snapback/platform` but does NOT contain additional IP-sensitive algorithms - it's a thin HTTP wrapper.

---

## Section 3: Package Dependency Analysis

### Extension Bundle Externals (from esbuild.config.cjs:21-105)

| Package | Status | Reason |
|---------|--------|--------|
| `@snapback/core` | EXTERNAL | `~4MB - lazy-loaded via dynamic import` |
| `@snapback/core/*` | EXTERNAL | All subpaths |
| `@snapback/intelligence` | EXTERNAL | Moved to language server |
| `@snapback/infrastructure` | EXTERNAL | Not needed locally |
| `@snapback/engine` | **BUNDLED** | Comment says "Must be bundled - ESM-only" |

### What Gets Bundled in extension.js (1.7MB)

```bash
# Verified via grep in extension.js:
AIDetector           # FOUND
BurstDetector        # FOUND
calculateComplexity  # FOUND
calculateRiskScore   # FOUND
detectThreats        # FOUND
DBSCAN               # NOT found
euclideanDistance    # NOT found
```

---

## Section 4: Current State Matrix

| Feature | Implementation File | Package | Ships In Extension? | Ships In MCP Server? | Calls Cloud API? | IP Risk |
|---------|---------------------|---------|---------------------|----------------------|------------------|---------|
| **DBSCAN Clustering** | `packages/core/src/clustering/dbscan.ts` | `@snapback/core` | NO (external) | NO (not used) | NO | LOW |
| **Risk Scoring** | `packages/engine/src/signals/risk-score.ts` | `@snapback/engine` | **YES** | YES | NO | **HIGH** |
| **AI Detection (Basic)** | `packages/engine/src/signals/ai-detection.ts` | `@snapback/engine` | **YES** | YES | NO | MEDIUM |
| **Threat Detection** | `packages/engine/src/signals/threats.ts` | `@snapback/engine` | **YES** | YES | NO | MEDIUM |
| **Complexity Scoring** | `packages/engine/src/signals/complexity.ts` | `@snapback/engine` | **YES** | YES | NO | LOW |
| **Burst Detection** | `packages/engine/src/signals/burst.ts` | `@snapback/engine` | **YES** | YES | NO | LOW |
| **Snapshot CRUD** | `packages/engine/src/runtime/storage.ts` | `@snapback/engine` | **YES** | YES | NO | LOW |
| **Advanced AI Detection** | NOT IMPLEMENTED | N/A | N/A | N/A | N/A | N/A |
| **Rollback Validation** | NOT IMPLEMENTED | N/A | N/A | N/A | N/A | N/A |
| **Smart Grouping** | NOT IMPLEMENTED | N/A | N/A | N/A | N/A | N/A |
| **Pattern Learning (L2/L3)** | NOT IMPLEMENTED | N/A | N/A | N/A | N/A | N/A |

---

## Section 5: Optimal State Definition

The target architecture for IP protection:

| Feature | Should Execute | Reason |
|---------|----------------|--------|
| Snapshot create/list/restore | Local (extension) | Basic CRUD, no IP value |
| Basic AI detection | Local (compiled) | Acceptable exposure when minified |
| DBSCAN clustering | Cloud API only | Core differentiator |
| Risk scoring | Cloud API only | Proprietary weights/models |
| Advanced AI detection | Cloud API only | ML models, training data |
| Rollback validation | Cloud API only | Safety algorithms |
| Pattern learning (L1) | Local | Project-specific, stays on machine |
| Pattern learning (L2/L3) | Cloud | Cross-user aggregation |

---

## Section 6: Gap Analysis

### Gap 1: Risk Scoring Logic Exposed in Extension Bundle

**Feature**: Risk Scoring
**Current State**: Bundled in `extension.js` via `@snapback/engine/signals`
**Optimal State**: Cloud API only
**Gap**: Algorithm logic (sensitive file patterns, pattern triggers, complexity calculation formulas) is visible in minified bundle

**Migration Steps**:
1. Create `apps/api/modules/risk/` for server-side risk calculation
2. Expose endpoint `/v1/analyze-risk` with tier gating (Pro only)
3. Replace `calculateRiskScore` imports in extension with API call to `/v1/analyze-risk`
4. Keep basic heuristics (file size, save frequency) local, move weighted scoring to server

**Risk if not migrated**: MEDIUM - Formulas are visible but not easily extractable from minified code

---

### Gap 2: Threat Detection Patterns Exposed

**Feature**: Threat Detection
**Current State**: `detectThreats` bundled in extension, patterns exposed in `packages/engine/src/signals/threats.ts`
**Optimal State**: Cloud API only for advanced detection; basic patterns acceptable locally
**Gap**: SENSITIVE_PATTERNS and PATTERN_TRIGGERS arrays are fully visible

**Migration Steps**:
1. Split threats.ts into `threats-basic.ts` (local) and `threats-advanced.ts` (server)
2. Basic patterns (common security issues) can stay local
3. Advanced patterns (proprietary heuristics) move to cloud API
4. Gate advanced detection behind Pro tier

**Risk if not migrated**: LOW - These patterns are mostly industry-standard OWASP checks

---

### Gap 3: `@snapback/engine` Bundled (Not Externalized)

**Feature**: Entire engine package
**Current State**: ESM-only package bundled into CJS extension due to module format incompatibility
**Optimal State**: Signals should be server-side, storage can stay local
**Gap**: All signals/ directory is exposed

**Migration Steps**:
1. Split `@snapback/engine` exports:
   - `@snapback/engine/storage` - Keep bundled (CRUD operations, no IP value)
   - `@snapback/engine/signals` - Externalize or move to language server
2. Convert signals to use remote API calls for Pro features
3. Keep basic signals local for Free tier UX

**Risk if not migrated**: MEDIUM - Risk scoring and detection logic exposed

---

### Gap 4: DBSCAN Not Connected (Unused)

**Feature**: DBSCAN Clustering
**Current State**: Implemented in `packages/core/src/clustering/dbscan.ts` but NOT exported or used anywhere
**Optimal State**: Should be Cloud API only when activated
**Gap**: Algorithm exists but is dormant

**Migration Steps**:
1. When implementing smart grouping, create API endpoint (NOT local)
2. Ensure `packages/core/src/clustering/` never gets exported in `packages/core/src/index.ts`
3. Add bundle verification test to fail if DBSCAN appears in extension bundle

**Risk if not migrated**: NONE (currently unexposed)

---

## Section 7: Recommended Actions

### P0 (Critical) - Immediate Action Required

| Action | Files | Effort |
|--------|-------|--------|
| Add esbuild test to fail if `calculateRiskScore` appears in bundle | `apps/vscode/test/performance/bundle-size.test.ts` | S |
| Create `/v1/analyze-risk` API endpoint | `apps/api/modules/risk/` | M |
| Gate risk analysis behind Pro tier | `packages/contracts/src/features.ts` | S |

### P1 (High) - Next Sprint

| Action | Files | Effort |
|--------|-------|--------|
| Split `@snapback/engine/signals` into local vs remote | `packages/engine/src/signals/` | L |
| Create language server proxy for signals | `apps/vscode/server/` | M |
| Add bundle content verification CI job | `.github/workflows/` | S |

### P2 (Medium) - Backlog

| Action | Files | Effort |
|--------|-------|--------|
| Convert extension to use API for advanced AI detection | `apps/vscode/src/bridges/SignalBridge.ts` | M |
| Implement rollback validation as server-only | `apps/api/modules/` | L |
| Implement smart grouping via cloud API | `apps/api/modules/` | L |

### P3 (Low) - Nice to Have

| Action | Files | Effort |
|--------|-------|--------|
| Obfuscate remaining local heuristics | `apps/vscode/esbuild.config.cjs` | S |
| Add source map stripping for production | `apps/vscode/esbuild.config.cjs` | S |

---

## Section 8: Bundle Verification Commands

After migration, run these to confirm protection:

```bash
# 1. Check for IP-sensitive terms in extension bundle
strings apps/vscode/dist/extension.js | grep -iE "calculateRiskScore|SENSITIVE_PATTERNS|PATTERN_TRIGGERS|detectThreats" | wc -l
# Expected: 0

# 2. Verify DBSCAN never appears
grep -c "DBSCAN\|euclideanDistance\|regionQuery\|expandCluster" apps/vscode/dist/extension.js
# Expected: 0

# 3. Check bundle size is under limit
ls -la apps/vscode/dist/extension.js | awk '{print $5}'
# Expected: < 2097152 (2MB)

# 4. List externalized packages
grep "@snapback/" apps/vscode/dist/extension.js | sort -u
# Expected: Only dynamic import references, not actual code

# 5. Verify risk API is being called (after migration)
grep -c "analyze-risk" apps/vscode/dist/extension.js
# Expected: 1+ (API endpoint reference)
```

---

## Conclusion

### What's Protected

| Item | Status | Notes |
|------|--------|-------|
| DBSCAN Clustering | PROTECTED | External, not bundled, not exported |
| @snapback/core | PROTECTED | Externalized in esbuild config |
| @snapback/intelligence | PROTECTED | Moved to language server |

### What's At Risk

| Item | Status | Notes |
|------|--------|-------|
| Risk Scoring | EXPOSED | Bundled via @snapback/engine |
| AI Detection | EXPOSED | Bundled via @snapback/engine |
| Threat Detection | EXPOSED | Bundled via @snapback/engine |

### Not Yet Built

| Item | Status | Recommendation |
|------|--------|----------------|
| Rollback Validation | N/A | Implement server-side only |
| Smart Grouping | N/A | Implement server-side only |
| Advanced ML Models | N/A | Implement server-side only |
| Pattern Learning L2/L3 | N/A | Implement server-side only |

---

## Immediate Next Steps

1. **Add bundle verification tests** to prevent IP leakage before extension marketplace distribution
2. **Gate risk scoring behind Pro tier API** - the `calculateRiskScore` formula is currently exposed
3. **Split @snapback/engine** into bundled (storage) and external (signals) parts

The risk scoring formula (`calculateRiskScore`) and threat patterns (`SENSITIVE_PATTERNS`) are currently exposed in the 1.7MB extension.js bundle.
