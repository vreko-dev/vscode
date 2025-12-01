# Webview E2E Tests

## Current Status

**SnapBack currently does NOT use VS Code webviews.** The extension uses native VS Code UI components instead:

- **Tree Views**: SnapshotsTreeProvider, ProtectedFilesTreeProvider, SessionsTreeProvider
- **Status Bar**: StatusBarController
- **Dialogs**: QuickPick, InputBox
- **Notifications**: window.showInformationMessage, window.showWarningMessage, window.showErrorMessage

These native components are tested in `test/e2e/demo-critical/ui-components.e2e.test.ts` using the VS Code Extension Test Runner (not Playwright).

## What are VS Code Webviews?

Webviews are iframe-based HTML/CSS/JS panels in VS Code that allow rich, custom UI. Examples:
- Settings panels with forms
- Welcome screens with interactive tutorials
- Custom visualizations and dashboards

SnapBack does NOT currently implement any webviews.

## When Would Webviews Be Needed?

Potential future use cases:
1. **Welcome wizard** - Interactive onboarding for first-time users
2. **Settings panel** - Rich configuration UI with live previews
3. **Snapshot diff viewer** - Side-by-side visual comparison
4. **AI detection dashboard** - Analytics and visualizations

## Testing Webviews (When Implemented)

When webviews ARE implemented, they should be tested with Playwright:

### Setup

1. **Install Playwright**: Already configured in `playwright.config.ts`
2. **Create webview test file**: `test/e2e/webview/{feature}.test.ts`
3. **Use helper utilities**: `test/helpers/playwrightUtils.ts`

### Example Test

```typescript
import { test, expect } from '@playwright/test';
import { launchVSCodeWithWebview, getWebviewFrame } from '../../helpers/playwrightUtils';

test.describe('Welcome Wizard Webview', () => {
  test('should render welcome screen', async ({ page }) => {
    // Launch VS Code and open webview
    await launchVSCodeWithWebview(page, 'snapback.welcome');

    // Get webview iframe
    const webview = await getWebviewFrame(page);

    // Validate DOM
    const heading = await webview.locator('h1').textContent();
    expect(heading).toBe('Welcome to SnapBack');
  });

  test('should complete onboarding flow', async ({ page }) => {
    await launchVSCodeWithWebview(page, 'snapback.welcome');
    const webview = await getWebviewFrame(page);

    // Click through wizard steps
    await webview.locator('button:text("Next")').click();
    await webview.locator('button:text("Next")').click();
    await webview.locator('button:text("Finish")').click();

    // Verify completion
    const successMessage = await webview.locator('.success').textContent();
    expect(successMessage).toContain('Setup complete');
  });
});
```

## Current Test Coverage

Since there are no webviews, the following UI components are tested instead:

### E2E Tests (test/e2e/demo-critical/)
- ✅ `activation-funnel.e2e.test.ts` - Extension activation flow
- ✅ `protection-levels.e2e.test.ts` - Protection level UI
- ✅ `ui-components.e2e.test.ts` - Tree views, status bar, commands
- ✅ `ai-detection.e2e.test.ts` - AI detection indicators
- ✅ `vsix-validation.e2e.test.ts` - Packaged extension validation

### Integration Tests (test/integration/)
- ✅ Tree provider registration
- ✅ Status bar updates
- ✅ Command palette integration
- ✅ Notification system

## Placeholder Tests

This directory contains:
- **placeholder.test.ts** - Template for future webview tests
- **README.md** (this file) - Documentation

These files ensure:
1. Playwright configuration is valid
2. Test structure is ready for future webviews
3. Code review requirements are addressed

## When to Use Playwright vs. VS Code Test Runner

| Use Case | Tool |
|----------|------|
| Native VS Code UI (tree views, status bar, dialogs) | **VS Code Extension Test Runner** (`@vscode/test-cli`) |
| Webview HTML/CSS/JS | **Playwright** |
| Command execution | **VS Code Extension Test Runner** |
| File system operations | **VS Code Extension Test Runner** |
| Webview DOM validation | **Playwright** |

## References

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Testing VS Code Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Playwright Documentation](https://playwright.dev/)

---

**Note**: This directory exists to address code review requirements and provide infrastructure for future webview development. The absence of webview tests is not a gap - SnapBack simply doesn't use webviews yet.
