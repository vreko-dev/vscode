# CI/CD Infrastructure Documentation

This document describes the complete CI/CD infrastructure for the SnapBack VS Code extension.

## Overview

The SnapBack extension uses a comprehensive CI/CD pipeline to ensure code quality, prevent regressions, and maintain performance standards.

### Key Components

1. **GitHub Actions Workflows** - Automated testing and quality gates
2. **Local Git Hooks** - Pre-commit and pre-push validation
3. **Test Infrastructure** - Multi-tier testing strategy
4. **Quality Enforcement** - Coverage thresholds and bundle size limits
5. **Performance Tracking** - Automated benchmarking and regression detection

## GitHub Actions Workflows

### Primary Test Workflow

**File**: `.github/workflows/vscode-test.yml`

**Triggers**:

-   Push to `main` or `dev` branches
-   Pull requests targeting `main` or `dev`
-   Changes to extension code, core packages, or workflow file

**Jobs**:

#### 1. Test Suite (Matrix)

Runs on: Ubuntu, Windows, macOS with Node.js 20.x

**Steps**:

1. Checkout code with full history
2. Setup PNPM (v10.14.0) and Node.js with caching
3. Install dependencies with frozen lockfile
4. Build dependencies (@snapback/core, @snapback/storage, @snapback/contracts)
5. Type checking
6. Linting
7. Unit tests
8. Integration tests (Mocha-based)
9. Storage efficiency tests (continue-on-error)
10. Performance tests (continue-on-error)
11. Coverage report generation (Ubuntu only)
12. Upload coverage to Codecov
13. Build extension
14. Bundle size check
15. Verify no source maps in production
16. Upload test results artifacts

**Coverage Integration**:

-   Uploads LCOV coverage to Codecov
-   Flags: `vscode-extension`
-   Only on Ubuntu runner
-   Does not fail CI on Codecov errors

#### 2. Bundle Analysis

Runs after test suite passes

**Steps**:

1. Setup environment
2. Install dependencies
3. Build dependencies
4. Build extension with production settings
5. Analyze bundle size
6. Comment on PR with bundle size report (PR only)

**Bundle Size Limits**:

-   Maximum: 1MB (1,048,576 bytes)
-   Current: ~723KB (70.6% of limit)
-   Remaining budget: ~301KB

#### 3. Quality Gate Summary

Runs after all jobs complete

**Purpose**:

-   Aggregates results from test and bundle-analysis jobs
-   Provides final pass/fail status
-   Fails if any dependent job failed

### Performance Tracking Workflow

**File**: `.github/workflows/vscode-performance.yml`

**Triggers**:

-   Scheduled: Daily at 2:00 AM UTC
-   Manual: workflow_dispatch
-   Push to main (for immediate tracking)
-   Changes to performance tests or workflow

**Jobs**:

#### 1. Performance Benchmarks

Runs on: Ubuntu latest, 30-minute timeout

**Steps**:

1. Checkout with full history
2. Setup environment with PNPM caching
3. Install and build dependencies
4. Build extension
5. Run performance test suite
6. Extract performance metrics with timestamp and git SHA
7. Download baseline metrics from cache
8. Compare current results against baseline
9. Calculate performance regression (>20% threshold)
10. Save new baseline to cache
11. Upload results as artifacts (90-day retention)
12. Check for performance degradation
13. Comment on PR with results (if applicable)

**Baseline Tracking**:

-   Cache key: `performance-baseline-{branch}-{sha}`
-   Restore keys prioritize branch, then main, then any baseline
-   Compares metrics against previous runs
-   Flags degradation >20% as failure

#### 2. Performance Summary

Generates human-readable summary in GitHub Actions UI

## Test Infrastructure

### Test Organization

```
apps/vscode/test/
├── unit/              # Fast, isolated unit tests (Vitest)
│   ├── snapshot/    # Snapshot creation and management
│   ├── protection/    # File protection logic
│   ├── handlers/      # Command and event handlers
│   ├── views/         # UI components and views
│   └── __tests__/     # General unit tests
├── integration/       # VS Code API integration tests (Mocha)
├── performance/       # Performance benchmarks and stress tests
├── regression/        # Regression test suite (empty, placeholder)
├── monitoring/        # Monitoring and observability tests (empty, placeholder)
├── e2e/              # End-to-end tests
└── helpers/          # Test utilities and mocks
```

### Test Scripts

| Script             | Command                                                   | Purpose                                     |
| ------------------ | --------------------------------------------------------- | ------------------------------------------- |
| `test`             | `vitest run`                                              | Run all Vitest tests                        |
| `test:unit`        | `vitest run test/unit`                                    | Unit tests only                             |
| `test:integration` | `vscode-test`                                             | Integration tests (Mocha)                   |
| `test:storage`     | `vitest run test/unit/snapshot/storageEfficiency.test.ts` | Storage efficiency tests                    |
| `test:performance` | `vitest run test/performance`                             | Performance benchmarks                      |
| `test:regression`  | `vitest run test/regression`                              | Regression tests                            |
| `test:monitoring`  | `vitest run test/monitoring`                              | Monitoring tests                            |
| `test:watch`       | `vitest watch`                                            | Watch mode for development                  |
| `test:coverage`    | `vitest run --coverage`                                   | Generate coverage report                    |
| `test:ci`          | Combined CI test suite                                    | Unit + storage + performance + bundle check |
| `precommit`        | Pre-commit validation                                     | Type check + lint + unit tests              |
| `prepush`          | Pre-push validation                                       | CI suite + coverage                         |

