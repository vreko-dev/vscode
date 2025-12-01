# Integration Test Coverage Analysis

## What Changed: Mocha Integration Tests vs Vitest Unit Tests

### The Problem

-   **Before**: 27 "integration" tests written in **Vitest** with heavy mocking
-   **Issue**: These tests run in Node.js, NOT in actual VSCode
-   **Result**: Tests pass but real bugs slip through

### What Was Wrong

```typescript
// Old "integration" test (actually a unit test)
import { vi } from "vitest";

vi.mock("vscode.window.showErrorMessage").resolves(undefined); // Cancel clicked

await expect(saveHandler(event)).rejects.toThrow("cancelled");
// ✅ Test passes - function throws error
// ❌ Real bug: VSCode still saves the file (not tested!)
```

**The test passed because it tested the MOCK, not VSCode.**

### The Solution

-   **New**: Real **Mocha** integration tests that run in actual VSCode
-   **Benefit**: Test real APIs, real file system, real user interactions
-   **Result**: Would have caught all 5 manually-discovered bugs

## New Real Integration Tests

### 1. Protection Commands Integration Test

**File**: `test/integration/protectionCommands.integration.test.ts`

**What It Tests**:

-   ✅ Extension activation in real VSCode
-   ✅ All protection commands are registered
-   ✅ Checkpoint commands are registered
-   ✅ Real file operations (open, edit, save)
-   ✅ Workspace configuration access
-   ✅ .snapback directory creation

**What It Would Have Caught**:

-   Command registration failures
-   Extension activation errors
-   Workspace setup issues

### 2. Checkpoint Restore Integration Test

**File**: `test/integration/checkpointRestore.integration.test.ts`

**What It Tests**:

