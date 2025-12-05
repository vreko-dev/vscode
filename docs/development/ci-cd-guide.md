<!--
Consolidated from:
- ci-cd-best-practices.md
- ci-cd-changes-summary.md
- ci-cd-implementation-guide.md
- CI-CD-IMPLEMENTATION-REPORT.md
- ci-cd-infrastructure.md
- ci-cd-quick-reference.md
Last updated: 2025-10-14
-->

# CI/CD Guide

This document describes the complete CI/CD infrastructure for the SnapBack VS Code extension.

## Overview

The SnapBack extension uses a comprehensive CI/CD pipeline to ensure code quality, prevent regressions, and maintain performance standards.

### Key Components

1. **GitHub Actions Workflows** - Automated testing and quality gates
2. **Local Git Hooks** - Pre-commit and pre-push validation
3. **Test Infrastructure** - Multi-tier testing strategy
4. **Quality Enforcement** - Coverage thresholds and bundle size limits
5. **Performance Tracking** - Automated benchmarking and regression detection

## Quick Reference

### Essential Commands

```bash
# Run all tests
npm run test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Run performance tests
npm run test:performance

# Watch mode for development
npm run test:watch
```

### Quality Gates

-   **Code Coverage**: 80% lines, 80% functions, 75% branches
-   **Bundle Size**: Maximum 1MB (currently ~723KB)
-   **Performance**: No degradation >20%
-   **Type Checking**: Zero TypeScript errors
-   **Linting**: Zero linting errors

## GitHub Actions Workflows

### Primary Test Workflow

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

#### 2. Bundle Analysis

Runs after test suite passes

**Bundle Size Limits**:

-   Maximum: 1MB (1,048,576 bytes)
-   Current: ~723KB (70.6% of limit)
-   Remaining budget: ~301KB

#### 3. Quality Gate Summary

Runs after all jobs complete to provide final pass/fail status.

## Infrastructure

### Test Organization

```
apps/vscode/test/
├── unit/              # Fast, isolated unit tests (Vitest)
│   ├── checkpoint/    # Checkpoint creation and management
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

| Script             | Command                                                     | Purpose                                     |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------- |
| `test`             | `vitest run`                                                | Run all Vitest tests                        |
| `test:unit`        | `vitest run test/unit`                                      | Unit tests only                             |
| `test:integration` | `vscode-test`                                               | Integration tests (Mocha)                   |
| `test:storage`     | `vitest run test/unit/checkpoint/storageEfficiency.test.ts` | Storage efficiency tests                    |
| `test:performance` | `vitest run test/performance`                               | Performance benchmarks                      |
| `test:regression`  | `vitest run test/regression`                                | Regression tests                            |
| `test:monitoring`  | `vitest run test/monitoring`                                | Monitoring tests                            |
| `test:watch`       | `vitest watch`                                              | Watch mode for development                  |
| `test:coverage`    | `vitest run --coverage`                                     | Generate coverage report                    |
| `test:ci`          | Combined CI test suite                                      | Unit + storage + performance + bundle check |
| `precommit`        | Pre-commit validation                                       | Type check + lint + unit tests              |
| `prepush`          | Pre-push validation                                         | CI suite + coverage                         |

## Implementation Guide

### Setting Up Local Development

1. **Install Dependencies**:

    ```bash
    pnpm install
    ```

2. **Run Tests**:

    ```bash
    # Run all tests
    npm run test

    # Run tests in watch mode
    npm run test:watch
    ```

3. **Check Coverage**:
    ```bash
    npm run test:coverage
    ```

### Adding New Tests

1. **Unit Tests**: Add to `test/unit/` directory
2. **Integration Tests**: Add to `test/integration/` directory
3. **Performance Tests**: Add to `test/performance/` directory

### Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mocking**: Use mocks for external dependencies
3. **Coverage**: Aim for 80%+ code coverage
4. **Performance**: Keep unit tests under 100ms
5. **Naming**: Use descriptive test names

## Best Practices

### Code Quality

1. **Type Safety**: Use TypeScript for all code
2. **Linting**: Follow established coding standards
3. **Documentation**: Document public APIs
4. **Testing**: Write tests for all new functionality

### Performance

1. **Benchmarking**: Regular performance testing
2. **Optimization**: Profile and optimize hot paths
3. **Resource Usage**: Monitor memory and CPU usage
4. **Bundle Size**: Keep extension size under 1MB

### Security

1. **Dependencies**: Regular security audits
2. **Permissions**: Minimal required permissions
3. **Data Handling**: Secure handling of user data
4. **Code Review**: Peer review for all changes
