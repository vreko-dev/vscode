<!--
Consolidated from:
- INTEGRATION_TEST_COVERAGE.md
- MANUAL_TEST_SUITE.md
Last updated: 2025-10-14
-->

# SnapBack Testing Guide

This document provides guidance on testing the SnapBack VS Code extension, including unit tests, integration tests, and manual testing procedures.

## Testing Overview

SnapBack uses a combination of testing approaches to ensure quality and reliability:

1. **Unit Tests** - Test individual functions and components in isolation
2. **Integration Tests** - Test components working together in a real VS Code environment
3. **Manual Testing** - Test user interactions and UI behavior that cannot be automated

## Unit Testing

### Framework

SnapBack uses Vitest for unit testing. Unit tests focus on testing individual functions and components in isolation with heavy mocking.

### Running Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run unit tests with coverage
npm run test:coverage

# Run specific test file
npm run test:unit -- test/unit/specific.test.ts
```

### Unit Test Structure

Unit tests should:

-   Test pure functions and algorithms
-   Mock external dependencies (VS Code APIs, file system)
-   Cover edge cases and error conditions
-   Run quickly (typically under 100ms per test)

### Example Unit Test

```typescript
import { describe, it, expect, vi } from "vitest";
import { calculateCheckpointName } from "../../src/utils/checkpointUtils";

describe("calculateCheckpointName", () => {
	it("should generate a name based on git context", () => {
		// Mock git context
		vi.mock("../../src/git/gitService", () => ({
			getGitContext: () => ({
				branch: "main",
				commit: "abc123",
				status: "modified",
			}),
		}));

		const result = calculateCheckpointName("test.txt");
		expect(result).toContain("main");
		expect(result).toContain("abc123");
	});
});
```

## Integration Testing

### Framework

SnapBack uses Mocha for integration testing. Integration tests run in an actual VS Code environment to test real APIs and user interactions.

### Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run integration tests with specific VS Code version
npm run test:integration -- --vscode-version 1.99.0

# Run specific integration test
npm run test:integration -- test/integration/specific.integration.test.ts
```

### Integration Test Structure

Integration tests should:

-   Test real VS Code APIs and file system operations
-   Test component interactions
-   Verify extension activation and command registration
-   Test error handling in real environments

### Example Integration Test

```typescript
import * as vscode from "vscode";
import * as assert from "assert";
import { before, after, describe, it } from "mocha";

describe("Protection Commands Integration", () => {
	before(async () => {
		// Ensure extension is activated
		const extension = vscode.extensions.getExtension(
			"marcelle-labs.snapback"
		);
		if (!extension?.isActive) {
			await extension?.activate();
		}
	});

	it("should register all protection commands", async () => {
		const commands = await vscode.commands.getCommands(true);

		const protectionCommands = [
			"snapback.protectFile",
			"snapback.changeProtectionLevel",
			"snapback.setWatchLevel",
			"snapback.setWarnLevel",
			"snapback.setBlockLevel",
		];

		for (const command of protectionCommands) {
			assert.ok(
				commands.includes(command),
				`Command ${command} should be registered`
			);
		}
	});

	it("should create .snapback directory on activation", async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			assert.fail("No workspace folders found");
			return;
		}

		const snapbackDir = vscode.Uri.joinPath(
			workspaceFolders[0].uri,
			".snapback"
		);
		try {
			await vscode.workspace.fs.stat(snapbackDir);
			assert.ok(true, ".snapback directory should exist");
		} catch (error) {
			assert.fail(".snapback directory should be created on activation");
		}
	});
});
```

## Manual Testing

Some aspects of SnapBack cannot be fully tested automatically and require manual verification.

### Manual Test Cases

#### 1. Block Cancel Save Prevention

**Test Steps**:

1. Protect a file at "Block" level
2. Edit the file
3. Try to save (Cmd+S / Ctrl+S)
4. Click "Cancel Save" in the dialog
5. **Expected**: File remains dirty, not saved

#### 2. Unprotect File Persistence

**Test Steps**:

1. Protect a file (any level)
2. Verify it appears in Protected Files tree view
3. Unprotect the file
4. Check `.snapback/.snapbackprotected` file
5. **Expected**: File entry removed from JSON

#### 3. Notification Auto-Dismiss

**Test Steps**:

1. Protect a file at any level
2. Watch for notification: "⛑️ Protection set to Block for 'filename'"
3. **Expected**: Notification auto-dismisses after 2 seconds

#### 4. Diff Editor Stability

**Test Steps**:

1. Create a checkpoint
2. Make changes to file
3. Trigger restore to show diff
4. **Expected**: Diff editor opens successfully

#### 5. Tree View Display

**Test Steps**:

1. Protect files at different levels (watch, warn, block)
2. Open Protected Files tree view
3. **Expected**: See only shields (🟢, 🟡, 🔴)

## Test Coverage Strategy

### What Integration Tests Cover

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

### What Still Requires Manual Testing

1. **User Interaction Flows**

    - Clicking buttons and dialogs
    - Modal dialog interactions
    - Keyboard shortcut testing

2. **Visual/UI Verification**

    - Emoji display in tree views
    - Color coding and styling
    - Layout and positioning

3. **Timing-Sensitive Behavior**
    - Auto-dismiss notifications
    - Debouncing behavior
    - Animation timing

## Continuous Integration

SnapBack uses GitHub Actions for continuous integration testing:

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
    test:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v3
            - uses: actions/setup-node@v3
              with:
                  node-version: 20
            - run: npm install
            - run: npm run test:unit
            - run: npm run test:integration
```

## Best Practices

### Writing Effective Tests

1. **Keep tests focused**: Each test should verify one specific behavior
2. **Use descriptive names**: Test names should clearly describe what is being tested
3. **Test edge cases**: Include tests for error conditions and boundary values
4. **Mock appropriately**: Mock external dependencies but not the system under test
5. **Run tests in isolation**: Tests should not depend on each other's state

### Test Maintenance

1. **Update tests with code changes**: When modifying functionality, update corresponding tests
2. **Remove obsolete tests**: Delete tests for removed features
3. **Refactor test code**: Keep test code clean and maintainable
4. **Monitor test performance**: Ensure tests run quickly and reliably

### Debugging Test Failures

1. **Check the output**: Look at test output and error messages
2. **Run tests locally**: Reproduce failures in your local environment
3. **Use debugging tools**: Set breakpoints and step through test code
4. **Check for environmental differences**: Compare test environments
