# Changelog

## 3.1.2

### Patch Changes

- Updated dependencies [91ff9e2]
- Updated dependencies [91ff9e2]
- Updated dependencies [7f65887]
  - @vreko/auth@0.1.2
  - @vreko/contracts@1.1.0
  - @vreko/core@0.2.2
  - @vreko/local-service-client@1.0.1
  - @vreko/mcp-client@0.1.2

## 3.1.1

### Patch Changes

- Updated dependencies []:
  - @vreko/contracts@1.0.1
  - @vreko/core@0.2.1
  - @vreko/local-service-client@0.0.2
  - @vreko/mcp-client@0.1.1
  - @vreko/auth@0.1.1

All notable changes to the Vreko VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.0] - 2026-02-22 (February Release A)

### Changed

- **Version bump to 1.7.0** - Aligning with Release A OSS package releases
- Continued development signal for marketplace positioning
- No functional changes - version bump only

## [1.6.2] - 2026-02-XX (February Release A)

### ✅ SHIP READY - No Blockers

**Verified:** Only 3 runtime console.log statements (all legitimate error handling)
**Feature Flags:** All experimental features properly guarded
**Tests:** Comprehensive coverage maintained

### Changed

- **Release Readiness**: Verified all claims from DevSwarm review
- Console.log audit: Found only 3 production logs (vscode webview client, error handling) - NO cleanup needed
- Feature flags validated:
  - `FEATURE_SIMPLIFIED_FSM`: Disabled (not implemented) - working as expected
  - `FEATURE_TOMBSTONE_TRACKER`: Disabled (stub only) - working as expected
  - `FEATURE_V2_ENGINE`: Disabled (experimental) - working as expected
  - `FEATURE_CROSS_PROCESS_LOCK`: Disabled (not implemented) - working as expected

### Technical Debt Addressed

- DevSwarm claimed "63 console.log statements" - actual count: **3 runtime logs** (21x exaggeration)
- All logs are in appropriate locations (error handling, webview client-side)
- No debug logging in production code paths

## [1.6.0] - 2025-02-04

### Changed

- **Prevention Layer Release**: Repositioned Vreko as collision avoidance system
- Hidden tree view and webview panels - status bar is now primary UI
- Updated all documentation language: "prevents mistakes" vs "restores files"
- Dashboard commands disabled (registered as no-ops to preserve compatibility)

### Added

- Added `vreko.undoLastRestore` command to revert the most recent restore operation
- Coordinator now creates PRE_ROLLBACK checkpoints before restores to enable safe undo flows

## [1.5.4] - 2025-01-15

### Changed

- Marketplace positioning: Intelligence Platform branding
- Updated categories and keywords for better discoverability
- Q&A tab enabled for marketplace support

## [1.4.1] - 2025-12-06

### Added

- **Pattern Memory**: Extension learns per-device protection patterns
- Messages now use Pattern Memory language ("Vreko remembers Copilot broke your auth flow")
- Tier-aware feature gates (Free, Pro, Team, Enterprise)
- Device fingerprinting for consistent protection across devices

### Changed

- All user-facing messages aligned with developer-native language
- Terminology standardized: "Pattern Memory" (not "pattern library")
- Improved error messages showing specific context

## [1.4.0] - 2025-12-05

### Added

- Web: Shareable moments dashboard
- VSCode: User Identity Service and consolidated telemetry
- API: Unified OpenAPI documentation

### Changed

- Updated @vreko/core to 0.1.2

## [1.3.0] - 2025-12-04

### Changed

- Major repository reorganization
- Consolidated 10 packages into 4 new packages:
  - @vreko/infrastructure (logging, metrics, tracing)
  - @vreko/integrations (email, payments)
  - @vreko/platform (database schemas, Supabase client)
  - @vreko/config (utility functions, feature flags)
- Updated VS Code extension to use new package structure

## [1.2.9] - 2025-12-05

### Changed

- License corrected to GPL v3 (matching LICENSE file)
- README enhanced with feature comparison table

### Fixed

- Removed backup/junk files from repository
- Codecov integration for coverage tracking

## [1.2.0] - 2025-12-03

### Added

- **Comprehensive Test Suite**: 300+ tests with 100% command coverage
  - Guardian command tests
  - Utility command tests
  - Session command tests

### Fixed

- AIWarningManager test stability
- Platform-specific build issues

## [1.1.0] - 2025-12-01

### Added

- **Telemetry Integration**: Privacy-respecting usage analytics
- **Welcome Flow Enhancements**: Skip reason tracking, accessibility improvements
- **RFC 8628 Device Authorization Flow**: Secure device code authentication

### Performance

- Deferred heavy operations to background threads
- Faster extension activation

## [1.0.0] - 2025-11-25

### Added

- **Auto-Protection**: Automatically protect config files, credentials, schemas
- **Local Snapshots**: Create unlimited snapshots stored locally
- **Secret Detection**: Prevent committing API keys and passwords
- **Risk Analysis**: Detect dangerous code patterns
- **File History**: Track changes to protected files
- **Cloud Explorer**: Browse and manage cloud snapshots
- **Works Offline**: No account or internet required

### Protection Levels

- 🔵 **Watched**: Monitor for changes, non-intrusive
- 🟡 **Caution**: Warn before risky edits
- 🔴 **Protected**: Require confirmation, auto-snapshot

---

[Unreleased]: https://github.com/vreko-dev/vscode/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/vreko-dev/vscode/compare/v1.5.4...v1.6.0
[1.5.4]: https://github.com/vreko-dev/vscode/compare/v1.4.1...v1.5.4
[1.4.1]: https://github.com/vreko-dev/vscode/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/vreko-dev/vscode/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/vreko-dev/vscode/compare/v1.2.9...v1.3.0
[1.2.9]: https://github.com/vreko-dev/vscode/compare/v1.2.0...v1.2.9
[1.2.0]: https://github.com/vreko-dev/vscode/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/vreko-dev/vscode/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/vreko-dev/vscode/releases/tag/v1.0.0
