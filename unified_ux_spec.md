# SnapBack VS Code Extension — Unified UX Specification

**Version:** 1.0.0
**Last Updated:** December 2025
**Status:** Production-Ready Specification

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [User Journeys](#3-user-journeys)
4. [Multi-Entry Onboarding](#4-multi-entry-onboarding)
5. [Data Sync Architecture](#5-data-sync-architecture)
6. [Edge Cases Matrix](#6-edge-cases-matrix)
7. [Implementation Priorities](#7-implementation-priorities)
8. [Test Cases](#8-test-cases)
9. [Telemetry Requirements](#9-telemetry-requirements)
10. [Appendices](#10-appendices)

---

## 1. Executive Summary

### 1.1 Purpose

This specification defines the complete user experience for the SnapBack VS Code extension, including:
- All user journeys from activation to advanced features
- Multi-entry onboarding flows (Extension-first, CLI-first, Both)
- Cross-surface data synchronization (Extension ↔ API ↔ Dashboard ↔ CLI ↔ MCP)
- 92 identified edge cases with handling strategies
- Implementation priorities and test requirements

### 1.2 Core Promise

> **"Invisible protection until needed, then magic recovery."**

Every design decision should reinforce this promise. Users should:
- Get protected in <30 seconds with zero configuration
- Never think about SnapBack until they need to restore
- Experience "aha moments" that feel like the product saved them

### 1.3 Release Readiness

| Area | Readiness | Blockers |
|------|-----------|----------|
| Core Functionality | 95% | None |
| Data Integrity | 95% | None |
| Cross-Surface Sync | 60% | 4 P0 gaps |
| Telemetry | 80% | 2 missing events |
| Multi-Entry Onboarding | 40% | CLI sync not implemented |
| Edge Case Handling | 24% | 23 unhandled cases |

**Overall: ~85% ready for polished release**

---

## 2. Architecture Overview

### 2.1 Component Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SNAPBACK PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  VS Code    │  │    CLI      │  │    MCP      │  │  Dashboard  │        │
│  │  Extension  │  │   Tool      │  │   Server    │  │    (Web)    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│                    ┌──────────────▼──────────────┐                          │
│                    │      SHARED CONFIG          │                          │
│                    │      ~/.snapback/           │                          │
│                    │  • config.json              │                          │
│                    │  • cli-lock.json            │                          │
│                    │  • projects/                │                          │
│                    └──────────────┬──────────────┘                          │
│                                   │                                          │
│                    ┌──────────────▼──────────────┐                          │
│                    │         API LAYER           │                          │
│                    │    api.snapback.dev         │                          │
│                    │  • Auth (Better Auth)       │                          │
│                    │  • Telemetry (PostHog)      │                          │
│                    │  • Pioneer Program          │                          │
│                    │  • Cloud Backup (Pro)       │                          │
│                    └─────────────────────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Ownership Matrix

| Data Type | Owner | Sync Direction | Conflict Resolution |
|-----------|-------|----------------|---------------------|
| Snapshots (blobs) | Extension (local) | None (local-only) | N/A |
| Snapshot metadata | Extension → API | Push on create | Last-write-wins |
| User auth | API | API → All surfaces | API authoritative |
| Pioneer points | API | API → Extension (WebSocket) | API authoritative |
| Settings | Extension | Bidirectional (future) | TBD |
| Telemetry | Extension → API | Push (queued offline) | Append-only |
| Sessions | Extension | Push metadata to API | Extension authoritative |

### 2.3 Config Directory Structure

```
~/.snapback/                              # Global config root
├── config.json                           # Auth, preferences, global settings
├── version.txt                           # SnapBack version for compatibility
├── cli-lock.json                         # CLI heartbeat (if running)
├── extension-link.json                   # Extension → CLI connection metadata
│
├── projects/                             # Project-level configs
│   ├── {project-hash}/
│   │   ├── config.json                   # Project-local overrides
│   │   ├── architecture.json             # Discovered architecture
│   │   ├── patterns.json                 # Detected patterns/risks
│   │   └── snapshots/                    # Local snapshot storage
│   │       ├── manifests/                # Snapshot metadata
│   │       └── blobs/                    # Content-addressable storage
│   └── ...
│
├── backups/                              # Cloud backup staging (Pro)
│
└── logs/
    ├── extension.log
    └── cli.log
```

---

## 3. User Journeys

### 3.1 Journey Map Overview

| # | Journey | Priority | UX Impact | Data Sync Points |
|---|---------|----------|-----------|------------------|
| J1 | First-Time Activation | P0 | 🔴 Critical | Auth, PostHog, DB |
| J2 | Automatic Snapshot Creation | P0 | 🔴 Critical | Local storage, PostHog |
| J3 | One-Click Restore | P0 | 🔴 Critical | Local storage, PostHog, Pioneer |
| J4 | Save Interception (BLOCK) | P1 | 🟠 High | Decision logs, PostHog |
| J5 | Pioneer Program | P1 | 🟠 High | API, WebSocket, Dashboard |
| J6 | AI Detection | P1 | 🟠 High | Signals, Dashboard stats |
| J7 | Session Lifecycle | P1 | 🟠 High | Local, API metadata |
| J8 | Settings Sync | P2 | 🟡 Medium | Extension ↔ Dashboard |
| J9 | Error Recovery | P2 | 🟡 Medium | PostHog, Sentry |
| J10 | MCP Integration | P2 | 🟡 Medium | SSE, Extension state |

---

### 3.2 Journey 1: First-Time Activation (P0)

#### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FIRST-TIME ACTIVATION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

User installs extension from marketplace
        │
        ▼
┌───────────────────────────────┐
│ Extension activates           │
│ • Check: ~/.snapback exists?  │
│ • Check: CLI running?         │
│ • Check: Previous auth?       │
└───────────────────────────────┘
        │
        ├─── YES (returning user) ──────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│ FRESH INSTALL                 │    │ RETURNING USER                │
│ • Create ~/.snapback          │    │ • Load existing config        │
│ • Register empty views        │    │ • Restore auth session        │
│ • Open Welcome Walkthrough    │    │ • Show "Welcome back!"        │
└───────────────────────────────┘    └───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ AUTH FLOW                     │
│ • Show: "Sign in with GitHub" │
│ • OAuth PKCE flow             │
│ • 2-minute timeout            │
└───────────────────────────────┘
        │
        ├─── SUCCESS ─────────────────┬─── FAILURE ─────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ Store credentials   │    │ Timeout             │    │ OAuth denied        │
│ • VS Code secrets   │    │ • Show retry option │    │ • Show alt auth     │
│ • API key generated │    │ • Log telemetry     │    │ • Google / Email    │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ INITIALIZATION COMPLETE       │
│ • AutoDecisionEngine active   │
│ • Status bar: "Protected"     │
│ • Sidebar populated           │
│ • Track: extension_activated  │
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ OPTIONAL: CLI DETECTION       │
│ • Poll ~/.snapback/cli-lock   │
│ • If found: Link to CLI       │
│ • If not: Show subtle CTA     │
└───────────────────────────────┘
```

#### Telemetry Events

| Event | Properties | Trigger |
|-------|------------|---------|
| `extension_installed` | `version`, `platform`, `entry_point` | First activation ever |
| `extension_activated` | `activation_time_ms`, `is_returning_user` | Every activation |
| `auth_started` | `provider`, `entry_point` | OAuth flow begins |
| `auth_completed` | `provider`, `duration_ms`, `success` | OAuth completes |
| `auth_failed` | `provider`, `error_code`, `error_message` | OAuth fails |
| `walkthrough_opened` | `step` | Walkthrough displayed |
| `walkthrough_completed` | `duration_ms`, `steps_completed` | Walkthrough finished |

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J1-E01 | OAuth timeout (>2 min) | Show retry prompt with helpful message | ✅ Handled |
| J1-E02 | User denies GitHub scope | Show specific error, offer Google/Email | ⚠️ Partial |
| J1-E03 | Network drops mid-OAuth | No state recovery; user restarts | ⚠️ Partial |
| J1-E04 | VS Code restarts during activation | Auth state lost; need checkpoint | ❌ Gap |
| J1-E05 | Multiple VS Code windows | Race condition on config writes | ⚠️ Partial |
| J1-E06 | Extension installed but never opened | Lazy activation on first file | ✅ Handled |
| J1-E07 | Corporate proxy blocks OAuth | No fallback; need manual token | ❌ Gap |
| J1-E08 | User has no GitHub account | Flow C (Google/Email) exists | ⚠️ Partial |
| J1-E09 | Existing user reinstalls extension | May lose local snapshots | ⚠️ Partial |
| J1-E10 | VS Code Remote (SSH/Container/WSL) | Auth flow may break in remote | ❌ Gap |
| J1-E11 | CLI installed while extension running | Hot-link via cli-lock.json polling | 🆕 Not impl |
| J1-E12 | Config version mismatch | Migration logic needed | 🆕 Not impl |
| J1-E13 | Config file corrupted | JSON parse recovery needed | ❌ Gap |
| J1-E14 | Multiple machines, synced config | Version check + re-discovery | 🆕 Not impl |
| J1-E15 | Monorepo with multiple roots | Per-project config handling | 🆕 Not impl |
| J1-E16 | Workspace trust not granted | May block file operations | ❌ Gap |

---

### 3.3 Journey 2: Automatic Snapshot Creation (P0)

#### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTOMATIC SNAPSHOT CREATION FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

User saves file (Cmd+S)
        │
        ▼
┌───────────────────────────────┐
│ onWillSaveTextDocument fires  │
│ [Pre-save hook, synchronous]  │
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐     ┌─────────────────────────┐
│ Check: Is file protected?     │────▶│ NO: Return immediately  │
│ [Registry lookup <5ms]        │     │ [Don't block save]      │
└───────────────────────────────┘     └─────────────────────────┘
        │ YES
        ▼
┌───────────────────────────────┐
│ Capture PRE-SAVE content      │
│ • Read from disk (not buffer) │
│ • Calculate hash              │
│ • Check deduplication         │
└───────────────────────────────┘
        │
        ├─── DEDUPE HIT ──────────────────────────────────────────┐
        │    (Same content within 500ms)                          │
        │                                                         ▼
        ▼                                              ┌─────────────────────┐
┌───────────────────────────────┐                      │ Skip snapshot       │
│ AutoDecisionEngine evaluates  │                      │ Track: dedup_hit    │
│ • AI activity detected?       │                      └─────────────────────┘
│ • Risk score threshold?       │
│ • Protection level?           │
└───────────────────────────────┘
        │
        ├─── WATCH level ─────────────────────────────────────────┐
        │    (Silent snapshot)                                    │
        │                                                         │
        ├─── WARN level ──────────────────────────────────────────┤
        │    (Snapshot + notification)                            │
        │                                                         │
        └─── BLOCK level ─────────────────────────────────────────┤
             (Modal confirmation required)                        │
                                                                  │
        ┌─────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Create Snapshot               │
│ • Generate intelligent name   │
│ • Classify icon               │
│ • Write to BlobStore          │
│ • Update manifest             │
│ • Add to session              │
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Post-Snapshot                 │
│ • Emit: snapshot_created      │
│ • Update sidebar TreeView     │
│ • Flash status bar            │
│ • Award Pioneer points        │
└───────────────────────────────┘
```

#### Performance Budgets

| Operation | Budget | Enforcement |
|-----------|--------|-------------|
| Protection check | <5ms | Inline, no async |
| Content capture | <20ms | Disk read |
| Decision evaluation | <50ms | AutoDecisionEngine |
| Snapshot write | <100ms | Total save handler |
| UI update | <50ms | Post-save, async |

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J2-E01 | Rapid-fire saves (<100ms) | Deduplicator with 500ms window | ✅ Handled |
| J2-E02 | Save during snapshot write | Need mutex to prevent race | ⚠️ Partial |
| J2-E03 | Disk full / quota exceeded | Silent failure currently | ❌ Critical |
| J2-E04 | File >10MB | Performance degrades; no warning | ⚠️ Partial |
| J2-E05 | Binary file saved | Excluded by default | ✅ Handled |
| J2-E06 | File deleted after save | Snapshot created, restore recreates | ⚠️ Partial |
| J2-E07 | Symbolic link saved | May snapshot symlink vs target | ❌ Gap |
| J2-E08 | Special characters in filename | Windows path issues possible | ⚠️ Partial |
| J2-E09 | Git operation in progress | No interference | ✅ Handled |
| J2-E10 | Network drive file | Latency may exceed budgets | ❌ Gap |
| J2-E11 | Read-only file | onWillSave still captures | ✅ Handled |
| J2-E12 | Concurrent AI tools | May double-detect | ⚠️ Partial |
| J2-E13 | Non-UTF8 encoding | May corrupt on restore | ❌ Gap |
| J2-E14 | Save handler timeout | No timeout enforcement | ❌ Critical |

---

### 3.4 Journey 3: One-Click Restore (P0)

#### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ONE-CLICK RESTORE FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks "Restore" in sidebar
        │
        ▼
┌───────────────────────────────┐
│ Load snapshot metadata        │
│ • Files included              │
│ • Timestamps                  │
│ • Size information            │
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Show confirmation modal       │
│ • "Restore N files?"          │
│ • List files with diff stats  │
│ • Warning: "Current changes   │
│   will be backed up first"    │
└───────────────────────────────┘
        │
        ├─── CANCEL ──────────────────────────────────────────────┐
        │                                                         │
        ▼                                                         ▼
┌───────────────────────────────┐                      ┌─────────────────────┐
│ User confirms restore         │                      │ Track: restore_     │
│                               │                      │        cancelled    │
└───────────────────────────────┘                      └─────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ PRE-RESTORE SAFETY            │
│ • Create PRE_ROLLBACK checkpoint│
│ • This backs up current state │
│ • User can undo the restore   │
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Check for conflicts           │
│ • File locked by process?     │
│ • File moved/renamed?         │
│ • Permissions changed?        │
│ • Parent folder deleted?      │
└───────────────────────────────┘
        │
        ├─── CONFLICTS FOUND ─────────────────────────────────────┐
        │                                                         │
        ▼                                                         ▼
┌───────────────────────────────┐                      ┌─────────────────────┐
│ No conflicts: Proceed         │                      │ Show conflict modal │
│                               │                      │ • Skip conflicted   │
│                               │                      │ • Force overwrite   │
│                               │                      │ • Cancel restore    │
└───────────────────────────────┘                      └─────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ ATOMIC RESTORE                │
│ For each file:                │
│ 1. Read blob from storage     │
│ 2. Verify checksum            │
│ 3. Write to temp location     │
│ 4. Atomic move to final path  │
└───────────────────────────────┘
        │
        ├─── FAILURE (any file) ──────────────────────────────────┐
        │                                                         │
        ▼                                                         ▼
┌───────────────────────────────┐                      ┌─────────────────────┐
│ All files restored            │                      │ ROLLBACK            │
│ • Refresh editors             │                      │ • Restore from      │
│ • Show success message        │                      │   PRE_ROLLBACK      │
│ • Track: snapshot_restored    │                      │ • Show error        │
│ • Award Pioneer points        │                      │ • Track: restore_   │
└───────────────────────────────┘                      │          failed     │
                                                       └─────────────────────┘
```

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J3-E01 | File modified since snapshot | Shows diff, creates backup | ✅ Handled |
| J3-E02 | File deleted since snapshot | Recreates file | ✅ Handled |
| J3-E03 | File moved/renamed | Orphaned restore; wrong location | ❌ Critical |
| J3-E04 | Folder structure changed | May fail to create parent dirs | ❌ Critical |
| J3-E05 | File locked by process | Fails with error; no retry | ⚠️ Partial |
| J3-E06 | Permissions changed | Write fails silently | ❌ Gap |
| J3-E07 | Snapshot blob corrupted | Checksum exists but recovery unclear | ⚠️ Partial |
| J3-E08 | Cluster partial lock | Some files locked = inconsistent | ❌ Critical |
| J3-E09 | Restore during AI session | May trigger new AI detection | ⚠️ Partial |
| J3-E10 | Undo after restore | VS Code undo works but limited | ⚠️ Partial |
| J3-E11 | Workspace trust not granted | May block file writes | ❌ Gap |
| J3-E12 | Large cluster (100+ files) | Performance unknown; UI freeze? | ❌ Gap |
| J3-E13 | Snapshot from different machine | N/A (local only currently) | N/A |

---

### 3.5 Journey 4: Save Interception — BLOCK Level (P1)

#### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SAVE INTERCEPTION (BLOCK LEVEL)                          │
└─────────────────────────────────────────────────────────────────────────────┘

User saves BLOCK-protected file
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│                                                                    │
│  🛡 PROTECTED FILE                                                │
│                                                                    │
│  Button.tsx is protected at BLOCK level.                          │
│  This will snapshot the entire cluster (6 files).                 │
│                                                                    │
│  Files in cluster:                                                 │
│  • Button.tsx (anchor)                                            │
│  • useButton.ts                                                   │
│  • ButtonContext.tsx                                              │
│  • buttonStyles.ts                                                │
│  • types/button.ts                                                │
│  • useClickOutside.ts                                             │
│                                                                    │
│  ┌─────────────────────┐  ┌─────────────────────┐                 │
│  │  Snapshot & Save    │  │      Cancel         │                 │
│  └─────────────────────┘  └─────────────────────┘                 │
│                                                                    │
│  □ Don't ask again for this cluster                               │
│                                                                    │
└───────────────────────────────────────────────────────────────────┘
```

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J4-E01 | User clicks away from modal | Modal may dismiss; save proceeds | ⚠️ Partial |
| J4-E02 | Auto-save enabled | May not show modal on auto-save | ❌ Critical |
| J4-E03 | Format-on-save slow | May timeout before protection | ❌ Gap |
| J4-E04 | 50 files saved at once | 50 modals? Performance? | ❌ Gap |
| J4-E05 | User walks away from modal | No timeout; blocks indefinitely | ❌ Gap |
| J4-E06 | "Don't ask again" wrong persist | Preference may not sync | ⚠️ Partial |
| J4-E07 | Cluster changes while modal open | Snapshot may be stale | ❌ Gap |

---

### 3.6 Journey 5: Pioneer Program (P1)

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J5-E01 | Points awarded while offline | Points lost permanently | ❌ Critical |
| J5-E02 | WebSocket disconnects | May show stale tier | ⚠️ Partial |
| J5-E03 | Points faster than sync | UI lag in badge update | ⚠️ Partial |
| J5-E04 | Tier threshold crossed offline | Celebration delayed | ❌ Gap |
| J5-E05 | User deletes account, rejoins | Points history unclear | ❌ Gap |
| J5-E06 | Two devices, same account | Point attribution race | ⚠️ Partial |
| J5-E07 | API rate limit hit | Silently fails; no retry | ⚠️ Partial |

---

### 3.7 Journey 6: AI Detection (P1)

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J6-E01 | New AI tool released | Falls back to generic detection | ✅ Handled |
| J6-E02 | AI tool disabled mid-session | Session still marked AI-assisted | ⚠️ Partial |
| J6-E03 | False positive (fast typing) | Confidence thresholds exist | ✅ Handled |
| J6-E04 | AI in another window | May miss AI activity | ⚠️ Partial |
| J6-E05 | Code pasted from browser AI | External paste not tracked | ❌ Gap |
| J6-E06 | AI generates empty content | May not trigger snapshot | ⚠️ Partial |
| J6-E07 | AI in terminal (not editor) | Shell scripts from AI missed | ❌ Gap |

---

### 3.8 Journey 7: Session Lifecycle (P1)

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J7-E01 | VS Code crashes mid-session | Session orphaned; may not finalize | ❌ Critical |
| J7-E02 | User hibernates machine | Timeout may fire incorrectly | ⚠️ Partial |
| J7-E03 | Session spans multiple days | Long sessions work but odd UX | ⚠️ Partial |
| J7-E04 | No meaningful edits | No session created | ✅ Handled |
| J7-E05 | Two workspaces interleaved | Sessions may cross-contaminate | ❌ Gap |
| J7-E06 | Inactivity timeout aggressive | Default may split logical sessions | ⚠️ Partial |

---

### 3.9 Journey 8: Settings Sync (P2)

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J8-E01 | Conflict: extension vs dashboard | No sync exists yet | ❌ Gap |
| J8-E02 | Offline changes + online | Sync not implemented | ❌ Gap |
| J8-E03 | Settings migration on update | Schema changes may lose prefs | ⚠️ Partial |
| J8-E04 | .snapbackrc malformed JSON | Fallback to defaults | ⚠️ Partial |
| J8-E05 | Settings exceed size limit | May fail silently | ❌ Gap |
| J8-E06 | Concurrent config writes | Need file locking | ❌ Gap |
| J8-E07 | Config backup before modify | Not implemented | ❌ Gap |
| J8-E08 | Config corruption recovery | JSON parse error handling | ❌ Gap |

---

### 3.10 Journey 9: Error Recovery (P2)

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J9-E01 | Extension throws during save | Catches error, allows save | ✅ Handled |
| J9-E02 | Infinite error loop | No circuit breaker | ⚠️ Partial |
| J9-E03 | Error during error logging | May drop telemetry | ⚠️ Partial |
| J9-E04 | Out of memory | Extension may crash silently | ❌ Gap |
| J9-E05 | Sentry/PostHog unreachable | Offline queue exists | ✅ Handled |
| J9-E06 | CLI heartbeat stale (crashed) | Extension should detect + fallback | 🆕 Not impl |
| J9-E07 | Graceful degradation mode | CLI dies → extension continues | 🆕 Not impl |

---

### 3.11 Journey 10: MCP Integration (P2)

#### Edge Cases

| ID | Edge Case | Handling | Status |
|----|-----------|----------|--------|
| J10-E01 | MCP server disconnects | Reconnect logic exists | ⚠️ Partial |
| J10-E02 | AI calls deprecated tool | May return error | ❌ Gap |
| J10-E03 | Concurrent MCP + manual ops | State conflicts possible | ❌ Gap |
| J10-E04 | MCP request during restore | May deadlock | ❌ Gap |
| J10-E05 | Large response exceeds SSE | May truncate | ❌ Gap |
| J10-E06 | MCP tool discovery mismatch | Extension vs CLI tools differ | 🆕 Not impl |
| J10-E07 | MCP bridging through CLI | Extension → CLI → MCP | 🆕 Not impl |

---

## 4. Multi-Entry Onboarding

### 4.1 Entry Point Decision Tree

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MULTI-ENTRY ONBOARDING DECISION TREE                      │
└─────────────────────────────────────────────────────────────────────────────┘

USER ACTION: Install SnapBack
        │
        ▼
┌───────────────────────────────┐
│ Which entry point?            │
└───────────────────────────────┘
        │
        ├─── VS CODE EXTENSION ───────────────────────────────────┐
        │                                                         │
        ├─── CLI TOOL ────────────────────────────────────────────┤
        │                                                         │
        └─── BOTH (existing user) ────────────────────────────────┘
                                                                  │
        ┌─────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Check: ~/.snapback exists?    │
└───────────────────────────────┘
        │
        ├─── NO ──────────────────────────────────────────────────┐
        │    (Fresh install)                                      │
        │                                                         │
        └─── YES ─────────────────────────────────────────────────┤
             (Returning user or other tool installed)             │
                                                                  │
        ┌─────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Check: cli-lock.json exists?  │
│ (CLI currently running)       │
└───────────────────────────────┘
        │
        ├─── YES ─────────────────────────────────────────────────┐
        │    → Link extension to CLI                              │
        │    → Use CLI's MCP tools                                │
        │    → Sync through CLI                                   │
        │                                                         │
        └─── NO ──────────────────────────────────────────────────┤
             → Extension runs standalone                          │
             → Poll for CLI availability                          │
             → Show subtle "Install CLI" CTA                      │
                                                                  │
        ┌─────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Check: config version match?  │
└───────────────────────────────┘
        │
        ├─── MATCH ───────────────────────────────────────────────┐
        │    → Load config normally                               │
        │                                                         │
        └─── MISMATCH ────────────────────────────────────────────┤
             → Run migration                                      │
             → Backup old config                                  │
             → Show "Upgraded!" message                           │
```

### 4.2 Flow A: Extension First (Most Common)

```
USER INSTALLS EXTENSION FROM MARKETPLACE
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Welcome to SnapBack 🔄                                         │
│                                                                  │
│   Analyzing your codebase...                                    │
│   ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 35%             │
│                                                                  │
│   ✓ Found: 2,341 files                                          │
│   ✓ Detected: Next.js + TypeScript                              │
│   ⏳ Generating initial snapshot...                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼ (30 seconds max)
        │
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Your code is protected! 🎉                                     │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Project: my-app                                         │   │
│   │  Framework: Next.js 14                                   │   │
│   │  Language: TypeScript                                    │   │
│   │  Files protected: 2,341                                  │   │
│   │  First snapshot: ✓ Created                               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│   │ View Snapshots  │  │  Learn More     │  │ Install CLI     │ │
│   │    (main)       │  │  (secondary)    │  │   (subtle)      │ │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
EXTENSION IS FULLY FUNCTIONAL
        │
        │   Later: User installs CLI
        │           ↓
        │   Extension detects cli-lock.json
        │           ↓
        │   "SnapBack CLI detected! ⚡ Upgrading experience..."
        │           ↓
        │   Extension links to CLI's MCP tools
        │   No restart required
```

### 4.3 Flow B: CLI First (Power Users)

```
USER RUNS: npm install -g @snapback/cli
        │
        ▼
USER RUNS: snapback init
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  SnapBack CLI v1.5.0                                            │
│                                                                  │
│  ? Select your project root:                                    │
│    ❯ /Users/dev/my-app                                          │
│      /Users/dev/other-project                                   │
│      Browse...                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Analyzing architecture...                                      │
│  ████████████████████████████████████████████████ 100%          │
│                                                                  │
│  ✓ Config created: ~/.snapback/projects/my-app/                 │
│  ✓ First snapshot created                                       │
│  ✓ Watch mode available                                         │
│                                                                  │
│  Discovered:                                                    │
│  • Files: 2,341                                                 │
│  • Framework: Next.js 14                                        │
│  • Language: TypeScript                                         │
│                                                                  │
│  ? Install VS Code extension for IDE integration?               │
│    ❯ Yes, open marketplace                                      │
│      No, I'll do it later                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
CLI IS READY
        │
        │   Commands available:
        │   • snapback status
        │   • snapback backup
        │   • snapback restore
        │   • snapback watch
        │
        │   Later: User installs extension
        │           ↓
        │   Extension detects existing config
        │           ↓
        │   "Found your SnapBack CLI setup! ✓"
        │           ↓
        │   Zero re-analysis needed
```

### 4.4 Flow C: Reconnection (Both Already Installed)

```
SCENARIO: User has CLI, now installs extension
        │
        ▼
┌───────────────────────────────┐
│ Extension activates           │
│ Checks: ~/.snapback exists?   │
│ → YES                         │
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Checks: cli-lock.json exists? │
│ → YES (CLI is running)        │
└───────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   SnapBack CLI detected! ⚡                                      │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Connected to: my-app                                    │   │
│   │  CLI Status: Running (watch mode)                        │   │
│   │  Last backup: 2 minutes ago                              │   │
│   │  Snapshots: 47                                           │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Your extension is now supercharged with CLI capabilities.     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
EXTENSION LINKS TO CLI
• Uses CLI's MCP tools for advanced operations
• Real-time backup status from CLI
• Configuration perfectly in sync
• No re-initialization needed
```

### 4.5 CLI Lock File Specification

```typescript
// ~/.snapback/cli-lock.json

interface CliLockFile {
  // Process identity
  pid: number;
  version: string;
  startedAt: string;       // ISO timestamp

  // Heartbeat (updated every 10 seconds)
  lastHeartbeat: string;   // ISO timestamp

  // MCP connection info
  mcpPort: number;
  mcpTransport: 'sse' | 'stdio';

  // Active state
  watchingProjects: string[];
  activeBackups: number;

  // Extension linkage
  linkedExtensions: string[];  // Extension instance IDs
}

// Example:
{
  "pid": 12345,
  "version": "1.5.0",
  "startedAt": "2025-12-25T10:00:00Z",
  "lastHeartbeat": "2025-12-25T10:05:30Z",
  "mcpPort": 3100,
  "mcpTransport": "sse",
  "watchingProjects": ["/Users/dev/my-app"],
  "activeBackups": 0,
  "linkedExtensions": ["vscode-instance-abc123"]
}
```

### 4.6 CLI Detection Logic

```typescript
// Extension startup logic

async function initializeSnapBack(): Promise<InitState> {
  const snapbackHome = getSnapBackHomeDir(); // ~/.snapback

  // Step 1: Check if SnapBack has ever been installed
  if (!await fs.exists(snapbackHome)) {
    return freshInstall();
  }

  // Step 2: Load and validate config
  const config = await loadConfigSafely(snapbackHome);
  if (config.needsMigration) {
    await performMigration(config);
  }

  // Step 3: Check for CLI
  const cliLock = await checkCliLock(snapbackHome);
  if (cliLock.isRunning) {
    return linkToCli(cliLock);
  }

  // Step 4: Start standalone mode + poll for CLI
  startCliPolling(snapbackHome);
  return standaloneMode(config);
}

async function checkCliLock(home: string): Promise<CliLockState> {
  const lockPath = path.join(home, 'cli-lock.json');

  if (!await fs.exists(lockPath)) {
    return { isRunning: false };
  }

  const lock = await fs.readJson(lockPath);
  const heartbeatAge = Date.now() - new Date(lock.lastHeartbeat).getTime();

  // Stale if no heartbeat for 30 seconds
  if (heartbeatAge > 30_000) {
    await fs.remove(lockPath); // Clean up stale lock
    return { isRunning: false, wasStale: true };
  }

  return {
    isRunning: true,
    mcpPort: lock.mcpPort,
    version: lock.version
  };
}

function startCliPolling(home: string): void {
  // Poll every 5 seconds for CLI availability
  setInterval(async () => {
    const cliLock = await checkCliLock(home);

    if (cliLock.isRunning && !state.linkedToCli) {
      // CLI just started! Hot-link to it
      await linkToCli(cliLock);
      showNotification("SnapBack CLI detected! ⚡ Experience upgraded.");
    }
  }, 5000);
}
```

---

## 5. Data Sync Architecture

### 5.1 Sync Matrix

| Data Type | Extension | CLI | Dashboard | API | MCP |
|-----------|-----------|-----|-----------|-----|-----|
| **User Auth** | Read (secrets) | Read (config) | Read (session) | Owner | N/A |
| **Snapshots** | Owner (blobs) | Owner (blobs) | Read (metadata) | Read (metadata) | Read/Write |
| **Settings** | Read/Write | Read/Write | Read/Write | Storage | N/A |
| **Pioneer** | Read | N/A | Read | Owner | N/A |
| **Telemetry** | Write | Write | Read | Aggregator | N/A |
| **Sessions** | Owner | Read | Read | Read | Read/Write |

### 5.2 Event Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TELEMETRY EVENT FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

Extension Event                 CLI Event
     │                              │
     ▼                              ▼
┌─────────────┐              ┌─────────────┐
│ TelemetryProxy│            │ TelemetryClient│
│ (Extension)   │            │ (CLI)         │
└──────┬──────┘              └──────┬──────┘
       │                            │
       │  ┌───────────────────────┐ │
       └─▶│   OfflineEventQueue   │◀┘
          │   (if network down)   │
          └───────────┬───────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │   oRPC Telemetry API  │
          │  /api/rpc/telemetry.* │
          └───────────┬───────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │      PostHog          │
          │  (Aggregation)        │
          └───────────┬───────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │     Dashboard         │
          │  (Visualization)      │
          └───────────────────────┘
```

### 5.3 Real-Time Sync (Future)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REAL-TIME DASHBOARD SYNC (PROPOSED)                       │
└─────────────────────────────────────────────────────────────────────────────┘

Extension                                               Dashboard
    │                                                       │
    │  snapshot_created event                               │
    │           │                                           │
    │           ▼                                           │
    │  ┌─────────────────┐                                  │
    │  │ WebSocket Client │                                 │
    │  └────────┬────────┘                                  │
    │           │                                           │
    │           │    ws://api.snapback.dev/realtime         │
    │           │ ─────────────────────────────────────────▶│
    │           │                                           │
    │           │                          ┌─────────────────┐
    │           │                          │ Dashboard receives│
    │           │                          │ • Snapshot count  │
    │           │                          │ • Activity feed   │
    │           │                          │ • Pioneer points  │
    │           │                          └─────────────────┘
```

---

## 6. Edge Cases Matrix

### 6.1 Summary by Status

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Handled | 19 | 21% |
| ⚠️ Partial | 36 | 39% |
| ❌ Gap | 23 | 25% |
| 🆕 Not Implemented | 14 | 15% |
| **Total** | **92** | 100% |

### 6.2 Complete Edge Cases List

| ID | Journey | Edge Case | Status | Priority |
|----|---------|-----------|--------|----------|
| J1-E01 | Activation | OAuth timeout (>2 min) | ✅ | P2 |
| J1-E02 | Activation | User denies GitHub scope | ⚠️ | P1 |
| J1-E03 | Activation | Network drops mid-OAuth | ⚠️ | P1 |
| J1-E04 | Activation | VS Code restarts during activation | ❌ | P1 |
| J1-E05 | Activation | Multiple VS Code windows | ⚠️ | P1 |
| J1-E06 | Activation | Extension installed but never opened | ✅ | P3 |
| J1-E07 | Activation | Corporate proxy blocks OAuth | ❌ | P0 |
| J1-E08 | Activation | User has no GitHub account | ⚠️ | P2 |
| J1-E09 | Activation | Existing user reinstalls extension | ⚠️ | P2 |
| J1-E10 | Activation | VS Code Remote (SSH/Container/WSL) | ❌ | P1 |
| J1-E11 | Activation | CLI installed while extension running | 🆕 | P1 |
| J1-E12 | Activation | Config version mismatch | 🆕 | P1 |
| J1-E13 | Activation | Config file corrupted | ❌ | P0 |
| J1-E14 | Activation | Multiple machines, synced config | 🆕 | P2 |
| J1-E15 | Activation | Monorepo with multiple roots | 🆕 | P1 |
| J1-E16 | Activation | Workspace trust not granted | ❌ | P1 |
| J2-E01 | Snapshot | Rapid-fire saves (<100ms) | ✅ | P3 |
| J2-E02 | Snapshot | Save during snapshot write | ⚠️ | P1 |
| J2-E03 | Snapshot | Disk full / quota exceeded | ❌ | P0 |
| J2-E04 | Snapshot | File >10MB | ⚠️ | P2 |
| J2-E05 | Snapshot | Binary file saved | ✅ | P3 |
| J2-E06 | Snapshot | File deleted after save | ⚠️ | P2 |
| J2-E07 | Snapshot | Symbolic link saved | ❌ | P2 |
| J2-E08 | Snapshot | Special characters in filename | ⚠️ | P2 |
| J2-E09 | Snapshot | Git operation in progress | ✅ | P3 |
| J2-E10 | Snapshot | Network drive file | ❌ | P2 |
| J2-E11 | Snapshot | Read-only file | ✅ | P3 |
| J2-E12 | Snapshot | Concurrent AI tools | ⚠️ | P2 |
| J2-E13 | Snapshot | Non-UTF8 encoding | ❌ | P1 |
| J2-E14 | Snapshot | Save handler timeout | ❌ | P0 |
| J3-E01 | Restore | File modified since snapshot | ✅ | P3 |
| J3-E02 | Restore | File deleted since snapshot | ✅ | P3 |
| J3-E03 | Restore | File moved/renamed | ❌ | P0 |
| J3-E04 | Restore | Folder structure changed | ❌ | P0 |
| J3-E05 | Restore | File locked by process | ⚠️ | P1 |
| J3-E06 | Restore | Permissions changed | ❌ | P1 |
| J3-E07 | Restore | Snapshot blob corrupted | ⚠️ | P1 |
| J3-E08 | Restore | Cluster partial lock | ❌ | P0 |
| J3-E09 | Restore | Restore during AI session | ⚠️ | P2 |
| J3-E10 | Restore | Undo after restore | ⚠️ | P2 |
| J3-E11 | Restore | Workspace trust not granted | ❌ | P1 |
| J3-E12 | Restore | Large cluster (100+ files) | ❌ | P2 |
| J4-E01 | BLOCK Modal | User clicks away from modal | ⚠️ | P2 |
| J4-E02 | BLOCK Modal | Auto-save enabled | ❌ | P0 |
| J4-E03 | BLOCK Modal | Format-on-save slow | ❌ | P2 |
| J4-E04 | BLOCK Modal | 50 files saved at once | ❌ | P1 |
| J4-E05 | BLOCK Modal | User walks away from modal | ❌ | P2 |
| J4-E06 | BLOCK Modal | "Don't ask again" wrong persist | ⚠️ | P2 |
| J4-E07 | BLOCK Modal | Cluster changes while modal open | ❌ | P2 |
| J5-E01 | Pioneer | Points awarded while offline | ❌ | P0 |
| J5-E02 | Pioneer | WebSocket disconnects | ⚠️ | P1 |
| J5-E03 | Pioneer | Points faster than sync | ⚠️ | P2 |
| J5-E04 | Pioneer | Tier threshold crossed offline | ❌ | P1 |
| J5-E05 | Pioneer | User deletes account, rejoins | ❌ | P2 |
| J5-E06 | Pioneer | Two devices, same account | ⚠️ | P2 |
| J5-E07 | Pioneer | API rate limit hit | ⚠️ | P2 |
| J6-E01 | AI Detection | New AI tool released | ✅ | P3 |
| J6-E02 | AI Detection | AI tool disabled mid-session | ⚠️ | P2 |
| J6-E03 | AI Detection | False positive (fast typing) | ✅ | P3 |
| J6-E04 | AI Detection | AI in another window | ⚠️ | P2 |
| J6-E05 | AI Detection | Code pasted from browser AI | ❌ | P1 |
| J6-E06 | AI Detection | AI generates empty content | ⚠️ | P2 |
| J6-E07 | AI Detection | AI in terminal (not editor) | ❌ | P2 |
| J7-E01 | Sessions | VS Code crashes mid-session | ❌ | P0 |
| J7-E02 | Sessions | User hibernates machine | ⚠️ | P2 |
| J7-E03 | Sessions | Session spans multiple days | ⚠️ | P2 |
| J7-E04 | Sessions | No meaningful edits | ✅ | P3 |
| J7-E05 | Sessions | Two workspaces interleaved | ❌ | P2 |
| J7-E06 | Sessions | Inactivity timeout aggressive | ⚠️ | P2 |
| J8-E01 | Settings | Conflict: extension vs dashboard | ❌ | P2 |
| J8-E02 | Settings | Offline changes + online | ❌ | P2 |
| J8-E03 | Settings | Settings migration on update | ⚠️ | P1 |
| J8-E04 | Settings | .snapbackrc malformed JSON | ⚠️ | P1 |
| J8-E05 | Settings | Settings exceed size limit | ❌ | P3 |
| J8-E06 | Settings | Concurrent config writes | ❌ | P1 |
| J8-E07 | Settings | Config backup before modify | ❌ | P1 |
| J8-E08 | Settings | Config corruption recovery | ❌ | P0 |
| J9-E01 | Errors | Extension throws during save | ✅ | P3 |
| J9-E02 | Errors | Infinite error loop | ⚠️ | P1 |
| J9-E03 | Errors | Error during error logging | ⚠️ | P2 |
| J9-E04 | Errors | Out of memory | ❌ | P2 |
| J9-E05 | Errors | Sentry/PostHog unreachable | ✅ | P3 |
| J9-E06 | Errors | CLI heartbeat stale (crashed) | 🆕 | P1 |
| J9-E07 | Errors | Graceful degradation mode | 🆕 | P1 |
| J10-E01 | MCP | MCP server disconnects | ⚠️ | P2 |
| J10-E02 | MCP | AI calls deprecated tool | ❌ | P2 |
| J10-E03 | MCP | Concurrent MCP + manual ops | ❌ | P2 |
| J10-E04 | MCP | MCP request during restore | ❌ | P2 |
| J10-E05 | MCP | Large response exceeds SSE | ❌ | P3 |
| J10-E06 | MCP | MCP tool discovery mismatch | 🆕 | P2 |
| J10-E07 | MCP | MCP bridging through CLI | 🆕 | P2 |

---

## 7. Implementation Priorities

### 7.1 P0 — Pre-Release Blockers (Week 1)

These must be fixed before any public release:

| ID | Issue | Effort | Files to Modify |
|----|-------|--------|-----------------|
| **P0-1** | Add `snapshot_restored` telemetry | S (2hr) | `operationCoordinator.ts` |
| **P0-2** | Save handler 100ms timeout | S (2hr) | `SaveHandler.ts` |
| **P0-3** | Activation funnel tracking | S (3hr) | `extension.ts` |
| **P0-4** | Queue pioneer points offline | M (4hr) | `PointsTracker.ts` |
| **P0-5** | Disk full detection + warning | M (4hr) | `StorageManager.ts` |
| **P0-6** | File moved/renamed restore handling | M (6hr) | `OperationCoordinator.ts` |
| **P0-7** | Auto-save + BLOCK modal interaction | M (4hr) | `SaveHandler.ts` |
| **P0-8** | VS Code crash session recovery | M (6hr) | `SessionCoordinator.ts` |
| **P0-9** | Config corruption recovery | S (3hr) | Config loading utilities |

**Total P0 Effort: ~34 hours (~4-5 days)**

### 7.2 P1 — Post-Launch Priority (Week 2-3)

| ID | Issue | Effort | Notes |
|----|-------|--------|-------|
| **P1-1** | Real-time dashboard sync (WebSocket) | L (8hr) | Major feature |
| **P1-2** | CLI detection + hot-linking | L (8hr) | Multi-entry onboarding |
| **P1-3** | Config version migration | M (4hr) | Upgrade path |
| **P1-4** | VS Code Remote environment support | M (6hr) | Enterprise users |
| **P1-5** | Corporate proxy manual auth fallback | M (4hr) | Enterprise users |
| **P1-6** | Monorepo multi-project support | L (8hr) | Power users |
| **P1-7** | CLI heartbeat + stale detection | M (4hr) | Reliability |
| **P1-8** | MCP session tools | M (4hr) | AI integration |
| **P1-9** | Cluster partial restore handling | M (6hr) | Data integrity |
| **P1-10** | File locking for config writes | S (2hr) | Race conditions |

**Total P1 Effort: ~54 hours (~7 days)**

### 7.3 P2 — Polish Phase (Week 4+)

| ID | Issue | Effort | Notes |
|----|-------|--------|-------|
| **P2-1** | Settings sync (extension ↔ dashboard) | L (12hr) | Cross-surface |
| **P2-2** | Latency percentile tracking | M (4hr) | Observability |
| **P2-3** | Storage quota monitoring | S (2hr) | Proactive |
| **P2-4** | External AI paste detection | L (10hr) | Detection gap |
| **P2-5** | Large cluster performance | M (6hr) | Edge case |

---

## 8. Test Cases

### 8.1 Critical Path Tests

```typescript
// tests/e2e/critical-path.spec.ts

describe("Critical Path: First Activation", () => {
  test("fresh install creates config and completes auth", async () => {
    // Remove any existing config
    await fs.remove("~/.snapback");

    // Activate extension
    await vscode.commands.executeCommand("snapback.activate");

    // Verify config created
    expect(await fs.exists("~/.snapback/config.json")).toBe(true);

    // Verify walkthrough opened
    expect(mockWalkthrough.opened).toBe(true);

    // Complete auth flow
    await completeOAuthFlow();

    // Verify auth stored
    const secrets = await vscode.secrets.get("snapback.auth");
    expect(secrets).toBeTruthy();

    // Verify telemetry
    expect(telemetryEvents).toContain("extension_installed");
    expect(telemetryEvents).toContain("auth_completed");
  });

  test("activation completes within 500ms budget", async () => {
    const start = Date.now();
    await vscode.commands.executeCommand("snapback.activate");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
  });
});

describe("Critical Path: Snapshot Creation", () => {
  test("save handler completes within 100ms budget", async () => {
    // Protect a file
    await protectFile("src/Button.tsx", "WATCH");

    // Time the save
    const start = Date.now();
    await vscode.commands.executeCommand("workbench.action.files.save");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test("snapshot appears in sidebar after save", async () => {
    await saveProtectedFile("src/Button.tsx");

    const snapshots = await getSnapshotsFromSidebar();
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].files).toContain("Button.tsx");
  });
});

describe("Critical Path: Restore", () => {
  test("restore recovers file content correctly", async () => {
    // Save original content
    const original = "const x = 1;";
    await writeFile("src/test.ts", original);
    await saveProtectedFile("src/test.ts");

    // Modify file
    await writeFile("src/test.ts", "const x = 2;");

    // Restore
    const snapshots = await getSnapshots();
    await restoreSnapshot(snapshots[0].id);

    // Verify
    const restored = await readFile("src/test.ts");
    expect(restored).toBe(original);
  });

  test("restore creates PRE_ROLLBACK checkpoint", async () => {
    const snapshotsBefore = await getSnapshots();
    await restoreSnapshot(snapshotsBefore[0].id);

    const snapshotsAfter = await getSnapshots();
    const preRollback = snapshotsAfter.find(s =>
      s.name.includes("PRE_ROLLBACK")
    );

    expect(preRollback).toBeTruthy();
  });
});
```

### 8.2 Edge Case Tests

```typescript
// tests/e2e/edge-cases.spec.ts

describe("Edge Case: Storage Full", () => {
  test("shows warning when storage reaches 80%", async () => {
    // Mock storage to report 80% full
    mockStorage.setUtilization(0.8);

    await saveProtectedFile("src/test.ts");

    expect(notifications).toContainEqual(
      expect.objectContaining({
        type: "warning",
        message: expect.stringContaining("storage")
      })
    );
  });

  test("prevents snapshot with error at 100%", async () => {
    mockStorage.setUtilization(1.0);

    await saveProtectedFile("src/test.ts");

    expect(notifications).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("full")
      })
    );

    expect(telemetryEvents).toContain("storage_full");
  });
});

describe("Edge Case: File Renamed", () => {
  test("restore handles file renamed since snapshot", async () => {
    // Create snapshot
    await writeFile("src/old.ts", "content");
    await saveProtectedFile("src/old.ts");
    const snapshot = (await getSnapshots())[0];

    // Rename file
    await renameFile("src/old.ts", "src/new.ts");

    // Restore
    await restoreSnapshot(snapshot.id);

    // Verify: original path restored
    expect(await fs.exists("src/old.ts")).toBe(true);

    // Verify: user notified about rename
    expect(notifications).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("renamed")
      })
    );
  });
});

describe("Edge Case: Cluster Partial Lock", () => {
  test("atomic failure prevents partial restore", async () => {
    // Create cluster snapshot (3 files)
    await createClusterSnapshot(["a.ts", "b.ts", "c.ts"]);
    const snapshot = (await getSnapshots())[0];

    // Lock one file
    await lockFile("b.ts");

    // Attempt restore
    const result = await restoreSnapshot(snapshot.id);

    // Verify: restore failed
    expect(result.success).toBe(false);

    // Verify: no partial restore (a.ts not changed)
    expect(await readFile("a.ts")).toBe("modified");

    // Verify: user sees which file blocked
    expect(result.error).toContain("b.ts");
  });
});

describe("Edge Case: Auto-save + BLOCK", () => {
  test("shows modal on auto-save for BLOCK files", async () => {
    // Enable auto-save
    await vscode.workspace.getConfiguration().update(
      "files.autoSave",
      "afterDelay"
    );

    // Protect file at BLOCK level
    await protectFile("src/Button.tsx", "BLOCK");

    // Modify file (triggers auto-save)
    await editFile("src/Button.tsx", "// new content");

    // Wait for auto-save delay
    await sleep(1000);

    // Verify modal appeared
    expect(mockModal.shown).toBe(true);
    expect(mockModal.type).toBe("BLOCK_PROTECTION");
  });
});

describe("Edge Case: Pioneer Offline Points", () => {
  test("queues points when offline", async () => {
    // Disconnect network
    mockNetwork.disconnect();

    // Trigger point-earning action
    await saveProtectedFile("src/test.ts");

    // Verify local cache incremented
    const localPoints = await getLocalPioneerPoints();
    expect(localPoints.pending).toBeGreaterThan(0);

    // Reconnect
    mockNetwork.connect();
    await waitForSync();

    // Verify API called
    expect(apiCalls).toContainEqual(
      expect.objectContaining({
        endpoint: "/api/pioneer/actions/submit"
      })
    );

    // Verify pending cleared
    const pointsAfter = await getLocalPioneerPoints();
    expect(pointsAfter.pending).toBe(0);
  });
});

describe("Edge Case: CLI Hot-Link", () => {
  test("extension detects CLI and links without restart", async () => {
    // Start extension without CLI
    await activateExtension();
    expect(extensionState.linkedToCli).toBe(false);

    // Start CLI (creates cli-lock.json)
    await startCli();

    // Wait for polling interval
    await sleep(6000);

    // Verify linked
    expect(extensionState.linkedToCli).toBe(true);

    // Verify notification
    expect(notifications).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("CLI detected")
      })
    );
  });

  test("extension falls back when CLI crashes", async () => {
    // Start linked
    await activateExtension();
    await startCli();
    await waitForLink();

    // Crash CLI (heartbeat stale)
    await killCli();
    await sleep(35000); // 30s stale threshold + buffer

    // Verify fallback
    expect(extensionState.linkedToCli).toBe(false);

    // Verify notification
    expect(notifications).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("offline")
      })
    );

    // Verify extension still works
    await saveProtectedFile("src/test.ts");
    const snapshots = await getSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
  });
});
```

---

## 9. Telemetry Requirements

### 9.1 Required Events

| Event | Category | Properties | Status |
|-------|----------|------------|--------|
| `extension_installed` | Activation | version, platform, entry_point | ✅ |
| `extension_activated` | Activation | activation_time_ms, is_returning | ✅ |
| `auth_started` | Auth | provider, entry_point | ✅ |
| `auth_completed` | Auth | provider, duration_ms, success | ✅ |
| `auth_failed` | Auth | provider, error_code | ✅ |
| `walkthrough_completed` | Onboarding | duration_ms, steps | ⚠️ Partial |
| `first_protected_save` | Milestone | file_type, protection_level | ✅ |
| `snapshot_created` | Core | session_id, bytes, dedup_hit, latency_ms | ✅ |
| `snapshot_restored` | Core | snapshot_id, files_restored, duration_ms | ❌ Missing |
| `save_attempt` | Core | protection, severity, ai_present, outcome | ✅ |
| `session_finalized` | Sessions | session_id, files, duration_ms, ai_present | ✅ |
| `pioneer_action_completed` | Pioneer | action_type, points_awarded | ❌ Missing |
| `cli_detected` | Multi-Entry | cli_version, link_success | 🆕 |
| `cli_link_failed` | Multi-Entry | error_code | 🆕 |
| `storage_warning` | System | utilization_percent | 🆕 |
| `storage_full` | System | attempted_action | 🆕 |
| `config_migration` | System | from_version, to_version, success | 🆕 |
| `config_corruption_recovered` | System | recovery_method | 🆕 |
| `error` | System | error_code, stack_trace, context | ✅ |

### 9.2 Funnel Definitions

#### Activation Funnel

```
extension_installed
       ↓
