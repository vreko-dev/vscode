<!--
Consolidated from:
- BUGFIXES.md
- BUG-004-FIX-REPORT.md
- COMPREHENSIVE_BUG_FIX_REPORT.md
- CRITICAL_BUG_FIXES_IMPLEMENTED.md
- BUG_007_SUMMARY.md
- BUG_7_ANALYSIS_GUIDE.md
- BUG_FIXES_SUMMARY.md
- BUG-004-008-FIX-SUMMARY.md
- CRITICAL_BUG_FIXES_SUMMARY.md
- INVESTIGATION_REPORT_BUG_007.md
- MANUAL_TEST_BUG_3.md
Last updated: 2025-10-14
-->

# SnapBack Bug Fixes History

## Executive Summary

This document catalogs the critical bugs discovered and fixed during the Protection Levels TDD recovery effort in October 2025. All bugs have been resolved, tested, and documented as part of the v1.0.0 release preparation.

**Total Bugs Fixed**: 7
**Severity Breakdown**: 4 High, 3 Medium
**Testing Coverage**: 50+ regression and unit tests
**Release Impact**: Production-ready quality achieved

## Bug Summary Table

| ID  | Title                          | Severity  | Impact               | Status   | Fixed In | Test Coverage      |
| --- | ------------------------------ | --------- | -------------------- | -------- | -------- | ------------------ |
| 1   | Invalid Timeline Command       | 🔴 High   | Extension crash      | ✅ Fixed | a236c48f | Unit + Integration |
| 2   | Duplicate Protected Files View | 🔴 High   | UI confusion         | ✅ Fixed | a236c48f | Unit               |
| 3   | Dialog Branding Issues         | 🟡 Medium | UX inconsistency     | ✅ Fixed | 69f83731 | Manual             |
| 4   | Restore URI Construction       | 🔴 High   | Restore failure      | ✅ Fixed | 69f83731 | Unit               |
| 5   | Non-Dismissing Notification    | 🟡 Medium | UI annoyance         | ✅ Fixed | 8e8e03e2 | Unit               |
| 6   | Excessive Reload Notifications | 🟡 Medium | Notification spam    | ✅ Fixed | 8e8e03e2 | Integration        |
| 7   | Protection Level State Bug     | 🔴 High   | Data corruption risk | ✅ Fixed | 8e8e03e2 | 29 unit tests      |

## Detailed Bug Reports

### Bug #1: Invalid Timeline Command Reference

**Severity**: High
**Bug ID**: BUG-001
**Discovered**: October 7, 2025
**Fixed In**: Commit `a236c48f` (refactor: simplify and unify SnapBack views)
**Status**: ✅ Fixed

**Symptoms**:

-   Clicking checkpoint items in VS Code Timeline view caused error: `Command 'snapback.viewCheckpoint' not found`
-   Timeline integration broken, preventing users from viewing checkpoint details
-   Error appeared in VS Code Developer Console but not visible to users
-   Reduced discoverability of checkpoint history features

**Root Cause**:
The `CheckpointTimelineProvider` was referencing a non-existent command in its timeline item construction. The `snapback.viewCheckpoint` command was never registered in `package.json` or `extension.ts`.

**The Fix**:

1. Added command to package.json
2. Registered command handler in extension.ts
3. Verified timeline provider usage

**Impact**:

-   Full timeline integration working
-   Users can view checkpoint details with single click
-   Improved discoverability of checkpoint features

### Bug #2: Duplicate Protected Files View

**Severity**: High
**Bug ID**: BUG-002
**Discovered**: October 7, 2025
**Fixed In**: Commit `a236c48f` (refactor: simplify and unify SnapBack views)
**Status**: ✅ Fixed

**Symptoms**:

-   Two separate "Protected Files" views appeared in SnapBack sidebar
-   Inconsistent state between the two views
-   Updates to protection level only reflected in one view
-   User confusion about which view to use
-   Increased memory usage from duplicate providers

**Root Cause**:
During the refactoring from individual tree views to a unified `SnapBackTreeProvider`, the old `FileProtectionView` class was not properly removed. Both providers were registered in `extension.ts`.

**The Fix**:
Removed the old `FileProtectionView` class and ensured only one provider was registered.

**Impact**:

-   Consistent UI updates
-   Reduced memory usage
-   Clear user experience

### Bug #3: Dialog Branding Issues

**Severity**: Medium
**Bug ID**: BUG-003
**Discovered**: October 7, 2025
**Fixed In**: Commit `69f83731`
**Status**: ✅ Fixed

**Symptoms**:

-   Inconsistent branding in dialogs
-   UX inconsistency

**Root Cause**:
Dialogs were not properly branded with SnapBack visual identity.

**The Fix**:
Updated dialog branding to match SnapBack visual identity.

**Impact**:

-   Consistent user experience
-   Improved brand recognition

### Bug #4: Restore URI Construction

**Severity**: High
**Bug ID**: BUG-004
**Discovered**: October 7, 2025
**Fixed In**: Commit `69f83731`
**Status**: ✅ Fixed

**Symptoms**:

-   Restore functionality failing due to incorrect URI construction

**Root Cause**:
URI construction in restore functionality was incorrect.

**The Fix**:
Fixed URI construction in restore functionality.

**Impact**:

-   Reliable restore functionality
-   No data loss during restore operations

### Bug #5: Non-Dismissing Notification

**Severity**: Medium
**Bug ID**: BUG-005
**Discovered**: October 8, 2025
**Fixed In**: Commit `8e8e03e2`
**Status**: ✅ Fixed

**Symptoms**:

-   Notifications not dismissing automatically
-   UI annoyance

**Root Cause**:
Notification dismissal timing was not properly configured.

**The Fix**:
Configured proper notification dismissal timing.

**Impact**:

-   Improved user experience
-   Less UI clutter

### Bug #6: Excessive Reload Notifications

**Severity**: Medium
**Bug ID**: BUG-006
**Discovered**: October 8, 2025
**Fixed In**: Commit `8e8e03e2`
**Status**: ✅ Fixed

**Symptoms**:

-   Too many reload notifications
-   Notification spam

**Root Cause**:
Reload notification logic was too aggressive.

**The Fix**:
Optimized reload notification logic.

**Impact**:

-   Reduced notification spam
-   Better user experience

### Bug #7: Protection Level State Bug

**Severity**: High
**Bug ID**: BUG-007
**Discovered**: October 8, 2025
**Fixed In**: Commit `8e8e03e2`
**Status**: ✅ Fixed

**Symptoms**:

-   Data corruption risk due to protection level state issues
-   Inconsistent protection level behavior

**Root Cause**:
Protection level state management had race conditions.

**The Fix**:
Implemented proper state management for protection levels.

**Impact**:

-   Eliminated data corruption risk
-   Consistent protection level behavior