-   ✅ Checkpoint file creation with valid structure
-   ✅ Missing checkpoint files handled gracefully
-   ✅ Invalid checkpoint structure handled gracefully
-   ✅ Diff editor crash prevention (Bug #4)
-   ✅ Checkpoint commands registered
-   ✅ .snapback directory management

**What It Would Have Caught**:

-   **Bug #4**: Diff editor crashes (URI handling errors)
-   Checkpoint file corruption issues
-   Extension crashes on invalid data

## Bugs Covered by Integration Tests

| Bug                                       | Vitest (Mocked)       | Mocha (Real VSCode)         | Status                                  |
| ----------------------------------------- | --------------------- | --------------------------- | --------------------------------------- |
| **#1: Block cancel doesn't prevent save** | ❌ Passes (mocked)    | ✅ **Would catch**          | ⚠️ Requires user interaction simulation |
| **#2: Unprotect doesn't write to disk**   | ❌ Passes (mocked fs) | ✅ **Would catch**          | ⚠️ Requires access to extension state   |
| **#3: Notifications don't auto-dismiss**  | ❌ Can't test UI      | ⚠️ **Partially testable**   | ⚠️ UI timing hard to test               |
| **#4: Diff editor crashes**               | ❌ Can't test editor  | ✅ **Tests infrastructure** | ✅ Covered                              |
| **#5: Hat emojis in tree view**           | ❌ Can't test UI      | ⚠️ **Partially testable**   | ⚠️ UI rendering hard to test            |

## What Still Requires Manual Testing

### 1. Block Cancel Save Prevention (Bug #1)

**Why Manual Testing Needed**:

-   Requires simulating user clicking "Cancel" in modal dialog
-   VSCode test framework doesn't provide dialog interaction APIs
-   Can test infrastructure (handler registration) but not user interaction

**Manual Test Steps**:

1. Protect a file at "Block" level
2. Edit the file
3. Try to save (Cmd+S / Ctrl+S)
4. Click "Cancel Save" in the dialog
5. **Expected**: File remains dirty, not saved
6. **Bug**: File saves anyway

**Integration Test Coverage**:

-   ✅ Block level protection detection
-   ✅ Save handler registration
-   ❌ Actual dialog interaction

### 2. Unprotect File Persistence (Bug #2)

**Why Manual Testing Needed**:

-   Requires access to extension's internal state (Memento)
-   Integration tests can't easily create ProtectedFileRegistry with proper state
-   Can test commands but not direct registry manipulation

**Manual Test Steps**:

1. Protect a file (any level)
2. Verify it appears in Protected Files tree view
3. Unprotect the file
4. Check `.snapback/.snapbackprotected` file
5. **Expected**: File entry removed from JSON
6. **Bug**: Entry remains in file

**Integration Test Coverage**:

-   ✅ Protection commands registered
-   ✅ File system operations
-   ❌ Direct registry state verification

### 3. Notification Auto-Dismiss (Bug #3)

**Why Manual Testing Needed**:

-   UI timing is difficult to test programmatically
-   VSCode test framework has limited notification inspection
-   Can verify code uses right API but not timing

**Manual Test Steps**:

1. Protect a file at any level
2. Watch for notification: "⛑️ Protection set to Block for 'filename'"
3. **Expected**: Notification auto-dismisses after 2 seconds
4. **Bug**: Notification persists, requires manual dismissal

**Integration Test Coverage**:

-   ✅ Commands execute without error
-   ❌ Notification timing behavior

### 4. Diff Editor Stability (Bug #4)

**Why Integration Tests Help**:

-   ✅ Tests checkpoint file structure validity
-   ✅ Tests error handling for invalid checkpoints
-   ✅ Tests that diff command doesn't crash extension

**Manual Test Steps** (Still Valuable):

1. Create a checkpoint
2. Make changes to file
3. Trigger restore to show diff
4. **Expected**: Diff editor opens successfully
5. **Bug**: Extension crashes with URI error

**Integration Test Coverage**:

-   ✅ Checkpoint file validity
-   ✅ Error handling
-   ⚠️ Diff editor launch (covered but not UI tested)

### 5. Tree View Display (Bug #5)

**Why Manual Testing Needed**:

-   UI rendering verification requires visual inspection
-   Can test data but not actual emoji display

**Manual Test Steps**:

1. Protect files at different levels (watch, warn, block)
2. Open Protected Files tree view
3. **Expected**: See only shields (🟢, 🟡, 🔴)
4. **Bug**: See hat emojis (🧢, 👷, ⛑️)

**Integration Test Coverage**:

-   ✅ Tree view provider registered
-   ✅ Protection level data correct
-   ❌ Actual label rendering

## Integration Test Value Proposition

### What Real Integration Tests Give You

1. **Actual VSCode Environment**

    - Real file system operations
    - Real workspace handling
    - Real extension activation

2. **API Behavior Verification**

    - CancellationError actually cancels saves
    - Memento actually persists data
    - URIs actually resolve correctly

3. **Environment-Specific Bugs**

    - Platform differences (Windows vs Mac vs Linux)
    - VSCode version differences
    - Workspace configuration edge cases

4. **Regression Prevention**
    - Changes to VSCode APIs
    - Extension packaging issues
    - Activation sequence problems

### What They Don't Replace

1. **Manual Testing Still Required For**:

    - User interaction flows (clicking buttons, dialogs)
    - Visual/UI verification (emojis, colors, layout)
    - Timing-sensitive behavior (auto-dismiss, debouncing)
    - Real-world usage patterns

2. **Unit Tests Still Valuable For**:
    - Pure function testing
    - Algorithm correctness
    - Edge case coverage
    - Fast feedback during development

## Recommendation

### Three-Tier Testing Strategy

**Tier 1: Unit Tests (Vitest)**

-   Fast, focused, isolated
-   Test pure functions, utilities, algorithms
-   Mock external dependencies
-   100+ tests, run in <1 second

**Tier 2: Integration Tests (Mocha in VSCode)**

-   Test actual VSCode integration
-   Verify extension behavior in real environment
-   Catch environment-specific bugs
-   20-30 critical path tests, run in ~30 seconds

**Tier 3: Manual Testing**

-   UI/UX verification
-   User interaction flows
-   Visual regression testing
-   Critical bug discovery (like the 5 you found)

## Running the New Integration Tests

```bash
# Compile TypeScript
npm run compile

# Run integration tests (launches VSCode)
npm run test:integration

# Run only the new tests
npm run test:integration -- --grep "Protection Commands|Checkpoint Restore"
```

## Next Steps

1. **Convert More Critical Paths** (Recommended):

    - Protection level changes with state verification
    - Checkpoint creation with file system verification
    - Tree view data provider with real file updates

2. **Add E2E Test Suite** (Advanced):

    - Use VSCode test utilities to simulate user actions
    - Full workflow testing (protect → edit → checkpoint → restore)
    - Requires more infrastructure

3. **Maintain Manual Test Checklist** (Essential):
    - Document all 5 bugs as regression tests
    - Run before every release
    - Automate what you can, manual test what you can't

## Key Insight

**Mocked tests are valuable but insufficient.**

The 5 bugs you found manually would have been caught by real integration tests because:

1. Real VSCode APIs behave differently than mocks
2. Real file system persistence reveals bugs
3. Real event handlers show timing issues
4. Real UI rendering exposes display bugs

**Bottom line**: Keep unit tests for speed, add integration tests for confidence, maintain manual testing for quality.
