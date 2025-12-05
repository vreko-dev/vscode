# Contributing to SnapBack OSS

Thank you for your interest in contributing to SnapBack! This guide will help you get started.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Environment** (OS, Node version, package version)
- **Code samples** if applicable

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear title and description**
- **Use case** - why is this useful?
- **Proposed solution** - how should it work?
- **Alternatives considered**

### Pull Requests

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   # or
   git checkout -b fix/my-bugfix
   ```

3. **Make your changes**:
   - Write clear, readable code
   - Follow existing code style
   - Add/update tests
   - Update documentation

4. **Test your changes**:
   ```bash
   pnpm install
   pnpm build
   pnpm test
   pnpm typecheck
   ```

5. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve issue with X"
   git commit -m "docs: update README"
   ```

6. **Push** to your fork:
   ```bash
   git push origin feat/my-feature
   ```

7. **Open a Pull Request** with:
   - Clear title following conventional commits
   - Description of changes
   - Related issue numbers (if applicable)
   - Screenshots/videos (for UI changes)

## Development Workflow

### Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/REPO_NAME.git
cd REPO_NAME

# Install dependencies
pnpm install

# Build
pnpm build
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test path/to/test.ts

# Run with coverage
pnpm test --coverage

# Watch mode
pnpm test --watch
```

### Code Style

We use Biome for linting and formatting:

```bash
# Check code
pnpm check

# Auto-fix issues
pnpm lint:fix

# Format code
pnpm format
```

## Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(sdk): add snapshot filtering by tags
fix(contracts): resolve type inference issue
docs(readme): update installation instructions
test(sdk): add tests for error handling
```

## Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new functionality
3. **Ensure all tests pass** locally
4. **Update CHANGELOG.md** if applicable
5. **Request review** from maintainers
6. **Address feedback** promptly
7. **Squash commits** if requested

## Review Process

- PRs require at least one approval from maintainers
- CI checks must pass
- Code coverage should not decrease
- Breaking changes require special discussion

## Community

- **Discord**: [Join our server](https://discord.gg/snapback)
- **GitHub Discussions**: Ask questions, share ideas
- **Twitter**: [@snapbackdev](https://twitter.com/snapbackdev)

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.

## Questions?

- Open an issue with the `question` label
- Ask in our Discord community
- Email: opensource@snapback.dev

Thank you for contributing! 🎉