### Vitest Configuration

**File**: `apps/vscode/vitest.config.mts`

**Settings**:

-   **Environment**: Node.js
-   **Globals**: Enabled for convenience
-   **Test Timeout**: 30 seconds (for performance tests)
-   **Setup Files**: `test/unit/setup.ts` (VS Code API mocks)

**Test Patterns**:

```typescript
include: [
	"test/unit/**/*.test.ts",
	"test/unit/**/*.unit.test.ts",
	"test/performance/**/*.test.ts",
	"test/regression/**/*.test.ts",
	"test/monitoring/**/*.test.ts",
];

exclude: [
	"node_modules",
	"out",
	"dist",
	"test/integration/**/*", // Mocha-based
	"test/e2e/**/*", // Separate E2E runner
];
```

**Coverage Configuration**:

-   **Provider**: V8
-   **Reporters**: Text, HTML, LCOV
-   **Directory**: `./coverage`
-   **Thresholds**:
    -   Lines: 80%
    -   Functions: 80%
    -   Branches: 75%
    -   Statements: 80%

**Coverage Exclusions**:

-   Test files (`**/*.test.ts`, `**/*.spec.ts`)
-   Test directories (`**/test/**`)
-   Mocks (`**/__mocks__/**`)
-   Scripts (`**/scripts/**`)
-   Build output (`**/dist/**`, `**/out/**`)

## Quality Gates

### Bundle Size Enforcement

**Script**: `apps/vscode/scripts/check-bundle-size.js`

**Limits**:

-   Maximum bundle size: 1MB (1,048,576 bytes)
-   Warning threshold: 80% of limit (838,861 bytes)

**Features**:

-   Cross-platform (Node.js based)
-   Human-readable size formatting
-   Color-coded output
-   Optimization suggestions on failure
-   Exit code 1 on failure (fails CI)

**Output Example**:

```
Bundle Size Check
==================================================
File: extension.js
Size: 723.32 KB (0.71 MB)
Limit: 1 MB (1 MB)
Usage: 70.6%

✓ PASS - Bundle size is within limits
Remaining budget: 300.68 KB (29.4%)
==================================================
```

### Coverage Thresholds

Enforced via Vitest configuration:

-   **80% line coverage** - Ensures most code paths are tested
-   **80% function coverage** - Validates all functions are exercised
-   **75% branch coverage** - Tests conditional logic branches
-   **80% statement coverage** - Comprehensive statement execution

**Enforcement**:

-   Local: `pnpm test:coverage` fails if below threshold
-   CI: Coverage uploaded to Codecov for tracking
-   Pre-push hook validates coverage before push

### Type Safety

TypeScript strict mode with comprehensive checks:

-   `noEmit: true` - Type checking only, no compilation
-   Runs on every commit via pre-commit hook
-   Runs in CI before tests execute

### Code Quality

Biome linting and formatting:

-   Enforces consistent code style
-   Detects potential bugs and anti-patterns
-   Auto-fix available: `pnpm run lint:fix`
-   Runs in pre-commit hook

## Git Hooks

### Setup

**Installation**:

```bash
# Cross-platform (recommended)
node apps/vscode/scripts/setup-git-hooks.js

# Unix-like systems only
bash apps/vscode/scripts/setup-git-hooks.sh
```

**Location**: `.git/hooks/` in repository root

### Pre-Commit Hook

**Purpose**: Fast feedback loop for common issues

**Checks** (in order):

1. Type checking (`check-types`)
2. Linting (`lint`)
3. Unit tests (`test:unit`)
4. Bundle size check (if dist exists)

**Expected Time**: 30-60 seconds

**Bypass** (not recommended):

```bash
git commit --no-verify
```

### Pre-Push Hook

**Purpose**: Comprehensive validation before sharing code

**Checks** (in order):

1. Full test suite (`test:ci`)
2. Coverage validation (`test:coverage`)

**Expected Time**: 2-5 minutes

**Bypass** (not recommended):

```bash
git push --no-verify
```

## Performance Tracking

### Metrics Collection

Performance tests run daily and on main branch commits:

**Tracked Metrics**:

-   Extension activation time
-   Checkpoint creation performance
-   File operation throughput
-   Memory usage under load
-   Concurrent operation handling
-   Large file processing speed

**Baseline Comparison**:

-   Previous run stored in GitHub Actions cache
-   Metrics compared against baseline
-   Regression flagged if >20% degradation
-   Results stored as artifacts for 90 days

### Regression Detection

**Thresholds**:

