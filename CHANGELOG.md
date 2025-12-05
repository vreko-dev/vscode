# Changelog

All notable changes to the SnapBack VS Code Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.9] - 2025-12-05

### 📝 Changed
- License corrected to GPL v3 (matching LICENSE file)
- README enhanced with feature comparison table

### 🔧 Maintenance
- Removed backup/junk files from repository
- Updated `.gitignore` to prevent clutter regression
- Codecov integration for coverage tracking

## [1.2.0] - 2025-12-03

### 🚀 Added
- **Comprehensive Test Suite**: 300+ tests
  - Guardian command tests
  - Utility command tests
  - Session command tests
  - 100% command coverage achieved

### 🐛 Fixed
- AIWarningManager test stability
- Platform-specific build issues

## [1.1.0] - 2025-12-01

### 🚀 Added
- **Telemetry Integration**: Privacy-respecting usage analytics
- **Welcome Flow Enhancements**:
  - Skip reason tracking with semantic distinction
  - Accessibility improvements
  - Error recovery handling
- **RFC 8628 Device Authorization Flow**: Complete TDD implementation
  - Secure device code authentication
  - Comprehensive error path handling

### ⚡ Performance
- Deferred heavy operations to background threads
- Faster extension activation

## [1.0.0] - 2025-11-25

### 🎉 Initial Release

- **Auto-Protection**: Automatically protect config files, credentials, schemas
- **Local Snapshots**: Create unlimited snapshots stored locally
- **Secret Detection**: Prevent committing API keys and passwords
- **Risk Analysis**: Detect dangerous code patterns
- **File History**: Track changes to protected files
- **Cloud Explorer**: Browse and manage cloud snapshots
- **Protection Notifications**: Rate-limited alerts for file changes
- **Works Offline**: No account or internet required

### Protection Levels
- 🔵 **Watched**: Monitor for changes, non-intrusive
- 🟡 **Caution**: Warn before risky edits
- 🔴 **Protected**: Require confirmation, auto-snapshot

### Keyboard Shortcuts
- `Cmd+Shift+S` (Mac) / `Ctrl+Shift+S` (Win/Linux): Create snapshot

---

[Unreleased]: https://github.com/snapback-dev/vscode/compare/v1.2.9...HEAD
[1.2.9]: https://github.com/snapback-dev/vscode/compare/v1.2.0...v1.2.9
[1.2.0]: https://github.com/snapback-dev/vscode/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/snapback-dev/vscode/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/snapback-dev/vscode/releases/tag/v1.0.0
