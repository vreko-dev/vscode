# Git Hooks Setup Guide

This guide explains how to set up Git hooks for the SnapBack VS Code extension to ensure code quality before commits and pushes.

## Overview

The SnapBack extension uses Git hooks to enforce quality gates:

-   **Pre-commit**: Runs fast checks before allowing commits (type checking, linting, unit tests)
-   **Pre-push**: Runs comprehensive checks before allowing pushes (full test suite, coverage)

## Installation

### Quick Setup (Recommended)

Run the setup script from the repository root:

```bash
# Using Node.js (cross-platform)
node apps/vscode/scripts/setup-git-hooks.js

# Or using bash (Unix-like systems only)
bash apps/vscode/scripts/setup-git-hooks.sh
```

### Manual Setup

If you prefer to set up hooks manually:

1. Navigate to `.git/hooks/` in the repository root
2. Create `pre-commit` and `pre-push` files
3. Copy the hook content from `apps/vscode/scripts/setup-git-hooks.js`
4. Make them executable: `chmod +x .git/hooks/pre-commit .git/hooks/pre-push`

## What Gets Checked

### Pre-Commit Hook

Runs before each commit to catch issues early:

1. **Type Checking** (`pnpm --filter vscode run check-types`)

    - Validates TypeScript types
    - Ensures no type errors

2. **Linting** (`pnpm --filter vscode run lint`)

    - Checks code style with Biome
    - Enforces code quality rules

3. **Unit Tests** (`pnpm --filter vscode run test:unit`)

    - Runs fast unit tests
    - Validates core functionality

4. **Bundle Size Check** (`pnpm --filter vscode run check:bundle-size`)
    - Ensures bundle doesn't exceed 1MB
    - Only runs if dist/extension.js exists

**Estimated time**: 30-60 seconds

### Pre-Push Hook

Runs before each push for comprehensive validation:

1. **Full Test Suite** (`pnpm --filter vscode run test:ci`)

    - Unit tests
    - Storage efficiency tests
    - Performance tests
    - Bundle size check

2. **Coverage Check** (`pnpm --filter vscode run test:coverage`)
    - Generates coverage report
    - Enforces coverage thresholds (80% lines, 80% functions, 75% branches)

**Estimated time**: 2-5 minutes

## Skipping Hooks

**Not recommended**, but you can skip hooks when necessary:

```bash
# Skip pre-commit hook
git commit --no-verify

# Skip pre-push hook
git push --no-verify
```

⚠️ **Warning**: Skipping hooks may allow code quality issues to reach the repository. Use sparingly and only when you understand the implications.

## Troubleshooting

### Hook Not Running

1. Verify hook files exist in `.git/hooks/`
2. Check that hooks are executable: `ls -l .git/hooks/pre-*`
3. Re-run the setup script

### Hook Failing

If a hook fails:

1. **Review the error message** - it will indicate which check failed
2. **Fix the issue locally** before committing/pushing
3. **Run the failed check manually** to verify the fix:
    ```bash
    pnpm --filter vscode run check-types  # For type errors
    pnpm --filter vscode run lint:fix     # For lint errors
    pnpm --filter vscode run test:unit    # For test failures
    ```

### Performance Issues

If hooks are too slow:

-   Pre-commit hook can be skipped occasionally with `--no-verify` for WIP commits
-   CI will still run all checks, so issues will be caught before merge
-   Consider optimizing test suite or running subset of tests locally

## CI/CD Integration

The same checks run in CI/CD pipelines:

-   **GitHub Actions**: `.github/workflows/vscode-test.yml`
-   **Matrix Testing**: Tests run on Ubuntu, Windows, and macOS
-   **Quality Gates**: PRs must pass all checks before merging

Local hooks help catch issues before CI runs, saving time and reducing build failures.

## Best Practices

1. **Install hooks immediately** after cloning the repository
2. **Don't skip hooks** unless absolutely necessary
3. **Fix issues locally** before committing rather than skipping hooks
4. **Keep your local build up to date** to avoid stale dist files
5. **Run `pnpm install`** if hooks fail with missing dependencies

## Updating Hooks

If hooks are updated:

1. Pull the latest changes
2. Re-run the setup script: `node apps/vscode/scripts/setup-git-hooks.js`
3. The script will overwrite existing hooks with the latest version

## Alternative: Husky (Future)

The project may migrate to [Husky](https://typicode.github.io/husky/) for hook management in the future. Husky provides:

-   Automated hook installation via package.json
-   Better cross-platform support
-   Easier hook updates
-   Integration with lint-staged for faster pre-commit checks

This would be a team decision requiring updates to the root package.json.