-   **Warning**: 10-20% performance degradation
-   **Failure**: >20% performance degradation

**Actions on Regression**:

1. Performance job fails
2. Alert in PR comments (if applicable)
3. Results uploaded for analysis
4. Investigation required before merge

## Cross-Platform Testing

### Matrix Strategy

Tests run on three operating systems:

-   **Ubuntu Latest**: Primary Linux testing, coverage reporting
-   **Windows Latest**: Windows-specific behavior validation
-   **macOS Latest**: macOS compatibility testing

**Why Matrix Testing?**:

-   VS Code runs on all three platforms
-   File system behavior differs (case sensitivity, paths)
-   Path separators vary (Unix: `/`, Windows: `\`)
-   Performance characteristics differ

**Fail-Fast**: Disabled

-   All OS tests run even if one fails
-   Helps identify OS-specific issues
-   Provides comprehensive failure visibility

## Artifact Management

### Test Results

**Retention**: 7 days
**Contents**:

-   Coverage reports (HTML, LCOV)
-   Test result files
-   Screenshots (if E2E tests fail)

**Naming**: `test-results-{os}-{node-version}`

### Performance Results

**Retention**: 90 days
**Contents**:

-   Performance benchmark outputs
-   Baseline comparison data
-   Metrics snapshots

**Naming**: `performance-results-{sha}`

## Troubleshooting

### CI Failures

#### Type Check Failures

```bash
# Run locally
pnpm --filter vscode run check-types

# Fix issues in source files
# Ensure all imports are typed correctly
```

#### Lint Failures

```bash
# Run locally with auto-fix
pnpm --filter vscode run lint:fix

# Manual review for issues that can't be auto-fixed
```

#### Test Failures

```bash
# Run specific test suite
pnpm --filter vscode run test:unit
pnpm --filter vscode run test:integration

# Run single test file
pnpm exec vitest run test/unit/path/to/test.ts
```

#### Bundle Size Failures

```bash
# Check current size
pnpm --filter vscode run check:bundle-size

# Optimize bundle
# - Remove unused dependencies
# - Use dynamic imports for large modules
# - Check for duplicate dependencies
```

#### Coverage Failures

```bash
# Generate coverage report
pnpm --filter vscode run test:coverage

# View HTML report
open apps/vscode/coverage/index.html

# Add tests for uncovered code
```

### Performance Test Failures

#### Environment-Dependent Results

Performance tests may be affected by:

-   CPU load on runner
-   Available memory
-   Disk I/O speed
-   Network conditions (if applicable)

**Solution**: Tests marked as `continue-on-error: true` in CI to avoid false failures

#### Baseline Regression

If performance degrades:

1. Review changes in performance test artifacts
2. Profile code to identify bottlenecks
3. Optimize hot paths
4. Update baseline if intentional change

## Best Practices

### Development Workflow

1. **Install Git hooks immediately** after cloning
2. **Run tests locally** before committing
3. **Check bundle size** after adding dependencies
4. **Review coverage** when adding new features
5. **Monitor CI results** after pushing

### Test Writing

1. **Keep unit tests fast** (< 100ms each)
2. **Mock VS Code API** using provided mocks
3. **Test edge cases** and error conditions
4. **Avoid test interdependence** - each test should be isolated
5. **Use descriptive test names** that explain the scenario

### Performance Optimization

1. **Profile before optimizing** - measure, don't guess
2. **Focus on user-facing operations** (activation, commands)
3. **Lazy load large dependencies** using dynamic imports
4. **Use caching** for expensive computations
5. **Monitor bundle size** when adding dependencies

### CI/CD Maintenance

1. **Keep workflows up to date** with latest actions versions
2. **Monitor runner performance** and adjust timeouts if needed
3. **Review failed tests immediately** - don't let them accumulate
4. **Update dependencies regularly** via Dependabot
5. **Archive old performance baselines** if no longer relevant

## Future Improvements

### Planned Enhancements

1. **Husky Integration**

    - Automated hook installation
    - Lint-staged for faster pre-commit checks
    - Easier hook management across team

2. **Visual Regression Testing**

    - Playwright for UI testing
    - Screenshot comparison
    - Accessibility testing

3. **Dependency Analysis**

    - Bundle size tracking over time
    - Unused dependency detection
    - Duplicate dependency alerts

4. **Advanced Performance Tracking**

    - Continuous benchmarking
    - Performance trend visualization
    - Automated performance budget alerts

5. **Security Scanning**
    - Dependency vulnerability scanning
    - SAST (Static Application Security Testing)
    - Secret detection

## Resources

### Documentation

-   [GitHub Actions Documentation](https://docs.github.com/en/actions)
-   [Vitest Documentation](https://vitest.dev/)
-   [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)

### Internal Documentation

-   [Git Hooks Setup Guide](./git-hooks-setup.md)
-   [Testing Strategy](./testing-strategy.md) (if exists)
-   [Performance Benchmarking](./performance-benchmarking.md) (if exists)

### Support

For CI/CD issues or questions, contact the DevOps team or open an issue in the repository.