walkthrough_opened (optional)
       ↓
auth_started
       ↓
auth_completed
       ↓
first_protected_save
       ↓
first_snapshot_created
       ↓
dashboard_viewed (optional)
```

#### Restore Funnel

```
restore_initiated
       ↓
restore_confirmed
       ↓
snapshot_restored
       ↓
restore_success / restore_failed
```

#### CLI Adoption Funnel

```
extension_activated (no CLI)
       ↓
cli_cta_shown
       ↓
cli_cta_clicked
       ↓
cli_detected
       ↓
cli_linked
```

---

## 10. Appendices

### 10.1 Glossary

| Term | Definition |
|------|------------|
| **AutoDecisionEngine** | Component that automatically determines protection levels and snapshot triggers |
| **BlobStore** | Content-addressable storage for snapshot file contents |
| **Cluster** | Group of related files that should be protected together |
| **DBSCAN** | Clustering algorithm used for session grouping |
| **MCP** | Model Context Protocol for AI assistant integration |
| **Pioneer Program** | Gamified early adopter rewards system |
| **PRE_ROLLBACK** | Automatic checkpoint created before restore operations |
| **Protection Level** | WATCH (silent), WARN (notify), BLOCK (confirm) |

### 10.2 File References

| Component | Path |
|-----------|------|
| Extension entry | `apps/vscode/src/extension.ts` |
| Save handler | `apps/vscode/src/handlers/SaveHandler.ts` |
| Snapshot manager | `apps/vscode/src/snapshot/SnapshotManager.ts` |
| Session coordinator | `apps/vscode/src/snapshot/SessionCoordinator.ts` |
| Pioneer tracker | `apps/vscode/src/pioneer/PointsTracker.ts` |
| Telemetry proxy | `apps/vscode/src/services/telemetry-proxy.ts` |
| Auth provider | `apps/vscode/src/auth/OAuthProvider.ts` |
| Credentials | `apps/vscode/src/auth/credentials.ts` |
| Offline queue | `apps/vscode/src/telemetry/OfflineEventQueue.ts` |
| DBSCAN clustering | `packages/core/src/clustering/dbscan.ts` |
| Event contracts | `packages/contracts/src/telemetry/events.ts` |
| MCP registry | `packages/mcp/src/registry.ts` |

### 10.3 Related Documents

- `snapback-comprehensive-architecture.md` — Platform architecture
- `snapback-implementation-spec.md` — Implementation details
- `event-cataloging.md` — Telemetry event catalog
- `database-schema-analysis.md` — Database schema
- `pioneer-api-spec.md` — Pioneer Program API

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | Dec 2025 | Claude | Initial unified specification |

---

*This specification serves as the single source of truth for SnapBack VS Code extension UX. All implementation should reference this document.*
