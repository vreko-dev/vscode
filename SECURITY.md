# Security Policy - SnapBack VS Code Extension

**"Code Breaks. SnapBack."**

The security of SnapBack is a top priority. This document outlines our security practices, how to report vulnerabilities, and the measures we take to protect your code.

---

## Security Overview

SnapBack VS Code extension includes:
- **Automated Dependency Scanning**: Weekly vulnerability checks via GitHub Dependabot
- **Pre-commit Security Checks**: Prevent secrets from being committed
- **License Compliance**: Verify all dependencies use compatible, permissive licenses
- **Risk Assessment**: Custom checks for high-risk package patterns
- **Encrypted Storage**: Optional AES-256 encryption for snapshot data
- **Privacy by Design**: No file content sent to remote servers - only hashes

---

## Supported Versions

Only the latest version of SnapBack is supported with security updates.

| Version | Supported | Notes |
|---------|-----------|-------|
| 1.2.x   | ✅ Yes   | Latest release - receives all security patches |
| 1.1.x   | ⚠️ Limited | Only critical CVEs after 2024-12-01 |
| < 1.1   | ❌ No    | Upgrade recommended |

**Security Fix Timeline**: Critical vulnerabilities are patched within 24 hours.

---

## Dependency Security

### Automated Scanning

We use multiple tools to ensure dependency security:

1. **GitHub Dependabot**
   - Checks for known vulnerabilities daily
   - Creates pull requests for security updates
   - Configured for weekly reviews on Monday
   - Grouped by severity and component

2. **pnpm audit**
   - Runs on all commits via pre-commit hooks
   - Fails on moderate/high severity issues
   - Configurable thresholds: `pnpm audit --audit-level=moderate`

3. **Custom Security Script** (`scripts/check-dependencies.js`)
   - Detects high-risk packages (eval, exec, supply chain risks)
   - Verifies license compatibility
   - Checks for deprecated packages
   - Validates workspace package isolation

### High-Risk Package Categories

The extension actively monitors for:

- **Code Execution Packages**: Packages that spawn child processes or evaluate code
- **Supply Chain Risk**: Known compromised packages (event-stream, flatmap-stream, etc.)
- **Filesystem Access**: Direct filesystem operations without validation
- **Cryptographic Libraries**: Ensure only battle-tested crypto (tweetnacl, libsodium)

### Critical Dependencies

These dependencies are essential for SnapBack's functionality:

| Package | Purpose | Security Considerations |
|---------|---------|------------------------|
| `better-sqlite3` | Local snapshot storage | Compiled native module - requires Node version compatibility |
| `hasha` | Snapshot deduplication | Pure JS implementation of SHA-256 |
| `tweetnacl` | Optional encryption | Audited cryptographic library |
| `conf` | Configuration management | No network calls - local-only |
| `chokidar` | File monitoring | Well-maintained, widely used |
| `@snapback/core` | Detection engine | Internal package, same security standards |

---

## Reporting Security Issues

**⚠️ IMPORTANT**: Do **NOT** open public GitHub issues for security vulnerabilities.

### Responsible Disclosure

To report a security vulnerability:

1. **Email**: security@snapback.dev with subject `[SECURITY] SnapBack VS Code Extension`
2. **Include**:
   - Description of the vulnerability
   - Affected versions
   - Steps to reproduce (if possible)
   - Potential impact
   - Any fixes you've identified

3. **Response Timeline**:
   - Initial acknowledgment: Within 24 hours
   - Status update: Within 1 week
   - Fix released: Within 2-4 weeks (depending on severity)

### Severity Levels

- **CRITICAL** (0-day): Immediate patch (24-48 hours)
- **HIGH**: Security release within 1 week
- **MEDIUM**: Included in next regular release
- **LOW**: Documented, may be included in future releases

### Recognition

We appreciate security researchers and will:
- Credit you in the security advisory (if desired)
- Add you to our security acknowledgments
- Feature your research in our blog (with permission)

---

## Security Hardening

### Pre-Commit Hooks

Every commit is scanned for:

```bash
# Run security checks before committing
pnpm run security:all
```

This includes:
- Secret detection (API keys, AWS credentials, GitHub tokens)
- Dependency audit (known CVEs)
- License validation
- Deprecated package detection

### Local Security

SnapBack stores snapshots locally with:

- **Deduplication**: Reduces storage bloat and attack surface
- **Optional Encryption**: AES-256 encryption available via configuration
- **Atomic Writes**: Prevents corruption from interrupted saves
- **WAL Mode**: SQLite WAL for concurrent access safety

Enable encryption in `.vscode/settings.json`:
```json
{
  "snapback.snapshot.encryption.enabled": true,
  "snapback.snapshot.encryption.algorithm": "aes-256-gcm"
}
```

### Network Security

SnapBack respects your privacy:

- **No File Content Sharing**: Only hashes sent for deduplication
- **Offline Mode**: Optional - disable all network calls
- **Telemetry Opt-out**: `snapback.telemetry.enabled: false`
- **Local Storage Only**: Default behavior - all data stored locally

Enable offline mode to prevent network access:
```json
{
  "snapback.offlineMode.enabled": true
}
```

---

## Security Testing

### Test Coverage

- **Unit Tests**: >90% coverage for security-sensitive code
- **Integration Tests**: Verify snapshot isolation and access control
- **E2E Tests**: User workflows with untrusted file scenarios

Run security-focused tests:
```bash
# All security tests
pnpm test test/security/**/*.spec.ts

# Encryption tests
pnpm test test/unit/snapshot/encryption.test.ts

# Storage isolation tests
pnpm test test/integration/storage.integration.test.ts
```

### CI/CD Security Gates

