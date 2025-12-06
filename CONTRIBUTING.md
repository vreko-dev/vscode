# Contributing to SnapBack VS Code Extension

Thank you for your interest in contributing to SnapBack! This document provides guidelines for development, security practices, and contribution workflow.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Security Guidelines](#security-guidelines)
5. [Making Changes](#making-changes)
6. [Testing](#testing)
7. [Pull Request Process](#pull-request-process)
8. [Code Review](#code-review)
9. [Performance Budgets](#performance-budgets)
10. [Troubleshooting](#troubleshooting)

---

## Code of Conduct

Be respectful, inclusive, and professional. We're building a welcoming community for developers of all backgrounds.

---

## Getting Started

### Prerequisites

- **Node.js**: >= 20.0.0
- **pnpm**: >= 9.0.0
- **VS Code**: >= 1.99.0
- **Git**: Latest stable version

### Clone the Repository

```bash
git clone https://github.com/snapback-dev/snapback.dev.git
cd snapback
pnpm install
```

### Verify Setup

```bash
# Navigate to vscode extension
cd apps/vscode

# Run tests to verify setup
pnpm test

# Build the extension
pnpm run compile
```

---

## Development Setup

### 5-Minute Quickstart

```bash
# 1. Install dependencies
pnpm install

# 2. Navigate to extension
cd apps/vscode

# 3. Start development watch mode
pnpm run watch:esbuild

# 4. In another terminal, launch VS Code with extension
# (Click F5 in VS Code or use the debugger)
```

### Project Structure

```
apps/vscode/
├── src/
│   ├── extension.ts                    # Entry point
│   ├── activation/                     # 5-phase initialization
│   ├── snapshot/                       # Core snapshot logic
│   ├── protection/                     # Protection level system
│   ├── storage/                        # SQLite storage layer
│   ├── commands/                       # Command handlers
│   ├── ui/                            # UI components
│   ├── views/                         # VS Code views
│   └── utils/                         # Utilities (AI detection, etc.)
├── test/
│   ├── unit/                          # Unit tests
│   ├── integration/                   # Integration tests
│   └── e2e/                          # End-to-end tests
├── scripts/                           # Build & utility scripts
├── SECURITY.md                        # Security policy
└── package.json
```

### Key Files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension entry point and 5-phase activation |
| `src/snapshot/SnapshotManager.ts` | Core snapshot creation/restore logic |
| `src/protection/ProtectedFileRegistry.ts` | File protection state management |
| `src/storage/SqliteStorageAdapter.ts` | Database abstraction layer |
| `test/` | Test files (mirror src structure) |
| `.vscode/launch.json` | Debug configurations |

---

## Security Guidelines

### Before You Start

**Read**: `SECURITY.md` in this directory for security policies and best practices.

### Dependency Security

1. **No new production dependencies without approval**
   ```bash
   # Before adding a dependency, discuss in an issue
   # Then submit PR with security justification
   pnpm add <package-name> --save
   pnpm run security:check-deps
   ```

2. **High-Risk Package Categories** (Automatically rejected):
   - Packages that execute arbitrary code (eval, exec, spawn)
   - Packages with known supply chain history (event-stream, flatmap-stream)
   - GPL/AGPL licensed packages

3. **Run Security Checks Before Committing**
   ```bash
   pnpm run security:all
   ```

### Secure Coding Practices

- **Never hardcode secrets**: Use environment variables or configuration files
- **Input validation**: Always validate file paths and user input
- **No eval()**: Never evaluate user input as code
- **Minimal permissions**: Request only needed VS Code permissions
- **No telemetry surprises**: Explicitly allow data collection with clear user consent

### Secrets Detection

Pre-commit hooks automatically check for secrets:

```bash
# These patterns are blocked:
# - AWS keys: AKIA[A-Z0-9]{16}
# - OpenAI: sk-[a-zA-Z0-9]{32,}
# - Stripe: pk_live_[a-zA-Z0-9]{24,}
# - GitHub tokens: ghp_[a-zA-Z0-9]{36}

# If you need to test with secrets:
git commit --no-verify  # Only as last resort for testing
```

---

## Making Changes

### Branch Naming

Follow the convention: `<type>/<description>`

```bash
feature/ai-detection-v2
fix/session-finalization-race
docs/security-guidelines
refactor/storage-adapter
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

body (optional, explain why not what)

footer (optional, references issues)
```

Examples:
```bash
git commit -m "feat(snapshot): add async deduplication for large files

This improves performance for projects with many snapshots by offloading
deduplication to a background worker, preventing UI jank.

Fixes #123"
```

Commit types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring (no behavior change)
- `perf`: Performance improvement
- `test`: Test additions/updates
- `docs`: Documentation
- `chore`: Maintenance (dependencies, tooling, etc.)
- `ci`: CI/CD changes
- `security`: Security-related changes

### Code Style

We use Biome for formatting and linting:

```bash
# Format code
pnpm run format

# Check for linting errors
pnpm run lint

# Fix linting issues
pnpm run lint:fix
```

**Key conventions**:
- TypeScript: Strict mode enabled
- Naming: camelCase for functions/variables, PascalCase for classes
- Comments: JSDoc for exported functions
- No console.log: Use logger service instead

### Type Safety

```bash
# Always run type check before committing
pnpm run check-types

# This is also checked in pre-commit hooks
```

---

## Testing

### Test Structure

```
test/
├── unit/                      # Single component tests
│   ├── snapshot/
│   ├── protection/
│   └── storage/
├── integration/               # Component interaction tests
│   ├── snapshot.integration.test.ts
│   └── session.integration.test.ts
└── e2e/                      # Full workflows
    └── full-extension.test.ts
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific suite
pnpm test src/snapshot

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:unit:watch

# Run only integration tests
pnpm test:integration

# Run performance/stress tests
pnpm test:perf
```

### Writing Tests

**Template**:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapshotManager } from '../src/snapshot/SnapshotManager';

describe('SnapshotManager', () => {
  let manager: SnapshotManager;

  beforeEach(async () => {
    manager = new SnapshotManager(/* config */);
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  it('should create a snapshot with valid file path', async () => {
    const snapshot = await manager.create('/path/to/file.ts');
    expect(snapshot).toBeDefined();
    expect(snapshot.id).toMatch(/^snap_/);
  });

  it('should reject invalid file paths', async () => {
    await expect(manager.create('../../../etc/passwd')).rejects.toThrow();
  });
});
```

**Coverage Target**: >90% for security-sensitive code

```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html
```

### Test Checklist

- [ ] Unit tests for isolated functions
- [ ] Integration tests for multi-component flows
- [ ] Edge case coverage (null, empty, invalid input)
- [ ] Error handling (rejection paths)
- [ ] Performance tests for hot paths (<200ms snapshots)
- [ ] Security tests (path traversal, injection, etc.)

---

## Pull Request Process

### Before Opening a PR

1. **Update your branch**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run all checks**
   ```bash
   pnpm run security:all      # Security checks
   pnpm test                  # All tests
   pnpm run check-types       # Type check
   pnpm run lint              # Linting
   pnpm run format            # Code style
   pnpm run check:bundle-size # Bundle impact
   ```

3. **Verify locally**
   ```bash
   # Test in VS Code (F5 to debug)
   pnpm run dev
   ```

### Opening a PR

**Title Format**: `[TYPE] Short description`

```
[FEATURE] Add AI-aware session tagging
[FIX] Fix race condition in session finalization
[PERF] Optimize snapshot deduplication for large files
```

**Description Template**:

```markdown
## Summary
Brief description of changes and their purpose.

## Type
- [ ] Feature
- [ ] Bug fix
- [ ] Performance improvement
- [ ] Documentation
- [ ] Refactoring
- [ ] Security

## Changes
- Change 1
- Change 2

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Tested in VS Code locally
- [ ] Performance impact checked

## Performance Impact
- Snapshot creation: <200ms
- Session finalization: <50ms avg
- Bundle size: +/-X KB

## Security Checklist
- [ ] No new production dependencies
- [ ] No hardcoded secrets
- [ ] Input validation added
- [ ] Security tests included
- [ ] `pnpm run security:all` passes

## Related Issues
Fixes #123
Related to #456

## Checklist
- [ ] Code follows style guidelines
- [ ] Comments added for complex logic
- [ ] Tests pass locally
- [ ] Type checks pass
- [ ] No console.log() calls
- [ ] Documentation updated
```

### Auto-Checks

GitHub Actions automatically runs:
- ✅ Type checking (TypeScript compiler)
- ✅ Linting (Biome)
- ✅ Tests (Vitest)
- ✅ Security audit (pnpm audit)
- ✅ Bundle size check
- ✅ Code scanning (CodeQL)
- ✅ Performance tests

**PR will not merge if any check fails.**

---

## Code Review

### Expectations

- **Constructive**: Reviews focus on code quality, not judgment
- **Timely**: Review within 24-48 hours
- **Thorough**: Check logic, tests, performance, security
- **Respectful**: Assume good intent, be specific

### Review Criteria

Reviewers check:

- **Correctness**: Logic is sound, handles edge cases
- **Security**: No vulnerabilities, proper validation
- **Performance**: Meets budgets, no regressions
- **Testing**: Adequate coverage, meaningful tests
- **Style**: Follows conventions, readable
- **Documentation**: Clear comments, updated docs

### Addressing Feedback

```bash
# Make changes based on review
git add .
git commit -m "review: address feedback from @reviewer"

# Re-run checks
pnpm test
pnpm run security:all

# Push changes
git push origin your-branch
```

---

## Performance Budgets

The VS Code extension has strict performance budgets to ensure good user experience:

### Budgets

| Operation | Budget | How We Enforce |
|-----------|--------|---|
| Snapshot creation | <200ms | `test/perf/snapshot-creation.spec.ts` |
| Session finalization | Avg <50ms, P95 <100ms | `test/perf/session-finalization.spec.ts` |
| Protection check | <10ms | Indexed lookups |
| File save handler | <50ms | Real-world tests |

### Checking Performance

```bash
# Run performance tests
pnpm test:perf

# Check bundle size
pnpm run check:bundle-size

# Monitor specific operation
pnpm run enforce-performance-budget
```

### If Budget is Exceeded

1. **Identify bottleneck**: Use profiler in DevTools
   ```bash
   pnpm run collect-load-metrics
   ```

2. **Optimize**:
   - Cache results (deduplication)
   - Use workers (async operations)
   - Lazy load modules
   - Profile with DevTools

3. **Document trade-off**:
   ```typescript
   // Performance note: This is O(n) but necessary for consistency
   // See: https://github.com/issue-number for optimization plan
   ```

---

## Troubleshooting

### Common Issues

#### Extension won't load
```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Verify debug launch
# In VS Code: Debug → Run and Debug (F5)
```

#### Tests fail locally but pass in CI
```bash
# Clear cache
pnpm test --clearCache

# Run with exact CI conditions
pnpm test:ci
```

#### Type errors after pulling
```bash
# Reinstall and rebuild
pnpm install
pnpm run check-types
pnpm run compile
```

#### Bundle size increased unexpectedly
```bash
# Analyze bundle
pnpm run check:bundle-size

# Check for duplicate dependencies
pnpm ls <package-name>

# Remove unused imports
pnpm run lint:fix
```

#### Security check fails
```bash
# See detailed report
pnpm run security:check-deps

# Fix auditable issues
pnpm run security:audit:fix

# Verify licenses
pnpm run security:licenses
```

### Getting Help

1. **Documentation**: Check SECURITY.md, README.md
2. **GitHub Issues**: Search existing issues
3. **Discussions**: GitHub Discussions tab
4. **Email**: security@snapback.dev for security concerns

---

## Release Process

Only maintainers publish releases, but here's the process:

```bash
# Update version
npm version patch|minor|major

# Build and test
pnpm run compile
pnpm test

# Publish
pnpm run deploy
```

---

## Additional Resources

- [SnapBack Architecture](./CLAUDE.md)
- [Security Policy](./SECURITY.md)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Vitest Documentation](https://vitest.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## License

By contributing, you agree that your contributions will be licensed under the same license as SnapBack.

---

**Thank you for contributing to SnapBack!** Your efforts help make code safer for everyone.
