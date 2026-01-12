#!/usr/bin/env node

/**
 * VS Code Extension Release Checklist
 *
 * Interactive checklist to ensure release readiness.
 * Run: node scripts/release-checklist.js
 */

const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	bold: "\x1b[1m",
};

console.log(`
${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════════════╗
║           SnapBack VS Code Extension Release Checklist       ║
╚════════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Pre-Release Checklist:${colors.reset}

${colors.yellow}□ BUILD & VALIDATION${colors.reset}
  [ ] Run: ${colors.cyan}pnpm run compile${colors.reset} - Full build with type checking
  [ ] Run: ${colors.cyan}node scripts/pre-publish-validate.js${colors.reset} - Pre-publish validation
  [ ] Verify bundle sizes are within limits (Extension <3MB, Server <1.5MB)

${colors.yellow}□ TESTING${colors.reset}
  [ ] Manual test: Extension activates without errors
  [ ] Manual test: Core commands work (protect file, create snapshot, restore)
  [ ] Manual test: Status bar shows correct states
  [ ] Manual test: Dashboard panels load correctly
  [ ] Check Output → SnapBack for any warnings

${colors.yellow}□ OBSERVABILITY${colors.reset}
  [ ] Sentry DSN configured for production (or disabled if not using)
  [ ] Health check command works: ${colors.cyan}SnapBack: Run Health Check${colors.reset}
  [ ] No console errors in Extension Host output

${colors.yellow}□ DOCUMENTATION${colors.reset}
  [ ] CHANGELOG.md updated with release notes
  [ ] README.md reflects current features
  [ ] Version number updated in package.json

${colors.yellow}□ SECURITY${colors.reset}
  [ ] No hardcoded API keys or secrets
  [ ] Sensitive data scrubbed in error reports
  [ ] No debug flags left enabled

${colors.bold}Release Commands:${colors.reset}

1. ${colors.cyan}Build & Package:${colors.reset}
   pnpm run package-vsix

2. ${colors.cyan}Test Locally:${colors.reset}
   code --install-extension snapback-vscode-*.vsix --force

3. ${colors.cyan}Publish to Marketplace:${colors.reset}
   pnpm run deploy

${colors.bold}Post-Release:${colors.reset}

  [ ] Verify extension appears in marketplace
  [ ] Test install from marketplace
  [ ] Monitor Sentry for any new errors (first 24 hours)
  [ ] Check marketplace reviews/ratings

${colors.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

${colors.bold}Quick Commands:${colors.reset}

  ${colors.green}# Full validation pipeline${colors.reset}
  pnpm run compile && node scripts/pre-publish-validate.js

  ${colors.green}# Package and test locally${colors.reset}
  pnpm run package-vsix && code --install-extension snapback-vscode-*.vsix --force

  ${colors.green}# Deploy to marketplace${colors.reset}
  pnpm run deploy

${colors.cyan}Good luck with your release! 🚀${colors.reset}
`);

// Exit cleanly
process.exit(0);