Our automated pipeline includes:

1. **Pre-commit**: Lint, type-check, secret detection
2. **Pre-push**: Full test suite + security audit
3. **CI**: GitHub Actions with code scanning (CodeQL)
4. **Dependabot**: Automated vulnerability PRs

---

## Security Best Practices for Users

### Protecting Your Code

1. **Use Block Level for Critical Files**
   ```json
   {
     "protectionRules": [
       { "pattern": ".env*", "level": "block" },
       { "pattern": "package.json", "level": "warn" },
       { "pattern": "**/*.key", "level": "block" }
     ]
   }
   ```

2. **Enable Offline Mode** if working offline:
   ```json
   { "snapback.offlineMode.enabled": true }
   ```

3. **Regular Backups** of critical snapshots:
   ```bash
   # Export snapshots
   pnpm run export-snapshots
   ```

4. **Review Snapshots Regularly**
   - Delete old snapshots: `pnpm run delete-old-snapshots`
   - Verify snapshot integrity: `pnpm run verify-snapshots`

### Configuration Security

Use `.snapbackrc` to enforce team-wide policies:

```json
{
  "version": "1.0",
  "protectionRules": [
    {
      "pattern": "package-lock.json",
      "level": "block",
      "reason": "Lockfile changes must be intentional"
    },
    {
      "pattern": "src/**/*.env.ts",
      "level": "block",
      "reason": "Environment configuration files"
    },
    {
      "pattern": "**/*.key",
      "level": "block"
    }
  ]
}
```

Commit `.snapbackrc` to version control for team-wide security:
```bash
git add .snapbackrc
git commit -m "docs: establish team protection policies"
```

---

## Dependency Update Policy

### Automatic Updates

- **Security Patches** (e.g., 1.0.0 → 1.0.1): Applied automatically via Dependabot
- **Minor Updates** (e.g., 1.0.0 → 1.1.0): Manual review, applied if no breaking changes
- **Major Updates** (e.g., 1.0.0 → 2.0.0): Manual review, tested extensively

### Update Frequency

- **Security-sensitive packages**: Weekly reviews
- **Production dependencies**: Bi-weekly reviews
- **Development dependencies**: Monthly reviews

### Testing Updates

Before merging a dependency update:

```bash
# Verify tests still pass
pnpm test

# Check bundle size impact
pnpm run check:bundle-size

# Run security checks
pnpm run security:all

# Manual smoke test
pnpm run dev
```

---

## License Compliance

All dependencies must use permissive, business-friendly licenses:

**Approved Licenses**:
- MIT
- Apache 2.0
- BSD (2-Clause, 3-Clause)
- ISC
- Unlicense

**Not Approved**:
- GPL/AGPL (copyleft - incompatible with proprietary extensions)
- SSPL (Ethical source - restricts usage)
- Custom/Unknown

View dependency licenses:
```bash
pnpm run security:licenses
```

---

## Security Incident Response

### If a Vulnerability is Discovered

1. **Immediate Actions** (within 24 hours)
   - Acknowledge the report
   - Assess severity and impact
   - Create private security branch

2. **Development** (within 1 week)
   - Create fix with tests
   - Review for completeness
   - Check for similar issues

3. **Release** (within 2-4 weeks)
   - Tag security release
   - Publish security advisory
   - Notify users
   - Update documentation

4. **Post-Incident**
   - Root cause analysis
   - Implement preventive measures
   - Document lessons learned

---

## Security Resources

### Internal Documentation

- [Core Detection Engine](../../packages/core/CLAUDE.md#detection-engine-guardian)
- [SDK Privacy](../../packages/sdk/CLAUDE.md#privacy)
- [Event Bus Security](../../packages/events/CLAUDE.md#security)

### External Resources

- [Node.js Security](https://nodejs.org/en/docs/guides/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [npm Security](https://docs.npmjs.com/packages-and-modules/npm-security)

### Running Security Checks

```bash
# Run all security checks
pnpm run security:all

# Audit dependencies
pnpm run security:audit

# Check dependency health
pnpm run security:check-deps

# View licenses
pnpm run security:licenses

# Fix vulnerabilities
pnpm run security:audit:fix
```

---

## FAQ

### Q: Does SnapBack send my code to remote servers?

**A**: No. SnapBack only stores snapshots locally. Network calls are optional and can be disabled via `snapback.offlineMode.enabled: true`.

### Q: Is my data encrypted?

**A**: Snapshots are stored in SQLite locally. You can enable optional AES-256 encryption via `snapback.snapshot.encryption.enabled: true`.

### Q: How are dependencies kept secure?

**A**: We use automated dependency scanning, pre-commit hooks, and manual reviews. All updates are tested before release.

### Q: What should I do if I find a security issue?

**A**: Email security@snapback.dev with details. Do NOT open a public GitHub issue.

### Q: Are there known vulnerabilities?

**A**: Check [GitHub Security Advisories](https://github.com/advisories) for SnapBack advisories. Critical issues are patched within 24 hours.

---

## Contact

For security questions or concerns:
- **Email**: security@snapback.dev
- **Security Team**: [@snapback-security](https://github.com/orgs/snapback/teams/security)
- **Issue Reporting**: https://github.com/Marcelle-Labs/SnapBack/security/advisories

---

## Changelog

### Security Updates

- **v1.2.5** (Current)
  - Added automated dependency scanning
  - Implemented pre-commit security hooks
  - Created security dependency checker
  - Enhanced license validation

- **v1.2.0**
  - Added optional AES-256 encryption
  - Implemented offline mode
  - Created `.snapbackrc` for team policies

---

**Last Updated**: 2024-11-08
**Next Review**: 2024-12-08
