# CI/CD Quick Reference

Fast reference guide for common CI/CD tasks and commands.

## Quick Start

### First Time Setup

```bash
# Install Git hooks
node apps/vscode/scripts/setup-git-hooks.js

# Verify setup
pnpm --filter vscode run precommit
```

## Common Commands

### Local Testing

```bash
# Run all tests
pnpm --filter vscode run test

# Unit tests only (fast)
pnpm --filter vscode run test:unit

# Integration tests
pnpm --filter vscode run test:integration

# Performance benchmarks
pnpm --filter vscode run test:performance

# Watch mode (development)
pnpm --filter vscode run test:watch

# With coverage
pnpm --filter vscode run test:coverage
```

### Quality Checks

```bash
# Type checking
pnpm --filter vscode run check-types

# Linting
pnpm --filter vscode run lint

# Auto-fix lint issues
pnpm --filter vscode run lint:fix

# Format code
pnpm --filter vscode run format

# Bundle size check
pnpm --filter vscode run check:bundle-size

# Full quality check (pre-commit)
pnpm --filter vscode run precommit

# CI test suite
pnpm --filter vscode run test:ci
```

### Build Commands

```bash
# Development build
pnpm --filter vscode run compile

# Production build
pnpm --filter vscode run package

# Watch mode
pnpm --filter vscode run watch
```

## Git Workflow

### With Hooks (Recommended)

```bash
# Normal commit (runs pre-commit checks)
git add .
git commit -m "feat: add new feature"

# Normal push (runs pre-push checks)
git push origin feature-branch
```

### Skip Hooks (Not Recommended)

```bash
# Skip pre-commit
git commit --no-verify -m "WIP: work in progress"

# Skip pre-push
git push --no-verify origin feature-branch
```

## CI/CD Status

### Check Workflow Status

-   Visit: `https://github.com/Marcelle-Labs/SnapBack/actions`
-   Filter: `vscode-test` or `vscode-performance`

### View Latest Results

```bash
# Using GitHub CLI (if installed)
gh run list --workflow=vscode-test.yml

# View specific run
gh run view <run-id>
```

## Troubleshooting

### Test Failures

```bash
# Identify failing test
pnpm --filter vscode run test:unit

# Run specific test file
pnpm exec vitest run test/unit/path/to/failing.test.ts

# Debug mode
pnpm exec vitest run --inspect-brk test/unit/path/to/failing.test.ts
```

### Coverage Issues

```bash
# Generate report
pnpm --filter vscode run test:coverage

# View HTML report
open apps/vscode/coverage/index.html

# Check specific file coverage
# Look in coverage/index.html for uncovered lines
```

### Bundle Size Issues

```bash
# Check current size
pnpm --filter vscode run check:bundle-size

# Analyze bundle
pnpm --filter vscode run package
ls -lh apps/vscode/dist/

# Check for large dependencies
pnpm list --depth=0 --prod
```

### Type Errors

```bash
# Run type check
pnpm --filter vscode run check-types

# With watch mode
pnpm exec tsc --noEmit --watch
```

## CI/CD Workflow Files

### Main Test Workflow

-   **File**: `.github/workflows/vscode-test.yml`
-   **Triggers**: Push to main/dev, PRs
-   **Runs on**: Ubuntu, Windows, macOS

### Performance Tracking

-   **File**: `.github/workflows/vscode-performance.yml`
-   **Triggers**: Daily at 2 AM UTC, manual, push to main
-   **Runs on**: Ubuntu

## Quality Gates

### Must Pass Before Commit

-   ✓ Type checking
-   ✓ Linting
-   ✓ Unit tests
-   ✓ Bundle size (if built)

### Must Pass Before Push

-   ✓ All pre-commit checks
-   ✓ Full test suite
-   ✓ Coverage thresholds
-   ✓ Performance tests

### Must Pass Before Merge

-   ✓ All OS matrix tests
-   ✓ Integration tests
-   ✓ Bundle analysis
-   ✓ No source maps in production

## Performance Metrics

### Current Status

-   **Bundle Size**: ~723 KB (70.6% of 1 MB limit)
-   **Remaining Budget**: ~301 KB
-   **Test Suite Time**: ~2-5 minutes
-   **Pre-commit Time**: ~30-60 seconds

### Thresholds

-   **Bundle Size**: Max 1 MB
-   **Line Coverage**: Min 80%
-   **Function Coverage**: Min 80%
-   **Branch Coverage**: Min 75%
-   **Statement Coverage**: Min 80%
-   **Performance Regression**: Max 20% degradation

## Emergency Procedures

### Revert Breaking Change

```bash
# Revert last commit
git revert HEAD
git push origin <branch>

# Revert specific commit
git revert <commit-hash>
git push origin <branch>
```

### Fix Failing CI

```bash
# Pull latest main
git checkout main
git pull

# Merge main into feature branch
git checkout feature-branch
git merge main

# Or rebase
git rebase main

# Fix conflicts and push
git push origin feature-branch
```

### Skip CI Temporarily

```yaml
# Add to commit message
git commit -m "docs: update README [skip ci]"

# Or use specific workflow skip
git commit -m "chore: update config [skip actions]"
```

## Useful Links

-   [GitHub Actions Dashboard](https://github.com/Marcelle-Labs/SnapBack/actions)
-   [Codecov Dashboard](https://codecov.io/gh/Marcelle-Labs/SnapBack)
-   [Full CI/CD Documentation](./ci-cd-infrastructure.md)
-   [Git Hooks Setup Guide](./git-hooks-setup.md)

## Support

### Get Help

1. Check workflow logs in GitHub Actions
2. Review error messages in local test output
3. Consult full documentation in `apps/vscode/docs/`
4. Open issue with `ci/cd` label

### Report Issues

-   **Bug in CI**: Open issue with workflow logs
-   **Performance Regression**: Include benchmark results
-   **Coverage Gaps**: Specify which files need tests
