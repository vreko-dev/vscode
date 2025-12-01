#!/usr/bin/env node

/**
 * Cross-platform Git Hooks Setup Script
 * Sets up pre-commit and pre-push hooks for the SnapBack VS Code extension
 */

const fs = require("node:fs");
const path = require("node:path");

// ANSI color codes
const colors = {
	reset: "\x1b[0m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
};

const scriptDir = __dirname;
const vscodeRoot = path.dirname(scriptDir);
const repoRoot = path.resolve(vscodeRoot, "../..");
const hooksDir = path.join(repoRoot, ".git", "hooks");

console.log(
	`${colors.cyan}🔧 Setting up Git hooks for SnapBack VS Code extension...${colors.reset}`,
);
console.log(`Repository root: ${repoRoot}`);
console.log(`Hooks directory: ${hooksDir}`);

// Check if .git directory exists
if (!fs.existsSync(path.join(repoRoot, ".git"))) {
	console.error(
		`${colors.red}❌ Error: .git directory not found${colors.reset}`,
	);
	console.error("This script must be run from within a Git repository");
	process.exit(1);
}

// Create hooks directory if it doesn't exist
if (!fs.existsSync(hooksDir)) {
	fs.mkdirSync(hooksDir, { recursive: true });
}

// Pre-commit hook content
const preCommitHook = `#!/bin/sh

# Pre-commit hook for SnapBack VS Code extension
# Runs quality checks before allowing commit

set -e

echo "🔍 Running pre-commit checks..."

cd "$(git rev-parse --show-toplevel)"

# Run type checking
echo "  ⚙️  Type checking..."
pnpm --filter vscode run check-types || {
    echo "❌ Type check failed"
    exit 1
}

# Run linter
echo "  🔍 Linting..."
pnpm --filter vscode run lint || {
    echo "❌ Lint check failed"
    echo "💡 Run 'pnpm --filter vscode run lint:fix' to auto-fix issues"
    exit 1
}

# Run unit tests
echo "  🧪 Running unit tests..."
pnpm --filter vscode run test:unit || {
    echo "❌ Unit tests failed"
    exit 1
}

# Check bundle size (if dist exists)
if [ -f "apps/vscode/dist/extension.js" ]; then
    echo "  📦 Checking bundle size..."
    pnpm --filter vscode run check:bundle-size || {
        echo "❌ Bundle size check failed"
        exit 1
    }
fi

echo "✅ Pre-commit checks passed"
`;

// Pre-push hook content
const prePushHook = `#!/bin/sh

# Pre-push hook for SnapBack VS Code extension
# Runs comprehensive tests before allowing push

set -e

echo "🚀 Running pre-push checks..."

cd "$(git rev-parse --show-toplevel)"

# Run full test suite
echo "  🧪 Running test suite..."
pnpm --filter vscode run test:ci || {
    echo "❌ Test suite failed"
    exit 1
}

# Run coverage check
echo "  📊 Checking test coverage..."
pnpm --filter vscode run test:coverage || {
    echo "❌ Coverage check failed"
    exit 1
}

echo "✅ Pre-push checks passed"
`;

// Write pre-commit hook
const preCommitPath = path.join(hooksDir, "pre-commit");
console.log(`${colors.cyan}📝 Creating pre-commit hook...${colors.reset}`);
fs.writeFileSync(preCommitPath, preCommitHook, { mode: 0o755 });

// Write pre-push hook
const prePushPath = path.join(hooksDir, "pre-push");
console.log(`${colors.cyan}📝 Creating pre-push hook...${colors.reset}`);
fs.writeFileSync(prePushPath, prePushHook, { mode: 0o755 });

// Make hooks executable on Unix-like systems
if (process.platform !== "win32") {
	try {
		fs.chmodSync(preCommitPath, 0o755);
		fs.chmodSync(prePushPath, 0o755);
	} catch (_error) {
		console.warn(
			`${colors.yellow}⚠️  Warning: Could not set execute permissions${colors.reset}`,
		);
	}
}

console.log(
	`${colors.green}✅ Git hooks installed successfully!${colors.reset}`,
);
console.log("");
console.log("Installed hooks:");
console.log("  • pre-commit: Type checking, linting, unit tests");
console.log("  • pre-push: Full test suite, coverage checks");
console.log("");
console.log("To skip hooks (not recommended), use:");
console.log("  git commit --no-verify");
console.log("  git push --no-verify");
console.log("");
console.log(`${colors.green}🎉 Setup complete!${colors.reset}`);
