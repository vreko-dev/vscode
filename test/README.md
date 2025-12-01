# SnapBack VS Code Extension - Test Suite Documentation

**Comprehensive testing infrastructure for YC demo readiness and production deployment.**

---

## Table of Contents

1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Running Tests](#running-tests)
4. [Demo-Critical Tests](#demo-critical-tests)
5. [Test Helpers](#test-helpers)
6. [Performance Budgets](#performance-budgets)
7. [CI/CD Integration](#cicd-integration)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The SnapBack test suite provides **multi-tier testing** to ensure:

- ✅ **98%+ demo confidence** (all demo-critical paths validated)
- ✅ **0% flakiness** (triple-run stability gate)
- ✅ **Performance budgets** enforced as assertions
- ✅ **Production readiness** (VSIX packaging validation)

### Test Tiers

| Tier | Type | Framework | Count | Purpose |
|------|------|-----------|-------|---------|
| **1** | Unit | Vitest | 300+ | Component logic, helpers |
| **2** | Integration | Vitest | 50+ | Multi-component workflows |
| **3** | E2E | @vscode/test-cli | 30+ | Real VS Code instance |
| **4** | Webview | Playwright | 2 (placeholder) | Future webview DOM validation |
| **5** | VSIX | Bash scripts | 1 | Packaged extension validation |

---

## Test Structure

```
test/
├── unit/                       # Unit tests (Vitest)
│   ├── demo-critical/          # Demo-critical unit tests
│   │   ├── protection-levels.test.ts    # Protection level logic (15 tests)
│   │   ├── snapshot-creation.test.ts    # Snapshot creation (12 tests)
│   │   ├── ai-detection.test.ts         # AI burst detection (8 tests)
│   │   ├── contracts.test.ts            # Zod schema validation (6 tests)
│   │   └── file-validation.test.ts      # File security checks (5 tests)
│   ├── snapshot/               # Snapshot-related units
│   ├── policy/                 # Policy engine units
│   ├── security/               # Security units
│   └── ...                     # Other unit tests
│
├── integration/                # Integration tests (Vitest)
│   ├── demo-critical/          # Demo-critical integration tests
│   │   ├── activation.integration.test.ts     # Activation phases (10 tests)
│   │   ├── settings.integration.test.ts       # Settings sync (14 tests)
│   │   └── storage.integration.test.ts        # Storage persistence (8 tests)
│   └── ...                     # Other integration tests
│
├── e2e/                        # E2E tests (@vscode/test-cli)
│   ├── demo-critical/          # Demo-critical E2E tests
│   │   ├── activation-funnel.e2e.test.ts     # Activation flow (12 tests)
│   │   ├── protection-levels.e2e.test.ts     # Protection UI (10 tests)
│   │   ├── ai-detection.e2e.test.ts          # AI detection UI (6 tests)
│   │   ├── ui-components.e2e.test.ts         # Tree views, status bar (8 tests)
│   │   └── vsix-validation.e2e.test.ts       # VSIX validation (5 tests)
│   └── webview/                # Webview tests (Playwright)
│       ├── README.md           # Webview testing docs
│       └── placeholder.test.ts # Future webview tests
│
├── helpers/                    # Test utilities
│   ├── time.ts                 # Fake timers, seeding
│   ├── network-mock.ts         # Network adapter mocks
│   ├── vscode-mocks.ts         # VS Code API mocks
│   ├── playwrightUtils.ts      # Playwright helpers (future)
│   └── assertionHelpers.ts     # Custom assertions
│
└── README.md                   # This file

scripts/
├── test-vsix.sh                # VSIX packaging validation
├── pre-demo.sh                 # Triple-run stability gate
├── demo-readiness.sh           # Pre-demo checklist
└── launch-demo-vscode.sh       # Frozen demo environment
```

---

## Running Tests

### Quick Start

```bash
# Run all tests (unit + integration + E2E)
pnpm test

# Run demo-critical tests only (fastest demo validation)
pnpm test:unit test/unit/demo-critical
pnpm test:integration test/integration/demo-critical
pnpm test:e2e:demo-critical
```

### By Test Tier

```bash
# Tier 1: Unit tests
pnpm test:unit                      # All unit tests
pnpm test:unit test/unit/demo-critical  # Demo-critical only

# Tier 2: Integration tests
pnpm test:integration               # All integration tests
pnpm test:integration test/integration/demo-critical  # Demo-critical only

# Tier 3: E2E tests
pnpm test:e2e                       # All E2E tests
pnpm test:e2e:demo-critical         # Demo-critical E2E only

# Tier 4: Webview tests (Playwright)
pnpm test:webview                   # Future webview tests

# Tier 5: VSIX validation
pnpm test:vsix                      # Full VSIX build → install → test flow
```

### Pre-Demo Validation

```bash
# Triple-run stability gate (runs all tests 3x, validates 0% flakiness)
pnpm pre-demo

# Quick demo readiness check
pnpm demo-readiness

# Launch frozen demo environment
pnpm launch-demo
```

### Watch Mode (Development)

```bash
# Watch unit tests
pnpm test:unit:watch

# Watch specific test file
pnpm exec vitest test/unit/demo-critical/snapshot-creation.test.ts
```

---

## Demo-Critical Tests

All tests tagged with `[DEMO-CRITICAL]` or `[DEMO]` are essential for YC demo success.

### Coverage Matrix

| Demo Feature | Unit Tests | Integration | E2E | Status |
|--------------|------------|-------------|-----|--------|
| **Protection Levels** | 15 | - | 10 | ✅ |
| **Snapshot Creation** | 12 | 8 | - | ✅ |
| **AI Detection** | 8 | - | 6 | ✅ |
| **Activation Funnel** | - | 10 | 12 | ✅ |
| **Settings Sync** | - | 14 | - | ✅ |
| **Tree Views** | - | - | 8 | ✅ |
| **VSIX Packaging** | - | - | 5 | ✅ |

### Filtering Demo-Critical Tests

```bash
# Run only demo-critical tests
pnpm exec vitest --grep="\[DEMO"

# Exclude demo-critical tests
pnpm exec vitest --grep-invert="\[DEMO"
```

---

## Test Helpers

### Fake Timers (`test/helpers/time.ts`)

For deterministic time-based testing (burst detection, session finalization).

```typescript
import { useDeterministicTime } from '../helpers/time';

describe('Session Coordinator', () => {
  const { advanceTime } = useDeterministicTime();

  it('finalizes session after 105s idle', async () => {
    // Trigger session start
    sessionCoordinator.addCandidate(...);

    // Advance time
    advanceTime(105000);

    // Session should be finalized
    expect(sessionCoordinator.getActiveSessions()).toHaveLength(1);
  });
});
```

### Network Mocks (`test/helpers/network-mock.ts`)

For offline/slow network testing.

```typescript
import { MockNetworkAdapter, NetworkCondition } from '../helpers/network-mock';

describe('API Client', () => {
  it('handles offline gracefully', async () => {
    const adapter = new MockNetworkAdapter();
    adapter.mockOffline();

    const client = new ApiClient(adapter);
    await expect(client.healthCheck()).resolves.toBe(false);
  });
});
```

### VS Code Mocks (`test/helpers/vscode-mocks.ts`)

For unit tests that need VS Code API mocks.

```typescript
import { createMockExtensionContext } from '../helpers/vscode-mocks';

describe('Extension Activation', () => {
  it('activates successfully', async () => {
    const context = createMockExtensionContext();
    await activate(context);
    expect(context.subscriptions.length).toBeGreaterThan(0);
  });
});
```

---

## Performance Budgets

**All performance budgets are enforced as assertions, not comments.**

| Operation | Budget | Enforced In | Tier |
|-----------|--------|-------------|------|
| Snapshot creation | <200ms | unit/demo-critical/snapshot-creation.test.ts | Unit |
| WATCH save overhead | <100ms | unit/demo-critical/protection-levels.test.ts | Unit |
| AI detection | <10ms | unit/demo-critical/ai-detection.test.ts | Unit |
| Session finalization | Avg <50ms, P95 <100ms | integration/demo-critical/storage.integration.test.ts | Integration |
| Extension activation | <2000ms | e2e/demo-critical/activation-funnel.e2e.test.ts | E2E |

### Example: Performance Budget Assertion

```typescript
test('[DEMO] creates snapshot in <50ms', async () => {
  const startTime = performance.now();
  await snapshotManager.createSnapshot([...]);
  const duration = performance.now() - startTime;

  // Performance budget enforced as assertion
  expect(duration).toBeLessThan(50);
});
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Build extension
        run: pnpm build
      - name: Run unit tests
        run: pnpm test:unit
      - name: Run integration tests
        run: pnpm test:integration
      - name: Run E2E tests
        run: pnpm test:e2e:demo-critical
      - name: VSIX validation
        run: pnpm test:vsix
      - name: Pre-demo stability gate
        run: pnpm pre-demo
```

### Pre-Commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
pnpm test:unit test/unit/demo-critical
pnpm test:integration test/integration/demo-critical
```

---

## Troubleshooting

### Tests are flaky

```bash
# Run triple-run stability gate to identify flaky tests
pnpm pre-demo

# If flakiness detected, check:
# 1. Are you using fake timers for time-based tests?
# 2. Are you awaiting all async operations?
# 3. Are you cleaning up resources in afterEach?
```

### E2E tests timeout

```bash
# Increase timeout in test file:
test('...', async function() {
  this.timeout(30000); // 30 seconds
});

# Or globally in .vscode-test.mjs:
mocha: {
  timeout: 30000
}
```

### VSIX packaging fails

```bash
# Check build output
pnpm run build

# Check VSIX size (must be <10MB)
ls -lh *.vsix

# Validate VSIX contents
pnpm test:vsix
```

### Performance budget failures

```bash
# Check test logs for actual durations
pnpm test:unit test/unit/demo-critical/snapshot-creation.test.ts

# Profile code to find bottlenecks
# Add console.time/console.timeEnd to suspected slow code
```

### Network adapter errors

```bash
# Ensure NetworkAdapter is injected in tests
const adapter = new MockNetworkAdapter();
const client = new ApiClient(adapter);

# Production code should use FetchNetworkAdapter by default
const client = new ApiClient(); // Uses FetchNetworkAdapter
```

---

## Best Practices

### 1. Tag Demo-Critical Tests

```typescript
test('[DEMO] protection level changes apply immediately', async () => {
  // Test implementation
});
```

### 2. Use Fake Timers for Time-Based Tests

```typescript
const { advanceTime } = useDeterministicTime();
```

### 3. Enforce Performance Budgets

```typescript
expect(duration).toBeLessThan(budgetMs);
```

### 4. Clean Up Resources

```typescript
afterEach(() => {
  // Close connections, reset state, delete temp files
});
```

### 5. Use NetworkAdapter for Network Operations

```typescript
// ❌ DON'T: Direct fetch() calls
const response = await fetch('https://api.snapback.dev/...');

// ✅ DO: Use NetworkAdapter
const adapter = new FetchNetworkAdapter();
const response = await adapter.get('https://api.snapback.dev/...');
```

---

## Test Configuration Files

| File | Purpose |
|------|---------|
| `.vscode-test.mjs` | E2E test config (VS Code version: **1.96.0** - PINNED) |
| `playwright.config.ts` | Webview test config (retries: **0**, workers: **1**) |
| `vitest.config.ts` | Unit/integration test config |
| `scripts/pre-demo.sh` | Triple-run stability gate |
| `scripts/demo-readiness.sh` | Quick demo readiness check |

---

## Contributing

### Adding New Tests

1. **Choose correct tier**:
   - Logic-only? → Unit test
   - Multi-component? → Integration test
   - Requires VS Code? → E2E test

2. **Tag if demo-critical**:
   - Add `[DEMO]` or `[DEMO-CRITICAL]` to test name

3. **Enforce performance budgets**:
   - Use `expect(duration).toBeLessThan(budget)`

4. **Use test helpers**:
   - Fake timers for time-based tests
   - Network mocks for API tests
   - VS Code mocks for unit tests

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [VS Code Extension Testing Guide](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Playwright Documentation](https://playwright.dev/)
- [Demo Verification Checklist](../DEMO_VERIFICATION_CHECKLIST.md)
- [Demo Recording Guide](../DEMO_RECORDING_GUIDE.md)

---

**Ready for demo? Run: `pnpm pre-demo`**
