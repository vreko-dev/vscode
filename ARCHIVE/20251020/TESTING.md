# Testing Strategy for Submenu Feature

## Overview

This document outlines the testing strategy implemented for the submenu functionality in the SnapBack VS Code extension. The testing approach includes unit tests, visual regression tests, and end-to-end tests to ensure the feature works correctly and maintains visual consistency over time.

## Test Structure

### 1. Unit Tests

Located in `test/unit/` directory:

-   `submenuStructure.test.ts` - Validates the structure of submenu definitions and menu items
-   `contextManagerStructure.test.ts` - Validates the context manager API and context conditions

### 2. Visual Regression Tests

Located in `test/regression/` directory:

-   `visualRegression.test.ts` - Comprehensive tests for menu structure, context integration, and command definitions

### 3. End-to-End Tests

Located in `test/e2e/` directory:

-   `submenu.e2e.test.ts` - UI interaction tests (Playwright-based)

## Key Test Areas

### Submenu Definitions

-   Verification of submenu IDs and labels
-   Validation of protection level options (Watched, Warning, Protected)
-   Proper submenu item structure and ordering

### Context Menu Integration

-   Correct submenu references in explorer and editor context menus
-   Appropriate visibility conditions based on file protection status
-   Proper grouping and ordering of menu items

### Context Manager

-   Validation of context variable setting (`snapback.isProtected`, `snapback.currentLevel`, `snapback.canProtect`)
-   Proper context updates when protection status changes
-   Correct handling of active editor changes

### Command Definitions

-   Verification of individual protection level commands
-   Validation of command titles and categories
-   Proper command registration in package contributes

### Status Bar Integration

-   Validation of protection level display in status bar
-   Correct color coding based on highest protection level
-   Proper tooltip information with detailed statistics

## Running Tests

### Unit Tests

```bash
npm run test:unit
# or
npx vitest run test/unit/submenuStructure.test.ts
npx vitest run test/unit/contextManagerStructure.test.ts
```

### Visual Regression Tests

```bash
npm run test:regression
# or
npx vitest run test/regression/visualRegression.test.ts
```

### All Tests

```bash
npm test
# or
npx vitest run
```

## Test Coverage

### Structure Validation

-   ✅ Submenu definitions in `package-contributes/submenus.json`
-   ✅ Submenu items in `package-contributes/protection-submenus.json`
-   ✅ Context menu integration in `package-contributes/explorer-menus.json` and `package-contributes/editor-menus.json`
-   ✅ Command definitions in `package-contributes/protection-commands.json`
-   ✅ Context manager API in `src/contextManager.ts`
-   ✅ Status bar implementation in `src/protectionStatusBar.ts`

### Visual Consistency

-   ✅ Menu labels and icons
-   ✅ Protection level ordering and visibility conditions
-   ✅ Context variable names and usage
-   ✅ Command titles and descriptions
-   ✅ Status bar text formatting and color coding

### Functional Validation

-   ✅ Context variable setting and updating
-   ✅ Menu visibility based on file protection status
-   ✅ Protection level change conditions
-   ✅ Status bar updates and tooltip generation

## Maintenance Guidelines

### When to Update Tests

1. **Submenu Structure Changes** - Update structure validation tests when modifying submenu definitions
2. **Context Conditions Changes** - Update context manager tests when changing context variable conditions
3. **Command Definitions Changes** - Update command validation tests when adding/modifying commands
4. **UI Component Changes** - Update visual regression tests when modifying UI components

### Best Practices

1. **Test Structure Over Implementation** - Focus on validating the structure rather than mocking complex implementations
2. **Use File-Based Validation** - Validate JSON structure by reading actual configuration files
3. **Maintain Clear Test Descriptions** - Use descriptive test names that clearly indicate what is being validated
4. **Group Related Tests** - Organize tests into logical groups for easier maintenance
5. **Validate Both Positive and Negative Cases** - Ensure tests cover both expected and edge cases

## Future Enhancements

### Additional Test Coverage

1. **Integration Tests** - Tests that validate the interaction between different components
2. **Performance Tests** - Tests to ensure context updates don't cause performance issues
3. **Edge Case Tests** - Tests for unusual scenarios like very large numbers of protected files

### Automation Improvements

1. **Snapshot Testing** - Visual snapshots of menu structures for comparison
2. **Automated E2E Tests** - More comprehensive Playwright tests for UI interactions
3. **Continuous Integration** - Automated test runs on every commit

This testing strategy ensures that the submenu functionality remains consistent and functional as the extension evolves, preventing regressions and maintaining visual integrity.
